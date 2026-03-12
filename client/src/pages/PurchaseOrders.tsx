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
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Search,
    Plus,
    Filter,
    FileText,
    Calendar,
    Building2,
    IndianRupee,
    ChevronRight,
    Loader2,
    CheckCircle2,
    Clock,
    XCircle,
    Truck,
    Trash2,
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

interface Project {
    id: string;
    name: string;
}

export default function PurchaseOrders() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [projectFilter, setProjectFilter] = useState<string>("all");
    const [deletingPo, setDeletingPo] = useState<PurchaseOrder | null>(null);

    // Bulk Delete State
    const [selectedPoIds, setSelectedPoIds] = useState<Set<string>>(new Set());
    const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
    const [isDeletingBulk, setIsDeletingBulk] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [poRes, projectRes] = await Promise.all([
                apiFetch("/api/purchase-orders"),
                apiFetch("/api/boq-projects")
            ]);

            if (poRes.ok && projectRes.ok) {
                const poData = await poRes.json();
                const projectData = await projectRes.json();
                setPurchaseOrders(poData.purchaseOrders || []);
                setProjects(projectData.projects || []);
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to load purchase orders.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingPo) return;
        try {
            const res = await apiFetch(`/api/purchase-orders/${deletingPo.id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                toast({
                    title: "Deleted",
                    description: `Purchase order ${deletingPo.po_number} has been deleted.`,
                });
                setPurchaseOrders((prev) => prev.filter((po) => po.id !== deletingPo.id));
            } else {
                const data = await res.json();
                toast({
                    title: "Error",
                    description: data.message || "Failed to delete purchase order.",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete purchase order.",
                variant: "destructive",
            });
        } finally {
            setDeletingPo(null);
        }
    };

    const toggleSelectAll = () => {
        if (selectedPoIds.size === filteredPOs.length && filteredPOs.length > 0) {
            setSelectedPoIds(new Set());
        } else {
            setSelectedPoIds(new Set(filteredPOs.map((po) => po.id)));
        }
    };

    const toggleSelectPo = (id: string, e?: React.ChangeEvent) => {
        if(e) e.stopPropagation();
        setSelectedPoIds((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleBulkDelete = async () => {
        setIsDeletingBulk(true);
        try {
            const promises = Array.from(selectedPoIds).map(id => 
                apiFetch(`/api/purchase-orders/${id}`, { method: "DELETE" })
            );
            await Promise.all(promises);
            
            toast({
                title: "Deleted",
                description: `Successfully deleted ${selectedPoIds.size} purchase orders.`,
            });
            
            setPurchaseOrders((prev) => prev.filter((po) => !selectedPoIds.has(po.id)));
            setSelectedPoIds(new Set());
            setShowBulkDeleteDialog(false);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete some purchase orders.",
                variant: "destructive",
            });
        } finally {
            setIsDeletingBulk(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status.toLowerCase()) {
            case "draft":
                return (
                    <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">
                        <Clock size={12} className="mr-1" /> Draft
                    </Badge>
                );
            case "pending_approval":
                return (
                    <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                        <Clock size={12} className="mr-1" /> Pending
                    </Badge>
                );
            case "approved":
                return (
                    <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                        <CheckCircle2 size={12} className="mr-1" /> Approved
                    </Badge>
                );
            case "rejected":
                return (
                    <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                        <XCircle size={12} className="mr-1" /> Rejected
                    </Badge>
                );
            case "ordered":
                return (
                    <Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-200">
                        <FileText size={12} className="mr-1" /> Ordered
                    </Badge>
                );
            case "delivered":
                return (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">
                        <Truck size={12} className="mr-1" /> Delivered
                    </Badge>
                );
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const filteredPOs = purchaseOrders.filter((po) => {
        const matchesSearch =
            po.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (po.project_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
            (po.vendor_name || "").toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === "all" || po.status === statusFilter;
        const matchesProject = projectFilter === "all" || po.project_id === projectFilter;

        return matchesSearch && matchesStatus && matchesProject;
    });

    if (loading) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                    <p className="text-muted-foreground">Loading purchase orders...</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
                        <p className="text-muted-foreground">Manage and track your procurement orders.</p>
                    </div>
                </div>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex flex-wrap gap-4 items-center justify-between">
                            <div className="flex flex-1 min-w-[300px] gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by PO #, project, or vendor..."
                                        className="pl-9 h-9"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-[180px] h-9">
                                        <Filter className="h-4 w-4 mr-2" />
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Statuses</SelectItem>
                                        <SelectItem value="draft">Draft</SelectItem>
                                        <SelectItem value="pending_approval">Pending Approval</SelectItem>
                                        <SelectItem value="approved">Approved</SelectItem>
                                        <SelectItem value="ordered">Ordered</SelectItem>
                                        <SelectItem value="delivered">Delivered</SelectItem>
                                        <SelectItem value="rejected">Rejected</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={projectFilter} onValueChange={setProjectFilter}>
                                    <SelectTrigger className="w-[200px] h-9">
                                        <Building2 className="h-4 w-4 mr-2" />
                                        <SelectValue placeholder="Project" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Projects</SelectItem>
                                        {projects.map((p) => (
                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {selectedPoIds.size > 0 && (
                                    <Button 
                                        variant="destructive" 
                                        onClick={() => setShowBulkDeleteDialog(true)}
                                        className="h-9 ml-2"
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete Selected ({selectedPoIds.size})
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border border-slate-200 overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="w-12 text-center border-r">
                                            <input 
                                                type="checkbox" 
                                                className="w-4 h-4 rounded border-gray-300 align-middle"
                                                checked={filteredPOs.length > 0 && selectedPoIds.size === filteredPOs.length}
                                                onChange={toggleSelectAll}
                                            />
                                        </TableHead>
                                        <TableHead className="font-bold">PO Number</TableHead>
                                        <TableHead className="font-bold">Project</TableHead>
                                        <TableHead className="font-bold">Vendor</TableHead>
                                        <TableHead className="font-bold text-right">Amount</TableHead>
                                        <TableHead className="font-bold">Status</TableHead>
                                        <TableHead className="font-bold">Date</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredPOs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                                No purchase orders found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredPOs.map((po) => (
                                            <TableRow key={po.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setLocation(`/purchase-orders/${po.id}`)}>
                                                <TableCell className="text-center border-r" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                        type="checkbox" 
                                                        className="w-4 h-4 rounded border-gray-300 align-middle"
                                                        checked={selectedPoIds.has(po.id)}
                                                        onChange={(e) => toggleSelectPo(po.id, e)}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-bold text-primary">{po.po_number}</TableCell>
                                                <TableCell className="font-medium">{po.project_name || "N/A"}</TableCell>
                                                <TableCell>{po.vendor_name || "N/A"}</TableCell>
                                                <TableCell className="text-right font-bold text-green-700">
                                                    ₹{parseFloat(po.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell>{getStatusBadge(po.status)}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {new Date(po.created_at).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setDeletingPo(po);
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                            <ChevronRight className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deletingPo} onOpenChange={(open) => { if (!open) setDeletingPo(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Purchase Order</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete <strong>{deletingPo?.po_number}</strong>? This will permanently remove the purchase order and all its items. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={handleDelete}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Bulk Delete Confirmation Dialog */}
            <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Multiple Purchase Orders</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete <strong>{selectedPoIds.size}</strong> purchase orders? This will permanently remove the orders and all their associated items. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingBulk}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={handleBulkDelete}
                            disabled={isDeletingBulk}
                        >
                            {isDeletingBulk ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Delete {selectedPoIds.size} Orders
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Layout>
    );
}
