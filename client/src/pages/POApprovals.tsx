import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
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
    CheckCircle2,
    XCircle,
    Loader2,
    Eye,
    Building2,
    Truck,
    IndianRupee,
    Clock,
} from "lucide-react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PurchaseOrder {
    id: string;
    po_number: string;
    project_id: string;
    vendor_id: string;
    status: string;
    total_amount: string;
    created_at: string;
    project_name?: string;
    vendor_name?: string;
}

export default function POApprovals() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [approvals, setApprovals] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [showApprovalDialog, setShowApprovalDialog] = useState(false);
    const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
    const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
    const [comment, setComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchApprovals();
    }, []);

    const fetchApprovals = async () => {
        try {
            setLoading(true);
            const res = await apiFetch("/api/purchase-orders?status=pending_approval");
            if (res.ok) {
                const data = await res.json();
                setApprovals(data.purchaseOrders || []);
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to load pending approvals.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleApproval = async () => {
        if (!selectedPO) return;
        setIsSubmitting(true);
        try {
            const res = await apiFetch(`/api/purchase-orders/${selectedPO.id}/approve`, {
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
                    description: `Annexure ${selectedPO.po_number} has been ${approvalAction === "approve" ? "approved" : "rejected"}.`,
                });
                setShowApprovalDialog(false);
                setComment("");
                fetchApprovals();
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to process approval", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                    <p className="text-muted-foreground">Loading pending approvals...</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Annexure Approvals</h1>
                    <p className="text-muted-foreground">Review and act on Annexures awaiting approval.</p>
                </div>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="bg-slate-50/50 border-b">
                        <CardTitle className="text-lg font-semibold">Pending Requests ({approvals.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="font-bold">Annexure No.</TableHead>
                                    <TableHead className="font-bold">Project</TableHead>
                                    <TableHead className="font-bold">Vendor</TableHead>
                                    <TableHead className="font-bold text-right">Amount</TableHead>
                                    <TableHead className="font-bold">Date</TableHead>
                                    <TableHead className="text-right font-bold w-[280px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {approvals.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground italic">
                                            No pending Annexure approvals.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    approvals.map((po) => (
                                        <TableRow key={po.id} className="hover:bg-slate-50/50">
                                            <TableCell className="font-bold text-primary">{po.po_number}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="h-4 w-4 text-slate-400" />
                                                    <span className="font-medium">{po.project_name || "N/A"}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Truck className="h-4 w-4 text-slate-400" />
                                                    <span>{po.vendor_name || "N/A"}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-green-700">
                                                ₹{parseFloat(po.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                <div className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {new Date(po.created_at).toLocaleDateString()}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => setLocation(`/purchase-orders/${po.id}?mode=approval`)}>
                                                        <Eye className="h-4 w-4 mr-1" /> View
                                                    </Button>
                                                    <Button variant="outline" size="sm" className="border-red-600 text-red-600 hover:bg-red-50" onClick={() => { setSelectedPO(po); setApprovalAction("reject"); setShowApprovalDialog(true); }}>
                                                        <XCircle className="h-4 w-4 mr-1" /> Reject
                                                    </Button>
                                                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { setSelectedPO(po); setApprovalAction("approve"); setShowApprovalDialog(true); }}>
                                                        <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* Approval Dialog */}
            <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{approvalAction === "approve" ? "Approve Annexure" : "Reject Annexure"}</DialogTitle>
                        <DialogDescription>
                            {approvalAction === "approve"
                                ? `Confirming approval for Annexure No. ${selectedPO?.po_number}.`
                                : `Please provide a reason for rejecting Annexure No. ${selectedPO?.po_number}.`}
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
