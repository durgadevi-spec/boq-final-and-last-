import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/lib/store";
import {
  Package,
  Plus,
  Loader2,
  AlertTriangle,
} from "lucide-react";

interface MaterialTemplate {
  id: string;
  name: string;
  code: string;
  category?: string;
  vendor_category?: string;
  created_at: string;
}

interface Shop {
  id: string;
  name: string;
  vendorCategory?: string;
}

const UNIT_OPTIONS = [
  "pcs", "kg", "meter", "sqft", "cum", "litre", "set", "nos",
  "Meters", "Square feet", "Numbers", "Square Meter", "Bags", "Running feet", "Running meter",
  "LS", "BOX", "LTR", "CQM", "cft", "ml", "DOZ", "PKT", "Man labour", "Points",
  "Roll", "Days", "Inches", "Hours", "Percentage", "Length", "Panel", "Drum", "Ft", "1 Pkt",
  "Job", "Units"
];
const Required = () => <span className="text-red-500 ml-1">*</span>;

export default function ManageMaterials() {
  const { toast } = useToast();
  const { user } = useData();

  const [templates, setTemplates] = useState<MaterialTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templatesSearch, setTemplatesSearch] = useState("");
  const [selectedVendorCategory, setSelectedVendorCategory] = useState("all-categories");
  const [vendorCategories, setVendorCategories] = useState<string[]>([]);

  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [selectedTemplate, setSelectedTemplate] = useState<MaterialTemplate | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [entriesList, setEntriesList] = useState<any[]>([]);

  // Rate loading state
  const [rateMessage, setRateMessage] = useState<{
    type: "success" | "info" | "none";
    text: string;
  }>({ type: "none", text: "" });
  const [loadingRate, setLoadingRate] = useState(false);

  // Edit entry state
  const [editingEntryIndex, setEditingEntryIndex] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    rate: "",
    unit: "",
    brandname: "",
    modelnumber: "",
    category: "",
    subcategory: "",
    product: "",
    technicalspecification: "",
    dimensions: "",
    finishtype: "",
    metaltype: "",
  });

  useEffect(() => {
    loadMaterialTemplates();
    loadShops();
    loadCategories();
    loadProducts();
  }, []);

  // Load vendor categories after templates are loaded
  useEffect(() => {
    if (templates.length > 0) {
      loadVendorCategories();
    }
  }, [templates]);

  const loadMaterialTemplates = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/material-templates", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error("Error loading templates:", error);
      toast({
        title: "Error",
        description: "Failed to load material templates",
        variant: "destructive",
      });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadShops = async () => {
    try {
      const response = await fetch("/api/shops");
      const data = await response.json();
      setShops(data.shops || []);
    } catch (error) {
      console.error("Error loading shops:", error);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetch("/api/material-categories");
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Error loading categories:", error);
    }
  };

  const loadSubcategories = async (category: string) => {
    if (!category) {
      setSubcategories([]);
      return;
    }
    try {
      const response = await fetch(
        `/api/material-subcategories/${encodeURIComponent(category)}`
      );
      const data = await response.json();
      setSubcategories(data.subcategories || []);
    } catch (error) {
      console.error("Error loading subcategories:", error);
      setSubcategories([]);
    }
  };

  const loadProducts = async () => {
    try {
      const response = await fetch("/api/products");
      const data = await response.json();
      setProducts(data.products || []);
    } catch (error) {
      console.error("Error loading products:", error);
      setProducts([]);
    }
  };

  const loadVendorCategories = async () => {
    try {
      // Get vendor categories from templates, not from shops
      const categories = Array.from(
        new Set(templates.map(t => t.vendor_category).filter(Boolean))
      ) as string[];
      setVendorCategories(categories);
    } catch (error) {
      console.error("Error loading vendor categories:", error);
      setVendorCategories([]);
    }
  };

  const handleSelectTemplate = (template: MaterialTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      rate: "",
      unit: "",
      brandname: "",
      modelnumber: "",
      category: template.category || "",
      subcategory: "",
      product: "",
      technicalspecification: "",
      dimensions: "",
      finishtype: "",
      metaltype: "",
    });
    // Don't clear selectedShop - keep it selected so prefill can work immediately

    if (template.category) {
      loadSubcategories(template.category);
    }

    setTimeout(() => {
      const formElement = document.getElementById("material-form");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  // When both shop and template are selected, automatically fetch the existing rate
  useEffect(() => {
    const fetchRate = async () => {
      if (!selectedTemplate || !selectedShop) {
        setRateMessage({ type: "none", text: "" });
        return;
      }

      setLoadingRate(true);
      try {
        const response = await fetch(
          `/api/material-rate?template_id=${encodeURIComponent(selectedTemplate.id)}&shop_id=${encodeURIComponent(selectedShop)}`
        );

        if (!response.ok) {
          console.warn('[ManageMaterials] Failed to fetch material rate');
          setRateMessage({ type: "none", text: "" });
          setLoadingRate(false);
          return;
        }

        const data = await response.json();
        console.log('[ManageMaterials] Rate fetch result:', data);

        if (data.found && data.material) {
          // Prefill form fields with the existing material's values
          setFormData((prev) => ({
            ...prev,
            rate: data.material.rate != null ? String(data.material.rate) : "",
            unit: data.material.unit || prev.unit || "",
            brandname: data.material.brandname || "",
            modelnumber: data.material.modelnumber || "",
            category: data.material.category || prev.category || "",
            subcategory: data.material.subcategory || "",
            product: data.material.product || "",
            technicalspecification: data.material.technicalspecification || "",
            dimensions: data.material.dimensions || "",
            finishtype: data.material.finishtype || "",
            metaltype: data.material.metaltype || "",
          }));

          // Load subcategories if category is present
          if (data.material.category) {
            await loadSubcategories(data.material.category);
          }

          // Show success message
          setRateMessage({
            type: "success",
            text: `✓ Existing Rate Loaded (${data.source === "approved" ? "Approved" : "Pending"})`,
          });
        } else {
          // No rate found: clear rate field but keep other template-specific data
          setFormData((prev) => ({
            ...prev,
            rate: "",
            unit: "",
            brandname: "",
            modelnumber: "",
            subcategory: "",
            product: "",
            technicalspecification: "",
            dimensions: "",
            finishtype: "",
            metaltype: "",
          }));

          setRateMessage({
            type: "info",
            text: "No rate found for this shop - enter a new rate",
          });
        }
      } catch (err) {
        console.warn('[ManageMaterials] Rate fetch error:', err);
        setRateMessage({ type: "none", text: "" });
      } finally {
        setLoadingRate(false);
      }
    };

    fetchRate();
  }, [selectedShop, selectedTemplate]);

  const handleSubmitMaterial = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTemplate || !selectedShop) {
      toast({
        title: "Error",
        description: "Please select a template and shop",
        variant: "destructive",
      });
      return;
    }

    let toSubmit: any[] = [];

    if (entriesList.length > 0) {
      const confirmSubmit = window.confirm(
        `Are you sure you want to submit ${entriesList.length} items for approval?`
      );
      if (!confirmSubmit) return;
      toSubmit = entriesList;
    } else {
      if (!formData.rate || !formData.unit) {
        toast({
          title: "Error",
          description: "Rate and unit are required",
          variant: "destructive",
        });
        return;
      }
      toSubmit = [
        {
          template_id: selectedTemplate.id,
          shop_id: selectedShop,
          ...formData,
        },
      ];
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      for (const payload of toSubmit) {
        const response = await fetch("/api/material-submissions", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Failed to submit material");
      }

      toast({
        title: "Success",
        description: `${toSubmit.length} material(s) submitted for approval`,
      });

      setSelectedTemplate(null);
      setEntriesList([]);
      setFormData({
        rate: "",
        unit: "",
        brandname: "",
        modelnumber: "",
        category: "",
        subcategory: "",
        product: "",
        technicalspecification: "",
        dimensions: "",
        finishtype: "",
        metaltype: "",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to submit material",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddEntry = () => {
    if (!selectedTemplate || !selectedShop) {
      toast({
        title: "Error",
        description: "Please select a template and shop",
        variant: "destructive",
      });
      return;
    }

    if (!formData.rate || !formData.unit) {
      toast({
        title: "Error",
        description: "Rate and unit are required",
        variant: "destructive",
      });
      return;
    }

    const entry = {
      template_id: selectedTemplate.id,
      shop_id: selectedShop,
      ...formData,
    };

    setEntriesList((s) => [...s, entry]);

    setFormData((prev) => ({
      ...prev,
      rate: "",
      unit: "",
      brandname: "",
      modelnumber: "",
      subcategory: "",
      product: "",
      technicalspecification: "",
      dimensions: "",
      finishtype: "",
      metaltype: "",
    }));

    toast({
      title: "Entry Added",
      description: "Item added to the submission list.",
    });
  };

  const handleRemoveEntry = (index: number) => {
    setEntriesList((s) => s.filter((_, i) => i !== index));
  };

  const handleEditEntry = (index: number) => {
    const entry = entriesList[index];
    setEditingEntryIndex(index);

    // Set the shop for this entry
    setSelectedShop(entry.shop_id || "");

    // Populate form with entry data
    setFormData({
      rate: entry.rate || "",
      unit: entry.unit || "",
      brandname: entry.brandname || "",
      modelnumber: entry.modelnumber || "",
      category: entry.category || "",
      subcategory: entry.subcategory || "",
      product: entry.product || "",
      technicalspecification: entry.technicalspecification || "",
      dimensions: entry.dimensions || "",
      finishtype: entry.finishtype || "",
      metaltype: entry.metaltype || "",
    });

    // Load subcategories if category exists
    if (entry.category) {
      loadSubcategories(entry.category);
    }

    // Scroll to form
    setTimeout(() => {
      const formElement = document.getElementById("material-form");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  const handleUpdateEntry = () => {
    if (editingEntryIndex === null) return;

    if (!formData.rate || !formData.unit) {
      toast({
        title: "Error",
        description: "Rate and unit are required",
        variant: "destructive",
      });
      return;
    }

    const updatedEntry = {
      template_id: selectedTemplate?.id || entriesList[editingEntryIndex].template_id,
      shop_id: selectedShop || entriesList[editingEntryIndex].shop_id,
      ...formData,
    };

    setEntriesList((prev) =>
      prev.map((entry, index) =>
        index === editingEntryIndex ? updatedEntry : entry
      )
    );

    // Clear form and editing state
    setFormData({
      rate: "",
      unit: "",
      brandname: "",
      modelnumber: "",
      category: selectedTemplate?.category || "",
      subcategory: "",
      product: "",
      technicalspecification: "",
      dimensions: "",
      finishtype: "",
      metaltype: "",
    });
    setEditingEntryIndex(null);

    toast({
      title: "Entry Updated",
      description: "Item updated in the submission list.",
    });
  };

  const handleCancelEdit = () => {
    setEditingEntryIndex(null);
    setSelectedShop(""); // Reset shop selection
    setFormData({
      rate: "",
      unit: "",
      brandname: "",
      modelnumber: "",
      category: selectedTemplate?.category || "",
      subcategory: "",
      product: "",
      technicalspecification: "",
      dimensions: "",
      finishtype: "",
      metaltype: "",
    });
  };

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Material Management</h1>
          <p className="text-gray-600">Select from available material templates and add your details</p>
        </div>

        <div className="grid gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold">Available Material Templates</h2>
            </div>

            {/* Search Filter Options */}
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm mb-2 block">Search Templates</Label>
                  <Input
                    value={templatesSearch}
                    onChange={(e) => setTemplatesSearch(e.target.value)}
                    placeholder="Search by name or code..."
                  />
                </div>
                <div>
                  <Label className="text-sm mb-2 block">Filter by Vendor Category</Label>
                  <Select value={selectedVendorCategory} onValueChange={setSelectedVendorCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 overflow-y-auto">
                      <SelectItem value="all-categories">All Categories</SelectItem>
                      {vendorCategories.map((vc) => (
                        <SelectItem key={vc} value={vc}>{vc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {loadingTemplates ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {templates
                  .filter((t) => {
                    const hay = (t.name + " " + t.code + " " + (t.category || "")).toLowerCase();
                    const matchesSearch = hay.includes(templatesSearch.toLowerCase());
                    const vendorField = t.vendor_category || "";
                    const matchesVendor = selectedVendorCategory === "all-categories" ? true : vendorField === selectedVendorCategory;
                    return matchesSearch && matchesVendor;
                  })
                  .slice(0, 12)
                  .map((template) => (
                    <div key={template.id} className="p-2 border-b bg-white hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 flex items-center gap-3">
                          <div className="font-medium text-sm">{template.name}</div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => handleSelectTemplate(template)}>Select</Button>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{template.code} {template.category && <span className="ml-2">• {template.category}</span>}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {selectedTemplate && (
            <Card id="material-form" className="scroll-mt-20 border-blue-200 shadow-sm">
              <CardHeader className="py-3 bg-blue-50/50">
                <CardTitle className="text-base">
                  {editingEntryIndex !== null ? "Edit Material Details" : "Submit Material Details"}
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  {editingEntryIndex !== null
                    ? `Editing item ${editingEntryIndex + 1} from submission queue`
                    : `Editing: ${selectedTemplate.name} (${selectedTemplate.code})`
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmitMaterial} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Shop <Required /></Label>
                      <Select value={selectedShop} onValueChange={setSelectedShop}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a shop" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72 overflow-y-auto">
                          {shops.map((shop) => (
                            <SelectItem key={shop.id} value={shop.id}>{shop.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Rate <Required /></Label>
                      <div className="flex gap-2 items-center">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.rate}
                          onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                          disabled={loadingRate}
                        />
                        {loadingRate && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                      </div>
                      {rateMessage.type === "success" && (
                        <p className="text-sm text-green-600 mt-1 font-medium">{rateMessage.text}</p>
                      )}
                      {rateMessage.type === "info" && (
                        <p className="text-sm text-amber-600 mt-1">{rateMessage.text}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Unit <Required /></Label>
                      <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72 overflow-y-auto">
                          {UNIT_OPTIONS.map((unit) => (
                            <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Brand Name</Label>
                      <Input
                        placeholder="Enter brand"
                        value={formData.brandname}
                        onChange={(e) => setFormData({ ...formData, brandname: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Model Number</Label>
                      <Input
                        placeholder="Enter model"
                        value={formData.modelnumber}
                        onChange={(e) => setFormData({ ...formData, modelnumber: e.target.value })}
                      />
                    </div>

                    <div>
                      <Label>Category</Label>
                      <Select value={formData.category} onValueChange={(v) => {
                        setFormData({ ...formData, category: v, subcategory: "" });
                        loadSubcategories(v);
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Subcategory</Label>
                      <Select value={formData.subcategory} onValueChange={(v) => setFormData({ ...formData, subcategory: v, product: "" })} disabled={!formData.category || subcategories.length === 0}>
                        <SelectTrigger>
                          <SelectValue placeholder={subcategories.length === 0 ? "No subcategories" : "Select subcategory"} />
                        </SelectTrigger>
                        <SelectContent>
                          {subcategories.map((subcat) => (
                            <SelectItem key={subcat} value={subcat}>{subcat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Product</Label>
                      <Select value={formData.product} onValueChange={(v) => setFormData({ ...formData, product: v })} disabled={!formData.subcategory || products.length === 0}>
                        <SelectTrigger>
                          <SelectValue placeholder={products.length === 0 ? "No products" : "Select product"} />
                        </SelectTrigger>
                        <SelectContent>
                          {products
                            .filter((p: any) => p.subcategory === formData.subcategory)
                            .map((p: any) => (
                              <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Technical Specification</Label>
                    <Textarea
                      placeholder="Material technical details..."
                      value={formData.technicalspecification}
                      onChange={(e) => setFormData({ ...formData, technicalspecification: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label>Dimensions</Label>
                      <Input placeholder="L x W x H" value={formData.dimensions} onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })} />
                    </div>
                    <div>
                      <Label>Finish</Label>
                      <Input placeholder="Matte/Glossy" value={formData.finishtype} onChange={(e) => setFormData({ ...formData, finishtype: e.target.value })} />
                    </div>
                    <div>
                      <Label>Metal</Label>
                      <Input placeholder="Steel/Iron" value={formData.metaltype} onChange={(e) => setFormData({ ...formData, metaltype: e.target.value })} />
                    </div>
                  </div>

                  {entriesList.length > 0 && (
                    <div className="mt-6 border rounded-lg overflow-hidden">
                      <div className="bg-slate-100 px-4 py-2 text-sm font-semibold flex justify-between items-center">
                        <span>Items in Submission Queue ({entriesList.length})</span>
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y">
                        {entriesList.map((entry, idx) => (
                          <div key={idx} className="flex items-center justify-between px-4 py-3 bg-white">
                            <div className="text-xs flex-1">
                              <div className="font-bold text-slate-700">Rate: {entry.rate} / {entry.unit}</div>
                              <div className="text-slate-500">
                                {entry.brandname || 'No Brand'} • {entry.category}
                                {entry.subcategory && ` • ${entry.subcategory}`}
                                {entry.product && ` • ${entry.product}`}
                              </div>
                              {entry.technicalspecification && (
                                <div className="text-slate-400 mt-1 truncate max-w-xs">
                                  {entry.technicalspecification}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 text-blue-600 hover:bg-blue-50"
                                onClick={() => handleEditEntry(idx)}
                                disabled={editingEntryIndex !== null}
                              >
                                Edit
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="text-red-500 h-8 hover:bg-red-50" onClick={() => handleRemoveEntry(idx)}>
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                    {editingEntryIndex !== null ? (
                      <>
                        <Button type="button" onClick={handleUpdateEntry} className="flex-1 gap-2 bg-green-600 hover:bg-green-700">
                          Update Entry
                        </Button>
                        <Button type="button" onClick={handleCancelEdit} variant="outline" className="flex-1">
                          Cancel Edit
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button type="button" onClick={handleAddEntry} variant="outline" className="flex-1 gap-2 border-blue-200 text-blue-700 hover:bg-blue-50">
                          <Plus className="w-4 h-4" /> Add to List
                        </Button>
                        <Button type="submit" disabled={submitting} className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700">
                          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          {entriesList.length > 0 ? `Submit ${entriesList.length} Items` : "Submit Single Item"}
                        </Button>
                      </>
                    )}
                    <Button type="button" variant="ghost" onClick={() => {
                      setSelectedTemplate(null);
                      setEditingEntryIndex(null);
                      setSelectedShop("");
                      setFormData({
                        rate: "",
                        unit: "",
                        brandname: "",
                        modelnumber: "",
                        category: "",
                        subcategory: "",
                        product: "",
                        technicalspecification: "",
                        dimensions: "",
                        finishtype: "",
                        metaltype: "",
                      });
                    }}>Cancel</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}