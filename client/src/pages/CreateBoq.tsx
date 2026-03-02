import { useEffect, useState, useRef } from "react";
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, XCircle, Lock } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// import VersionHistory from "@/components/VersionHistory"; // Not found
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import Step9Table from "@/components/estimators/Step9Table";
import ProductPicker from "@/components/ProductPicker";
import MaterialPicker from "@/components/MaterialPicker";
import Step11Preview from "@/components/Step11Preview";
import { getEstimatorTypeFromProduct } from "@/lib/estimatorUtils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { computeBoq, UnitType } from "@/lib/boqCalc";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Project = {
  id: string;
  name: string;
  client: string;
  budget: string;
  location?: string;
  status?: string;
};

type BOMVersion = {
  id: string;
  project_id: string;
  version_number: number;
  status: "draft" | "submitted" | "pending_approval" | "approved" | "rejected";
  created_at: string;
  rejection_reason?: string;
  updated_at: string;
  project_name?: string;
  project_client?: string;
  project_location?: string;
};

type BOMItem = {
  id: string;
  estimator: string;
  session_id: string;
  table_data: any;
  created_at: string;
};

type Product = {
  id: string;
  name: string;
  code: string;
  category?: string;
  subcategory?: string;
  description?: string;
  category_name?: string;
  subcategory_name?: string;
  tax_code_type?: string;
  tax_code_value?: string;
  hsn_code?: string;
  sac_code?: string;
};

type Step11Item = {
  id?: string;
  s_no?: number;
  bill_no?: string;
  estimator?: string;
  group_id?: string;
  title?: string;
  description?: string;
  unit?: string;
  qty?: number;
  supply_rate?: number;
  install_rate?: number;
  [key: string]: any;
};

export default function CreateBom() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [boqItems, setBoqItems] = useState<BOMItem[]>([]);
  const [versions, setVersions] = useState<BOMVersion[]>([]);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [budget, setBudget] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showStep11Preview, setShowStep11Preview] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [selectedMaterialTemplate, setSelectedMaterialTemplate] = useState<any | null>(null);

  // New BOM Architecture State
  const [targetQtyModalOpen, setTargetQtyModalOpen] = useState(false);
  const [targetRequiredQty, setTargetRequiredQty] = useState<number>(1);
  const [pendingItems, setPendingItems] = useState<Step11Item[]>([]);
  const [expandedFinalizedIds, setExpandedFinalizedIds] = useState<Set<string>>(new Set());
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null); // For inline qty editing state if needed
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [targetBoqItemId, setTargetBoqItemId] = useState<string | null>(null);
  const [editedFields, setEditedFields] = useState<{
    [key: string]: {
      description?: string;
      unit?: string;
      qty?: number;
      supply_rate?: number;
      install_rate?: number;
      rate?: number;
      roundOff?: number;
    };
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Keep a ref in sync to avoid state-update races when user types and clicks Save quickly.
  const editedFieldsRef = useRef(editedFields);
  useEffect(() => {
    editedFieldsRef.current = editedFields;
  }, [editedFields]);

  // default expand all products when items load (preserve existing toggles)
  useEffect(() => {
    setExpandedProductIds(prev => {
      const next = new Set(prev);
      for (const it of boqItems) next.add(it.id);
      return next;
    });
  }, [boqItems]);

  // Load projects from DB on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await apiFetch("/api/boq-projects", {
          headers: {},
        });
        if (response.ok) {
          const data = await response.json();
          setProjects(data.projects || []);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, []);

  // Load versions when project is selected
  useEffect(() => {
    if (!selectedProjectId) {
      setVersions([]);
      setSelectedVersionId(null);
      setBoqItems([]);
      return;
    }

    const loadVersions = async () => {
      try {
        const response = await apiFetch(
          `/api/boq-versions/${encodeURIComponent(selectedProjectId)}`,
          { headers: {} },
        );
        if (response.ok) {
          const data = await response.json();
          const versionList = data.versions || [];
          setVersions(versionList);

          // If we already have a selectedVersionId and it's still present, keep it.
          if (
            selectedVersionId &&
            versionList.some((v: BOMVersion) => v.id === selectedVersionId)
          ) {
            // keep current selection
          } else {
            // Auto-select first draft version, or first version
            const draftVersion = versionList.find(
              (v: BOMVersion) => v.status === "draft",
            );
            if (draftVersion) {
              setSelectedVersionId(draftVersion.id);
            } else if (versionList.length > 0) {
              setSelectedVersionId(versionList[0].id);
            } else {
              setSelectedVersionId(null);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load versions:", err);
      }
    };

    loadVersions();
  }, [selectedProjectId]);

  const loadBoqItemsAndEdits = async () => {
    if (!selectedVersionId) return;
    try {
      // Helper to safely parse JSON responses and log non-JSON bodies
      const safeParseJson = async (res: Response) => {
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        const text = await res.text();

        // Allow empty/no-content responses (204) — treat as empty object
        if (res.status === 204 || text.trim() === "") {
          return {};
        }

        // If Content-Type explicitly says JSON, parse it
        if (ct.includes("application/json")) {
          try {
            return JSON.parse(text);
          } catch (e) {
            console.error("safeParseJson: JSON parse failed", { url: res.url, status: res.status, bodySnippet: text.slice(0, 300), error: e });
            throw new Error("Invalid JSON response from server");
          }
        }

        // If Content-Type is missing or not JSON but body *looks like* JSON, try parsing
        const trimmed = text.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            return JSON.parse(trimmed);
          } catch (e) {
            console.error("safeParseJson: body looks like JSON but parse failed", { url: res.url, status: res.status, bodySnippet: trimmed.slice(0, 300), error: e });
            throw new Error("Invalid JSON response from server");
          }
        }

        // Helpful debug when server returns HTML (Vite index.html) or other unexpected body
        console.error(
          "safeParseJson: server returned non-JSON response",
          { url: res.url, status: res.status, contentType: ct, bodySnippet: text.slice(0, 200) },
        );
        const hint = trimmed.startsWith("<!DOCTYPE html")
          ? "Looks like the request hit the frontend dev server (index.html) instead of the backend API. Check VITE_API_BASE_URL and dev server ports."
          : undefined;
        const errMsg = `Server returned non-JSON response (status=${res.status})${hint ? ' - ' + hint : ''}`;
        throw new Error(errMsg);
      };

      // Load BOQ items
      const response = await apiFetch(
        `/api/boq-items/version/${encodeURIComponent(selectedVersionId)}`,
        { headers: {} },
      );
      if (response.ok) {
        try {
          const data = await safeParseJson(response as unknown as Response);
          const items: BOMItem[] = data.items || [];

          // Backfill HSN/SAC codes from products API for existing items
          try {
            const productsResp = await apiFetch("/api/products");
            if (productsResp.ok) {
              const productsData = await productsResp.json();
              const productsList: any[] = productsData.products || [];
              const productsById: { [id: string]: any } = {};
              productsList.forEach(p => { productsById[p.id] = p; });

              for (const item of items) {
                let td = item.table_data || {};
                if (typeof td === "string") try { td = JSON.parse(td); } catch { td = {}; }
                if (td.product_id && (!td.hsn_code && !td.sac_code)) {
                  const prod = productsById[td.product_id];
                  if (prod) {
                    if (prod.hsn_code) td.hsn_code = prod.hsn_code;
                    if (prod.sac_code) td.sac_code = prod.sac_code;
                    // Keep legacy for safety
                    if (prod.tax_code_value) {
                      td.hsn_sac_code = prod.tax_code_value;
                      td.hsn_sac_type = prod.tax_code_type || null;
                    }
                    item.table_data = td;
                  }
                }
              }
            }
          } catch (e) {
            console.warn("Failed to backfill HSN/SAC codes:", e);
          }

          setBoqItems(items);
        } catch (e) {
          toast({ title: "Error", description: "Failed to parse BOQ items response", variant: "destructive" });
          console.error("BOQ items parse error:", e);
        }
      } else {
        const body = await response.text();
        console.error("Failed to fetch BOQ items:", response.status, body);
        toast({ title: "Error", description: `Failed to load BOQ items (${response.status})`, variant: "destructive" });
      }
    } catch (err) {
      console.error("Failed to load BOQ items:", err);
      toast({ title: "Error", description: "Failed to load BOQ items", variant: "destructive" });
    }
  };

  // Load BOQ items for selected version
  useEffect(() => {
    if (!selectedVersionId) {
      setBoqItems([]);
      setEditedFields({});
      editedFieldsRef.current = {};
      return;
    }

    loadBoqItemsAndEdits();
  }, [selectedVersionId]);

  // If URL contains ?project=, auto-select that project
  // Only auto-select a project from the URL if it exists in the loaded projects.
  useEffect(() => {
    try {
      const qs =
        typeof location === "string" ? location.split("?")[1] || "" : "";
      const params = new URLSearchParams(qs);
      const projectParam = params.get("project");
      if (projectParam && projectParam !== selectedProjectId) {
        const exists = projects.find((p) => p.id === projectParam);
        if (exists) setSelectedProjectId(projectParam);
      }
    } catch (e) {
      // ignore
    }
  }, [location, projects]);

  const addProject = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Project name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiFetch("/api/boq-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          client: client.trim(),
          budget: budget.trim(),
          location: projectLocation.trim(),
        }),
      });

      if (response.ok) {
        const newProject = await response.json();
        setProjects((prev) => [newProject, ...prev]);
        setName("");
        setClient("");
        setBudget("");
        setProjectLocation("");
        setSelectedProjectId(newProject.id);
        toast({
          title: "Success",
          description: "Project created",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to create project",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to create project:", err);
      toast({
        title: "Error",
        description: "Failed to create project",
        variant: "destructive",
      });
    }
  };

  const handleAddProduct = () => {
    if (!selectedProjectId) return;
    setShowProductPicker(true);
  };

  const handleAddProductManual = async () => {
    if (!selectedProjectId || !selectedVersionId) {
      toast({ title: "Error", description: "Please select a project and version", variant: "destructive" });
      return;
    }

    try {
      const requestBody = {
        project_id: selectedProjectId,
        version_id: selectedVersionId,
        estimator: "Manual",
        table_data: {
          product_name: "Manual Product",
          step11_items: [],
          created_at: new Date().toISOString(),
        },
      };

      const resp = await apiFetch("/api/boq-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || "Failed to create manual product");
      }

      const newItem = await resp.json();
      setBoqItems((prev) => [...prev, newItem]);
      // Set target product id so MaterialPicker will add selected materials into this product
      setTargetBoqItemId(newItem.id);
      // Open material picker so the user can select materials to add to the manual product
      setShowMaterialPicker(true);
      toast({ title: "Success", description: "Manual product created — select materials to add" });
      // reload in background to keep state in sync
      loadBoqItemsAndEdits();
    } catch (err) {
      console.error("Failed to add manual product", err);
      toast({ title: "Error", description: "Failed to add manual product", variant: "destructive" });
    }
  };

  const handleAddItem = (boqItemId?: string) => {
    if (!selectedProjectId) return;
    if (boqItemId) {
      setTargetBoqItemId(boqItemId);
    } else {
      setTargetBoqItemId(null);
    }
    setShowMaterialPicker(true);
  };

  const handleSelectProduct = (product: Product) => {
    // Show Step 11 preview instead of navigating
    setSelectedProduct(product);
    setShowProductPicker(false);
    setShowStep11Preview(true);
  };

  const handleSelectMaterialTemplate = async (template: any) => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      setSelectedMaterialTemplate(template);
      setShowMaterialPicker(false);
      // Directly add the material template to BOQ
      if (targetBoqItemId) {
        await handleAddItemToProduct(targetBoqItemId, template);
      } else {
        await handleAddMaterialToBoq(template);
      }
      setTargetBoqItemId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMaterialToBoq = async (template: any) => {
    if (!selectedProjectId || !selectedVersionId) {
      toast({
        title: "Error",
        description: "Please select a project and version",
        variant: "destructive",
      });
      return;
    }

    try {
      // Determine unit, rate and shop from template or existing material record
      let unit = template.unit || template.uom || "pcs";
      let rate = Number(template.rate ?? template.supply_rate ?? template.default_rate ?? 0) || 0;
      let shopName = template.shop_name || template.shopName || "";

      // Try to fetch authoritative material by id (if available) to get latest rate/unit
      if (template.id) {
        try {
          const matRes = await apiFetch(`/api/materials/${encodeURIComponent(template.id)}`);
          if (matRes.ok) {
            const matData = await matRes.json();
            const mat = matData.material || matData;
            if (mat) {
              unit = mat.unit || unit;
              rate = Number(mat.rate ?? rate) || rate;
              shopName = mat.shop_name || mat.shopName || shopName;
            }
          }
        } catch (e) {
          // ignore fetch errors and fallback to template values
        }
      }

      // Create a single item from the material template
      const materialItem = {
        title: template.name,
        description: template.name,
        unit: unit,
        qty: 1, // Default quantity
        supply_rate: rate, // Use discovered rate
        install_rate: 0,
        location: "Main Area",
        s_no: 1,
        shop_name: shopName,
      };

      const response = await apiFetch("/api/boq-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProjectId,
          version_id: selectedVersionId,
          estimator: `material_${template.id}`,
          table_data: {
            product_name: template.name,
            step11_items: [materialItem],
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API response error:", response.status, errorText);
        throw new Error(`Failed to add material to BOM: ${response.status} ${errorText}`);
      }

      const newItem = await response.json();
      console.log("Material added successfully:", newItem);
      // Removed optimistic setBoqItems update to prevent duplication bugs
      // The reload below will sync the state correctly.

      toast({
        title: "Success",
        description: `Added ${template.name} to BOM`,
      });

      // Reload BOQ items to get updated list
      const loadResponse = await apiFetch(
        `/api/boq-items/version/${encodeURIComponent(selectedVersionId)}`,
        { headers: {} },
      );
      if (loadResponse.ok) {
        const loadText = await loadResponse.text();
        const loadCT = loadResponse.headers.get("content-type") || "";
        if (!loadCT.toLowerCase().includes("application/json")) {
          console.error("Reload BOQ items: non-JSON response", { url: loadResponse.url, status: loadResponse.status, bodySnippet: loadText.slice(0, 300) });
        } else {
          try {
            const data = JSON.parse(loadText);
            console.log("Reloaded BOQ items:", data);
            setBoqItems(data.items || []);
          } catch (e) {
            console.error("Reload BOQ items: JSON parse failed", { url: loadResponse.url, status: loadResponse.status, error: e, bodySnippet: loadText.slice(0, 300) });
          }
        }
      }
    } catch (error) {
      console.error("Failed to add material to BOQ:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add material to BOQ",
        variant: "destructive",
      });
    }
  };

  const handleAddItemToProduct = async (boqItemId: string, template: any) => {
    try {
      // Find the existing item to get current table_data
      const existingItem = boqItems.find(i => i.id === boqItemId);
      if (!existingItem) {
        throw new Error("Target Product group not found");
      }

      let tableData = existingItem.table_data;
      if (typeof tableData === "string") {
        try {
          tableData = JSON.parse(tableData);
        } catch (e) {
          console.error("Failed to parse table_data", e);
          tableData = {};
        }
      }

      const currentStep11Items = Array.isArray(tableData.step11_items) ? tableData.step11_items : [];

      // Determine unit, rate and shop from template or authoritative material record
      let unit = template.unit || template.uom || "pcs";
      let rate = Number(template.rate ?? template.supply_rate ?? template.default_rate ?? 0) || 0;
      let shopName = template.shop_name || template.shopName || "";

      if (template.id) {
        try {
          const matRes = await apiFetch(`/api/materials/${encodeURIComponent(template.id)}`);
          if (matRes.ok) {
            const matData = await matRes.json();
            const mat = matData.material || matData;
            unit = mat.unit || unit;
            rate = Number(mat.rate ?? mat.supply_rate ?? rate) || rate;
            shopName = mat.shop_name || mat.shopName || shopName;
          }
        } catch (err) {
          console.warn('Failed to fetch material for authoritative rate', err);
        }
      }

      // Create new item with proper rate/unit
      const newItem: Step11Item = {
        title: template.name,
        description: template.name,
        unit: unit,
        qty: 1,
        supply_rate: rate,
        install_rate: 0,
        location: template.location || template.technicalspecification || "Main Area",
        s_no: currentStep11Items.length + 1,
        shop_name: shopName,
      };

      // If this product is engine-based (has materialLines + targetRequiredQty), we still
      // add user-created items as manual `step11_items` so they appear editable in the UI
      // (computed lines remain driven by materialLines). This keeps totals reactive and
      // avoids duplicating computed rows.
      let updatedTableData: any;
      if (tableData.materialLines && tableData.targetRequiredQty !== undefined) {
        const updatedStep11Items = Array.isArray(tableData.step11_items) ? [...tableData.step11_items] : [];

        // Mark as manual so UI treats it as editable and appends after computed lines
        const manualEntry = { ...newItem, manual: true };
        updatedStep11Items.push(manualEntry);

        updatedTableData = { ...tableData, step11_items: updatedStep11Items };

        // Optimistic update: show manual item immediately under computed lines
        setBoqItems(prev => prev.map(item =>
          item.id === boqItemId
            ? { ...item, table_data: updatedTableData }
            : item
        ));
      } else {
        const updatedStep11Items = [...currentStep11Items, newItem];
        updatedTableData = { ...tableData, step11_items: updatedStep11Items };

        // Optimistic update for non-engine products
        setBoqItems(prev => prev.map(item =>
          item.id === boqItemId
            ? { ...item, table_data: updatedTableData }
            : item
        ));
      }

      // API Call
      const response = await apiFetch(`/api/boq-items/${encodeURIComponent(boqItemId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_data: updatedTableData }),
      });

      if (!response.ok) {
        throw new Error("Failed to update product items");
      }

      toast({
        title: "Success",
        description: `Added ${template.name} to ${tableData.product_name || "Product"}`,
      });

      // Reload to ensure sync
      loadBoqItemsAndEdits();

    } catch (error) {
      console.error("Failed to add item to product:", error);
      toast({
        title: "Error",
        description: "Failed to add item to product",
        variant: "destructive",
      });
    }
  };

  const handleFinalizeProduct = async (boqItemId: string) => {
    try {
      if (!confirm("Mark this product as finalized?")) return;

      const existingItem = boqItems.find(i => i.id === boqItemId);
      if (!existingItem) return;

      let tableData = existingItem.table_data;
      if (typeof tableData === "string") {
        try {
          tableData = JSON.parse(tableData);
        } catch (e) {
          tableData = {};
        }
      }

      const newTableData = {
        ...tableData,
        is_finalized: true
      };

      // Optimistic update
      setBoqItems(prev => prev.map(item =>
        item.id === boqItemId
          ? { ...item, table_data: newTableData }
          : item
      ));

      // API Call
      await apiFetch(`/api/boq-items/${encodeURIComponent(boqItemId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_data: newTableData }),
      });

      toast({ title: "Success", description: "Product finalized" });
      loadBoqItemsAndEdits();

    } catch (error) {
      console.error("Failed to finalize product:", error);
      toast({ title: "Error", description: "Failed to finalize product", variant: "destructive" });
    }
  };

  const handleDeleteRow = async (boqItemId: string, tableData: any, itemIdx: number, displayItem?: any) => {
    try {
      let computedLen = 0;
      if (tableData && tableData.materialLines && tableData.targetRequiredQty !== undefined) {
        try {
          const res = computeBoq(tableData.configBasis, tableData.materialLines, tableData.targetRequiredQty);
          computedLen = Array.isArray(res.computed) ? res.computed.length : (Array.isArray(tableData.materialLines) ? tableData.materialLines.length : 0);
        } catch (e) {
          computedLen = Array.isArray(tableData.materialLines) ? tableData.materialLines.length : 0;
        }
      }

      let newTableData: any = { ...tableData };
      if (itemIdx < computedLen) {
        const materialLines = Array.isArray(tableData.materialLines) ? [...tableData.materialLines] : [];
        materialLines.splice(itemIdx, 1);
        newTableData = { ...tableData, materialLines };
      } else {
        // Use the stored original step11_items index if available, otherwise fall back
        const s11Idx = (displayItem && displayItem._s11Idx !== undefined) ? displayItem._s11Idx : (itemIdx - computedLen);
        const step11 = Array.isArray(tableData.step11_items) ? [...tableData.step11_items] : [];
        if (s11Idx >= 0 && s11Idx < step11.length) {
          step11.splice(s11Idx, 1);
        }
        newTableData = { ...tableData, step11_items: step11 };
      }

      setBoqItems(prev => prev.map(i => i.id === boqItemId ? { ...i, table_data: newTableData } : i));
      toast({ title: "Item Deleted", description: "Item removed from product.", variant: "default" });

      await apiFetch(`/api/boq-items/${boqItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_data: newTableData })
      });
    } catch (e) {
      console.error('Delete item failed', e);
      toast({ title: 'Error', description: 'Failed to delete item', variant: 'destructive' });
    }
  };

  const handleAddToBom = async (selectedItems: Step11Item[]) => {
    if (!selectedProjectId || !selectedProduct || !selectedVersionId) {
      toast({
        title: "Error",
        description: "Please select a project, version, and product",
        variant: "destructive",
      });
      return;
    }

    // Set default target quantity
    setTargetRequiredQty(100);
    setPendingItems(selectedItems);
    setTargetQtyModalOpen(true);
  };

  const confirmAddToBom = async () => {
    if (!selectedProduct || !selectedProjectId || !selectedVersionId) return;

    try {
      setTargetQtyModalOpen(false);

      // 1. Fetch the Step 3 Recipe/Config for this product
      const configRes = await apiFetch(`/api/product-step3-config/${selectedProduct.id}`);
      let configBasis = null;
      let materialLines = [];

      if (configRes.ok) {
        const configData = await configRes.json();
        if (configData.config) {
          configBasis = {
            requiredUnitType: configData.config.required_unit_type as UnitType,
            baseRequiredQty: Math.max(0.001, Number(configData.config.base_required_qty || 100)),
            wastagePctDefault: Number(configData.config.wastage_pct_default || 0)
          };
          materialLines = (configData.items || []).map((item: any) => ({
            id: item.material_id,
            name: item.material_name,
            unit: item.unit,
            baseQty: Number(item.base_qty ?? item.qty ?? 0),
            wastagePct: item.wastage_pct !== null ? Number(item.wastage_pct) : undefined,
            supplyRate: Number(item.supply_rate),
            installRate: Number(item.install_rate),
            shop_name: item.shop_name
          }));
        }
      }

      // If no config found, create a minimal fallback basis
      if (!configBasis) {
        configBasis = {
          requiredUnitType: "Sqft" as UnitType,
          baseRequiredQty: 1,
          wastagePctDefault: 0
        };
        // Fallback lines from pendingItems if possible
        materialLines = pendingItems.map(item => ({
          materialId: item.id || Math.random().toString(),
          materialName: item.title || "Item",
          unit: item.unit || "nos",
          baseQty: item.qty || 1,
          supplyRate: item.supply_rate || 0,
          installRate: item.install_rate || 0
        }));
      }

      const estimatorType = getEstimatorTypeFromProduct(selectedProduct);

      // 2. Create the snapshot for BOQ storage
      const tableData = {
        product_name: selectedProduct.name,
        product_id: selectedProduct.id,
        category: selectedProduct.category,
        subcategory: selectedProduct.subcategory,
        hsn_sac_type: selectedProduct.tax_code_type || null,
        hsn_sac_code: selectedProduct.tax_code_value || null,
        hsn_code: selectedProduct.hsn_code || null,
        sac_code: selectedProduct.sac_code || null,

        // NEW BOQ ENGINE FIELDS
        targetRequiredQty: targetRequiredQty,
        configBasis: configBasis,
        materialLines: materialLines,

        // Keep for backward compatibility/preview
        step11_items: pendingItems,
        finalize_description: pendingItems[0]?.description || "",
        created_at: new Date().toISOString(),
      };

      const requestBody = {
        project_id: selectedProjectId,
        version_id: selectedVersionId,
        estimator: estimatorType || "General",
        table_data: tableData,
      };

      const response = await apiFetch("/api/boq-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const newItem = await response.json();
        setBoqItems((prev) => [...prev, newItem]);
        toast({ title: "Success", description: `Added ${selectedProduct.name} to BOM with target quantity ${targetRequiredQty}` });
        setShowStep11Preview(false);
        setSelectedProduct(null);
        setPendingItems([]);

        // Reload to ensure state is fresh
        loadBoqItemsAndEdits();
      } else {
        throw new Error("Failed to save BOQ item");
      }
    } catch (error) {
      console.error("Failed to add to BOQ:", error);
      toast({ title: "Error", description: "Failed to add product to BOM", variant: "destructive" });
    }
  };

  const updateEditedField = (itemKey: string, field: string, value: any) => {
    setEditedFields((prev) => {
      const next = {
        ...prev,
        [itemKey]: {
          ...prev[itemKey],
          [field]: value,
        },
      };
      // keep ref in sync immediately to avoid races when Save is clicked right away
      editedFieldsRef.current = next;
      return next;
    });
  };

  const getEditedValue = (
    itemKey: string,
    field: string,
    originalValue: any,
  ) => {
    return (
      editedFields[itemKey]?.[
      field as keyof (typeof editedFields)[keyof typeof editedFields]
      ] ?? originalValue
    );
  };

  const handleSaveProject = async () => {
    if (!selectedVersionId) return;
    console.log("[CreateBoq] handleSaveProject START. editedFields (ref snapshot):", JSON.stringify(editedFieldsRef.current));

    try {
      // Permanently save the current edited fields to the database (use ref to avoid race)
      const payload = editedFieldsRef.current || {};
      const response = await apiFetch(
        `/api/boq-versions/${encodeURIComponent(selectedVersionId)}/save-edits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editedFields: payload }),
        },
      );

      console.log("[CreateBoq] Save API response status:", response.status);

      if (response.ok) {
        // Prefer authoritative data from server when available (server will return
        // `updatedItems`). If not present, fall back to optimistic merge + reload.
        let saveResp: any = null;
        try {
          saveResp = await response.json();
        } catch (e) {
          // ignore non-JSON
        }

        if (saveResp?.updatedItems && saveResp.updatedItems.length > 0) {
          // Merge server-returned items into local state
          setBoqItems((prev) => {
            const byId = new Map(prev.map((i) => [i.id, i]));
            for (const up of saveResp.updatedItems) {
              const td = typeof up.table_data === "string" ? JSON.parse(up.table_data) : up.table_data;
              const existing = byId.get(up.id) || {};
              byId.set(up.id, { ...existing, ...up, table_data: td });
            }
            return prev.map((p) => {
              const updated = byId.get(p.id);
              return updated ? updated : p;
            });
          });
          setEditedFields({});
          editedFieldsRef.current = {};
        } else {
          // Optimistic merge (UI stays consistent immediately)
          setBoqItems((prev) =>
            prev.map((item) => {
              const keys = Object.keys(editedFields).filter((k) => k.startsWith(`${item.id}-`));
              if (keys.length === 0) return item;

              const tableData =
                typeof item.table_data === "string"
                  ? JSON.parse(item.table_data)
                  : { ...(item.table_data || {}) };
              const step11_items = Array.isArray(tableData.step11_items)
                ? [...tableData.step11_items]
                : [];

              for (const key of keys) {
                const fields = editedFields[key] || {};

                // If this product is engine-based, displayLines are computed + manual items appended.
                const lastDashIndex = key.lastIndexOf("-");
                const idx = parseInt(key.substring(lastDashIndex + 1), 10);

                if (tableData.materialLines && tableData.targetRequiredQty !== undefined) {
                  try {
                    const result = computeBoq(tableData.configBasis, tableData.materialLines, tableData.targetRequiredQty);
                    const computedLen = Array.isArray(result.computed) ? result.computed.length : 0;

                    // If the key is for a manual item (e.g. "itemID-manual-idx")
                    if (key.includes("-manual-")) {
                      const parts = key.split("-manual-");
                      const manualIdx = parseInt(parts[1], 10);
                      if (step11_items[manualIdx]) {
                        step11_items[manualIdx] = { ...step11_items[manualIdx], ...fields };
                      }
                    } else if (idx >= computedLen) {
                      // fallback for standard index-based keys
                      const manualIdx = idx - computedLen;
                      if (step11_items[manualIdx]) {
                        step11_items[manualIdx] = { ...step11_items[manualIdx], ...fields };
                      }
                    }
                  } catch (e) {
                    // fallback
                    if (step11_items[idx]) step11_items[idx] = { ...step11_items[idx], ...fields };
                  }
                } else {
                  if (step11_items[idx]) {
                    step11_items[idx] = { ...step11_items[idx], ...fields };
                  }
                }
              }

              return { ...item, table_data: { ...tableData, step11_items } };
            }),
          );

          // Try to reload authoritative state from server. If reload fails we keep optimistic state.
          try {
            const loadResponse = await apiFetch(
              `/api/boq-items/version/${encodeURIComponent(selectedVersionId)}`,
              { headers: {} },
            );

            if (loadResponse.ok) {
              const data = await loadResponse.json();
              setBoqItems(data.items || []);
              setEditedFields({});
              editedFieldsRef.current = {};
            } else {
              console.warn("[CreateBoq] Failed to reload BOQ items after save; keeping optimistic local state");
            }
          } catch (loadErr) {
            console.error("[CreateBoq] Failed to reload BOQ items after save:", loadErr);
          }
        }

        toast({
          title: "Success",
          description: "Draft saved",
        });
      } else {
        const errText = await response.text().catch(() => null);
        throw new Error("Failed to save edits" + (errText ? `: ${errText}` : ""));
      }
    } catch (err) {
      console.error("Failed to save project:", err);
      toast({
        title: "Error",
        description: "Failed to save BOQ version",
        variant: "destructive",
      });
    }
  };

  const handleSubmitVersion = async (status: "submitted" | "pending_approval" = "pending_approval") => {
    if (!selectedVersionId) return;
    try {
      await apiFetch(`/api/boq-versions/${selectedVersionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      // Reload versions
      const response = await apiFetch(
        `/api/boq-versions/${encodeURIComponent(selectedProjectId!)}`,
        { headers: {} },
      );
      if (response.ok) {
        const data = await response.json();
        setVersions(data.versions || []);
      }

      toast({
        title: "Success",
        description: status === "pending_approval" ? "BOQ version submitted for approval" : "BOQ version locked",
      });
    } catch (err) {
      console.error("Failed to update status:", err);
      toast({
        title: "Error",
        description: "Failed to update version status",
        variant: "destructive",
      });
    }
  };

  const handleCreateNewVersion = async (copyFromPrevious: boolean) => {
    if (!selectedProjectId) return;

    try {
      const previousVersion = versions.length > 0 ? versions[0].id : null;

      const response = await apiFetch("/api/boq-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProjectId,
          copy_from_version: copyFromPrevious ? previousVersion : null,
        }),
      });

      if (response.ok) {
        const newVersion = await response.json();
        setVersions((prev) => [newVersion, ...prev]);
        setSelectedVersionId(newVersion.id);

        toast({
          title: "Success",
          description: `Created Version ${newVersion.version_number}`,
        });
      }
    } catch (err) {
      console.error("Failed to create version:", err);
      toast({
        title: "Error",
        description: "Failed to create version",
        variant: "destructive",
      });
    }
  };

  const handleDownloadExcel = () => {
    if (!selectedProjectId || boqItems.length === 0) {
      toast({
        title: "Info",
        description: "No BOQ items to download",
        variant: "default",
      });
      return;
    }

    try {
      // Build export rows first so we can detect which columns are present in the UI
      const rows: string[][] = [];
      let displayRowNum = 1;
      let totalSupplyAmount = 0;
      let totalInstallAmount = 0;

      // Flags to detect which columns are used in UI
      let hasUnit = false;
      let hasQty = false;
      let hasSupplyRate = false;
      let hasInstallRate = false;
      let hasSupplyAmount = false;
      let hasInstallAmount = false;

      // Gather all rows and update flags
      const exportLines: Array<{ productName: string; item: any; isEngine: boolean; boqItemId: string; itemIdx: number }>
        = [];

      boqItems.forEach((boqItem) => {
        let tableData: any = boqItem.table_data || {};
        if (typeof tableData === "string") {
          try { tableData = JSON.parse(tableData); } catch { tableData = {}; }
        }
        const step11Items = Array.isArray(tableData.step11_items) ? tableData.step11_items : [];
        const productName = tableData.product_name || boqItem.estimator;

        let displayLines = step11Items;
        if (tableData.materialLines && tableData.targetRequiredQty !== undefined) {
          const result = computeBoq(tableData.configBasis, tableData.materialLines, tableData.targetRequiredQty);
          displayLines = result.computed.map((line: any) => ({
            title: line.name,
            description: line.name,
            unit: line.unit,
            qty: line.scaledQty,
            supply_rate: line.supplyRate,
            install_rate: line.installRate,
            supply_amount: line.supplyAmount,
            install_amount: line.installAmount,
          }));
        }

        displayLines.forEach((item: any, itemIdx: number) => {
          exportLines.push({ productName, item, isEngine: !!tableData.materialLines, boqItemId: boqItem.id, itemIdx });

          // Update presence flags based on item properties
          if (item.unit !== undefined) hasUnit = true;
          if (item.qty !== undefined) hasQty = true;
          if (item.supply_rate !== undefined || item.supplyRate !== undefined) hasSupplyRate = true;
          if (item.install_rate !== undefined || item.installRate !== undefined) hasInstallRate = true;
          if (item.supply_amount !== undefined || item.supplyAmount !== undefined) hasSupplyAmount = true;
          if (item.install_amount !== undefined || item.installAmount !== undefined) hasInstallAmount = true;
        });
      });

      // Compose headers to match UI — only include columns present in the data/UI
      const headers = ["S.No", "Item", "Shop", "Description"];
      if (hasUnit) headers.push("Unit");
      if (hasQty) headers.push("Qty");
      if (hasSupplyRate) headers.push("Supply Rate");
      if (hasInstallRate) headers.push("Install Rate");
      if (hasSupplyAmount) headers.push("Supply Amount");
      if (hasInstallAmount) headers.push("Install Amount");

      // Now build rows using the detected columns
      exportLines.forEach(({ productName, item, isEngine, boqItemId, itemIdx }) => {
        const itemKey = `${boqItemId}-${itemIdx}`;
        const qty = isEngine ? (item.qty ?? 0) : getEditedValue(itemKey, "qty", item.qty ?? 0);
        const supplyRate = isEngine ? (item.supply_rate ?? item.supplyRate ?? 0) : getEditedValue(itemKey, "supply_rate", item.supply_rate ?? 0);
        const installRate = isEngine ? (item.install_rate ?? item.installRate ?? 0) : getEditedValue(itemKey, "install_rate", item.install_rate ?? 0);
        const description = isEngine ? (item.description ?? "") : getEditedValue(itemKey, "description", item.description ?? "");
        const unit = isEngine ? (item.unit ?? "") : getEditedValue(itemKey, "unit", item.unit ?? "");

        const supplyAmount = (item.supply_amount ?? item.supplyAmount) !== undefined ? (item.supply_amount ?? item.supplyAmount) : (qty * supplyRate);
        const installAmount = (item.install_amount ?? item.installAmount) !== undefined ? (item.install_amount ?? item.installAmount) : (qty * installRate);

        totalSupplyAmount += Number(supplyAmount) || 0;
        totalInstallAmount += Number(installAmount) || 0;

        const row: string[] = [];
        row.push(displayRowNum.toString());
        row.push(item.title || productName || "");
        row.push(item.shop_name || "");
        row.push(description);
        if (hasUnit) row.push(unit);
        if (hasQty) row.push(String(qty));
        if (hasSupplyRate) row.push(String(supplyRate));
        if (hasInstallRate) row.push(String(installRate));
        if (hasSupplyAmount) row.push(Number(supplyAmount).toFixed(2));
        if (hasInstallAmount) row.push(Number(installAmount).toFixed(2));

        rows.push(row);
        displayRowNum++;
      });

      // Add total row matching header layout
      const totalRow: string[] = [];
      // S.No, Item, Shop, Description
      totalRow.push(""); totalRow.push(""); totalRow.push(""); totalRow.push("");
      if (hasUnit) totalRow.push("");
      if (hasQty) totalRow.push("");
      if (hasSupplyRate) totalRow.push("");
      if (hasInstallRate) totalRow.push("Total");
      if (hasSupplyAmount) totalRow.push(Number(totalSupplyAmount).toFixed(2));
      if (hasInstallAmount) totalRow.push(Number(totalInstallAmount).toFixed(2));
      rows.push(totalRow);

      // Create CSV content with safe escaping
      const escapeCell = (cell: any) => {
        if (cell === null || cell === undefined) return "";
        const s = String(cell);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const csvContent = [
        headers.map(escapeCell).join(","),
        ...rows.map((row) => row.map(escapeCell).join(",")),
      ].join("\n");

      // Create blob and download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      const projectName = selectedProject?.name || "BOQ";
      const versionName = selectedVersion
        ? `V${selectedVersion.version_number}`
        : "draft";
      const filename = `${projectName}_${versionName}_BOQ.csv`;

      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Success",
        description: `Downloaded ${filename}`,
      });
    } catch (error) {
      console.error("Download failed:", error);
      toast({
        title: "Error",
        description: "Failed to download BOQ",
        variant: "destructive",
      });
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedProjectId || boqItems.length === 0) {
      toast({ title: "Info", description: "No BOQ items to download", variant: "default" });
      return;
    }

    try {
      const headers = [
        "S.No",
        "Product",
        "Shop",
        "Component",
        "Description",
        "Unit",
        "Qty",
        "Supply",
        "Install",
        "Total"
      ];

      const body: any[] = [];
      let globalIdx = 1;
      let grandTotal = 0;

      boqItems.forEach((boqItem) => {
        let tableData = boqItem.table_data || {};
        if (typeof tableData === "string") try { tableData = JSON.parse(tableData); } catch { tableData = {}; }

        const productName = tableData.product_name || boqItem.estimator || "—";
        const step11Items = Array.isArray(tableData.step11_items) ? tableData.step11_items : [];

        let displayLines = [];
        const isEngine = !!(tableData.materialLines && tableData.targetRequiredQty !== undefined);

        if (isEngine) {
          const res = computeBoq(tableData.configBasis, tableData.materialLines, tableData.targetRequiredQty);
          displayLines = res.computed.map((l: any) => ({
            title: l.name,
            description: l.name,
            unit: l.unit,
            qty: l.scaledQty,
            supply_rate: l.supplyRate,
            install_rate: l.installRate,
            shop_name: l.shop_name
          }));
        } else {
          displayLines = step11Items.map((it: any, idx: number) => {
            const itemKey = `${boqItem.id}-${idx}`;
            return {
              ...it,
              qty: getEditedValue(itemKey, "qty", it.qty || 0),
              supply_rate: getEditedValue(itemKey, "supply_rate", it.supply_rate || 0),
              install_rate: getEditedValue(itemKey, "install_rate", it.install_rate || 0),
              description: getEditedValue(itemKey, "description", it.description || ""),
              unit: getEditedValue(itemKey, "unit", it.unit || "")
            };
          });
        }

        displayLines.forEach((line: any) => {
          const sAmt = (line.qty || 0) * (line.supply_rate || 0);
          const iAmt = (line.qty || 0) * (line.install_rate || 0);
          const lTot = sAmt + iAmt;
          grandTotal += lTot;

          body.push([
            (globalIdx++).toString(),
            productName,
            line.shop_name || "—",
            line.title || "—",
            line.description || "—",
            line.unit || "—",
            (line.qty || 0).toString(),
            (line.supply_rate || 0).toFixed(2),
            (line.install_rate || 0).toFixed(2),
            lTot.toFixed(2)
          ]);
        });
      });

      // Fetch logo
      const logoPath = "/image.png";
      let logoDataUrl: string | null = null;
      try {
        const resp = await fetch(logoPath);
        const blob = await resp.blob();
        const reader = new FileReader();
        logoDataUrl = await new Promise<string | null>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch (e) { console.warn("Logo failed", e); }

      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const headerY = 10;

      if (logoDataUrl) {
        const imgProps: any = doc.getImageProperties(logoDataUrl);
        const imgH = 24;
        const imgW = (imgProps.width / imgProps.height) * imgH;
        doc.addImage(logoDataUrl, "PNG", 10, headerY, imgW, imgH);
      }

      const metaX = pageWidth - 10;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      const projStr = selectedProject?.name || "BOQ";
      doc.text(projStr, metaX, headerY + 6, { align: "right" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Client: ${selectedProject?.client || "-"}`, metaX, headerY + 12, { align: "right" });
      doc.text(`Budget: ${selectedProject?.budget || "-"}`, metaX, headerY + 18, { align: "right" });

      // @ts-ignore
      autoTable(doc, {
        head: [headers],
        body: body,
        startY: headerY + 30,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [64, 64, 64], textColor: [255, 255, 255], fontStyle: "bold" },
        theme: "grid"
      });

      const filename = `${projStr}_${selectedVersion ? `V${selectedVersion.version_number}` : "draft"}_BOQ.pdf`;
      doc.save(filename);
      toast({ title: "Success", description: "PDF downloaded successfully." });
    } catch (err) {
      console.error("PDF failed", err);
      toast({ title: "Error", description: "Failed to download PDF", variant: "destructive" });
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedVersion = versions.find((v) => v.id === selectedVersionId);
  const isVersionLocked = selectedVersion && ["submitted", "pending_approval", "approved", "rejected"].includes(selectedVersion.status);
  const isVersionSubmitted = isVersionLocked; // Keep name for compatibility with existing disabled props

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-8">Loading projects...</div>
      </Layout>
    );
  }

  return (
    <>
      <Layout>
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold"></h1>

          {/* Project creation moved to dedicated Create Project page */}

          {/* Select Project Section */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h2 className="text-lg font-semibold">Select Project</h2>
              <div className="flex-1">
                <Label>Projects</Label>
                <Select onValueChange={(v) => setSelectedProjectId(v || null)}>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        projects.length === 0 ? "No projects" : "Select project"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem value={p.id} key={p.id}>
                        {p.name} — {p.client || "(No client)"} — {p.location || "(No location)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProject && (
                <div className="text-sm text-gray-600 space-y-1">
                  <div>
                    <strong>Budget:</strong> {selectedProject.budget || "—"}
                  </div>
                  <div>
                    <strong>Status:</strong> {selectedProject.status || "draft"}
                  </div>
                </div>
              )}

              {selectedProjectId && (
                <div className="pt-4 space-y-4">
                  {/* Version Selector */}
                  <div className="space-y-2">
                    <Label>BOQ Versions</Label>
                    <div className="flex gap-2">
                      <Select
                        value={selectedVersionId || ""}
                        onValueChange={setSelectedVersionId}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select version" />
                        </SelectTrigger>
                        <SelectContent>
                          {versions.map((v) => (
                            <SelectItem value={v.id} key={v.id}>
                              {v.project_name ? `[${v.project_name}] ` : ""}V
                              {v.version_number} (
                              {v.status === "submitted" ? "Locked" :
                                v.status === "pending_approval" ? "Pending Approval" :
                                  v.status === "approved" ? "Approved" :
                                    v.status === "rejected" ? "Rejected" : "Draft"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedVersionId && (
                        <Button
                          onClick={async () => {
                            if (!selectedVersionId) return;
                            if (
                              !confirm(
                                "Delete this version and all its BOQ items? This cannot be undone.",
                              )
                            )
                              return;
                            try {
                              const resp = await apiFetch(
                                `/api/boq-versions/${encodeURIComponent(selectedVersionId)}`,
                                { method: "DELETE" },
                              );
                              if (resp.ok) {
                                // Reload versions for the project
                                const r2 = await apiFetch(
                                  `/api/boq-versions/${encodeURIComponent(selectedProjectId!)}`,
                                  { headers: {} },
                                );
                                if (r2.ok) {
                                  const data = await r2.json();
                                  setVersions(data.versions || []);
                                  // auto-select a draft or first version
                                  const draftVersion = (data.versions || []).find(
                                    (v: any) => v.status === "draft",
                                  );
                                  if (draftVersion)
                                    setSelectedVersionId(draftVersion.id);
                                  else if ((data.versions || []).length > 0)
                                    setSelectedVersionId(data.versions[0].id);
                                  else setSelectedVersionId(null);
                                  setBoqItems([]);
                                  toast({
                                    title: "Deleted",
                                    description: "Version removed",
                                  });
                                }
                              } else {
                                const text = await resp.text();
                                throw new Error(
                                  text || "Failed to delete version",
                                );
                              }
                            } catch (e) {
                              console.error("Failed to delete version", e);
                              toast({
                                title: "Error",
                                description: "Failed to delete version",
                                variant: "destructive",
                              });
                            }
                          }}
                          variant="destructive"
                        >
                          Delete Version
                        </Button>
                      )}
                      {versions.length > 0 && (
                        <Button
                          onClick={() => {
                            const lastVersion = versions[0];
                            if (
                              confirm(
                                `Copy items from V${lastVersion.version_number}?`,
                              )
                            ) {
                              handleCreateNewVersion(true);
                            } else {
                              handleCreateNewVersion(false);
                            }
                          }}
                          variant="outline"
                        >
                          + New Version
                        </Button>
                      )}
                      {versions.length === 0 && selectedProjectId && (
                        <Button
                          onClick={() => handleCreateNewVersion(false)}
                          variant="outline"
                        >
                          Create V1
                        </Button>
                      )}
                    </div>
                    {selectedVersion && (
                      <div className="text-sm text-gray-600 space-y-1 bg-blue-50 p-3 rounded">
                        <div>
                          <strong>Project:</strong>{" "}
                          {selectedVersion.project_name || "Unknown"}
                        </div>
                        <div>
                          <strong>Version:</strong> V
                          {selectedVersion.version_number}
                        </div>
                        {selectedVersion.project_client && (
                          <div>
                            <strong>Client:</strong>{" "}
                            {selectedVersion.project_client}
                          </div>
                        )}
                        {selectedVersion.project_location && (
                          <div>
                            <strong>Location:</strong>{" "}
                            {selectedVersion.project_location}
                          </div>
                        )}
                        {isVersionSubmitted && (
                          <span className="inline-block bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-semibold">
                            Submitted (Locked)
                          </span>
                        )}
                        {!isVersionSubmitted && (
                          <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-semibold">
                            Draft (Editable)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Add Product and Add Item buttons */}
                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddProduct}
                      className="flex-1"
                      disabled={isVersionSubmitted}
                      size="sm"
                    >
                      Add Product +
                    </Button>
                    <Button
                      onClick={handleAddProductManual}
                      variant="outline"
                      className="flex-1"
                      disabled={isVersionSubmitted}
                      size="sm"
                    >
                      Add Item
                    </Button>
                  </div>

                  <ProductPicker
                    open={showProductPicker}
                    onOpenChange={setShowProductPicker}
                    onSelectProduct={handleSelectProduct}
                    selectedProjectId={selectedProjectId}
                  />

                  <MaterialPicker
                    open={showMaterialPicker}
                    onOpenChange={setShowMaterialPicker}
                    onSelectTemplate={handleSelectMaterialTemplate}
                  />

                  {selectedProduct && (
                    <Step11Preview
                      product={selectedProduct}
                      open={showStep11Preview}
                      onClose={() => {
                        setShowStep11Preview(false);
                        // Clear product after modal closes to avoid unmounting mid-operation
                        setTimeout(() => {
                          setSelectedProduct(null);
                        }, 300);
                      }}
                      onAddToBoq={handleAddToBom}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          {/* BOQ Items Section */}
          {selectedProjectId && (
            <Card>
              <CardContent className="space-y-4 pt-6">
                <h2 className="text-lg font-semibold">BOQ Items</h2>
                {boqItems.length === 0 ? (
                  <div className="text-gray-500 text-center py-4">
                    No products added yet. Click Add Product +
                  </div>
                ) : (
                  <div className="space-y-8">
                    {boqItems.map((boqItem, boqIdx) => {
                      let tableData = boqItem.table_data || {};
                      if (typeof tableData === "string") {
                        try {
                          tableData = JSON.parse(tableData);
                        } catch (e) {
                          console.error("Failed to parse table_data for item", boqItem.id, e);
                          tableData = {};
                        }
                      }
                      const step11Items = Array.isArray(tableData.step11_items) ? tableData.step11_items : [];
                      const productName = tableData.product_name || boqItem.estimator;

                      // Compute Engine-based lines if recipe data exists
                      let displayLines = step11Items;
                      let isEngineBased = false;
                      let boqResult = null;

                      if (tableData.materialLines && tableData.targetRequiredQty !== undefined) {
                        isEngineBased = true;
                        boqResult = computeBoq(
                          tableData.configBasis,
                          tableData.materialLines,
                          tableData.targetRequiredQty
                        );
                        // Map computed lines
                        const computedLines = boqResult.computed.map((line: any, idx: number) => ({
                          title: line.name,
                          description: line.name,
                          unit: line.unit,
                          shop_name: line.shop_name,
                          qtyPerSqf: line.perUnitQty,
                          requiredQty: line.scaledQty,
                          roundOff: line.roundOffQty,
                          rateSqft: line.supplyRate + line.installRate,
                          amount: line.lineTotal,
                          s_no: idx + 1,
                          // computed rows are not editable
                          manual: false,
                        }));

                        // Include any manually added step11_items (marked manual=true) so they appear immediately and are editable
                        const manualStep11 = step11Items.map((it: any, s11Idx: number) => {
                          if (!it || !it.manual) return null;
                          const itemKey = `${boqItem.id}-manual-${s11Idx}`;

                          const qty = Number(getEditedValue(itemKey, "qty", it.qty ?? it.requiredQty ?? it.qtyPerSqf ?? 0)) || 0;
                          const sRate = Number(getEditedValue(itemKey, "supply_rate", it.supply_rate ?? it.supplyRate ?? 0)) || 0;
                          const iRate = Number(getEditedValue(itemKey, "install_rate", it.install_rate ?? it.installRate ?? 0)) || 0;
                          const rate = Number(getEditedValue(itemKey, "rate", (sRate + iRate))) || (sRate + iRate);
                          return {
                            ...it,
                            manual: true,
                            itemKey,
                            _s11Idx: s11Idx, // preserve original step11_items index for delete
                            qtyPerSqf: it.qtyPerSqf ?? 0,
                            supply_rate: sRate,
                            install_rate: iRate,
                            amount: Number((qty * rate).toFixed(2)),
                          };
                        }).filter(Boolean);

                        displayLines = [...computedLines, ...manualStep11];
                      } else {
                        // Manual product or engine product without materialLines
                        displayLines = step11Items.map((it: any, s11Idx: number) => {
                          const itemKey = it.itemKey || `${boqItem.id}-${s11Idx}`;
                          const qty = Number(getEditedValue(itemKey, "qty", it.qty ?? it.requiredQty ?? it.qtyPerSqf ?? 0)) || 0;
                          const sRate = Number(getEditedValue(itemKey, "supply_rate", it.supply_rate ?? it.supplyRate ?? 0)) || 0;
                          const iRate = Number(getEditedValue(itemKey, "install_rate", it.install_rate ?? it.installRate ?? 0)) || 0;
                          const rate = Number(getEditedValue(itemKey, "rate", (sRate + iRate))) || (sRate + iRate);
                          return {
                            ...it,
                            itemKey,
                            _s11Idx: s11Idx, // preserve original step11_items index for delete
                            qty, // Reflection of edited qty for the row display
                            amount: Number((qty * rate).toFixed(2)),
                          };
                        });
                      }

                      return (
                        <div key={boqItem.id} className="border rounded-lg overflow-hidden">
                          {/* Product Header */}
                          <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b border-gray-200">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2 font-semibold text-sm text-gray-800">
                                {boqIdx + 1}. {productName}
                                {tableData.category && <span className="text-xs text-gray-500 font-normal">({tableData.category})</span>}
                                {tableData.is_finalized && (
                                  <span className="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-semibold ml-2">Finalized</span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 ml-1"
                                  title={expandedProductIds.has(boqItem.id) ? "Collapse items" : "Expand to see items"}
                                  onClick={() => {
                                    setExpandedProductIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(boqItem.id)) next.delete(boqItem.id); else next.add(boqItem.id);
                                      return next;
                                    });
                                  }}
                                >
                                  {expandedProductIds.has(boqItem.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              </div>
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Input
                                    placeholder="Enter product description..."
                                    className="h-8 text-xs w-full max-w-md mt-1"
                                    defaultValue={tableData.finalize_description || ""}
                                    disabled={isVersionSubmitted}
                                    onBlur={async (e) => {
                                      const newDesc = e.target.value;
                                      if (newDesc === (tableData.finalize_description || "")) return;

                                      try {
                                        const updatedTd = { ...tableData, finalize_description: newDesc };
                                        const resp = await apiFetch(`/api/boq-items/${boqItem.id}`, {
                                          method: "PUT",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ table_data: updatedTd }),
                                        });
                                        if (resp.ok) {
                                          toast({ title: "Saved", description: "Product description updated" });
                                          // Update local state to reflect the change without full reload if possible
                                          setBoqItems(prev => prev.map(item =>
                                            item.id === boqItem.id ? { ...item, table_data: updatedTd } : item
                                          ));
                                        }
                                      } catch (err) {
                                        console.error("Failed to save description", err);
                                        toast({ title: "Error", description: "Failed to save description", variant: "destructive" });
                                      }
                                    }}
                                  />
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    {(tableData.hsn_code || tableData.hsn_sac_type === 'hsn') && (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">HSN:</span>
                                        <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 min-w-[60px]">
                                          {tableData.hsn_code || (tableData.hsn_sac_type === 'hsn' ? tableData.hsn_sac_code : "") || "\u2014"}
                                        </span>
                                      </div>
                                    )}
                                    {(tableData.sac_code || tableData.hsn_sac_type === 'sac') && (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">SAC:</span>
                                        <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 min-w-[60px]">
                                          {tableData.sac_code || (tableData.hsn_sac_type === 'sac' ? tableData.hsn_sac_code : "") || "\u2014"}
                                        </span>
                                      </div>
                                    )}
                                    {(!tableData.hsn_code && !tableData.sac_code && !tableData.hsn_sac_code) && (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">HSN/SAC:</span>
                                        <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded border border-gray-200 min-w-[80px]">\u2014</span>
                                      </div>
                                    )}
                                  </div>

                                </div>
                                {isEngineBased && (
                                  <div className="flex items-center gap-2 text-[11px] text-gray-600 font-medium">
                                    Project Target: <span className="text-blue-600 font-bold">{tableData.targetRequiredQty} {tableData.configBasis?.requiredUnitType}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {!tableData.is_finalized && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={isVersionSubmitted}
                                  onClick={() => handleAddItem(boqItem.id)}
                                >
                                  + Add Item
                                </Button>
                              )}
                              <Button
                                variant="default"
                                size="sm"
                                className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                                disabled={isVersionSubmitted || tableData.is_finalized}
                                onClick={() => handleFinalizeProduct(boqItem.id)}
                              >
                                Finalize
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={isVersionSubmitted}
                                onClick={async () => {
                                  if (!confirm("Delete this product and all its items?")) return;
                                  try {
                                    await apiFetch(`/api/boq-items/${boqItem.id}`, { method: "DELETE" });
                                    setBoqItems((prev) => prev.filter((i) => i.id !== boqItem.id));
                                    toast({ title: "Deleted", description: "Product removed" });
                                  } catch (error) {
                                    toast({ title: "Error", description: "Failed to delete product", variant: "destructive" });
                                  }
                                }}
                              >
                                Delete Product
                              </Button>
                            </div>
                          </div>



                          {/* Items Table */}
                          {expandedProductIds.has(boqItem.id) && (
                            <>
                              <div className="overflow-x-auto">
                                <table className="border-collapse text-xs min-w-full">
                                  <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                      <th className="border px-2 py-2 text-left font-semibold w-10">Sl</th>
                                      <th className="border px-2 py-2 text-left font-semibold w-64">Item</th>
                                      <th className="border px-2 py-2 text-left font-semibold w-32">Shop</th>
                                      <th className="border px-2 py-2 text-left font-semibold w-[300px]">Description</th>
                                      <th className="border px-2 py-2 text-center font-semibold w-16">Unit</th>
                                      <th className="border px-2 py-2 text-center font-semibold w-20">Qty/{tableData.configBasis?.requiredUnitType || "Sqf"}</th>
                                      <th className="border px-2 py-2 text-center font-semibold w-24">Required Qty</th>
                                      <th className="border px-2 py-2 text-center font-semibold w-24">Round off</th>
                                      <th className="border px-2 py-2 text-center font-semibold w-24">Rate/{tableData.configBasis?.requiredUnitType || "Sqft"}</th>
                                      <th className="border px-2 py-2 text-center font-semibold w-28 text-green-700">Amount</th>
                                      <th className="border px-2 py-2 text-center font-semibold w-16">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {displayLines.length === 0 ? (
                                      <tr>
                                        <td colSpan={isEngineBased ? 11 : 10} className="text-center py-4 text-gray-500 italic">
                                          No items in this product group. Click \"+ Add Item\" to add one.
                                        </td>
                                      </tr>
                                    ) : (
                                      displayLines.map((step11Item: any, itemIdx: number) => {
                                        const itemKey = step11Item.itemKey || `${boqItem.id}-${itemIdx}`;

                                        // Per-item engine flag: treat manually added step11 items as editable even inside engine-based products
                                        const perItemIsEngine = isEngineBased && !step11Item.manual;

                                        // For engine rows (perItemIsEngine=true) use computed/original values; for non-engine or manual rows allow edits
                                        const qtyPerSqf = perItemIsEngine
                                          ? (step11Item.qtyPerSqf ?? step11Item.qtyPerSqf ?? 0)
                                          : 0;

                                        // `qty` represents the required quantity (used for amount calculations)
                                        const qty = perItemIsEngine ? (step11Item.qty || 0) : getEditedValue(itemKey, "qty", step11Item.qty || 0);

                                        const supplyRate = perItemIsEngine ? (step11Item.supply_rate ?? step11Item.supplyRate ?? 0) : (getEditedValue(itemKey, "supply_rate", step11Item.supply_rate || 0));
                                        const installRate = perItemIsEngine ? (step11Item.install_rate ?? step11Item.installRate ?? 0) : (getEditedValue(itemKey, "install_rate", step11Item.install_rate || 0));
                                        const description = perItemIsEngine ? (step11Item.description || "") : getEditedValue(itemKey, "description", step11Item.description || "");
                                        const unit = perItemIsEngine ? (step11Item.unit || "pcs") : getEditedValue(itemKey, "unit", step11Item.unit || "pcs");

                                        // Unified rate: prefer explicit `rate` edited field, otherwise fall back to supply+install
                                        const editedRate = getEditedValue(itemKey, "rate", undefined as any);
                                        const rateVal = perItemIsEngine
                                          ? (step11Item.rateSqft ?? ((step11Item.supply_rate || 0) + (step11Item.install_rate || 0)))
                                          : (editedRate !== undefined ? editedRate : ((supplyRate || 0) + (installRate || 0)));

                                        const supplyAmount = qty * (perItemIsEngine ? (step11Item.supply_rate ?? step11Item.supplyRate ?? 0) : (rateVal || 0));
                                        const installAmount = perItemIsEngine ? (qty * (step11Item.install_rate ?? step11Item.installRate ?? 0)) : 0;

                                        if (perItemIsEngine) {
                                          return (
                                            <tr key={itemKey} className="border-b border-gray-100 hover:bg-blue-50/50 text-xs">
                                              <td className="border px-2 py-1 text-center">{itemIdx + 1}</td>
                                              <td className="border px-2 py-1 font-medium">
                                                {step11Item.title}
                                                {step11Item.manual && (
                                                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-tighter">
                                                    Manual
                                                  </span>
                                                )}
                                              </td>
                                              <td className="border px-2 py-1 text-gray-600">{step11Item.shop_name || "-"}</td>
                                              <td className="border px-2 py-1 text-gray-600 truncate max-w-[200px]" title={description}>{description}</td>
                                              <td className="border px-2 py-1 text-center">{unit}</td>
                                              <td className="border px-2 py-1 text-center">{(step11Item.qtyPerSqf ?? 0).toFixed(3)}</td>
                                              <td className="border px-2 py-1 text-center text-blue-600">{(step11Item.requiredQty ?? step11Item.qty ?? 0).toFixed(2)}</td>
                                              <td className="border px-2 py-1 text-center font-bold">{step11Item.roundOff}</td>
                                              <td className="border px-2 py-1 text-right">₹{(step11Item.rateSqft || 0).toLocaleString()}</td>
                                              <td className="border px-2 py-1 text-right font-bold bg-green-50/30">₹{(step11Item.amount || 0).toLocaleString()}</td>
                                              <td className="border px-2 py-1 text-center">
                                                <Button title="Delete this item" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-800 hover:bg-red-100 font-bold" onClick={() => {
                                                  if (!confirm("Delete this item?")) return;
                                                  void handleDeleteRow(boqItem.id, tableData, itemIdx, step11Item);
                                                }}>🗑</Button>
                                              </td>
                                            </tr>
                                          );
                                        }

                                        return (
                                          <tr key={itemKey} className="border-b border-gray-100 hover:bg-blue-50/50">
                                            <td className="border px-2 py-1 text-center text-xs">{itemIdx + 1}</td>
                                            <td className="border px-2 py-1 font-medium text-xs">
                                              {step11Item.title || "Item"}
                                              {step11Item.manual && (
                                                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-tighter">
                                                  Manual
                                                </span>
                                              )}
                                            </td>
                                            <td className="border px-2 py-1 text-gray-600">{step11Item.shop_name || "-"}</td>
                                            <td className="border px-2 py-1">
                                              <textarea
                                                value={description}
                                                onChange={(e) => updateEditedField(itemKey, "description", e.target.value)}
                                                disabled={isVersionSubmitted || tableData.is_finalized}
                                                className="w-full border rounded px-1 py-0.5 text-xs min-h-[60px] resize-y focus:ring-1 ring-blue-500 outline-none"
                                                placeholder="Description"
                                              />
                                            </td>
                                            <td className="border px-2 py-1">
                                              <input
                                                type="text"
                                                value={unit}
                                                onChange={(e) => updateEditedField(itemKey, "unit", e.target.value)}
                                                disabled={isVersionSubmitted || tableData.is_finalized}
                                                className="w-full border rounded px-1 py-0.5 text-xs text-center focus:ring-1 ring-blue-500 outline-none"
                                              />
                                            </td>
                                            <td className="border px-2 py-1 text-center">
                                              <input
                                                type="number"
                                                value={qty}
                                                onChange={(e) => updateEditedField(itemKey, "qty", parseFloat(e.target.value) || 0)}
                                                disabled={isVersionSubmitted || tableData.is_finalized}
                                                className="w-full border rounded px-1 py-0.5 text-xs text-center font-medium focus:ring-1 ring-blue-500 outline-none"
                                              />
                                            </td>
                                            <td className="border px-2 py-1 text-center text-blue-600">{(getEditedValue(itemKey, "qty", step11Item.qty || 0) || 0).toFixed(2)}</td>
                                            <td className="border px-2 py-1 font-bold text-center">-</td>
                                            <td className="border px-1 py-1">
                                              <input
                                                type="number"
                                                value={rateVal}
                                                onChange={(e) => {
                                                  const v = parseFloat(e.target.value) || 0;
                                                  // store unified rate and mirror into supply_rate for compatibility
                                                  updateEditedField(itemKey, "rate", v);
                                                  updateEditedField(itemKey, "supply_rate", v);
                                                  updateEditedField(itemKey, "install_rate", 0);
                                                }}
                                                disabled={isVersionSubmitted || tableData.is_finalized}
                                                className="w-full border rounded px-1 py-0.5 text-xs text-right focus:ring-1 ring-blue-500 outline-none"
                                                placeholder="Rate"
                                              />
                                            </td>
                                            <td className="border px-1 py-1 text-right text-xs bg-gray-50/50 font-bold">
                                              ₹{(qty * (rateVal || 0)).toFixed(2)}
                                            </td>
                                            <td className="border px-2 py-1 text-center">
                                              <Button
                                                title="Delete this item"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0 text-red-600 hover:text-red-800 hover:bg-red-100 font-bold"
                                                disabled={isVersionSubmitted || tableData.is_finalized}
                                                onClick={async () => {
                                                  if (!confirm("Delete this item?")) return;
                                                  try {
                                                    await handleDeleteRow(boqItem.id, tableData, itemIdx, step11Item);
                                                  } catch (e) {
                                                    console.error('Failed to delete item via handler', e);
                                                    toast({ title: 'Error', description: 'Failed to delete item', variant: 'destructive' });
                                                  }
                                                }}
                                              >
                                                🗑
                                              </Button>
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                  <tfoot className="bg-gray-50/50 font-bold border-t-2 border-gray-200">
                                    <tr>
                                      <td colSpan={isEngineBased ? 9 : 8} className="border px-2 py-1.5 text-right uppercase tracking-wider text-[10px] text-gray-500">Total</td>
                                      <td className="border px-2 py-1.5 text-right text-green-700 bg-green-50/50">
                                        ₹{displayLines.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                      <td className="border px-2 py-1.5"></td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                              {(isEngineBased || step11Items.length > 0) && (
                                <div className="bg-gray-50 px-4 py-2 flex justify-end border-t border-gray-200">
                                  <div className="flex items-center gap-4">
                                    <span className="text-xs font-bold text-gray-500 uppercase">Rate per {tableData.configBasis?.requiredUnitType || "Unit"}:</span>
                                    <span className="text-sm font-extrabold text-blue-700 border-b-2 border-blue-600">
                                      ₹{(displayLines.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0) / (tableData.targetRequiredQty || (Number(step11Items[0]?.qty) || 1))).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}


              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          {
            selectedProjectId && selectedVersionId && (
              <Card>
                <CardContent className="space-y-3 pt-6">
                  {selectedVersion?.status === "submitted" ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-800 flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      <div>
                        <strong>Version Locked.</strong> This version is locked from further edits.
                      </div>
                    </div>
                  ) : selectedVersion?.status === "pending_approval" ? (
                    <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <div>
                        <strong>Pending Approval.</strong> This version is being reviewed by admin.
                      </div>
                    </div>
                  ) : selectedVersion?.status === "approved" ? (
                    <div className="bg-green-50 border border-green-200 rounded p-4 text-sm text-green-800 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <div>
                        <strong>Approved!</strong> This version has been approved and moved to Finalize BOQ.
                      </div>
                    </div>
                  ) : selectedVersion?.status === "rejected" ? (
                    <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-800 space-y-1">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        <strong>Rejected.</strong> This version was rejected.
                      </div>
                      {selectedVersion.rejection_reason && (
                        <p className="mt-1 italic">Reason: {selectedVersion.rejection_reason}</p>
                      )}
                      <p className="text-xs font-semibold mt-2 underline">Note: Create a new version to make requested changes.</p>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <Button
                      onClick={handleSaveProject}
                      variant="outline"
                      disabled={isVersionSubmitted || Object.keys(editedFields).length === 0}
                    >
                      Save Draft
                    </Button>
                    <Button
                      onClick={() => handleSubmitVersion("submitted")}
                      variant="outline"
                      className="border-primary text-primary hover:bg-primary/5 font-bold"
                      disabled={isVersionSubmitted || boqItems.length === 0}
                    >
                      Lock Version
                    </Button>
                    <Button
                      onClick={() => handleSubmitVersion("pending_approval")}
                      variant="default"
                      className="bg-primary hover:bg-primary/90 font-bold"
                      disabled={isVersionSubmitted || boqItems.length === 0}
                    >
                      Submit for Approval
                    </Button>
                    <Button
                      onClick={handleDownloadExcel}
                      variant="outline"
                      disabled={boqItems.length === 0}
                    >
                      Download Excel
                    </Button>
                    <Button
                      onClick={handleDownloadPdf}
                      variant="outline"
                      disabled={boqItems.length === 0}
                    >
                      Download PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          }
        </div>
      </Layout>

      <Dialog open={targetQtyModalOpen} onOpenChange={setTargetQtyModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Project Requirement</DialogTitle>
            <DialogDescription>
              Enter the required quantity for this product in your project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Please enter the required quantity for <span className="font-bold underline">{selectedProduct?.name}</span> in this project:</p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={targetRequiredQty}
                  onChange={(e) => setTargetRequiredQty(Number(e.target.value))}
                  className="text-lg font-bold"
                />
                <span className="text-muted-foreground font-semibold">
                  {pendingItems[0]?.unit || 'Sqft'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground italic">Quantity will be scaled according to product recipe.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTargetQtyModalOpen(false)}>Cancel</Button>
            <Button onClick={confirmAddToBom} className="bg-primary text-white font-bold">Add to BOM</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
