import { useEffect, useState } from "react";
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
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Edit, Save, RotateCcw } from "lucide-react";
import apiFetch from "@/lib/api";
import { useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { computeBoq } from "@/lib/boqCalc";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useData } from "@/lib/store";

type Approval = {
  id: string;
  product_id: string;
  product_name: string;
  config_name: string;
  category_id: string;
  subcategory_id: string;
  total_cost: string;
  required_unit_type: string;
  base_required_qty: string;
  wastage_pct_default: string;
  dim_a: string | null;
  dim_b: string | null;
  dim_c: string | null;
  description: string | null;
  rejection_reason: string | null;
  status: string;
  created_by: string;
  created_at: string;
  submission_count?: number;
};

type ApprovalItem = {
  id: string;
  material_name: string;
  unit: string;
  qty: string;
  rate: string;
  supply_rate: string;
  install_rate: string;
  location: string;
  amount: string;
  base_qty: string;
  wastage_pct: string;
  apply_wastage: boolean;
  shop_name: string;
};

export default function ProductApprovals() {
  const [, setLocation] = useLocation();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<ApprovalItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editApproval, setEditApproval] = useState<Approval | null>(null);
  const [editItems, setEditItems] = useState<ApprovalItem[]>([]);
  const { toast } = useToast();
  const { user } = useData();

  const isViewOnly = user?.role === "product_manager";

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/product-approvals");
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals || []);
      }
    } catch (err) {
      console.error("Failed to load approvals:", err);
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
      const res = await apiFetch(`/api/product-approvals/${id}`);
      if (res.ok) {
        const data = await res.json();
        setExpandedItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to load items:", err);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleStartEdit = (approval: Approval) => {
    setIsEditing(approval.id);
    setEditApproval({ ...approval });
    setEditItems([...expandedItems]);
    if (expandedId !== approval.id) {
      setExpandedId(approval.id);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(null);
    setEditApproval(null);
    setEditItems([]);
  };

  const handleHeaderChange = (field: keyof Approval, value: any) => {
    if (!editApproval) return;
    setEditApproval({ ...editApproval, [field]: value });
  };

  const handleItemChange = (index: number, field: keyof ApprovalItem, value: any) => {
    const newItems = [...editItems];
    (newItems[index] as any)[field] = value;
    setEditItems(newItems);
  };

  const handleSave = async () => {
    if (!isEditing || !editApproval) return;
    setActionLoading(isEditing);
    try {
      // Recompute total cost
      const basis = {
        requiredUnitType: (editApproval.required_unit_type as any) || "Sqft",
        baseRequiredQty: Number(editApproval.base_required_qty || 100),
        wastagePctDefault: Number(editApproval.wastage_pct_default || 0)
      };
      const materialLines = editItems.map(it => ({
        id: it.id,
        name: it.material_name,
        unit: it.unit,
        location: it.location,
        baseQty: Number(it.base_qty || 0),
        wastagePct: it.wastage_pct !== undefined ? Number(it.wastage_pct) : undefined,
        supplyRate: Number(it.supply_rate || 0),
        installRate: Number(it.install_rate || 0),
        applyWastage: Boolean(it.apply_wastage),
        shop_name: it.shop_name
      }));
      const boqRes = computeBoq(basis, materialLines, basis.baseRequiredQty);
      
      const res = await apiFetch(`/api/product-approvals/${isEditing}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configName: editApproval.config_name,
          totalCost: boqRes.grandTotal.toString(),
          requiredUnitType: editApproval.required_unit_type,
          baseRequiredQty: editApproval.base_required_qty,
          wastagePctDefault: editApproval.wastage_pct_default,
          description: editApproval.description,
          items: editItems.map((it, idx) => ({
            ...it,
            qty: boqRes.computed[idx].roundOffQty.toString(), // Final total qty
            amount: boqRes.computed[idx].lineTotal.toString()
          }))
        })
      });

      if (res.ok) {
        toast({ title: "Updated", description: "Changes saved successfully." });
        setIsEditing(null);
        fetchApprovals();
        // Refresh items for the expanded view
        const itemsRes = await apiFetch(`/api/product-approvals/${isEditing}`);
        if (itemsRes.ok) {
          const data = await itemsRes.json();
          setExpandedItems(data.items || []);
        }
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to save changes", variant: "destructive" });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (id: string) => {
    if (!confirm("Are you sure you want to APPROVE this product configuration? It will be saved and available in Create BOM.")) return;
    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/product-approvals/${id}/approve`, { method: "POST" });
      if (res.ok) {
        toast({ title: "Approved", description: "Product configuration approved and saved successfully." });
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

  const handleReject = async (id: string) => {
    const reason = prompt("Please enter a reason for rejection:");
    if (reason === null) return; // User cancelled
    if (!reason.trim()) {
      toast({ title: "Reason Required", description: "You must provide a reason for rejection.", variant: "destructive" });
      return;
    }

    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/product-approvals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejection_reason: reason.trim() })
      });
      if (res.ok) {
        toast({ title: "Rejected", description: "Product configuration has been rejected." });
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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to DELETE this product approval request? This action cannot be undone.")) return;
    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/product-approvals/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Deleted", description: "Approval request deleted." });
        fetchApprovals();
        setExpandedId(null);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Error", description: data.message || "Failed to delete", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSelect = (id: string, checked?: boolean) => {
    setSelectedIds(prev => {
      const exists = prev.includes(id);
      if (checked === true) {
        if (!exists) return [...prev, id];
        return prev;
      }
      if (checked === false) {
        return prev.filter(x => x !== id);
      }
      // toggle
      return exists ? prev.filter(x => x !== id) : [...prev, id];
    });
  };

  const toggleSelectAll = (checked?: boolean) => {
    if (checked === false) {
      setSelectedIds([]);
      return;
    }
    // select all ids currently shown
    const ids = approvals.map(a => a.id);
    setSelectedIds(ids);
  };

  const bulkApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Approve ${selectedIds.length} selected configuration(s)?`)) return;
    setActionLoading("bulk");
    try {
      for (const id of selectedIds) {
        // sequential to avoid server overload and to surface errors
        const res = await apiFetch(`/api/product-approvals/${id}/approve`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Failed to approve ${id}`);
        }
      }
      toast({ title: "Approved", description: `${selectedIds.length} configuration(s) approved.` });
      setSelectedIds([]);
      fetchApprovals();
      setExpandedId(null);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Bulk approve failed", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const bulkReject = async () => {
    if (selectedIds.length === 0) return;
    const reason = prompt(`Enter a rejection reason to apply to ${selectedIds.length} selected item(s):`);
    if (reason === null) return;
    if (!reason.trim()) {
      toast({ title: "Reason Required", description: "You must provide a reason for rejection.", variant: "destructive" });
      return;
    }
    if (!confirm(`Reject ${selectedIds.length} selected configuration(s)?`)) return;
    setActionLoading("bulk");
    try {
      for (const id of selectedIds) {
        const res = await apiFetch(`/api/product-approvals/${id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rejection_reason: reason.trim() })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Failed to reject ${id}`);
        }
      }
      toast({ title: "Rejected", description: `${selectedIds.length} configuration(s) rejected.` });
      setSelectedIds([]);
      fetchApprovals();
      setExpandedId(null);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Bulk reject failed", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} selected request(s)? This action cannot be undone.`)) return;
    setActionLoading("bulk");
    try {
      for (const id of selectedIds) {
        const res = await apiFetch(`/api/product-approvals/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Failed to delete ${id}`);
        }
      }
      toast({ title: "Deleted", description: `${selectedIds.length} request(s) deleted.` });
      setSelectedIds([]);
      fetchApprovals();
      setExpandedId(null);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Bulk delete failed", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const pendingApprovals = approvals.filter(a => a.status === "pending");
  const pendingCount = pendingApprovals.filter(a => a.status === "pending").length;

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4">
        <Card className="max-w-6xl mx-auto shadow-xl border-none">
          <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 border-b pb-6">
            <CardTitle className="flex items-center justify-between">
              <span className="text-2xl font-extrabold tracking-tight">Product Approvals</span>
              {pendingCount > 0 && (
                <Badge variant="destructive" className="text-sm px-3 py-1">
                  {pendingCount} Pending
                </Badge>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Review and approve product configurations submitted by users before they become available in Create BOM.
            </p>
          </CardHeader>

          <CardContent className="p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground font-medium">Loading approval requests...</p>
              </div>
            ) : approvals.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground italic text-lg">
                No approval requests found.
              </div>
            ) : (
              <div className="space-y-0">
                {/* Bulk action bar */}
                {!isViewOnly && selectedIds.length > 0 && (
                  <div className="flex items-center gap-3 mb-4">
                    <div className="text-sm font-bold">{selectedIds.length} selected</div>
                    <Button size="sm" onClick={bulkApprove} disabled={actionLoading != null} className="bg-green-600 hover:bg-green-700 text-white h-8 px-3">Approve Selected</Button>
                    <Button size="sm" variant="destructive" onClick={bulkReject} disabled={actionLoading != null} className="h-8 px-3">Reject Selected</Button>
                    <Button size="sm" variant="outline" onClick={bulkDelete} disabled={actionLoading != null} className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">Delete Selected</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} disabled={actionLoading != null} className="h-8 px-3">Clear</Button>
                  </div>
                )}
                <div className="rounded-xl border shadow-sm overflow-hidden bg-white">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead className="w-[40px]">
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={approvals.length > 0 && selectedIds.length === approvals.length}
                              onCheckedChange={(v) => toggleSelectAll(v as boolean)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </TableHead>
                        <TableHead className="font-bold">Product</TableHead>
                        <TableHead className="font-bold">Config Name</TableHead>
                        <TableHead className="font-bold">Total Cost</TableHead>
                        <TableHead className="font-bold">Submitted By</TableHead>
                        <TableHead className="font-bold">Date</TableHead>
                        <TableHead className="font-bold">Status</TableHead>
                        <TableHead className="font-bold text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {approvals.map((approval) => (
                        <>
                          <TableRow
                            key={approval.id}
                            className="hover:bg-muted/10 cursor-pointer transition-colors"
                            onClick={() => toggleExpand(approval.id)}
                          >
                            <TableCell>
                              {expandedId === approval.id ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.includes(approval.id)}
                                onCheckedChange={(v) => toggleSelect(approval.id, v as boolean)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </TableCell>
                            <TableCell className="font-bold">
                              <div className="flex flex-col gap-1">
                                <span>{approval.product_name}</span>
                                {approval.submission_count && Number(approval.submission_count) > 1 && (
                                  <Badge variant="outline" className="text-[9px] w-fit py-0 px-1.5 border-orange-200 text-orange-600 bg-orange-50 font-medium">
                                    Resubmitted ({approval.submission_count})
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{approval.config_name || "Default"}</TableCell>
                            <TableCell className="font-bold text-primary">
                              ₹{Number(approval.total_cost || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm">{approval.created_by}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(approval.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge
                                  variant={
                                    approval.status === "approved"
                                      ? "default"
                                      : approval.status === "rejected"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                  className={
                                    approval.status === "approved"
                                      ? "bg-green-100 text-green-800 hover:bg-green-100"
                                      : approval.status === "rejected"
                                        ? "bg-red-100 text-red-800 hover:bg-red-100"
                                        : "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
                                  }
                                >
                                  {approval.status.toUpperCase()}
                                </Badge>
                                {approval.status === "rejected" && approval.rejection_reason && (
                                  <span className="text-[10px] text-red-600 font-medium max-w-[150px] truncate" title={approval.rejection_reason}>
                                    Reason: {approval.rejection_reason}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-2">
                                {!isViewOnly && approval.status === "pending" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 px-3 border-primary text-primary hover:bg-primary/10"
                                      onClick={() => handleStartEdit(approval)}
                                      disabled={isEditing === approval.id}
                                    >
                                      <Edit className="h-3 w-3 mr-1" /> Edit Configuration
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => handleApprove(approval.id)}
                                      disabled={actionLoading === approval.id}
                                      className="bg-green-600 hover:bg-green-700 text-white h-8 px-3"
                                    >
                                      {actionLoading === approval.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <><CheckCircle2 className="h-3 w-3 mr-1" /> Approve</>
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleReject(approval.id)}
                                      disabled={actionLoading === approval.id}
                                      className="h-8 px-3"
                                    >
                                      <XCircle className="h-3 w-3 mr-1" /> Reject
                                    </Button>
                                  </>
                                )}
                                {!isViewOnly && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDelete(approval.id)}
                                    disabled={actionLoading === approval.id}
                                    className="h-8 px-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    Delete
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Expanded Details Row */}
                          {expandedId === approval.id && (
                            <TableRow key={`${approval.id}-details`}>
                              <TableCell colSpan={8} className="bg-slate-50 p-0">
                                <div className="p-4 space-y-4">
                                  {/* Config Summary Bar */}
                                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                    <div className="bg-white rounded-lg border p-3">
                                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Unit Type</p>
                                      {isEditing === approval.id ? (
                                        <Select 
                                          value={editApproval?.required_unit_type} 
                                          onValueChange={(v) => handleHeaderChange("required_unit_type", v)}
                                        >
                                          <SelectTrigger className="h-7 text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="Sqft">Sqft</SelectItem>
                                            <SelectItem value="Rft">Rft</SelectItem>
                                            <SelectItem value="Nos">Nos</SelectItem>
                                            <SelectItem value="Kg">Kg</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <p className="font-bold text-sm">{approval.required_unit_type || "Sqft"}</p>
                                      )}
                                    </div>
                                    <div className="bg-white rounded-lg border p-3">
                                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Basis Qty</p>
                                      {isEditing === approval.id ? (
                                        <Input 
                                          type="number" 
                                          value={editApproval?.base_required_qty} 
                                          onChange={(e) => handleHeaderChange("base_required_qty", e.target.value)}
                                          className="h-7 text-xs"
                                        />
                                      ) : (
                                        <p className="font-bold text-sm">{approval.base_required_qty || "100"}</p>
                                      )}
                                    </div>
                                    <div className="bg-white rounded-lg border p-3">
                                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Wastage %</p>
                                      {isEditing === approval.id ? (
                                        <Input 
                                          type="number" 
                                          value={editApproval?.wastage_pct_default} 
                                          onChange={(e) => handleHeaderChange("wastage_pct_default", e.target.value)}
                                          className="h-7 text-xs"
                                        />
                                      ) : (
                                        <p className="font-bold text-sm">{approval.wastage_pct_default || "0"}%</p>
                                      )}
                                    </div>
                                    <div className="bg-white rounded-lg border p-3">
                                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Category</p>
                                      <p className="font-bold text-sm truncate">{approval.category_id || "N/A"}</p>
                                    </div>
                                    <div className="bg-white rounded-lg border p-3">
                                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Subcategory</p>
                                      <p className="font-bold text-sm truncate">{approval.subcategory_id || "N/A"}</p>
                                    </div>
                                    <div className="flex items-end pb-1">
                                      {isEditing === approval.id && (
                                        <div className="flex gap-2 w-full">
                                          <Button size="sm" className="flex-1 h-9 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={actionLoading === approval.id}>
                                            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
                                          </Button>
                                          <Button size="sm" variant="outline" className="h-9" onClick={handleCancelEdit}>
                                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Cancel
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {approval.description && (
                                    <div className="bg-white rounded-lg border p-3">
                                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Description</p>
                                      <p className="text-sm">{approval.description}</p>
                                    </div>
                                  )}

                                  {/* Items Table (Match Manage Product Step 3 layout & calculations) */}
                                  {loadingItems ? (
                                    <div className="flex items-center justify-center py-8">
                                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    </div>
                                  ) : (
                                    <div className="rounded-lg border overflow-hidden bg-white">
                                      {/* Build basis for computeBoq using the current state */}
                                      {(() => {
                                        const basis = isEditing === approval.id && editApproval ? {
                                          requiredUnitType: (editApproval.required_unit_type as any) || "Sqft",
                                          baseRequiredQty: Number(editApproval.base_required_qty || 100),
                                          wastagePctDefault: Number(editApproval.wastage_pct_default || 0)
                                        } : {
                                          requiredUnitType: (approval.required_unit_type as any) || "Sqft",
                                          baseRequiredQty: Number(approval.base_required_qty || 100),
                                          wastagePctDefault: Number(approval.wastage_pct_default || 0)
                                        };

                                        const currentItems = isEditing === approval.id ? editItems : (expandedItems || []);

                                        const materialLines = currentItems.map((it: any) => ({
                                          id: it.id || it.material_id,
                                          name: it.material_name || it.name,
                                          unit: it.unit,
                                          location: it.location || "Main Area",
                                          baseQty: Number(it.base_qty ?? it.qty ?? 0),
                                          wastagePct: it.wastage_pct !== undefined && it.wastage_pct !== null ? Number(it.wastage_pct) : undefined,
                                          supplyRate: Number(it.supply_rate ?? it.rate ?? 0),
                                          installRate: Number(it.install_rate ?? it.installRate ?? 0),
                                          applyWastage: it.apply_wastage !== undefined ? Boolean(it.apply_wastage) : (it.applyWastage !== undefined ? Boolean(it.applyWastage) : true),
                                          shop_name: it.shop_name
                                        }));

                                        const boqRes = computeBoq(basis, materialLines, basis.baseRequiredQty);

                                        return (
                                          <Table>
                                            <TableHeader className="bg-muted/30">
                                              <TableRow>
                                                <TableHead className="w-[40px] font-bold">Sl</TableHead>
                                                <TableHead className="font-bold py-4">Item</TableHead>
                                                <TableHead className="w-[100px] font-bold">Shop</TableHead>
                                                <TableHead className="w-[120px] font-bold">Description</TableHead>
                                                <TableHead className="w-[60px] font-bold">Unit</TableHead>
                                                <TableHead className="w-[100px] font-bold">Qty</TableHead>
                                                <TableHead className="w-[100px] font-bold">Rate</TableHead>
                                                <TableHead className="w-[110px] font-bold">Base Amount</TableHead>
                                                <TableHead className="w-[80px] font-bold text-center">
                                                  <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px]">Wastage</span>
                                                    <Checkbox 
                                                      disabled={isEditing !== approval.id} 
                                                      checked={boqRes.computed.length > 0 && boqRes.computed.every(m => m.applyWastage)}
                                                      onCheckedChange={(checked) => {
                                                        if (isEditing === approval.id) {
                                                          const newItems = editItems.map(it => ({ ...it, apply_wastage: !!checked }));
                                                          setEditItems(newItems);
                                                        }
                                                      }}
                                                    />
                                                    <span className="text-[9px] font-normal">All</span>
                                                  </div>
                                                </TableHead>
                                                <TableHead className="w-[80px] font-bold">Wastage %</TableHead>
                                                <TableHead className="w-[80px] font-bold">Wastage Qty</TableHead>
                                                <TableHead className="w-[90px] font-bold">Total Qty</TableHead>
                                                <TableHead className="w-[90px] font-bold">Final Amount</TableHead>
                                                <TableHead className="w-[90px] font-bold">Per {basis.requiredUnitType} Qty</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {boqRes.computed.map((m, idx) => {
                                                const baseAmt = (m.baseQty || 0) * ((m.supplyRate || 0) + (m.installRate || 0));
                                                return (
                                                  <TableRow key={m.id} className="hover:bg-muted/5 text-[11px]">
                                                    <TableCell className="text-center font-medium">{idx + 1}</TableCell>
                                                    <TableCell className="font-semibold">{m.name}</TableCell>
                                                    <TableCell>{m.shop_name || "N/A"}</TableCell>
                                                    <TableCell>
                                                      <Input 
                                                        value={isEditing === approval.id ? (editItems[idx].location || "") : m.location} 
                                                        onChange={(e) => handleItemChange(idx, "location", e.target.value)}
                                                        disabled={isEditing !== approval.id} 
                                                        className="h-8 border-muted text-[10px] px-2" 
                                                      />
                                                    </TableCell>
                                                    <TableCell className="text-[10px] font-medium">{m.unit}</TableCell>
                                                    <TableCell>
                                                      <div className="flex justify-center">
                                                        <Input 
                                                          type="number"
                                                          value={isEditing === approval.id ? editItems[idx].base_qty : m.baseQty} 
                                                          onChange={(e) => handleItemChange(idx, "base_qty", e.target.value)}
                                                          disabled={isEditing !== approval.id} 
                                                          className="h-8 border-muted text-[11px] px-2 font-bold w-20 text-center" 
                                                        />
                                                      </div>
                                                    </TableCell>
                                                    <TableCell className="text-[10px] font-bold">
                                                      {isEditing === approval.id ? (
                                                        <div className="flex flex-col gap-1">
                                                          <Input 
                                                            type="number" 
                                                            placeholder="Supply" 
                                                            value={editItems[idx].supply_rate} 
                                                            onChange={(e) => handleItemChange(idx, "supply_rate", e.target.value)}
                                                            className="h-7 text-[10px] px-1 w-16"
                                                          />
                                                          <Input 
                                                            type="number" 
                                                            placeholder="Install" 
                                                            value={editItems[idx].install_rate} 
                                                            onChange={(e) => handleItemChange(idx, "install_rate", e.target.value)}
                                                            className="h-7 text-[10px] px-1 w-16"
                                                          />
                                                        </div>
                                                      ) : (
                                                        `₹${((m.supplyRate || 0) + (m.installRate || 0)).toLocaleString()}`
                                                      )}
                                                    </TableCell>
                                                    <TableCell className="text-[10px] font-bold">₹{baseAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-center">
                                                      <Checkbox 
                                                        disabled={isEditing !== approval.id} 
                                                        checked={!!m.applyWastage} 
                                                        onCheckedChange={(checked) => handleItemChange(idx, "apply_wastage", !!checked)}
                                                      />
                                                    </TableCell>
                                                    <TableCell>
                                                      <Input 
                                                        type="number"
                                                        value={isEditing === approval.id ? (editItems[idx].wastage_pct ?? '') : (m.wastagePct ?? '')} 
                                                        onChange={(e) => handleItemChange(idx, "wastage_pct", e.target.value)}
                                                        disabled={isEditing !== approval.id} 
                                                        className="h-8 border-orange-200 text-[10px] px-2 font-bold w-full" 
                                                      />
                                                    </TableCell>
                                                    <TableCell className="text-[10px] font-bold text-orange-600">{m.wastageQty.toFixed(2)}</TableCell>
                                                    <TableCell className="text-[10px] font-bold">{m.roundOffQty.toFixed(2)}</TableCell>
                                                    <TableCell className="text-[10px] font-bold text-blue-600">₹{m.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-[10px] font-bold text-primary">{m.perUnitQty.toFixed(4)}</TableCell>
                                                  </TableRow>
                                                );
                                              })}
                                              <TableRow className="bg-muted/20 font-black">
                                                <TableCell colSpan={8} className="text-right py-3 pr-4">Total (Incl. Wastage)</TableCell>
                                                <TableCell className="text-[11px] text-primary">₹{boqRes.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                <TableCell colSpan={5}></TableCell>
                                              </TableRow>
                                            </TableBody>
                                          </Table>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

