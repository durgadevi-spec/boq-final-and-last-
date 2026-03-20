import React, { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronUp, ShoppingCart, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@/lib/api";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

export default function ApprovedPORequests() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [vendorId, setVendorId] = useState("");
    const [vendorName, setVendorName] = useState("");
    const [itemRates, setItemRates] = useState<Record<string, number>>({});
    const [isGenerating, setIsGenerating] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['/api/po-requests', { status: 'approved' }],
        queryFn: async () => {
            const res = await apiFetch('/api/po-requests?status=approved');
            if (!res.ok) throw new Error("Failed to load requests");
            return res.json();
        }
    });

    const { data: requestItemsData } = useQuery({
        queryKey: ['/api/po-requests', expandedId],
        queryFn: async () => {
            if (!expandedId) return null;
            const res = await apiFetch(`/api/po-requests/${expandedId}`);
            if (!res.ok) throw new Error("Failed to load request items");
            return res.json();
        },
        enabled: !!expandedId
    });

    // Fetch vendors (shops)
    const { data: vendorsData } = useQuery({
        queryKey: ['/api/shops'],
        queryFn: async () => {
            const res = await apiFetch('/api/shops');
            if (!res.ok) throw new Error("Failed to load vendors");
            return res.json();
        }
    });

    const requests = data?.poRequests || [];
    const vendors = vendorsData?.shops || vendorsData || [];

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const openGenerateDialog = (req: any) => {
        setSelectedRequest(req);
        setVendorId("");
        setVendorName("");
        setItemRates({});
        setGenerateDialogOpen(true);
        // Also expand to load items
        setExpandedId(req.id);
    };

    const handleGeneratePO = async () => {
        if (!selectedRequest || !vendorId) {
            return toast({ title: "Error", description: "Please select a vendor", variant: "destructive" });
        }

        // Build the items with rates
        const items = requestItemsData?.items || [];
        const itemsWithRates = items.map((item: any) => ({
            poRequestItemId: item.id,
            qty: Number(item.qty),
            rate: itemRates[item.id] || 0,
        }));

        if (itemsWithRates.some((i: any) => i.rate <= 0)) {
            return toast({ title: "Error", description: "All items must have a rate > 0", variant: "destructive" });
        }

        setIsGenerating(true);
        try {
            const res = await apiFetch(`/api/po-requests/${selectedRequest.id}/generate-po`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vendorId, vendorName, itemsWithRates }),
            });

            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.message || "Failed to generate PO");
            }

            toast({ title: "Success", description: "Purchase Order generated successfully!" });
            setGenerateDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ['/api/po-requests'] });
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Layout>
            <div className="container mx-auto p-4 md:p-6 max-w-[1200px]">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Approved Annexure Requests</h1>
                    <p className="text-muted-foreground mt-2">
                        View approved internal Annexure requests and generate the final documents.
                    </p>
                </div>

                <Card className="shadow-sm border-green-100">
                    <CardHeader className="bg-green-50/50 pb-4">
                        <CardTitle className="text-green-800">Approved & Ready for PO</CardTitle>
                        <CardDescription>Click "Generate PO" to create a Purchase Order from an approved request.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {isLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-green-400" />
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                                <p>No approved Annexure requests at the moment.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50">
                                            <TableHead className="w-[50px]"></TableHead>
                                            <TableHead className="font-semibold">Requester</TableHead>
                                            <TableHead className="font-semibold">Project</TableHead>
                                            <TableHead className="font-semibold">Department</TableHead>
                                            <TableHead className="font-semibold">Approved On</TableHead>
                                            <TableHead className="font-semibold text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {requests.map((req: any) => (
                                            <React.Fragment key={req.id}>
                                                <TableRow className="hover:bg-slate-50 border-b border-slate-100">
                                                    <TableCell className="text-center p-2">
                                                        <Button variant="ghost" size="icon" onClick={() => toggleExpand(req.id)} className="h-8 w-8 rounded-full hover:bg-slate-200">
                                                            {expandedId === req.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                        </Button>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium text-slate-900">{req.requester_name}</div>
                                                    </TableCell>
                                                    <TableCell className="font-medium">{req.project_name}</TableCell>
                                                    <TableCell>{req.department || 'N/A'}</TableCell>
                                                    <TableCell className="text-slate-600">
                                                        {format(new Date(req.updated_at || req.created_at), "MMM d, yyyy")}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" onClick={() => openGenerateDialog(req)} className="bg-indigo-600 hover:bg-indigo-700 h-8">
                                                            <ShoppingCart className="h-4 w-4 mr-1" /> Generate PO
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                                {expandedId === req.id && (
                                                    <TableRow className="bg-slate-50 border-b border-slate-200">
                                                        <TableCell colSpan={6} className="p-4 md:p-6">
                                                            <div className="bg-white rounded-lg border border-slate-200 p-4 relative">
                                                                <div className="absolute top-0 left-0 w-1 h-full bg-green-400 rounded-l-lg"></div>
                                                                <h4 className="font-semibold mb-3 text-slate-800 flex items-center gap-2">
                                                                    <Search className="h-4 w-4 text-green-500" /> Requested Items
                                                                </h4>
                                                                {!requestItemsData || requestItemsData.poRequest?.id !== req.id ? (
                                                                    <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                                                                ) : (
                                                                    <Table>
                                                                        <TableHeader className="bg-slate-50">
                                                                            <TableRow>
                                                                                <TableHead className="text-xs">Item</TableHead>
                                                                                <TableHead className="text-xs">Category</TableHead>
                                                                                <TableHead className="text-xs">Unit</TableHead>
                                                                                <TableHead className="text-xs text-right">Qty</TableHead>
                                                                                <TableHead className="text-xs">Remarks</TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {requestItemsData.items.map((item: any, idx: number) => (
                                                                                <TableRow key={idx}>
                                                                                    <TableCell className="font-medium text-sm">{item.item}</TableCell>
                                                                                    <TableCell className="text-sm text-slate-600">{item.category || '-'}</TableCell>
                                                                                    <TableCell className="text-sm text-slate-600">{item.unit}</TableCell>
                                                                                    <TableCell className="text-sm font-semibold text-right">{item.qty}</TableCell>
                                                                                    <TableCell className="text-sm text-slate-500 italic">{item.remarks || '-'}</TableCell>
                                                                                </TableRow>
                                                                            ))}
                                                                        </TableBody>
                                                                    </Table>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Generate Annexure Dialog */}
            <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
                <DialogContent className="max-w-[800px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Generate Annexure</DialogTitle>
                        <DialogDescription>
                            Select a vendor and specify rates for each item to generate the Annexure.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Vendor Selection */}
                        <div className="space-y-2">
                            <Label>Select Vendor <span className="text-red-500">*</span></Label>
                            <Select value={vendorId} onValueChange={(val) => {
                                setVendorId(val);
                                const v = (Array.isArray(vendors) ? vendors : []).find((v: any) => String(v.id) === val);
                                setVendorName(v?.name || val);
                            }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose a vendor" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Array.isArray(vendors) ? vendors : []).map((v: any) => (
                                        <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Items with Rates */}
                        {requestItemsData && requestItemsData.poRequest?.id === selectedRequest?.id && (
                            <div className="space-y-2">
                                <Label>Item Rates</Label>
                                <div className="border rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead className="text-xs">Item</TableHead>
                                                <TableHead className="text-xs text-right">Qty</TableHead>
                                                <TableHead className="text-xs">Unit</TableHead>
                                                <TableHead className="text-xs text-right w-[120px]">Rate ₹ *</TableHead>
                                                <TableHead className="text-xs text-right">Amount</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {requestItemsData.items.map((item: any) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="text-sm font-medium">{item.item}</TableCell>
                                                    <TableCell className="text-sm text-right">{item.qty}</TableCell>
                                                    <TableCell className="text-sm">{item.unit}</TableCell>
                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            min="0.01"
                                                            step="0.01"
                                                            className="w-[100px] text-right ml-auto"
                                                            value={itemRates[item.id] || ""}
                                                            onChange={(e) => setItemRates(prev => ({
                                                                ...prev,
                                                                [item.id]: Number(e.target.value)
                                                            }))}
                                                            placeholder="₹"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-sm text-right font-semibold">
                                                        ₹{((itemRates[item.id] || 0) * Number(item.qty)).toFixed(2)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>Cancel</Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700"
                            disabled={isGenerating || !vendorId}
                            onClick={handleGeneratePO}
                        >
                            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Generate Annexure
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Layout>
    );
}
