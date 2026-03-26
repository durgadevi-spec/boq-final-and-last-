import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useData } from "@/lib/store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, ArrowLeft, Save, Loader2, HardHat, AlertTriangle, Image as ImageIcon, X, Search } from "lucide-react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/Layout";
import { cn } from "@/lib/utils";

function SearchableItemDialog({ items, onSelect, selectedId }: { items: any[], onSelect: (val: string) => void, selectedId: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  const filteredItems = items.filter(item => 
    item.itemName.toLowerCase().includes(search.toLowerCase()) ||
    item.category?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedItem = items.find(i => i.id === selectedId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-9 text-left font-normal border-gray-300">
          <span className="truncate">{selectedItem ? selectedItem.itemName : "Select item..."}</span>
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select Item / Work</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search items, products, materials..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto pr-2 space-y-1">
            {filteredItems.length === 0 && (
              <p className="text-center py-4 text-sm text-gray-500">No items found.</p>
            )}
            {filteredItems.map((item) => (
              <button
                key={item.id}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                  selectedId === item.id ? "bg-gray-900 text-white" : "hover:bg-gray-100 text-gray-900"
                )}
                onClick={() => {
                  onSelect(item.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <div className="font-medium">{item.itemName}</div>
                <div className="text-[10px] opacity-70 uppercase tracking-wider">{item.category}</div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CreateSiteReport() {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [summary, setSummary] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [projectItems, setProjectItems] = useState<any[]>([]);

  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const fetchProjects = async () => {
    try {
      const res = await apiFetch("/api/boq-projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  };

  const fetchProjectItems = async (projectId?: string) => {
    try {
      const url = projectId ? `/api/boq-projects/${projectId}/items` : `/api/boq-projects/global/items`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setProjectItems(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch items:", error);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchProjectItems(); // Initial fetch for global items
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectItems(selectedProjectId);
    }
  }, [selectedProjectId]);

  const addTask = () => {
    setTasks([...tasks, {
      id: Math.random().toString(36).substr(2, 9),
      item_type: "boq_item",
      item_id: "",
      item_name: "",
      task_description: "",
      completion_percentage: 0,
      status: "In Progress",
      labour: [],
      issues: [],
      media: []
    }]);
  };

  const removeTask = (taskId: string) => {
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  const updateTask = (taskId: string, field: string, value: any) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        if (field === 'item_id') {
           const selectedItem = projectItems.find(i => i.id === value);
           return { ...t, item_id: value, item_name: selectedItem?.itemName || "Unknown" };
        }
        return { ...t, [field]: value };
      }
      return t;
    }));
  };

  const addLabour = (taskId: string) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, labour: [...(t.labour || []), { labour_name: "", count: 1, in_time: "09:00", out_time: "18:00" }] };
      }
      return t;
    }));
  };

  const addIssue = (taskId: string) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, issues: [...(t.issues || []), { description: "" }] };
      }
      return t;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      toast({ title: "Project Required", description: "Please select a project.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const selectedProject = projects.find(p => p.id === selectedProjectId);
      
      // 1. Create Report with all nested data in one go
      const reportRes = await apiFetch("/api/site-reports", {
        method: "POST",
        body: JSON.stringify({
          project_id: selectedProjectId,
          project_name: selectedProject?.name || "Unknown Project",
          report_date: reportDate,
          summary: summary,
          tasks: tasks // Sending the full tree
        })
      });

      if (!reportRes.ok) throw new Error("Failed to save report");

      toast({ title: "Success", description: "Site report created successfully." });
      setLocation("/site-reports");
    } catch (error) {
       console.error("Submit failed:", error);
       toast({ title: "Error", description: "Failed to save site report.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto py-4 px-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">Create Site Report</h1>
            <p className="text-xs text-gray-500">Document daily site progress and activities</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2 h-8" onClick={() => setLocation("/site-reports")}>
            <ArrowLeft className="h-3 w-3" /> Back
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-4">
          {/* Report Basics */}
          <Card className="md:col-span-2 border border-gray-200">
            <CardHeader className="py-2 px-4 border-b border-gray-100 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-gray-500">Report Information</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3 p-4">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-gray-400 uppercase">Project</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="h-8 text-sm border-gray-300">
                    <SelectValue placeholder="Select project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-gray-400 uppercase">Report Date</Label>
                <div className="flex gap-2">
                  <Input type="date" className="h-8 text-sm border-gray-300 flex-1" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                  <div className="h-8 px-3 bg-gray-50 rounded border border-gray-300 text-[10px] font-medium text-gray-600 flex items-center whitespace-nowrap">
                    {new Date(reportDate).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: '2-digit' })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="md:col-span-1 border border-gray-200">
            <CardHeader className="py-2 px-4 border-b border-gray-100 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-gray-500">Overall Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <Textarea 
                placeholder="Site progress summary..." 
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="min-h-[64px] text-xs border-gray-300 resize-none p-2"
              />
            </CardContent>
          </Card>
        </div>

        {/* Tasks Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">Work Tasks</h2>
            <Button type="button" size="sm" onClick={addTask} className="h-8 gap-2 bg-gray-900 hover:bg-gray-800 text-white text-[10px] font-bold uppercase">
              <Plus className="h-3 w-3" /> Add Task
            </Button>
          </div>

          {tasks.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-gray-300 rounded-lg bg-gray-50/50">
              <p className="text-xs text-gray-500">No tasks added yet</p>
              <Button type="button" variant="link" size="sm" onClick={addTask} className="text-gray-900 text-xs font-bold">Add your first task</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map((task, index) => (
                <Card key={task.id} className="border border-gray-200 shadow-none">
                  <CardHeader className="py-2 px-4 bg-gray-50/50 border-b border-gray-100 flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black bg-gray-200 text-gray-600 w-5 h-5 rounded-full flex items-center justify-center">
                        {index + 1}
                      </span>
                      <CardTitle className="text-xs font-bold text-gray-700">
                        {task.item_name || 'New Task'}
                      </CardTitle>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeTask(task.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </CardHeader>
                  
                  <CardContent className="p-4 space-y-4">
                    <div className="grid md:grid-cols-4 gap-4 items-start">
                      <div className="md:col-span-2 space-y-1">
                        <Label className="text-[10px] font-bold text-gray-400 uppercase">Item / Work</Label>
                        <SearchableItemDialog 
                          items={projectItems} 
                          selectedId={task.item_id} 
                          onSelect={(val) => updateTask(task.id, 'item_id', val)} 
                        />
                      </div>
                      <div className="md:col-span-1 space-y-1">
                        <Label className="text-[10px] font-bold text-gray-400 uppercase">Completion: {task.completion_percentage}%</Label>
                        <Input 
                          type="range" 
                          min="0" max="100" 
                          className="h-8 accent-gray-900"
                          value={task.completion_percentage} 
                          onChange={(e) => updateTask(task.id, 'completion_percentage', parseInt(e.target.value))} 
                        />
                      </div>
                      <div className="md:col-span-1 space-y-1">
                        <Label className="text-[10px] font-bold text-gray-400 uppercase">Description</Label>
                        <Input 
                          placeholder="What was completed?" 
                          className="h-8 text-sm border-gray-300"
                          value={task.task_description}
                          onChange={(e) => updateTask(task.id, 'task_description', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Labour Section - Compact Single Line Entries */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1.5">
                          <HardHat className="h-3 w-3" /> Manpower
                        </Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => addLabour(task.id)} className="h-6 text-[9px] font-black uppercase text-gray-500 hover:text-gray-900 border border-gray-200">
                          + Add
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {task.labour.map((l: any, lIdx: number) => (
                          <div key={lIdx} className="flex gap-2 items-center p-1 px-2 bg-gray-50/50 rounded border border-gray-100 group">
                            <Input className="h-7 border-none bg-transparent text-xs w-full shadow-none focus-visible:ring-0 p-0" placeholder="Labour Name (e.g. Welder)" value={l.labour_name} onChange={(e) => {
                              const nL = [...task.labour];
                              nL[lIdx].labour_name = e.target.value;
                              updateTask(task.id, 'labour', nL);
                            }}/>
                            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-2">
                              <span className="text-[9px] font-bold text-gray-400 uppercase">Qty</span>
                              <Input type="number" min="1" className="h-6 w-10 border-gray-200 text-xs text-center p-0" value={l.count} onChange={(e) => {
                                const nL = [...task.labour];
                                nL[lIdx].count = parseInt(e.target.value);
                                updateTask(task.id, 'labour', nL);
                              }}/>
                            </div>
                            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-2">
                              <span className="text-[9px] font-bold text-gray-400 uppercase">In</span>
                              <Input type="time" className="h-6 w-20 border-gray-200 text-[10px] p-0 px-1" value={l.in_time} onChange={(e) => {
                                const nL = [...task.labour];
                                nL[lIdx].in_time = e.target.value;
                                updateTask(task.id, 'labour', nL);
                              }}/>
                            </div>
                            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-2">
                              <span className="text-[9px] font-bold text-gray-400 uppercase">Out</span>
                              <Input type="time" className="h-6 w-20 border-gray-200 text-[10px] p-0 px-1" value={l.out_time} onChange={(e) => {
                                const nL = [...task.labour];
                                nL[lIdx].out_time = e.target.value;
                                updateTask(task.id, 'labour', nL);
                              }}/>
                            </div>
                            <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => {
                              updateTask(task.id, 'labour', task.labour.filter((_:any, i:number) => i !== lIdx));
                            }}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Issues Section - Compact Single Line */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3" /> Obstacles
                        </Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => addIssue(task.id)} className="h-6 text-[9px] font-black uppercase text-gray-500 hover:text-gray-900 border border-gray-200">
                          + Add
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {task.issues.map((issue: any, iIdx: number) => (
                          <div key={iIdx} className="flex gap-2 items-center p-1 px-2 bg-red-50/30 rounded border border-red-100 group">
                            <Input 
                              placeholder="Describe obstruction..." 
                              className="h-7 border-none bg-transparent text-xs flex-1 shadow-none focus-visible:ring-0 p-0"
                              value={issue.description}
                              onChange={(e) => {
                                const nI = [...task.issues];
                                nI[iIdx].description = e.target.value;
                                updateTask(task.id, 'issues', nI);
                              }}
                            />
                            <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-200 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => {
                              updateTask(task.id, 'issues', task.issues.filter((_:any, i:number) => i !== iIdx));
                            }}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <Button type="button" variant="ghost" size="sm" className="text-xs h-8" onClick={() => setLocation("/site-reports")}>Cancel</Button>
          <Button type="submit" size="sm" className="gap-2 px-6 h-8 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold" disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save Site Report
          </Button>
        </div>
      </form>
    </Layout>
  );
}
