import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import { Pencil, Trash2, Plus, Search } from "lucide-react";

type VendorCategory = {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
};

export default function VendorCategories() {
    const { toast } = useToast();
    const [categories, setCategories] = useState<VendorCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Form state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
    });

    // Load categories
    const loadCategories = async () => {
        try {
            setLoading(true);
            const response = await apiFetch("/api/vendor-categories");
            if (response.ok) {
                const data = await response.json();
                setCategories(data.categories || []);
            }
        } catch (error) {
            console.error("Failed to load vendor categories:", error);
            toast({
                title: "Error",
                description: "Failed to load vendor categories",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCategories();
    }, []);

    // Handle create/update
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            toast({
                title: "Error",
                description: "Category name is required",
                variant: "destructive",
            });
            return;
        }

        // Check for duplicates before sending (redundant if checking inline, but good as a final guard)
        const isDuplicate = categories.some(
            (cat) => 
                cat.name.toLowerCase() === formData.name.trim().toLowerCase() && 
                cat.id !== editingId
        );

        if (isDuplicate) {
            // No toast needed here as it's shown inline
            return;
        }

        try {
            const method = editingId ? "PUT" : "POST";
            const url = editingId
                ? `/api/vendor-categories/${editingId}`
                : "/api/vendor-categories";

            const response = await apiFetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: editingId
                        ? "Vendor category updated successfully"
                        : "Vendor category created successfully",
                });

                // Reset form
                setFormData({ name: "", description: "" });
                setEditingId(null);

                // Reload categories
                loadCategories();
            } else {
                const data = await response.json();
                toast({
                    title: "Error",
                    description: data.message || "Failed to save vendor category",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Failed to save vendor category:", error);
            toast({
                title: "Error",
                description: "Failed to save vendor category",
                variant: "destructive",
            });
        }
    };

    // Handle edit
    const handleEdit = (category: VendorCategory) => {
        setEditingId(category.id);
        setFormData({
            name: category.name,
            description: category.description || "",
        });

        // Scroll to form
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // Handle delete
    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete "${name}"?`)) {
            return;
        }

        try {
            const response = await apiFetch(`/api/vendor-categories/${id}`, {
                method: "DELETE",
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Vendor category deleted successfully",
                });
                loadCategories();
            } else {
                const data = await response.json();
                toast({
                    title: "Error",
                    description: data.message || "Failed to delete vendor category",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Failed to delete vendor category:", error);
            toast({
                title: "Error",
                description: "Failed to delete vendor category",
                variant: "destructive",
            });
        }
    };

    // Handle cancel edit
    const handleCancel = () => {
        setEditingId(null);
        setFormData({ name: "", description: "" });
    };

    // Filter categories based on search
    const filteredCategories = categories.filter((cat) =>
        cat.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Layout>
            <div className="space-y-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight font-heading">
                        Vendor Categories
                    </h2>
                    <p className="text-muted-foreground">
                        Manage vendor categories for shops and materials
                    </p>
                </div>

                {/* Add/Edit Form */}
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {editingId ? "Edit" : "Add"} Vendor Category
                        </CardTitle>
                        <CardDescription>
                            {editingId
                                ? "Update the vendor category details"
                                : "Create a new vendor category"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">
                                        Category Name <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) =>
                                            setFormData({ ...formData, name: e.target.value })
                                        }
                                        placeholder="e.g., Fire Safety Goods & Service Supplier"
                                        required
                                    />
                                    {formData.name.trim() && categories.some(
                                        (cat) => 
                                            cat.name.toLowerCase() === formData.name.trim().toLowerCase() && 
                                            cat.id !== editingId
                                    ) && (
                                        <p className="text-xs text-red-600 mt-1">
                                            ⚠️ VENDOR CATEGORY ALREADY EXISTS
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description">Description</Label>
                                    <Textarea
                                        id="description"
                                        value={formData.description}
                                        onChange={(e) =>
                                            setFormData({ ...formData, description: e.target.value })
                                        }
                                        placeholder="Optional description"
                                        rows={1}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button type="submit">
                                    <Plus className="h-4 w-4 mr-2" />
                                    {editingId ? "Update" : "Add"} Category
                                </Button>
                                {editingId && (
                                    <Button type="button" variant="outline" onClick={handleCancel}>
                                        Cancel
                                    </Button>
                                )}
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* List of Categories */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>All Vendor Categories</CardTitle>
                                <CardDescription>
                                    {filteredCategories.length} categor{filteredCategories.length === 1 ? "y" : "ies"}
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Search className="h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search categories..."
                                    className="w-64"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <p className="text-muted-foreground text-center py-8">Loading...</p>
                        ) : filteredCategories.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">
                                {searchTerm ? "No categories found" : "No vendor categories yet. Add one above to get started."}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {filteredCategories.map((category) => (
                                    <div
                                        key={category.id}
                                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                                    >
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-foreground">
                                                {category.name}
                                            </h3>
                                            {category.description && (
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    {category.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleEdit(category)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => handleDelete(category.id, category.name)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </Layout>
    );
}
