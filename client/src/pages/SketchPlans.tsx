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

export default function SketchPlans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestsDialog, setShowRequestsDialog] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

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

  const deletePlan = async (id: string) => {
    if (!confirm("Are you sure you want to delete this plan?")) return;
    try {
      const res = await apiFetch(`/api/sketch-plans/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Success", description: "Plan deleted" });
        loadPlans();
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete plan", variant: "destructive" });
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

  return (
    <Layout>
      <div className="space-y-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full py-20 text-center text-muted-foreground italic">Loading plans...</div>
          ) : plans.length === 0 ? (
            <Card className="col-span-full py-20 border-dashed">
              <CardContent className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">No Sketch Plans Yet</h3>
                  <p className="text-sm text-muted-foreground">Start by creating your first site visit report or requirement plan.</p>
                </div>
                <Button onClick={() => setLocation("/create-sketch-plan")} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  Get Started
                </Button>
              </CardContent>
            </Card>
          ) : (
            plans.map((p) => (
              <Card key={p.id} className="hover:shadow-md transition-shadow group overflow-hidden border-slate-200">
                <CardHeader className="bg-slate-50/50 pb-3 border-b border-slate-100">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-bold group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                      {p.is_locked && <Lock className="w-3.5 h-3.5 text-amber-500" />}
                      {p.name}
                    </CardTitle>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-indigo-600" onClick={() => setLocation(`/edit-sketch-plan/${p.id}`)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-500" onClick={() => deletePlan(p.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>{p.plan_date ? format(new Date(p.plan_date), "PPP") : "No date"}</span>
                  </div>
                  {p.location && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <span>{p.location}</span>
                    </div>
                  )}
                  {p.project_name && (
                    <div className="flex items-center gap-2 text-sm text-indigo-700 font-medium bg-indigo-50 px-2 py-1 rounded">
                      <Layers className="w-4 h-4" />
                      <span className="truncate">{p.project_name}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t mt-2 flex justify-between items-center">
                     <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Plan ID: {p.id.split('-')[1]}</span>
                     <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-slate-600" onClick={() => setLocation(`/edit-sketch-plan/${p.id}`)}>
                        View Details →
                     </Button>
                  </div>
                </CardContent>
              </Card>
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
    </Layout>
  );
}
