import React from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import apiFetch from "@/lib/api";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function MyPORequests() {
    const [, setLocation] = useLocation();

    const { data, isLoading } = useQuery({
        queryKey: ['/api/po-requests', { view: 'my' }],
        queryFn: async () => {
            const res = await apiFetch('/api/po-requests?view=my');
            if (!res.ok) throw new Error("Failed to load requests");
            return res.json();
        }
    });

    const requests = data?.poRequests || [];

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending_approval':
                return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Pending Approval</Badge>;
            case 'approved':
                return <Badge variant="secondary" className="bg-green-100 text-green-800">Approved</Badge>;
            case 'rejected':
                return <Badge variant="destructive">Rejected</Badge>;
            case 'po_generated':
                return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Annexure Generated</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <Layout>
            <div className="container mx-auto p-4 md:p-6 max-w-[1200px]">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">My PO Requests</h1>
                        <p className="text-muted-foreground mt-1">
                            Track the status of Purchase Order requests you have raised.
                        </p>
                    </div>
                    <Button onClick={() => setLocation('/raise-po-request')} className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="h-4 w-4 mr-2" />
                        Raise New Request
                    </Button>
                </div>

                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle>Recent Requests</CardTitle>
                        <CardDescription>A list of all your submitted Annexure requests.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                                <p>You haven't raised any Annexure requests yet.</p>
                                <Button onClick={() => setLocation('/raise-po-request')} variant="link" className="mt-2 text-indigo-600">
                                    Raise your first request
                                </Button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50">
                                            <TableHead className="font-semibold">Project Name</TableHead>
                                            <TableHead className="font-semibold">Department</TableHead>
                                            <TableHead className="font-semibold text-center">Status</TableHead>
                                            <TableHead className="font-semibold text-right">Date Requested</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {requests.map((req: any) => (
                                            <TableRow key={req.id} className="hover:bg-slate-50 transition-colors">
                                                <TableCell className="font-medium text-slate-900">{req.project_name}</TableCell>
                                                <TableCell className="text-slate-600">{req.department || 'N/A'}</TableCell>
                                                <TableCell className="text-center">{getStatusBadge(req.status)}</TableCell>
                                                <TableCell className="text-right text-sm text-slate-500">
                                                    {format(new Date(req.created_at), "MMM d, yyyy")}
                                                </TableCell>
                                            </TableRow>
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
