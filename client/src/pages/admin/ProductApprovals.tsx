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
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { computeBoq } from "@/lib/boqCalc";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

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
  status: string;
  created_by: string;
  created_at: string;
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
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<ApprovalItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

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
    if (!confirm("Are you sure you want to REJECT this product configuration?")) return;
    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/product-approvals/${id}/reject`, { method: "POST" });
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

  const pendingCount = approvals.filter(a => a.status === "pending").length;

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
                <div className="rounded-xl border shadow-sm overflow-hidden bg-white">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
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
                            <TableCell className="font-bold">{approval.product_name}</TableCell>
                            <TableCell>{approval.config_name || "Default"}</TableCell>
                            <TableCell className="font-bold text-primary">
                              ₹{Number(approval.total_cost || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm">{approval.created_by}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(approval.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
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
                            </TableCell>
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              {approval.status === "pending" && (
                                <div className="flex items-center justify-center gap-2">
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
                                </div>
                              )}
                              {/* Delete always available (admin) */}
                              <div className="mt-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(approval.id)}
                                  disabled={actionLoading === approval.id}
                                  className="h-8 px-3 text-red-600"
                                >
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Expanded Details Row */}
                          {expandedId === approval.id && (
                            <TableRow key={`${approval.id}-details`}>
                              <TableCell colSpan={8} className="bg-slate-50 p-0">
                                <div className="p-4 space-y-4">
                                  {/* Config Summary Bar */}
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    <div className="bg-white rounded-lg border p-3">
                                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Unit Type</p>
                                      <p className="font-bold text-sm">{approval.required_unit_type || "Sqft"}</p>
                                    </div>
                                    <div className="bg-white rounded-lg border p-3">
                                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Basis Qty</p>
                                      <p className="font-bold text-sm">{approval.base_required_qty || "100"}</p>
                                    </div>
                                    <div className="bg-white rounded-lg border p-3">
                                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Wastage %</p>
                                      <p className="font-bold text-sm">{approval.wastage_pct_default || "0"}%</p>
                                    </div>
                                    <div className="bg-white rounded-lg border p-3">
                                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Category</p>
                                      <p className="font-bold text-sm truncate">{approval.category_id || "N/A"}</p>
                                    </div>
                                    <div className="bg-white rounded-lg border p-3">
                                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Subcategory</p>
                                      <p className="font-bold text-sm truncate">{approval.subcategory_id || "N/A"}</p>
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
                                      {/* Build basis for computeBoq using the approval record */}
                                      {(() => {
                                        const selectedApproval = approvals.find(a => a.id === expandedId);
                                        const basis = {
                                          requiredUnitType: (selectedApproval?.required_unit_type as any) || "Sqft",
                                          baseRequiredQty: Number(selectedApproval?.base_required_qty || 100),
                                          wastagePctDefault: Number(selectedApproval?.wastage_pct_default || 0)
                                        };

                                        const materialLines = (expandedItems || []).map((it: any) => ({
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
                                                <TableHead className="w-[70px] font-bold text-center">
                                                  <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px]">Selection</span>
                                                    <Checkbox disabled checked={boqRes.computed.length > 0 && boqRes.computed.every(m => m.applyWastage)} />
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
                                                      <Input value={m.location} disabled className="h-8 border-muted text-[10px] px-2" />
                                                    </TableCell>
                                                    <TableCell className="text-[10px] font-medium">{m.unit}</TableCell>
                                                    <TableCell>
                                                      <div className="flex justify-center">
                                                        <Input value={m.baseQty} disabled className="h-8 border-muted text-[11px] px-2 font-bold w-20 text-center" />
                                                      </div>
                                                    </TableCell>
                                                    <TableCell className="text-[10px] font-bold">₹{((m.supplyRate || 0) + (m.installRate || 0)).toLocaleString()}</TableCell>
                                                    <TableCell className="text-[10px] font-bold">₹{baseAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-center"><Checkbox disabled checked={!!m.applyWastage} /></TableCell>
                                                    <TableCell><Input value={m.wastagePct ?? ''} disabled className="h-8 border-orange-200 text-[10px] px-2 font-bold w-full" /></TableCell>
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
