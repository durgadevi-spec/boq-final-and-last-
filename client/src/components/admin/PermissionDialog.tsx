import { useState, useEffect } from "react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { UserCog, Save, Loader2 } from "lucide-react";

import { ALL_SIDEBAR_MODULES, getDefaultPermissions } from "@/lib/permissions";


interface PermissionDialogProps {
  user: { id: string; username: string; role: string; modules?: string[] } | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PermissionDialog({ user, open, onClose, onSaved }: PermissionDialogProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pre-load existing permissions when dialog opens
  useEffect(() => {
    if (!open || !user) return;
    
    // If we already have modules passed in (from Managed Users list)
    if (user.modules && user.modules.length > 0) {
      setSelected(new Set(user.modules));
      return;
    }

    // Otherwise, fetch from server 
    setLoading(true);
    apiFetch(`/api/admin/dynamic-access/permissions/${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.modules && data.modules.length > 0) {
          setSelected(new Set(data.modules));
        } else {
          // Fallback: If no custom permissions exist yet, use the role's default access
          setSelected(new Set(getDefaultPermissions(user.role)));
        }
      })
      .catch(() => setSelected(new Set(getDefaultPermissions(user.role))))
      .finally(() => setLoading(false));
  }, [open, user]);


  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(ALL_SIDEBAR_MODULES.map((m) => m.key)));
  const clearAll = () => setSelected(new Set());

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/dynamic-access/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, modules: Array.from(selected) }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({ title: "Permissions saved", description: `Access updated for ${user.username}` });
      window.dispatchEvent(new CustomEvent('permissions_updated', { detail: { userId: user.id } }));
      onSaved();
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to save permissions", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Assign Permissions
          </DialogTitle>
          {user && (
            <div className="text-sm text-muted-foreground mt-1">
              <span className="font-medium text-foreground">{user.username}</span>
              <Badge variant="outline" className="ml-2 capitalize">{user.role}</Badge>
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
              <Button variant="outline" size="sm" onClick={clearAll}>Clear All</Button>
              <span className="ml-auto text-xs text-muted-foreground self-center">
                {selected.size} / {ALL_SIDEBAR_MODULES.length} selected
              </span>
            </div>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {ALL_SIDEBAR_MODULES.map((mod) => (
                <label
                  key={mod.key}
                  className="flex items-center gap-3 rounded-md p-2 hover:bg-muted cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selected.has(mod.key)}
                    onCheckedChange={() => toggle(mod.key)}
                  />
                  <span className="text-sm font-medium">{mod.label}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
