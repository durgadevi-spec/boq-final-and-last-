import React, { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import { useLocation } from "wouter";
import { useData } from "@/lib/store";

export default function RaisePORequest() {
    const { user } = useData();
    const { toast } = useToast();
    const [, setLocation] = useLocation();

    const [projectName, setProjectName] = useState("");
    const [department, setDepartment] = useState<string>(user?.department || "");
    const [items, setItems] = useState([{ material_id: "" as string, item: "", category: "", subcategory: "", unit: "", qty: "" as number | "", remarks: "" }]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setDepartment(user?.department || "");
    }, [user]);


    // Fetch Materials (for Item selection)
    const { data: materialsData, isLoading: isLoadingMaterials } = useQuery({
        queryKey: ['/api/materials'],
        queryFn: async () => {
            const res = await apiFetch('/api/materials');
            if (!res.ok) throw new Error("Failed to load materials");
            return res.json();
        }
    });

    // Fetch existing projects so we can supply a projectId (server requires it)
    const { data: projectsData } = useQuery({
        queryKey: ['/api/boq-projects'],
        queryFn: async () => {
            const res = await apiFetch('/api/boq-projects');
            if (!res.ok) throw new Error('Failed to load projects');
            return res.json();
        }
    });

    const projects = projectsData?.projects || [];

    const materials = materialsData?.materials || [];

    const handleAddItem = () => {
        setItems([...items, { material_id: "", item: "", category: "", subcategory: "", unit: "", qty: "", remarks: "" }]);
    };

    const handleRemoveItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const handleItemChange = (index: number, field: string, value: any) => {
        const newItems = [...items];
        if (field === "materialId") {
            const selectedMat = materials.find((m: any) => m.id === value);
            if (selectedMat) {
                newItems[index] = {
                    ...newItems[index],
                    material_id: value,
                    item: selectedMat.name,
                    category: selectedMat.categoryId || "",
                    subcategory: selectedMat.subcategoryId || "",
                    unit: selectedMat.unit || "",
                };
            }
        } else {
            (newItems[index] as any)[field] = value;
        }
        setItems(newItems);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!projectName.trim()) {
            return toast({ title: "Validation Error", description: "Please enter a project name", variant: "destructive" });
        }

        // Try to match an existing project. If none found, allow manual entry
        // but send a fallback projectId string so the server validation succeeds.
        const matchedProject = projects.find((p: any) => (p.name || '').toLowerCase() === projectName.trim().toLowerCase());

        const validItems = items.filter(i => i.item && i.qty && Number(i.qty) > 0);
        if (validItems.length === 0) {
            return toast({ title: "Validation Error", description: "Please add at least one item with a valid quantity > 0", variant: "destructive" });
        }

        setIsSubmitting(true);
        try {
            const res = await apiFetch("/api/po-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: matchedProject?.id || `manual:${projectName.trim()}`,
                    projectName: projectName.trim(),
                    employeeId: user?.employeeCode || undefined,
                    department: department || user?.department || undefined,
                    items: validItems
                }),
            });

            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.message || "Failed to submit PO Request");
            }

            toast({
                title: "Success",
                description: "PO Request submitted for approval",
                variant: "default",
            });

            setLocation("/my-po-requests");
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "An unexpected error occurred",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Layout>
            <div className="container mx-auto p-4 md:p-6 max-w-[1200px]">
                <div className="mb-6 flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Raise PO Request</h1>
                        <p className="text-muted-foreground mt-1">
                            Submit a Purchase Order request for approval by management.
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Project & Requester Info */}
                    <Card className="mb-6 border-blue-100 shadow-sm">
                        <CardHeader className="bg-blue-50/50 pb-4">
                            <CardTitle className="text-blue-800 text-lg">Project & Requester Information</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                            <div className="space-y-2 lg:col-span-2">
                                <Label htmlFor="project">Project Name <span className="text-red-500">*</span></Label>
                                <Input
                                    id="project"
                                    value={projectName}
                                    onChange={(e) => setProjectName(e.target.value)}
                                    placeholder="Enter project name"
                                />
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

                    {/* Items Table */}
                    <Card className="shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Item Details</CardTitle>
                                <CardDescription>Add the materials you need for the Annexure.</CardDescription>
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
                                            <th className="border p-2 text-left font-semibold text-sm w-[250px]">Item Name <span className="text-red-500">*</span></th>
                                            <th className="border p-2 text-left font-semibold text-sm">Category</th>
                                            <th className="border p-2 text-left font-semibold text-sm w-[80px]">Unit</th>
                                            <th className="border p-2 text-left font-semibold text-sm w-[150px]">Qty Required <span className="text-red-500">*</span></th>
                                            <th className="border p-2 text-left font-semibold text-sm">Remarks</th>
                                            <th className="border p-2 text-center font-semibold text-sm w-[60px]">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, index) => (
                                            <tr key={index} className="group hover:bg-slate-50/50">
                                                <td className="border p-2">
                                                    <Select
                                                        value={materials.find((m: any) => m.name === item.item)?.id || ""}
                                                        onValueChange={(val) => handleItemChange(index, 'materialId', val)}
                                                    >
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="Select Material" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {materials.map((m: any) => (
                                                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                                <td className="border p-2">
                                                    <Input value={item.category} disabled className="bg-slate-50" placeholder="Auto" />
                                                </td>
                                                <td className="border p-2">
                                                    <Input value={item.unit} disabled className="bg-slate-50" placeholder="Auto" />
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

                            <div className="mt-8 flex justify-end gap-4">
                                <Button type="button" variant="outline" onClick={() => setLocation("/")}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                    Submit for Approval
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </form>
            </div>
        </Layout>
    );
}
