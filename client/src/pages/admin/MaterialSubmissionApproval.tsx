import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Package,
} from "lucide-react";

interface MaterialSubmission {
  id: string;
  template_name: string;
  template_code: string;
  shop_name: string;
  rate: number;
  unit: string;
  brandname: string;
  modelnumber: string;
  subcategory: string;
  technicalspecification: string;
  approved: boolean | null;
  created_at: string;
}

export default function MaterialSubmissionApproval() {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<MaterialSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    loadPendingSubmissions();
  }, []);

  const loadPendingSubmissions = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/material-submissions-pending-approval", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Failed to load submissions");
      }

      const data = await response.json();
      setSubmissions(data.submissions.map((s: any) => s.submission) || []);
    } catch (error) {
      console.error("Error loading submissions:", error);
      toast({
        title: "Error",
        description: "Failed to load material submissions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (submissionId: string) => {
    setApproving(submissionId);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/material-submissions/${submissionId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : undefined,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to approve submission");
      }

      toast({
        title: "Success",
        description: "Material submission approved",
      });

      // Reload submissions
      loadPendingSubmissions();
    } catch (error) {
      console.error("Error approving submission:", error);
      toast({
        title: "Error",
        description: "Failed to approve submission",
        variant: "destructive",
      });
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (submissionId: string) => {
    if (!rejectReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a rejection reason",
        variant: "destructive",
      });
      return;
    }

    setRejecting(submissionId);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/material-submissions/${submissionId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : undefined,
        },
        body: JSON.stringify({ reason: rejectReason }),
      });

      if (!response.ok) {
        throw new Error("Failed to reject submission");
      }

      toast({
        title: "Success",
        description: "Material submission rejected",
      });

      setRejectReason("");
      // Reload submissions
      loadPendingSubmissions();
    } catch (error) {
      console.error("Error rejecting submission:", error);
      toast({
        title: "Error",
        description: "Failed to reject submission",
        variant: "destructive",
      });
    } finally {
      setRejecting(null);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Material Submission Approvals</h1>
          <p className="text-gray-600">
            Review and approve supplier material submissions
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : submissions.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500 py-12">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-600" />
                <p>No pending material submissions</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <Card key={submission.id} className="border-l-4 border-l-yellow-500">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {/* Material Info */}
                    <div>
                      <p className="text-sm text-gray-600">Material</p>
                      <p className="font-semibold text-lg">{submission.template_name}</p>
                      <p className="text-sm text-gray-500">{submission.template_code}</p>
                    </div>

                    {/* Supplier/Shop Info */}
                    <div>
                      <p className="text-sm text-gray-600">Supplier Shop</p>
                      <p className="font-semibold">{submission.shop_name}</p>
                    </div>

                    {/* Rate and Unit */}
                    <div>
                      <p className="text-sm text-gray-600">Rate</p>
                      <p className="font-semibold">
                        ₹{Number(submission.rate).toFixed(2)} / {submission.unit}
                      </p>
                    </div>

                    {/* Submitted Date + Price Age */}
                    <div>
                      <p className="text-sm text-gray-600">Price Added On</p>
                      <p className="font-semibold">
                        {new Date(submission.created_at).toLocaleDateString()}
                      </p>
                      {(() => {
                        const daysOld = Math.floor((Date.now() - new Date(submission.created_at).getTime()) / (1000 * 60 * 60 * 24));
                        if (daysOld > 90) return (
                          <p className="text-xs text-amber-600 font-semibold mt-1 flex items-center gap-1">
                            ⚠️ {daysOld} days old — Reconfirm price with vendor
                          </p>
                        );
                        return <p className="text-xs text-green-600 mt-1">{daysOld} day{daysOld !== 1 ? "s" : ""} ago — Recent</p>;
                      })()}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 pb-6 border-b">
                    {submission.brandname && (
                      <div>
                        <p className="text-sm text-gray-600">Brand</p>
                        <p className="font-semibold">{submission.brandname}</p>
                      </div>
                    )}
                    {submission.modelnumber && (
                      <div>
                        <p className="text-sm text-gray-600">Model Number</p>
                        <p className="font-semibold">{submission.modelnumber}</p>
                      </div>
                    )}
                    {submission.subcategory && (
                      <div>
                        <p className="text-sm text-gray-600">Subcategory</p>
                        <p className="font-semibold">{submission.subcategory}</p>
                      </div>
                    )}
                  </div>

                  {/* Technical Specification */}
                  {submission.technicalspecification && (
                    <div className="mb-6">
                      <p className="text-sm text-gray-600 mb-2">Technical Specification</p>
                      <div className="bg-gray-50 p-3 rounded text-sm">
                        {submission.technicalspecification}
                      </div>
                    </div>
                  )}

                  {/* Rejection Reason Section (if rejecting) */}
                  {rejecting === submission.id && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded">
                      <Label className="text-red-900 font-semibold">
                        Rejection Reason <span className="text-red-600">*</span>
                      </Label>
                      <Textarea
                        placeholder="Explain why this submission is being rejected"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={4}
                        className="mt-2"
                      />
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {rejecting === submission.id ? (
                      <>
                        <Button
                          onClick={() => handleReject(submission.id)}
                          variant="destructive"
                          disabled={!rejectReason.trim()}
                          className="gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          Confirm Rejection
                        </Button>
                        <Button
                          onClick={() => {
                            setRejecting(null);
                            setRejectReason("");
                          }}
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() => handleApprove(submission.id)}
                          disabled={approving === submission.id}
                          className="gap-2 bg-green-600 hover:bg-green-700"
                        >
                          {approving === submission.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          Approve
                        </Button>
                        <Button
                          onClick={() => setRejecting(submission.id)}
                          variant="outline"
                          className="gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
