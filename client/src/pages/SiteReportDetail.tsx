import { useState, useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Send,
  Loader2,
  HardHat,
  AlertTriangle,
  FileText,
  Download,
  User as UserIcon,
  Trash2,
} from "lucide-react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SiteReportDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [emailGroups, setEmailGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/site-reports/${id}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
      }
    } catch (error) {
      console.error("Fetch error:", error);
      toast({ title: "Error", description: "Failed to load report details.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchEmailGroups = async () => {
    try {
      const res = await apiFetch("/api/email-groups");
      if (res.ok) {
        const data = await res.json();
        setEmailGroups(data.groups || []);
      }
    } catch (error) {
      console.error("Fetch email groups error:", error);
      toast({ title: "Error", description: "Failed to load email groups.", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (id) {
      fetchDetail();
      fetchEmailGroups();
    }
  }, [id]);

  const sendEmail = async () => {
    if (!selectedGroupId) {
       toast({ title: "Group Required", description: "Please select an email group.", variant: "destructive" });
       return;
    }

    setSendingEmail(true);
    try {
      const res = await apiFetch(`/api/site-reports/${id}/send-email`, {
        method: "POST",
        body: JSON.stringify({ email_group_id: selectedGroupId })
      });

      if (res.ok) {
        toast({ title: "Email Sent", description: "The report has been sent to the selected group." });
        fetchDetail(); // Refresh to show submitted status
      } else {
        throw new Error("Failed to send email");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to send report email.", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  const submitReport = async () => {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/site-reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "submitted" })
      });

      if (res.ok) {
        toast({ title: "Report Submitted", description: "The report is now officially submitted." });
        fetchDetail();
      } else {
        throw new Error("Failed to submit report");
      }
    } catch (error) {
       toast({ title: "Error", description: "Failed to submit report.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteReport = async () => {
    if (!confirm("Are you sure you want to delete this report? This is permanent.")) return;
    try {
      const res = await apiFetch(`/api/site-reports/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Deleted", description: "Report has been removed." });
        setLocation("/site-reports");
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete report." });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </Layout>
    );
  }

  if (!report) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-full">
          <h2 className="text-xl font-bold">Report Not Found</h2>
          <Button variant="link" onClick={() => setLocation("/site-reports")}>Back to Reports</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-10 px-6 bg-white min-h-screen shadow-sm border-x border-gray-100">
        {/* Header */}
        <div className="flex items-start justify-between pb-6 border-b border-gray-200 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Site Report</h1>
              <Badge className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                report.status === 'submitted' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              )}>
                {report.status === 'submitted' ? 'Submitted' : 'Draft'}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xl font-semibold text-gray-800">{report.project_name}</p>
              <p className="text-sm text-gray-500 font-medium tracking-wide">
                Date: {new Date(report.report_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" className="h-9 px-3 text-gray-600 border-gray-300" onClick={() => setLocation("/site-reports")}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <Button variant="outline" size="sm" className="h-9 px-3 text-red-600 border-red-200 hover:bg-red-50" onClick={deleteReport}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        </div>

        {/* Summary Section */}
        <div className="mb-10">
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-3">Daily Summary</h2>
          <div className="p-5 bg-gray-50 rounded-xl border border-gray-100 italic text-gray-700 leading-relaxed text-lg">
            "{report.summary || 'No summary provided for this report.'}"
          </div>
        </div>

        {/* Two Column Layout for Tasks and Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
          {/* Main Content: Tasks */}
          <div className="lg:col-span-3 space-y-10">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Work Progress
              </h2>
              
              {!report.tasks || report.tasks.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                  <p className="text-sm text-gray-400">No work tasks recorded for this report.</p>
                </div>
              ) : (
                <div className="space-y-12">
                  {report.tasks.map((task: any, idx: number) => (
                    <div key={task.id} className="relative pl-6 border-l-2 border-gray-100 group">
                      <div className="absolute -left-1.5 top-0 h-3 w-3 rounded-full bg-gray-900 group-last:bg-gray-400" />
                      
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900">
                             {task.item_name || task.itemName || `Task #${idx + 1}`}
                          </h3>
                          {task.task_description && (
                            <p className="text-sm text-gray-600 mt-1 leading-relaxed">{task.task_description}</p>
                          )}
                        </div>
                        <div className="ml-4 flex flex-col items-end">
                          <span className="text-2xl font-black text-gray-900">{task.completion_percentage}%</span>
                          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-tighter">Complete</span>
                        </div>
                      </div>

                      {/* Info Grid */}
                      <div className="space-y-4">
                        {/* Labour */}
                        {task.labour?.length > 0 && (
                          <div className="space-y-2">
                             <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                               <HardHat className="h-3 w-3" /> Personnel Allocation
                             </div>
                             <div className="flex flex-wrap gap-2">
                               {task.labour.map((l: any, lIdx: number) => (
                                 <div key={lIdx} className="inline-flex flex-col px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm">
                                   <div className="flex items-center justify-between gap-4">
                                     <span className="text-xs font-bold text-gray-800">{l.labour_name}</span>
                                     <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[9px] font-black">{l.count}</span>
                                   </div>
                                   <span className="text-[9px] text-gray-400 font-medium">
                                     {l.in_time || l.inTime || '09:00'} - {l.out_time || l.outTime || '18:00'}
                                   </span>
                                 </div>
                               ))}
                             </div>
                          </div>
                        )}

                        {/* Issues */}
                        {task.issues?.length > 0 && (
                          <div className="space-y-2">
                             <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-500">
                               <AlertTriangle className="h-3 w-3" /> Reported Issues
                             </div>
                             <div className="space-y-1.5">
                               {task.issues.map((issue: any, iIdx: number) => (
                                 <div key={iIdx} className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-100 flex items-start gap-2 italic">
                                   <span className="mt-1 h-1 w-1 rounded-full bg-red-400 shrink-0" />
                                   {issue.description}
                                 </div>
                               ))}
                             </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Actions */}
          <div className="lg:col-span-1 space-y-8 print:hidden">
            <div className="pt-2">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 font-sans">Actions</h2>
              <div className="space-y-6">
                <div className="space-y-4">
                  {report.status === 'draft' && (
                    <Button 
                      className="w-full bg-gray-900 hover:bg-black text-white px-8 h-10 font-bold text-xs uppercase tracking-widest rounded-lg"
                      onClick={submitReport}
                      disabled={submitting}
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Finalize & Submit'}
                    </Button>
                  )}

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Dispatch Report</Label>
                    <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                      <SelectTrigger className="h-10 border-gray-200 text-xs font-medium bg-white">
                        <SelectValue placeholder="Select Group" />
                      </SelectTrigger>
                      <SelectContent>
                        {emailGroups.map(g => (
                          <SelectItem key={g.id} value={g.id} className="text-xs">{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-widest h-10 rounded-lg group"
                      disabled={sendingEmail || !selectedGroupId}
                      onClick={sendEmail}
                    >
                      {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2 group-hover:translate-x-1 transition-transform" />}
                      Send Report
                    </Button>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    className="w-full h-10 text-[10px] font-black uppercase tracking-widest border-gray-200"
                    onClick={() => window.print()}
                  >
                    <Download className="h-4 w-4 mr-2" /> Print PDF
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-gray-100 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-300">
            BuildEstimate Site Report System • Generated by Site Engineer
          </p>
        </div>
      </div>
    </Layout>
  );
}

