import { useEffect, useState, useRef } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
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
  status: "draft" | "submitted";
  created_at: string;
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
    };
  }>({});
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
          setBoqItems(data.items || []);
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

  const handleSelectMaterialTemplate = (template: any) => {
    setSelectedMaterialTemplate(template);
    setShowMaterialPicker(false);
    // Directly add the material template to BOQ
    if (targetBoqItemId) {
      handleAddItemToProduct(targetBoqItemId, template);
    } else {
      handleAddMaterialToBoq(template);
    }
    setTargetBoqItemId(null);
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
      // Determine unit and rate from template or existing material record
      let unit = template.unit || template.uom || "pcs";
      let rate = Number(template.rate ?? template.supply_rate ?? template.default_rate ?? 0) || 0;

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
      setBoqItems((prev) => [...prev, newItem]);

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

      // Determine unit and rate from template or authoritative material record
      let unit = template.unit || template.uom || "pcs";
      let rate = Number(template.rate ?? template.supply_rate ?? template.default_rate ?? 0) || 0;

      if (template.id) {
        try {
          const matRes = await apiFetch(`/api/materials/${encodeURIComponent(template.id)}`);
          if (matRes.ok) {
            const matData = await matRes.json();
            const mat = matData.material || matData;
            unit = mat.unit || unit;
            rate = Number(mat.rate ?? mat.supply_rate ?? rate) || rate;
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
      };

      // If this product is engine-based (has materialLines + targetRequiredQty), add to materialLines
      let updatedTableData: any;
      if (tableData.materialLines && tableData.targetRequiredQty !== undefined) {
        // Ensure materialLines is an array
        const materialLines = Array.isArray(tableData.materialLines) ? [...tableData.materialLines] : [];

        // Map template to materialLine shape expected by computeBoq
        const newMaterialLine = {
          id: template.id || `temp-${Date.now()}`,
          name: template.name,
          unit: template.unit || template.uom || newItem.unit,
          baseQty: Number(template.baseQty ?? template.qty ?? 1),
          wastagePct: template.wastagePct !== undefined ? Number(template.wastagePct) : undefined,
          supplyRate: Number(template.rate ?? template.supply_rate ?? template.default_rate ?? 0) || 0,
          installRate: Number(template.install_rate ?? 0) || 0,
          applyWastage: template.apply_wastage !== undefined ? Boolean(template.apply_wastage) : true,
          location: template.location || template.technicalspecification || "Main Area",
        };

        materialLines.push(newMaterialLine);

        // Also add a compatible `step11_items` entry so non-engine UI paths reflect the new item immediately
        const step11Items = Array.isArray(tableData.step11_items) ? [...tableData.step11_items] : [];
        const mappedStep11 = {
          title: newMaterialLine.name,
          description: newMaterialLine.name,
          unit: newMaterialLine.unit,
          qty: newMaterialLine.baseQty,
          // qtyPerSqf represents per-unit quantity (Qty/Sqf) for engine table
          qtyPerSqf: newMaterialLine.baseQty,
          supply_rate: newMaterialLine.supplyRate,
          install_rate: newMaterialLine.installRate,
          location: newMaterialLine.location,
          s_no: step11Items.length + 1,
          // mark as manually added so UI can render it editable even in engine-based products
          manual: true,
        };
        step11Items.push(mappedStep11);

        updatedTableData = { ...tableData, materialLines, step11_items: step11Items };

        // Optimistic update
        setBoqItems(prev => prev.map(item =>
          item.id === boqItemId
            ? { ...item, table_data: updatedTableData }
            : item
        ));
      } else {
        const updatedStep11Items = [...currentStep11Items, newItem];
        updatedTableData = { ...tableData, step11_items: updatedStep11Items };

        // Optimistic update
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
      if (!confirm("This will consolidate all items into a single row with the total amount. Continue?")) return;

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

      const currentStep11Items = Array.isArray(tableData.step11_items) ? tableData.step11_items : [];
      if (currentStep11Items.length === 0) {
        toast({ title: "Info", description: "No items to finalize" });
        return;
      }

      // Calculate totals
      let totalSupply = 0;
      let totalInstall = 0;

      if (tableData.materialLines && tableData.targetRequiredQty !== undefined) {
        const result = computeBoq(tableData.configBasis, tableData.materialLines, tableData.targetRequiredQty);
        totalSupply = result.totalSupply;
        totalInstall = result.totalInstall;
      } else {
        for (let i = 0; i < currentStep11Items.length; i++) {
          const item = currentStep11Items[i];
          const itemKey = `${boqItemId}-${i}`;
          const qty = getEditedValue(itemKey, "qty", item.qty || 0);
          const sRate = getEditedValue(itemKey, "supply_rate", item.supply_rate || 0);
          const iRate = getEditedValue(itemKey, "install_rate", item.install_rate || 0);
          totalSupply += (qty * sRate);
          totalInstall += (qty * iRate);
        }
      }

      // Create single consolidated item
      const consolidatedItem: Step11Item = {
        title: tableData.product_name || "Consolidated Product",
        description: `Consolidated configuration for ${tableData.product_name || "Product"}`,
        unit: tableData.configBasis?.requiredUnitType || "Sqft", // Use config basis unit if available, else default
        qty: 1,
        supply_rate: totalSupply,
        install_rate: totalInstall,
        location: "Main Area",
        s_no: 1
      };

      // Collect all nested product materials (from Manage Product) for display
      const allProductMaterials: any[] = [];
      for (const item of currentStep11Items) {
        if (Array.isArray(item.step11_items) && item.step11_items.length > 0) {
          allProductMaterials.push(...item.step11_items);
        }
      }

      const newTableData = {
        ...tableData,
        step11_items: [consolidatedItem],
        is_finalized: true,
        original_items: currentStep11Items,
        product_materials: allProductMaterials.length > 0 ? allProductMaterials : undefined,
      };

      // Optimistic update
      setBoqItems(prev => prev.map(item =>
        item.id === boqItemId
          ? { ...item, table_data: newTableData }
          : item
      ));

      // Clear edits for this item to avoid confusion
      setEditedFields(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          if (key.startsWith(`${boqItemId}-`)) delete next[key];
        });
        return next;
      });

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

  const handleDeleteRow = async (boqItemId: string, tableData: any, itemIdx: number) => {
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
        const manualIdx = itemIdx - computedLen;
        const step11 = Array.isArray(tableData.step11_items) ? [...tableData.step11_items] : [];
        step11.splice(manualIdx, 1);
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
            installRate: Number(item.install_rate)
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

        // NEW BOQ ENGINE FIELDS
        targetRequiredQty: targetRequiredQty,
        configBasis: configBasis,
        materialLines: materialLines,

        // Keep for backward compatibility/preview
        step11_items: pendingItems,
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
                const idxStr = key.substring(key.lastIndexOf("-") + 1);
                const idx = parseInt(idxStr, 10);
                const fields = editedFields[key] || {};

                // If this product is engine-based, displayLines are computed + manual items appended.
                // In that case, edited keys for manual entries will have an index offset by computed.length.
                if (tableData.materialLines && tableData.targetRequiredQty !== undefined) {
                  try {
                    const result = computeBoq(tableData.configBasis, tableData.materialLines, tableData.targetRequiredQty);
                    const computedLen = Array.isArray(result.computed) ? result.computed.length : 0;
                    if (idx >= computedLen) {
                      // map to manual step11_items index
                      const manualIdx = idx - computedLen;
                      if (step11_items[manualIdx]) {
                        step11_items[manualIdx] = { ...step11_items[manualIdx], ...fields };
                      }
                    } else {
                      // editing computed rows not supported; skip
                    }
                  } catch (e) {
                    // fallback: attempt direct mapping if computeBoq fails
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

  const handleSubmitVersion = async () => {
    if (!selectedVersionId) return;
    try {
      await apiFetch(`/api/boq-versions/${selectedVersionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "submitted" }),
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
        description: "BOQ version submitted and locked",
      });
    } catch (err) {
      console.error("Failed to submit version:", err);
      toast({
        title: "Error",
        description: "Failed to submit version",
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
      const headers = ["S.No", "Item", "Description"];
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
      // S.No, Item, Description
      totalRow.push(""); totalRow.push(""); totalRow.push("");
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
            install_rate: l.installRate
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
  const isVersionSubmitted = selectedVersion?.status === "submitted";

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
                              {v.status === "submitted" ? "Locked" : "Draft"})
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
                    {/* removed 'Add Product (Manual)' button per request */}
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
                        const manualStep11 = step11Items.filter((it: any) => it && it.manual).map((it: any) => {
                          const qty = Number(it.qty ?? it.requiredQty ?? it.qtyPerSqf ?? 0) || 0;
                          const sRate = Number(it.supply_rate ?? it.supplyRate ?? 0) || 0;
                          const iRate = Number(it.install_rate ?? it.installRate ?? 0) || 0;
                          return {
                            ...it,
                            manual: true,
                            qtyPerSqf: it.qtyPerSqf ?? it.qtyPerSqf ?? 0,
                            supply_rate: sRate,
                            install_rate: iRate,
                            amount: Number((qty * (sRate + iRate)) || 0),
                          };
                        });

                        displayLines = [...computedLines, ...manualStep11];
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
                              {isEngineBased && (
                                <div className="flex items-center gap-2 text-[11px] text-gray-600 font-medium">
                                  Project Target: <span className="text-blue-600 font-bold">{tableData.targetRequiredQty} {tableData.configBasis?.requiredUnitType}</span>
                                </div>
                              )}
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

                          {/* Expandable original items for finalized products omitted for brevity in engine-based items or preserved for non-engine items */}
                          {tableData.is_finalized && expandedProductIds.has(boqItem.id) && (() => {
                            // ... existing logic for finalized expansion ...
                            // (This part is preserved as is from standard implementation)
                            const origItems = (tableData.original_items && tableData.original_items.length > 0) ? tableData.original_items : [];
                            const prodMaterials = (tableData.product_materials && tableData.product_materials.length > 0) ? tableData.product_materials : [];
                            let nestedMaterials: any[] = [];
                            if (prodMaterials.length === 0) {
                              for (const item of step11Items) {
                                if (Array.isArray(item.step11_items) && item.step11_items.length > 0) {
                                  nestedMaterials.push(...item.step11_items);
                                }
                              }
                              if (nestedMaterials.length === 0 && origItems.length === 0) {
                                nestedMaterials = step11Items;
                              }
                            }
                            const allMaterials = prodMaterials.length > 0 ? prodMaterials : nestedMaterials;
                            const displayItemsOrig = origItems.length > 0 ? origItems : allMaterials;
                            if (displayItemsOrig.length === 0 && allMaterials.length === 0) return null;

                            return (
                              <div className="bg-blue-50/50 border-b border-blue-200 px-4 py-3">
                                {origItems.length > 0 && (
                                  <>
                                    <div className="text-xs font-semibold text-blue-700 mb-2">BOQ Items ({origItems.length})</div>
                                    <div className="overflow-x-auto mb-3">
                                      <table className="border-collapse text-xs min-w-full">
                                        <thead>
                                          <tr className="bg-blue-100/50 border-b border-blue-200">
                                            <th className="border border-blue-200 px-2 py-1 text-left font-semibold w-10">S.No</th>
                                            <th className="border border-blue-200 px-2 py-1 text-left font-semibold w-48">Item</th>
                                            <th className="border border-blue-200 px-2 py-1 text-left font-semibold">Description</th>
                                            <th className="border border-blue-200 px-2 py-1 text-center font-semibold w-16">Unit</th>
                                            <th className="border border-blue-200 px-2 py-1 text-center font-semibold w-16">Qty</th>
                                            <th className="border border-blue-200 px-2 py-1 text-right font-semibold w-24">Supply Rate</th>
                                            <th className="border border-blue-200 px-2 py-1 text-right font-semibold w-24">Install Rate</th>
                                            <th className="border border-blue-200 px-2 py-1 text-right font-semibold w-28">Supply Amt</th>
                                            <th className="border border-blue-200 px-2 py-1 text-right font-semibold w-28">Install Amt</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {origItems.map((origItem: any, origIdx: number) => {
                                            const oQty = origItem.qty || 0;
                                            const oSupply = origItem.supply_rate || 0;
                                            const oInstall = origItem.install_rate || 0;
                                            return (
                                              <tr key={origIdx} className="border-b border-blue-100 bg-white/70">
                                                <td className="border border-blue-200 px-2 py-1 text-center">{origIdx + 1}</td>
                                                <td className="border border-blue-200 px-2 py-1 font-medium">{origItem.title || "Item"}</td>
                                                <td className="border border-blue-200 px-2 py-1 text-gray-600">{origItem.description || "-"}</td>
                                                <td className="border border-blue-200 px-2 py-1 text-center">{origItem.unit || "pcs"}</td>
                                                <td className="border border-blue-200 px-2 py-1 text-center">{oQty}</td>
                                                <td className="border border-blue-200 px-2 py-1 text-right">₹{oSupply.toFixed(2)}</td>
                                                <td className="border border-blue-200 px-2 py-1 text-right">₹{oInstall.toFixed(2)}</td>
                                                <td className="border border-blue-200 px-2 py-1 text-right bg-blue-50/30">₹{(oQty * oSupply).toFixed(2)}</td>
                                                <td className="border border-blue-200 px-2 py-1 text-right bg-blue-50/30">₹{(oQty * oInstall).toFixed(2)}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                )}
                                {allMaterials.length > 0 && (
                                  <>
                                    <div className="text-xs font-semibold text-green-700 mb-2 mt-2">Product Materials ({allMaterials.length})</div>
                                    <div className="overflow-x-auto">
                                      <table className="border-collapse text-xs min-w-full">
                                        {/* ... existing table for materials ... */}
                                      </table>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}

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
                                        const itemKey = `${boqItem.id}-${itemIdx}`;

                                        // Per-item engine flag: treat manually added step11 items as editable even inside engine-based products
                                        const perItemIsEngine = isEngineBased && !step11Item.manual;

                                        // For engine rows (perItemIsEngine=true) use computed/original values; for non-engine or manual rows allow edits
                                        const qtyPerSqf = perItemIsEngine
                                          ? (step11Item.qtyPerSqf ?? step11Item.qtyPerSqf ?? 0)
                                          : getEditedValue(itemKey, "qtyPerSqf", step11Item.qtyPerSqf || 0);

                                        // `qty` represents the required quantity (used for amount calculations)
                                        const qty = perItemIsEngine ? (step11Item.qty || 0) : getEditedValue(itemKey, "qty", step11Item.qty || 0);

                                        const supplyRate = perItemIsEngine ? (step11Item.supply_rate ?? step11Item.supplyRate ?? 0) : getEditedValue(itemKey, "supply_rate", step11Item.supply_rate || 0);
                                        const installRate = perItemIsEngine ? (step11Item.install_rate ?? step11Item.installRate ?? 0) : getEditedValue(itemKey, "install_rate", step11Item.install_rate || 0);
                                        const description = perItemIsEngine ? (step11Item.description || "") : getEditedValue(itemKey, "description", step11Item.description || "");
                                        const unit = perItemIsEngine ? (step11Item.unit || "pcs") : getEditedValue(itemKey, "unit", step11Item.unit || "pcs");

                                        const supplyAmount = qty * supplyRate;
                                        const installAmount = qty * installRate;

                                        if (perItemIsEngine) {
                                          return (
                                            <tr key={itemKey} className="border-b border-gray-100 hover:bg-blue-50/50 text-xs">
                                              <td className="border px-2 py-1 text-center">{itemIdx + 1}</td>
                                              <td className="border px-2 py-1 font-medium">{step11Item.title}</td>
                                              <td className="border px-2 py-1 text-gray-600">{step11Item.shop_name || "-"}</td>
                                              <td className="border px-2 py-1 text-gray-600 truncate max-w-[200px]" title={description}>{description}</td>
                                                    <td className="border px-2 py-1 text-center">{unit}</td>
                                                    <td className="border px-2 py-1 text-center">{(step11Item.qtyPerSqf ?? 0).toFixed(3)}</td>
                                                    <td className="border px-2 py-1 text-center text-blue-600">{(step11Item.requiredQty ?? step11Item.qty ?? 0).toFixed(2)}</td>
                                                    <td className="border px-2 py-1 text-center font-bold">{step11Item.roundOff}</td>
                                              <td className="border px-2 py-1 text-right">₹{step11Item.rateSqft.toLocaleString()}</td>
                                              <td className="border px-2 py-1 text-right font-bold bg-green-50/30">₹{step11Item.amount.toLocaleString()}</td>
                                              <td className="border px-2 py-1 text-center">
                                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => {
                                                  if (!confirm("Delete this item?")) return;
                                                  void handleDeleteRow(boqItem.id, tableData, itemIdx);
                                                }}>×</Button>
                                              </td>
                                            </tr>
                                          );
                                        }

                                        return (
                                          <tr key={itemKey} className="border-b border-gray-100 hover:bg-blue-50/50">
                                            <td className="border px-2 py-1 text-center text-xs">{itemIdx + 1}</td>
                                            <td className="border px-2 py-1 font-medium text-xs">{step11Item.title || "Item"}</td>
                                            <td className="border px-2 py-1 text-gray-500">-</td>
                                            <td className="border px-2 py-1">
                                              <textarea
                                                value={description}
                                                onChange={(e) => updateEditedField(itemKey, "description", e.target.value)}
                                                disabled={isVersionSubmitted}
                                                className="w-full border rounded px-1 py-0.5 text-xs min-h-[60px] resize-y focus:ring-1 ring-blue-500 outline-none"
                                                placeholder="Description"
                                              />
                                            </td>
                                            <td className="border px-2 py-1">
                                              <input
                                                type="text"
                                                value={unit}
                                                onChange={(e) => updateEditedField(itemKey, "unit", e.target.value)}
                                                disabled={isVersionSubmitted}
                                                className="w-full border rounded px-1 py-0.5 text-xs text-center focus:ring-1 ring-blue-500 outline-none"
                                              />
                                            </td>
                                            <td className="border px-2 py-1 text-center">
                                              <input
                                                type="number"
                                                value={qtyPerSqf}
                                                onChange={(e) => updateEditedField(itemKey, "qtyPerSqf", parseFloat(e.target.value) || 0)}
                                                disabled={isVersionSubmitted}
                                                className="w-full border rounded px-1 py-0.5 text-xs text-center font-medium focus:ring-1 ring-blue-500 outline-none"
                                              />
                                            </td>
                                            <td className="border px-2 py-1 text-center">
                                              <input
                                                type="number"
                                                value={qty}
                                                onChange={(e) => updateEditedField(itemKey, "qty", parseFloat(e.target.value) || 0)}
                                                disabled={isVersionSubmitted}
                                                className="w-full border rounded px-1 py-0.5 text-xs text-center font-medium focus:ring-1 ring-blue-500 outline-none"
                                              />
                                            </td>
                                            <td className="border px-2 py-1 font-bold text-center">
                                              <input
                                                type="number"
                                                value={getEditedValue(itemKey, "roundOff", step11Item.roundOff || 0)}
                                                onChange={(e) => updateEditedField(itemKey, "roundOff", parseFloat(e.target.value) || 0)}
                                                disabled={isVersionSubmitted}
                                                className="w-full border rounded px-1 py-0.5 text-xs text-center font-medium focus:ring-1 ring-blue-500 outline-none"
                                              />
                                            </td>
                                            <td className="border px-1 py-1">
                                              <div className="flex flex-col gap-1">
                                                <input
                                                  type="number"
                                                  value={supplyRate}
                                                  onChange={(e) => updateEditedField(itemKey, "supply_rate", parseFloat(e.target.value) || 0)}
                                                  disabled={isVersionSubmitted}
                                                  className="w-full border rounded px-1 py-0.5 text-xs text-right focus:ring-1 ring-blue-500 outline-none"
                                                  placeholder="S"
                                                />
                                                <input
                                                  type="number"
                                                  value={installRate}
                                                  onChange={(e) => updateEditedField(itemKey, "install_rate", parseFloat(e.target.value) || 0)}
                                                  disabled={isVersionSubmitted}
                                                  className="w-full border rounded px-1 py-0.5 text-xs text-right focus:ring-1 ring-blue-500 outline-none"
                                                  placeholder="I"
                                                />
                                              </div>
                                            </td>
                                            <td className="border px-1 py-1 text-right text-xs bg-gray-50/50 font-bold">
                                              ₹{(supplyAmount + installAmount).toFixed(2)}
                                            </td>
                                            <td className="border px-2 py-1 text-center">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                disabled={isVersionSubmitted}
                                                onClick={async () => {
                                                  if (!confirm("Delete this item?")) return;
                                                  const newItems = [...step11Items];
                                                  newItems.splice(itemIdx, 1);
                                                  const newTableData = { ...tableData, step11_items: newItems };
                                                  setBoqItems(prev => prev.map(i => i.id === boqItem.id ? { ...i, table_data: newTableData } : i));
                                                  try {
                                                    await apiFetch(`/api/boq-items/${boqItem.id}`, {
                                                      method: "PUT",
                                                      headers: { "Content-Type": "application/json" },
                                                      body: JSON.stringify({ table_data: newTableData })
                                                    });
                                                      } catch (e) {
                                                    console.error("Failed to delete item", e);
                                                    toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
                                                  }
                                                }}
                                              >
                                                ×
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
                                        ₹{displayLines.reduce((sum: number, item: any) => sum + (item.amount || ((item.qty || 0) * ((item.supply_rate || 0) + (item.install_rate || 0)))), 0).toLocaleString()}
                                      </td>
                                      <td className="border px-2 py-1.5"></td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                              {isEngineBased && (
                                <div className="bg-gray-50 px-4 py-2 flex justify-end border-t border-gray-200">
                                  <div className="flex items-center gap-4">
                                    <span className="text-xs font-bold text-gray-500 uppercase">Rate per {tableData.configBasis?.requiredUnitType || "Unit"}:</span>
                                    <span className="text-sm font-extrabold text-blue-700 border-b-2 border-blue-600">
                                      ₹{(displayLines.reduce((sum: number, item: any) => sum + item.amount, 0) / (tableData.targetRequiredQty || 1)).toFixed(2)}
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

                {
                  boqItems.length > 0 && (
                    <div className="mt-6 flex justify-end">
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 w-72 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Total Supply:</span>
                          <span className="font-medium">
                            ₹
                            {boqItems
                              .reduce((sum: number, boqItem: any) => {
                                let td = boqItem.table_data || {};
                                if (typeof td === 'string') try { td = JSON.parse(td); } catch (e) { td = {}; }

                                if (td.materialLines && td.targetRequiredQty !== undefined) {
                                  const result = computeBoq(td.configBasis, td.materialLines, td.targetRequiredQty);
                                  return sum + result.totalSupply;
                                }

                                const items = td.step11_items || [];
                                return sum + items.reduce((s: number, val: any) => s + ((val.qty || 0) * (val.supply_rate || 0)), 0);
                              }, 0)
                              .toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Total Install:</span>
                          <span className="font-medium">
                            ₹
                            {boqItems
                              .reduce((sum: number, boqItem: any) => {
                                let td = boqItem.table_data || {};
                                if (typeof td === 'string') try { td = JSON.parse(td); } catch (e) { td = {}; }

                                if (td.materialLines && td.targetRequiredQty !== undefined) {
                                  const result = computeBoq(td.configBasis, td.materialLines, td.targetRequiredQty);
                                  return sum + result.totalInstall;
                                }

                                const items = td.step11_items || [];
                                return sum + items.reduce((s: number, val: any) => s + ((val.qty || 0) * (val.install_rate || 0)), 0);
                              }, 0)
                              .toFixed(2)}
                          </span>
                        </div>
                        <div className="border-t border-gray-300 my-2 pt-2 flex justify-between font-bold text-base">
                          <span>Grand Total:</span>
                          <span>
                            ₹
                            {boqItems
                              .reduce((sum: number, boqItem: any) => {
                                let td = boqItem.table_data || {};
                                if (typeof td === 'string') try { td = JSON.parse(td); } catch (e) { td = {}; }

                                if (td.materialLines && td.targetRequiredQty !== undefined) {
                                  const result = computeBoq(td.configBasis, td.materialLines, td.targetRequiredQty);
                                  return sum + result.grandTotal;
                                }

                                const items = td.step11_items || [];
                                return sum + items.reduce((s: number, val: any) => s + ((val.qty || 0) * ((val.supply_rate || 0) + (val.install_rate || 0))), 0);
                              }, 0)
                              .toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                }
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          {
            selectedProjectId && selectedVersionId && (
              <Card>
                <CardContent className="space-y-3 pt-6">
                  {isVersionSubmitted ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-800">
                      <strong>This version is locked.</strong> Submit a new version
                      to make edits.
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Button
                      onClick={handleSaveProject}
                      variant="outline"
                      disabled={isVersionSubmitted || Object.keys(editedFields).length === 0}
                    >
                      Save Draft
                    </Button>
                    <Button
                      onClick={handleSubmitVersion}
                      variant="default"
                      disabled={isVersionSubmitted || boqItems.length === 0}
                    >
                      Submit & Lock Version
                    </Button>
                    <Button
                      onClick={handleDownloadExcel}
                      variant="outline"
                      disabled={boqItems.length === 0}
                    >
                      Download as Excel
                    </Button>
                    <Button
                      onClick={handleDownloadPdf}
                      variant="outline"
                      disabled={boqItems.length === 0}
                    >
                      Download as PDF
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
