import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useData, Material, Shop } from "@/lib/store";
import {
  Plus,
  Trash2,
  Building2,
  Package,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MapPin,
  Layers,
  Search,
  ChevronDown,
  ChevronUp,
  Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { postJSON, apiFetch } from "@/lib/api";
import { Link, useLocation } from "wouter";

/* 🔴 REQUIRED ASTERISK */
const Required = () => <span className="text-red-500 ml-1">*</span>;

const UNIT_OPTIONS = [
  "pcs", "kg", "meter", "sqft", "cum", "litre", "set", "nos",
  "Meters", "Square feet", "Numbers", "Square Meter", "Bags", "Running feet", "Running meter",
  "LS", "BOX", "LTR", "CQM", "cft", "ml", "DOZ", "PKT", "Man labour", "Points",
  "Roll", "Days", "Inches", "Hours", "Percentage", "Length", "Panel", "Drum", "Ft", "1 Pkt",
  "Job", "Units"
];

// Removed hardcoded CATEGORY_OPTIONS - will be dynamic now

const COUNTRY_CODES = [
  { code: "+91", country: "India" },
  { code: "+1", country: "USA" },
  { code: "+44", country: "UK" },
  { code: "+61", country: "Australia" },
  { code: "+971", country: "UAE" },
  { code: "+81", country: "Japan" },
  { code: "+49", country: "Germany" },
];

export default function AdminDashboard() {
  const { toast } = useToast();
  const {
    shops,
    materials,
    addShop,
    addMaterial,
    user,
    approvalRequests: shopRequests,
    setApprovalRequests: setShopRequests,
    supportMessages,
    submitShopForApproval,
    submitMaterialForApproval,
    approveShop,
    rejectShop,
    deleteShop,
    deleteMaterial,
    addSupportMessage,
    deleteMessage,
    materialApprovalRequests: materialRequests,
    setMaterialApprovalRequests: setMaterialRequests,
    supplierSubmissions,
    approveMaterial,
    rejectMaterial,
  } = useData();

  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  // ==== CATEGORIES & SUBCATEGORIES (Admin/Software Team Created) ====
  const [categories, setCategories] = useState<string[]>([]);
  const [disabledCategories, setDisabledCategories] = useState<string[]>([]);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState("");
  const [subCategories, setSubCategories] = useState<any[]>([]);

  // Load categories from API on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/categories');
        if (res.ok) {
          const data = await res.json();
          if (data?.categories) {
            setCategories(data.categories.sort((a: string, b: string) => a.localeCompare(b)));
          }
        }
      } catch (e) {
        console.warn('load categories failed', e);
      }
    })();
  }, []);

  // Load subcategories from API on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/subcategories-admin');
        if (res.ok) {
          const data = await res.json();
          if (data?.subcategories) {
            setSubCategories(data.subcategories.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")));
          }
        }
      } catch (e) {
        console.warn('load subcategories failed', e);
      }
    })();
  }, []);

  // Load products from API on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/products');
        if (res.ok) {
          const data = await res.json();
          if (data?.products) {
            const mapped = data.products.map((p: any) => mapProduct(p));
            setProducts(mapped.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")));
          }
        }
      } catch (e) {
        console.warn('load products failed', e);
      }
    })();
  }, []);

  // normalize product object from server (snake_case) to camelCase
  const mapProduct = (p: any) => ({
    ...p,
    taxCodeType: p.taxCodeType ?? p.tax_code_type ?? null,
    taxCodeValue: p.taxCodeValue ?? p.tax_code_value ?? "",
  });

  // NEW CATEGORY/SUBCATEGORY INPUT
  const [newCategory, setNewCategory] = useState("");
  const [newSubCategory, setNewSubCategory] = useState("");
  const [selectedCategoryForSubCategory, setSelectedCategoryForSubCategory] = useState("");

  // EDITING SUBCATEGORY STATE
  const [editingSubCategoryId, setEditingSubCategoryId] = useState<string | null>(null);
  const [editingSubCategoryName, setEditingSubCategoryName] = useState("");
  const [editingSubCategoryCategory, setEditingSubCategoryCategory] = useState("");

  // PRODUCTS STATE
  const [products, setProducts] = useState<any[]>([]);
  const [newProduct, setNewProduct] = useState({ name: "", subcategory: "", taxCodeType: null as 'hsn' | 'sac' | null, taxCodeValue: "", hsnCode: "", sacCode: "" });
  const [showAddSubInline, setShowAddSubInline] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [searchCategories, setSearchCategories] = useState("");
  const [searchSubCategories, setSearchSubCategories] = useState("");
  const [searchProducts, setSearchProducts] = useState("");

  const [filterSubCategoryByCategory, setFilterSubCategoryByCategory] = useState("all");
  const [filterProductByCategory, setFilterProductByCategory] = useState("all");
  const [filterProductBySubCategory, setFilterProductBySubCategory] = useState("all");

  const [showAddProductDialog, setShowAddProductDialog] = useState(false);

  // Handle Add Category
  const handleAddCategory = async () => {
    if (!newCategory.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      });
      return;
    }

    if (categories.includes(newCategory)) {
      toast({
        title: "Error",
        description: "This category already exists",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await postJSON('/categories', { name: newCategory });
      setCategories((prev: string[]) => [...prev, newCategory]);
      toast({
        title: "Success",
        description: `Category "${newCategory}" created`,
      });
      setNewCategory("");
    } catch (err: any) {
      console.error('add category error', err);
      toast({
        title: "Error",
        description: err?.message || 'Failed to create category',
        variant: "destructive",
      });
    }
  };

  // Handle Add SubCategory
  const handleAddSubCategory = async () => {
    if (!newSubCategory.trim()) {
      toast({
        title: "Error",
        description: "Sub-category name is required",
        variant: "destructive",
      });
      return;
    }

    if (!selectedCategoryForSubCategory) {
      toast({
        title: "Error",
        description: "Please select a category first",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await postJSON('/subcategories', {
        name: newSubCategory,
        category: selectedCategoryForSubCategory
      });

      const newSub = {
        id: res.subcategory.id,
        name: newSubCategory,
        category: selectedCategoryForSubCategory,
        createdAt: new Date().toISOString(),
      };

      setSubCategories((prev: any[]) => [...prev, newSub]);
      toast({
        title: "Success",
        description: `Sub-category "${newSubCategory}" created under ${selectedCategoryForSubCategory}`,
      });
      setNewSubCategory("");
    } catch (err: any) {
      console.error('add subcategory error', err);
      toast({
        title: "Error",
        description: err?.message || 'Failed to create subcategory',
        variant: "destructive",
      });
    }
  };

  // Get SubCategories for selected Category
  const getSubCategoriesForCategory = (category: string) => {
    return subCategories.filter((sc: any) => sc.category === category);
  };

  // Handle Add Product
  const handleAddProduct = async () => {
    if (!newProduct.name.trim()) {
      toast({
        title: "Error",
        description: "Product name is required",
        variant: "destructive",
      });
      return;
    }

    if (!newProduct.subcategory) {
      toast({
        title: "Error",
        description: "Subcategory is required",
        variant: "destructive",
      });
      return;
    }


    try {
      // Build payload: include HSN and SAC as separate fields if provided.
      const payload: any = {
        name: newProduct.name,
        subcategory: newProduct.subcategory,
      };
      if (newProduct.hsnCode && newProduct.hsnCode.trim()) payload.hsn_code = newProduct.hsnCode.trim();
      if (newProduct.sacCode && newProduct.sacCode.trim()) payload.sac_code = newProduct.sacCode.trim();

      const res = await postJSON('/products', payload);
      const newProd = res.product || res;
      setProducts((prev: any[]) => [...prev, mapProduct(newProd)]);
      toast({
        title: "Success",
        description: `Product "${newProduct.name}" created`,
      });
      setNewProduct({ name: "", subcategory: "", taxCodeType: null, taxCodeValue: "", hsnCode: "", sacCode: "" });
    } catch (err: any) {
      console.error('add product error', err);
      toast({
        title: "Error",
        description: err?.message || 'Failed to create product',
        variant: "destructive",
      });
    }
  };

  const handleCloneProduct = (product: any) => {
    setNewProduct({
      name: `${product.name} (Copy)`,
      subcategory: product.subcategory || "",
      taxCodeType: product.taxCodeType || null,
      taxCodeValue: product.taxCodeValue || "",
      hsnCode: product.hsn_code || product.hsnCode || "",
      sacCode: product.sac_code || product.sacCode || "",
    });
    setShowAddProductDialog(true);
  };

  // Handle Update Product
  const handleUpdateProduct = async () => {
    if (!editingProduct?.name?.trim()) {
      toast({
        title: "Error",
        description: "Product name is required",
        variant: "destructive",
      });
      return;
    }

    if (!editingProduct?.subcategory) {
      toast({
        title: "Error",
        description: "Subcategory is required",
        variant: "destructive",
      });
      return;
    }

    if (editingProduct.taxCodeType && !editingProduct.taxCodeValue?.trim()) {
      toast({ title: "Error", description: "Tax code value is required", variant: "destructive" });
      return;
    }

    try {
      const res = await apiFetch(`/products/${editingProduct.id}`, {
        method: 'PUT',
        body: JSON.stringify(editingProduct),
      });

      const updated = await res.json();
      const updatedProd = mapProduct(updated.product || updated);
      setProducts((prev: any[]) => prev.map((p: any) => p.id === editingProduct.id ? updatedProd : p));
      toast({
        title: "Success",
        description: `Product "${editingProduct.name}" updated`,
      });
      setEditingProduct(null);
    } catch (err: any) {
      console.error('update product error', err);
      toast({
        title: "Error",
        description: err?.message || 'Failed to update product',
        variant: "destructive",
      });
    }
  };

  // Handle Delete Product
  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;

    try {
      await apiFetch(`/products/${productId}`, { method: 'DELETE' });

      setProducts((prev: any[]) => prev.filter((p: any) => p.id !== productId));
      toast({
        title: "Success",
        description: 'Product deleted',
      });
    } catch (err: any) {
      console.error('delete product error', err);
      toast({
        title: "Error",
        description: err?.message || 'Failed to delete product',
        variant: "destructive",
      });
    }
  };

  // ==== MASTER MATERIALS STATE (created by Admin/Software Team with just name + code) ====
  const [masterMaterials, setMasterMaterials] = useState<any[]>([]);

  // Load master materials from API
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/material-templates');
        if (res.ok) {
          const data = await res.json();
          setMasterMaterials(data?.templates || []);
        }
      } catch (e) {
        console.warn('load master materials failed', e);
        setMasterMaterials([]);
      }
    })();
  }, []);

  // Local managed copies so admin can edit/delete/disable items in UI
  const [localMaterials, setLocalMaterials] = useState(() => [] as Array<any>);
  const [localShops, setLocalShops] = useState(() => [] as Array<any>);
  const [expandedShops, setExpandedShops] = useState<string[]>([]);
  const [masterSearch, setMasterSearch] = useState("");
  const [masterView, setMasterView] = useState<'grid' | 'list'>('grid');

  // Search inputs for dashboard lists
  const [shopSearch, setShopSearch] = useState<string>("");
  const [materialSearch, setMaterialSearch] = useState<string>("");

  // Toggle states for full-page lists
  const [showShopsList, setShowShopsList] = useState(false);
  const [showMaterialsList, setShowMaterialsList] = useState(false);

  const filteredShops = localShops.filter((s: any) => {
    if (!shopSearch) return true;
    const q = shopSearch.toLowerCase();
    return (
      (s.name || "").toLowerCase().includes(q) ||
      (s.location || "").toLowerCase().includes(q) ||
      (s.city || "").toLowerCase().includes(q)
    );
  });

  const filteredMaterials = localMaterials.filter((m: any) => {
    if (!materialSearch) return true;
    const q = materialSearch.toLowerCase();
    return (
      (m.name || "").toLowerCase().includes(q) ||
      (m.code || "").toLowerCase().includes(q)
    );
  });

  const [supportMsgs, setSupportMsgs] = useState<any[]>([]);

  useEffect(() => {
    // initialize local copies from store
    setLocalMaterials(materials || []);
  }, [materials]);

  useEffect(() => {
    setLocalShops(shops || []);
  }, [shops]);

  // Fetch vendor categories for dropdowns
  const [vendorCategories, setVendorCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchVendorCategories = async () => {
      try {
        const response = await apiFetch("/api/vendor-categories");
        if (response.ok) {
          const data = await response.json();
          setVendorCategories(data.categories || []);
        }
      } catch (error) {
        console.error("Failed to load vendor categories:", error);
      }
    };
    fetchVendorCategories();
  }, []);

  // ===== ADMIN/SOFTWARE TEAM: Master Material (Name + Code only) =====
  const [newMasterMaterial, setNewMasterMaterial] = useState<{
    name: string;
    code: string;
    vendorCategory: string;
    taxCodeType: 'hsn' | 'sac' | null;
    taxCodeValue: string;
  }>({
    name: "",
    code: "",
    vendorCategory: "",
    taxCodeType: null,
    taxCodeValue: "",
  });

  // Auto-generate code when admin enters material name
  useEffect(() => {
    if (newMasterMaterial.name) {
      const code =
        newMasterMaterial.name.substring(0, 3).toUpperCase() +
        "-" +
        Math.floor(1000 + Math.random() * 9000);
      setNewMasterMaterial((prev) => ({ ...prev, code }));
    }
  }, [newMasterMaterial.name]);

  const handleAddMasterMaterial = async () => {
    if (!newMasterMaterial.name.trim()) {
      toast({
        title: "Error",
        description: "Material Name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      // Persist the master material as a template so suppliers can pick it
      const payload: any = {
        name: newMasterMaterial.name.trim(),
        code: newMasterMaterial.code,
        vendorCategory: newMasterMaterial.vendorCategory.trim(),
        taxCodeType: newMasterMaterial.taxCodeType,
        taxCodeValue: newMasterMaterial.taxCodeValue.trim(),
      };

      const res = await postJSON('/material-templates', payload);
      const created = res.template || res;

      setMasterMaterials((prev: any[]) => [...prev, created]);

      toast({
        title: "Success",
        description: "Master material created. Suppliers can now use this.",
      });

      setNewMasterMaterial({
        name: "",
        code: "",
        vendorCategory: "",
        taxCodeType: null,
        taxCodeValue: ""
      });
    } catch (err: any) {
      console.error('create master material error', err);
      toast({
        title: "Error",
        description: err?.message || 'Failed to create master material',
        variant: "destructive",
      });
    }
  };

  const handleCloneMasterMaterial = (template: any) => {
    setNewMasterMaterial({
      name: `${template.name} (Copy)`,
      code: "", // Will be auto-generated by Effect on name change
      vendorCategory: template.vendor_category || "",
      taxCodeType: template.tax_code_type || null,
      taxCodeValue: template.tax_code_value || "",
    });
    // Scroll to the "Create Material" form at the top of the tab
    const element = document.getElementById("create-material-section");
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    toast({
      title: "Template Cloned",
      description: "Form pre-filled with template details. A new code will be generated automatically.",
    });
  };

  // ===== SUPPLIER: Detailed Material (Select from Master + Fill Details) =====
  const [selectedMasterId, setSelectedMasterId] = useState<string>("");

  const [newMaterial, setNewMaterial] = useState<Partial<Material & { vendorCategory?: string; taxCodeType?: 'hsn' | 'sac'; taxCodeValue?: string }>>({
    name: "",
    code: "",
    rate: 0,
    unit: "pcs",
    category: "",
    subCategory: "",
    product: "",
    brandName: "",
    modelNumber: "",
    technicalSpecification: "",
    dimensions: "",
    finish: "",
    metalType: "",
    vendorCategory: "",
    taxCodeType: undefined,
    taxCodeValue: "",
    shopId: "",
  });

  const handleSelectMasterMaterial = (masterId: string) => {
    const selected = masterMaterials.find((m: any) => m.id === masterId);
    if (selected) {
      setSelectedMasterId(masterId);
      setNewMaterial({
        ...newMaterial,
        name: selected.name,
        code: selected.code,
      });
    }
  };

  const handleAddMaterial = () => {
    if (!newMaterial.name || !newMaterial.rate || !newMaterial.category || !newMaterial.subCategory || !newMaterial.product) {
      toast({
        title: "Error",
        description: "Name, Rate, Category, Sub Category, and Product are required",
        variant: "destructive",
      });
      return;
    }

    // Determine Shop ID based on role
    let shopId = newMaterial.shopId || "";

    if (user?.role === "supplier" && user.shopId) {
      shopId = user.shopId;
    }

    if (!shopId || shopId === "1") {
      // If no shop selected and user is admin/purchase_team, default to first available shop or alert
      if (localShops.length > 0) {
        shopId = localShops[0].id;
      } else {
        toast({
          title: "Setup Required",
          description: "Please create at least one shop before adding materials.",
          variant: "destructive",
        });
        return;
      }
    }

    // Mock validation
    if (
      newMaterial.name.toLowerCase().includes("toy") ||
      newMaterial.name.toLowerCase().includes("game")
    ) {
      toast({
        title: "Warning Sent to Admin",
        description: "Irrelevant material detected. Flagged for review.",
        variant: "destructive",
      });
      return;
    }

    (async () => {
      try {
        const result = await submitMaterialForApproval({ ...newMaterial, shopId });
        if (result) {
          toast({
            title: "Success",
            description: "Material submitted for approval. Software team will review and approve/reject.",
          });
          // Refresh pending lists
          if (typeof refreshPendingApprovals === 'function') await refreshPendingApprovals();
          if (typeof refreshMaterials === 'function') await refreshMaterials();
        } else {
          toast({
            title: "Local Queue",
            description: "Server unreachable. Material saved locally and will sync when online.",
          });
        }
      } catch (err) {
        console.error('handleAddMaterial error', err);
        toast({
          title: "Error",
          description: "Failed to submit material",
          variant: "destructive",
        });
      }
    })();

    toast({
      title: "Success",
      description:
        "Material submitted for approval. Software team will review and approve/reject.",
    });

    // Reset form
    setNewMaterial({
      name: "",
      code: "",
      rate: 0,
      unit: "pcs",
      category: "",
      subCategory: "",
      product: "",
      brandName: "",
      modelNumber: "",
      technicalSpecification: "",
      shopId: "",
      dimensions: "",
      finish: "",
      metalType: "",
    });
    setSelectedMasterId("");
  };

  const handleEditMaterial = (mat: any) => {
    setEditingMaterialId(mat.id);
    setNewMaterial({
      name: mat.name || "",
      code: mat.code || "",
      rate: mat.rate || 0,
      unit: mat.unit || "pcs",
      // Handle various naming conventions from DB and frontend
      category: mat.category || "",
      subCategory: mat.subcategory || mat.sub_category || mat.subCategory || "",
      product: mat.product || "",
      brandName: mat.brandname || mat.brand_name || mat.brandName || "",
      modelNumber: mat.modelnumber || mat.model_number || mat.modelNumber || "",
      technicalSpecification: mat.technicalspecification || mat.technical_specification || mat.technicalSpecification || "",
      dimensions: mat.dimensions || "",
      finish: mat.finish || mat.finishtype || "",
      metalType: mat.metaltype || mat.metal_type || mat.metalType || "",
      // Ensure shopId is a string for the Select component
      shopId: mat.shop_id ? mat.shop_id.toString() : (mat.shopId ? mat.shopId.toString() : ""),
    });
  };

  const handleUpdateMaterial = async () => {
    if (!editingMaterialId) return;
    try {
      // try server update using PUT (server expects lowercased field names)
      try {
        // Map client camelCase fields to server expected keys
        const payload: any = {};
        if (newMaterial.name !== undefined) payload.name = newMaterial.name;
        if (newMaterial.code !== undefined) payload.code = newMaterial.code;
        if (newMaterial.rate !== undefined) payload.rate = newMaterial.rate;
        if (newMaterial.shopId !== undefined) payload.shop_id = newMaterial.shopId === "" ? null : newMaterial.shopId;
        if (newMaterial.unit !== undefined) payload.unit = newMaterial.unit;
        if (newMaterial.category !== undefined) payload.category = newMaterial.category;
        if (newMaterial.brandName !== undefined) payload.brandname = newMaterial.brandName;
        if (newMaterial.modelNumber !== undefined) payload.modelnumber = newMaterial.modelNumber;
        if (newMaterial.subCategory !== undefined) payload.subcategory = newMaterial.subCategory;
        if (newMaterial.product !== undefined) payload.product = newMaterial.product;
        if (newMaterial.technicalSpecification !== undefined) payload.technicalspecification = newMaterial.technicalSpecification;
        if (newMaterial.image !== undefined) payload.image = newMaterial.image;
        if (newMaterial.attributes !== undefined) payload.attributes = newMaterial.attributes;

        const res = await apiFetch(`/materials/${editingMaterialId}`, { method: 'PUT', body: JSON.stringify(payload) });
        if (res.ok) {
          const data = await res.json();
          const updatedRaw = data?.material || data;

          // normalize server material keys (snake_case) to client camelCase
          const normalized = {
            ...updatedRaw,
            shopId: updatedRaw.shop_id || updatedRaw.shopId || null,
            brandName: updatedRaw.brandname || updatedRaw.brandName || "",
            modelNumber: updatedRaw.modelnumber || updatedRaw.modelNumber || "",
            subCategory: updatedRaw.subcategory || updatedRaw.subCategory || "",
            technicalSpecification: updatedRaw.technicalspecification || updatedRaw.technicalSpecification || "",
            vendorCategory: updatedRaw.vendor_category || updatedRaw.vendorCategory || "",
            taxCodeType: updatedRaw.tax_code_type || updatedRaw.taxCodeType || null,
            taxCodeValue: updatedRaw.tax_code_value || updatedRaw.taxCodeValue || "",
          };

          // update local UI state with server response
          setLocalMaterials((prev: any[]) => prev.map((m: any) => (m.id === editingMaterialId ? { ...m, ...normalized } : m)));
        } else {
          // log server error body
          try { const txt = await res.text(); console.warn('[handleUpdateMaterial] server responded non-ok', res.status, txt); } catch { console.warn('[handleUpdateMaterial] server responded non-ok', res.status); }
          // fallback to applying locally
          setLocalMaterials((prev: any[]) => prev.map((m: any) => (m.id === editingMaterialId ? { ...m, ...newMaterial } : m)));
        }
      } catch (e) {
        console.warn('[handleUpdateMaterial] server update failed, applying locally', e);
        setLocalMaterials((prev: any[]) => prev.map((m: any) => (m.id === editingMaterialId ? { ...m, ...newMaterial } : m)));
      }

      toast({ title: 'Updated', description: 'Material details updated' });
      setEditingMaterialId(null);
      setNewMaterial({ name: '', code: '', rate: 0, unit: 'pcs', category: '', subCategory: '', product: '', brandName: '', modelNumber: '', technicalSpecification: '', dimensions: '', finish: '', metalType: '' });
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to update material', variant: 'destructive' });
    }
  };

  // State for new shop
  const [newShop, setNewShop] = useState<Partial<Shop>>({
    name: "",
    location: "",
    city: "",
    state: "",
    country: "",
    pincode: "",
    phoneCountryCode: "+91",
    contactNumber: "",
    gstNo: "",
    vendorCategory: "",
    rating: 5,
  });

  // Editing states
  const [editingShopId, setEditingShopId] = useState<string | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);

  // State for support message
  const [supportMsg, setSupportMsg] = useState("");
  const [supportSenderName, setSupportSenderName] = useState("");
  const [supportSenderInfo, setSupportSenderInfo] = useState("");

  const handleAddShop = () => {
    if (
      !newShop.name ||
      !newShop.phoneCountryCode ||
      !newShop.city ||
      !newShop.state ||
      !newShop.country ||
      !newShop.pincode
    ) {
      toast({
        title: "Error",
        description: "All fields are required (GST is optional)",
        variant: "destructive",
      });
      return;
    }

    (async () => {
      try {
        // Try to submit to server (requires auth). If it succeeds, use server id.
        let created: any = null;
        if (typeof submitShopForApproval === 'function') {
          created = await submitShopForApproval({ ...newShop });
        } else {
          console.warn('[handleAddShop] submitShopForApproval missing from useData; falling back to local save');
        }
        if (created && created.id) {
          const serverRequest = {
            id: created.id,
            shop: created,
            submittedBy: user?.name,
            submittedAt: new Date().toISOString(),
            status: "pending",
          };
          setShopRequests((prev: any[]) => [serverRequest, ...prev]);
          setActiveTab('approvals');
          toast({ title: "Success", description: "Shop submitted for approval (server)" });
        } else {
          // fallback to local pending request
          const newRequest = {
            id: Math.random().toString(),
            shop: { ...newShop },
            submittedBy: user?.name,
            submittedAt: new Date().toISOString(),
            status: "pending",
          };
          setShopRequests((prev: any[]) => [newRequest, ...prev]);
          setActiveTab('approvals');
          toast({ title: "Saved Locally", description: "Shop saved locally; will sync when server is available" });
        }
      } catch (err: any) {
        console.warn('submit shop failed', err);
        const msg = err?.message || String(err);
        const newRequest = {
          id: Math.random().toString(),
          shop: { ...newShop },
          submittedBy: user?.name,
          submittedAt: new Date().toISOString(),
          status: "pending",
        };
        setShopRequests((prev: any[]) => [newRequest, ...prev]);
        setActiveTab('approvals');
        if (msg.includes('401') || /unauthori/i.test(msg)) {
          toast({ title: "Saved Locally (Unauthorized)", description: "You are not logged in as admin — please log in to submit to server.", variant: 'destructive' });
        } else {
          toast({ title: "Saved Locally", description: `Shop saved locally; server submit failed: ${msg}`, variant: 'destructive' });
        }
      } finally {
        setNewShop({
          name: "",
          location: "",
          city: "",
          phoneCountryCode: "+91",
          contactNumber: "",
          state: "",
          country: "",
          pincode: "",
          gstNo: "",
          vendorCategory: "",
        });
        setEditingShopId(null);
      }
    })();
  };

  const handleEditShop = (shop: any) => {
    setEditingShopId(shop.id);
    setNewShop({
      name: shop.name || "",
      location: shop.location || "",
      city: shop.city || "",
      state: shop.state || "",
      country: shop.country || "",
      pincode: shop.pincode || "",
      // Handle naming variants
      phoneCountryCode: shop.phone_country_code || shop.phoneCountryCode || shop.phonecountrycode || "+91",
      contactNumber: shop.contact_number || shop.contactNumber || shop.contactnumber || shop.phone || shop.mobile || "",
      gstNo: shop.gst_no || shop.gstNo || shop.gstno || "",
      vendorCategory: shop.vendor_category || shop.vendorCategory || shop.vendorcategory || "",
      rating: shop.rating || 5,
    });
    // No redirect - keep on dashboard for inline editing
  };

  const handleUpdateShop = async () => {
    if (!editingShopId) return;
    try {
      // Use PUT for updates as expected by backend
      const res = await apiFetch(`/api/shops/${editingShopId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newShop)
      });

      if (!res.ok) {
        throw new Error(`Update failed: ${res.status}`);
      }

      // update local UI state
      setLocalShops((prev: any[]) => prev.map((s: any) => (s.id === editingShopId ? { ...s, ...newShop } : s)));
      toast({ title: 'Updated', description: 'Shop details updated' });
      setEditingShopId(null);
      setNewShop({
        name: '',
        location: '',
        city: '',
        phoneCountryCode: '+91',
        contactNumber: '',
        state: '',
        country: '',
        pincode: '',
        gstNo: '',
        vendorCategory: ''
      });
    } catch (err: any) {
      console.error('Update shop error:', err);
      toast({ title: 'Error', description: 'Failed to update shop', variant: 'destructive' });
    }
  };


  const handleApproveShop = (request: any) => {
    (async () => {
      try {
        const shopId = request?.shop?.id || request?.id;
        if (!shopId) {
          toast({ title: "Cannot Approve", description: "This shop is saved locally and has not been submitted to the server.", variant: 'destructive' });
          return;
        }
        await approveShop?.(shopId);
        setShopRequests((prev: any[]) => prev.filter((r: any) => r.id !== request.id));
        toast({ title: "Approved", description: "Shop has been approved and added to the system" });
      } catch (e) {
        toast({ title: "Error", description: "Failed to approve shop", variant: "destructive" });
      }
    })();
  };

  const handleRejectShop = (request: any) => {
    if (!rejectReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a rejection reason",
        variant: "destructive",
      });
      return;
    }
    (async () => {
      try {
        // The shop ID could be in request.shop.id or directly at request.id
        const shopId = request?.shop?.id || request?.id;
        if (!shopId) {
          setShopRequests((prev: any[]) => prev.filter((r: any) => r.id !== request.id));
          setRejectingId(null);
          setRejectReason("");
          toast({ title: "Removed", description: "Local shop request removed" });
          return;
        }
        await rejectShop?.(shopId, rejectReason);
        // Remove from local state immediately
        setShopRequests((prev: any[]) => prev.filter((r: any) => r.id !== request.id && r?.shop?.id !== shopId));
        setRejectingId(null);
        setRejectReason("");
        toast({ title: "Rejected", description: "Shop has been rejected and removed" });
      } catch (e) {
        toast({ title: "Error", description: "Failed to reject shop", variant: "destructive" });
      }
    })();
  };

  const handleApproveMaterial = (requestId: string) => {
    (async () => {
      try {
        const req = materialRequests.find((r: any) => r.id === requestId);
        await approveMaterial?.(requestId, req?.source);
        toast({ title: "Approved", description: "Material approved successfully" });
      } catch (e) {
        toast({ title: "Error", description: "Failed to approve material", variant: "destructive" });
      }
    })();
  };

  const handleRejectMaterial = (requestId: string) => {
    (async () => {
      try {
        const req = materialRequests.find((r: any) => r.id === requestId);
        await rejectMaterial?.(requestId, rejectReason, req?.source);
        setRejectingId(null);
        setRejectReason("");
        toast({ title: "Rejected", description: "Material rejected successfully" });
      } catch (e) {
        toast({ title: "Error", description: "Failed to reject material", variant: "destructive" });
      }
    })();
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

  const canViewSupportMessages =
    user?.role === "admin" || user?.role === "software_team" || user?.role === "purchase_team";

  const canManageShops =
    user?.role === "admin" ||
    user?.role === "software_team" ||
    user?.role === "supplier" ||
    user?.role === "purchase_team";

  const canAddMaterials =
    user?.role === "admin" ||
    user?.role === "supplier" ||
    user?.role === "purchase_team";

  const canAccessSupport = user?.role === "supplier" || user?.role === "user";

  const isAdminOrSoftwareTeam =
    user?.role === "admin" || user?.role === "software_team";

  const canViewCategories =
    user?.role === "admin" || user?.role === "software_team" || user?.role === "purchase_team" || user?.role === "pre_sales";

  const canManageCategories =
    user?.role === "admin" || user?.role === "software_team" || user?.role === "purchase_team" || user?.role === "pre_sales";

  const canCreateProduct = canManageCategories || user?.role === "pre_sales";

  // Allow presales users to manage products and subcategories (but not top-level categories)
  const canManageProducts = canManageCategories || user?.role === "pre_sales";
  const canManageSubcategories = canManageCategories || user?.role === "pre_sales";

  // Permission for viewing all tabs and edit/delete for admin, software_team, and purchase_team
  const canEditDelete =
    user?.role === "admin" || user?.role === "software_team" || user?.role === "purchase_team";

  // Permission for approve/reject - Admin, Software Team, and Purchase Team
  const canApproveReject =
    user?.role === "admin" || user?.role === "software_team" || user?.role === "purchase_team";

  // Controlled tab state based on URL ?tab= and location changes
  const [, loc] = useLocation();

  const computeTab = () => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t) return t;
    }
    // default to dashboard view
    return "dashboard";
  };

  const [activeTab, setActiveTab] = useState<string>(computeTab());

  // update activeTab when location changes (sidebar link navigation)
  useEffect(() => {
    setActiveTab(computeTab());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc]);

  // Also listen to history changes (pushState/replaceState/popstate) so query updates update the tab
  useEffect(() => {
    const update = () => setActiveTab(computeTab());

    // popstate covers browser navigation
    window.addEventListener("popstate", update);

    // monkey-patch pushState/replaceState to emit popstate so client-side navigations (wouter) are caught
    const origPush = history.pushState;
    const origReplace = history.replaceState;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (history as any).pushState = function (...args: any[]) {
      const res = origPush.apply(this, args);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return res;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (history as any).replaceState = function (...args: any[]) {
      const res = origReplace.apply(this, args);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return res;
    };

    // run once to sync
    update();

    return () => {
      window.removeEventListener("popstate", update);
      (history as any).pushState = origPush;
      (history as any).replaceState = origReplace;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight font-heading">
            {user?.role === "supplier"
              ? "Supplier Portal"
              : user?.role === "purchase_team"
                ? "Purchase Team Dashboard"
                : "Admin Dashboard"}
          </h2>
          <p className="text-muted-foreground">
            Manage your inventory and settings
          </p>
        </div>

        {/* Stats Overview (shown only on Dashboard tab) */}
        {activeTab === "dashboard" && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Shops
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{shops.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Materials
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{materials.length}</div>
                </CardContent>
              </Card>

            </div>

            {(isAdminOrSoftwareTeam || user?.role === "purchase_team") && (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="cursor-pointer select-none" onClick={() => setShowShopsList(!showShopsList)}>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="font-bold text-lg text-foreground flex items-center gap-2">
                          All Shops {showShopsList ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </CardTitle>
                        <CardDescription className="text-sm">List of registered shops</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  {showShopsList && (
                    <CardContent className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input
                          value={shopSearch}
                          onChange={(e) => setShopSearch(e.target.value)}
                          placeholder="Search shops by name, city or location..."
                          className="h-9"
                        />
                      </div>
                      <div className="max-h-[800px] overflow-y-auto pr-2 border rounded-md">
                        {filteredShops.length === 0 ? (
                          <p className="text-muted-foreground">No shops available</p>
                        ) : (
                          filteredShops.map((shop: any) => (
                            <div key={shop.id} className="p-3 border-b hover:bg-muted/30 transition-colors">
                              {editingShopId === shop.id ? (
                                <div className="space-y-4 p-2 bg-muted/20 rounded-lg">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <Label className="text-xs font-semibold">Shop Name</Label>
                                      <Input value={newShop.name || ''} onChange={(e) => setNewShop({ ...newShop, name: e.target.value })} placeholder="Shop Name" />
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold">Location</Label>
                                      <Input value={newShop.location || ''} onChange={(e) => setNewShop({ ...newShop, location: e.target.value })} placeholder="Location" />
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold">City</Label>
                                      <Input value={newShop.city || ''} onChange={(e) => setNewShop({ ...newShop, city: e.target.value })} placeholder="City" />
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold">Contact Number</Label>
                                      <Input value={newShop.contactNumber || ''} onChange={(e) => setNewShop({ ...newShop, contactNumber: e.target.value })} placeholder="Phone Number" />
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold">GST No</Label>
                                      <Input value={newShop.gstNo || ''} onChange={(e) => setNewShop({ ...newShop, gstNo: e.target.value })} placeholder="GST No" />
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold">Vendor Category</Label>
                                      <Select value={newShop.vendorCategory || ''} onValueChange={(v) => setNewShop({ ...newShop, vendorCategory: v })}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select Vendor Category" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-60 overflow-y-auto">
                                          {vendorCategories.map((vc: any) => (
                                            <SelectItem key={vc.id} value={vc.name}>{vc.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  <div className="flex gap-2 pt-2">
                                    <Button size="sm" onClick={handleUpdateShop}>Save Changes</Button>
                                    <Button size="sm" variant="ghost" onClick={() => { setEditingShopId(null); setNewShop({ name: '', location: '', city: '', phoneCountryCode: '+91', state: '', country: '', pincode: '', gstNo: '' }); }}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-start gap-3">
                                      <button
                                        onClick={() => setExpandedShops(prev => prev.includes(shop.id) ? prev.filter(id => id !== shop.id) : [...prev, shop.id])}
                                        aria-label={expandedShops.includes(shop.id) ? 'Collapse materials' : 'Expand materials'}
                                        className="p-1 mt-1"
                                      >
                                        {expandedShops.includes(shop.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                      </button>
                                      <div>
                                        <div className="font-bold text-lg text-foreground">{shop.name}</div>
                                        <div className="text-sm text-foreground/80">{shop.location}, {shop.city}</div>
                                        <div className="text-xs text-muted-foreground mt-1 font-medium">
                                          {(shop.phone_country_code || shop.phoneCountryCode || shop.phonecountrycode || '+91')}{" "}{(shop.contact_number || shop.contactNumber || shop.contactnumber || shop.phone || shop.mobile)} • {shop.gst_no || shop.gstNo || shop.gstno || 'No GST'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {canEditDelete && (
                                        <>
                                          <Button size="sm" variant="outline" onClick={() => handleEditShop(shop)}>Edit</Button>
                                          <Button size="sm" variant="ghost" onClick={() => setLocalShops((prev: any[]) => prev.map((s: any) => s.id === shop.id ? { ...s, disabled: !s.disabled } : s))}>
                                            {shop.disabled ? 'Enable' : 'Disable'}
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive"
                                            onClick={() => {
                                              if (!window.confirm(`Delete shop "${shop.name}"? This cannot be undone.`)) return;
                                              deleteShop(shop.id).then(() => {
                                                setLocalShops((prev: any[]) => prev.filter((p: any) => p.id !== shop.id));
                                                toast({ title: 'Deleted', description: `${shop.name} removed` });
                                              }).catch((err) => {
                                                toast({ title: 'Error', description: `Failed to delete ${shop.name}`, variant: 'destructive' });
                                              });
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {expandedShops.includes(shop.id) && (
                                    <div className="mt-2 pl-10">
                                      {localMaterials.filter((m: any) => String(m.shopId) === String(shop.id)).length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No materials for this shop</div>
                                      ) : (
                                        localMaterials
                                          .filter((m: any) => String(m.shopId) === String(shop.id))
                                          .map((mat: any) => (
                                            <div key={mat.id} className="flex items-center justify-between py-1">
                                              <div className="text-sm font-medium">{mat.name} <span className="text-xs text-muted-foreground ml-2">{mat.code || ''}</span></div>
                                              <div className="text-sm">₹{Number(mat.rate || 0).toLocaleString()}</div>
                                            </div>
                                          ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>

                <Card>
                  <CardHeader className="cursor-pointer select-none" onClick={() => setShowMaterialsList(!showMaterialsList)}>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="font-bold text-lg text-foreground flex items-center gap-2">
                          All Materials {showMaterialsList ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </CardTitle>
                        <CardDescription className="text-sm">Comprehensive material registry</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  {showMaterialsList && (
                    <CardContent className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input
                          value={materialSearch}
                          onChange={(e) => setMaterialSearch(e.target.value)}
                          placeholder="Search materials..."
                          className="h-9"
                        />
                      </div>
                      <div className="max-h-[800px] overflow-y-auto pr-2 border rounded-md">
                        {filteredMaterials.length === 0 ? (
                          <p className="text-muted-foreground">No materials available</p>
                        ) : (
                          filteredMaterials.map((mat: any) => (
                            <div key={mat.id} className="p-2 border-b">
                              {editingMaterialId === mat.id ? (
                                <div className="space-y-4 p-4 bg-muted/20 rounded-lg">
                                  <div className="font-bold text-base text-foreground pb-2 border-b">Editing: {mat.name}</div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <Label>Name</Label>
                                      <Input value={newMaterial.name || ''} onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })} />
                                    </div>
                                    <div>
                                      <Label>Code</Label>
                                      <Input value={newMaterial.code || ''} onChange={(e) => setNewMaterial({ ...newMaterial, code: e.target.value })} />
                                    </div>
                                    <div>
                                      <Label>Rate</Label>
                                      <Input type="number" value={newMaterial.rate || ''} onChange={(e) => setNewMaterial({ ...newMaterial, rate: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                    <div>
                                      <Label>Unit</Label>
                                      <Select value={newMaterial.unit || ''} onValueChange={(v) => setNewMaterial({ ...newMaterial, unit: v })}>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-60 overflow-y-auto">
                                          {UNIT_OPTIONS.map((c) => (
                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label>Category</Label>
                                      <Select value={newMaterial.category || ''} onValueChange={(v) => setNewMaterial({ ...newMaterial, category: v, subCategory: '' })}>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {categories.map((c: string) => (
                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label>Sub Category</Label>
                                      <Select value={newMaterial.subCategory || ''} onValueChange={(v) => setNewMaterial({ ...newMaterial, subCategory: v })}>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {getSubCategoriesForCategory(newMaterial.category || '').map((sc: any) => (
                                            <SelectItem key={sc.id} value={sc.name}>{sc.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label>Product</Label>
                                      <Select value={newMaterial.product || ''} onValueChange={(v) => setNewMaterial({ ...newMaterial, product: v })}>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {products.filter((p: any) => p.subcategory === newMaterial.subCategory).map((p: any) => (
                                            <SelectItem key={p.id} value={p.name}>{p.name} {"(Subcategory: "}{p.subcategory_name}{")"}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label>Brand Name</Label>
                                      <Input value={newMaterial.brandName || ''} onChange={(e) => setNewMaterial({ ...newMaterial, brandName: e.target.value })} />
                                    </div>
                                    <div>
                                      <Label>Model Number</Label>
                                      <Input value={newMaterial.modelNumber || ''} onChange={(e) => setNewMaterial({ ...newMaterial, modelNumber: e.target.value })} />
                                    </div>
                                    <div>
                                      <Label>Assigned Shop</Label>
                                      <Select value={newMaterial.shopId || ''} onValueChange={(v) => setNewMaterial({ ...newMaterial, shopId: v })}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select Shop" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {localShops.map((s: any) => (
                                            <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  <div>
                                    <Label>Technical Specification</Label>
                                    <Textarea value={newMaterial.technicalSpecification || ''} onChange={(e) => setNewMaterial({ ...newMaterial, technicalSpecification: e.target.value })} />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={handleUpdateMaterial}>Save Changes</Button>
                                    <Button size="sm" variant="ghost" onClick={() => { setEditingMaterialId(null); setNewMaterial({ name: '', code: '', rate: 0, unit: 'pcs', category: '', subCategory: '', product: '', brandName: '', modelNumber: '', technicalSpecification: '', dimensions: '', finish: '', metalType: '' }); }}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-bold text-base text-foreground">{mat.name}</div>
                                    <div className="text-xs text-muted-foreground">{mat.code} • ₹{mat.rate}/{mat.unit}</div>
                                    <div className="text-[10px] text-muted-foreground italic">
                                      Shop: {localShops.find(s => s.id === (mat.shopId || mat.shop_id))?.name || 'Unassigned'}
                                    </div>
                                    {(mat.technicalSpecification || mat.technicalspecification) && (
                                      <div className="text-[10px] text-blue-600 mt-1 line-clamp-2 max-w-md">
                                        Spec: {mat.technicalSpecification || mat.technicalspecification}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => setLocalMaterials((prev: any[]) => prev.map((m: any) => m.id === mat.id ? { ...m, disabled: !m.disabled } : m))}>
                                      {mat.disabled ? 'Enable' : 'Disable'}
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => handleEditMaterial(mat)}>Edit</Button>
                                    {canEditDelete && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive"
                                        onClick={() => {
                                          if (!window.confirm(`Delete material "${mat.name}"? This cannot be undone.`)) return;
                                          deleteMaterial(mat.id).then(() => {
                                            setLocalMaterials((prev: any[]) => prev.filter((p: any) => p.id !== mat.id));
                                            toast({ title: 'Deleted', description: `${mat.name} removed` });
                                          }).catch((err) => {
                                            toast({ title: 'Error', description: `Failed to delete ${mat.name}`, variant: 'destructive' });
                                          });
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              </div>
            )}

            {user?.role === 'supplier' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Available  Materials</CardTitle>
                    <CardDescription className="text-sm">Select a material </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Input value={(typeof masterSearch !== 'undefined') ? masterSearch : ''} onChange={(e) => setMasterSearch(e.target.value)} placeholder="Search templates..." />
                        <div className="inline-flex rounded-md shadow-sm" role="group">
                          <Button size="sm" variant={masterView === 'grid' ? undefined : 'ghost'} onClick={() => setMasterView('grid')}>Grid</Button>
                          <Button size="sm" variant={masterView === 'list' ? undefined : 'ghost'} onClick={() => setMasterView('list')}>List</Button>
                        </div>
                      </div>
                      <div />
                    </div>

                    {masterMaterials.length === 0 ? (
                      <p className="text-muted-foreground">No master materials yet</p>
                    ) : (
                      <div className="space-y-2">
                        {masterMaterials.map((mm: any) => (
                          <div key={mm.id} className="p-2 border-b flex items-center justify-between">
                            <div className="text-sm">{mm.name} <span className="text-xs text-muted-foreground ml-2">{mm.code}</span></div>
                            <Link href={`/admin/dashboard?tab=materials`}>
                              <span className="text-sm text-sidebar-primary">Use</span>
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val);
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.set("tab", val);
              window.history.replaceState({}, "", url.toString());
            }
          }}
          className="w-full"
        >
          {/* Tabs Navigation Hidden - Navigation through sidebar only */}

          {/* === CREATE PRODUCT TAB (Admin/Software Team can manage, Purchase Team can view) === */}
          {canViewCategories && (
            <TabsContent value="create-product" className="space-y-6 mt-4">
              {/* Create Categories Section */}
              <Card className="border-purple-200 bg-purple-50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-purple-900">Create Categories</CardTitle>
                      <CardDescription className="text-purple-800">Add new product categories</CardDescription>
                    </div>
                    {canCreateProduct && (<>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="bg-purple-600 hover:bg-purple-700">
                            <Plus className="h-4 w-4 mr-2" /> Add Category
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add New Category</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Category Name <Required /></Label>
                              <Input
                                value={newCategory}
                                onChange={(e) => setNewCategory(e.target.value)}
                                placeholder="e.g. Flooring, Roofing, Doors"
                              />
                            </div>
                            <Button
                              onClick={handleAddCategory}
                              className="w-full bg-purple-600 hover:bg-purple-700"
                            >
                              <Plus className="h-4 w-4 mr-2" /> Add Category
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>)}
                  </div>
                </CardHeader>
                <CardContent>
                  {showAddSubInline && (
                    <div className="space-y-2 p-3 border rounded mb-4 bg-white">
                      <Label>Select Category <Required /></Label>
                      <Select
                        value={selectedCategoryForSubCategory}
                        onValueChange={setSelectedCategoryForSubCategory}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a category..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-44">
                          {categories.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground">No categories available</div>
                          ) : (
                            categories.map((cat: string) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <div className="space-y-2">
                        <Label>Subcategory Name <Required /></Label>
                        <Input value={newSubCategory} onChange={(e) => setNewSubCategory(e.target.value)} placeholder="e.g. Commercial, Residential" />
                      </div>
                      <Button onClick={async () => { await handleAddSubCategory(); if (newSubCategory.trim()) { setShowAddSubInline(false); } }} className="bg-green-600 hover:bg-green-700">Add Subcategory</Button>
                    </div>
                  )}
                  <div className="mb-4">
                    <Input
                      value={searchCategories}
                      onChange={(e) => setSearchCategories(e.target.value)}
                      placeholder="Search categories..."
                    />
                  </div>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {categories.length === 0 ? (
                      <p className="text-center text-muted-foreground py-6">No categories created yet</p>
                    ) : (
                      categories
                        .filter(cat => cat.toLowerCase().includes(searchCategories.toLowerCase()))
                        .map((cat: string, idx: number) => {
                          const subCats = getSubCategoriesForCategory(cat);
                          return (
                            <div key={idx} className="p-4 border rounded-lg bg-white hover:border-purple-400 transition">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <Package className="h-5 w-5 text-purple-600" />
                                  <div>
                                    <span className="font-medium">{cat}</span>
                                    {subCats.length > 0 && (
                                      <span className="text-sm text-muted-foreground ml-2">
                                        ({subCats.length} subcategories)
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {canManageCategories && (
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => {
                                      setEditingCategory(cat);
                                      setEditingCategoryValue(cat);
                                    }}>
                                      Edit
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={async () => {
                                      if (!window.confirm(`Delete category "${cat}" and its subcategories? This cannot be undone.`)) return;
                                      try {
                                        await apiFetch(`/categories/${encodeURIComponent(cat)}`, { method: 'DELETE' });
                                        setCategories(prev => prev.filter(c => c !== cat));
                                        setSubCategories(prev => prev.filter(s => s.category !== cat));
                                        toast({ title: 'Deleted', description: `Category ${cat} removed` });
                                      } catch (err) {
                                        console.error('delete category error', err);
                                        toast({ title: 'Error', description: 'Failed to delete category', variant: 'destructive' });
                                      }
                                    }}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                                {editingCategory === cat && (
                                  <div className="mt-3 p-3 bg-gray-100 rounded border col-span-full">
                                    <div className="flex gap-2">
                                      <Input
                                        value={editingCategoryValue}
                                        onChange={(e) => setEditingCategoryValue(e.target.value)}
                                        placeholder="Category name"
                                        className="text-sm"
                                      />
                                      <Button size="sm" onClick={async () => {
                                        const oldName = editingCategory;
                                        const newName = editingCategoryValue.trim();
                                        if (!newName) {
                                          toast({ title: 'Error', description: 'Category name cannot be empty', variant: 'destructive' });
                                          return;
                                        }
                                        try {
                                          await apiFetch(`/categories/${encodeURIComponent(oldName)}`, {
                                            method: 'PUT',
                                            body: JSON.stringify({ name: newName }),
                                          });
                                          setCategories((prev: string[]) => prev.map((c: string) => c === oldName ? newName : c));
                                          setSubCategories((prev: any[]) => prev.map((s: any) => s.category === oldName ? { ...s, category: newName } : s));
                                          setEditingCategory(null);
                                          setEditingCategoryValue("");
                                          toast({ title: 'Success', description: `Category updated to ${newName}` });
                                        } catch (err) {
                                          console.error('update category error', err);
                                          toast({ title: 'Error', description: 'Failed to update category', variant: 'destructive' });
                                        }
                                      }}>Save</Button>
                                      <Button size="sm" variant="ghost" onClick={() => {
                                        setEditingCategory(null);
                                        setEditingCategoryValue("");
                                      }}>Cancel</Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Create Subcategories Section */}
              <Card className="border-green-200 bg-green-50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-green-900">Create Subcategories</CardTitle>
                      <CardDescription className="text-green-800">Add subcategories to your categories</CardDescription>
                    </div>
                    {canCreateProduct && (<>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="bg-green-600 hover:bg-green-700">
                            <Plus className="h-4 w-4 mr-2" /> Add Subcategory
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle></DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Select Category <Required /></Label>
                              <Select
                                value={selectedCategoryForSubCategory}
                                onValueChange={setSelectedCategoryForSubCategory}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a category..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-64">
                                  {categories.length === 0 ? (
                                    <div className="p-2 text-sm text-muted-foreground">No categories available</div>
                                  ) : (
                                    categories.map((cat: string) => (
                                      <SelectItem key={cat} value={cat}>
                                        {cat}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Subcategory Name <Required /></Label>
                              <Input
                                value={newSubCategory}
                                onChange={(e) => setNewSubCategory(e.target.value)}
                                placeholder="e.g. Commercial, Residential"
                              />
                            </div>
                            <Button
                              onClick={handleAddSubCategory}
                              className="w-full bg-green-600 hover:bg-green-700"
                            >
                              <Plus className="h-4 w-4 mr-2" /> Add Subcategory
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>

                    </>)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                      <Input
                        value={searchSubCategories}
                        onChange={(e) => setSearchSubCategories(e.target.value)}
                        placeholder="Search subcategories..."
                      />
                    </div>
                    <div className="w-full md:w-64">
                      <Select
                        value={filterSubCategoryByCategory}
                        onValueChange={setFilterSubCategoryByCategory}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Filter by Category" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="all">All Categories</SelectItem>
                          {categories.map((cat: string) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {subCategories.length === 0 ? (
                      <p className="text-center text-muted-foreground py-6">No subcategories created yet</p>
                    ) : (
                      subCategories
                        .filter(sub => (filterSubCategoryByCategory === "all" || sub.category === filterSubCategoryByCategory) && sub.name.toLowerCase().includes(searchSubCategories.toLowerCase()))
                        .map((sub: any) => (
                          <div key={sub.id} className="p-4 border rounded-lg bg-white hover:border-green-400 transition">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Layers className="h-5 w-5 text-green-600" />
                                <div>
                                  <span className="font-medium">{sub.name}</span>
                                  <span className="text-sm text-muted-foreground ml-2">
                                    (Category: {sub.category})
                                  </span>
                                </div>
                              </div>
                              {canManageSubcategories && (
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => {
                                    setEditingSubCategoryId(sub.id);
                                    setEditingSubCategoryName(sub.name);
                                    setEditingSubCategoryCategory(sub.category);
                                  }}>
                                    Edit
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={async () => {
                                    if (!window.confirm(`Delete subcategory "${sub.name}"? This cannot be undone.`)) return;
                                    try {
                                      const res = await apiFetch(`/subcategories/${sub.id}`, { method: 'DELETE' });
                                      if (res.ok) {
                                        setSubCategories(prev => prev.filter(s => s.id !== sub.id));
                                        toast({ title: 'Deleted', description: `Subcategory ${sub.name} removed` });
                                      } else {
                                        toast({ title: 'Error', description: 'Failed to delete subcategory', variant: 'destructive' });
                                      }
                                    } catch (err) {
                                      console.error('delete subcategory error', err);
                                      toast({ title: 'Error', description: 'Failed to delete subcategory', variant: 'destructive' });
                                    }
                                  }}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                              {editingSubCategoryId === sub.id && (
                                <div className="mt-3 p-3 bg-gray-100 rounded border col-span-full w-full space-y-3">
                                  <div>
                                    <Label className="text-sm">Category</Label>
                                    <Select
                                      value={editingSubCategoryCategory}
                                      onValueChange={setEditingSubCategoryCategory}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Choose a category..." />
                                      </SelectTrigger>
                                      <SelectContent className="max-h-64">
                                        {categories.map((cat: string) => (
                                          <SelectItem key={cat} value={cat}>
                                            {cat}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-sm">Subcategory Name</Label>
                                    <Input
                                      value={editingSubCategoryName}
                                      onChange={(e) => setEditingSubCategoryName(e.target.value)}
                                      placeholder="Subcategory name"
                                      className="text-sm"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={async () => {
                                      const newName = editingSubCategoryName.trim();
                                      if (!newName) {
                                        toast({ title: 'Error', description: 'Subcategory name cannot be empty', variant: 'destructive' });
                                        return;
                                      }
                                      if (!editingSubCategoryCategory) {
                                        toast({ title: 'Error', description: 'Please select a category', variant: 'destructive' });
                                        return;
                                      }
                                      try {
                                        const res = await apiFetch(`/subcategories/${sub.id}`, {
                                          method: 'PUT',
                                          body: JSON.stringify({ name: newName, category: editingSubCategoryCategory }),
                                        });
                                        if (res.ok) {
                                          setSubCategories(prev => prev.map(s => s.id === sub.id ? { ...s, name: newName, category: editingSubCategoryCategory } : s));
                                          setEditingSubCategoryId(null);
                                          setEditingSubCategoryName("");
                                          setEditingSubCategoryCategory("");
                                          toast({ title: 'Success', description: `Subcategory updated` });
                                        }
                                      } catch (err) {
                                        console.error('update subcategory error', err);
                                        toast({ title: 'Error', description: 'Failed to update subcategory', variant: 'destructive' });
                                      }
                                    }}>Save</Button>
                                    <Button size="sm" variant="ghost" onClick={() => {
                                      setEditingSubCategoryId(null);
                                      setEditingSubCategoryName("");
                                      setEditingSubCategoryCategory("");
                                    }}>Cancel</Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Create Products Section */}
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-blue-900">Create Products</CardTitle>
                      <CardDescription className="text-blue-800">Add new products and assign subcategories</CardDescription>
                    </div>
                    {canCreateProduct && (<>
                      <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
                        <DialogTrigger asChild>
                          <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="h-4 w-4 mr-2" /> Add Product
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add New Product</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Product Name <Required /></Label>
                              <Input
                                value={newProduct.name}
                                onChange={(e) =>
                                  setNewProduct((prev) => ({ ...prev, name: e.target.value }))
                                }
                                placeholder="e.g. Ceramic Tiles, Wooden Door"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Select Subcategory <Required /></Label>
                              <Select
                                value={newProduct.subcategory}
                                onValueChange={(value) =>
                                  setNewProduct((prev) => ({ ...prev, subcategory: value }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a subcategory..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-64">
                                  {subCategories.length === 0 ? (
                                    <div className="p-2 text-sm text-muted-foreground">No subcategories available</div>
                                  ) : (
                                    subCategories.map((sub: any) => (
                                      <SelectItem key={sub.id} value={sub.name}>
                                        {sub.name} <span className="text-xs text-muted-foreground">({sub.category})</span>
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            {/*
<div className="flex items-center justify-between">
  <small className="text-xs text-muted-foreground"></small>
  <Button
    size="sm"
    variant="ghost"
    onClick={() => setShowAddSubInline(prev => !prev)}
  >
    {showAddSubInline ? 'Cancel' : ''}
  </Button>
</div>
*/}

                            {showAddSubInline && (
                              <div className="space-y-2 p-3 border rounded">
                                <Label>Select Category <Required /></Label>
                                <Select
                                  value={selectedCategoryForSubCategory}
                                  onValueChange={setSelectedCategoryForSubCategory}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Choose a category..." />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-44">
                                    {categories.length === 0 ? (
                                      <div className="p-2 text-sm text-muted-foreground">No categories available</div>
                                    ) : (
                                      categories.map((cat: string) => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                                <div className="space-y-2">
                                  <Label>Subcategory Name <Required /></Label>
                                  <Input value={newSubCategory} onChange={(e) => setNewSubCategory(e.target.value)} placeholder="e.g. Commercial, Residential" />
                                </div>
                                <Button onClick={async () => {
                                  await handleAddSubCategory();
                                  // if created, set it as selected in product select
                                  if (newSubCategory.trim()) {
                                    setNewProduct(prev => ({ ...prev, subcategory: newSubCategory.trim() }));
                                    setShowAddSubInline(false);
                                  }
                                }} className="w-full bg-green-600 hover:bg-green-700">Add Subcategory</Button>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label>HSN Code</Label>
                                <Input value={newProduct.hsnCode} onChange={(e) => setNewProduct({ ...newProduct, hsnCode: e.target.value })} placeholder="Enter HSN code" />
                              </div>
                              <div className="space-y-2">
                                <Label>SAC Code</Label>
                                <Input value={newProduct.sacCode} onChange={(e) => setNewProduct({ ...newProduct, sacCode: e.target.value })} placeholder="Enter SAC code" />
                              </div>
                            </div>
                            <Button
                              onClick={async () => {
                                await handleAddProduct();
                                if (newProduct.name.trim() && newProduct.subcategory) {
                                  setShowAddProductDialog(false);
                                }
                              }}
                              className="w-full bg-blue-600 hover:bg-blue-700"
                            >
                              <Plus className="h-4 w-4 mr-2" /> Add Product
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                      <Input
                        value={searchProducts}
                        onChange={(e) => setSearchProducts(e.target.value)}
                        placeholder="Search products..."
                      />
                    </div>
                    <div className="w-full md:w-48">
                      <Select
                        value={filterProductByCategory}
                        onValueChange={(val) => {
                          setFilterProductByCategory(val);
                          setFilterProductBySubCategory("all");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Filter by Category" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="all">All Categories</SelectItem>
                          {categories.map((cat: string) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-full md:w-48">
                      <Select
                        value={filterProductBySubCategory}
                        onValueChange={setFilterProductBySubCategory}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Filter by Subcategory" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="all">All Subcategories</SelectItem>
                          {subCategories
                            .filter(sub => filterProductByCategory === "all" || sub.category === filterProductByCategory)
                            .map((sub: any) => (
                              <SelectItem key={sub.id} value={sub.name}>{sub.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {products.length === 0 ? (
                      <p className="text-center text-muted-foreground py-6">No products created yet</p>
                    ) : (
                      products
                        .filter(prod => {
                          const matchesSearch = prod.name.toLowerCase().includes(searchProducts.toLowerCase());
                          const matchesSubCategory = filterProductBySubCategory === "all" || prod.subcategory === filterProductBySubCategory;

                          // To match by category, we need to find the category of the product's subcategory
                          const prodSub = subCategories.find(s => s.name === prod.subcategory);
                          const matchesCategory = filterProductByCategory === "all" || (prodSub && prodSub.category === filterProductByCategory);

                          return matchesSearch && matchesSubCategory && matchesCategory;
                        })
                        .map((product: any) => (
                          <div key={product.id} className="p-4 border rounded-lg bg-white hover:border-blue-400 transition">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <Package className="h-5 w-5 text-blue-600" />
                                <div className="flex-1">
                                  <span className="font-medium block">{product.name}</span>
                                  <span className="text-sm text-muted-foreground">
                                    Subcategories: {product.subcategory || "-"}
                                  </span>
                                  {product.taxCodeType && product.taxCodeValue && (
                                    <div className="text-sm text-muted-foreground mt-1">
                                      {product.taxCodeType.toUpperCase()}: {product.taxCodeValue}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {canManageProducts && (
                                <div className="flex gap-2">
                                  <Button size="sm" variant="ghost" onClick={() => handleCloneProduct(product)} title="Clone Product">
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => {
                                    setEditingProduct(mapProduct(product));
                                  }}>
                                    Edit
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleDeleteProduct(product.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Edit Product Dialog */}
              {editingProduct && (
                <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Product</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Product Name <Required /></Label>
                        <Input
                          value={editingProduct.name}
                          onChange={(e) =>
                            setEditingProduct((prev: any) => ({ ...prev, name: e.target.value }))
                          }
                          placeholder="e.g. Ceramic Tiles, Wooden Door"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Select Subcategory <Required /></Label>
                        <Select
                          value={editingProduct.subcategory}
                          onValueChange={(value) =>
                            setEditingProduct((prev: any) => ({ ...prev, subcategory: value }))
                          }
                        >
                          <SelectTrigger className="max-h-64 overflow-y-auto">
                            <SelectValue placeholder="Select subcategory" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {subCategories.map((sub: any) => (
                              <SelectItem key={sub.id} value={sub.name}>
                                {sub.name} ({sub.category})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Tax Code Type</Label>
                        <div className="flex gap-4 mt-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              id="edit-hsn"
                              name="editProductTaxCodeType"
                              value="hsn"
                              checked={editingProduct.taxCodeType === 'hsn'}
                              onChange={(e) => setEditingProduct((prev: any) => ({ ...prev, taxCodeType: e.target.value as 'hsn' | 'sac' }))}
                              className="w-4 h-4"
                            />
                            <Label htmlFor="edit-hsn" className="cursor-pointer mb-0">HSN Code</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              id="edit-sac"
                              name="editProductTaxCodeType"
                              value="sac"
                              checked={editingProduct.taxCodeType === 'sac'}
                              onChange={(e) => setEditingProduct((prev: any) => ({ ...prev, taxCodeType: e.target.value as 'hsn' | 'sac' }))}
                              className="w-4 h-4"
                            />
                            <Label htmlFor="edit-sac" className="cursor-pointer mb-0">SAC Code</Label>
                          </div>
                        </div>
                      </div>
                      {editingProduct.taxCodeType && (
                        <div className="space-y-2">
                          <Label>{editingProduct.taxCodeType === 'hsn' ? 'HSN' : 'SAC'} Code</Label>
                          <Input value={editingProduct.taxCodeValue || ''} onChange={(e) => setEditingProduct((prev: any) => ({ ...prev, taxCodeValue: e.target.value }))} placeholder={`Enter ${editingProduct.taxCodeType === 'hsn' ? 'HSN' : 'SAC'} code`} />
                        </div>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setEditingProduct(null)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            if (editingProduct.name.trim() && editingProduct.subcategory) {
                              handleUpdateProduct();
                              setEditingProduct(null);
                            } else {
                              toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
                            }
                          }}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </TabsContent>
          )}

          {/* === MATERIALS TAB === */}
          <TabsContent value="materials" className="space-y-4 mt-4">
            {/* ADMIN/SOFTWARE/PURCHASE_TEAM: Create Master Material */}
            {(isAdminOrSoftwareTeam || user?.role === "purchase_team") && (
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader>
                  <CardTitle className="text-blue-900" id="create-material-section">
                    <Package className="inline-block mr-2 h-4 w-4 text-blue-900" /> Create Material
                  </CardTitle>
                  <CardDescription className="text-blue-800">
                    Add new material templates for suppliers to use
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>
                        Item Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={newMasterMaterial.name}
                        onChange={(e) =>
                          setNewMasterMaterial({
                            ...newMasterMaterial,
                            name: e.target.value,
                          })
                        }
                        placeholder="Enter Item name"
                      />
                      {newMasterMaterial.name &&
                        masterMaterials.some((m: any) => m.name.toLowerCase().trim() === newMasterMaterial.name.toLowerCase().trim()) && (
                          <p className="text-xs text-red-600 mt-1">
                            ⚠️ This material name already exists
                          </p>
                        )}
                    </div>
                    <div className="space-y-2">
                      <Label>Item Code (Auto)</Label>
                      <Input
                        value={newMasterMaterial.code}
                        disabled
                        className="bg-muted"
                      />
                      {newMasterMaterial.code &&
                        masterMaterials.some((m: any) => m.code === newMasterMaterial.code) && (
                          <p className="text-xs text-red-600 mt-1">
                            ⚠️ This item code already exists
                          </p>
                        )}
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Vendor Category
                      </Label>
                      <Select
                        value={newMasterMaterial.vendorCategory}
                        onValueChange={(value) =>
                          setNewMasterMaterial({
                            ...newMasterMaterial,
                            vendorCategory: value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select vendor category" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px] overflow-y-auto">
                          {vendorCategories.length === 0 ? (
                            <SelectItem value="none" disabled>
                              No categories available
                            </SelectItem>
                          ) : (
                            vendorCategories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.name}>
                                {cat.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tax Code Type</Label>
                      <div className="flex gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id="hsn"
                            name="taxCodeType"
                            value="hsn"
                            checked={newMasterMaterial.taxCodeType === 'hsn'}
                            onChange={(e) =>
                              setNewMasterMaterial({
                                ...newMasterMaterial,
                                taxCodeType: e.target.value as 'hsn' | 'sac',
                              })
                            }
                            className="w-4 h-4"
                          />
                          <Label htmlFor="hsn" className="cursor-pointer mb-0">
                            HSN Code
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id="sac"
                            name="taxCodeType"
                            value="sac"
                            checked={newMasterMaterial.taxCodeType === 'sac'}
                            onChange={(e) =>
                              setNewMasterMaterial({
                                ...newMasterMaterial,
                                taxCodeType: e.target.value as 'hsn' | 'sac',
                              })
                            }
                            className="w-4 h-4"
                          />
                          <Label htmlFor="sac" className="cursor-pointer mb-0">
                            SAC Code
                          </Label>
                        </div>
                      </div>
                    </div>
                    {newMasterMaterial.taxCodeType && (
                      <div className="space-y-2">
                        <Label>
                          {newMasterMaterial.taxCodeType === 'hsn' ? 'HSN' : 'SAC'} Code <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          value={newMasterMaterial.taxCodeValue}
                          onChange={(e) =>
                            setNewMasterMaterial({
                              ...newMasterMaterial,
                              taxCodeValue: e.target.value,
                            })
                          }
                          placeholder={`Enter ${newMasterMaterial.taxCodeType === 'hsn' ? 'HSN' : 'SAC'} code`}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddMasterMaterial}
                      disabled={
                        !newMasterMaterial.name.trim() ||
                        masterMaterials.some((m: any) => m.name.toLowerCase().trim() === newMasterMaterial.name.toLowerCase().trim()) ||
                        masterMaterials.some((m: any) => m.code === newMasterMaterial.code) ||
                        (newMasterMaterial.taxCodeType && !newMasterMaterial.taxCodeValue.trim())
                      }
                      className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Create Material
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setNewMasterMaterial({
                          name: "",
                          code: "",
                          vendorCategory: "",
                          taxCodeType: null,
                          taxCodeValue: ""
                        });
                        toast({
                          title: "Form Cleared",
                          description: "The creation form has been reset.",
                        });
                      }}
                      className="w-full md:w-auto"
                    >
                      Clear
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Created Material Templates List - Admin/Software/Purchase Team */}
            {(isAdminOrSoftwareTeam || user?.role === "purchase_team") && (
              <Card>
                <CardHeader>
                  <CardTitle>Created Material Templates</CardTitle>
                  <CardDescription>
                    Manage all material templates created for suppliers
                  </CardDescription>
                  <div className="mt-4">
                    <Input
                      placeholder="Search materials..."
                      value={masterSearch}
                      onChange={(e) => setMasterSearch(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  {masterMaterials.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      No material templates created yet. Create one above.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto p-2">
                      {masterMaterials
                        .filter((t: any) => (t.name + ' ' + t.code + ' ' + (t.category || '')).toLowerCase().includes(masterSearch.toLowerCase()))
                        .slice(0, 36)
                        .map((template: any) => (
                          <div key={template.id} className="p-4 border rounded flex items-center justify-between bg-white">
                            <div className="flex-1">
                              {editingMaterialId === template.id ? (
                                <div className="space-y-3 w-full">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                      <Label>Item Name <span className="text-red-500">*</span></Label>
                                      <Input
                                        value={newMaterial.name}
                                        onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
                                        placeholder="Enter material name"
                                      />
                                    </div>
                                    <div>
                                      <Label>Item Code</Label>
                                      <Input
                                        value={template.code}
                                        disabled
                                        className="bg-muted"
                                        placeholder="Auto-generated"
                                      />
                                    </div>
                                    <div>
                                      <Label>Vendor Category</Label>
                                      <Select
                                        value={newMaterial.vendorCategory || ""}
                                        onValueChange={(value) => setNewMaterial({ ...newMaterial, vendorCategory: value })}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select vendor category" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[200px] overflow-y-auto">
                                          {vendorCategories.length === 0 ? (
                                            <SelectItem value="none" disabled>No categories available</SelectItem>
                                          ) : (
                                            vendorCategories.map((cat) => (
                                              <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                                            ))
                                          )}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    <div>
                                      <Label>Tax Code Type</Label>
                                      <div className="flex gap-4 mt-2">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="radio"
                                            id={`hsn-${template.id}`}
                                            name={`taxCodeType-${template.id}`}
                                            value="hsn"
                                            checked={newMaterial.taxCodeType === 'hsn'}
                                            onChange={(e) => setNewMaterial({ ...newMaterial, taxCodeType: e.target.value as 'hsn' | 'sac' })}
                                            className="w-4 h-4"
                                          />
                                          <Label htmlFor={`hsn-${template.id}`} className="cursor-pointer mb-0">HSN Code</Label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="radio"
                                            id={`sac-${template.id}`}
                                            name={`taxCodeType-${template.id}`}
                                            value="sac"
                                            checked={newMaterial.taxCodeType === 'sac'}
                                            onChange={(e) => setNewMaterial({ ...newMaterial, taxCodeType: e.target.value as 'hsn' | 'sac' })}
                                            className="w-4 h-4"
                                          />
                                          <Label htmlFor={`sac-${template.id}`} className="cursor-pointer mb-0">SAC Code</Label>
                                        </div>
                                      </div>
                                    </div>
                                    {newMaterial.taxCodeType && (
                                      <div className="md:col-span-2">
                                        <Label>{newMaterial.taxCodeType === 'hsn' ? 'HSN' : 'SAC'} Code</Label>
                                        <Input
                                          value={newMaterial.taxCodeValue || ""}
                                          onChange={(e) => setNewMaterial({ ...newMaterial, taxCodeValue: e.target.value })}
                                          placeholder={`Enter ${newMaterial.taxCodeType === 'hsn' ? 'HSN' : 'SAC'} code`}
                                        />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-2 justify-end pt-2">
                                    <Button size="sm" variant="ghost" onClick={() => setEditingMaterialId(null)}>Cancel</Button>
                                    <Button size="sm" onClick={async () => {
                                      if (!(newMaterial.name || "").trim()) {
                                        toast({ title: 'Error', description: 'Material name is required', variant: 'destructive' });
                                        return;
                                      }
                                      if (newMaterial.taxCodeType && !newMaterial.taxCodeValue?.trim()) {
                                        toast({ title: 'Error', description: `${newMaterial.taxCodeType === 'hsn' ? 'HSN' : 'SAC'} code is required when tax code type is selected`, variant: 'destructive' });
                                        return;
                                      }
                                      try {
                                        const updateData: any = {
                                          name: newMaterial.name,
                                          code: template.code,
                                          vendor_category: newMaterial.vendorCategory || null,
                                          tax_code_type: newMaterial.taxCodeType || null,
                                          tax_code_value: newMaterial.taxCodeValue || null
                                        };

                                        const res = await apiFetch(`/material-templates/${template.id}`, {
                                          method: 'PUT',
                                          body: JSON.stringify(updateData)
                                        });
                                        if (!res.ok) {
                                          const text = await res.text().catch(() => '');
                                          console.error('[material-templates PUT] failed', res.status, text);
                                          toast({ title: 'Error', description: text || 'Failed to update material (server error)', variant: 'destructive' });
                                          throw new Error(text || 'update failed');
                                        }
                                        const data = await res.json().catch(() => null);
                                        setMasterMaterials(prev => prev.map(m => m.id === template.id ? {
                                          ...m,
                                          name: newMaterial.name,
                                          vendor_category: newMaterial.vendorCategory,
                                          tax_code_type: newMaterial.taxCodeType,
                                          tax_code_value: newMaterial.taxCodeValue,
                                          ...(data?.template || {})
                                        } : m));
                                        setEditingMaterialId(null);
                                        toast({ title: 'Success', description: 'Material template updated' });
                                      } catch (err) {
                                        console.error('update error', err);
                                        if (!(err as any)?.message?.includes('update failed')) {
                                          toast({ title: 'Error', description: 'Failed to update material template', variant: 'destructive' });
                                        }
                                      }
                                    }}>Save Changes</Button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="font-medium text-sm">{template.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {template.code}
                                  </div>
                                </div>
                              )}
                            </div>
                            {editingMaterialId !== template.id && (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCloneMasterMaterial(template)}
                                  title="Clone Template"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button size="sm" onClick={() => {
                                  setEditingMaterialId(template.id);
                                  setNewMaterial({
                                    ...newMaterial,
                                    name: template.name,
                                    vendorCategory: template.vendor_category || '',
                                    taxCodeType: template.tax_code_type,
                                    taxCodeValue: template.tax_code_value || ''
                                  });
                                }}>Edit</Button>
                                <Button size="sm" variant="destructive" onClick={async () => {
                                  if (!window.confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
                                  try {
                                    console.log('[DELETE template]', template.id, template.name);
                                    const res = await apiFetch(`/material-templates/${template.id}`, { method: 'DELETE' });
                                    console.log('[DELETE response]', res.status, res.ok);
                                    if (!res.ok) {
                                      const errorData = await res.json();
                                      throw new Error(errorData.message || 'Failed to delete');
                                    }
                                    setMasterMaterials(prev => prev.filter(m => m.id !== template.id));
                                    toast({ title: 'Success', description: 'Material deleted' });
                                  } catch (err) {
                                    console.error('delete error', err);
                                    toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete material', variant: 'destructive' });
                                  }
                                }}>Delete</Button>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Materials list moved to Dashboard */}
          </TabsContent>

          {/* === SHOPS TAB === */}
          <TabsContent value="shops" className="space-y-4 mt-4">
            {(isAdminOrSoftwareTeam || user?.role === "purchase_team") && (
              <Card>
                <CardHeader>
                  <CardTitle>Add New Shop</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Shop Name <span className="text-red-500">*</span></Label>
                      <Input
                        value={newShop.name}
                        onChange={(e) =>
                          setNewShop({ ...newShop, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Location <span className="text-red-500">*</span></Label>
                      <Input
                        value={newShop.location}
                        onChange={(e) =>
                          setNewShop({ ...newShop, location: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City <span className="text-red-500">*</span></Label>
                      <Input
                        value={newShop.city}
                        onChange={(e) =>
                          setNewShop({ ...newShop, city: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Phone Number <span className="text-red-500">*</span></Label>
                      <div className="flex gap-2">
                        <Select
                          value={newShop.phoneCountryCode || "+91"}
                          onValueChange={(value) =>
                            setNewShop({ ...newShop, phoneCountryCode: value })
                          }
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue placeholder="+91" />
                          </SelectTrigger>
                          <SelectContent>
                            {COUNTRY_CODES.map((c) => (
                              <SelectItem key={c.code} value={c.code}>
                                {c.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Input
                          value={newShop.contactNumber || ""}
                          onChange={(e) =>
                            setNewShop({
                              ...newShop,
                              contactNumber: e.target.value,
                            })
                          }
                          placeholder="Enter phone number"
                          type="tel"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>State <span className="text-red-500">*</span></Label>
                      <Input
                        value={newShop.state}
                        onChange={(e) =>
                          setNewShop({ ...newShop, state: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Country <span className="text-red-500">*</span></Label>
                      <Input
                        value={newShop.country}
                        onChange={(e) =>
                          setNewShop({ ...newShop, country: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Pincode / Zipcode <span className="text-red-500">*</span></Label>
                      <Input
                        value={newShop.pincode}
                        onChange={(e) =>
                          setNewShop({ ...newShop, pincode: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>GST No (Optional)</Label>
                      <Input
                        value={newShop.gstNo}
                        onChange={(e) =>
                          setNewShop({ ...newShop, gstNo: e.target.value })
                        }
                        placeholder="29ABCDE1234F1Z5"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Vendor Category (Optional)</Label>
                      <Select
                        value={newShop.vendorCategory}
                        onValueChange={(value) =>
                          setNewShop({ ...newShop, vendorCategory: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select vendor category" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px] overflow-y-auto">
                          {vendorCategories.length === 0 ? (
                            <SelectItem value="none" disabled>
                              No categories available
                            </SelectItem>
                          ) : (
                            vendorCategories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.name}>
                                {cat.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={editingShopId ? handleUpdateShop : handleAddShop}>{editingShopId ? 'Save Changes' : 'Add Shop'}</Button>
                </CardContent>
              </Card>
            )}
            {/* Shops list moved to Dashboard */}
          </TabsContent>

          {/* === APPROVALS TAB === */}
          {canManageShops && (
            <TabsContent value="approvals" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Shop Approval Requests</CardTitle>
                  <CardDescription>
                    Review and approve/reject new shop submissions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {shopRequests.filter((r: any) => r.status === "pending").length ===
                    0 ? (
                    <p className="text-muted-foreground">
                      No pending approval requests
                    </p>
                  ) : (
                    shopRequests
                      .filter((r: any) => r.status === "pending")
                      .map((request: any) => (
                        <Card key={request.id} className="border-border/50">
                          <CardContent className="pt-6 space-y-4">
                            <div>
                              <h3 className="text-lg font-bold">
                                {request.shop.name}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Submitted by: {request.submittedBy} at{" "}
                                {new Date(
                                  request.submittedAt
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="font-semibold">Location</p>
                                <p>{request.shop.location}</p>
                              </div>
                              <div>
                                <p className="font-semibold">City</p>
                                <p>{request.shop.city}</p>
                              </div>
                              <div>
                                <p className="font-semibold">State</p>
                                <p>{request.shop.state}</p>
                              </div>
                              <div>
                                <p className="font-semibold">Country</p>
                                <p>{request.shop.country}</p>
                              </div>
                              <div>
                                <p className="font-semibold">Pincode</p>
                                <p>{request.shop.pincode}</p>
                              </div>
                              <div>
                                <p className="font-semibold">Phone</p>
                                <p>
                                  {request.shop.phoneCountryCode}
                                  {request.shop.contactNumber}
                                </p>
                              </div>
                              {request.shop.gstNo && (
                                <div>
                                  <p className="font-semibold">GST No</p>
                                  <p>{request.shop.gstNo}</p>
                                </div>
                              )}
                            </div>

                            {/* Approve / Reject Buttons - Admin/Software Team/Purchase Team */}
                            {canApproveReject && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveShop(request)}
                                  className="gap-2"
                                  disabled={!request?.shop?.id}
                                >
                                  <CheckCircle2 className="h-4 w-4" /> Approve
                                </Button>

                                {rejectingId === request.id ? (
                                  <div className="flex gap-2 flex-1">
                                    <Input
                                      placeholder="Reason..."
                                      value={rejectReason}
                                      onChange={(e) =>
                                        setRejectReason(e.target.value)
                                      }
                                      className="text-sm"
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleRejectShop(request)
                                      }
                                    >
                                      Confirm
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setRejectingId(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRejectingId(request.id)}
                                    className="gap-2"
                                  >
                                    <XCircle className="h-4 w-4" /> Reject
                                  </Button>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                  )}
                </CardContent>

                {/* Processed Requests */}
                {shopRequests.filter((r: any) => r.status !== "pending").length >
                  0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Processed Requests
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {shopRequests
                          .filter((r: any) => r.status !== "pending")
                          .map((request: any) => (
                            <div
                              key={request.id}
                              className="flex justify-between items-start p-3 bg-muted/50 rounded"
                            >
                              <div>
                                <p className="font-semibold">
                                  {request.shop.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {request.submittedBy}
                                </p>
                              </div>
                              <div className="text-right">
                                <Badge
                                  variant={
                                    request.status === "approved"
                                      ? "default"
                                      : "destructive"
                                  }
                                >
                                  {request.status === "approved"
                                    ? "LA"
                                    : request.status.charAt(0).toUpperCase() +
                                    request.status.slice(1)}
                                </Badge>
                              </div>
                            </div>
                          ))}
                      </CardContent>
                    </Card>
                  )}
              </Card>
            </TabsContent>
          )}

          {/* === MATERIAL APPROVALS TAB === */}
          {(isAdminOrSoftwareTeam || user?.role === "purchase_team") && (
            <TabsContent value="material-approvals" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Material Approval Requests</CardTitle>
                  <CardDescription>
                    Review and approve/reject new material submissions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {materialRequests.filter((r: any) => r.status === "pending")
                    .length === 0 ? (
                    <p className="text-muted-foreground">
                      No pending material approvals
                    </p>
                  ) : (
                    materialRequests
                      .filter((r: any) => r.status === "pending")
                      .map((request: any) => (
                        <Card key={request.id} className="border-border/50">
                          <CardContent className="pt-6 space-y-4">
                            <div>
                              <h3 className="text-lg font-bold">
                                {request.material.name}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Submitted by: {request.submittedBy} at{" "}
                                {new Date(
                                  request.submittedAt
                                ).toLocaleDateString()}
                              </p>
                              <div className="grid grid-cols-2 gap-3 text-sm mt-2">
                                <div>
                                  <p className="font-semibold">Code</p>
                                  <p>{request.material.code || request.material.template_code || request.material.templateCode || '-'}</p>
                                </div>
                                <div>
                                  <p className="font-semibold">Rate</p>
                                  <p>₹{request.material.rate ?? request.material.price ?? '-'}</p>
                                </div>
                                <div>
                                  <p className="font-semibold">Unit</p>
                                  <p>{request.material.unit || request.material.uom || '-'}</p>
                                </div>
                                <div>
                                  <p className="font-semibold">Category</p>
                                  <p>{request.material.category || request.material.categoryName || request.material.category_name || request.material.vendorCategory || request.material.vendor_category || '-'}</p>
                                </div>
                                <div>
                                  <p className="font-semibold">Sub Category</p>
                                  <p>{request.material.subCategory || request.material.subcategory || request.material.sub_category || '-'}</p>
                                </div>
                                <div>
                                  <p className="font-semibold">Brand</p>
                                  <p>{request.material.brandName || request.material.brandname || request.material.brand || request.material.make || '-'}</p>
                                </div>
                                {(request.material.technicalSpecification || request.material.technicalspecification) && (
                                  <div className="col-span-2">
                                    <p className="font-semibold">Technical Specification</p>
                                    <p className="text-blue-600 italic text-xs">{request.material.technicalSpecification || request.material.technicalspecification}</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Approve / Reject Buttons - Admin/Software Team/Purchase Team */}
                            {canApproveReject && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveMaterial(request.id)}
                                  className="gap-2"
                                  disabled={!request?.material?.id}
                                >
                                  <CheckCircle2 className="h-4 w-4" /> Approve
                                </Button>

                                {rejectingId === request.id ? (
                                  <div className="flex gap-2 flex-1">
                                    <Input
                                      placeholder="Reason..."
                                      value={rejectReason}
                                      onChange={(e) =>
                                        setRejectReason(e.target.value)
                                      }
                                      className="text-sm"
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleRejectMaterial(request.id)
                                      }
                                    >
                                      Confirm
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setRejectingId(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRejectingId(request.id)}
                                    className="gap-2"
                                  >
                                    <XCircle className="h-4 w-4" /> Reject
                                  </Button>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                  )}
                </CardContent>

                {/* Processed Requests */}
                {materialRequests.filter((r: any) => r.status !== "pending").length >
                  0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Processed Requests
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {materialRequests
                          .filter((r: any) => r.status !== "pending")
                          .map((request: any) => (
                            <div
                              key={request.id}
                              className="flex justify-between items-start p-3 bg-muted/50 rounded"
                            >
                              <div>
                                <p className="font-semibold">
                                  {request.material.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {request.submittedBy}
                                </p>
                              </div>
                              <div className="text-right">
                                <Badge
                                  variant={
                                    request.status === "approved"
                                      ? "default"
                                      : "destructive"
                                  }
                                >
                                  {request.status === "approved"
                                    ? "LA"
                                    : request.status.charAt(0).toUpperCase() +
                                    request.status.slice(1)}
                                </Badge>
                              </div>
                            </div>
                          ))}
                      </CardContent>
                    </Card>
                  )}
              </Card>
            </TabsContent>
          )}

          {/* === MESSAGES TAB === */}
          {canViewSupportMessages && (
            <TabsContent value="messages" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Support Messages</CardTitle>
                  <CardDescription>
                    Messages from suppliers and users sent to Admin & Software
                    Team
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(supportMessages || []).length === 0 ? (
                    <p className="text-muted-foreground">No messages yet</p>
                  ) : (
                    (supportMessages || []).map((msg) => (
                      <Card key={msg.id} className="border-border/50">
                        <CardContent className="pt-6 space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-semibold">{msg.sender_name || msg.sentBy}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(msg.sent_at || msg.sentAt).toLocaleString()}
                              </p>
                              {msg.info && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  <span className="font-semibold">Info: </span>{msg.info}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2 items-start">
                              {!msg.is_read && (
                                <Badge variant="default">New</Badge>
                              )}
                              {canEditDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    (async () => {
                                      try {
                                        await deleteMessage?.(msg.id);
                                        toast({
                                          title: "Success",
                                          description: "Message deleted",
                                        });
                                      } catch (err) {
                                        toast({
                                          title: "Error",
                                          description: "Failed to delete message",
                                          variant: "destructive",
                                        });
                                      }
                                    })();
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <p className="text-sm leading-relaxed bg-muted/50 p-3 rounded">
                            {msg.message}
                          </p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* === SUPPORT TAB === */}
          <TabsContent value="support" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Technical Support</CardTitle>
                <CardDescription>
                  Request new categories or report issues to the software team.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Sender Name Input */}
                <div className="space-y-2">
                  <Label>Your Name <Required /></Label>
                  <Input
                    placeholder="Enter your name..."
                    value={supportSenderName}
                    onChange={(e) => setSupportSenderName(e.target.value)}
                  />
                </div>

                {/* Additional Info Input */}
                <div className="space-y-2">
                  <Label>Additional Information (Optional)</Label>
                  <Textarea
                    placeholder="Any additional context or details..."
                    className="min-h-[80px]"
                    value={supportSenderInfo}
                    onChange={(e) => setSupportSenderInfo(e.target.value)}
                  />
                </div>

                {/* Message Input */}
                <div className="space-y-2">
                  <Label>Message / Request <Required /></Label>
                  <Textarea
                    placeholder="I need a new category for 'Smart Home Devices'..."
                    className="min-h-[150px]"
                    value={supportMsg}
                    onChange={(e) => setSupportMsg(e.target.value)}
                    data-testid="textarea-support-message"
                  />
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded text-sm text-blue-700 dark:text-blue-300">
                  ✓ This message will be sent to Admin & Software Team
                </div>

                <Button
                  onClick={handleSupportSubmit}
                  data-testid="button-send-support"
                >
                  <MessageSquare className="mr-2 h-4 w-4" /> Send Request
                </Button>

                {/* Display list of messages */}
                {supportMsgs.length === 0 ? (
                  <p className="text-muted-foreground">No messages yet</p>
                ) : (
                  supportMsgs.map((msg: any) => (
                    <Card key={msg.id} className="border-border/50">
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-semibold">You ({supportSenderName})</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(msg.sent_at || msg.sentAt).toLocaleString()}
                            </p>
                            {msg.info && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <span className="font-semibold">Info: </span>{msg.info}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2 items-start">
                            {!msg.is_read && (
                              <Badge variant="default">Unread</Badge>
                            )}
                            {canEditDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  (async () => {
                                    try {
                                      await deleteMessage?.(msg.id);
                                      toast({
                                        title: "Success",
                                        description: "Message deleted",
                                      });
                                    } catch (err) {
                                      toast({
                                        title: "Error",
                                        description: "Failed to delete message",
                                        variant: "destructive",
                                      });
                                    }
                                  })();
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed bg-muted/50 p-3 rounded">
                          {msg.message}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </Layout>
  );
}