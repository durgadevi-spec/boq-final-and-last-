import React, { useState, useEffect, useCallback } from "react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  UserCheck,
  ShieldCheck,
  SearchIcon,
  Settings2,
  RefreshCw,
  Loader2,
  Clock,
  Hammer,
  Building2,
} from "lucide-react";
import { PermissionDialog } from "@/components/admin/PermissionDialog";
import { ALL_SIDEBAR_MODULES } from "@/lib/permissions";

interface UserEntry {
  id: string;
  username: string;
  role: string;
  full_name: string | null;
  created_at: string;
  modules?: string[];
  projects?: string[];
  assigned_at?: string;
  last_active?: string;
}

export default function AdminAccessControl() {
  const { toast } = useToast();

  const [pendingUsers, setPendingUsers] = useState<UserEntry[]>([]);
  const [managedUsers, setManagedUsers] = useState<UserEntry[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingManaged, setLoadingManaged] = useState(true);

  const [searchPending, setSearchPending] = useState("");
  const [searchManaged, setSearchManaged] = useState("");

  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const [dialogUser, setDialogUser] = useState<UserEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // 🔍 Debounce
  const useDebounce = (value: string, delay = 300) => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
      const t = setTimeout(() => setDebounced(value), delay);
      return () => clearTimeout(t);
    }, [value]);
    return debounced;
  };

  const debouncedPending = useDebounce(searchPending);
  const debouncedManaged = useDebounce(searchManaged);

  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await apiFetch("/api/admin/dynamic-access/pending-users");
      const data = await res.json();
      setPendingUsers(data.users || []);
    } catch {
      toast({ title: "Error", description: "Failed to load pending users", variant: "destructive" });
    } finally {
      setLoadingPending(false);
    }
  }, [toast]);

  const fetchManaged = useCallback(async () => {
    setLoadingManaged(true);
    try {
      const res = await apiFetch("/api/admin/dynamic-access/managed-users");
      const data = await res.json();
      setManagedUsers(data.users || []);
    } catch {
      toast({ title: "Error", description: "Failed to load managed users", variant: "destructive" });
    } finally {
      setLoadingManaged(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPending();
    fetchManaged();
  }, [fetchPending, fetchManaged]);

  const openAssignDialog = (user: UserEntry) => {
    setDialogUser(user);
    setDialogOpen(true);
  };

  const handleSaved = () => {
    fetchPending();
    fetchManaged();
  };

  const roleColor = (role: string) => {
    const map: Record<string, string> = {
      user: "bg-blue-100 text-blue-800",
      supplier: "bg-orange-100 text-orange-800",
      contractor: "bg-purple-100 text-purple-800",
      pre_sales: "bg-teal-100 text-teal-800",
      purchase_team: "bg-rose-100 text-rose-800",
      product_manager: "bg-indigo-100 text-indigo-800",
    };
    return map[role] || "bg-gray-100 text-gray-700";
  };

  const moduleIcons: Record<string, React.ReactNode> = {
    boq: <Settings2 className="h-3 w-3" />,
    purchase: <ShieldCheck className="h-3 w-3" />,
    reports: <Users className="h-3 w-3" />,
    admin: <UserCheck className="h-3 w-3" />,
    sketch_plan: <Hammer className="h-3 w-3" />,
  };

  const getModuleLabel = (key: string) => {
    return ALL_SIDEBAR_MODULES.find(m => m.key === key)?.label || key;
  };

  const filteredPending = pendingUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(debouncedPending.toLowerCase()) ||
      (u.full_name || "").toLowerCase().includes(debouncedPending.toLowerCase())
  );

  const filteredManaged = managedUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(debouncedManaged.toLowerCase()) ||
      (u.full_name || "").toLowerCase().includes(debouncedManaged.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* HEADER */}
      <div className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur px-6 py-5">
        <div className="max-w-7xl mx-auto flex justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 flex items-center justify-center rounded-xl bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">User Access Control</h1>
              <p className="text-sm text-muted-foreground">
                Manage permissions and modules
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={() => { fetchPending(); fetchManaged(); }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-6">

        {/* ANALYTICS */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 border rounded-xl bg-white">
            <p className="text-xs text-muted-foreground">Total Users</p>
            <p className="text-xl font-semibold">
              {pendingUsers.length + managedUsers.length}
            </p>
          </div>
          <div className="p-4 border rounded-xl bg-white">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-xl font-semibold">{pendingUsers.length}</p>
          </div>
          <div className="p-4 border rounded-xl bg-white">
            <p className="text-xs text-muted-foreground">Managed</p>
            <p className="text-xl font-semibold">{managedUsers.length}</p>
          </div>
        </div>

        <Tabs defaultValue="pending">
          <TabsList className="rounded-xl bg-muted/50 p-1.5">
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="managed">Managed</TabsTrigger>
          </TabsList>

          {/* PENDING */}
          <TabsContent value="pending">
            <Input
              placeholder="Search users..."
              value={searchPending}
              onChange={(e) => setSearchPending(e.target.value)}
              className="mb-4"
            />

            {loadingPending ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredPending.map((user) => (
                  <div key={user.id} className="flex justify-between p-4 border rounded-xl bg-white shadow-sm">

                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUsers([...selectedUsers, user.id]);
                          } else {
                            setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                          }
                        }}
                      />

                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {user.username.charAt(0)}
                      </div>

                      <div>
                        <p className="font-medium">{user.username}</p>
                        <p className="text-xs text-muted-foreground">
                          Joined {new Date(user.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 items-center">
                      <Badge className={roleColor(user.role)}>{user.role}</Badge>
                      <Button size="sm" onClick={() => openAssignDialog(user)}>
                        Assign
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* MANAGED */}
          <TabsContent value="managed">
            <Input
              placeholder="Search users..."
              value={searchManaged}
              onChange={(e) => setSearchManaged(e.target.value)}
              className="mb-4"
            />

            {loadingManaged ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredManaged.map((user) => (
                  <div key={user.id} className="p-4 border rounded-xl bg-white shadow-sm">

                    <div className="flex justify-between">
                      <div className="flex gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          {user.username.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium">{user.username}</p>
                          <p className="text-xs text-muted-foreground">
                            Assigned {user.assigned_at ? new Date(user.assigned_at).toLocaleDateString() : "-"}
                          </p>
                        </div>
                      </div>

                      <Button size="sm" variant="outline" onClick={() => openAssignDialog(user)}>
                        Edit
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3 pl-14">
                      {user.modules?.map((m) => (
                        <Badge key={m} className="flex gap-1 text-[10px] items-center py-0.5 px-2">
                          {moduleIcons[m]}
                          {getModuleLabel(m)}
                        </Badge>
                      ))}
                      {user.projects && user.projects.length > 0 && (
                        <Badge variant="outline" className="flex gap-1 text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 items-center py-0.5 px-2">
                          <Building2 className="h-3 w-3" />
                          {user.projects.length} Project{user.projects.length > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>

                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* BULK BAR */}
      {selectedUsers.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white shadow-lg border px-6 py-3 rounded-xl flex gap-4">
          <span>{selectedUsers.length} selected</span>
          <Button size="sm">Assign Access</Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedUsers([])}>
            Clear
          </Button>
        </div>
      )}

      <PermissionDialog
        user={dialogUser}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}