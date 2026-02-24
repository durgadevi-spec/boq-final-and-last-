import React, { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getJSON, putJSON } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function ManageCategories() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const data = await getJSON("/api/materials");
        setMaterials(data.materials || []);
        setFiltered(data.materials || []);
      } catch (e) {
        console.error("Failed to load materials", e);
      }
    })();

    (async () => {
      try {
        const res = await getJSON("/api/material-categories");
        setCategories(res.categories || []);
      } catch (e) {
        console.error("Failed to load categories", e);
      }
    })();
  }, []);

  useEffect(() => {
    setFiltered(
      materials.filter((m) =>
        (m.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (m.code || "").toLowerCase().includes(search.toLowerCase()),
      ),
    );
  }, [search, materials]);

  useEffect(() => {
    if (!category) return setSubcategories([]);
    (async () => {
      try {
        const res = await getJSON(`/api/material-subcategories/${encodeURIComponent(category)}`);
        setSubcategories(res.subcategories || []);
      } catch (e) {
        console.error("Failed to load subcategories", e);
        setSubcategories([]);
      }
    })();
  }, [category]);

  const toggleSelect = (id: string) => {
    setSelectedIds((s) => ({ ...s, [id]: !s[id] }));
  };
  const [conflictQueue, setConflictQueue] = useState<any[]>([]);
  const [conflictIndex, setConflictIndex] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inProgress, setInProgress] = useState(false);

  const assignCategories = async () => {
    const ids = Object.keys(selectedIds).filter((k) => selectedIds[k]);
    if (ids.length === 0) {
      alert("Select at least one material");
      return;
    }
    if (!category) {
      alert("Select a category first");
      return;
    }

    setInProgress(true);

    const immediate: string[] = [];
    const conflicts: any[] = [];

    for (const id of ids) {
      const mat = materials.find((m) => m.id === id);
      if (!mat) continue;
      const existingCat = mat.category || "";
      const existingSub = mat.subcategory || mat.subCategory || "";
      if (existingCat) {
        conflicts.push({ id, mat, existingCat, existingSub });
      } else {
        immediate.push(id);
      }
    }

    // Update immediate ones in parallel
    await Promise.all(immediate.map(async (id) => {
      try {
        await putJSON(`/api/materials/${id}`, { category, subcategory: subcategory || "" });
      } catch (e) {
        console.error(`Failed to update material ${id}`, e);
      }
    }));

    if (conflicts.length > 0) {
      setConflictQueue(conflicts);
      setConflictIndex(0);
      setDialogOpen(true);
      // conflict processing will continue via dialog handlers
    } else {
      // done
      setInProgress(false);
      alert("Category assignment completed");
      try {
        const data = await getJSON("/api/materials");
        setMaterials(data.materials || []);
        setFiltered(data.materials || []);
        setSelectedIds({});
      } catch (e) {
        console.error("Failed to reload materials", e);
      }
    }
  };

  const processCurrentConflict = async (choice: "append" | "replace" | "cancel") => {
    const item = conflictQueue[conflictIndex];
    if (!item) return;

    if (choice === "cancel") {
      // abort processing remaining conflicts
      setDialogOpen(false);
      setConflictQueue([]);
      setConflictIndex(0);
      setInProgress(false);
      return;
    }

    const { id, mat, existingCat, existingSub } = item;
    let finalCat = category;
    let finalSub = subcategory || "";

    if (choice === "append") {
      const mergedCats = Array.from(new Set((existingCat + "," + category).split(',').map((s: string) => s.trim()).filter(Boolean)));
      finalCat = mergedCats.join(",");

      if (finalSub && existingSub) {
        const mergedSubs = Array.from(new Set((existingSub + "," + finalSub).split(',').map((s: string) => s.trim()).filter(Boolean)));
        finalSub = mergedSubs.join(",");
      } else if (!finalSub) {
        finalSub = existingSub;
      }
    } else if (choice === "replace") {
      finalSub = subcategory || "";
    }

    try {
      await putJSON(`/api/materials/${id}`, { category: finalCat, subcategory: finalSub });
    } catch (e) {
      console.error(`Failed to update material ${id}`, e);
    }

    const next = conflictIndex + 1;
    if (next >= conflictQueue.length) {
      // finished
      setDialogOpen(false);
      setConflictQueue([]);
      setConflictIndex(0);
      setInProgress(false);
      alert("Category assignment completed");
      try {
        const data = await getJSON("/api/materials");
        setMaterials(data.materials || []);
        setFiltered(data.materials || []);
        setSelectedIds({});
      } catch (e) {
        console.error("Failed to reload materials", e);
      }
    } else {
      setConflictIndex(next);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">Manage Categories</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Input placeholder="Search materials by name or code" value={search} onChange={(e: any) => setSearch(e.target.value)} />
          <Select value={category} onValueChange={(v: string) => setCategory(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={subcategory} onValueChange={(v: string) => setSubcategory(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select Subcategory" />
            </SelectTrigger>
            <SelectContent>
              {subcategories.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border rounded-md p-2 max-h-[520px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-muted-foreground">No approved materials found</div>
          ) : (
            filtered.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-2 border-b">
                <div className="flex items-center gap-3">
                  <Checkbox checked={!!selectedIds[m.id]} onCheckedChange={() => toggleSelect(m.id)} />
                  <div>
                    <div className="font-medium text-foreground">{m.name || m.code}</div>
                    <div className="text-xs text-muted-foreground">Code: {m.code} • Category: {m.category || "-"} • Subcategory: {m.subcategory || m.subCategory || "-"}</div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">{m.rate ? `Rate: ${m.rate}` : ""}</div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4">
          <Button onClick={assignCategories} className="mr-2">Assign Categories</Button>
        </div>
        {/* Conflict resolution dialog */}
        <Dialog open={dialogOpen} onOpenChange={(o) => setDialogOpen(o)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Category Conflict</DialogTitle>
              <DialogDescription>
                {/* show details for current conflict */}
                {conflictQueue[conflictIndex] ? (
                  <div className="text-sm">
                    Material "{conflictQueue[conflictIndex].mat.name || conflictQueue[conflictIndex].mat.code}" already has Category: "{conflictQueue[conflictIndex].existingCat}" and Subcategory: "{conflictQueue[conflictIndex].existingSub}".
                    <div className="mt-2">Choose <strong>Append</strong> to merge new selection with existing values, or <strong>Replace</strong> to overwrite.</div>
                  </div>
                ) : (
                  <div>No conflicts</div>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <div className="flex gap-2">
                <Button onClick={() => processCurrentConflict("append")}>Append</Button>
                <Button variant="outline" onClick={() => processCurrentConflict("replace")}>Replace</Button>
                <Button variant="ghost" onClick={() => processCurrentConflict("cancel")}>Cancel</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
