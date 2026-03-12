import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import {
    Card,
    CardContent,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
    ChevronLeft,
    Loader2,
    Printer,
    Edit,
    Save,
    X,
    Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PurchaseOrder {
    id: string;
    po_number: string;
    project_id: string;
    vendor_id: string;
    status: string;
    total_amount: string;
    subtotal?: string;
    tax?: string;
    delivery_date: string | null;
    comments: string | null;
    created_at: string;
    project_name?: string;
    vendor_name?: string;
    vendor_location?: string;
    vendor_phone?: string;
    vendor_phone_code?: string;
    vendor_city?: string;
    vendor_state?: string;
    vendor_country?: string;
    vendor_pincode?: string;
    vendor_gstin?: string;
    project_client?: string;
    project_location?: string;
    approval_comments?: string | null;
}

interface PurchaseOrderItem {
    id: string;
    item?: string;
    item_name?: string;
    description: string | null;
    unit: string | null;
    qty: string;
    rate: string;
    amount: string;
    hsn_code?: string;
    sac_code?: string;
}

export default function PurchaseOrderDetail() {
    const { id } = useParams();
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [po, setPo] = useState<PurchaseOrder | null>(null);
    const [items, setItems] = useState<PurchaseOrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showApprovalDialog, setShowApprovalDialog] = useState(false);
    const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
    const [comment, setComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Revise Mode States
    const [isReviseMode, setIsReviseMode] = useState(false);
    const [editedItems, setEditedItems] = useState<PurchaseOrderItem[]>([]);
    const [deletedItems, setDeletedItems] = useState<PurchaseOrderItem[]>([]);
    const [showReviseDialog, setShowReviseDialog] = useState(false);
    const [reviseReason, setReviseReason] = useState("");

    const [relatedPos, setRelatedPos] = useState<any[]>([]);

    const searchParams = new URLSearchParams(window.location.search);
    const mode = searchParams.get("mode");

    useEffect(() => {
        if (id) fetchPODetail();
    }, [id]);

    const fetchPODetail = async () => {
        try {
            setLoading(true);
            const res = await apiFetch(`/api/purchase-orders/${id}`);
            if (res.ok) {
                const data = await res.json();
                setPo(data.purchaseOrder);
                setItems(data.items || []);
                setRelatedPos(data.relatedPos || []);
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to load purchase order details.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (newStatus: string) => {
        try {
            const res = await apiFetch(`/api/purchase-orders/${id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                toast({ title: "Success", description: `PO status updated to ${newStatus}` });
                fetchPODetail();
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
        }
    };

    const handleApproval = async () => {
        setIsSubmitting(true);
        try {
            const res = await apiFetch(`/api/purchase-orders/${id}/approve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    approve: approvalAction === "approve",
                    comment
                }),
            });
            if (res.ok) {
                toast({
                    title: approvalAction === "approve" ? "Approved" : "Rejected",
                    description: `Purchase order has been ${approvalAction === "approve" ? "approved" : "rejected"}.`,
                });
                setShowApprovalDialog(false);
                fetchPODetail();
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to process approval", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReviseClick = () => {
        setIsReviseMode(true);
        setEditedItems(items.map(i => ({ ...i })));
        setDeletedItems([]);
    };

    const handleQtyChange = (itemId: string, newQty: string) => {
        setEditedItems(prev => prev.map(i => {
            if (i.id === itemId) {
                const qtyVal = parseFloat(newQty) || 0;
                const rateVal = parseFloat(i.rate) || 0;
                return { ...i, qty: newQty, amount: (qtyVal * rateVal).toString() };
            }
            return i;
        }));
    };

    const handleDeleteItem = (itemId: string) => {
        const itemToDelete = editedItems.find(i => i.id === itemId);
        if (itemToDelete) {
            setDeletedItems(prev => [...prev, itemToDelete]);
        }
        setEditedItems(prev => prev.filter(i => i.id !== itemId));
    };

    const handleSaveRevisionClick = () => {
        if (editedItems.length === 0) {
            toast({ title: "Error", description: "PO must have at least one item.", variant: "destructive" });
            return;
        }

        const hasIncrease = editedItems.some(edited => {
            const original = items.find(i => i.id === edited.id);
            if (!original) return false;
            return parseFloat(edited.qty) > parseFloat(original.qty);
        });

        if (hasIncrease) {
            setShowReviseDialog(true);
            setReviseReason("");
        } else {
            submitRevision("");
        }
    };

    const submitRevision = async (reason: string) => {
        setIsSubmitting(true);
        try {
            const res = await apiFetch(`/api/purchase-orders/${id}/revise`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: editedItems, reason, deletedItems }),
            });
            if (res.ok) {
                const data = await res.json();
                toast({ title: "Success", description: "PO Revised successfully." });
                setIsReviseMode(false);
                setShowReviseDialog(false);
                setLocation(`/purchase-orders/${data.newPo.id}`);
            } else {
                toast({ title: "Error", description: "Failed to revise PO", variant: "destructive" });
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to revise PO", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status.toLowerCase()) {
            case "draft":
                return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">Draft</Badge>;
            case "pending_approval":
                return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">Pending Approval</Badge>;
            case "approved":
                return <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">Approved</Badge>;
            case "rejected":
                return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Rejected</Badge>;
            case "ordered":
                return <Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-200">Ordered</Badge>;
            case "delivered":
                return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">Delivered</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                    <p className="text-muted-foreground">Loading PO details...</p>
                </div>
            </Layout>
        );
    }

    if (!po) {
        return (
            <Layout>
                <div className="text-center py-10">
                    <h2 className="text-xl font-bold">Purchase Order not found.</h2>
                    <Button variant="link" onClick={() => setLocation("/purchase-orders")}>Go back to list</Button>
                </div>
            </Layout>
        );
    }

    // Calculations
    // Calculations base on current mode
    const displayItems = isReviseMode ? editedItems : items;
    const subtotal = displayItems.reduce((sum, item) => sum + parseFloat(item.amount || "0"), 0);
    const sgst = subtotal * 0.09;
    const cgst = subtotal * 0.09;
    const totalWithTax = subtotal + sgst + cgst;
    const grandTotal = Math.round(totalWithTax);

    return (
        <Layout>
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                    body { background: white !important; }
                    .main-layout { padding: 0 !important; margin: 0 !important; }
                    .po-container { border: none !important; box-shadow: none !important; width: 100% !important; max-width: 100% !important; }
                    @page { margin: 10mm; size: A4; }
                }
                .watermark {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(-45deg);
                    font-size: 8rem;
                    font-weight: 900;
                    color: rgba(34, 197, 94, 0.1);
                    pointer-events: none;
                    z-index: 0;
                    white-space: nowrap;
                    text-transform: uppercase;
                }
            `}} />

            <div className="space-y-6 pb-20 relative main-layout">
                {/* Actions Header */}
                <div className="flex justify-between items-start no-print">
                    <div className="space-y-1">
                        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => setLocation("/purchase-orders")}>
                            <ChevronLeft className="h-4 w-4 mr-1" /> Back to List
                        </Button>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                            Purchase Order Detail
                            {getStatusBadge(po.status)}
                        </h1>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => window.print()}>
                            <Printer className="h-4 w-4 mr-2" /> Print PO
                        </Button>

                        {po.status === "draft" && (
                            <Button onClick={() => handleStatusUpdate("pending_approval")} className="bg-blue-600 hover:bg-blue-700 text-white">
                                Submit for Approval
                            </Button>
                        )}

                        {po.status === "pending_approval" && mode === "approval" && (
                            <>
                                <Button variant="outline" className="border-red-600 text-red-600 hover:bg-red-50" onClick={() => { setApprovalAction("reject"); setShowApprovalDialog(true); }}>
                                    Reject
                                </Button>
                                <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { setApprovalAction("approve"); setShowApprovalDialog(true); }}>
                                    Approve
                                </Button>
                            </>
                        )}

                        {po.status === "approved" && (
                            <Button onClick={() => handleStatusUpdate("ordered")} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                                Confirm Order Sent
                            </Button>
                        )}

                        {po.status === "ordered" && !isReviseMode && (
                            <Button onClick={() => handleStatusUpdate("delivered")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                                Mark Delivered
                            </Button>
                        )}

                        {po.status !== "revised" && po.status !== "delivered" && po.status !== "rejected" && !isReviseMode && (
                            <Button variant="outline" onClick={handleReviseClick}>
                                <Edit className="h-4 w-4 mr-2" /> Revise PO
                            </Button>
                        )}

                        {isReviseMode && (
                            <>
                                <Button variant="outline" onClick={() => setIsReviseMode(false)}>
                                    <X className="h-4 w-4 mr-2" /> Cancel
                                </Button>
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSaveRevisionClick} disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                    Save Revision
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* Main PO Document Card */}
                <Card className="max-w-[1000px] mx-auto border-slate-300 shadow-xl overflow-hidden bg-white po-container relative">
                    {po.status === 'approved' && <div className="watermark print-only hidden">Approved</div>}
                    {po.status === 'approved' && <div className="watermark no-print">Approved</div>}

                    <CardContent className="p-8 space-y-8 relative z-10">
                        {/* Header Section - Logo + Company Info + BILL badge */}
                        <div className="flex justify-between items-start pb-6">
                            <div className="flex items-start gap-4">
                                <img src="/logo.png" alt="Concept Trunk Interiors" className="h-20 w-auto" />
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-bold text-slate-800 tracking-wide">BILL</div>
                                <div className="text-sm text-slate-500 mt-1">Bill# <span className="font-semibold text-slate-700">{po.po_number}</span></div>
                            </div>
                        </div>

                        {/* Company Address Block */}
                        <div className="pb-4 border-b border-slate-200">
                            <div className="text-sm leading-relaxed text-slate-700">
                                <p className="font-semibold">Concept Trunk Interiors</p>
                                <p>12/36A, Indira Nagar</p>
                                <p>Medavakkam</p>
                                <p>Chennai Tamil Nadu 600100</p>
                                <p>India</p>
                                <p className="text-xs text-slate-500 mt-1">GSTIN 33ASOPS5560M1Z1</p>
                            </div>
                        </div>

                        {/* Bill From (Vendor) + Bill Date section */}
                        <div className="grid grid-cols-2 gap-8 py-4">
                            <div>
                                <p className="text-sm text-slate-500 mb-1">Bill From</p>
                                <p className="font-semibold text-slate-800">{po.vendor_name || "Vendor"}</p>
                                {po.vendor_location && <p className="text-sm text-slate-600">{po.vendor_location}</p>}
                                {po.vendor_city && <p className="text-sm text-slate-600">{po.vendor_city}</p>}
                                {(po.vendor_state || po.vendor_pincode) && (
                                    <p className="text-sm text-slate-600">
                                        {po.vendor_state || ''} {po.vendor_pincode || ''}
                                    </p>
                                )}
                                <p className="text-sm text-slate-600">India</p>
                                {po.vendor_gstin && (
                                    <p className="text-xs text-slate-500 mt-1">GSTIN {po.vendor_gstin}</p>
                                )}
                            </div>
                            <div className="text-right space-y-2">
                                <div className="flex justify-end gap-8">
                                    <span className="text-sm text-slate-500">Bill Date :</span>
                                    <span className="text-sm font-medium text-slate-700">{new Date(po.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                </div>
                                {po.delivery_date && (
                                    <div className="flex justify-end gap-8">
                                        <span className="text-sm text-slate-500">Due Date :</span>
                                        <span className="text-sm font-medium text-slate-700">{new Date(po.delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                    </div>
                                )}
                                <div className="flex justify-end gap-8">
                                    <span className="text-sm text-slate-500">Customer Name :</span>
                                    <span className="text-sm font-medium text-slate-700 uppercase">{po.project_client || po.project_name || '—'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Approval Comments / Revision Reason */}
                        {po.approval_comments && (
                            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-r-md">
                                <div className="flex items-start">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-amber-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-amber-800">
                                            {po.status === 'rejected' ? 'Rejection Reason' : 'Revision/Approval Note'}
                                        </h3>
                                        <div className="mt-2 text-sm text-amber-700 whitespace-pre-wrap">
                                            {po.approval_comments}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Items Table */}
                        <div className="border border-slate-300 overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-100 border-b border-slate-300">
                                        <TableHead className="text-slate-700 font-semibold w-12 text-center text-xs py-2">#</TableHead>
                                        <TableHead className="text-slate-700 font-semibold text-xs py-2">Item & Description</TableHead>
                                        <TableHead className="text-slate-700 font-semibold text-xs text-center py-2">HSN/SAC</TableHead>
                                        <TableHead className="text-slate-700 font-semibold text-xs text-center py-2">Qty</TableHead>
                                        <TableHead className="text-slate-700 font-semibold text-xs text-right py-2">Rate</TableHead>
                                        <TableHead className="text-slate-700 font-semibold text-xs text-right py-2 pr-4">Amount</TableHead>
                                        {isReviseMode && <TableHead className="text-slate-700 font-semibold text-xs text-center w-12 py-2">Action</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {displayItems.map((item, idx) => (
                                        <TableRow key={item.id} className="border-b border-slate-200">
                                            <TableCell className="text-center text-sm text-slate-500">{idx + 1}</TableCell>
                                            <TableCell>
                                                <div className="text-sm text-slate-800">{item.item || item.item_name}</div>
                                                {item.description && <div className="text-xs text-slate-400 mt-0.5">{item.description}</div>}
                                                {item.unit && <div className="text-xs text-slate-400">{item.unit}</div>}
                                            </TableCell>
                                            <TableCell className="text-center text-sm text-slate-600">{item.hsn_code || item.sac_code || ""}</TableCell>
                                            <TableCell className="text-center text-sm">
                                                {isReviseMode ? (
                                                    <Input
                                                        type="number"
                                                        value={item.qty}
                                                        onChange={(e) => handleQtyChange(item.id, e.target.value)}
                                                        className="w-20 text-center mx-auto h-8 text-sm"
                                                        min="0"
                                                        step="0.01"
                                                    />
                                                ) : (
                                                    parseFloat(item.qty).toFixed(2)
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-sm">{parseFloat(item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right text-sm font-medium pr-4">{parseFloat(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                                            {isReviseMode && (
                                                <TableCell className="text-center">
                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id)} className="h-8 w-8 p-0">
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Totals Section */}
                        <div className="flex justify-end">
                            <div className="w-72 space-y-1">
                                <div className="flex justify-between text-sm py-1">
                                    <span className="text-slate-600 font-medium">Sub Total</span>
                                    <span className="text-slate-800">{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-sm py-1">
                                    <span className="text-slate-600">SGST9 (9%)</span>
                                    <span className="text-slate-800">{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-sm py-1">
                                    <span className="text-slate-600">CGST9 (9%)</span>
                                    <span className="text-slate-800">{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-sm py-1">
                                    <span className="text-slate-600">Round off</span>
                                    <span className="text-slate-800">{(grandTotal - totalWithTax).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm font-semibold py-2 border-t border-slate-300">
                                    <span className="text-slate-800">Total</span>
                                    <span className="text-slate-900">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-sm font-semibold py-2 bg-slate-100 px-2 -mx-2">
                                    <span className="text-slate-800">Balance Due</span>
                                    <span className="text-slate-900 font-bold">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>

                        {/* Footer - Authorized Signature */}
                        <div className="pt-12 pb-4">
                            <div className="text-sm text-slate-700">
                                <span className="font-medium">Authorized Signature</span>
                                <span className="inline-block w-64 border-b border-slate-400 ml-2"></span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Related PO Versions */}
                {relatedPos.length > 0 && (
                    <Card className="max-w-[1000px] mx-auto border-slate-300 shadow bg-white no-print mt-6">
                        <CardContent className="p-6">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">Related PO Versions</h3>
                            <div className="space-y-3">
                                {relatedPos.map(rpo => (
                                    <div key={rpo.id} className="flex items-center justify-between p-3 border rounded hover:bg-slate-50 cursor-pointer" onClick={() => setLocation(`/purchase-orders/${rpo.id}`)}>
                                        <div>
                                            <div className="font-semibold text-slate-800">{rpo.po_number}</div>
                                            <div className="text-xs text-slate-500">{new Date(rpo.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <div className="text-sm font-bold text-slate-700">₹{parseFloat(rpo.total || "0").toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                            </div>
                                            {getStatusBadge(rpo.status)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Approval Dialog */}
            <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{approvalAction === "approve" ? "Approve Purchase Order" : "Reject Purchase Order"}</DialogTitle>
                        <DialogDescription>
                            {approvalAction === "approve"
                                ? "Provide optional comments for this approval."
                                : "Provide a reason for rejecting this purchase order."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea
                            placeholder="Enter your comments here..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="min-h-[100px]"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowApprovalDialog(false)} disabled={isSubmitting}>Cancel</Button>
                        <Button
                            className={approvalAction === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
                            onClick={handleApproval}
                            disabled={isSubmitting || (approvalAction === "reject" && !comment.trim())}
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {approvalAction === "approve" ? "Approve" : "Reject"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Revise Reason Dialog */}
            <Dialog open={showReviseDialog} onOpenChange={setShowReviseDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reason for Quantity Increase</DialogTitle>
                        <DialogDescription>
                            You have increased the quantity of one or more items. 
                            This revision will require Admin approval. Please provide a reason.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea
                            placeholder="Enter reason for quantity increase..."
                            value={reviseReason}
                            onChange={(e) => setReviseReason(e.target.value)}
                            className="min-h-[100px]"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowReviseDialog(false)} disabled={isSubmitting}>Cancel</Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => submitRevision(reviseReason)}
                            disabled={isSubmitting || !reviseReason.trim()}
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Submit Revision
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Layout>
    );
}
