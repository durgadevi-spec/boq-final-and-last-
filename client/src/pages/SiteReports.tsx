import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useData } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, FileText, Send, Eye, Search, Loader2, Trash2, Mail, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function SiteReports() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [, setLocation] = useLocation();
  const { user } = useData();
  const { toast } = useToast();

  // Email Groups State
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newEmails, setNewEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [isClientGroup, setIsClientGroup] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/site-reports");
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (error) {
      console.error("Failed to fetch reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      setLoadingGroups(true);
      const res = await apiFetch("/api/email-groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch (error) {
      console.error("Failed to fetch groups:", error);
    } finally {
      setLoadingGroups(false);
    }
  };

  const deleteReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this site report? This action cannot be undone.")) return;
    try {
      const res = await apiFetch(`/api/site-reports/${id}`, { method: "DELETE" });
      if (res.ok) {
        setReports(reports.filter(r => r.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete report:", error);
    }
  };

  const addEmail = () => {
    if (emailInput && !newEmails.includes(emailInput) && emailInput.includes("@")) {
      setNewEmails([...newEmails, emailInput]);
      setEmailInput("");
    }
  };

  const removeEmail = (email: string) => {
    setNewEmails(newEmails.filter(e => e !== email));
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName || newEmails.length === 0) {
      toast({ title: "Incomplete", description: "Please provide a name and at least one email.", variant: "destructive" });
      return;
    }

    setCreatingGroup(true);
    try {
      const res = await apiFetch("/api/email-groups", {
        method: "POST",
        body: JSON.stringify({ name: newGroupName, members: newEmails, isClientGroup })
      });
      if (res.ok) {
        toast({ title: "Success", description: "Email group created." });
        setNewGroupName("");
        setNewEmails([]);
        setIsClientGroup(false);
        fetchGroups();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to create group.", variant: "destructive" });
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm("Are you sure you want to delete this group?")) return;
    try {
      const res = await apiFetch(`/api/email-groups/${id}`, { method: "DELETE" });
      if (res.ok) {
        setGroups(groups.filter(g => g.id !== id));
        toast({ title: "Deleted", description: "Email group removed." });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete group.", variant: "destructive" });
    }
  };

  useEffect(() => {
    fetchReports();
    fetchGroups();
  }, []);

  const filteredReports = reports.filter(r =>
    r.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.summary?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Site Reports</h1>
            <p className="text-sm text-gray-600 mt-1">Create and manage daily site progress reports</p>
          </div>
          <div className="flex gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Users className="h-4 w-4" /> Manage Groups
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Email Groups</DialogTitle>
                  <DialogDescription>Manage recipient groups for your site reports.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-sm">Create New Group</h3>
                    <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="space-y-1">
                        <Label className="text-xs">Group Name</Label>
                        <Input 
                          placeholder="e.g., Project Managers" 
                          value={newGroupName} 
                          onChange={(e) => setNewGroupName(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Add Email</Label>
                        <div className="flex gap-2">
                          <Input 
                            placeholder="manager@client.com" 
                            value={emailInput} 
                            onChange={(e) => setEmailInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                            className="h-8 text-sm"
                          />
                          <Button size="sm" type="button" onClick={addEmail} className="h-8">Add</Button>
                        </div>
                      </div>
                      {newEmails.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {newEmails.map(email => (
                            <Badge key={email} variant="secondary" className="gap-1 pr-1 font-normal">
                              {email}
                              <X className="h-3 w-3 cursor-pointer" onClick={() => removeEmail(email)} />
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center space-x-2 mt-3">
                        <input
                          type="checkbox"
                          id="isClientGroup"
                          checked={isClientGroup}
                          onChange={(e) => setIsClientGroup(e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <Label htmlFor="isClientGroup" className="text-xs text-gray-700">
                          This is a client group (simplified email content)
                        </Label>
                      </div>
                      <Button 
                        className="w-full mt-2 h-9 bg-gray-900" 
                        disabled={creatingGroup || !newGroupName || newEmails.length === 0}
                        onClick={handleCreateGroup}
                      >
                        {creatingGroup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                        Create Group
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-semibold text-sm">Existing Groups</h3>
                    <div className="space-y-3">
                      {loadingGroups ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                      ) : groups.length === 0 ? (
                        <div className="text-center py-8 text-sm text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                          No groups created yet.
                        </div>
                      ) : (
                        groups.map(group => (
                          <div key={group.id} className="p-3 bg-white border border-gray-200 rounded-lg flex items-center justify-between group">
                            <div>
                              <div className="font-medium text-sm">{group.name}</div>
                              <div className="text-[10px] text-gray-500">{group.members?.length || 0} members</div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteGroup(group.id)} className="text-red-600 hover:bg-red-50 h-8 w-8 p-0">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Link href="/site-reports/new">
              <Button className="gap-2 bg-gray-900 hover:bg-gray-800 text-white">
                <Plus className="h-4 w-4" /> New Report
              </Button>
            </Link>
          </div>
        </div>

        <Card className="border border-gray-200">
          <CardHeader className="border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-gray-900">Reports List</CardTitle>
                <CardDescription className="text-sm text-gray-600">View all submitted and draft reports</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by project..."
                  className="pl-10 h-9 border-gray-300"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                <Loader2 className="h-8 w-8 animate-spin mb-3 text-gray-400" />
                <span className="text-sm">Loading reports...</span>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="py-16 text-center text-gray-600">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm">No reports found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50 border-t border-gray-200">
                    <TableRow className="hover:bg-transparent border-b border-gray-200">
                      <TableHead className="py-3 px-6 font-semibold text-gray-900 text-sm">Project</TableHead>
                      <TableHead className="py-3 px-6 font-semibold text-gray-900 text-sm">Date</TableHead>
                      <TableHead className="py-3 px-6 font-semibold text-gray-900 text-sm">Status</TableHead>
                      <TableHead className="py-3 px-6 font-semibold text-gray-900 text-sm">Summary</TableHead>
                      <TableHead className="py-3 px-6 font-semibold text-gray-900 text-sm text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.map((report) => (
                      <TableRow
                        key={report.id}
                        className="hover:bg-gray-50 transition-colors border-b border-gray-200 cursor-pointer"
                        onClick={() => setLocation(`/site-reports/${report.id}`)}
                      >
                        <TableCell className="py-4 px-6 font-medium text-gray-900">{report.project_name}</TableCell>
                        <TableCell className="py-4 px-6 text-sm text-gray-600">
                          {new Date(report.report_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <Badge className={report.status === 'submitted' ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-amber-100 text-amber-800 hover:bg-amber-100'}>
                            {report.status === 'submitted' ? 'Submitted' : 'Draft'}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 px-6 text-sm text-gray-600 max-w-xs truncate">{report.summary || '-'}</TableCell>
                        <TableCell className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Link href={`/site-reports/${report.id}`}>
                              <Button variant="ghost" size="sm" className="h-8 px-2 text-gray-600 hover:bg-gray-100">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-red-600 hover:bg-red-50" onClick={(e) => deleteReport(report.id, e)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
