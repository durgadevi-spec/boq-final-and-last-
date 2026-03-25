import React, { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, Send, Search, Package, ChevronRight, Store, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import { useLocation } from "wouter";
import { useData } from "@/lib/store";
import { Badge } from "@/components/ui/badge";

interface Material {
    id: string;
    name: string;
    categoryId?: string;
    subcategoryId?: string;
    unit?: string;
    shop_id?: string;
    rate?: number | string;
}

interface Shop {
    id: string;
    name: string;
    location?: string;
    gstNo?: string;
}

interface RequestItem {
    material_id: string;
    item: string;
    category: string;
    subcategory: string;
    unit: string;
    qty: number | "";
    rate: number | "";
    remarks: string;
    shop_id: string;
}

export default function RaisePORequest() {
    const { user } = useData();
    const { toast } = useToast();
    const [, setLocation] = useLocation();

    const [projectName, setProjectName] = useState("");
    const [department, setDepartment] = useState<string>(user?.department || "");
    const [items, setItems] = useState<RequestItem[]>([
        { material_id: "", item: "", category: "", subcategory: "", unit: "", qty: "", rate: "", remarks: "", shop_id: "" }
    ]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Material picker
    const [pickerOpenForIndex, setPickerOpenForIndex] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        setDepartment(user?.department || "");
    }, [user]);

    const { data: materialsData, isLoading: isLoadingMaterials } = useQuery({
        queryKey: ['/api/materials'],
        queryFn: async () => {
            const res = await apiFetch('/api/materials');
            if (!res.ok) throw new Error("Failed to load materials");
            return res.json();
        }
    });

    const { data: shopsData } = useQuery({
        queryKey: ['/api/shops'],
        queryFn: async () => {
            const res = await apiFetch('/api/shops');
            if (!res.ok) throw new Error("Failed to load shops");
            return res.json();
        }
    });

    const { data: projectsData } = useQuery({
        queryKey: ['/api/boq-projects'],
        queryFn: async () => {
            const res = await apiFetch('/api/boq-projects');
            if (!res.ok) throw new Error('Failed to load projects');
            return res.json();
        }
    });

    const projects = projectsData?.projects || [];
    const materials: Material[] = materialsData?.materials || [];
    const shops: Shop[] = shopsData?.shops || [];

    const getShopName = (shopId: string | undefined | null): string => {
        if (!shopId) return "No Vendor";
        return shops.find(s => s.id === shopId)?.name || shopId;
    };

    // Count distinct vendors in current items
    const vendorGroups = useMemo(() => {
        const groups: Record<string, RequestItem[]> = {};
        for (const item of items) {
            if (!item.item) continue;
            const key = item.shop_id || "no_vendor";
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        }
        return groups;
    }, [items]);

    const distinctVendorCount = Object.keys(vendorGroups).length;

    // Filtered materials for picker
    const filteredMaterials = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return materials;
        return materials.filter((m) =>
            m.name?.toLowerCase().includes(q) ||
            m.categoryId?.toLowerCase().includes(q) ||
            m.unit?.toLowerCase().includes(q) ||
            getShopName(m.shop_id).toLowerCase().includes(q)
        );
    }, [materials, searchQuery, shops]);

    // Group by vendor/category for display
    const groupedMaterials = useMemo(() => {
        const groups: Record<string, Material[]> = {};
        for (const m of filteredMaterials) {
            const key = m.shop_id ? getShopName(m.shop_id) : "No Vendor";
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        }
        return groups;
    }, [filteredMaterials, shops]);

    const handleAddItem = () => {
        setItems([...items, { material_id: "", item: "", category: "", subcategory: "", unit: "", qty: "", rate: "", remarks: "", shop_id: "" }]);
    };

    const handleRemoveItem = (index: number) => {
        if (items.length > 1) setItems(items.filter((_, i) => i !== index));
    };

    const handleItemChange = (index: number, field: keyof RequestItem, value: any) => {
        const newItems = [...items];
        (newItems[index] as any)[field] = value;
        setItems(newItems);
    };

    const handleSelectMaterial = (index: number, mat: Material) => {
        const newItems = [...items];
        newItems[index] = {
            ...newItems[index],
            material_id: mat.id,
            item: mat.name,
            category: mat.categoryId || "",
            subcategory: mat.subcategoryId || "",
            unit: mat.unit || "",
            rate: (mat.rate !== undefined && mat.rate !== null && mat.rate !== "") ? Number(mat.rate) : "",
        };
        setItems(newItems);
        setPickerOpenForIndex(null);
        setSearchQuery("");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!projectName.trim()) {
            return toast({ title: "Validation Error", description: "Please enter a project name", variant: "destructive" });
        }

        const validItems = items.filter(i => i.item && i.qty && Number(i.qty) > 0);
        if (validItems.length === 0) {
            return toast({ title: "Validation Error", description: "Please add at least one item with a valid quantity > 0", variant: "destructive" });
        }

        const matchedProject = projects.find((p: any) => (p.name || '').toLowerCase() === projectName.trim().toLowerCase());

        // Group items by vendor (shop_id)
        const byVendor: Record<string, RequestItem[]> = {};
        for (const item of validItems) {
            const key = item.shop_id || "no_vendor";
            if (!byVendor[key]) byVendor[key] = [];
            byVendor[key].push(item);
        }

        const vendorKeys = Object.keys(byVendor);

        setIsSubmitting(true);
        try {
            // Create one PO Request per vendor group
            const promises = vendorKeys.map(vendorKey =>
                apiFetch("/api/po-requests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        projectId: matchedProject?.id || `manual:${projectName.trim()}`,
                        projectName: projectName.trim(),
                        employeeId: user?.employeeCode || undefined,
                        department: department || user?.department || undefined,
                        items: byVendor[vendorKey]
                    }),
                })
            );

            const results = await Promise.all(promises);
            const failed = results.filter(r => !r.ok);

            if (failed.length > 0) {
                throw new Error(`${failed.length} request(s) failed to submit.`);
            }

            if (vendorKeys.length > 1) {
                toast({
                    title: "Requests Submitted!",
                    description: `Created ${vendorKeys.length} separate PO Requests — one per vendor.`,
                });
            } else {
                toast({ title: "Success", description: "PO Request submitted for approval." });
            }

            setLocation("/my-po-requests");
        } catch (err: any) {
            toast({ title: "Error", description: err.message || "An unexpected error occurred", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Layout>
            <div className="container mx-auto p-4 md:p-6 max-w-[1200px]">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Raise PO Request</h1>
                    <p className="text-muted-foreground mt-1">
                        Submit a Purchase Order request for approval by management.
                    </p>
                </div>

                {/* Auto-split info banner */}
                {distinctVendorCount > 1 && (
                    <div className="mb-4 flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <span className="text-blue-800">
                            You have materials from <strong>{distinctVendorCount} different vendors</strong>.
                            On submit, this will automatically be split into <strong>{distinctVendorCount} separate Annexures</strong> — one per vendor.
                        </span>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <Card className="mb-6 border-blue-100 shadow-sm">
                        <CardHeader className="bg-blue-50/50 pb-4">
                            <CardTitle className="text-blue-800 text-lg">Project & Requester Information</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="space-y-2 lg:col-span-2">
                                <Label htmlFor="project">Project Name <span className="text-red-500">*</span></Label>
                                <Input id="project" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Enter project name" />
                            </div>
                            <div className="space-y-2">
                                <Label>Requester Name</Label>
                                <Input value={user?.fullName || user?.username || ""} disabled className="bg-slate-50" />
                            </div>
                            <div className="space-y-2">
                                <Label>Department</Label>
                                <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Enter department" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Item Details</CardTitle>
                                <CardDescription>
                                    Mix materials from any vendor — they'll be auto-split into separate Annexures on submit.
                                </CardDescription>
                            </div>
                            <Button type="button" onClick={handleAddItem} variant="outline" size="sm" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200">
                                <Plus className="h-4 w-4 mr-2" /> Add Item
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse border border-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="border p-2 text-left font-semibold text-sm w-[280px]">Item Name <span className="text-red-500">*</span></th>
                                            <th className="border p-2 text-left font-semibold text-sm">Category</th>
                                            <th className="border p-2 text-left font-semibold text-sm w-[70px]">Unit</th>
                                            <th className="border p-2 text-left font-semibold text-sm w-[120px]">Qty <span className="text-red-500">*</span></th>
                                            <th className="border p-2 text-left font-semibold text-sm w-[120px]">Rate (₹)</th>
                                            <th className="border p-2 text-left font-semibold text-sm">Remarks</th>
                                            <th className="border p-2 text-center font-semibold text-sm w-[60px]">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, index) => (
                                            <tr key={index} className="group hover:bg-slate-50/50">
                                                <td className="border p-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setPickerOpenForIndex(index); setSearchQuery(""); }}
                                                        className={`w-full text-left px-3 py-2 rounded-md border text-sm flex items-center justify-between gap-2 transition-colors ${
                                                            item.item
                                                                ? "bg-white border-slate-200 text-slate-800 hover:border-blue-300"
                                                                : "bg-slate-50 border-slate-200 text-slate-400 hover:border-blue-300 hover:bg-blue-50"
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-2 truncate">
                                                            <Package className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                            <span className="truncate">{item.item || "Select Material"}</span>
                                                        </span>
                                                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                                    </button>
                                                    {item.shop_id && (
                                                        <div className="mt-1 flex items-center gap-1">
                                                            <Store className="h-3 w-3 text-slate-400" />
                                                            <span className="text-[10px] text-slate-500">{getShopName(item.shop_id)}</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="border p-2">
                                                    <Input value={item.category} disabled className="bg-slate-50 text-xs" placeholder="Auto" />
                                                </td>
                                                <td className="border p-2">
                                                    <Input value={item.unit} disabled className="bg-slate-50 text-xs" placeholder="Auto" />
                                                </td>
                                                <td className="border p-2">
                                                    <Input
                                                        type="number"
                                                        min="0.01"
                                                        step="0.01"
                                                        value={item.qty}
                                                        onChange={(e) => handleItemChange(index, "qty", e.target.value)}
                                                        placeholder="Qty"
                                                        required
                                                    />
                                                </td>
                                                <td className="border p-2">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.rate}
                                                        onChange={(e) => handleItemChange(index, "rate", e.target.value)}
                                                        placeholder="Rate"
                                                    />
                                                </td>
                                                <td className="border p-2">
                                                    <Input
                                                        value={item.remarks}
                                                        onChange={(e) => handleItemChange(index, "remarks", e.target.value)}
                                                        placeholder="Optional notes"
                                                    />
                                                </td>
                                                <td className="border p-2 text-center">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        disabled={items.length === 1}
                                                        onClick={() => handleRemoveItem(index)}
                                                        className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Vendor split preview */}
                            {distinctVendorCount > 0 && (
                                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Will be submitted as:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(vendorGroups).map(([shopId, groupItems]) => (
                                            <div key={shopId} className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-full text-xs">
                                                <Store className="h-3 w-3 text-blue-500" />
                                                <span className="font-medium text-slate-700">{getShopName(shopId === "no_vendor" ? null : shopId)}</span>
                                                <Badge variant="secondary" className="h-4 text-[10px] px-1 ml-0.5">{groupItems.length} item{groupItems.length !== 1 ? 's' : ''}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-6 flex justify-end gap-4">
                                <Button type="button" variant="outline" onClick={() => setLocation("/")}>Cancel</Button>
                                <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                    {distinctVendorCount > 1 ? `Submit ${distinctVendorCount} Requests` : "Submit for Approval"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </form>
            </div>

            {/* Material Picker Dialog */}
            <Dialog
                open={pickerOpenForIndex !== null}
                onOpenChange={(open) => { if (!open) { setPickerOpenForIndex(null); setSearchQuery(""); } }}
            >
                <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                        <DialogTitle className="text-lg font-bold flex items-center gap-2">
                            <Package className="h-5 w-5 text-blue-600" />
                            Select Material
                        </DialogTitle>
                        <div className="relative mt-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                autoFocus
                                className="pl-9 h-10 bg-slate-50 border-slate-200 focus:bg-white"
                                placeholder="Search by name, category, vendor…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </DialogHeader>

                    <div className="overflow-y-auto flex-1 px-4 py-3">
                        {isLoadingMaterials ? (
                            <div className="flex items-center justify-center py-12 text-slate-400">
                                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading materials...
                            </div>
                        ) : filteredMaterials.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No materials found</p>
                            </div>
                        ) : (
                            Object.entries(groupedMaterials).map(([vendorName, mats]) => (
                                <div key={vendorName} className="mb-5">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1 flex items-center gap-1.5">
                                        <Store className="h-3 w-3" /> {vendorName}
                                    </p>
                                    <div className="space-y-1">
                                        {mats.map((mat) => (
                                            <button
                                                key={mat.id}
                                                type="button"
                                                onClick={() => pickerOpenForIndex !== null && handleSelectMaterial(pickerOpenForIndex, mat)}
                                                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-between group border border-transparent hover:border-blue-100"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="h-7 w-7 rounded-md bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center shrink-0">
                                                        <Package className="h-3.5 w-3.5 text-slate-500 group-hover:text-blue-600" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700">{mat.name}</p>
                                                        {mat.unit && <p className="text-[10px] text-slate-400">Unit: {mat.unit}</p>}
                                                    </div>
                                                </div>
                                                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 shrink-0" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="px-6 py-3 border-t bg-slate-50/50 shrink-0 flex justify-between items-center">
                        <p className="text-xs text-slate-400">{filteredMaterials.length} material{filteredMaterials.length !== 1 ? 's' : ''} found</p>
                        <Button variant="outline" size="sm" onClick={() => { setPickerOpenForIndex(null); setSearchQuery(""); }}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Layout>
    );
}
