import { useState, useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertTriangle,
  FileText,
  Download,
  Trash2,
  CheckCircle2,
  Clock,
  Users,
  Camera,
  Package,
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
  const [singleEmail, setSingleEmail] = useState<string>("");
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
    const isGroupSelected = selectedGroupId && selectedGroupId !== "none";
    if (!isGroupSelected && !singleEmail) {
      toast({ title: "Recipient Required", description: "Please select an email group or enter an email address.", variant: "destructive" });
      return;
    }

    let groupClientFlag = false;
    if (isGroupSelected) {
      const selectedGroup = emailGroups.find((g) => g.id === selectedGroupId);
      groupClientFlag = !!selectedGroup?.is_client_group;
    }

    setSendingEmail(true);
    try {
      const payload: any = {};
      if (isGroupSelected) payload.email_group_id = selectedGroupId;
      if (singleEmail) payload.additional_emails = [singleEmail];
      if (groupClientFlag) payload.is_client_group = true;

      const res = await apiFetch(`/api/site-reports/${id}/send-email`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast({ title: "Email Sent", description: "The report has been sent to the selected group." });
        fetchDetail();
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
        <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-600">Loading report...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!report) {
    return (
      <Layout>
        <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
          <div className="bg-white rounded-xl shadow-md p-6 text-center max-w-md">
            <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <h2 className="text-lg font-bold text-slate-900 mb-1">Report Not Found</h2>
            <p className="text-sm text-slate-600 mb-4">The report you're looking for doesn't exist.</p>
            <Button onClick={() => setLocation("/site-reports")} className="bg-blue-600 hover:bg-blue-700 text-white text-sm">
              Back to Reports
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        {/* Header Section */}
        <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50 shadow-sm print:hidden">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors gap-2 h-8 px-2"
              onClick={() => setLocation("/site-reports")}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Back</span>
            </Button>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Status</p>
                <Badge
                  className={cn(
                    "mt-0.5 text-xs font-semibold uppercase tracking-wider px-2 py-0.5",
                    report.status === "submitted"
                      ? "bg-green-100 text-green-700 border border-green-200"
                      : "bg-amber-100 text-amber-700 border border-amber-200"
                  )}
                >
                  {report.status === "submitted" ? "✓ Submitted" : "● Draft"}
                </Badge>
              </div>
              <div className="h-5 w-px bg-slate-200" />
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors h-8 w-8 p-0"
                onClick={deleteReport}
                title="Delete Report"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-6 py-6">
          {/* Title & Date Section */}
          <div className="mb-6 pb-6 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Project Report</p>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
                  {report.project_name}
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Daily operations and progress tracking
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200 min-w-max">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Report Date</p>
                <p className="text-lg font-bold text-slate-900 font-mono">
                  {new Date(report.report_date).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="mb-6 print:hidden">
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
                <div className="w-full sm:w-1/3">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5 block">
                    Select Email Group
                  </Label>
                  <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                    <SelectTrigger className="bg-slate-50 border-slate-200 text-slate-900 font-medium h-9 text-sm">
                      <SelectValue placeholder="Choose email group..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-slate-500 italic">None</SelectItem>
                      {emailGroups.map((g) => (
                        <SelectItem key={g.id} value={g.id} className="font-medium text-sm">
                          {g.name} {g.is_client_group ? "(Client group)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full sm:w-1/3">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5 block">
                    Or Enter Single Email
                  </Label>
                  <Input 
                    type="email" 
                    placeholder="name@example.com" 
                    value={singleEmail} 
                    onChange={(e) => setSingleEmail(e.target.value)}
                    className="h-9 bg-slate-50 border-slate-200 text-sm font-medium"
                  />
                </div>

                <div className="flex flex-1 justify-end items-end gap-2 h-9">
                  <Button
                    onClick={sendEmail}
                    disabled={sendingEmail || (!singleEmail && (!selectedGroupId || selectedGroupId === "none"))}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5 text-xs uppercase tracking-wide h-9 px-4"
                    size="sm"
                  >
                    {sendingEmail ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden xs:inline">Send</span>
                  </Button>

                  {report.status === "draft" && (
                    <Button
                      onClick={submitReport}
                      disabled={submitting}
                      variant="outline"
                      className="border-slate-300 text-slate-900 hover:bg-slate-900 hover:text-white font-semibold gap-1.5 text-xs uppercase tracking-wide h-9 px-4"
                      size="sm"
                    >
                      {submitting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden xs:inline">Finalize</span>
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className="border-slate-300 text-slate-600 hover:bg-slate-900 hover:text-white font-semibold gap-1.5 text-xs uppercase tracking-wide h-9 px-4"
                    size="sm"
                    onClick={() => window.print()}
                    title="Download as PDF"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">PDF</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Section */}
          {report.summary && (
            <div className="mb-6">
              <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                <div className="h-1 w-4 bg-blue-600 rounded-full" />
                Summary
              </h2>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <blockquote className="text-sm leading-relaxed text-slate-700 italic border-l-3 border-blue-600 pl-3">
                  "{report.summary}"
                </blockquote>
              </div>
            </div>
          )}

          {/* Operational Intelligence Section */}
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Operational Intelligence</h2>
            <p className="text-xs text-slate-600 font-medium mb-4">
              Site deployment logs and progress analytics
            </p>

            {!report.tasks || report.tasks.length === 0 ? (
              <div className="border border-dashed border-slate-300 bg-slate-50 rounded-lg p-8 text-center">
                <FileText className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-600 font-medium">No deployment logs available</p>
              </div>
            ) : (
              <div className="space-y-4">
                {report.tasks.map((task: any, idx: number) => (
                  <div
                    key={task.id}
                    className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden bg-white rounded-lg"
                  >
                    <div className="p-5">
                      {/* Task Header */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-4 border-b border-slate-100">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                              Progress
                            </span>
                          </div>
                          <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                            {task.item_name || task.itemName || "Site Milestone"}
                          </h3>
                          {task.task_description && (
                            <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-2xl">
                              {task.task_description}
                            </p>
                          )}
                        </div>

                        {/* Progress Circle */}
                        <div className="flex flex-col items-center bg-slate-50 rounded-lg p-3 min-w-[120px] shrink-0">
                          <div className="relative h-16 w-16 mb-1">
                            <svg className="h-16 w-16 -rotate-90">
                              <circle
                                cx="32"
                                cy="32"
                                r="28"
                                fill="transparent"
                                stroke="#e2e8f0"
                                strokeWidth="3"
                              />
                              <circle
                                cx="32"
                                cy="32"
                                r="28"
                                fill="transparent"
                                stroke="#2563eb"
                                strokeWidth="3"
                                strokeDasharray={2 * Math.PI * 28}
                                strokeDashoffset={
                                  2 * Math.PI * 28 * (1 - task.completion_percentage / 100)
                                }
                                strokeLinecap="round"
                                style={{ transition: "stroke-dashoffset 0.5s ease" }}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="text-center">
                                <p className="text-lg font-bold text-slate-900 leading-none">
                                  {task.completion_percentage}%
                                </p>
                              </div>
                            </div>
                          </div>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                            Complete
                          </p>
                        </div>
                      </div>

                      {/* Task Details Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Personnel Allocation */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="h-6 w-6 bg-blue-100 rounded flex items-center justify-center">
                              <Users className="h-3.5 w-3.5 text-blue-600" />
                            </div>
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                              Personnel
                            </h4>
                          </div>

                          {task.labour && task.labour.length > 0 ? (
                            <div className="space-y-2">
                              {task.labour.map((l: any, i: number) => (
                                <div
                                  key={i}
                                  className="bg-slate-50 border border-slate-200 rounded p-2.5 hover:bg-white hover:shadow-sm transition-all text-xs"
                                >
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1">
                                      <p className="font-semibold text-slate-900">
                                        {l.labour_name || l.labourName}
                                      </p>
                                      <p className="text-slate-500 mt-0.5 flex items-center gap-1">
                                        <Clock className="h-2.5 w-2.5" />
                                        {l.in_time || l.inTime} - {l.out_time || l.outTime}
                                      </p>
                                    </div>
                                    <Badge className="bg-blue-600 text-white font-bold text-xs px-2 py-0.5 shrink-0">
                                      {l.count}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="bg-slate-50 border border-dashed border-slate-300 rounded p-3 text-center">
                              <p className="text-xs text-slate-500 font-medium">
                                No personnel recorded
                              </p>
                            </div>
                          )}

                          {/* Materials */}
                          <div className="mt-6">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="h-6 w-6 bg-emerald-100 rounded flex items-center justify-center">
                                <Package className="h-3.5 w-3.5 text-emerald-600" />
                              </div>
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                                Materials Used
                              </h4>
                            </div>

                            {task.materials && task.materials.length > 0 ? (
                              <div className="space-y-2">
                                {task.materials.map((m: any, i: number) => (
                                  <div
                                    key={i}
                                    className="bg-slate-50 border border-slate-200 rounded p-2.5 flex justify-between items-center gap-2 text-xs hover:bg-white hover:shadow-sm transition-all"
                                  >
                                    <p className="font-semibold text-slate-900">
                                      {m.material_name || m.materialName}
                                    </p>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge className="bg-emerald-600 text-white font-bold text-xs px-2 py-0.5">
                                        {m.quantity}
                                      </Badge>
                                      <span className="text-slate-500 font-medium min-w-[30px]">{m.unit}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="bg-slate-50 border border-dashed border-slate-300 rounded p-3 text-center">
                                <p className="text-xs text-slate-500 font-medium">
                                  No materials recorded
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Challenges & Media */}
                        <div className="space-y-4">
                          {/* Challenges */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <div className="h-6 w-6 bg-red-100 rounded flex items-center justify-center">
                                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                              </div>
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                                Challenges
                              </h4>
                            </div>

                            {task.issues && task.issues.length > 0 ? (
                              <div className="space-y-2">
                                {task.issues.map((issue: any, iIdx: number) => (
                                  <div
                                    key={iIdx}
                                    className="bg-red-50 border border-red-200 rounded p-2.5 flex gap-2 text-xs"
                                  >
                                    <div className="h-1.5 w-1.5 bg-red-500 rounded-full mt-1 shrink-0" />
                                    <p className="text-red-900 leading-relaxed">
                                      {issue.description}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="bg-green-50 border border-green-200 rounded p-2.5 flex items-center gap-2 text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                <p className="font-medium text-green-700">
                                  No challenges reported
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Media */}
                          {task.media && task.media.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <div className="h-6 w-6 bg-purple-100 rounded flex items-center justify-center">
                                  <Camera className="h-3.5 w-3.5 text-purple-600" />
                                </div>
                                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                                  Evidence
                                </h4>
                              </div>
                              <div className="grid grid-cols-4 gap-2">
                                {task.media.map((m: any, mIdx: number) => (
                                  <div
                                    key={mIdx}
                                    className="aspect-square rounded overflow-hidden border border-slate-200 hover:border-blue-400 transition-colors cursor-pointer shadow-sm hover:shadow-md"
                                  >
                                    <img
                                      src={m.file_url || m.fileUrl}
                                      alt={`Evidence ${mIdx + 1}`}
                                      className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest">
              BuildEstimate Site Report System • Generated {new Date().toLocaleDateString("en-IN")}
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}