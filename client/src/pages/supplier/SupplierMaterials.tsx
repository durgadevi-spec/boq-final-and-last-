import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { SupplierLayout } from "@/components/layout/SupplierLayout";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/lib/store";
import {
  AlertCircle,
  CheckCircle2,
  Package,
  Plus,
  Loader2,
  MessageSquare,
  Trash2,
} from "lucide-react";

interface MaterialTemplate {
  id: string;
  name: string;
  code: string;
  category?: string;
  subcategory?: string;
  sub_category?: string;
  vendor_category?: string;
  created_at: string;
}

interface Shop {
  id: string;
  name: string;
  location?: string;
}

const UNIT_OPTIONS = ["pcs", "kg", "meter", "sqft", "cum", "litre", "set", "nos"];
const Required = () => <span className="text-red-500 ml-1">*</span>;

export default function SupplierMaterials() {
  const { toast } = useToast();
  const { user, addSupportMessage, deleteMessage, supportMessages } = useData();
  const [activeTab, setActiveTab] = useState<"templates" | "submissions" | "support">("templates");
  const [shopName, setShopName] = useState("");
  const [shopLocation, setShopLocation] = useState("");

  // Support Message State
  const [supportSenderName, setSupportSenderName] = useState("");
  const [supportSenderInfo, setSupportSenderInfo] = useState("");
  const [supportMsg, setSupportMsg] = useState("");

  // Material Templates State
  const [templates, setTemplates] = useState<MaterialTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templatesSearch, setTemplatesSearch] = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<string>("");
  // list-only view: show a limited set of templates; use search to find others

  // Categories State
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Form State
  const [selectedTemplate, setSelectedTemplate] = useState<MaterialTemplate | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Multiple entries support: allow adding product entries before a bulk submit
  const [entriesList, setEntriesList] = useState<any[]>([]);

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

  // Load material templates on mount
  useEffect(() => {
    loadMaterialTemplates();
    loadShops();
    loadCategories();
    loadProducts();
    loadSupplierShops();
  }, []);

  const loadSupplierShops = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/supplier/my-shops", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const supplierShops = data.shops || [];

      // Get the first approved shop, or the first shop
      const primaryShop = supplierShops.find((s: Shop) => s.approved === true) || supplierShops[0];
      if (primaryShop) {
        setShopName(primaryShop.name);
        setShopLocation(primaryShop.location || "");
        // ensure submissions are tied to supplier's shop by default
        setSelectedShop(primaryShop.id);
      }
    } catch (error) {
      console.error("Error loading supplier shops:", error);
    }
  };

  const loadMaterialTemplates = async () => {
    try {
      const token = localStorage.getItem("authToken");
      console.log('[SupplierMaterials] loadMaterialTemplates token?', !!token);
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
      toast({
        title: "Error",
        description: "Failed to load shops",
        variant: "destructive",
      });
    }
  };

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const response = await fetch("/api/material-categories");
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Error loading categories:", error);
      // Non-critical, don't show error toast
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadSubcategories = async (category: string) => {
    if (!category) {
      setSubcategories([]);
      return;
    }
    try {
      const response = await fetch(`/api/material-subcategories/${encodeURIComponent(category)}`);
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

  const handleSelectTemplate = (template: MaterialTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      rate: "",
      unit: "",
      brandname: "",
      modelnumber: "",
      category: template.category || "",
      subcategory: template.subcategory || template.sub_category || "",
      product: "",
      technicalspecification: "",
      dimensions: "",
      finishtype: "",
      metaltype: "",
    });
    // For suppliers we keep their primary shop selected by default
    if (user?.role !== 'supplier') {
      setSelectedShop("");
    }
    // Load subcategories if template has a category
    if (template.category) {
      loadSubcategories(template.category);
    }
    // Scroll to form after a brief delay to ensure state is updated
    setTimeout(() => {
      const formElement = document.getElementById("material-form");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  // When both shop and template are selected, try to prefill form from existing approved materials
  useEffect(() => {
    const tryPrefill = async () => {
      if (!selectedTemplate || !selectedShop) return;
      try {
        // First try to get approved materials
        const res = await fetch('/api/materials');
        let found = null;

        if (res.ok) {
          const data = await res.json();
          const materials = data.materials || [];
          // find material by template_id and shop_id
          found = materials.find((m: any) => String(m.template_id) === String(selectedTemplate.id) && String(m.shop_id) === String(selectedShop));
        }

        // If not found in approved, check user's submissions
        if (!found) {
          const submissionRes = await fetch('/api/my-material-submissions');
          if (submissionRes.ok) {
            const data = await submissionRes.json();
            const submissions = data.submissions || [];
            // find submission by template_id and shop_id (most recent first)
            found = submissions.find((s: any) => String(s.template_id) === String(selectedTemplate.id) && String(s.shop_id) === String(selectedShop));
          }
        }

        if (found) {
          // Prefill form fields with the existing material's values (set empty string when not provided)
          setFormData(() => ({
            rate: found.rate != null ? String(found.rate) : "",
            unit: found.unit || "",
            brandname: found.brandname || "",
            modelnumber: found.modelnumber || "",
            category: found.category || "",
            subcategory: found.subcategory || "",
            product: found.product || "",
            technicalspecification: found.technicalspecification || "",
            dimensions: found.dimensions || "",
            finishtype: found.finishtype || "",
            metaltype: found.metaltype || "",
          }));
          // if category present, ensure subcategories loaded
          if (found.category) {
            await loadSubcategories(found.category);
          }
        } else {
          // No material found for this shop+template: clear shop-specific fields
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
        }
      } catch (err) {
        console.warn('prefill material failed', err);
      }
    };

    tryPrefill();
  }, [selectedShop, selectedTemplate]);

  const handleSubmitMaterial = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTemplate) {
      toast({ title: "Error", description: "Please select a template", variant: "destructive" });
      return;
    }

    if (!selectedShop) {
      toast({ title: "Error", description: "No shop selected for submission", variant: "destructive" });
      return;
    }

    if (!formData.rate || !formData.unit) {
      toast({ title: "Error", description: "Rate and unit are required", variant: "destructive" });
      return;
    }

    // We support submitting multiple entries at once. If user added entries via "Add Entry",
    // submit those; otherwise submit the current filled form as a single submission.
    const toSubmit: any[] = entriesList.length > 0 ? entriesList : [{
      template_id: selectedTemplate.id,
      shop_id: selectedShop,
      ...formData,
    }];

    setSubmitting(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      // Submit sequentially to keep server load predictable
      for (const payload of toSubmit) {
        const body = {
          template_id: payload.template_id,
          shop_id: payload.shop_id,
          rate: payload.rate,
          unit: payload.unit,
          brandname: payload.brandname,
          modelnumber: payload.modelnumber,
          subcategory: payload.subcategory,
          category: payload.category,
          product: payload.product,
          technicalspecification: payload.technicalspecification,
          dimensions: payload.dimensions,
          finishtype: payload.finishtype,
          metaltype: payload.metaltype,
        };
        const response = await fetch("/api/material-submissions", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Failed to submit material (${response.status}): ${text}`);
        }
      }

      toast({ title: "Success", description: "Material(s) submitted for approval" });

      // Reset form and entries
      setSelectedTemplate(null);
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
      // preserve supplier selected shop; clear only for non-suppliers
      if (user?.role !== 'supplier') {
        setSelectedShop("");
      }
      setEntriesList([]);
    } catch (error) {
      console.error("Error submitting material:", error);
      toast({ title: "Error", description: "Failed to submit material", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddEntry = () => {
    if (!selectedTemplate || !selectedShop) {
      toast({ title: "Error", description: "Please select a template and shop", variant: "destructive" });
      return;
    }
    if (!formData.rate || !formData.unit) {
      toast({ title: "Error", description: "Rate and unit are required to add entry", variant: "destructive" });
      return;
    }

    const entry = {
      template_id: selectedTemplate.id,
      shop_id: selectedShop,
      ...formData,
    };
    setEntriesList((s) => [...s, entry]);

    // Clear product-specific fields but keep template and shop selected for adding more
    setFormData((prev) => ({ ...prev, rate: "", unit: "", brandname: "", modelnumber: "", subcategory: "", product: "", technicalspecification: "", dimensions: "", finishtype: "", metaltype: "" }));
  };

  const handleRemoveEntry = (index: number) => {
    setEntriesList((s) => s.filter((_, i) => i !== index));
  };

  const handleSupportSubmit = () => {
    if (!supportMsg || !supportSenderName) {
      toast({
        title: "Error",
        description: "Sender name and message are required",
        variant: "destructive",
      });
      return;
    }
    (async () => {
      try {
        await addSupportMessage?.(supportSenderName, supportMsg, supportSenderInfo);
        toast({
          title: "Request Sent",
          description: "Message sent to Admin & Software Team.",
        });
        setSupportMsg("");
        setSupportSenderName("");
        setSupportSenderInfo("");
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to send message",
          variant: "destructive",
        });
      }
    })();
  };

  const isSupplier = user?.role === 'supplier';
  const layoutWrapper = isSupplier ? SupplierLayout : Layout;
  const LayoutComponent = layoutWrapper as any;

  return (
    <LayoutComponent {...(isSupplier ? { shopName, shopLocation, shopApproved: true } : {})}>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <div className={isSupplier ? "mb-8 bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400 rounded-xl p-8 text-white shadow-lg" : "mb-8"}>
          <h1 className={isSupplier ? "text-4xl font-bold mb-2" : "text-3xl font-bold mb-2"}>📦 Manage Materials</h1>
          <p className={isSupplier ? "text-blue-50" : "text-gray-600"}>
            {isSupplier
              ? "Select from available material templates, fill in the essentials (rate, unit, brand), and submit for approval"
              : "Select material templates, fill in all required details, select shop, and submit for approval"
            }
          </p>
        </div>

        <div className="grid gap-8">
          {/* Available Templates Section */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Package className="w-5 h-5 text-blue-600" />
              <h2 className="text-2xl font-bold text-gray-800">Available Templates</h2>
              <Badge className="bg-blue-100 text-blue-700">{templates.length} Total</Badge>
            </div>

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
                  <Select value={vendorCategoryFilter} onValueChange={setVendorCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(templates.map(t => t.vendor_category).filter(Boolean))).map((category: any) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {loadingTemplates ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : templates.length === 0 ? (
              <Card className="border-dashed border-2 border-gray-300">
                <CardContent className="pt-8 pb-8 text-center">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <div className="text-gray-500 font-medium">No material templates available yet</div>
                </CardContent>
              </Card>
            ) : (
              <div className="border rounded-md max-h-[400px] overflow-y-auto shadow-sm bg-white divide-y">
                <div className="">
                  {templates
                    .filter(t => (t.name + ' ' + t.code + ' ' + (t.category || '')).toLowerCase().includes(templatesSearch.toLowerCase()))
                    .filter(t => !vendorCategoryFilter || t.vendor_category === vendorCategoryFilter)
                    .map((template) => (
                      <div key={template.id} className="py-1 px-3 border-b last:border-0 hover:bg-blue-50 transition-all duration-200 cursor-pointer group flex items-center gap-4">
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                          <span className="font-semibold text-gray-800 group-hover:text-blue-700 truncate">{template.name}</span>
                          <span className="text-xs text-gray-500 whitespace-nowrap">({template.code})</span>
                          {template.category && (<span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 border border-gray-200 whitespace-nowrap">{template.category}</span>)}
                          <Button size="sm" className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white ml-2 shrink-0" onClick={(e) => { e.stopPropagation(); handleSelectTemplate(template); }}>Select</Button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )
            }
          </div>

          {/* Submission Form Section */}
          {selectedTemplate && (
            <Card id="material-form" className="bg-gradient-to-br from-white to-blue-50 border-blue-200 border-2 shadow-lg scroll-mt-20">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-t-lg">
                <CardTitle className="text-2xl">✨ Submit Material Details</CardTitle>
                <CardDescription className="text-blue-100">
                  Completing submission for: <strong className="text-white">{selectedTemplate.name}</strong> ({selectedTemplate.code})
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-8">
                <form onSubmit={handleSubmitMaterial} className="space-y-8">
                  {/* Shop Details Section */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">🏪 Your Shop</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="font-semibold text-gray-700">
                          Shop <Required />
                        </Label>
                        {user?.role === 'supplier' ? (
                          <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200 font-medium text-gray-800">{shopName}</div>
                        ) : (
                          <Select value={selectedShop} onValueChange={setSelectedShop}>
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Select a shop" />
                            </SelectTrigger>
                            <SelectContent>
                              {shops.map((shop) => (
                                <SelectItem key={shop.id} value={shop.id}>
                                  {shop.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Essential Details Section */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">💰 Essential Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="font-semibold text-gray-700">
                          Rate <Required />
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Enter rate"
                          value={formData.rate}
                          onChange={(e) =>
                            setFormData({ ...formData, rate: e.target.value })
                          }
                          className="mt-2"
                        />
                      </div>

                      <div>
                        <Label className="font-semibold text-gray-700">
                          Unit <Required />
                        </Label>
                        <Select
                          value={formData.unit}
                          onValueChange={(value) =>
                            setFormData({ ...formData, unit: value })
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {UNIT_OPTIONS.map((unit) => (
                              <SelectItem key={unit} value={unit}>
                                {unit}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="md:col-span-2">
                        <Label className="font-semibold text-gray-700">Brand Name</Label>
                        <Input
                          placeholder="Enter brand name (optional)"
                          value={formData.brandname}
                          onChange={(e) =>
                            setFormData({ ...formData, brandname: e.target.value })
                          }
                          className="mt-2"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Model Number and Category */}
                  {user?.role !== 'supplier' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Model Number</Label>
                        <Input
                          placeholder="Enter model number"
                          value={formData.modelnumber}
                          onChange={(e) =>
                            setFormData({ ...formData, modelnumber: e.target.value })
                          }
                        />
                      </div>

                      <div>
                        <Label>
                          Category <Required />
                        </Label>
                        <Select
                          value={formData.category}
                          onValueChange={(value) => {
                            setFormData({ ...formData, category: value, subcategory: "" });
                            loadSubcategories(value);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Subcategory */}
                  {(user?.role !== 'supplier' || formData.category) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Subcategory</Label>
                        <Select
                          value={formData.subcategory}
                          onValueChange={(value) =>
                            setFormData({ ...formData, subcategory: value, product: "" })
                          }
                          disabled={!formData.category || subcategories.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={subcategories.length === 0 ? "No subcategories available" : "Select subcategory"} />
                          </SelectTrigger>
                          <SelectContent>
                            {subcategories.map((subcat) => (
                              <SelectItem key={subcat} value={subcat}>
                                {subcat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Product</Label>
                        <Select
                          value={formData.product}
                          onValueChange={(value) =>
                            setFormData({ ...formData, product: value })
                          }
                          disabled={!formData.subcategory || products.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={products.length === 0 ? "No products available" : "Select product"} />
                          </SelectTrigger>
                          <SelectContent>
                            {products
                              .filter((product: any) => product.subcategory === formData.subcategory)
                              .map((product: any) => (
                                <SelectItem key={product.id} value={product.name}>
                                  {product.name} {"(Subcategory: "}{product.subcategory_name}{")"}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Technical Specification */}
                  {(user?.role !== 'supplier' || formData.technicalspecification) && (
                    <div>
                      <Label>Technical Specification</Label>
                      <Textarea
                        placeholder="Enter technical specifications"
                        value={formData.technicalspecification}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            technicalspecification: e.target.value,
                          })
                        }
                        rows={4}
                      />
                    </div>
                  )}

                  {/* Dimensions, Finish Type, Material */}
                  {user?.role !== 'supplier' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>Dimensions</Label>
                        <Input
                          placeholder="Enter dimensions"
                          value={formData.dimensions}
                          onChange={(e) =>
                            setFormData({ ...formData, dimensions: e.target.value })
                          }
                        />
                      </div>

                      <div>
                        <Label>Finish Type</Label>
                        <Input
                          placeholder="e.g., matte, glossy, satin"
                          value={formData.finishtype}
                          onChange={(e) =>
                            setFormData({ ...formData, finishtype: e.target.value })
                          }
                        />
                      </div>

                      <div>
                        <Label>Material</Label>
                        <Input
                          placeholder="e.g., steel, copper, aluminum"
                          value={formData.metaltype}
                          onChange={(e) =>
                            setFormData({ ...formData, metaltype: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}

                  {/* Entries List (if any) */}
                  {entriesList.length > 0 && (
                    <div className="bg-white rounded-lg p-4 border border-green-200 bg-green-50">
                      <div className="font-semibold text-green-800 mb-4 flex items-center gap-2">
                        ✅ Entries to submit ({entriesList.length})
                      </div>
                      <div className="space-y-2">
                        {entriesList.map((entry, idx) => (
                          <div key={idx} className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white border-green-300 hover:bg-green-50 transition">
                            <div className="text-sm">
                              <div className="font-semibold text-gray-800">💵 Rate: {entry.rate} • 📏 Unit: {entry.unit}</div>
                              <div className="text-xs text-gray-600 mt-1">{entry.brandname ? `🏷️ ${entry.brandname}` : ''}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => {
                                setFormData({
                                  rate: entry.rate,
                                  unit: entry.unit,
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
                              }}>Edit</Button>
                              <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleRemoveEntry(idx)}>Remove</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Submit / Add Entry Buttons */}
                  <div className="flex gap-3 pt-4 border-t">
                    <Button type="button" onClick={handleAddEntry} variant="outline" className="gap-2 border-blue-300 hover:bg-blue-50 text-blue-700">
                      <Plus className="w-4 h-4" /> Add Another Entry
                    </Button>

                    <Button
                      type="submit"
                      disabled={submitting}
                      className="gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold"
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "✓"
                      )}
                      {submitting ? "Submitting..." : "Submit for Approval"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedTemplate(null)}
                      className="gap-2 text-gray-700 hover:bg-gray-100"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}


        </div>
      </div>
    </LayoutComponent>
  );
}
