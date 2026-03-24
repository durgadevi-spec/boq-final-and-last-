import React, { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import { RefreshCw, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface ArchiveItem {
  id: string;
  module: string;
  originId: string;
  data: any;
  status: "archived" | "trashed";
  archivedAt: string;
  trashedAt: string | null;
}

export default function Trash() {
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTrash = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/trash");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch trash:", err);
      toast({
        title: "Error",
        description: "Could not load trashed items.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrash();
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

  const handleDeletePermanent = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this item? This action CANNOT be undone.")) {
      return;
    }
    try {
      const res = await apiFetch(`/api/archive/${id}/permanent`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Deleted Permanently", description: "Item has been permanently deleted." });
        setItems(prev => prev.filter(item => item.id !== id));
      } else {
        throw new Error("Delete failed");
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete item permanently.", variant: "destructive" });
    }
  };

  const getItemName = (item: ArchiveItem) => {
    if (!item.data) return "Unknown Item";
    return item.data.name || item.data.title || item.data.code || item.originId;
  };

  const getDaysLeft = (trashedAt: string | null) => {
    if (!trashedAt) return 30;
    const daysPassed = differenceInDays(new Date(), new Date(trashedAt));
    return Math.max(0, 30 - daysPassed);
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Trash2 className="text-red-500 h-8 w-8" />
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Trash</h1>
          </div>
          <Button variant="outline" onClick={fetchTrash} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card className="border-red-100">
          <CardHeader className="border-b bg-red-50/50 flex flex-row items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h3 className="text-sm font-medium text-red-800">
              Items in Trash will be automatically and permanently deleted after 30 days.
            </h3>
          </CardHeader>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {loading ? "Loading..." : "Trash is empty."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3">Item Name</th>
                      <th className="px-6 py-3">Module</th>
                      <th className="px-6 py-3">Trashed Date</th>
                      <th className="px-6 py-3">Countdown</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const daysLeft = getDaysLeft(item.trashedAt);
                      return (
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
                            {item.trashedAt ? format(new Date(item.trashedAt), "PP") : "-"}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`font-semibold ${daysLeft <= 3 ? "text-red-600" : "text-orange-500"}`}>
                              {daysLeft} days left
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-green-600 border-green-200 hover:bg-green-50"
                                onClick={() => handleRestore(item.id)}
                              >
                                <RotateCcw className="h-4 w-4 mr-1" /> Restore
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeletePermanent(item.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-1" /> Delete Forever
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
