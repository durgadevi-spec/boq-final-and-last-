import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2, FileText, Calendar, MapPin, Layers, Lock, AlertCircle, Check, X } from "lucide-react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";

export default function SketchPlans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [planSearch, setPlanSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showRequestsDialog, setShowRequestsDialog] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string; name: string } | null>(null);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/sketch-plans");
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error("Failed to load sketch plans", err);
      toast({ title: "Error", description: "Failed to load sketch plans", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const deletePlan = (id: string) => {
    const plan = plans.find(p => p.id === id);
    if (!plan) return;
    setDeleteConfirm({
      isOpen: true,
      id: id,
      name: plan.name || "Sketch Plan"
    });
  };

  const confirmDelete = async (action: 'archive' | 'trash') => {
    if (!deleteConfirm) return;
    try {
      const res = await apiFetch(`/api/sketch-plans/${deleteConfirm.id}?action=${action}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: action === 'trash' ? "Plan moved to trash" : "Plan archived" });
        loadPlans();
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete plan", variant: "destructive" });
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleEditRequest = async (planId: string, action: 'approve' | 'reject') => {
    try {
      const res = await apiFetch(`/api/sketch-plans/${planId}/handle-unlock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        toast({ title: "Success", description: `Edit request ${action}d successfully` });
        loadPlans();
        if (pendingRequests.length <= 1) {
          setShowRequestsDialog(false);
        }
      } else {
        toast({ title: "Error", description: `Failed to ${action} request`, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Error handling request", variant: "destructive" });
    }
  };

  const pendingRequests = plans.filter(p => p.is_locked && p.request_status === 'pending');
  const isAdmin = user?.role === 'admin';

  const filteredPlans = plans.filter((p) => {
    const search = planSearch.trim().toLowerCase();
    if (!search) return true;
    return [
      p.name,
      p.location,
      p.project_name,
      p.plan_date,
      p.id
    ].some((value) => String(value || "").toLowerCase().includes(search));
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-3xl">📐</span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Sketch a Plan</h1>
                <p className="text-muted-foreground">Capture and manage site requirements and sketches</p>
              </div>
            </div>
            <div className="flex gap-2">
              {isAdmin && pendingRequests.length > 0 && (
                <Button variant="outline" className="relative flex items-center gap-2 border-amber-500 text-amber-600 hover:bg-amber-50" onClick={() => setShowRequestsDialog(true)}>
                  <AlertCircle className="w-4 h-4" /> Edit Requests
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 ml-1">{pendingRequests.length}</Badge>
                </Button>
              )}
              <Button variant="outline" onClick={() => setLocation("/sketch-templates")} className="flex items-center gap-2">
                <Layers className="w-4 h-4" /> Manage Templates
              </Button>
              <Button onClick={() => setLocation("/create-sketch-plan")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="w-4 h-4" /> Create New Plan
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={planSearch}
              onChange={(e) => setPlanSearch(e.target.value)}
              placeholder="Search plans by name, location, project, or ID..."
              className="w-full md:w-80 h-10 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="py-20 text-center text-muted-foreground italic">Loading plans...</div>
          ) : filteredPlans.length === 0 ? (
            <div className="py-20 border border-dashed rounded-xl text-center text-muted-foreground">No matching plans found.</div>
          ) : (
            filteredPlans.map((p) => (
              <div key={p.id} className="p-3 border rounded-lg shadow-sm hover:shadow-md transition-shadow bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-900 truncate">{p.name}</p>
                    <p className="text-[12px] text-blue-600 mt-0.5 font-semibold">Plan ID: {p.id.split('-')[1]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-7" onClick={() => setLocation(`/edit-sketch-plan/${p.id}`)}>Open</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-red-500" onClick={() => deletePlan(p.id)}>Delete</Button>
                  </div>
                </div>
                <div className="mt-2 text-[12px] text-slate-600 flex flex-wrap gap-2">
                  <span className="font-medium text-indigo-600">{p.project_name || 'No project'}</span>
                  <span className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded">{p.location || 'No location'}</span>
                  <span className="px-1 py-0.5 bg-cyan-100 text-cyan-700 rounded">{p.plan_date ? format(new Date(p.plan_date), 'dd/MM/yyyy') : 'No date'}</span>
                  {p.is_locked && <span className="px-1 py-0.5 bg-amber-100 text-amber-700 rounded">Locked</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={showRequestsDialog} onOpenChange={setShowRequestsDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Pending Edit Requests</DialogTitle>
            <DialogDescription>Review and approve edit requests for locked sketch plans.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No pending requests at this time.</p>
            ) : (
              pendingRequests.map(req => (
                <Card key={req.id} className="border-amber-200 bg-amber-50/50">
                  <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2 tracking-tight">
                        <Lock className="w-4 h-4 text-amber-500" />
                        {req.name}
                      </CardTitle>
                      {req.project_name && <p className="text-xs text-muted-foreground mt-0.5 font-medium">Project: {req.project_name}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 h-8" onClick={() => handleEditRequest(req.id, 'reject')}>
                        <X className="w-4 h-4 mr-1" /> Reject
                      </Button>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-8" onClick={() => handleEditRequest(req.id, 'approve')}>
                        <Check className="w-4 h-4 mr-1" /> Approve
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {deleteConfirm && (
        <DeleteConfirmationDialog
          isOpen={!!deleteConfirm}
          onOpenChange={(open) => !open && setDeleteConfirm(null)}
          onConfirm={confirmDelete}
          itemName={deleteConfirm.name}
          title="Delete Sketch Plan?"
        />
      )}
    </Layout>
  );
}
