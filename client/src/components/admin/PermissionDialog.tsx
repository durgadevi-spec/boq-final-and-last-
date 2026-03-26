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
import { UserCog, Save, Loader2, ChevronRight } from "lucide-react";

import { ALL_SIDEBAR_MODULES, PERMISSION_GROUPS, getDefaultPermissions } from "@/lib/permissions";

interface PermissionDialogProps {
  user: { id: string; username: string; role: string; modules?: string[] } | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const labelMap = Object.fromEntries(ALL_SIDEBAR_MODULES.map((m) => [m.key, m.label]));

// Keys that are sub-permissions (indented under their parent)
const SUB_KEYS = new Set([
  "create_product_category",
  "create_product_subcategory",
  "create_product_product",
  "manage_product_work",
  "manage_product_approval",
]);

export function PermissionDialog({ user, open, onClose, onSaved }: PermissionDialogProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;

    if (user.modules && user.modules.length > 0) {
      setSelected(new Set(user.modules));
      return;
    }

    setLoading(true);
    apiFetch(`/api/admin/dynamic-access/permissions/${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.modules && data.modules.length > 0) {
          setSelected(new Set(data.modules));
        } else {
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
      window.dispatchEvent(new CustomEvent("permissions_updated", { detail: { userId: user.id } }));
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
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
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
            <div className="flex gap-2 mb-3 flex-wrap items-center">
              <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
              <Button variant="outline" size="sm" onClick={clearAll}>Clear All</Button>
              <span className="ml-auto text-xs text-muted-foreground self-center">
                {selected.size} / {ALL_SIDEBAR_MODULES.length} selected
              </span>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-5">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.section}>
                  {/* Section header */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {group.section}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <div className="space-y-1 pl-1">
                    {group.keys.map((key) => {
                      const isSub = SUB_KEYS.has(key);
                      const label = labelMap[key] || key;
                      return (
                        <label
                          key={key}
                          className={`flex items-start gap-3 rounded-md p-2 hover:bg-muted cursor-pointer transition-colors
                            ${isSub ? "pl-6 border-l-2 border-primary/20 ml-3 bg-muted/30" : ""}`}
                        >
                          <Checkbox
                            checked={selected.has(key)}
                            onCheckedChange={() => toggle(key)}
                            className="mt-0.5"
                          />
                          <div className="flex flex-col gap-0.5">
                            <span className={`text-sm font-medium ${isSub ? "text-muted-foreground" : ""}`}>
                              {isSub ? (
                                <span className="flex items-center gap-1">
                                  <ChevronRight className="h-3 w-3 text-primary/50 shrink-0" />
                                  {label.split("→")[1]?.trim() || label}
                                </span>
                              ) : label}
                            </span>
                            {isSub && (
                              <span className="text-[10px] text-muted-foreground/60">
                                Sub-permission of <span className="font-semibold">{label.split("→")[0]?.trim()}</span>
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
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
