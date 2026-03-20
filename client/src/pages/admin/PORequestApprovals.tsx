import React, { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Search, ChevronDown, ChevronUp } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@/lib/api";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function PORequestApprovals() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['/api/po-requests', { status: 'pending_approval' }],
        queryFn: async () => {
            const res = await apiFetch('/api/po-requests?status=pending_approval');
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

    const requests = data?.poRequests || [];

    const handleStatusUpdate = async (id: string, status: 'approved' | 'rejected') => {
        try {
            const res = await apiFetch(`/api/po-requests/${id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });

            if (!res.ok) {
                throw new Error("Failed to update status");
            }

            toast({
                title: "Success",
                description: `Annexure Request has been ${status}.`,
            });

            queryClient.invalidateQueries({ queryKey: ['/api/po-requests'] });
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message,
                variant: "destructive"
            });
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    return (
        <Layout>
            <div className="container mx-auto p-4 md:p-6 max-w-[1200px]">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pending Annexure Requests</h1>
                    <p className="text-muted-foreground mt-1">
                        Review and approve internal Annexure requests.
                    </p>
                </div>

                <Card className="shadow-sm border-orange-100">
                    <CardHeader className="bg-orange-50/50 pb-4">
                        <CardTitle className="text-orange-800">Requests Awaiting Approval</CardTitle>
                        <CardDescription>Click to expand a request and view requested items.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {isLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                                <p>No pending Annexure requests at the moment.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50 border-y border-slate-200">
                                            <TableHead className="w-[50px]"></TableHead>
                                            <TableHead className="font-semibold text-slate-900">Requester</TableHead>
                                            <TableHead className="font-semibold text-slate-900">Project</TableHead>
                                            <TableHead className="font-semibold text-slate-900">Department</TableHead>
                                            <TableHead className="font-semibold text-slate-900">Date Issued</TableHead>
                                            <TableHead className="font-semibold text-right text-slate-900">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {requests.map((req: any) => (
                                            <React.Fragment key={req.id}>
                                                <TableRow className="hover:bg-slate-50 border-b border-slate-100 group">
                                                    <TableCell className="text-center p-2">
                                                        <Button variant="ghost" size="icon" onClick={() => toggleExpand(req.id)} className="h-8 w-8 rounded-full hover:bg-slate-200">
                                                            {expandedId === req.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                        </Button>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium text-slate-900">{req.requester_name}</div>
                                                        <div className="text-xs text-slate-500">{req.employee_id}</div>
                                                    </TableCell>
                                                    <TableCell className="font-medium">{req.project_name}</TableCell>
                                                    <TableCell>{req.department || 'N/A'}</TableCell>
                                                    <TableCell className="text-slate-600">
                                                        {format(new Date(req.created_at), "MMM d, yyyy")}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button size="sm" onClick={() => handleStatusUpdate(req.id, 'approved')} className="bg-green-600 hover:bg-green-700 h-8">
                                                                <CheckCircle className="h-4 w-4 mr-1" /> Approve
                                                            </Button>
                                                            <Button size="sm" variant="destructive" onClick={() => handleStatusUpdate(req.id, 'rejected')} className="h-8">
                                                                <XCircle className="h-4 w-4 mr-1" /> Reject
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                                {expandedId === req.id && (
                                                    <TableRow className="bg-slate-50 border-b border-slate-200">
                                                        <TableCell colSpan={6} className="p-4 md:p-6 shadow-inner">
                                                            <div className="bg-white rounded-lg border border-slate-200 p-4 relative">
                                                                <div className="absolute top-0 left-0 w-1 h-full bg-orange-400 rounded-l-lg"></div>
                                                                <h4 className="font-semibold mb-3 text-slate-800 flex items-center gap-2">
                                                                    <Search className="h-4 w-4 text-orange-500" /> Requested Items
                                                                </h4>
                                                                {!requestItemsData || requestItemsData.poRequest.id !== req.id ? (
                                                                    <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                                                                ) : (
                                                                    <div className="border border-slate-100 rounded overflow-hidden">
                                                                        <Table>
                                                                            <TableHeader className="bg-slate-50">
                                                                                <TableRow>
                                                                                    <TableHead className="text-xs">Item Description</TableHead>
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
                                                                                        <TableCell className="text-sm text-slate-500 italic">{item.remarks}</TableCell>
                                                                                    </TableRow>
                                                                                ))}
                                                                            </TableBody>
                                                                        </Table>
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
                        )}
                    </CardContent>
                </Card>
            </div>
        </Layout>
    );
}
