import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, ArrowLeft, Camera, Pencil, Layers, X, GripVertical, FileText, Search, MessageSquare, Image as ImageIcon } from "lucide-react";
import { SketchPad } from "@/components/SketchPad";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface PlanItem {
  id: string;
  material_id?: string;
  item_name: string;
  description: string; // Used as Notes
  length: string;
  width: string;
  height: string;
  qty: string;
  unit: string;
  dimension_unit: "feet" | "mm";
  remarks: string;
  images: string[]; // item-level images (base64)
}

export default function CreateSketchPlan() {
  const { id } = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditing = !!id;

  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [locationStr, setLocationStr] = useState("");
  const [planDate, setPlanDate] = useState(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState<PlanItem[]>([
    { id: "1", item_name: "", description: "", length: "", width: "", height: "", qty: "1", unit: "Nos", dimension_unit: "feet", remarks: "", images: [] }
  ]);
  
  const [projects, setProjects] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [planImages, setPlanImages] = useState<string[]>([]);
  const [sketchTarget, setSketchTarget] = useState<string>("main"); // "main" or row id/index
  const [openPopoverIdx, setOpenPopoverIdx] = useState<number | null>(null);
  
  // Material search state
  const [materialSearch, setMaterialSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const projectsRes = await apiFetch("/api/boq-projects");
        if (projectsRes.ok) {
          const data = await projectsRes.json();
          setProjects(data.projects || []);
        }

        if (isEditing) {
          const planRes = await apiFetch(`/api/sketch-plans/${id}`);
          if (planRes.ok) {
            const data = await planRes.json();
            const p = data.plan;
            setName(p.name);
            setProjectId(p.project_id || "none");
            setLocationStr(p.location || "");
            if (p.plan_date) setPlanDate(new Date(p.plan_date).toISOString().split("T")[0]);
            
            // Map items and their images
            const mappedItems = data.items.map((it: any) => {
               const itemImages = data.images.filter((img: any) => img.item_id === it.id).map((img: any) => img.image_url);
               return { ...it, images: itemImages || [] };
            });
            setItems(mappedItems.length > 0 ? mappedItems : items);

            // Plan-level images
            const plImages = data.images.filter((img: any) => !img.item_id).map((img: any) => img.image_url);
            setPlanImages(plImages);
          }
        } else {
          const templateDataStr = sessionStorage.getItem("sketch_template_data");
          if (templateDataStr) {
            try {
              const td = JSON.parse(templateDataStr);
              if (td.items) setItems(td.items.map((it: any) => ({ ...it, id: Date.now().toString() + Math.random(), images: it.images || [] })));
              if (td.location) setLocationStr(td.location);
              sessionStorage.removeItem("sketch_template_data");
              toast({ title: "Template Applied", description: "Form pre-filled from template" });
            } catch (e) {
              console.error("Failed to parse template data", e);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load initial data", err);
      }
    };

    loadInitialData();
  }, [id, isEditing]);

  // Fetch materials from API
  const loadMaterials = useCallback(async (q: string = "") => {
    setSearching(true);
    try {
      const url = q.trim().length >= 2
        ? `/api/materials/search?q=${encodeURIComponent(q.trim())}`
        : `/api/materials/search`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log("[SketchPlan] loadMaterials got", data.materials?.length, "results");
        setSearchResults(data.materials || []);
      } else {
        const text = await res.text();
        console.error("[SketchPlan] loadMaterials API error", res.status, text);
        setSearchResults([]);
      }
    } catch (err) {
      console.error("Material search error", err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Re-run search when user types (debounced)
  useEffect(() => {
    const q = materialSearch.trim();
    if (openPopoverIdx === null) return; // only search when panel is open
    const timer = setTimeout(() => loadMaterials(q), q.length >= 2 ? 300 : 0);
    return () => clearTimeout(timer);
  }, [materialSearch, openPopoverIdx, loadMaterials]);

  const addItem = () => {
    setItems([
      ...items,
      { id: Date.now().toString(), item_name: "", description: "", length: "", width: "", height: "", qty: "1", unit: "Nos", dimension_unit: "feet", remarks: "", images: [] }
    ]);
  };

  const removeItem = (idx: number) => {
    if (items.length === 1) return;
    const newItems = [...items];
    newItems.splice(idx, 1);
    setItems(newItems);
  };

  const updateItem = (idx: number, field: keyof PlanItem, value: any) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    
    // Auto-calculate quantity if dimensions or unit change
    if (["length", "width", "height", "dimension_unit"].includes(field)) {
       const l = parseFloat(newItems[idx].length) || 0;
       const w = parseFloat(newItems[idx].width) || 0;
       const h = parseFloat(newItems[idx].height) || 0;
       if (l > 0 || w > 0 || h > 0) {
          const dims = [l, w, h].filter(v => v > 0);
          const autoQty = dims.reduce((acc, v) => acc * v, 1);
          // If dimension_unit is mm, round to nearest integer. Otherwise use 2 decimal places.
          newItems[idx].qty = newItems[idx].dimension_unit === "mm" 
            ? Math.round(autoQty).toString() 
            : autoQty.toFixed(2);
       } else if (newItems[idx].dimension_unit === "mm") {
          // Ensure existing qty is also rounded when unit switches to mm
          const currentQty = parseFloat(newItems[idx].qty) || 0;
          newItems[idx].qty = Math.round(currentQty).toString();
       }
    }
    
    setItems(newItems);
  };

  const handleRowImageUpload = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newItems = [...items];
        newItems[idx].images = [...newItems[idx].images, reader.result as string];
        setItems(newItems);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeRowImage = (itemIdx: number, imgIdx: number) => {
    const newItems = [...items];
    newItems[itemIdx].images.splice(imgIdx, 1);
    setItems(newItems);
  };

  const selectMaterial = (idx: number, material: any) => {
     const newItems = [...items];
     newItems[idx].material_id = material.id;
     newItems[idx].item_name = material.name;
     if (material.unit) newItems[idx].unit = material.unit;
     // Pre-fill dimensions if it's a template/product that might have them (though backend doesn't return them yet)
     setItems(newItems);
     setMaterialSearch("");
     setSearchResults([]);
  };

  const savePlan = async () => {
    if (!name.trim()) {
      toast({ title: "Error", description: "Plan name is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        project_id: projectId === "none" ? null : projectId,
        location: locationStr,
        plan_date: planDate,
        items,
        images: planImages.map(url => ({ item_id: null, image_url: url })) 
      };

      const res = await apiFetch(isEditing ? `/api/sketch-plans/${id}` : "/api/sketch-plans", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast({ title: "Success", description: `Plan ${isEditing ? "updated" : "created"} successfully` });
        setLocation("/sketch-plans");
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to save plan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-4 pb-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/sketch-plans")} className="hover:bg-slate-100 h-8 w-8">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">{isEditing ? "Edit Sketch Plan" : "Create New Sketch Plan"}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
                const templateName = prompt("Enter a name for this template:", name);
                if (templateName) {
                    apiFetch("/api/sketch-templates", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: templateName, template_data: { items, location: locationStr } })
                    }).then(res => res.ok && toast({ title: "Success", description: "Template saved" }));
                }
            }} className="gap-2 h-9 text-xs">
              <Layers className="w-3.5 h-3.5" /> Save as Template
            </Button>
            <Button onClick={savePlan} disabled={saving} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-6 text-xs font-bold">
              <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save Plan"}
            </Button>
          </div>
        </div>

        {/* Basic Details - Compact */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1 col-span-1 md:col-span-2">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Plan Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" placeholder="e.g. Master Bedroom Site Visit" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Associated Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Plan Date</Label>
              <Input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1 col-span-1 md:col-span-4">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Site Location / Address</Label>
              <Input value={locationStr} onChange={(e) => setLocationStr(e.target.value)} className="h-9 text-sm" placeholder="City, Area or Full Address" />
            </div>
          </CardContent>
        </Card>

        {/* Enhanced Items Section */}
        <Card className="border-slate-200 shadow-sm overflow-hidden text-[11px]">
          <CardHeader className="bg-slate-50/50 border-b py-2 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-700">
               <GripVertical className="w-4 h-4 text-indigo-500" /> Site Requirements
            </CardTitle>
            <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-[10px] gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold uppercase">
              <Plus className="w-3 h-3" /> Add Item
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b text-slate-500 uppercase text-[9px] font-bold">
                    <th className="px-2 py-2 text-left w-8">#</th>
                    <th className="px-2 py-2 text-left min-w-[100px]">Notes Preview</th>
                    <th className="px-2 py-2 text-left min-w-[150px]">Item / Product</th>
                    <th className="px-2 py-2 text-left w-16">Unit</th>
                    <th className="px-2 py-2 text-left w-16">L</th>
                    <th className="px-2 py-2 text-left w-16">W</th>
                    <th className="px-2 py-2 text-left w-16">H</th>
                    <th className="px-2 py-2 text-left w-20">Auto Qty</th>
                    <th className="px-2 py-2 text-center w-16">Photos</th>
                    <th className="px-2 py-2 text-center w-10">Del</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className="border-b hover:bg-slate-50/30 transition-colors">
                      <td className="px-2 py-2 text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-2 py-2">
                         <Dialog>
                            <DialogTrigger asChild>
                               <div className="cursor-pointer hover:bg-slate-100 p-1 rounded flex items-center justify-between group min-h-[32px] border border-transparent hover:border-slate-200">
                                  <div className="flex-1 overflow-hidden">
                                     {item.description ? (
                                        <p className="truncate text-[10px] text-slate-600 italic">"{item.description}"</p>
                                     ) : (
                                        <p className="text-[10px] text-slate-400 italic">No notes...</p>
                                     )}
                                  </div>
                                  <MessageSquare className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0" />
                               </div>
                            </DialogTrigger>
                            <DialogContent>
                               <DialogHeader>
                                  <DialogTitle>Notes for {item.item_name || `Item ${idx+1}`}</DialogTitle>
                               </DialogHeader>
                               <div className="py-4">
                                  <Textarea 
                                     value={item.description} 
                                     onChange={(e) => updateItem(idx, "description", e.target.value)} 
                                     placeholder="Enter detailed site notes or specifications..." 
                                     className="min-h-[200px]"
                                  />
                               </div>
                               <DialogFooter>
                                  <DialogTrigger asChild>
                                     <Button className="bg-indigo-600 text-white">Save Notes</Button>
                                  </DialogTrigger>
                               </DialogFooter>
                            </DialogContent>
                         </Dialog>
                      </td>
                      <td className="px-2 py-2">
                        <Dialog open={openPopoverIdx === idx} onOpenChange={(open) => {
                              if (open) {
                                 setOpenPopoverIdx(idx);
                                 setMaterialSearch("");
                                 loadMaterials(); // Load full list immediately
                              } else {
                                 setOpenPopoverIdx(null);
                              }
                           }}>
                            <DialogTrigger asChild>
                               <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal h-8 text-[11px] border-dashed border-slate-300 hover:border-indigo-400 p-2">
                                  {item.item_name ? (
                                     <span className="truncate max-w-[120px]">{item.item_name}</span>
                                  ) : (
                                     <span className="text-slate-400 italic">+ Add Item</span>
                                  )}
                                  <Search className="ml-auto h-3 w-3 opacity-50" />
                               </Button>
                            </DialogTrigger>
                            <DialogContent className="p-0 sm:max-w-[500px]">
                               <DialogHeader className="p-4 border-b">
                                  <DialogTitle>Select Item for Row #{idx + 1}</DialogTitle>
                               </DialogHeader>
                               <Command shouldFilter={false}>
                                  <CommandInput 
                                     placeholder="Search materials, templates, products..." 
                                     onValueChange={setMaterialSearch} 
                                     className="h-10"
                                  />
                                  <CommandList className="max-h-[400px]">
                                     {searching && <CommandEmpty>Loading...</CommandEmpty>}
                                     {!searching && searchResults.length === 0 && <CommandEmpty>No items found.</CommandEmpty>}
                                     {!searching && searchResults.length > 0 && (
                                        <CommandGroup heading={`All Items (${searchResults.length})`}>
                                           {searchResults.map((m) => (
                                              <CommandItem
                                                 key={`${m.type}-${m.id}`}
                                                 onSelect={() => { selectMaterial(idx, m); setOpenPopoverIdx(null); }}
                                                 className="cursor-pointer"
                                              >
                                                 <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                       <span className="font-semibold text-sm">{m.name}</span>
                                                       <Badge variant="outline" className="text-[10px] scale-90">{m.type}</Badge>
                                                    </div>
                                                    <div className="flex gap-2 text-[10px] text-slate-500">
                                                       {m.code && <span>Code: {m.code}</span>}
                                                       {m.category && <span>Category: {m.category}</span>}
                                                    </div>
                                                 </div>
                                              </CommandItem>
                                           ))}
                                        </CommandGroup>
                                      )}
                                  </CommandList>
                               </Command>
                               <div className="p-3 border-t bg-slate-50 flex flex-col gap-2">
                                  <p className="text-[10px] uppercase font-bold text-slate-400">Custom Item</p>
                                  <Input 
                                     placeholder="Or type a custom name and press Enter..." 
                                     className="h-10 text-sm" 
                                     onKeyDown={(e) => {
                                        if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                          updateItem(idx, "item_name", e.currentTarget.value.trim());
                                          setOpenPopoverIdx(null);
                                        }
                                      }}
                                  />
                               </div>
                            </DialogContent>
                         </Dialog>
                      </td>
                      <td className="px-2 py-2">
                         <Select value={item.dimension_unit} onValueChange={(val: "feet" | "mm") => updateItem(idx, "dimension_unit", val)}>
                            <SelectTrigger className="h-8 text-[10px] py-0 px-1 min-w-[50px]">
                               <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                               <SelectItem value="feet">ft</SelectItem>
                               <SelectItem value="mm">mm</SelectItem>
                            </SelectContent>
                         </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Input value={item.length} onChange={(e) => updateItem(idx, "length", e.target.value)} className="h-8 text-xs px-1" placeholder="0" />
                      </td>
                      <td className="px-2 py-2">
                        <Input value={item.width} onChange={(e) => updateItem(idx, "width", e.target.value)} className="h-8 text-xs px-1" placeholder="0" />
                      </td>
                      <td className="px-2 py-2">
                        <Input value={item.height} onChange={(e) => updateItem(idx, "height", e.target.value)} className="h-8 text-xs px-1" placeholder="0" />
                      </td>
                      <td className="px-2 py-2">
                        <Input value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} className="h-8 text-xs bg-slate-50 font-bold text-indigo-700 px-1" />
                      </td>
                      <td className="px-2 py-2 text-center">
                         <Dialog>
                            <DialogTrigger asChild>
                               <div className="relative inline-block cursor-pointer p-1 border rounded hover:border-amber-300 transition-colors bg-white shadow-sm">
                                  {item.images.length > 0 ? (
                                     <div className="relative w-8 h-8 rounded overflow-hidden">
                                        <img src={item.images[0]} className="w-full h-full object-cover" />
                                        <span className="absolute bottom-0 right-0 bg-amber-500 text-white text-[8px] px-1 rounded-tl font-bold">
                                           {item.images.length}
                                        </span>
                                     </div>
                                  ) : (
                                     <div className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-300">
                                        <Camera className="w-4 h-4" />
                                     </div>
                                  )}
                               </div>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                               <DialogHeader>
                                  <DialogTitle>Item Photos - {item.item_name || `Item ${idx+1}`}</DialogTitle>
                               </DialogHeader>
                               <div className="grid grid-cols-3 gap-4 py-4">
                                  {item.images.map((img, imgIdx) => (
                                     <div key={imgIdx} className="relative group aspect-square rounded border overflow-hidden bg-slate-100">
                                        <img src={img} className="w-full h-full object-cover" />
                                        <button onClick={() => removeRowImage(idx, imgIdx)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                           <X className="w-3 h-3" />
                                        </button>
                                     </div>
                                  ))}
                                  <label className="aspect-square rounded border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-300 hover:text-indigo-400 cursor-pointer bg-slate-50 transition-colors">
                                     <Plus className="w-5 h-5 mb-1" />
                                     <span className="text-[10px] uppercase font-bold text-center">Add<br/>Photo</span>
                                     <input type="file" multiple accept="image/*" onChange={(e) => handleRowImageUpload(idx, e)} className="hidden" />
                                  </label>
                                  <label className="aspect-square rounded border-2 border-dashed border-indigo-200 flex flex-col items-center justify-center text-indigo-400 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer transition-colors">
                                     <Camera className="w-5 h-5 mb-1" />
                                     <span className="text-[10px] uppercase font-bold text-center">Open<br/>Camera</span>
                                     <input type="file" accept="image/*" capture="environment" onChange={(e) => handleRowImageUpload(idx, e)} className="hidden" />
                                  </label>
                               </div>
                            </DialogContent>
                         </Dialog>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-7 w-7 text-slate-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Bottom Utils */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
            {/* Plan-level Site Photos */}
            <Card className="border-slate-200 shadow-sm col-span-1 md:col-span-2 lg:col-span-1 flex flex-col">
                <CardHeader className="bg-slate-50/50 py-2 border-b">
                    <CardTitle className="text-xs font-bold flex items-center gap-2">
                        <Camera className="w-3.5 h-3.5 text-indigo-500" /> Plan-Level Site Photos
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-3 flex-1 overflow-y-auto max-h-[220px]">
                    <div className="grid grid-cols-4 gap-2">
                        {planImages.map((img, idx) => (
                            <div key={idx} className="relative group aspect-square rounded border overflow-hidden bg-slate-100">
                                <img src={img} className="w-full h-full object-cover" />
                                <button onClick={() => setPlanImages(planImages.filter((_, i) => i !== idx))} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        <label className="aspect-square rounded border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-300 hover:text-indigo-400 cursor-pointer bg-white transition-all shadow-sm">
                            <Plus className="w-5 h-5" />
                            <span className="text-[8px] font-bold mt-1 uppercase text-center">Add<br/>Photo</span>
                            <input type="file" multiple accept="image/*" onChange={(e) => {
                                const files = e.target.files;
                                if (files) {
                                    Array.from(files).forEach(file => {
                                        const reader = new FileReader();
                                        reader.onloadend = () => setPlanImages(prev => [...prev, reader.result as string]);
                                        reader.readAsDataURL(file);
                                    });
                                }
                            }} className="hidden" />
                        </label>
                        <label className="aspect-square rounded border-2 border-dashed border-indigo-200 flex flex-col items-center justify-center text-indigo-400 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer transition-all shadow-sm bg-white">
                            <Camera className="w-5 h-5" />
                            <span className="text-[8px] font-bold mt-1 uppercase text-center">Open<br/>Camera</span>
                            <input type="file" accept="image/*" capture="environment" onChange={(e) => {
                                const files = e.target.files;
                                if (files) {
                                    Array.from(files).forEach(file => {
                                        const reader = new FileReader();
                                        reader.onloadend = () => setPlanImages(prev => [...prev, reader.result as string]);
                                        reader.readAsDataURL(file);
                                    });
                                }
                            }} className="hidden" />
                        </label>
                    </div>
                </CardContent>
            </Card>

            {/* Sketch pad Section */}
            <Card className="border-slate-200 shadow-sm flex flex-col">
                <CardHeader className="bg-slate-50/50 py-2 border-b">
                    <CardTitle className="text-xs font-bold flex items-center gap-2">
                        <Pencil className="w-3.5 h-3.5 text-indigo-500" /> Freehand Sketch pad
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-3 flex flex-col justify-between flex-1">
                    <div className="flex items-center gap-3">
                       <div className="bg-amber-100 p-2 rounded-full text-amber-600 shrink-0">
                           <Pencil className="w-4 h-4" />
                       </div>
                       <div>
                           <p className="text-[10px] font-bold text-slate-700">Need specific visual notes?</p>
                           <p className="text-[9px] text-slate-500">Draw once and attach it to any row or main plan photos.</p>
                       </div>
                    </div>
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button size="sm" className="bg-slate-800 hover:bg-black text-white text-[10px] h-8 px-4 w-full mt-3">Open Sketch Editor</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-[720px] max-h-[95vh] overflow-y-auto">
                            <DialogHeader className="px-2 sm:px-4">
                                <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pr-8">
                                   <span className="text-sm sm:text-base">Site Sketch Editor</span>
                                   <div className="flex items-center gap-2 text-[10px] sm:text-xs font-normal">
                                      <span className="text-slate-500">Save to:</span>
                                      <Select value={sketchTarget} onValueChange={setSketchTarget}>
                                         <SelectTrigger className="w-[140px] h-7 text-[10px]">
                                            <SelectValue />
                                         </SelectTrigger>
                                         <SelectContent>
                                            <SelectItem value="main">Main (Plan Photos)</SelectItem>
                                            {items.map((item, i) => (
                                               <SelectItem key={item.id} value={i.toString()}>Row {i + 1}: {item.item_name || "Untitled"}</SelectItem>
                                            ))}
                                         </SelectContent>
                                      </Select>
                                   </div>
                                </DialogTitle>
                            </DialogHeader>
                            <div className="py-2">
                                <SketchPad
                                    unitPrefix={sketchTarget === "main" ? (items[0]?.dimension_unit || "ft") : (items[parseInt(sketchTarget)]?.dimension_unit || "ft")}
                                    onSave={(dataUrl) => {
                                        if (sketchTarget === "main") {
                                            setPlanImages(prev => [...prev, dataUrl]);
                                            toast({ title: "Sketch Saved", description: "Added to Plan-level Photos" });
                                        } else {
                                            const idx = parseInt(sketchTarget);
                                            if (idx >= 0 && idx < items.length) {
                                              const newItems = [...items];
                                              newItems[idx].images = [...newItems[idx].images, dataUrl];
                                              setItems(newItems);
                                              toast({ title: "Sketch Saved", description: `Attached to Row ${idx + 1}` });
                                            } else {
                                               toast({ title: "Save Canceled", description: "Invalid target selection", variant: "destructive" });
                                            }
                                        }
                                    }}
                                />
                            </div>
                        </DialogContent>
                    </Dialog>
                </CardContent>
            </Card>

            {/* Quick Tips */}
            <Card className="border-slate-200 shadow-sm bg-slate-50/30 flex flex-col">
                <CardContent className="p-4 flex flex-col justify-center h-full text-[10px] text-slate-500">
                   <p className="font-bold text-slate-700 mb-2 flex items-center gap-1.5 underline decoration-indigo-300 underline-offset-4"><FileText className="w-3.5 h-3.5" /> Site Visit Tips:</p>
                   <ul className="list-disc list-inside space-y-1 ml-1 leading-relaxed">
                      <li>Use the <span className="text-indigo-600 font-bold">Unit Toggle</span> for each row (ft/mm).</li>
                      <li>Dimensions <span className="text-indigo-600 font-bold">auto-calculate</span> Qty (override if needed).</li>
                      <li>Search <span className="text-indigo-600 font-bold">Materials/Products</span> from multiple DB sources.</li>
                      <li>Snap photos per item for accurate documentation.</li>
                      <li>Save as <span className="text-indigo-600 font-bold">Template</span> for repeated site structures.</li>
                   </ul>
                </CardContent>
            </Card>
        </div>
      </div>
    </Layout>
  );
}
