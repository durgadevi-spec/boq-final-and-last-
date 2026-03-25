import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Copy, ArrowLeft, Layers, FileText, Search } from "lucide-react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";

export default function SketchTemplates() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/sketch-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error("Failed to load templates", err);
      toast({ title: "Error", description: "Failed to load templates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const deleteTemplate = async (action: 'archive' | 'trash') => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch(`/api/sketch-templates/${deleteTarget}?action=${action}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Success", description: action === 'trash' ? "Template moved to Trash" : "Template archived" });
        loadTemplates();
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete template", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const useTemplate = (template: any) => {
    // We'll store the template data in sessionStorage to be picked up by the Create page
    sessionStorage.setItem("sketch_template_data", JSON.stringify(template.template_data));
    setLocation("/create-sketch-plan");
  };

  const filteredTemplates = templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <React.Fragment>
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => setLocation("/sketch-plans")} className="p-0 hover:bg-transparent">
                <ArrowLeft className="w-6 h-6" />
              </Button>
              <h1 className="text-2xl font-bold tracking-tight">Sketch Templates</h1>
            </div>
          </div>

          <Card className="border-slate-200">
             <CardContent className="pt-6">
                <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                   <Input 
                      value={search} 
                      onChange={(e) => setSearch(e.target.value)} 
                      placeholder="Search templates..." 
                      className="pl-10"
                   />
                </div>
             </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full py-10 text-center text-muted-foreground italic">Loading templates...</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="col-span-full py-20 text-center space-y-4 border rounded-lg border-dashed">
                  <Layers className="w-12 h-12 mx-auto text-slate-300" />
                  <p className="text-slate-500">No templates found. Save a plan as a template to see it here.</p>
              </div>
            ) : (
              filteredTemplates.map((t) => (
                <Card key={t.id} className="hover:border-indigo-300 transition-colors shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="truncate">{t.name}</span>
                      <Layers className="w-4 h-4 text-slate-400" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                       <FileText className="w-4 h-4" />
                       <span>{t.template_data?.items?.length || 0} items defined in this template</span>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button onClick={() => useTemplate(t)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                        <Copy className="w-4 h-4" /> Use Template
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => setDeleteTarget(t.id)} className="text-red-500 hover:bg-red-50">
                         <Trash2 className="w-4 h-4" />
                       </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </Layout>
      <DeleteConfirmationDialog
        isOpen={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={(action) => deleteTemplate(action)}
        itemName="sketch template"
      />
    </React.Fragment>
  );
}
