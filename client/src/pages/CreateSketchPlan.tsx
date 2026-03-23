import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, ArrowLeft, Camera, Pencil, Layers, X, GripVertical, FileText, Search, MessageSquare, Image as ImageIcon, Move, Lock, Unlock, ShieldAlert } from "lucide-react";
import { Reorder, useDragControls } from "framer-motion";
import { SketchPad } from "@/components/SketchPad";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface PlanImage {
  id?: string;
  url: string;
  name: string;
}

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
  images: PlanImage[]; // item-level images (base64 + name)
}

// Row Component for Drag and Drop
const SketchPlanRow = ({ 
  item, idx, updateItem, removeItem, selectMaterial, 
  searchResults, searching, loadMaterials, setMaterialSearch,
  openPopoverIdx, setOpenPopoverIdx, renameRowImage, removeRowImage,
  handleRowImageUpload, isLocked, setPreviewImage
}: any) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      as="tr"
      key={item.id}
      value={item}
      dragListener={!isLocked}
      dragControls={dragControls}
      className="border-b hover:bg-slate-50/30 transition-colors bg-white"
    >
      <td className="px-2 py-2 text-center">
        <GripVertical 
          className="w-4 h-4 text-slate-300 cursor-grab active:cursor-grabbing hover:text-indigo-400 m-auto" 
          onPointerDown={(e) => dragControls.start(e)}
        />
      </td>
      <td className="px-2 py-2 text-slate-400 font-medium">{idx + 1}</td>
      <td className="px-2 py-2 w-[150px] min-w-[150px] max-w-[150px]">
         <Dialog>
            <TooltipProvider>
               <Tooltip>
                  <TooltipTrigger asChild>
                     <DialogTrigger asChild>
                        <div className={cn("cursor-pointer hover:bg-slate-100 p-1 rounded flex items-center justify-between group min-h-[32px] border border-transparent hover:border-slate-200 w-full", isLocked && "pointer-events-auto hover:bg-transparent")}>
                           <div className="flex-1 overflow-hidden">
                              {item.description ? (
                                 <p className="line-clamp-2 text-[11px] text-slate-700 font-medium italic leading-tight">"{item.description}"</p>
                              ) : (
                                 <p className="text-[11px] text-slate-400 italic">No notes...</p>
                              )}
                           </div>
                           <MessageSquare className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0" />
                        </div>
                     </DialogTrigger>
                  </TooltipTrigger>
                  {item.description && (
                     <TooltipContent side="top" className="max-w-[350px] bg-slate-900 text-white py-2 px-3 rounded-md shadow-lg border border-slate-700 z-[100]">
                        <p className="text-[12px] font-medium leading-relaxed whitespace-normal">"{item.description}"</p>
                     </TooltipContent>
                  )}
               </Tooltip>
            </TooltipProvider>

            <DialogContent className="z-[110]">
               <DialogHeader>
                  <DialogTitle>Notes for {item.item_name || `Item ${idx+1}`}</DialogTitle>
               </DialogHeader>
               <div className="py-4">
                  <Textarea 
                     value={item.description} 
                     onChange={(e) => updateItem(idx, "description", e.target.value)} 
                     placeholder="Enter detailed site notes or specifications..." 
                     className="min-h-[200px]"
                     disabled={isLocked}
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
                  loadMaterials();
               } else {
                  setOpenPopoverIdx(null);
               }
            }}>
            <DialogTrigger asChild>
               <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal h-8 text-[11px] border-dashed border-slate-300 hover:border-indigo-400 p-2" disabled={isLocked}>
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
                  <CommandList className="max-h-[280px]">
                     {searching && <CommandEmpty>Loading...</CommandEmpty>}
                     {!searching && searchResults.length === 0 && <CommandEmpty>No items found.</CommandEmpty>}
                     {!searching && searchResults.length > 0 && (
                        <CommandGroup heading={`All Items (${searchResults.length})`}>
                           {searchResults.map((m: any) => (
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
         <Select value={item.dimension_unit} onValueChange={(val: "feet" | "mm") => updateItem(idx, "dimension_unit", val)} disabled={isLocked}>
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
        <Input value={item.length} onChange={(e) => updateItem(idx, "length", e.target.value)} className="h-8 text-xs px-1" placeholder="0" disabled={isLocked} />
      </td>
      <td className="px-2 py-2">
        <Input value={item.width} onChange={(e) => updateItem(idx, "width", e.target.value)} className="h-8 text-xs px-1" placeholder="0" disabled={isLocked} />
      </td>
      <td className="px-2 py-2">
        <Input value={item.height} onChange={(e) => updateItem(idx, "height", e.target.value)} className="h-8 text-xs px-1" placeholder="0" disabled={isLocked} />
      </td>
      <td className="px-2 py-2">
        <Input value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} className="h-8 text-xs bg-slate-50 font-bold text-indigo-700 px-1" disabled={isLocked} />
      </td>
      <td className="px-2 py-2 text-center">
         <Dialog>
            <DialogTrigger asChild>
               <div className={cn("relative inline-block cursor-pointer p-1 border rounded hover:border-amber-300 transition-colors bg-white shadow-sm", isLocked && "pointer-events-auto hover:border-slate-200")}>
                   {item.images.length > 0 ? (
                     <div className="relative w-8 h-8 rounded overflow-hidden">
                        <img src={item.images[0].url} className="w-full h-full object-cover" />
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
                   {item.images.map((img: any, imgIdx: number) => (
                     <div key={imgIdx} className="relative group aspect-square rounded border overflow-hidden bg-slate-100">
                        <img src={img.url} className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImage(img)} title="Click to view full image" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity pr-6 pointer-events-none">
                           {img.name}
                        </div>
                        {!isLocked && (
                           <>
                             <button onClick={() => renameRowImage(idx, imgIdx)} className="absolute bottom-1 right-1 bg-indigo-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10" title="Rename photo">
                                <Pencil className="w-3 h-3" />
                             </button>
                             <button onClick={() => removeRowImage(idx, imgIdx)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10" title="Delete photo">
                                <X className="w-3 h-3" />
                             </button>
                           </>
                        )}
                     </div>
                   ))}
                  {!isLocked && (
                     <>
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
                     </>
                  )}
               </div>
            </DialogContent>
         </Dialog>
      </td>
      <td className="px-2 py-2 text-center">
        <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" disabled={isLocked}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </td>
    </Reorder.Item>
  );
};

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
  const [planImages, setPlanImages] = useState<PlanImage[]>([]);
  const [sketchTarget, setSketchTarget] = useState<string>("main"); // "main" or row id/index
  const [openPopoverIdx, setOpenPopoverIdx] = useState<number | null>(null);
  
  // PDF / Export State
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [selectedPdfCols, setSelectedPdfCols] = useState<string[]>(["#", "Item", "Notes", "L", "W", "H", "Qty", "Unit", "Photos"]);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const [materialSearch, setMaterialSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // New state
  const [projectOpen, setProjectOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<{url: string, name: string} | null>(null);

  // Lock & Approval State
  const [isLocked, setIsLocked] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string>("none");
  const [requestReason, setRequestReason] = useState("");
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [userRole, setUserRole] = useState<string>("user");

  const isAdmin = userRole === "admin";

  // Load user role and initial data
  useEffect(() => {
    const fetchUserRole = async () => {
       try {
          const res = await apiFetch("/api/me");
          if (res.ok) {
             const data = await res.json();
             setUserRole(data.role || "user");
          }
       } catch (e) { console.error("Failed to fetch role", e); }
    };
    fetchUserRole();

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
            
            // Lock Info
            setIsLocked(!!p.is_locked);
            setRequestStatus(p.request_status || "none");
            setRequestReason(p.request_reason || "");
            
            // Map items and their images
            const mappedItems = data.items.map((it: any) => {
               const itemImages = data.images
                .filter((img: any) => img.item_id === it.id)
                .map((img: any) => ({ 
                  id: img.id, 
                  url: img.image_url, 
                  name: img.image_name || img.name || `Photo ${img.id.split('-').pop()}` 
                }));
               return { ...it, images: itemImages || [] };
            });
            setItems(mappedItems.length > 0 ? mappedItems : items);

            // Plan-level images
            const plImages = data.images
              .filter((img: any) => !img.item_id)
              .map((img: any) => ({ 
                id: img.id, 
                url: img.image_url, 
                name: img.image_name || img.name || `Site Photo ${img.id.split('-').pop()}` 
              }));
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
      const fileName = file.name.split('.').slice(0, -1).join('.') || "Untitled Photo";
      reader.onloadend = () => {
        const newItems = [...items];
        newItems[idx].images = [
          ...newItems[idx].images, 
          { url: reader.result as string, name: fileName }
        ];
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

  const renameRowImage = (itemIdx: number, imgIdx: number) => {
    const currentName = items[itemIdx].images[imgIdx].name;
    const newName = prompt("Rename Photo:", currentName);
    if (newName && newName !== currentName) {
      const newItems = [...items];
      newItems[itemIdx].images[imgIdx] = { ...newItems[itemIdx].images[imgIdx], name: newName };
      setItems(newItems);
    }
  };

  const renamePlanImage = (idx: number) => {
    const currentName = planImages[idx].name;
    const newName = prompt("Rename Site Photo:", currentName);
    if (newName && newName !== currentName) {
      const next = [...planImages];
      next[idx] = { ...next[idx], name: newName };
      setPlanImages(next);
    }
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
    if (isLocked) {
      toast({ title: "Plan Locked", description: "You cannot save changes to a locked plan.", variant: "destructive" });
      return;
    }
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
        images: planImages.map(img => ({ item_id: null, image_url: img.url, name: img.name })) 
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

  const handleDownloadPdf = async (forEmail: boolean = false): Promise<string | undefined> => {
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 10;
      const headerBoxY = 10;
      const headerBoxH = 25;

      // Header Box
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.rect(marginX, headerBoxY, pageWidth - 2 * marginX, headerBoxH);

      // logo placeholder or fetch? for now text
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("CONCEPT TRUNK INTERIORS", marginX + 5, headerBoxY + 12);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("SITE SKETCH PLAN REPORT", marginX + 5, headerBoxY + 18);

      // Meta info on right
      doc.setFontSize(8);
      const metaX = pageWidth - marginX - 5;
      doc.text(`Project: ${projects.find(p => p.id === projectId)?.name || "N/A"}`, metaX, headerBoxY + 7, { align: "right" });
      doc.text(`Plan: ${name}`, metaX, headerBoxY + 13, { align: "right" });
      doc.text(`Date: ${planDate}`, metaX, headerBoxY + 19, { align: "right" });

      const headers = selectedPdfCols;
      const body = items.map((item, idx) => {
        const row: any[] = [];
        headers.forEach(h => {
          if (h === "#") row.push(idx + 1);
          else if (h === "Item") row.push(item.item_name);
          else if (h === "Notes") row.push(item.description);
          else if (h === "L") row.push(item.length);
          else if (h === "W") row.push(item.width);
          else if (h === "H") row.push(item.height);
          else if (h === "Qty") row.push(item.qty);
          else if (h === "Unit") row.push(item.unit);
          else if (h === "Photos") row.push(""); 
        });
        return row;
      });

      const photoColIdx = headers.indexOf("Photos");
      
      autoTable(doc, {
        head: [headers],
        body: body,
        startY: headerBoxY + headerBoxH + 5,
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
        columnStyles: {
           // Ensure Notes column doesn't squeeze others too much if it's long
           [headers.indexOf("Notes")]: { cellWidth: 'auto' },
           [photoColIdx]: { cellWidth: 50 },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === photoColIdx) {
            const itemImages = items[data.row.index]?.images || [];
            if (itemImages.length > 0) {
              data.cell.styles.minCellHeight = 25;
            }
          }
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === photoColIdx) {
            const item = items[data.row.index];
            if (item && item.images && item.images.length > 0) {
              let xPos = data.cell.x + 2;
              item.images.slice(0, 2).forEach((img) => {
                try {
                  // Detect format from data URI if possible
                  const format = img.url.split(';')[0].split('/')[1]?.toUpperCase() || "JPEG";
                  doc.addImage(img.url, format === "PNG" ? "PNG" : "JPEG", xPos, data.cell.y + 2, 20, 20);
                  xPos += 22;
                } catch (e) {
                  console.warn("Failed to add table image to PDF", e);
                }
              });
            }
          }
        }
      });

      // Add plan-level images if space remains
      if (planImages.length > 0) {
        let finalY = (doc as any).lastAutoTable.finalY + 15;
        if (finalY + 60 > doc.internal.pageSize.getHeight()) {
          doc.addPage();
          finalY = 20;
        }
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Plan-Level Photos:", 10, finalY);
        
        let px = 10;
        let py = finalY + 8;
        const imgSize = 45;
        const spacing = 10;
        const rowHeight = 65; // Image + text + spacing

        planImages.forEach((img, i) => {
          if (px + imgSize > pageWidth - 10) {
             px = 10;
             py += rowHeight;
          }
          if (py + rowHeight > doc.internal.pageSize.getHeight()) {
             doc.addPage();
             py = 20;
             px = 10;
          }
          try {
            const format = img.url.split(';')[0].split('/')[1]?.toUpperCase() || "JPEG";
            doc.addImage(img.url, format === "PNG" ? "PNG" : "JPEG", px, py, imgSize, imgSize);
            
            // Photo Name - Smaller font and better placement
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100);
            const truncatedName = img.name.length > 30 ? img.name.substring(0, 27) + "..." : img.name;
            doc.text(truncatedName, px, py + imgSize + 5);
            doc.setTextColor(0);
            
            px += imgSize + spacing;
          } catch (e) {
            console.warn("Failed to add plan image to PDF", e);
          }
        });
      }

      if (forEmail) {
        return doc.output("datauristring").split(',')[1];
      } else {
        doc.save(`${name.replace(/\s+/g, '_')}_Report.pdf`);
        toast({ title: "Success", description: "PDF downloaded successfully" });
      }
    } catch (err) {
      console.error("PDF Error", err);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const handleSendEmail = async () => {
    if (!recipientEmail.trim()) {
      toast({ title: "Error", description: "Recipient email is required", variant: "destructive" });
      return;
    }
    setSendingEmail(true);
    try {
      const pdfBase64 = await handleDownloadPdf(true);
      if (!pdfBase64) return;

      const res = await apiFetch("/api/send-sketch-plan-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail,
          planName: name,
          pdfBase64,
          planData: {
            projectName: projects.find(p => p.id === projectId)?.name,
            location: locationStr,
            planDate: planDate,
            items: items.map(it => ({
              item_name: it.item_name,
              description: it.description,
              length: it.length,
              width: it.width,
              height: it.height,
              qty: it.qty,
              unit: it.unit,
              dimension_unit: it.dimension_unit
            }))
          }
        })
      });

      if (res.ok) {
        toast({ title: "Success", description: "Email sent successfully" });
        setIsEmailDialogOpen(false);
      } else {
        throw new Error("Failed to send");
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to send email", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleLockPlan = async () => {
     if (!confirm("Are you sure you want to lock this plan? Once locked, further editing will be disabled until approved by an admin.")) return;
     try {
        const res = await apiFetch(`/api/sketch-plans/${id}/lock`, { method: "POST" });
        if (res.ok) {
           toast({ title: "Plan Locked", description: "This plan is now read-only." });
           setIsLocked(true);
        }
     } catch (e) { toast({ title: "Error", description: "Failed to lock plan", variant: "destructive" }); }
  };

  const handleRequestUnlock = async () => {
     if (!unlockReason.trim()) {
        toast({ title: "Error", description: "Please provide a reason for the edit request.", variant: "destructive" });
        return;
     }
     setSubmittingRequest(true);
     try {
        const res = await apiFetch(`/api/sketch-plans/${id}/request-unlock`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ reason: unlockReason })
        });
        if (res.ok) {
           toast({ title: "Request Sent", description: "An admin will review your edit request." });
           setRequestStatus("pending");
           setRequestReason(unlockReason);
           setShowUnlockDialog(false);
        }
     } catch (e) { toast({ title: "Error", description: "Failed to send request", variant: "destructive" }); }
     finally { setSubmittingRequest(false); }
  };

  const handleAdminUnlock = async (action: 'approve' | 'reject') => {
     try {
        const res = await apiFetch(`/api/sketch-plans/${id}/handle-unlock`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ action })
        });
        if (res.ok) {
           toast({ title: `Request ${action}d`, description: action === 'approve' ? "Plan is now editable." : "Request has been rejected." });
           if (action === 'approve') {
              setIsLocked(false);
              setRequestStatus("approved");
           } else {
              setRequestStatus("rejected");
           }
        }
     } catch (e) { toast({ title: "Error", description: "Failed to process request", variant: "destructive" }); }
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
            <Button variant="outline" size="sm" onClick={() => setIsPdfDialogOpen(true)} className="gap-2 h-9 text-xs border-indigo-200 text-indigo-600 hover:bg-indigo-50">
              <FileText className="w-3.5 h-3.5" /> Export PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEmailDialogOpen(true)} className="gap-2 h-9 text-xs border-indigo-200 text-indigo-600 hover:bg-indigo-50">
              <MessageSquare className="w-3.5 h-3.5" /> Email Plan
            </Button>
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
            <Button onClick={savePlan} disabled={saving || isLocked} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-6 text-xs font-bold">
              <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save Plan"}
            </Button>
            
            {isEditing && (
               <div className="flex items-center gap-2 border-l pl-2 ml-1">
                  {isLocked ? (
                     <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1 py-1 h-9">
                           <Lock className="w-3 h-3" /> LOCKED
                        </Badge>
                        {isAdmin ? (
                           <div className="flex gap-1">
                              {requestStatus === 'pending' && (
                                 <Popover>
                                    <PopoverTrigger asChild>
                                       <Button size="sm" variant="outline" className="h-9 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100">
                                          <ShieldAlert className="w-3.5 h-3.5" /> Review Request
                                       </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80">
                                       <div className="space-y-4">
                                          <div className="space-y-2">
                                             <h4 className="font-bold leading-none">Edit Request</h4>
                                             <p className="text-sm text-slate-500 italic">"{requestReason}"</p>
                                          </div>
                                          <div className="flex gap-2">
                                             <Button size="sm" className="bg-green-600 hover:bg-green-700 flex-1" onClick={() => handleAdminUnlock('approve')}>Approve</Button>
                                             <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 flex-1" onClick={() => handleAdminUnlock('reject')}>Reject</Button>
                                          </div>
                                       </div>
                                    </PopoverContent>
                                 </Popover>
                              )}
                              <Button size="sm" variant="outline" onClick={() => handleAdminUnlock('approve')} className="h-9 gap-1.5 border-indigo-200 text-indigo-700">
                                 <Unlock className="w-3.5 h-3.5" /> Force Unlock
                              </Button>
                           </div>
                        ) : (
                           requestStatus === 'pending' ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 h-9">
                                 Request Pending...
                              </Badge>
                           ) : (
                              <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
                                 <DialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="h-9 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50">
                                       <Pencil className="w-3.5 h-3.5" /> Request Edit
                                    </Button>
                                 </DialogTrigger>
                                 <DialogContent>
                                    <DialogHeader>
                                       <DialogTitle>Request Edit Permission</DialogTitle>
                                    </DialogHeader>
                                    <div className="py-4 space-y-4">
                                       <div className="space-y-2">
                                          <Label>Reason for Editing</Label>
                                          <Textarea 
                                             placeholder="Explain why you need to modify this locked plan..." 
                                             value={unlockReason} 
                                             onChange={(e) => setUnlockReason(e.target.value)}
                                          />
                                       </div>
                                    </div>
                                    <DialogFooter>
                                       <Button variant="outline" onClick={() => setShowUnlockDialog(false)}>Cancel</Button>
                                       <Button className="bg-indigo-600" disabled={submittingRequest} onClick={handleRequestUnlock}>
                                          {submittingRequest ? "Sending..." : "Submit Request"}
                                       </Button>
                                    </DialogFooter>
                                 </DialogContent>
                              </Dialog>
                           )
                        )}
                     </div>
                  ) : (
                     <Button size="sm" variant="outline" onClick={handleLockPlan} className="h-9 gap-1.5 border-slate-200 text-slate-600 hover:text-amber-700 hover:border-amber-300">
                        <Lock className="w-3.5 h-3.5" /> Lock Plan
                     </Button>
                  )}
               </div>
            )}
          </div>
        </div>

        <div className={cn("space-y-4 transition-all duration-300 relative", isLocked && "opacity-[0.8] grayscale-[20%] pointer-events-none select-none")}>
            {isLocked && (
               <div className="absolute inset-0 z-40 rounded-xl" title="Plan is locked" aria-hidden="true" />
            )}

        {/* Basic Details - Compact */}
        <Card className="border-slate-200 shadow-sm relative z-10">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1 col-span-1 md:col-span-2">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Plan Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" placeholder="e.g. Master Bedroom Site Visit" disabled={isLocked} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Associated Project</Label>
              <Popover open={projectOpen} onOpenChange={setProjectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={projectOpen}
                    className="w-full justify-between h-9 text-sm font-normal px-3"
                    disabled={isLocked}
                  >
                    {projectId !== "none" ? projects.find((project) => project.id === projectId)?.name || "Select project..." : "No Project"}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search project..." />
                    <CommandList>
                      <CommandEmpty>No project found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setProjectId("none");
                            setProjectOpen(false);
                          }}
                        >
                          No Project
                        </CommandItem>
                        {projects.map((project) => (
                          <CommandItem
                            key={project.id}
                            onSelect={() => {
                              setProjectId(project.id);
                              setProjectOpen(false);
                            }}
                          >
                            {project.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Plan Date</Label>
              <Input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} className="h-9 text-sm" disabled={isLocked} />
            </div>
            <div className="space-y-1 col-span-1 md:col-span-4">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Site Location / Address</Label>
              <Input value={locationStr} onChange={(e) => setLocationStr(e.target.value)} className="h-9 text-sm" placeholder="City, Area or Full Address" disabled={isLocked} />
            </div>
          </CardContent>
        </Card>

        {/* Enhanced Items Section */}
        <Card className="border-slate-200 shadow-sm overflow-hidden text-[11px]">
          <CardHeader className="bg-slate-50/50 border-b py-2 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-700">
               <GripVertical className="w-4 h-4 text-indigo-500" /> Site Requirements
            </CardTitle>
            <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-[10px] gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold uppercase" disabled={isLocked}>
              <Plus className="w-3 h-3" /> Add Item
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs table-fixed min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b text-slate-500 uppercase text-[9px] font-bold">
                    <th className="px-2 py-2 text-center w-8"></th>
                    <th className="px-2 py-2 text-left w-8">#</th>
                    <th className="px-2 py-2 text-left w-[150px]">Notes Preview</th>
                    <th className="px-2 py-2 text-left w-[180px]">Item / Product</th>
                    <th className="px-2 py-2 text-left w-16">Unit</th>
                    <th className="px-2 py-2 text-left w-14">L</th>
                    <th className="px-2 py-2 text-left w-14">W</th>
                    <th className="px-2 py-2 text-left w-14">H</th>
                    <th className="px-2 py-2 text-left w-16">Qty</th>
                    <th className="px-2 py-2 text-center w-16">Photos</th>
                    <th className="px-2 py-2 text-center w-10">Del</th>
                  </tr>
                </thead>
                <Reorder.Group as="tbody" axis="y" values={items} onReorder={setItems}>
                  {items.map((item, idx) => (
                    <SketchPlanRow 
                      key={item.id}
                      item={item}
                      idx={idx}
                      isLocked={isLocked}
                      updateItem={updateItem}
                      addItem={addItem}
                      removeItem={removeItem}
                      selectMaterial={selectMaterial}
                      searchResults={searchResults}
                      searching={searching}
                      loadMaterials={loadMaterials}
                      setMaterialSearch={setMaterialSearch}
                      openPopoverIdx={openPopoverIdx}
                      setOpenPopoverIdx={setOpenPopoverIdx}
                      renameRowImage={renameRowImage}
                      removeRowImage={removeRowImage}
                      handleRowImageUpload={handleRowImageUpload}
                      setPreviewImage={setPreviewImage}
                    />
                  ))}
                </Reorder.Group>
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
                <CardContent className="p-3 flex-1 overflow-y-auto max-h-[220px] relative z-20">
                    <div className="grid grid-cols-4 gap-2">
                        {planImages.map((img, idx) => (
                            <div key={idx} className={cn("relative group aspect-square rounded border overflow-hidden bg-slate-100", isLocked && "pointer-events-auto")}>
                                <img src={img.url} className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImage(img)} title="Click to view full image" />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity pr-6 pointer-events-none">
                                    {img.name}
                                </div>
                                {!isLocked && (
                                   <>
                                     <button onClick={() => renamePlanImage(idx)} className="absolute bottom-1 right-1 bg-indigo-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10" title="Rename photo">
                                         <Pencil className="w-3 h-3" />
                                     </button>
                                     <button onClick={() => setPlanImages(planImages.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10" title="Delete photo">
                                         <X className="w-3 h-3" />
                                     </button>
                                   </>
                                )}
                            </div>
                        ))}
                        {!isLocked && (
                           <>
                              <label className="aspect-square rounded border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-300 hover:text-indigo-400 cursor-pointer bg-white transition-all shadow-sm">
                                  <Plus className="w-5 h-5" />
                                  <span className="text-[8px] font-bold mt-1 uppercase text-center">Add<br/>Photo</span>
                                  <input type="file" multiple accept="image/*" onChange={(e) => {
                                      const files = e.target.files;
                                      if (files) {
                                          Array.from(files).forEach(file => {
                                              const reader = new FileReader();
                                              const fileName = file.name.split('.').slice(0, -1).join('.') || "Untitled Photo";
                                              reader.onloadend = () => setPlanImages(prev => [
                                                ...prev, 
                                                { url: reader.result as string, name: fileName }
                                              ]);
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
                                              const fileName = `CAM_${new Date().getTime()}`;
                                              reader.onloadend = () => setPlanImages(prev => [
                                                ...prev, 
                                                { url: reader.result as string, name: fileName }
                                              ]);
                                              reader.readAsDataURL(file);
                                          });
                                      }
                                  }} className="hidden" />
                              </label>
                           </>
                        )}
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
                            <Button size="sm" className="bg-slate-800 hover:bg-black text-white text-[10px] h-8 px-4 w-full mt-3" disabled={isLocked}>Open Sketch Editor</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-[850px] w-[95vw] max-h-[95vh] h-[90vh] overflow-y-auto flex flex-col p-1 sm:p-4">
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
                                    readOnly={isLocked}
                                    unitPrefix={sketchTarget === "main" ? (items[0]?.dimension_unit || "ft") : (items[parseInt(sketchTarget)]?.dimension_unit || "ft")}
                                    onSave={(dataUrl) => {
                                        const fileName = `Sketch_${new Date().getTime()}`;
                                        if (sketchTarget === "main") {
                                            setPlanImages(prev => [...prev, { url: dataUrl, name: fileName }]);
                                            toast({ title: "Sketch Saved", description: "Added to Plan-level Photos" });
                                        } else {
                                            const idx = parseInt(sketchTarget);
                                            if (idx >= 0 && idx < items.length) {
                                              const newItems = [...items];
                                              newItems[idx].images = [...newItems[idx].images, { url: dataUrl, name: fileName }];
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

        {/* PDF Export Dialog */}
        <Dialog open={isPdfDialogOpen} onOpenChange={setIsPdfDialogOpen}>
           <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                 <DialogTitle>Select Columns for PDF Report</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                 {["#", "Item", "Notes", "L", "W", "H", "Qty", "Unit", "Photos"].map((col) => (
                    <div key={col} className="flex items-center space-x-2">
                       <Checkbox 
                          id={`col-${col}`} 
                          checked={selectedPdfCols.includes(col)}
                          onCheckedChange={(checked) => {
                             if (checked) setSelectedPdfCols([...selectedPdfCols, col]);
                             else setSelectedPdfCols(selectedPdfCols.filter(c => c !== col));
                          }}
                       />
                       <label htmlFor={`col-${col}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {col}
                       </label>
                    </div>
                 ))}
              </div>
              <DialogFooter>
                 <Button variant="outline" onClick={() => setIsPdfDialogOpen(false)}>Cancel</Button>
                 <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => { setIsPdfDialogOpen(false); handleDownloadPdf(); }}>Download PDF</Button>
              </DialogFooter>
           </DialogContent>
        </Dialog>

        {/* Email Dialog */}
        <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
           <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                 <DialogTitle>Send Plan as Email Report</DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
                 <div className="space-y-2">
                    <Label htmlFor="email">Recipient Email Address</Label>
                    <Input id="email" type="email" placeholder="client@example.com" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
                 </div>
                 <p className="text-[10px] text-slate-500 italic">The plan will be sent as a PDF attachment with the columns currently selected in the "Export PDF" settings.</p>
              </div>
              <DialogFooter>
                 <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>Cancel</Button>
                 <Button className="bg-indigo-600 hover:bg-indigo-700 font-bold" disabled={sendingEmail} onClick={handleSendEmail}>
                    {sendingEmail ? "Sending..." : "Send Email"}
                 </Button>
              </DialogFooter>
           </DialogContent>
        </Dialog>

        {/* Image Preview Dialog */}
        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
           <DialogContent className="max-w-4xl p-1 bg-transparent border-none shadow-none [&>button]:text-white [&>button]:bg-black/50 [&>button]:hover:bg-black/80 [&>button]:rounded-full [&>button]:p-2 [&>button]:z-50 [&>button]:top-4 [&>button]:right-4">
              <DialogHeader className="sr-only">
                 <DialogTitle>Image Preview</DialogTitle>
              </DialogHeader>
              {previewImage && (
                 <div className="relative flex flex-col items-center justify-center w-full h-full min-h-[50vh]">
                    <img src={previewImage.url} alt={previewImage.name} className="max-w-full max-h-[85vh] object-contain rounded-md shadow-2xl bg-white/5" />
                    <div className="absolute bottom-4 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm border border-white/10 shadow-lg">
                       {previewImage.name}
                    </div>
                 </div>
              )}
           </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
