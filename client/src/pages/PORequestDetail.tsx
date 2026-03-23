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
import { Input } from "@/components/ui/input";
import {
    Loader2,
    Printer,
    Download,
    ArrowLeft
} from "lucide-react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import html2pdf from "html2pdf.js";
import { format } from "date-fns";

interface PORequest {
    id: string;
    employee_id: string;
    requester_name: string;
    department?: string;
    project_id: string;
    project_name?: string;
    status: string;
    created_at: string;
    updated_at: string;
    deliver_to?: string;
    payment_terms?: string;
    terms_conditions?: string;
    items?: PORequestItem[];
}

interface PORequestItem {
    id: string;
    item: string;
    category?: string;
    unit: string;
    qty: string;
    original_qty?: string;
    rate?: string;
    remarks?: string;
    hsn_code?: string;
    sac_code?: string;
    shop_name?: string;
    shop_location?: string;
    shop_gstin?: string;
}

export default function PORequestDetail() {
    const { id } = useParams();
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [request, setRequest] = useState<PORequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editedItems, setEditedItems] = useState<PORequestItem[]>([]);
    const [showApprovalDialog, setShowApprovalDialog] = useState(false);
    const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
    const [comment, setComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [editableDeliverTo, setEditableDeliverTo] = useState("");
    const [editablePaymentTerms, setEditablePaymentTerms] = useState("");
    const [editableTermsConditions, setEditableTermsConditions] = useState("");

    const searchParams = new URLSearchParams(window.location.search);
    const mode = searchParams.get("mode");

    useEffect(() => {
        if (id) fetchRequestDetail();
    }, [id]);

    const fetchRequestDetail = async () => {
        try {
            setLoading(true);
            const res = await apiFetch(`/api/po-requests/${id}`);
            if (res.ok) {
                const data = await res.json();
                setRequest(data.poRequest);
                setEditedItems(data.items);
                setEditableDeliverTo(data.poRequest.deliver_to || "Standard project site delivery or as specified in Annexure.");
                setEditablePaymentTerms(data.poRequest.payment_terms || "");
                setEditableTermsConditions(data.poRequest.terms_conditions || "");
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to load request details.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleApproval = async () => {
        setIsSubmitting(true);
        try {
            const res = await apiFetch(`/api/po-requests/${id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: approvalAction === "approve" ? "approved" : "rejected",
                    comment // Passing comment though backend might need update to save it
                }),
            });
            if (res.ok) {
                toast({
                    title: approvalAction === "approve" ? "Approved" : "Rejected",
                    description: `Request has been ${approvalAction === "approve" ? "approved" : "rejected"}.`,
                });
                setShowApprovalDialog(false);
                fetchRequestDetail();
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to process approval", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownloadPDF = () => {
        const element = document.getElementById("po-detail-content");
        if (!element) return;

        setIsDownloading(true);

        const opt = {
            margin: 10,
            filename: `Anx_${request?.id.slice(0,4)}_${request?.id.slice(4,8)}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
        };

        html2pdf().set(opt).from(element).save().then(() => {
            setIsDownloading(false);
            toast({ title: "Success", description: "Request downloaded successfully" });
        }).catch(() => {
            setIsDownloading(false);
            toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
        });
    };

    const handleItemChange = (itemId: string, field: keyof PORequestItem, value: string) => {
        setEditedItems(prevItems =>
            prevItems.map(item =>
                item.id === itemId ? { ...item, [field]: value } : item
            )
        );
    };

    const handleSaveRevision = async () => {
        if (!id) return;
        try {
            const res = await apiFetch(`/api/po-requests/${id}/items`, {
                method: 'PUT',
                body: JSON.stringify({ 
                    items: editedItems,
                    deliver_to: editableDeliverTo,
                    payment_terms: editablePaymentTerms,
                    terms_conditions: editableTermsConditions
                })
            });
            if (res.ok) {
                toast({ title: "Revision saved successfully" });
                setIsEditing(false);
                fetchRequestDetail();
            } else {
                const data = await res.json();
                toast({ title: data.message || "Failed to save revision", variant: "destructive" });
            }
        } catch (error) {
            console.error("Error saving revision:", error);
            toast({ title: "Error saving revision", variant: "destructive" });
        }
    };

    const handleStatusUpdate = (action: "approve" | "reject") => {
        setApprovalAction(action);
        setShowApprovalDialog(true);
    };

    const getStatusBadge = (status: string) => {
        switch (status.toLowerCase()) {
            case "pending_approval":
                return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">Pending Approval</Badge>;
            case "approved":
                return <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">Approved</Badge>;
            case "rejected":
                return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Rejected</Badge>;
            case "po_generated":
                return <Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-200">PO Generated</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                    <p className="text-muted-foreground">Loading request details...</p>
                </div>
            </Layout>
        );
    }

    if (!request) {
        return (
            <Layout>
                <div className="text-center py-10">
                    <h2 className="text-xl font-bold">Request not found.</h2>
                    <Button variant="link" onClick={() => setLocation("/po-approvals")}>Go back to list</Button>
                </div>
            </Layout>
        );
    }

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
                
                #po-detail-content, 
                #po-detail-content * {
                    --tw-ring-color: rgba(59, 130, 246, 0.5) !important;
                    --tw-ring-offset-shadow: 0 0 #0000 !important;
                    --tw-ring-shadow: 0 0 #0000 !important;
                    --tw-shadow: 0 0 #0000 !important;
                    --tw-shadow-colored: 0 0 #0000 !important;
                }

                #po-detail-content .text-slate-500 { color: #64748b !important; }
                #po-detail-content .text-slate-600 { color: #475569 !important; }
                #po-detail-content .text-slate-700 { color: #334155 !important; }
                #po-detail-content .text-slate-800 { color: #1e293b !important; }
                #po-detail-content .text-slate-900 { color: #0f172a !important; }
                #po-detail-content .bg-slate-50 { background-color: #f8fafc !important; }
                #po-detail-content .bg-slate-100 { background-color: #f1f5f9 !important; }
                #po-detail-content .bg-slate-200 { background-color: #e2e8f0 !important; }
                #po-detail-content .border-slate-100 { border-color: #f1f5f9 !important; }
                #po-detail-content .border-slate-200 { border-color: #e2e8f0 !important; }
                #po-detail-content .border-slate-300 { border-color: #cbd5e1 !important; }
                
                .watermark {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(-45deg);
                    font-size: 8rem;
                    font-weight: 900;
                    color: rgba(59, 130, 246, 0.1) !important;
                    pointer-events: none;
                    z-index: 0;
                    white-space: nowrap;
                    text-transform: uppercase;
                }
            `}} />

            <div className="space-y-6 pb-20 relative main-layout max-w-[1000px] mx-auto">
                {/* Actions Header */}
                <div className="flex justify-between items-start no-print">
                    <div className="space-y-1">
                        <Button variant="ghost" size="sm" onClick={() => setLocation('/po-approvals')} className="mb-4 text-slate-500 hover:text-slate-900 -ml-2">
                            <ArrowLeft className="h-4 w-4 mr-1" /> Back to List
                        </Button>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                            {isEditing ? "Revise Request" : "Annexure Detail"}
                            {getStatusBadge(request.status)}
                        </h1>
                    </div>
                    <div className="flex gap-2 no-print">
                        {isEditing ? (
                            <>
                                <Button variant="outline" size="sm" onClick={() => { setIsEditing(false); setEditedItems(request.items || []); }} className="h-8 text-xs">
                                    Cancel
                                </Button>
                                <Button variant="default" size="sm" onClick={handleSaveRevision} className="h-8 text-xs bg-blue-600 hover:bg-blue-700">
                                    Save Changes
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 text-xs">
                                    <Printer className="w-3.5 h-3.5 mr-1.5" />
                                    Print Request
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs bg-slate-800 text-white hover:bg-slate-700"
                                    onClick={handleDownloadPDF}
                                    disabled={isDownloading}
                                >
                                    {isDownloading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
                                    {isDownloading ? "Generating..." : "Download PDF"}
                                </Button>
                                {request.status === "pending_approval" && mode === "approval" && (
                                    <>
                                        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="h-8 text-xs border-blue-200 text-blue-600 hover:bg-blue-50">
                                            Revise
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => handleStatusUpdate('reject')} className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50">
                                            Reject
                                        </Button>
                                        <Button variant="default" size="sm" onClick={() => handleStatusUpdate('approve')} className="h-8 text-xs bg-green-600 hover:bg-green-700">
                                            Approve
                                        </Button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Main Document Content Wrapper */}
                <div id="po-detail-content">
                    <Card className="border-slate-300 shadow-xl overflow-hidden bg-white po-container relative">
                        {request.status === 'approved' && <div className="watermark no-print">Approved</div>}
                        
                        <CardContent className="p-8 space-y-8 relative z-10">
                            {/* Header Section */}
                            <div className="flex justify-between items-start pb-6 border-b border-slate-200">
                                <div className="flex gap-6">
                                    <img src="/logo.png" alt="Concept Trunk Interiors" className="h-16 w-auto" />
                                    <div className="text-sm leading-tight text-slate-700 space-y-0.5">
                                        <p className="font-bold text-slate-800">Concept Trunk Interiors</p>
                                        <p>12/36A, Indira Nagar, Medavakkam</p>
                                        <p>Chennai, Tamil Nadu 600100</p>
                                        <p className="text-[10px] text-slate-500">GSTIN 33ASOPS5560M1Z1</p>
                                    </div>
                                </div>
                                <div className="text-right space-y-1">
                                    <div className="text-xl font-black text-slate-900 tracking-tighter uppercase whitespace-nowrap">ANNEXURE</div>
                                    <div className="text-sm text-slate-500">Annexure No. <span className="font-bold text-slate-800">Anx-{request.id.slice(0, 4).toUpperCase()}-{request.id.slice(4, 8).toUpperCase()}</span></div>
                                    <div className="pt-2 text-xs">
                                        <span className="text-slate-500 uppercase font-semibold tracking-wider mr-2">DATE:</span>
                                        <span className="font-bold text-slate-700">{new Date(request.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-2 gap-12 py-2">
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Bill From</p>
                                        <div className="text-sm">
                                            <p className="font-bold text-slate-800">{editedItems[0]?.shop_name || "NOT ASSIGNED"}</p>
                                            <p className="text-slate-600">{editedItems[0]?.shop_location || "N/A"}</p>
                                            <p className="text-slate-600 uppercase text-[10px] font-bold mt-1">
                                                GSTIN: {editedItems[0]?.shop_gstin || "N/A"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-slate-600">
                                            <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider mr-2">Project Name:</span>
                                            <span className="font-bold text-slate-700 uppercase">{request.project_name || '—'}</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Deliver To</p>
                                    <div className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed italic border-l-2 border-slate-100 pl-4 bg-slate-50/30 p-3 rounded-r">
                                        {isEditing ? (
                                            <Textarea 
                                                className="text-xs italic bg-white min-h-[60px]" 
                                                value={editableDeliverTo} 
                                                onChange={(e) => setEditableDeliverTo(e.target.value)}
                                            />
                                        ) : (
                                            request.deliver_to || "Standard project site delivery or as specified in Annexure."
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Items Table - EXACT MATCH TO ANNEXURE HEADERS */}
                            <div className="border border-slate-300 overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-100 border-b border-slate-300">
                                            <TableHead className="text-slate-700 font-semibold w-12 text-center text-[10px] py-1">#</TableHead>
                                            <TableHead className="text-slate-700 font-semibold text-[10px] py-1">Item Details</TableHead>
                                            <TableHead className="text-slate-700 font-semibold text-[10px] text-center py-1">Unit</TableHead>
                                            <TableHead className="text-slate-700 font-semibold text-[10px] text-center py-1">HSN</TableHead>
                                            <TableHead className="text-slate-700 font-semibold text-[10px] text-center py-1">SAC</TableHead>
                                            <TableHead className="text-slate-700 font-semibold text-[10px] text-center py-1 bg-slate-200/50">Original Qty</TableHead>
                                            <TableHead className="text-slate-700 font-semibold text-[10px] text-center py-1">Ordered Qty</TableHead>
                                            <TableHead className="text-slate-700 font-semibold text-[10px] text-center py-1">Balance Qty</TableHead>
                                            <TableHead className="text-slate-700 font-semibold text-[10px] text-center py-1">Tax %</TableHead>
                                            <TableHead className="text-slate-700 font-semibold text-[10px] text-right py-1">Rate</TableHead>
                                            <TableHead className="text-slate-700 font-semibold text-[10px] text-right py-1 pr-4">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {editedItems.map((item, idx) => (
                                            <TableRow key={item.id} className="hover:bg-slate-50 border-slate-100 transition-colors">
                                                <TableCell className="text-center py-2 font-mono text-[10px] text-slate-400">{idx + 1}</TableCell>
                                                <TableCell className="py-2">
                                                    <div className="font-bold text-slate-800 text-[11px] leading-tight uppercase">{item.item}</div>
                                                    {isEditing ? (
                                                        <Input 
                                                            className="h-6 text-[10px] mt-1 py-0 px-2 border-slate-200 focus:border-blue-300" 
                                                            value={item.remarks || ""} 
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleItemChange(item.id, 'remarks', e.target.value)}
                                                            placeholder="Add internal remarks..."
                                                        />
                                                    ) : (
                                                        item.remarks && <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{item.remarks}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center text-[11px] text-slate-600 py-2">{item.unit}</TableCell>
                                                <TableCell className="text-center text-[11px] text-slate-600 py-2">{item.hsn_code || "—"}</TableCell>
                                                <TableCell className="text-center text-[11px] text-slate-600 py-2">{item.sac_code || "—"}</TableCell>
                                                <TableCell className="text-center text-[11px] py-1 bg-slate-50 font-medium text-slate-500">
                                                    {parseFloat(item.original_qty || item.qty).toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-center text-[11px] py-1">
                                                    {isEditing ? (
                                                        <Input 
                                                            type="number"
                                                            className="h-7 w-20 text-center text-[11px] mx-auto border-blue-200 focus:ring-1 focus:ring-blue-100" 
                                                            value={item.qty} 
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleItemChange(item.id, 'qty', e.target.value)}
                                                        />
                                                    ) : (
                                                        parseFloat(item.qty).toFixed(2)
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center text-[11px] py-1">
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                        parseFloat(item.qty) < parseFloat(item.original_qty || item.qty) 
                                                        ? "bg-amber-100 text-amber-700" 
                                                        : "bg-green-100 text-green-700"
                                                    }`}>
                                                        {(parseFloat(item.original_qty || item.qty) - parseFloat(item.qty)).toFixed(2)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center text-[11px] text-slate-400 py-2">—</TableCell>
                                                <TableCell className="text-center text-[11px] py-2">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            className="h-7 w-24 text-center text-[11px] mx-auto border-blue-200"
                                                            value={item.rate || ""}
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleItemChange(item.id, 'rate', e.target.value)}
                                                            placeholder="Rate"
                                                        />
                                                    ) : (
                                                        item.rate ? `₹${parseFloat(item.rate).toFixed(2)}` : <span className="text-slate-300">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right text-[11px] font-bold text-slate-800 py-2 px-6">
                                                    {item.rate ? `₹${(parseFloat(item.qty) * parseFloat(item.rate)).toFixed(2)}` : <span className="text-slate-300">—</span>}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Totals & Notes Section */}
                            <div className="flex justify-between items-start mt-6">
                                <div className="flex-1 pr-8 pt-2">
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-xs text-slate-500 mb-1.5 font-semibold uppercase tracking-wider">Internal Note</p>
                                            <div className="text-[11px] text-slate-600 whitespace-pre-wrap bg-slate-50/70 p-4 rounded-md border border-slate-100 italic leading-relaxed">
                                                This is an internal PO Request for materials required for the mentioned project. Pending approval before vendor assignment and final Annexure generation.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-72 space-y-1 bg-white pt-2 shrink-0">
                                    {(() => {
                                        const subTotal = editedItems.reduce((sum, i) => {
                                            const q = parseFloat(i.qty) || 0;
                                            const r = parseFloat(i.rate || '0') || 0;
                                            return sum + q * r;
                                        }, 0);
                                        const sgst = subTotal * 0.09;
                                        const cgst = subTotal * 0.09;
                                        const total = subTotal + sgst + cgst;
                                        const fmt = (v: number) => `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                        const hasRates = editedItems.some(i => parseFloat(i.rate || '0') > 0);
                                        return (
                                            <>
                                                <div className="flex justify-between text-sm py-1">
                                                    <span className="text-slate-600 font-medium">Sub Total</span>
                                                    <span className="text-slate-800">{hasRates ? fmt(subTotal) : <span className="text-slate-400 text-xs italic">Rates TBD</span>}</span>
                                                </div>
                                                <div className="flex justify-between text-sm py-1">
                                                    <span className="text-slate-600">SGST (9%)</span>
                                                    <span className="text-slate-800">{hasRates ? fmt(sgst) : '—'}</span>
                                                </div>
                                                <div className="flex justify-between text-sm py-1">
                                                    <span className="text-slate-600">CGST (9%)</span>
                                                    <span className="text-slate-800">{hasRates ? fmt(cgst) : '—'}</span>
                                                </div>
                                                <div className="flex justify-between text-sm font-semibold py-2 border-t border-slate-300 mt-2">
                                                    <span className="text-slate-800">Total</span>
                                                    <span className="text-slate-900">{hasRates ? fmt(total) : '—'}</span>
                                                </div>
                                                <div className="flex justify-between text-sm font-bold py-2 bg-slate-100 rounded px-2 mt-1">
                                                    <span className="text-slate-800">Balance Due</span>
                                                    <span className="text-slate-900">{hasRates ? fmt(total) : '—'}</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                    <div className="pt-4 space-y-4">
                                        {/* Payment Terms */}
                                        {(isEditing || request.payment_terms || editablePaymentTerms) && (
                                            <div className="mt-4 pt-4 border-t border-slate-100">
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Payment Terms</p>
                                                {isEditing ? (
                                                    <Input 
                                                        className="h-8 text-xs" 
                                                        value={editablePaymentTerms} 
                                                        onChange={(e) => setEditablePaymentTerms(e.target.value)}
                                                        placeholder="e.g. 50% Advance, 50% on Delivery"
                                                    />
                                                ) : (
                                                    <p className="text-xs text-slate-700">{request.payment_terms || editablePaymentTerms}</p>
                                                )}
                                            </div>
                                        )}
                                        {/* Terms and Conditions */}
                                        {(isEditing || request.terms_conditions || editableTermsConditions) && (
                                            <div className="mt-4">
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Terms & Conditions</p>
                                                {isEditing ? (
                                                    <Textarea 
                                                        className="text-xs min-h-[80px]" 
                                                        value={editableTermsConditions} 
                                                        onChange={(e) => setEditableTermsConditions(e.target.value)}
                                                        placeholder="Add any specific terms or conditions..."
                                                    />
                                                ) : (
                                                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{request.terms_conditions || editableTermsConditions}</p>
                                                )}
                                            </div>
                                        )}
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
                </div>
            </div>

            {/* Approval Dialog */}
            <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{approvalAction === "approve" ? "Approve" : "Reject"} Request</DialogTitle>
                        <DialogDescription>
                            {approvalAction === "approve"
                                ? "Confirming approval for this material request."
                                : "Provide a reason for rejecting this material request."}
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
        </Layout>
    );
}
