import React, { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { computeBoq } from "@/lib/boqCalc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type BOMApproval = {
    id: string;
    project_id: string;
    project_name: string;
    project_client: string;
    version_number: number;
    status: string;
    created_at: string;
    type: "bom" | "boq";
};

type BOMItem = {
    id: string;
    estimator: string;
    table_data: any;
};

export default function BomApprovals() {
    const [approvals, setApprovals] = useState<BOMApproval[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedItems, setExpandedItems] = useState<BOMItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const { toast } = useToast();

    const fetchApprovals = async () => {
        try {
            setLoading(true);
            const res = await apiFetch("/api/bom-approvals");
            if (res.ok) {
                const data = await res.json();
                setApprovals(data.approvals || []);
            }
        } catch (err) {
            console.error("Failed to load BOM approvals:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchApprovals();
    }, []);

    const toggleExpand = async (id: string) => {
        if (expandedId === id) {
            setExpandedId(null);
            setExpandedItems([]);
            return;
        }
        setExpandedId(id);
        setLoadingItems(true);
        try {
            const res = await apiFetch(`/api/boq-items/version/${id}`);
            if (res.ok) {
                const data = await res.json();
                setExpandedItems(data.items || []);
            }
        } catch (err) {
            console.error("Failed to load BOM items:", err);
        } finally {
            setLoadingItems(false);
        }
    };

    const handleApprove = async (id: string, isEditRequest = false) => {
        if (!confirm(isEditRequest ? "Are you sure you want to APPROVE this edit request?" : "Are you sure you want to APPROVE this BOM version?")) return;
        setActionLoading(id);
        try {
            const url = isEditRequest ? `/api/bom-approvals/${id}/approve-edit` : `/api/bom-approvals/${id}/approve`;
            const res = await apiFetch(url, { method: "POST" });
            if (res.ok) {
                toast({ title: "Approved", description: isEditRequest ? "Edit request approved." : "BOM version approved." });
                fetchApprovals();
                setExpandedId(null);
            } else {
                const data = await res.json();
                toast({ title: "Error", description: data.message || "Failed to approve", variant: "destructive" });
            }
        } catch (err) {
            toast({ title: "Error", description: "Failed to approve", variant: "destructive" });
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (id: string, isEditRequest = false) => {
        const reason = prompt(isEditRequest ? "Reason for rejecting edit request:" : "Please enter a reason for rejection:");
        if (reason === null) return;

        setActionLoading(id);
        try {
            const url = isEditRequest ? `/api/bom-approvals/${id}/reject-edit` : `/api/bom-approvals/${id}/reject`;
            const res = await apiFetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
            });
            if (res.ok) {
                toast({ title: "Rejected", description: isEditRequest ? "Edit request rejected." : "BOM version rejected." });
                fetchApprovals();
                setExpandedId(null);
            } else {
                const data = await res.json();
                toast({ title: "Error", description: data.message || "Failed to reject", variant: "destructive" });
            }
        } catch (err) {
            toast({ title: "Error", description: "Failed to reject", variant: "destructive" });
        } finally {
            setActionLoading(null);
        }
    };

    const handleClear = async (id: string) => {
        setActionLoading(id);
        try {
            const res = await apiFetch(`/api/bom-approvals/${id}/clear`, { method: "POST" });
            if (res.ok) {
                toast({ title: "Cleared", description: "Record hidden from view." });
                fetchApprovals();
                setSelectedIds(prev => prev.filter(item => item !== id));
                if (expandedId === id) setExpandedId(null);
            }
        } catch (err) {
            toast({ title: "Error", description: "Failed to clear record", variant: "destructive" });
        } finally {
            setActionLoading(null);
        }
    };

    const toggleSelect = (id: string, checked: boolean) => {
        setSelectedIds(prev => checked ? [...prev, id] : prev.filter(item => item !== id));
    };

    const visibleApprovals = approvals;

    const toggleSelectAll = (checked: boolean) => {
        if (!checked) {
            setSelectedIds([]);
            return;
        }
        const approvableIds = visibleApprovals.filter(a => a.status === 'pending_approval' || a.status === 'submitted' || a.status === 'edit_requested').map(a => a.id);
        setSelectedIds(approvableIds);
    };

    const bulkApprove = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Approve ${selectedIds.length} selected BOM(s)?`)) return;
        setActionLoading("bulk");
        try {
            for (const id of selectedIds) {
                const approval = approvals.find(a => a.id === id);
                const isEditRequest = approval?.status === 'edit_requested';
                const url = isEditRequest ? `/api/bom-approvals/${id}/approve-edit` : `/api/bom-approvals/${id}/approve`;
                await apiFetch(url, { method: "POST" });
            }
            toast({ title: "Approved", description: `${selectedIds.length} BOM(s) approved.` });
            setSelectedIds([]);
            fetchApprovals();
            setExpandedId(null);
        } catch (err) {
            toast({ title: "Error", description: "Bulk approve failed", variant: "destructive" });
        } finally {
            setActionLoading(null);
        }
    };

    const bulkReject = async () => {
        if (selectedIds.length === 0) return;
        const reason = prompt(`Reject reason for ${selectedIds.length} BOM(s):`);
        if (reason === null) return;
        setActionLoading("bulk");
        try {
            for (const id of selectedIds) {
                const approval = approvals.find(a => a.id === id);
                const isEditRequest = approval?.status === 'edit_requested';
                const url = isEditRequest ? `/api/bom-approvals/${id}/reject-edit` : `/api/bom-approvals/${id}/reject`;
                await apiFetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason }),
                });
            }
            toast({ title: "Rejected", description: `${selectedIds.length} BOM(s) rejected.` });
            setSelectedIds([]);
            fetchApprovals();
            setExpandedId(null);
        } catch (err) {
            toast({ title: "Error", description: "Bulk reject failed", variant: "destructive" });
        } finally {
            setActionLoading(null);
        }
    };

    const bulkClear = async () => {
        if (selectedIds.length === 0) return;
        setActionLoading("bulk");
        try {
            const res = await apiFetch("/api/bom-approvals/bulk-clear", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: selectedIds }),
            });
            if (res.ok) {
                toast({ title: "Cleared", description: `${selectedIds.length} record(s) hidden.` });
                fetchApprovals();
                setSelectedIds([]);
                setExpandedId(null);
            }
        } catch (err) {
            toast({ title: "Error", description: "Bulk clear failed", variant: "destructive" });
        } finally {
            setActionLoading(null);
        }
    };

    const pendingApprovals = visibleApprovals.filter(a => a.status !== 'edit_requested');
    const editRequests = visibleApprovals.filter(a => a.status === 'edit_requested');

    const renderTable = (approvalsList: BOMApproval[], title: string, emptyMessage: string) => {
        if (approvalsList.length === 0) return null;

        const listApprovableCount = approvalsList.filter(a => a.status === 'pending_approval' || a.status === 'submitted' || a.status === 'edit_requested').length;
        const listHasPendingActions = approvalsList.some(a => a.status === 'pending_approval' || a.status === 'submitted' || a.status === 'edit_requested');
        const isAllSelected = listApprovableCount > 0 && approvalsList.filter(a => a.status === 'pending_approval' || a.status === 'submitted' || a.status === 'edit_requested').every(a => selectedIds.includes(a.id));

        const toggleListSelectAll = (checked: boolean) => {
            const approvableIds = approvalsList.filter(a => a.status === 'pending_approval' || a.status === 'submitted' || a.status === 'edit_requested').map(a => a.id);
            if (checked) {
                // Add all from this list that aren't already selected
                setSelectedIds(prev => Array.from(new Set([...prev, ...approvableIds])));
            } else {
                // Remove all from this list
                setSelectedIds(prev => prev.filter(id => !approvableIds.includes(id)));
            }
        };

        return (
            <div className="mb-8 last:mb-0">
                {title && <h3 className="text-lg font-bold mb-4 text-slate-800">{title}</h3>}
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40px]"></TableHead>
                            <TableHead className="w-[40px]">
                                <div className="flex items-center justify-center">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        checked={isAllSelected}
                                        onChange={(e) => toggleListSelectAll(e.target.checked)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                            </TableHead>
                            <TableHead>Project</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Version</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Date</TableHead>
                            {listHasPendingActions && <TableHead className="text-center">Actions</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {approvalsList.map((approval) => (
                            <React.Fragment key={approval.id}>
                                <TableRow
                                    className="cursor-pointer"
                                    onClick={() => toggleExpand(approval.id)}
                                >
                                    <TableCell>
                                        {expandedId === approval.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        {(approval.status === 'pending_approval' || approval.status === 'submitted' || approval.status === 'edit_requested') && (
                                            <div className="flex items-center justify-center">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                                    checked={selectedIds.includes(approval.id)}
                                                    onChange={(e) => toggleSelect(approval.id, e.target.checked)}
                                                />
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-bold">{approval.project_name}</TableCell>
                                    <TableCell>{approval.project_client}</TableCell>
                                    <TableCell>V{approval.version_number}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={approval.type === 'boq' ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-blue-50 text-blue-700 border-blue-200"}>
                                            {approval.type?.toUpperCase() || 'BOM'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {approval.status === "approved" ? (
                                            <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">Approved</Badge>
                                        ) : approval.status === "rejected" ? (
                                            <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-200 border-red-200">Rejected</Badge>
                                        ) : approval.status === "pending_approval" ? (
                                            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200">Pending</Badge>
                                        ) : approval.status === "edit_requested" ? (
                                            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200">Edit Requested</Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200 text-xs font-bold px-2 py-0 h-6 uppercase">{approval.status}</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>{new Date(approval.created_at).toLocaleDateString()}</TableCell>
                                    {approval.status === 'approved' || approval.status === 'rejected' ? (
                                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-muted-foreground hover:text-red-600"
                                                onClick={() => handleClear(approval.id)}
                                            >
                                                Clear
                                            </Button>
                                        </TableCell>
                                    ) : listHasPendingActions && (
                                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-center gap-2">
                                                {(approval.status === 'pending_approval' || approval.status === 'submitted' || approval.status === 'edit_requested') ? (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleApprove(approval.id, approval.status === 'edit_requested')}
                                                            disabled={actionLoading === approval.id}
                                                            className="bg-green-600 hover:bg-green-700"
                                                        >
                                                            Approve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            onClick={() => handleReject(approval.id, approval.status === 'edit_requested')}
                                                            disabled={actionLoading === approval.id}
                                                        >
                                                            Reject
                                                        </Button>
                                                    </>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                                {expandedId === approval.id && (
                                    <TableRow>
                                        <TableCell colSpan={selectedIds.length > 0 ? 8 : 7} className="bg-muted/20">
                                            <div className="p-4">
                                                <h4 className="font-bold mb-4">BOM Items Preview</h4>
                                                {loadingItems ? (
                                                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                                ) : (
                                                    <div className="space-y-4">
                                                        {expandedItems.map((item) => {
                                                            const td = typeof item.table_data === 'string' ? JSON.parse(item.table_data) : item.table_data;

                                                            let displayLines = [];
                                                            const step11Items = Array.isArray(td.step11_items) ? td.step11_items : [];

                                                            if (td.materialLines && td.targetRequiredQty !== undefined) {
                                                                try {
                                                                    const res = computeBoq(td.configBasis, td.materialLines, td.targetRequiredQty);
                                                                    // Map computed lines
                                                                    const computedLines = res.computed.map((line: any) => ({
                                                                        title: line.name,
                                                                        description: line.name,
                                                                        unit: line.unit,
                                                                        shop_name: line.shop_name,
                                                                        qtyPerSqf: line.perUnitQty,
                                                                        requiredQty: line.scaledQty,
                                                                        roundOff: line.roundOffQty,
                                                                        rateSqft: line.supplyRate + line.installRate,
                                                                        amount: line.lineTotal,
                                                                        manual: false,
                                                                    }));

                                                                    // Include manual additions
                                                                    const manualStep11 = step11Items.filter((it: any) => it && it.manual).map((it: any) => {
                                                                        const qty = Number(it.qty ?? it.requiredQty ?? it.qtyPerSqf ?? 0) || 0;
                                                                        const sRate = Number(it.supply_rate ?? it.supplyRate ?? 0) || 0;
                                                                        const iRate = Number(it.install_rate ?? it.installRate ?? 0) || 0;
                                                                        const rateVal = Number(it.rate ?? (sRate + iRate)) || (sRate + iRate);
                                                                        return {
                                                                            ...it,
                                                                            manual: true,
                                                                            qtyPerSqf: it.qtyPerSqf ?? 0,
                                                                            requiredQty: qty,
                                                                            supply_rate: sRate,
                                                                            install_rate: iRate,
                                                                            rateSqft: rateVal,
                                                                            amount: Number((qty * rateVal).toFixed(2)),
                                                                        };
                                                                    });

                                                                    displayLines = [...computedLines, ...manualStep11];
                                                                } catch (e) {
                                                                    console.error("Failed to compute BOQ breakdown", e);
                                                                    displayLines = step11Items;
                                                                }
                                                            } else {
                                                                // Manual product or engine product without materialLines
                                                                displayLines = step11Items.map((it: any) => {
                                                                    const qty = Number(it.qty ?? it.requiredQty ?? it.qtyPerSqf ?? 0) || 0;
                                                                    const sRate = Number(it.supply_rate ?? it.supplyRate ?? 0) || 0;
                                                                    const iRate = Number(it.install_rate ?? it.installRate ?? 0) || 0;
                                                                    const rateVal = Number(it.rate ?? (sRate + iRate)) || (sRate + iRate);
                                                                    return {
                                                                        ...it,
                                                                        qtyPerSqf: it.qtyPerSqf ?? 0,
                                                                        requiredQty: qty,
                                                                        rateSqft: rateVal,
                                                                        amount: Number((qty * rateVal).toFixed(2)),
                                                                    };
                                                                });
                                                            }

                                                            return (
                                                                <div key={item.id} className="border p-3 rounded bg-white">
                                                                    <div className="font-bold flex justify-between items-start">
                                                                        <div className="flex flex-col">
                                                                            <span>{td.product_name}</span>
                                                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                                {(td.hsn_code || td.hsn_sac_type === 'hsn') && (
                                                                                    <div className="flex items-center gap-1">
                                                                                        <span className="text-[10px] font-bold text-gray-500 uppercase">HSN:</span>
                                                                                        <span className="text-[11px] font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 min-w-[60px]">
                                                                                            {td.hsn_code || (td.hsn_sac_type === 'hsn' ? td.hsn_sac_code : "") || "—"}
                                                                                        </span>
                                                                                    </div>
                                                                                )}
                                                                                {(td.sac_code || td.hsn_sac_type === 'sac') && (
                                                                                    <div className="flex items-center gap-1">
                                                                                        <span className="text-[10px] font-bold text-gray-500 uppercase">SAC:</span>
                                                                                        <span className="text-[11px] font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 min-w-[60px]">
                                                                                            {td.sac_code || (td.hsn_sac_type === 'sac' ? td.hsn_sac_code : "") || "—"}
                                                                                        </span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        {td.targetRequiredQty && (
                                                                            <span className="text-xs text-blue-600">Target: {td.targetRequiredQty} {td.configBasis?.requiredUnitType}</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground mt-1">
                                                                        {item.estimator}
                                                                    </div>
                                                                    <Table className="mt-2 text-[11px]">
                                                                        <TableHeader>
                                                                            <TableRow className="h-8 bg-gray-50">
                                                                                <TableHead className="w-10">Sl</TableHead>
                                                                                <TableHead className="w-64">Item</TableHead>
                                                                                <TableHead className="w-32">Shop</TableHead>
                                                                                <TableHead className="w-[300px]">Description</TableHead>
                                                                                <TableHead className="text-center w-16">Unit</TableHead>
                                                                                <TableHead className="text-center w-20">Qty/{td.configBasis?.requiredUnitType || "Sqf"}</TableHead>
                                                                                <TableHead className="text-center w-24">Required Qty</TableHead>
                                                                                <TableHead className="text-center w-24">Round off</TableHead>
                                                                                <TableHead className="text-right w-24">Rate/{td.configBasis?.requiredUnitType || "Sqft"}</TableHead>
                                                                                <TableHead className="text-right w-28 text-green-700">Amount</TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {displayLines.length === 0 ? (
                                                                                <TableRow>
                                                                                    <TableCell colSpan={10} className="text-center py-4 text-gray-500 italic">
                                                                                        No items in this product group.
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            ) : (
                                                                                displayLines.map((s: any, idx: number) => (
                                                                                    <TableRow key={idx} className="h-8 hover:bg-blue-50/50">
                                                                                        <TableCell className="text-center">{idx + 1}</TableCell>
                                                                                        <TableCell className="font-medium">
                                                                                            {s.title}
                                                                                            {s.manual && (
                                                                                                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-tighter">
                                                                                                    Manual
                                                                                                </span>
                                                                                            )}
                                                                                        </TableCell>
                                                                                        <TableCell className="text-gray-600">{s.shop_name || "-"}</TableCell>
                                                                                        <TableCell className="text-gray-600 truncate max-w-[200px]" title={s.description}>{s.description || "-"}</TableCell>
                                                                                        <TableCell className="text-center">{s.unit}</TableCell>
                                                                                        <TableCell className="text-center">{(s.qtyPerSqf ?? 0).toFixed(3)}</TableCell>
                                                                                        <TableCell className="text-center text-blue-600">{(s.requiredQty ?? 0).toFixed(2)}</TableCell>
                                                                                        <TableCell className="text-center font-bold">{s.roundOff ?? "-"}</TableCell>
                                                                                        <TableCell className="text-right">₹{(s.rateSqft || 0).toLocaleString()}</TableCell>
                                                                                        <TableCell className="text-right font-bold bg-green-50/30">₹{(s.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                                                    </TableRow>
                                                                                ))
                                                                            )}
                                                                        </TableBody>
                                                                        <tfoot className="bg-gray-50/50 font-bold border-t-2 border-gray-200">
                                                                            <tr>
                                                                                <td colSpan={9} className="border px-2 py-1.5 text-right uppercase tracking-wider text-[10px] text-gray-500">Total</td>
                                                                                <td className="border px-2 py-1.5 text-right text-green-700 bg-green-50/50">
                                                                                    ₹{displayLines.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                                </td>
                                                                            </tr>
                                                                        </tfoot>
                                                                    </Table>
                                                                    {(td.materialLines || displayLines.length > 0) && (
                                                                        <div className="bg-gray-50 px-4 py-2 flex justify-end border-t border-gray-200">
                                                                            <div className="flex items-center gap-4">
                                                                                <span className="text-xs font-bold text-gray-500 uppercase">Rate per {td.configBasis?.requiredUnitType || "Unit"}:</span>
                                                                                <span className="text-sm font-extrabold text-blue-700 border-b-2 border-blue-600">
                                                                                    ₹{(displayLines.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0) / (td.targetRequiredQty || 1)).toFixed(2)}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
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
        );
    };

    return (
        <Layout>
            <div className="container mx-auto py-8 px-4">
                <Card className="max-w-6xl mx-auto shadow-xl">
                    <CardHeader className="bg-muted/50 border-b pb-6">
                        <CardTitle>BOM Approvals</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            Review and approve BOQ versions submitted by users.
                        </p>
                    </CardHeader>

                    <CardContent className="p-6">
                        {loading ? (
                            <div className="flex justify-center p-20">
                                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            </div>
                        ) : (
                            <>
                                {selectedIds.length > 0 && (
                                    <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                                        <div className="text-sm font-bold text-blue-700">{selectedIds.length} selected</div>
                                        <Button size="sm" onClick={bulkApprove} disabled={actionLoading != null} className="bg-green-600 hover:bg-green-700 text-white h-8 px-3">Approve Selected</Button>
                                        <Button size="sm" variant="destructive" onClick={bulkReject} disabled={actionLoading != null} className="h-8 px-3">Reject Selected</Button>
                                        <Button size="sm" variant="outline" onClick={bulkClear} disabled={actionLoading != null} className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">Clear Selected</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} disabled={actionLoading != null} className="h-8 px-3">Clear Selection</Button>
                                    </div>
                                )}
                                {visibleApprovals.length === 0 ? (
                                    <div className="text-center py-20 text-muted-foreground italic">
                                        No BOM approval requests found.
                                    </div>
                                ) : (
                                    <Tabs defaultValue={editRequests.length > 0 ? "edit-requests" : "bom-approvals"} className="w-full">
                                        <TabsList className="mb-6 grid w-full grid-cols-2 max-w-[400px]">
                                            <TabsTrigger value="edit-requests" className="font-semibold">
                                                Edit Requests {editRequests.length > 0 && <span className="ml-2 rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-0.5 text-xs font-bold">{editRequests.length}</span>}
                                            </TabsTrigger>
                                            <TabsTrigger value="bom-approvals" className="font-semibold">
                                                BOM Approvals {pendingApprovals.length > 0 && <span className="ml-2 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-bold">{pendingApprovals.length}</span>}
                                            </TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="edit-requests">
                                            {renderTable(editRequests, "", "No pending edit requests.")}
                                        </TabsContent>
                                        <TabsContent value="bom-approvals">
                                            {renderTable(pendingApprovals, "", "No BOM approval requests found.")}
                                        </TabsContent>
                                    </Tabs>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </Layout>
    );
}
