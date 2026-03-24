import React, { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import { RefreshCw, Trash2, Archive as ArchiveIcon } from "lucide-react";
import { format } from "date-fns";

interface ArchiveItem {
  id: string;
  module: string;
  originId: string;
  data: any;
  status: "archived" | "trashed";
  archivedAt: string;
  trashedAt: string | null;
}

export default function Archive() {
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchArchive = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/archive");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch archive:", err);
      toast({
        title: "Error",
        description: "Could not load archived items.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArchive();
  }, []);

  const handleRestore = async (id: string) => {
    try {
      const res = await apiFetch(`/api/archive/${id}/restore`, { method: "POST" });
      if (res.ok) {
        toast({ title: "Item Restored", description: "The item has been restored successfully." });
        setItems(prev => prev.filter(item => item.id !== id));
      } else {
        throw new Error("Restore failed");
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to restore item.", variant: "destructive" });
    }
  };

  const handleTrash = async (id: string) => {
    try {
      const res = await apiFetch(`/api/archive/${id}/trash`, { method: "POST" });
      if (res.ok) {
        toast({ title: "Moved to Trash", description: "Item moved to trash successfully." });
        setItems(prev => prev.filter(item => item.id !== id));
      } else {
        throw new Error("Trash failed");
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to move item to trash.", variant: "destructive" });
    }
  };

  const getItemName = (item: ArchiveItem) => {
    if (!item.data) return "Unknown Item";
    return item.data.name || item.data.title || item.data.code || item.originId;
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ArchiveIcon className="text-gray-500 h-8 w-8" />
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Archive</h1>
          </div>
          <Button variant="outline" onClick={fetchArchive} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader className="border-b bg-gray-50/50">
            <h3 className="text-sm font-medium text-gray-500">
              Archived items are safely stored and hidden from normal views. You can restore them or move them to the trash.
            </h3>
          </CardHeader>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {loading ? "Loading..." : "No items in archive."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3">Item Name</th>
                      <th className="px-6 py-3">Module</th>
                      <th className="px-6 py-3">Archived Date</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="bg-white border-b hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {getItemName(item)}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary" className="capitalize">
                            {item.module.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {item.archivedAt ? format(new Date(item.archivedAt), "PPp") : "-"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-blue-600 border-blue-200 hover:bg-blue-50"
                              onClick={() => handleRestore(item.id)}
                            >
                              <RefreshCw className="h-4 w-4 mr-1" /> Restore
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleTrash(item.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" /> Trash
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
