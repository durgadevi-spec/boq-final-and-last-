import React, { useEffect, useState, useRef } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from 'xlsx';
// import VersionHistory from "@/components/VersionHistory"; // Not found
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import { computeBoq, UnitType } from "@/lib/boqCalc";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Trash2, Copy, GripVertical, GripHorizontal, Eye, EyeOff, Edit2, ChevronDown, Briefcase, MapPin, IndianRupee, Lock, Edit3, Plus } from "lucide-react";

/** Helper to generate Excel-style column names (A, B, C... Z, AA, AB...) */
const getExcelColumnName = (n: number) => {
  let name = "";
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
};

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
  tax_code_type?: string;
  tax_code_value?: string;
  hsn_code?: string;
  sac_code?: string;
};

type BOQTemplate = {
  id: string;
  name: string;
  config: any;
  created_at: string;
  updated_at: string;
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

type DraggableHeaderColProps = {
  col: any;
  idx: number;
  isVersionSubmitted: boolean;
  allCols: any[];
  getExcelColumnName: (n: number) => string;
  handleGlobalCalculation: any;
  globalColSettings: any;
  handleHideColumn: any;
  boqItems: any[];
  customColumns: any;
  customColumnValues: any;
  saveItemLayout: any;
  toast: any;
  setCustomColumns: any;
  setCustomColumnValues: any;
};

const DraggableHeaderCol = ({
  col,
  idx,
  isVersionSubmitted,
  allCols,
  getExcelColumnName,
  handleGlobalCalculation,
  globalColSettings,
  handleHideColumn,
  boqItems,
  customColumns,
  customColumnValues,
  saveItemLayout,
  toast,
  setCustomColumns,
  setCustomColumnValues,
  setGlobalColSettings
}: DraggableHeaderColProps & { setGlobalColSettings: any }) => {
  const controls = useDragControls();

  const handleRenameColumn = async () => {
    const oldName = col.name;
    const newName = window.prompt(`Enter new name for column "${oldName}":`, oldName);
    if (!newName || newName === oldName) return;

    // Check for duplicates
    if (allCols.some(c => c.name === newName)) {
      toast({ title: "Error", description: "Column name already exists", variant: "destructive" });
      return;
    }

    const updates = boqItems.map(item => {
      const itemCols = [...(customColumns[item.id] || [])];
      const colIdx = itemCols.findIndex(c => c.name === oldName);
      if (colIdx === -1) return Promise.resolve();

      // Update column definition
      itemCols[colIdx] = { ...itemCols[colIdx], name: newName };

      // Update values
      const itemValues = { ...(customColumnValues[item.id] || {}) };
      Object.keys(itemValues).forEach(r => {
        const ri = parseInt(r);
        const rowVals = { ...(itemValues[ri] || {}) };
        if (rowVals[oldName] !== undefined) {
          rowVals[newName] = rowVals[oldName];
          delete rowVals[oldName];
        }
        itemValues[ri] = rowVals;
      });

      setCustomColumns((prev: any) => ({ ...prev, [item.id]: itemCols }));
      setCustomColumnValues((prev: any) => ({ ...prev, [item.id]: itemValues }));

      // Also update global settings if any
      if (globalColSettings[oldName]) {
        setGlobalColSettings((prev: any) => {
          const next = { ...prev };
          next[newName] = next[oldName];
          delete next[oldName];
          return next;
        });
      }

      return saveItemLayout(item.id, itemCols, itemValues);
    });

    await Promise.all(updates);
    toast({ title: "Column Renamed", description: `"${oldName}" is now "${newName}"` });
  };

  return (
    <Reorder.Item
      key={col.name}
      value={col}
      as="th"
      dragListener={false}
      dragControls={controls}
      className={`border-r border-sky-300 px-2 py-2 text-left min-w-[130px] group relative ${col.isTotal ? "text-green-900 bg-emerald-100" : "text-slate-900 bg-sky-100"}`}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-1 overflow-hidden">
          <div className="flex items-center gap-1.5 overflow-hidden">
            {!isVersionSubmitted && (
              <GripHorizontal
                size={12}
                className="text-slate-400 cursor-grab active:cursor-grabbing flex-shrink-0"
                onPointerDown={(e) => controls.start(e)}
              />
            )}
            <span className="truncate font-black text-[11px] uppercase tracking-normal text-slate-800">{col.name}</span>
          </div>
          {!isVersionSubmitted && (
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={async () => {
                  if (!confirm(`Clone "${col.name}"?`)) return;
                  const newColName = `${col.name} (Copy)`;
                  const updates = boqItems.map(item => {
                    const itemCols = customColumns[item.id] || [];
                    const nextCols = [...itemCols, { ...col, name: newColName }];
                    const itemValues = { ...(customColumnValues[item.id] || {}) };
                    Object.keys(itemValues).forEach(r => {
                      const ri = parseInt(r);
                      const rowVals = { ...(itemValues[ri] || {}) };
                      if (rowVals[col.name] !== undefined) rowVals[newColName] = rowVals[col.name];
                      itemValues[ri] = rowVals;
                    });
                    setCustomColumns((prev: any) => ({ ...prev, [item.id]: nextCols }));
                    setCustomColumnValues((prev: any) => ({ ...prev, [item.id]: itemValues }));
                    return saveItemLayout(item.id, nextCols, itemValues);
                  });
                  await Promise.all(updates);
                }}
                className="text-gray-400 hover:text-blue-500"
              ><Copy size={10} /></button>
              <button
                onClick={handleRenameColumn}
                className="text-gray-400 hover:text-green-500"
                title="Rename Column"
              >
                <Edit2 size={10} />
              </button>
              <button onClick={() => handleHideColumn(col.name, true)} className="text-gray-400 hover:text-orange-500"><EyeOff size={10} /></button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete "${col.name}"?`)) return;
                  const updates = boqItems.map(item => {
                    const nextCols = (customColumns[item.id] || []).filter((c: any) => c.name !== col.name);
                    const itemValues = { ...(customColumnValues[item.id] || {}) };
                    Object.keys(itemValues).forEach(r => {
                      const ri = parseInt(r);
                      const rowVals = { ...itemValues[ri] };
                      delete rowVals[col.name];
                      itemValues[ri] = rowVals;
                    });
                    setCustomColumns((prev: any) => ({ ...prev, [item.id]: nextCols }));
                    setCustomColumnValues((prev: any) => ({ ...prev, [item.id]: itemValues }));
                    return saveItemLayout(item.id, nextCols, itemValues);
                  });
                  await Promise.all(updates);
                }}
                className="text-gray-400 hover:text-red-500"
              ><Trash2 size={10} /></button>
            </div>
          )}
        </div>

        {(col as any).isPercentage && !isVersionSubmitted && (
          <div className="mt-0.5 pt-0.5 border-t border-purple-200/40 flex flex-col gap-0.5">
            <div className="flex items-center gap-1 overflow-hidden h-4">
              <span className="text-[6px] font-bold text-gray-400 shrink-0">B:</span>
              <select
                className="bg-white/60 text-[8px] font-bold text-purple-700 uppercase px-0.5 py-0 rounded border border-purple-200/50 outline-none h-3.5 w-full truncate"
                value={globalColSettings[col.name]?.baseSource || "manual"}
                onChange={(e) => handleGlobalCalculation(col.name, globalColSettings[col.name]?.baseValue || 0, globalColSettings[col.name]?.percentageValue || 0, e.target.value, globalColSettings[col.name]?.operator || "%", globalColSettings[col.name]?.multiplierSource || "manual")}
              >
                <option value="manual">Fixed</option>
                <option value="Rate / Unit">G: Rate</option>
                <option value="Unit">H: Unit</option>
                <option value="Qty">I: Qty</option>
                <option value="Total Value (₹)">J: Total</option>
                <option value="Override Rate">K: O.Rate</option>
                <option value="Override Total">L: O.Total</option>
                {allCols.filter(c => c.name !== col.name).map((c) => {
                  const ci = allCols.findIndex(cc => cc.name === c.name);
                  return <option key={c.name} value={c.name}>{getExcelColumnName(ci + 12)}: {c.name.substring(0, 8)}</option>;
                })}
              </select>
              <select
                className="bg-white/60 text-[8px] font-bold text-purple-700 px-0.5 rounded border border-purple-200/50 outline-none h-3.5"
                value={globalColSettings[col.name]?.operator || "%"}
                onChange={(e) => handleGlobalCalculation(col.name, globalColSettings[col.name]?.baseValue || 0, globalColSettings[col.name]?.percentageValue || 0, globalColSettings[col.name]?.baseSource || "manual", e.target.value, globalColSettings[col.name]?.multiplierSource || "manual")}
              >
                <option value="%">%</option><option value="*">×</option><option value="/">÷</option><option value="+">+</option>
              </select>
            </div>
            <div className="flex items-center gap-1 overflow-hidden h-4">
              <select
                className="bg-white/60 text-[8px] font-bold text-purple-700 uppercase px-0.5 rounded border border-purple-200/50 outline-none h-3.5 w-full truncate"
                value={globalColSettings[col.name]?.multiplierSource || "manual"}
                onChange={(e) => handleGlobalCalculation(col.name, globalColSettings[col.name]?.baseValue || 0, globalColSettings[col.name]?.percentageValue || 0, globalColSettings[col.name]?.baseSource || "manual", globalColSettings[col.name]?.operator || "%", e.target.value)}
              >
                <option value="manual">Val</option>
                <option value="Rate / Unit">G: Rate</option>
                <option value="Unit">H: Unit</option>
                <option value="Qty">I: Qty</option>
                <option value="Total Value (₹)">J: Total</option>
                <option value="Override Rate">K: O.Rate</option>
                <option value="Override Total">L: O.Total</option>
                {allCols.filter(c => c.name !== col.name).map((c) => {
                  const ci = allCols.findIndex(cc => cc.name === c.name);
                  return <option key={c.name} value={c.name}>{getExcelColumnName(ci + 12)}: {c.name.substring(0, 8)}</option>;
                })}
              </select>
              {(!globalColSettings[col.name]?.multiplierSource || globalColSettings[col.name]?.multiplierSource === "manual") ? (
                <div className="relative flex items-center shrink-0">
                  <input
                    type="number"
                    className="w-8 bg-white text-[8px] font-bold text-gray-700 px-0.5 rounded border border-purple-200 h-3.5 text-right"
                    value={globalColSettings[col.name]?.percentageValue || 0}
                    onChange={(e) => handleGlobalCalculation(col.name, globalColSettings[col.name]?.baseValue || 0, parseFloat(e.target.value) || 0, globalColSettings[col.name]?.baseSource || "manual", globalColSettings[col.name]?.operator || "%", "manual")}
                  />
                </div>
              ) : <div className="w-8 bg-gray-100 rounded border border-gray-200 h-3.5 shrink-0" />}

            </div>
          </div>
        )}
      </div>
    </Reorder.Item>
  );
};

export default function FinalizeBoq() {
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
  const [showFinalizedPicker, setShowFinalizedPicker] = useState(false);
  const [finalizedItems, setFinalizedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const dragControls = useDragControls();
  const [templates, setTemplates] = useState<BOQTemplate[]>([]);
  const [isSaveTemplateDialogOpen, setIsSaveTemplateDialogOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Per-product custom columns: { [boqItemId]: { name: string, isTotal: boolean, hideColumn?: boolean, hideTotal?: boolean, isPercentage?: boolean, percentageValue?: number, baseValue?: number, baseSource?: string }[] }
  const [customColumns, setCustomColumns] = useState<{ [id: string]: any[] }>({});
  // Per-product custom column cell values: { [boqItemId]: { [rowIdx]: { [colName]: string } } }
  const [customColumnValues, setCustomColumnValues] = useState<{ [id: string]: { [rowIdx: number]: { [col: string]: string } } }>({});
  // Selected product IDs for bulk delete
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  // Manual description per boqItem
  const [productDescriptions, setProductDescriptions] = useState<{ [id: string]: string }>({});
  // Which product is currently being saved
  const [savingLayoutId, setSavingLayoutId] = useState<string | null>(null);
  const [showColumnTotals, setShowColumnTotals] = useState(true);
  const [hideSystemTotalFooter, setHideSystemTotalFooter] = useState(false);
  // Manual quantity per boqItem: { [id: string]: string }
  const [productQuantities, setProductQuantities] = useState<{ [id: string]: string }>({});
  // Manual unit per boqItem: { [id: string]: string }
  const [productUnits, setProductUnits] = useState<{ [id: string]: string }>({});
  // Manual override rate per boqItem: { [id: string]: string }
  const [overrideRates, setOverrideRates] = useState<{ [id: string]: string }>({});
  // Track which column is selected for Grand Total display
  const [grandTotalColumn, setGrandTotalColumn] = useState<string>("Total Value (₹)");
  // Global Terms and Conditions
  const [termsAndConditions, setTermsAndConditions] = useState<string>("");

  // Decoupled Global Header State for custom columns
  const [globalColSettings, setGlobalColSettings] = useState<{ [colName: string]: any }>({});

  // Excel Export State
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedExportCols, setSelectedExportCols] = useState<string[]>([]);

  const handleToggleColumnTotalVisibility = async (colName: string, hide: boolean) => {
    const updates = boqItems.map(item => {
      const nextCols = (customColumns[item.id] || []).map(c =>
        c.name === colName ? { ...c, hideTotal: hide } : c
      );
      setCustomColumns(prev => ({ ...prev, [item.id]: nextCols }));
      return saveItemLayout(item.id, nextCols);
    });
    await Promise.all(updates);
    toast({ title: hide ? "Total Hidden" : "Total Shown", description: `Column total for "${colName}" updated.` });
  };

  const handleSetGrandTotalColumn = async (colName: string) => {
    setGrandTotalColumn(colName);
    // Persist to all items in version
    const updates = boqItems.map(item => {
      let td = item.table_data || {};
      if (typeof td === "string") try { td = JSON.parse(td); } catch { td = {}; }
      const updatedTd = { ...td, finalize_grand_total_column: colName };
      return apiFetch(`/api/boq-items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_data: updatedTd }),
      });
    });
    await Promise.all(updates);
    toast({ title: "Grand Total Updated", description: `Source changed to "${colName}"` });
  };

  const handleUpdateTermsAndConditions = async (val: string) => {
    setTermsAndConditions(val);
    try {
      await apiFetch("/api/global-settings/terms_and_conditions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: val }),
      });
    } catch (err) {
      console.error("Failed to update terms and conditions:", err);
    }
  };

  const handleHideColumn = async (colName: string, hide: boolean) => {
    const updates = boqItems.map(item => {
      const nextCols = (customColumns[item.id] || []).map(c =>
        c.name === colName ? { ...c, hideColumn: hide } : c
      );
      setCustomColumns(prev => ({ ...prev, [item.id]: nextCols }));
      return saveItemLayout(item.id, nextCols);
    });
    await Promise.all(updates);
    toast({ title: hide ? "Column Hidden" : "Column Restored", description: `Column "${colName}" visibility updated.` });
  };

  const handleSetSystemTotalVisibility = async (visible: boolean) => {
    setHideSystemTotalFooter(!visible);
    // Persist this flag to all items in current version
    const updates = boqItems.map(item => {
      let td = item.table_data || {};
      if (typeof td === "string") try { td = JSON.parse(td); } catch { td = {}; }
      const updatedTd = { ...td, finalize_hide_system_total: !visible };
      return apiFetch(`/api/boq-items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_data: updatedTd }),
      });
    });
    await Promise.all(updates);
    toast({
      title: visible ? "System Total Restored" : "System Total Hidden",
      description: visible ? "Reference value is now visible." : "Reference value removed from footer."
    });
  };

  const allCols = React.useMemo(() => {
    const cols: { name: string, isTotal: boolean, isPercentage?: boolean, percentageValue?: number, baseValue?: number, baseSource?: string, multiplierSource?: string, operator?: string, hideTotal?: boolean, hideColumn?: boolean }[] = [];
    boqItems.forEach(item => {
      (customColumns[item.id] || []).forEach(col => {
        if (!cols.find(c => c.name === col.name)) cols.push(col);
      });
    });
    return cols.filter(c => !c.hideColumn);
  }, [boqItems, customColumns]);

  const hiddenCols = React.useMemo(() => {
    const hidden: string[] = [];
    boqItems.forEach(item => {
      (customColumns[item.id] || []).forEach(col => {
        if (col.hideColumn && !hidden.includes(col.name)) {
          hidden.push(col.name);
        }
      });
    });
    return hidden;
  }, [boqItems, customColumns]);

  const calculatedColumnTotals = React.useMemo(() => {
    let totals = allCols.map(() => 0);
    let totalValueSum = 0;
    let totalRateSum = 0;
    let totalQtySum = 0;
    let overrideTotalSum = 0;

    boqItems.forEach(item => {
      let td = item.table_data || {};
      if (typeof td === "string") try { td = JSON.parse(td); } catch { td = {}; }

      let itemTotal = 0;
      let itemRate = 0;
      let itemQty = 0;

      if (td.materialLines && td.targetRequiredQty !== undefined) {
        const res = computeBoq(td.configBasis, td.materialLines, td.targetRequiredQty);
        const currentStep11Items = Array.isArray(td.step11_items) ? td.step11_items : [];
        const manualTotal = currentStep11Items.filter((it: any) => it.manual).reduce((s: number, it: any) =>
          s + (Number(it.qty) || 0) * (Number(it.supply_rate || 0) + Number(it.install_rate || 0)), 0);
        itemTotal = res.grandTotal + manualTotal;
        itemQty = td.targetRequiredQty;
        itemRate = itemQty > 0 ? itemTotal / itemQty : 0;
      } else {
        const currentStep11Items = Array.isArray(td.step11_items) ? td.step11_items : [];
        itemTotal = currentStep11Items.reduce((s: number, it: any) =>
          s + (it.qty || 0) * ((it.supply_rate || 0) + (it.install_rate || 0)), 0);
        itemQty = currentStep11Items[0]?.qty || 0;
        itemRate = itemQty > 0 ? itemTotal / itemQty : itemTotal;
      }

      const manualQtyStr = productQuantities[item.id];
      const displayQty = manualQtyStr !== undefined
        ? (parseFloat(manualQtyStr) || 0)
        : itemQty;

      const baseTotalValue = itemRate * displayQty;
      totalValueSum += baseTotalValue;
      totalRateSum += itemRate;

      const overrideRate = parseFloat(overrideRates[item.id] || "0") || 0;
      const overrideTotalVal = overrideRate * displayQty;
      overrideTotalSum += overrideTotalVal;

      let currentItemRunningTotal = baseTotalValue;
      let accumulator = 0;
      const rowCalculatedValues: { [colName: string]: number } = {};

      allCols.forEach((col, idx) => {
        const itemCol = (customColumns[item.id] || []).find(c => c.name === col.name) || col;

        if (col.isTotal) {
          currentItemRunningTotal += accumulator;
          accumulator = 0;
          rowCalculatedValues[col.name] = currentItemRunningTotal;
          totals[idx] += currentItemRunningTotal;
        } else {
          let val = 0;
          const baseSource = itemCol.baseSource;
          const operator = itemCol.operator || "%";
          const multiplierSource = itemCol.multiplierSource || "manual";
          const manualMultiplier = itemCol.percentageValue || 0;

          if (baseSource && baseSource !== "manual") {
            let baseVal = 0;
            if (baseSource === "Total Value (₹)") {
              baseVal = baseTotalValue;
            } else if (baseSource === "Rate / Unit") {
              baseVal = itemRate;
            } else if (baseSource === "Qty") {
              baseVal = displayQty;
            } else if (baseSource === "Override Rate") {
              baseVal = parseFloat(overrideRates[item.id] || "0") || 0;
            } else if (baseSource === "Override Total") {
              baseVal = (parseFloat(overrideRates[item.id] || "0") || 0) * displayQty;
            } else if (rowCalculatedValues[baseSource] !== undefined) {
              baseVal = rowCalculatedValues[baseSource];
            } else {
              const valStr = customColumnValues[item.id]?.[0]?.[baseSource] || "0";
              baseVal = parseFloat(valStr) || 0;
            }

            let multiplierVal = 0;
            if (multiplierSource === "manual") {
              multiplierVal = manualMultiplier;
            } else if (multiplierSource === "Total Value (₹)") {
              multiplierVal = baseTotalValue;
            } else if (multiplierSource === "Rate / Unit") {
              multiplierVal = itemRate;
            } else if (multiplierSource === "Qty") {
              multiplierVal = displayQty;
            } else if (multiplierSource === "Override Rate") {
              multiplierVal = parseFloat(overrideRates[item.id] || "0") || 0;
            } else if (multiplierSource === "Override Total") {
              multiplierVal = (parseFloat(overrideRates[item.id] || "0") || 0) * displayQty;
            } else if (rowCalculatedValues[multiplierSource] !== undefined) {
              multiplierVal = rowCalculatedValues[multiplierSource];
            } else {
              const mValStr = customColumnValues[item.id]?.[0]?.[multiplierSource] || "0";
              multiplierVal = parseFloat(mValStr) || 0;
            }

            if (operator === "%") {
              val = baseVal * (multiplierVal / 100);
            } else if (operator === "*") {
              val = baseVal * multiplierVal;
            } else if (operator === "/") {
              val = multiplierVal !== 0 ? baseVal / multiplierVal : 0;
            } else if (operator === "+") {
              val = baseVal + multiplierVal;
            }
          } else {
            // Manual entry column
            val = parseFloat(customColumnValues[item.id]?.[0]?.[col.name] || "0") || 0;
          }

          rowCalculatedValues[col.name] = val;
          accumulator += val;
          totals[idx] += val;
        }
      });
    });

    return { totals, totalValueSum, totalRateSum, totalQtySum, overrideTotalSum };
  }, [boqItems, allCols, customColumns, customColumnValues, productQuantities, overrideRates]);

  const handleColumnReorder = async (newOrder: typeof allCols) => {
    // Optimistically update local state for all items
    const nextColsMap: any = {};
    boqItems.forEach(item => {
      const itemCols = customColumns[item.id] || [];
      // align this item's columns to the new global sequence
      const sorted = newOrder
        .map(oc => itemCols.find(ic => ic.name === oc.name))
        .filter(Boolean);
      nextColsMap[item.id] = sorted;
    });

    setCustomColumns(prev => ({ ...prev, ...nextColsMap }));

    try {
      // Persist to each item in the version
      const updates = boqItems.map(item => saveItemLayout(item.id, nextColsMap[item.id]));
      await Promise.all(updates);
      toast({ title: "Order Saved", description: "Column sequence updated." });
    } catch (e) {
      console.error("Column sort failed:", e);
      toast({ title: "Error", description: "Failed to save column order", variant: "destructive" });
    }
  };

  const getItemTotal = (boqItem: BOMItem) => {
    let td = boqItem.table_data || {};
    if (typeof td === 'string') try { td = JSON.parse(td); } catch { td = {}; }
    let total = 0;
    if (td.materialLines && td.targetRequiredQty !== undefined) {
      total = computeBoq(td.configBasis, td.materialLines, td.targetRequiredQty).grandTotal;
    } else {
      const items = Array.isArray(td.step11_items) ? td.step11_items : [];
      total = items.reduce((s: number, it: any) =>
        s + (it.qty || 0) * ((it.supply_rate || 0) + (it.install_rate || 0)), 0);
    }
    return total;
  };

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

  const loadTemplates = React.useCallback(async () => {
    try {
      const resp = await apiFetch("/api/boq-templates");
      if (resp.ok) {
        const data = await resp.json();
        setTemplates(data.templates || []);
      }
    } catch (e) {
      console.error("Failed to load templates:", e);
    }
  }, []);

  // Load templates & global settings on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [, settingsResp] = await Promise.all([
          loadTemplates(),
          apiFetch("/api/global-settings")
        ]);

        if (settingsResp.ok) {
          const settings = await settingsResp.json();
          if (settings.terms_and_conditions) {
            setTermsAndConditions(settings.terms_and_conditions);
          }
        }
      } catch (err) {
        console.error("Failed to load initial data:", err);
      }
    };
    loadInitialData();
  }, [loadTemplates]);

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

  // Load BOM items for selected version
  useEffect(() => {
    if (!selectedVersionId) {
      setBoqItems([]);
      setEditedFields({});
      editedFieldsRef.current = {};
      return;
    }

    const loadBoqItemsAndEdits = async () => {
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

        // Load BOM items                    
        const response = await apiFetch(
          `/api/boq-items/version/${encodeURIComponent(selectedVersionId)}`,
          { headers: {} },
        );
        if (response.ok) {
          try {
            const data = await safeParseJson(response as unknown as Response);
            const items: BOMItem[] = data.items || [];
            setBoqItems(items);

            // --- Restore finalize layout from saved table_data ---
            const restoredCols: { [id: string]: { name: string, isTotal: boolean, hideTotal?: boolean }[] } = {};
            const restoredVals: { [id: string]: { [rowIdx: number]: { [col: string]: string } } } = {};
            const restoredDescs: { [id: string]: string } = {};
            const restoredQtys: { [id: string]: string } = {};
            const restoredUnits: { [id: string]: string } = {};
            const restoredOverrideRates: { [id: string]: string } = {};
            let sysTotalHidden = false;
            let restoredGrandTotalCol = "Total Value (₹)";

            for (const item of items) {
              let td = item.table_data || {};
              if (typeof td === "string") try { td = JSON.parse(td); } catch { td = {}; }

              if (td.finalize_hide_system_total) sysTotalHidden = true;
              if (td.finalize_grand_total_column) restoredGrandTotalCol = td.finalize_grand_total_column;

              if (Array.isArray(td.finalize_columns) && td.finalize_columns.length > 0) {
                // Backward compatibility: convert string arrays to objects
                restoredCols[item.id] = td.finalize_columns.map((c: any) =>
                  typeof c === "string" ? { name: c, isTotal: false, hideTotal: false } : c
                );
              }
              if (td.finalize_column_values && typeof td.finalize_column_values === "object") {
                restoredVals[item.id] = td.finalize_column_values;
              }
              if (typeof td.finalize_description === "string") {
                restoredDescs[item.id] = td.finalize_description;
              }
              if (td.finalize_qty !== undefined && td.finalize_qty !== null) {
                restoredQtys[item.id] = String(td.finalize_qty);
              }
              if (td.finalize_unit !== undefined && td.finalize_unit !== null) {
                restoredUnits[item.id] = String(td.finalize_unit);
              }
              if (td.finalize_override_rate !== undefined && td.finalize_override_rate !== null) {
                restoredOverrideRates[item.id] = String(td.finalize_override_rate);
              }
            }

            // Backfill HSN/SAC codes from products API for existing items
            try {
              const productsResp = await apiFetch("/api/products");
              if (productsResp.ok) {
                const productsData = await productsResp.json();
                const productsList: any[] = productsData.products || [];
                const productsById: { [id: string]: any } = {};
                productsList.forEach((p: any) => { productsById[p.id] = p; });

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
              console.warn("Failed to backfill HSN/SAC codes in FinalizeBoq:", e);
            }
            if (Object.keys(restoredCols).length > 0) {
              setCustomColumns(restoredCols);
              // Also initialize global settings from the first item that has custom columns
              const firstItemId = Object.keys(restoredCols)[0];
              if (firstItemId) {
                const initialGlobal: any = {};
                restoredCols[firstItemId].forEach((col: any) => {
                  initialGlobal[col.name] = {
                    baseValue: col.baseValue,
                    percentageValue: col.percentageValue,
                    baseSource: col.baseSource
                  };
                });
                setGlobalColSettings(initialGlobal);
              }
            }
            if (Object.keys(restoredVals).length > 0) setCustomColumnValues(restoredVals);
            if (Object.keys(restoredDescs).length > 0) setProductDescriptions(restoredDescs);
            if (Object.keys(restoredQtys).length > 0) setProductQuantities(restoredQtys);
            if (Object.keys(restoredUnits).length > 0) setProductUnits(restoredUnits);
            if (Object.keys(restoredOverrideRates).length > 0) setOverrideRates(restoredOverrideRates);
            setHideSystemTotalFooter(sysTotalHidden);
            setGrandTotalColumn(restoredGrandTotalCol);
          } catch (e) {
            toast({ title: "Error", description: "Failed to parse BOM items response", variant: "destructive" });
            console.error("BOM items parse error:", e);
          }
        } else {
          const body = await response.text();
          console.error("Failed to fetch BOM items:", response.status, body);
          toast({ title: "Error", description: `Failed to load BOM items (${response.status})`, variant: "destructive" });
        }
      } catch (err) {
        console.error("Failed to load BOM items:", err);
        toast({ title: "Error", description: "Failed to load BOM items", variant: "destructive" });
      }
    };

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

  const handleAddFinalized = async () => {
    if (!selectedProjectId) return;
    try {
      const response = await apiFetch("/api/boq-items/finalized", { headers: {} });
      if (response.ok) {
        const data = await response.json();
        setFinalizedItems(data.items || []);
        setShowFinalizedPicker(true);
      } else {
        toast({ title: "Error", description: "Failed to load finalized items", variant: "destructive" });
      }
    } catch (e) {
      console.error("Failed to load finalized items", e);
      toast({ title: "Error", description: "Failed to load finalized items", variant: "destructive" });
    }
  };

  const handleSelectFinalizedItem = async (originalItem: any) => {
    if (!selectedProjectId || !selectedVersionId) return;

    try {
      // Clone the item
      const tableData = typeof originalItem.table_data === 'string'
        ? JSON.parse(originalItem.table_data)
        : originalItem.table_data;

      const response = await apiFetch("/api/boq-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProjectId,
          version_id: selectedVersionId,
          estimator: originalItem.estimator,
          table_data: tableData, // Copy exact data including is_finalized flag
        }),
      });

      if (response.ok) {
        const newItem = await response.json();
        setBoqItems(prev => [...prev, newItem]);
        setShowFinalizedPicker(false);
        toast({ title: "Success", description: "Added finalized item" });
      } else {
        throw new Error("Failed to add item");
      }
    } catch (e) {
      console.error("Failed to add finalized item", e);
      toast({ title: "Error", description: "Failed to add item", variant: "destructive" });
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

  const saveItemLayout = async (boqItemId: string, updatedCols?: any[], updatedVals?: any, updatedDesc?: string, updatedQty?: string, updatedOverrideRate?: string, updatedUnit?: string) => {
    try {
      const boqItem = boqItems.find(i => i.id === boqItemId);
      if (!boqItem) return;

      let existingTd = boqItem.table_data || {};
      if (typeof existingTd === "string") {
        try { existingTd = JSON.parse(existingTd); } catch { existingTd = {}; }
      }

      const updatedTd = {
        ...existingTd,
        finalize_columns: updatedCols !== undefined ? updatedCols : (customColumns[boqItemId] || []),
        finalize_column_values: updatedVals !== undefined ? updatedVals : (customColumnValues[boqItemId] || {}),
        finalize_description: updatedDesc !== undefined ? updatedDesc : (productDescriptions[boqItemId] ?? ""),
        finalize_qty: updatedQty !== undefined ? updatedQty : (productQuantities[boqItemId] ?? null),
        finalize_unit: updatedUnit !== undefined ? updatedUnit : (productUnits[boqItemId] ?? null),
        finalize_override_rate: updatedOverrideRate !== undefined ? updatedOverrideRate : (overrideRates[boqItemId] ?? null),
        finalize_hide_system_total: hideSystemTotalFooter,
        finalize_grand_total_column: grandTotalColumn,
      };

      const resp = await apiFetch(`/api/boq-items/${boqItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_data: updatedTd }),
      });

      if (resp.ok) {
        setBoqItems(prev => prev.map(i =>
          i.id === boqItemId ? { ...i, table_data: updatedTd } : i
        ));
      } else {
        throw new Error("Save failed");
      }
    } catch (e) {
      console.error("Failed to save item layout:", e);
      toast({ title: "Error", description: "Failed to persist changes to database", variant: "destructive" });
    }
  };

  const handleDeleteColumn = async (boqItemId: string, colIdx: number) => {
    const colName = customColumns[boqItemId][colIdx].name;
    if (!confirm(`Are you sure you want to delete the column "${colName}"?`)) return;

    const nextCols = [...(customColumns[boqItemId] || [])];
    nextCols.splice(colIdx, 1);

    const itemValues = { ...(customColumnValues[boqItemId] || {}) };
    Object.keys(itemValues).forEach((rowIdxStr) => {
      const rowIdx = parseInt(rowIdxStr);
      const rowVals = { ...itemValues[rowIdx] };
      delete rowVals[colName];
      itemValues[rowIdx] = rowVals;
    });

    setCustomColumns((prev) => ({ ...prev, [boqItemId]: nextCols }));
    setCustomColumnValues((prev) => ({ ...prev, [boqItemId]: itemValues }));

    await saveItemLayout(boqItemId, nextCols, itemValues);
    toast({ title: "Column Deleted", description: `Column "${colName}" removed and saved.` });
  };

  const handleCloneColumn = async (boqItemId: string, colIdx: number) => {
    const originalCol = customColumns[boqItemId][colIdx];
    const newColName = `${originalCol.name} (Copy)`;

    const nextCols = [...(customColumns[boqItemId] || []), { ...originalCol, name: newColName }];

    const itemValues = { ...(customColumnValues[boqItemId] || {}) };
    Object.keys(itemValues).forEach((rowIdxStr) => {
      const rowIdx = parseInt(rowIdxStr);
      const rowVals = { ...(itemValues[rowIdx] || {}) };
      if (rowVals[originalCol.name] !== undefined) {
        rowVals[newColName] = rowVals[originalCol.name];
      }
      itemValues[rowIdx] = rowVals;
    });

    setCustomColumns((prev) => ({ ...prev, [boqItemId]: nextCols }));
    setCustomColumnValues((prev) => ({ ...prev, [boqItemId]: itemValues }));

    await saveItemLayout(boqItemId, nextCols, itemValues);
    toast({ title: "Column Cloned", description: `Column "${originalCol.name}" cloned to "${newColName}" and saved.` });
  };

  const handleGlobalCalculation = async (colName: string, base: number, multiplier: number, baseSource: string = "manual", operator: string = "%", multiplierSource: string = "manual") => {
    const oldSettings = globalColSettings[colName] || {};
    const oldMultiplier = oldSettings.percentageValue || 0;
    const deltaMultiplier = multiplier - oldMultiplier;

    // Update the decoupled global state immediately
    setGlobalColSettings(prev => ({
      ...prev,
      [colName]: { baseValue: base, percentageValue: multiplier, baseSource, operator, multiplierSource }
    }));

    const nextColsMap: any = {};
    const nextValsMap: any = {};

    boqItems.forEach(item => {
      let itemCols = customColumns[item.id] || [];
      const itemCol = itemCols.find(c => c.name === colName);

      const currentRowMultiplier = itemCol?.percentageValue || oldMultiplier;
      const newRowMultiplier = currentRowMultiplier + deltaMultiplier;

      // Ensure we have access to system values for resolution
      let itemTotal = 0;
      let itemQty = 0;
      let td = item.table_data || {};
      if (typeof td === "string") try { td = JSON.parse(td); } catch { td = {}; }
      const step11Items: Step11Item[] = Array.isArray(td.step11_items) ? td.step11_items : [];

      if (td.materialLines && td.targetRequiredQty !== undefined) {
        const res = computeBoq(td.configBasis, td.materialLines, td.targetRequiredQty);
        const manualTotal = step11Items.filter((it: any) => it.manual).reduce((s: number, it: any) =>
          s + (Number(it.qty) || 0) * (Number(it.supply_rate || 0) + Number(it.install_rate || 0)), 0);
        itemTotal = res.grandTotal + manualTotal;
        itemQty = td.targetRequiredQty;
      } else {
        itemTotal = step11Items.reduce((s: number, it: any) =>
          s + (it.qty || 0) * ((it.supply_rate || 0) + (it.install_rate || 0)), 0);
        itemQty = step11Items[0]?.qty || 0;
      }

      const manualQtyStr = productQuantities[item.id];
      const displayQty = manualQtyStr !== undefined ? (parseFloat(manualQtyStr) || 0) : itemQty;
      const itemRate = itemQty > 0 ? itemTotal / itemQty : (itemTotal || 0);

      let rowBase = base;
      if (baseSource === "Total Value (₹)") {
        rowBase = itemRate * displayQty;
      } else if (baseSource === "Rate / Unit") {
        rowBase = itemRate;
      } else if (baseSource === "Qty") {
        rowBase = displayQty;
      } else if (baseSource === "Override Rate") {
        rowBase = parseFloat(overrideRates[item.id] || "0") || 0;
      } else if (baseSource === "Override Total") {
        rowBase = (parseFloat(overrideRates[item.id] || "0") || 0) * displayQty;
      } else if (baseSource !== "manual") {
        const baseCol = itemCols.find(c => c.name === baseSource);
        if (baseCol?.isTotal) {
          let runningTotal = itemRate * displayQty;
          let accumulator = 0;
          for (const c of itemCols) {
            if (c.name === baseSource) {
              runningTotal += accumulator;
              break;
            }
            const val = parseFloat(customColumnValues[item.id]?.[0]?.[c.name] || "0") || 0;
            accumulator += val;
          }
          rowBase = runningTotal;
        } else {
          const valStr = customColumnValues[item.id]?.[0]?.[baseSource] || "0";
          rowBase = parseFloat(valStr) || 0;
        }
      }

      const updatedCols = itemCols.map(c =>
        c.name === colName ? { ...c, baseValue: base, percentageValue: newRowMultiplier, baseSource, operator, multiplierSource, isPercentage: (baseSource !== "manual") } : c
      );
      nextColsMap[item.id] = updatedCols;

      let rowMultiplierVal = 0;
      if (multiplierSource === "manual") {
        rowMultiplierVal = newRowMultiplier;
      } else if (multiplierSource === "Total Value (₹)") {
        rowMultiplierVal = itemRate * displayQty;
      } else if (multiplierSource === "Rate / Unit") {
        rowMultiplierVal = itemRate;
      } else if (multiplierSource === "Qty") {
        rowMultiplierVal = displayQty;
      } else if (multiplierSource === "Override Rate") {
        rowMultiplierVal = parseFloat(overrideRates[item.id] || "0") || 0;
      } else if (multiplierSource === "Override Total") {
        rowMultiplierVal = (parseFloat(overrideRates[item.id] || "0") || 0) * displayQty;
      } else {
        const mValStr = customColumnValues[item.id]?.[0]?.[multiplierSource] || "0";
        rowMultiplierVal = parseFloat(mValStr) || 0;
      }

      let calculated = 0;
      if (operator === "%") calculated = rowBase * (rowMultiplierVal / 100);
      else if (operator === "*") calculated = rowBase * rowMultiplierVal;
      else if (operator === "/") calculated = rowMultiplierVal !== 0 ? rowBase / rowMultiplierVal : 0;
      else if (operator === "+") calculated = rowBase + rowMultiplierVal;

      const itemVals = { ...(customColumnValues[item.id] || {}) };
      itemVals[0] = { ...(itemVals[0] || {}), [colName]: calculated.toFixed(2) };
      nextValsMap[item.id] = itemVals;
    });

    setCustomColumns(prev => ({ ...prev, ...nextColsMap }));
    setCustomColumnValues(prev => ({ ...prev, ...nextValsMap }));

    await Promise.all(boqItems.map(item =>
      saveItemLayout(item.id, nextColsMap[item.id], nextValsMap[item.id])
    ));
  };

  const handleItemCalculation = async (boqItemId: string, colName: string, multiplier: number, operator: string = "%", multiplierSource: string = "manual", baseSourceOverride?: string) => {
    const item = boqItems.find(i => i.id === boqItemId);
    if (!item) return;

    const itemCols = customColumns[item.id] || [];
    const itemCol = itemCols.find(c => c.name === colName);
    if (!itemCol) return;

    const baseSource = baseSourceOverride || itemCol.baseSource || "manual";
    let rowBase = 0;

    // Ensure system values available
    let itemTotal = 0;
    let itemQty = 0;
    let td = item.table_data || {};
    if (typeof td === "string") try { td = JSON.parse(td); } catch { td = {}; }
    const step11Items: Step11Item[] = Array.isArray(td.step11_items) ? td.step11_items : [];

    if (td.materialLines && td.targetRequiredQty !== undefined) {
      const res = computeBoq(td.configBasis, td.materialLines, td.targetRequiredQty);
      const manualTotal = step11Items.filter((it: any) => it.manual).reduce((s: number, it: any) =>
        s + (Number(it.qty) || 0) * (Number(it.supply_rate || 0) + Number(it.install_rate || 0)), 0);
      itemTotal = res.grandTotal + manualTotal;
      itemQty = td.targetRequiredQty;
    } else {
      itemTotal = step11Items.reduce((s: number, it: any) =>
        s + (it.qty || 0) * ((it.supply_rate || 0) + (it.install_rate || 0)), 0);
      itemQty = step11Items[0]?.qty || 0;
    }

    const manualQtyStr = productQuantities[item.id];
    const displayQty = manualQtyStr !== undefined ? (parseFloat(manualQtyStr) || 0) : itemQty;
    const itemRate = itemQty > 0 ? itemTotal / itemQty : (itemTotal || 0);

    if (baseSource === "Total Value (₹)") {
      rowBase = itemRate * displayQty;
    } else if (baseSource === "Rate / Unit") {
      rowBase = itemRate;
    } else if (baseSource === "Qty") {
      rowBase = displayQty;
    } else if (baseSource === "Override Rate") {
      rowBase = parseFloat(overrideRates[item.id] || "0") || 0;
    } else if (baseSource === "Override Total") {
      rowBase = (parseFloat(overrideRates[item.id] || "0") || 0) * displayQty;
    } else if (baseSource !== "manual") {
      const baseCol = itemCols.find(c => c.name === baseSource);
      if (baseCol?.isTotal) {
        let runningTotal = itemRate * displayQty;
        let accumulator = 0;
        for (const c of itemCols) {
          if (c.name === baseSource) {
            runningTotal += accumulator;
            break;
          }
          const val = parseFloat(customColumnValues[item.id]?.[0]?.[c.name] || "0") || 0;
          accumulator += val;
        }
        rowBase = runningTotal;
      } else {
        const valStr = customColumnValues[item.id]?.[0]?.[baseSource] || "0";
        rowBase = parseFloat(valStr) || 0;
      }
    }

    let rowMultiplierVal = 0;
    if (multiplierSource === "manual") {
      rowMultiplierVal = multiplier;
    } else if (multiplierSource === "Total Value (₹)") {
      rowMultiplierVal = itemRate * displayQty;
    } else if (multiplierSource === "Rate / Unit") {
      rowMultiplierVal = itemRate;
    } else if (multiplierSource === "Qty") {
      rowMultiplierVal = displayQty;
    } else if (multiplierSource === "Override Rate") {
      rowMultiplierVal = parseFloat(overrideRates[item.id] || "0") || 0;
    } else if (multiplierSource === "Override Total") {
      rowMultiplierVal = (parseFloat(overrideRates[item.id] || "0") || 0) * displayQty;
    } else {
      const mValStr = customColumnValues[item.id]?.[0]?.[multiplierSource] || "0";
      rowMultiplierVal = parseFloat(mValStr) || 0;
    }
    let calculated = 0;
    if (operator === "%") calculated = rowBase * (rowMultiplierVal / 100);
    else if (operator === "*") calculated = rowBase * rowMultiplierVal;
    else if (operator === "/") calculated = rowMultiplierVal !== 0 ? rowBase / rowMultiplierVal : 0;
    else if (operator === "+") calculated = rowBase + rowMultiplierVal;

    const nextCols = itemCols.map(c =>
      c.name === colName ? { ...c, percentageValue: multiplier, operator, multiplierSource, baseSource, isPercentage: (baseSource !== "manual") } : c
    );

    const itemVals = { ...(customColumnValues[item.id] || {}) };
    itemVals[0] = { ...(itemVals[0] || {}), [colName]: calculated.toFixed(2) };

    setCustomColumns(prev => ({ ...prev, [item.id]: nextCols }));
    setCustomColumnValues(prev => ({ ...prev, [item.id]: itemVals }));

    await saveItemLayout(item.id, nextCols, itemVals);
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
    console.log("[FinalizeBoq] handleSaveProject START. editedFields (ref snapshot):", JSON.stringify(editedFieldsRef.current));

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

      console.log("[FinalizeBoq] Save API response status:", response.status);

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
                if (step11_items[idx]) {
                  step11_items[idx] = { ...step11_items[idx], ...fields };
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
              console.warn("[FinalizeBoq] Failed to reload BOM items after save; keeping optimistic local state");
            }
          } catch (loadErr) {
            console.error("[FinalizeBoq] Failed to reload BOM items after save:", loadErr);
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
        description: "Failed to save BOM version",
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
        description: "BOM version submitted and locked",
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

  const handleSaveAsTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast({ title: "Error", description: "Template name is required", variant: "destructive" });
      return;
    }

    const firstItemId = boqItems[0]?.id;
    if (!firstItemId) {
      toast({ title: "Error", description: "No items to capture configuration from", variant: "destructive" });
      return;
    }

    const config = {
      columns: customColumns[firstItemId] || [],
      globalColSettings: globalColSettings,
    };

    try {
      const resp = await apiFetch("/api/boq-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTemplateName, config }),
      });

      if (resp.ok) {
        toast({ title: "Success", description: "Template saved successfully" });
        setIsSaveTemplateDialogOpen(false);
        setNewTemplateName("");
        loadTemplates();
      } else {
        throw new Error("Save failed");
      }
    } catch (e) {
      console.error("Save template error:", e);
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!templateId) return;
    const templateToDelete = templates.find((t) => t.id === templateId);
    if (!templateToDelete) return;

    if (!confirm(`Are you sure you want to delete the template "${templateToDelete.name}"?`)) {
      return;
    }

    try {
      const resp = await apiFetch(`/api/boq-templates/${templateId}`, {
        method: "DELETE",
      });

      if (resp.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== templateId));
        if (selectedTemplateId === templateId) {
          setSelectedTemplateId("");
        }
        toast({
          title: "Template Deleted",
          description: `Template "${templateToDelete.name}" has been removed.`,
        });
      } else {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete template");
      }
    } catch (error: any) {
      console.error("Failed to delete template:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  const handleApplyTemplate = async (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    if (!confirm(`Apply template "${template.name}"? This will overwrite existing column configurations and formulas for ALL products.`)) {
      return;
    }

    try {
      const config = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
      const { columns, globalColSettings: newGlobalSettings } = config;

      if (newGlobalSettings) setGlobalColSettings(newGlobalSettings);

      const updates = boqItems.map(item => {
        setCustomColumns(prev => ({ ...prev, [item.id]: columns }));
        return saveItemLayout(item.id, columns);
      });

      await Promise.all(updates);
      toast({ title: "Template Applied", description: `Applied "${template.name}" configuration to all products.` });
      setSelectedTemplateId("");
    } catch (e) {
      console.error("Apply template error:", e);
      toast({ title: "Error", description: "Failed to apply template", variant: "destructive" });
    }
  };

  const handleDownloadExcel = () => {
    if (!selectedProjectId || boqItems.length === 0) {
      toast({ title: "Info", description: "No BOM items to download", variant: "default" });
      return;
    }

    // Identify ALL potential columns first to populate selection list in correct visual order
    const potentialCols = [
      "S.No",
      "Product / Material",
      "Description / Location",
      "HSN",
      "SAC",
      "Rate / Unit",
      "Unit",
      "Qty",
      "Total Value (₹)",
      "Override Rate",
      "Override Total",
      ...allCols.map(c => c.name)
    ];

    setSelectedExportCols(potentialCols);
    setIsExportDialogOpen(true);
  };

  const performExcelExport = () => {
    try {
      if (selectedExportCols.length === 0) {
        toast({ title: "Warning", description: "Please select at least one column" });
        return;
      }

      // Preparation of data for sheet-level accuracy
      const sheetData: any[] = [];

      // Add project info at the top if needed, or just headers
      // Map headers - simple column names only
      const headers = selectedExportCols.map(colName => colName);
      sheetData.push(headers);

      boqItems.forEach((boqItem, boqIdx) => {
        let tableData = boqItem.table_data || {};
        if (typeof tableData === "string") try { tableData = JSON.parse(tableData); } catch { tableData = {}; }

        const currentStep11Items: Step11Item[] = Array.isArray(tableData.step11_items) ? tableData.step11_items : [];
        const derivedProductName = tableData.product_name || boqItem.estimator || "—";
        const productName = (derivedProductName === "Manual Product" || derivedProductName === "Manual" || boqItem.estimator === "manual_product" || boqItem.estimator === "Manual")
          ? (currentStep11Items[0]?.title || currentStep11Items[0]?.description || derivedProductName)
          : derivedProductName;
        const category = tableData.category || "";

        const manualQtyStr = productQuantities[boqItem.id];
        const displayQty = manualQtyStr !== undefined
          ? (parseFloat(manualQtyStr) || 0)
          : (tableData.materialLines && tableData.targetRequiredQty !== undefined
            ? tableData.targetRequiredQty
            : (currentStep11Items[0]?.qty || 0));

        let totalVal = 0;
        let rateSqft = 0;
        if (tableData.materialLines && tableData.targetRequiredQty !== undefined) {
          const res = computeBoq(tableData.configBasis, tableData.materialLines, tableData.targetRequiredQty);
          const manualTotal = currentStep11Items.filter((it: any) => it.manual).reduce((s: number, it: any) =>
            s + (Number(it.qty) || 0) * (Number(it.supply_rate || 0) + Number(it.install_rate || 0)), 0);
          totalVal = res.grandTotal + manualTotal;
          rateSqft = tableData.targetRequiredQty > 0 ? totalVal / tableData.targetRequiredQty : 0;
        } else {
          totalVal = currentStep11Items.reduce((s: number, it: any) =>
            s + (it.qty || 0) * ((it.supply_rate || 0) + (it.install_rate || 0)), 0);
          rateSqft = (currentStep11Items[0]?.qty ?? 0) > 0 ? totalVal / (currentStep11Items[0]?.qty || 1) : totalVal;
        }

        // Adjust for manual qty
        totalVal = rateSqft * displayQty;

        const manualDesc = productDescriptions[boqItem.id] ?? (
          tableData.subcategory || currentStep11Items[0]?.description || category || ""
        );

        const rowValues: { [colName: string]: any } = {};
        const rowCalculatedValues: { [colName: string]: number } = {};
        let currentRunningTotal = totalVal;
        let accumulator = 0;

        // 1. Calculate ALL potential columns in visual order to respect dependencies
        const allPotentialColsInOrder = [
          "S.No",
          "Product / Material",
          "Description / Location",
          "HSN",
          "SAC",
          "Rate / Unit",
          "Unit",
          "Qty",
          "Total Value (₹)",
          "Override Rate",
          "Override Total",
          ...allCols.map(c => c.name)
        ];

        allPotentialColsInOrder.forEach(colName => {
          if (colName === "S.No") rowValues[colName] = boqIdx + 1;
          else if (colName === "Product / Material") rowValues[colName] = productName;
          else if (colName === "Description / Location") rowValues[colName] = manualDesc;
          else if (colName === "HSN") rowValues[colName] = tableData.hsn_code || (tableData.hsn_sac_type === 'hsn' ? tableData.hsn_sac_code : "") || "—";
          else if (colName === "SAC") rowValues[colName] = tableData.sac_code || (tableData.hsn_sac_type === 'sac' ? tableData.hsn_sac_code : "") || "—";
          else if (colName === "Rate / Unit") rowValues[colName] = Number(rateSqft.toFixed(2));
          else if (colName === "Unit") rowValues[colName] = currentStep11Items[0]?.unit || tableData.unit || "";
          else if (colName === "Qty") rowValues[colName] = Number(displayQty.toFixed(2));
          else if (colName === "Total Value (₹)") rowValues[colName] = Number(totalVal.toFixed(2));
          else if (colName === "Override Rate") rowValues[colName] = Number((parseFloat(overrideRates[boqItem.id] || "0") || 0).toFixed(2));
          else if (colName === "Override Total") rowValues[colName] = Number(((parseFloat(overrideRates[boqItem.id] || "0") || 0) * displayQty).toFixed(2));
          else {
            const currentCol = allCols.find(c => c.name === colName);
            if (!currentCol) {
              rowValues[colName] = 0;
              return;
            }

            if (currentCol.isTotal) {
              currentRunningTotal += accumulator;
              accumulator = 0;
              rowCalculatedValues[colName] = currentRunningTotal;
              rowValues[colName] = Number(currentRunningTotal.toFixed(2));
            } else {
              const itemColList = customColumns[boqItem.id] || [];
              const itemCol = itemColList.find((c: any) => c.name === colName) || currentCol;
              const baseSource = (itemCol as any).baseSource;
              const isCalculated = baseSource && baseSource !== "manual";
              let valNum = 0;

              if (isCalculated) {
                const multiplierSource = (itemCol as any).multiplierSource || "manual";
                const manualMultiplier = (itemCol as any).percentageValue || 0;
                const operator = (itemCol as any).operator || "%";

                let baseVal = 0;
                if (baseSource === "Total Value (₹)") baseVal = totalVal;
                else if (baseSource === "Rate / Unit") baseVal = rateSqft;
                else if (baseSource === "Qty") baseVal = displayQty;
                else if (baseSource === "Override Rate") baseVal = parseFloat(overrideRates[boqItem.id] || "0") || 0;
                else if (baseSource === "Override Total") baseVal = (parseFloat(overrideRates[boqItem.id] || "0") || 0) * displayQty;
                else if (rowCalculatedValues[baseSource] !== undefined) baseVal = rowCalculatedValues[baseSource];
                else baseVal = parseFloat(customColumnValues[boqItem.id]?.[0]?.[baseSource] || "0") || 0;

                let multiplierVal = 0;
                if (multiplierSource === "manual") multiplierVal = manualMultiplier;
                else if (multiplierSource === "Total Value (₹)") multiplierVal = totalVal;
                else if (multiplierSource === "Rate / Unit") multiplierVal = rateSqft;
                else if (multiplierSource === "Qty") multiplierVal = displayQty;
                else if (multiplierSource === "Override Rate") multiplierVal = parseFloat(overrideRates[boqItem.id] || "0") || 0;
                else if (multiplierSource === "Override Total") multiplierVal = (parseFloat(overrideRates[boqItem.id] || "0") || 0) * displayQty;
                else if (rowCalculatedValues[multiplierSource] !== undefined) multiplierVal = rowCalculatedValues[multiplierSource];
                else multiplierVal = parseFloat(customColumnValues[boqItem.id]?.[0]?.[multiplierSource] || "0") || 0;

                if (operator === "%") valNum = baseVal * (multiplierVal / 100);
                else if (operator === "*") valNum = baseVal * multiplierVal;
                else if (operator === "/") valNum = multiplierVal !== 0 ? baseVal / multiplierVal : 0;
                else if (operator === "+") valNum = baseVal + multiplierVal;
              } else {
                valNum = parseFloat(customColumnValues[boqItem.id]?.[0]?.[colName] || "0") || 0;
              }

              rowCalculatedValues[colName] = valNum;
              accumulator += valNum;
              rowValues[colName] = Number(valNum.toFixed(2));
            }
          }
        });

        // 2. Build the row based ONLY on selectedExportCols
        const row: any[] = [];
        selectedExportCols.forEach(colName => {
          row.push(rowValues[colName] ?? "");
        });
        sheetData.push(row);
      });

      // Add Grand Totals footer row if columns are numeric
      const footerRow: any[] = Array(selectedExportCols.length).fill("");
      selectedExportCols.forEach((colName, idx) => {
        if (colName === "Product / Material") footerRow[idx] = "GRAND TOTAL";
        else if (colName === "Total Value (₹)") {
          footerRow[idx] = hideSystemTotalFooter ? "" : Number(calculatedColumnTotals.totalValueSum.toFixed(2));
        } else if (colName === "Rate / Unit") {
          footerRow[idx] = Number(calculatedColumnTotals.totalRateSum.toFixed(2));
        } else if (colName === "Override Total") {
          footerRow[idx] = Number(calculatedColumnTotals.overrideTotalSum.toFixed(2));
        } else if (colName === "Qty" || colName === "Description / Location" || colName === "HSN" || colName === "SAC" || colName === "Unit" || colName === "Override Rate") {
          footerRow[idx] = "";
        } else if (allCols.some(c => c.name === colName)) {
          const colIdx = allCols.findIndex(c => c.name === colName);
          const col = allCols[colIdx];
          footerRow[idx] = col.hideTotal ? "" : Number(calculatedColumnTotals.totals[colIdx].toFixed(2));
        }
      });
      sheetData.push(footerRow);
      
      // Add Terms and Conditions at the bottom
      if (termsAndConditions && termsAndConditions.trim()) {
        sheetData.push([]); // Spacer
        sheetData.push([]); // Spacer
        
        const termsHeaderRow = Array(selectedExportCols.length).fill("");
        termsHeaderRow[0] = "Terms & Conditions:";
        sheetData.push(termsHeaderRow);

        const lines = termsAndConditions.split("\n");
        lines.forEach(line => {
          const lineRow = Array(selectedExportCols.length).fill("");
          lineRow[0] = line.trim();
          sheetData.push(lineRow);
        });
      }

      // Simple Worksheet creation
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "BOQ");

      const filename = `${selectedProject?.name || "BOQ"}_Excel_Export.xlsx`;
      XLSX.writeFile(wb, filename);

      setIsExportDialogOpen(false);
      toast({ title: "Success", description: `Downloaded ${filename}` });
    } catch (error) {
      console.error("Excel download failed:", error);
      toast({ title: "Error", description: "Failed to download Excel", variant: "destructive" });
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedProjectId || boqItems.length === 0) {
      toast({ title: "Info", description: "No BOM items to download", variant: "default" });
      return;
    }

    try {
      // 1. Identify all custom columns
      const allCols: { name: string, isTotal: boolean }[] = [];
      boqItems.forEach(item => {
        (customColumns[item.id] || []).forEach(col => {
          if (!allCols.find(c => c.name === col.name)) allCols.push(col);
        });
      });

      // 2. Prepare Headers for PDF
      const headers = [
        "S.No",
        "Product / Material",
        "Description",
        "HSN",
        "SAC",
        "Rate (₹)",
        "Unit",
        "Qty",
        "Total (₹)",
        "Override Rate (₹)",
        "Override Total (₹)",
        ...allCols.map(c => c.name)
      ];

      // 3. Prepare Body Rows
      const body: any[] = [];
      let grandTotalValue = 0;

      boqItems.forEach((boqItem, boqIdx) => {
        let tableData = boqItem.table_data || {};
        if (typeof tableData === "string") try { tableData = JSON.parse(tableData); } catch { tableData = {}; }

        const currentStep11Items: Step11Item[] = Array.isArray(tableData.step11_items) ? tableData.step11_items : [];
        const derivedProductName = tableData.product_name || boqItem.estimator || "—";
        const productName = (derivedProductName === "Manual Product" || derivedProductName === "Manual" || boqItem.estimator === "manual_product" || boqItem.estimator === "Manual")
          ? (currentStep11Items[0]?.title || currentStep11Items[0]?.description || derivedProductName)
          : derivedProductName;
        const category = tableData.category || "";

        const manualQtyStr = productQuantities[boqItem.id];
        const displayQty = manualQtyStr !== undefined
          ? (parseFloat(manualQtyStr) || 0)
          : (tableData.materialLines && tableData.targetRequiredQty !== undefined
            ? tableData.targetRequiredQty
            : (currentStep11Items[0]?.qty || 0));

        // Totals
        let totalVal = 0;
        let rateSqft = 0;
        if (tableData.materialLines && tableData.targetRequiredQty !== undefined) {
          const res = computeBoq(tableData.configBasis, tableData.materialLines, tableData.targetRequiredQty);
          const manualTotal = currentStep11Items.filter((it: any) => it.manual).reduce((s: number, it: any) =>
            s + (Number(it.qty) || 0) * (Number(it.supply_rate || 0) + Number(it.install_rate || 0)), 0);
          totalVal = res.grandTotal + manualTotal;
          rateSqft = tableData.targetRequiredQty > 0 ? totalVal / tableData.targetRequiredQty : 0;
        } else {
          totalVal = currentStep11Items.reduce((s: number, it: any) =>
            s + (it.qty || 0) * ((it.supply_rate || 0) + (it.install_rate || 0)), 0);
          rateSqft = (currentStep11Items[0]?.qty ?? 0) > 0 ? totalVal / (currentStep11Items[0]?.qty || 1) : totalVal;
        }

        // Adjust for manual qty
        totalVal = rateSqft * displayQty;

        const manualDesc = productDescriptions[boqItem.id] ?? (
          tableData.subcategory || currentStep11Items[0]?.description || category || ""
        );

        grandTotalValue += totalVal;

        // Custom column values for this row
        const customVals: string[] = [];
        let runningTotal = totalVal;
        let accumulator = 0;
        const rowCalculatedValues: { [colName: string]: number } = {};

        allCols.forEach(col => {
          const itemCol = (customColumns[boqItem.id] || []).find(c => c.name === col.name) || col;
          if (col.isTotal) {
            runningTotal += accumulator;
            accumulator = 0;
            rowCalculatedValues[col.name] = runningTotal;
            customVals.push(runningTotal.toFixed(2));
          } else {
            let val = 0;
            const baseSource = (itemCol as any).baseSource;
            const operator = (itemCol as any).operator || "%";
            const multiplierSource = (itemCol as any).multiplierSource || "manual";
            const manualMultiplier = (itemCol as any).percentageValue || 0;

            if (baseSource && baseSource !== "manual") {
              let bVal = 0;
              if (baseSource === "Total Value (₹)") bVal = totalVal;
              else if (baseSource === "Rate / Unit") bVal = rateSqft;
              else if (baseSource === "Qty") bVal = displayQty;
              else if (baseSource === "Override Rate") bVal = parseFloat(overrideRates[boqItem.id] || "0") || 0;
              else if (baseSource === "Override Total") bVal = (parseFloat(overrideRates[boqItem.id] || "0") || 0) * displayQty;
              else if (rowCalculatedValues[baseSource] !== undefined) bVal = rowCalculatedValues[baseSource];
              else bVal = parseFloat(customColumnValues[boqItem.id]?.[0]?.[baseSource] || "0") || 0;

              let mVal = 0;
              if (multiplierSource === "manual") mVal = manualMultiplier;
              else if (multiplierSource === "Total Value (₹)") mVal = totalVal;
              else if (multiplierSource === "Rate / Unit") mVal = rateSqft;
              else if (multiplierSource === "Qty") mVal = displayQty;
              else if (multiplierSource === "Override Rate") mVal = parseFloat(overrideRates[boqItem.id] || "0") || 0;
              else if (multiplierSource === "Override Total") mVal = (parseFloat(overrideRates[boqItem.id] || "0") || 0) * displayQty;
              else if (rowCalculatedValues[multiplierSource] !== undefined) mVal = rowCalculatedValues[multiplierSource];
              else mVal = parseFloat(customColumnValues[boqItem.id]?.[0]?.[multiplierSource] || "0") || 0;

              if (operator === "%") val = bVal * (mVal / 100);
              else if (operator === "*") val = bVal * mVal;
              else if (operator === "/") val = mVal !== 0 ? bVal / mVal : 0;
              else if (operator === "+") val = bVal + mVal;
            } else {
              val = parseFloat(customColumnValues[boqItem.id]?.[0]?.[col.name] || "0") || 0;
            }
            rowCalculatedValues[col.name] = val;
            accumulator += val;
            customVals.push(val.toFixed(2));
          }
        });

        body.push([
          (boqIdx + 1).toString(),
          productName,
          manualDesc,
          tableData.hsn_code || (tableData.hsn_sac_type === 'hsn' ? tableData.hsn_sac_code : "") || "—",
          tableData.sac_code || (tableData.hsn_sac_type === 'sac' ? tableData.hsn_sac_code : "") || "—",
          rateSqft.toFixed(2),
          currentStep11Items[0]?.unit || tableData.unit || "",
          (productQuantities[boqItem.id] !== undefined ? parseFloat(productQuantities[boqItem.id]) || 0 : (tableData.materialLines && tableData.targetRequiredQty !== undefined ? tableData.targetRequiredQty : (currentStep11Items[0]?.qty || 0))).toFixed(2),
          totalVal.toFixed(2),
          (parseFloat(overrideRates[boqItem.id] || "0") || 0).toFixed(2),
          ((parseFloat(overrideRates[boqItem.id] || "0") || 0) * displayQty).toFixed(2),
          ...customVals
        ]);
      });

      // Add Grand Totals footer row to PDF body
      const footerRow = [
        "",
        "GRAND TOTAL",
        "",
        "",
        "",
        calculatedColumnTotals.totalRateSum.toFixed(2),
        "",
        "",
        hideSystemTotalFooter ? "" : calculatedColumnTotals.totalValueSum.toFixed(2),
        "",
        calculatedColumnTotals.overrideTotalSum.toFixed(2),
        ...allCols.map((col, idx) => col.hideTotal ? "" : calculatedColumnTotals.totals[idx].toFixed(2))
      ];
      body.push(footerRow);

      // 4. Logo Fetching
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
      } catch (e) {
        console.warn("Could not load logo for PDF header", e);
      }

      // 5. PDF Generation
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
      const projNameStr = selectedProject?.name || "BOM";
      doc.text(projNameStr, metaX, headerY + 6, { align: "right" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Client: ${selectedProject?.client || "-"}`, metaX, headerY + 12, { align: "right" });
      doc.text(`Budget: ${selectedProject?.budget || "-"}`, metaX, headerY + 18, { align: "right" });

      // @ts-ignore - autotable types
      autoTable(doc, {
        head: [headers],
        body: body,
        startY: headerY + 30,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [64, 64, 64], textColor: [255, 255, 255], fontStyle: "bold" },
        theme: "grid",
        foot: [[
          "",
          "GRAND TOTAL",
          "",
          "₹" + calculatedColumnTotals.totalRateSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          "",
          "₹" + grandTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ...allCols.map(c => {
            if (c.isTotal) {
              const colIdx = allCols.findIndex(cc => cc.name === c.name);
              const totalVal = calculatedColumnTotals.totals[colIdx] || 0;
              return "₹" + totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            return "";
          })
        ]],
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
      });

      const filename = `${projNameStr}_${selectedVersion ? `V${selectedVersion.version_number}` : "draft"}_BOM.pdf`;
      doc.save(filename);
      toast({ title: "Success", description: `Downloaded ${filename}` });
    } catch (err) {
      console.error("Failed to generate PDF", err);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
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
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Finalize BOM</h1>

        {/* Project creation moved to dedicated Create Project page */}

        {/* Header Controls Section */}
        <Card className="border-none shadow-sm bg-slate-50/50">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              {/* Project Select */}
              <div className="md:col-span-5 space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold ml-1">Project</Label>
                <Select onValueChange={(v) => setSelectedProjectId(v || null)} value={selectedProjectId || ""}>
                  <SelectTrigger className="bg-white border-slate-200">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem value={p.id} key={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Version Select */}
              {selectedProjectId && (
                <div className="md:col-span-4 space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold ml-1">BOM Version</Label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedVersionId || ""}
                      onValueChange={setSelectedVersionId}
                    >
                      <SelectTrigger className="bg-white border-slate-200">
                        <SelectValue placeholder="Select version" />
                      </SelectTrigger>
                      <SelectContent>
                        {versions.map((v) => (
                          <SelectItem value={v.id} key={v.id}>
                            V{v.version_number} ({v.status === "submitted" ? "Locked" : "Draft"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <div className="flex gap-1">
                      {selectedVersionId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          onClick={async () => {
                            if (!selectedVersionId) return;
                            if (!confirm("Delete this version?")) return;
                            try {
                              const resp = await apiFetch(`/api/boq-versions/${encodeURIComponent(selectedVersionId)}`, { method: "DELETE" });
                              if (resp.ok) {
                                const r2 = await apiFetch(`/api/boq-versions/${encodeURIComponent(selectedProjectId!)}`, { headers: {} });
                                if (r2.ok) {
                                  const data = await r2.json();
                                  setVersions(data.versions || []);
                                  const draftVersion = (data.versions || []).find((v: any) => v.status === "draft");
                                  if (draftVersion) setSelectedVersionId(draftVersion.id);
                                  else if ((data.versions || []).length > 0) setSelectedVersionId(data.versions[0].id);
                                  else setSelectedVersionId(null);
                                  setBoqItems([]);
                                  toast({ title: "Deleted", description: "Version removed" });
                                }
                              }
                            } catch (e) {
                              console.error(e);
                              toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 bg-white border-slate-200 hover:bg-slate-50"
                        onClick={() => {
                          const lastVersion = versions[0];
                          if (lastVersion && confirm(`Copy from V${lastVersion.version_number}?`)) handleCreateNewVersion(true);
                          else handleCreateNewVersion(false);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Template Select */}
              {selectedProjectId && (
                <div className="md:col-span-3 space-y-1.5">
                  <div className="flex justify-between items-center ml-1">
                    <Label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Template</Label>
                    <button
                      onClick={() => setIsSaveTemplateDialogOpen(true)}
                      className="text-[10px] text-blue-600 font-semibold hover:underline"
                    >
                      SAVE NEW
                    </button>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between bg-white border-slate-200 font-normal h-9 px-3"
                      >
                        <span className="truncate text-sm">
                          {selectedTemplateId
                            ? templates.find((t) => t.id === selectedTemplateId)?.name
                            : "Select template..."}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0" align="end">
                      <div className="max-h-[250px] overflow-y-auto">
                        {templates.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">No templates</div>
                        ) : (
                          <div className="p-1">
                            {templates.map((t) => (
                              <div
                                key={t.id}
                                className="flex items-center justify-between p-2 rounded hover:bg-slate-100 cursor-pointer group"
                                onClick={() => handleApplyTemplate(t.id)}
                              >
                                <span className="text-xs truncate">{t.name}</span>
                                <Trash2 
                                  className="h-3.3 w-3.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id); }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>

            {/* Compact Summary Bar */}
            {selectedVersion && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5 px-4 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 min-w-fit">
                  <div className="p-1.5 bg-blue-50 rounded text-blue-600"><Briefcase className="h-3.5 w-3.5" /></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] leading-none text-slate-400 font-bold uppercase tracking-tight">Client</span>
                    <span className="text-xs font-semibold text-slate-700">{selectedVersion.project_client || "—"}</span>
                  </div>
                </div>

                <div className="hidden md:block w-px h-6 bg-slate-100" />

                <div className="flex items-center gap-2 min-w-fit">
                  <div className="p-1.5 bg-indigo-50 rounded text-indigo-600"><MapPin className="h-3.5 w-3.5" /></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] leading-none text-slate-400 font-bold uppercase tracking-tight">Location</span>
                    <span className="text-xs font-semibold text-slate-700">{selectedVersion.project_location || "—"}</span>
                  </div>
                </div>

                <div className="hidden md:block w-px h-6 bg-slate-100" />

                <div className="flex items-center gap-2 min-w-fit">
                  <div className="p-1.5 bg-emerald-50 rounded text-emerald-600"><IndianRupee className="h-3.5 w-3.5" /></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] leading-none text-slate-400 font-bold uppercase tracking-tight">Budget</span>
                    <span className="text-xs font-semibold text-slate-700">{selectedProject?.budget || "—"}</span>
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-3">
                  {isVersionSubmitted ? (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold px-2 py-0 h-6">
                      <Lock className="h-2.5 w-2.5 mr-1" /> LOCKED
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold px-2 py-0 h-6">
                      <Edit3 className="h-2.5 w-2.5 mr-1" /> DRAFT
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Excel Export Dialog */}
        <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Columns for Excel Export</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              {[
                { label: "B: #", name: "S.No" },
                { label: "C: Product / Material", name: "Product / Material" },
                { label: "D: Description / Location", name: "Description / Location" },
                { label: "G: Rate / Unit", name: "Rate / Unit" },
                { label: "H: Unit", name: "Unit" },
                { label: "I: Qty", name: "Qty" },
                { label: "J: Total Value (₹)", name: "Total Value (₹)" },
                { label: "K: Override Rate (₹)", name: "Override Rate" },
                { label: "L: Override Total (₹)", name: "Override Total" },
                ...allCols.map((c, idx) => ({
                  label: `${getExcelColumnName(idx + 12)}: ${c.name}`,
                  name: c.name
                }))
              ].map(col => (
                <div key={col.name} className="flex items-center space-x-2">
                  <Checkbox
                    id={`col-${col.name}`}
                    checked={selectedExportCols.includes(col.name)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedExportCols(prev => {
                          const next = [...prev, col.name];
                          // maintain table order
                          const order = [
                            "S.No", "Product / Material", "Description / Location",
                            "Rate / Unit", "Unit", "Qty", "Total Value (₹)",
                            "Override Rate", "Override Total",
                            ...allCols.map(c => c.name)
                          ];
                          return order.filter(o => next.includes(o));
                        });
                      } else {
                        setSelectedExportCols(prev => prev.filter(c => c !== col.name));
                      }
                    }}
                  />
                  <label
                    htmlFor={`col-${col.name}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {col.label}
                  </label>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>Cancel</Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={performExcelExport}>Download Excel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* BOM Items Section — one card+table per product */}
        {selectedProjectId && (
          <div className="space-y-4">
            {/* Header + bulk actions */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">BOM Items</h2>
              {selectedProductIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isVersionSubmitted}
                  onClick={async () => {
                    if (!confirm(`Delete ${selectedProductIds.size} selected product(s)?`)) return;
                    try {
                      await Promise.all(
                        Array.from(selectedProductIds).map(id => apiFetch(`/api/boq-items/${id}`, { method: "DELETE" }))
                      );
                      setBoqItems(prev => prev.filter(i => !selectedProductIds.has(i.id)));
                      setSelectedProductIds(new Set());
                      toast({ title: "Deleted", description: `${selectedProductIds.size} product(s) removed` });
                    } catch {
                      toast({ title: "Error", description: "Failed to delete selected products", variant: "destructive" });
                    }
                  }}
                >
                  🗑 Delete Selected ({selectedProductIds.size})
                </Button>
              )}
            </div>

            {boqItems.length === 0 ? (
              <Card>
                <CardContent className="text-gray-500 text-center py-10">
                  No products found for this version. Go to Create BOM to add products.
                </CardContent>
              </Card>
            ) : (
              <Card className="border-2 border-gray-200 overflow-hidden shadow-sm">
                {!isVersionSubmitted && (
                  <div className="flex items-center gap-3 p-4 bg-gray-50/80 border-b overflow-x-auto whitespace-nowrap scrollbar-hide">
                    <span className="text-[12px] font-semibold uppercase tracking-widest text-gray-500 mr-2 flex-shrink-0">Unified BOM Actions:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-4 text-[12px] font-bold uppercase border-purple-300 text-purple-700 hover:bg-purple-100/80 hover:border-purple-400 transition-all shadow-sm"
                      onClick={async () => {
                        const colName = window.prompt("Enter new column name (adds to all products):");
                        if (!colName?.trim()) return;
                        const isPct = window.confirm("Do you want to calculate percentage for this column?");
                        const updates = boqItems.map(item => {
                          const nextCols = [...(customColumns[item.id] || []), {
                            name: colName.trim(),
                            isTotal: false,
                            isPercentage: isPct,
                            percentageValue: 0
                          }];
                          setCustomColumns(prev => ({ ...prev, [item.id]: nextCols }));
                          return saveItemLayout(item.id, nextCols);
                        });
                        await Promise.all(updates);
                        toast({ title: "Global Column Added", description: `"${colName}" added.` });
                      }}
                    >
                      + Add Global Column
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-4 text-[12px] font-bold uppercase border-blue-300 text-blue-700 hover:bg-blue-100/80 hover:border-blue-400 transition-all shadow-sm"
                      onClick={async () => {
                        const colName = window.prompt("Enter Global Total column name:");
                        if (!colName?.trim()) return;
                        const updates = boqItems.map(item => {
                          const nextCols = [...(customColumns[item.id] || []), { name: colName.trim(), isTotal: true }];
                          setCustomColumns(prev => ({ ...prev, [item.id]: nextCols }));
                          return saveItemLayout(item.id, nextCols);
                        });
                        await Promise.all(updates);
                        toast({ title: "Global Total Added", description: `"${colName}" added.` });
                      }}
                    >
                      + Add Global Total
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-9 px-4 text-[12px] font-bold uppercase transition-all shadow-sm ${showColumnTotals ? "border-orange-300 text-orange-700 hover:bg-orange-50" : "border-gray-300 text-gray-500 hover:bg-gray-100"}`}
                      onClick={() => setShowColumnTotals(!showColumnTotals)}
                    >
                      {showColumnTotals ? "Hide Totals Row" : "Show Totals Row"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-4 text-[12px] font-bold uppercase border-yellow-300 text-yellow-700 hover:bg-yellow-50 hover:border-yellow-400 transition-all shadow-sm"
                      onClick={async () => {
                        if (!confirm("Restoring all hidden totals and columns for all lines?")) return;
                        setHideSystemTotalFooter(false);
                        const updates = boqItems.map(item => {
                          const nextCols = (customColumns[item.id] || []).map(c => ({ ...c, hideTotal: false, hideColumn: false }));
                          setCustomColumns(prev => ({ ...prev, [item.id]: nextCols }));
                          return saveItemLayout(item.id, nextCols);
                        });
                        await Promise.all(updates);
                        toast({ title: "Visibility Restored", description: "All hidden columns and totals are now visible." });
                      }}
                    >
                      🔄 Reset All Visibility
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-4 text-[12px] font-bold uppercase border-green-300 text-green-700 hover:bg-green-100/80 hover:border-green-400 transition-all shadow-sm"
                      onClick={async () => {
                        const updates = boqItems.map(item => saveItemLayout(item.id));
                        await Promise.all(updates);
                        toast({ title: "✅ Saved All", description: "Manual descriptions and layouts saved." });
                      }}
                    >
                      💾 Save All Layouts
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-4 text-[12px] font-bold uppercase border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 transition-all shadow-sm"
                      disabled={selectedProductIds.size === 0}
                      onClick={async () => {
                        if (!confirm(`Delete ${selectedProductIds.size} selected products from this BOM?`)) return;
                        try {
                          const ids = Array.from(selectedProductIds);
                          await Promise.all(ids.map(id => apiFetch(`/api/boq-items/${id}`, { method: "DELETE" })));
                          setBoqItems(prev => prev.filter(item => !selectedProductIds.has(item.id)));
                          setSelectedProductIds(new Set());
                          toast({ title: "Deleted", description: `${ids.length} products removed successfully.` });
                        } catch {
                          toast({ title: "Error", description: "Failed to delete some products", variant: "destructive" });
                        }
                      }}
                    >
                      🗑 Delete Selected
                    </Button>
                  </div>
                )}

                {!isVersionSubmitted && hiddenCols.length > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-orange-50/50 border-b border-orange-100 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-orange-600 mr-2 flex-shrink-0">Hidden Columns:</span>
                    {hiddenCols.map(colName => (
                      <button
                        key={colName}
                        onClick={() => handleHideColumn(colName, false)}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-orange-200 rounded-full text-[11px] font-bold text-orange-700 hover:bg-orange-100 hover:border-orange-300 transition-all shadow-sm group"
                      >
                        <Eye size={12} className="text-orange-400 group-hover:text-orange-600" />
                        {colName}
                        <span className="text-[9px] opacity-70 ml-1">Restore</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="border-collapse text-sm min-w-full">
                    <thead>
                      {/* Excel-style Column Labels */}
                      <tr className="bg-sky-50 border-b border-sky-200 text-[11px] font-black text-sky-800 shadow-inner">
                        <th className="border-r border-sky-200 py-1.5 w-10 text-center">A</th>
                        <th className="border-r border-sky-200 py-1.5 w-12 text-center text-blue-700">B</th>
                        <th className="border-r border-sky-200 py-1.5 text-center w-64">C</th>
                        <th className="border-r border-sky-200 py-1.5 text-center w-72">D</th>
                        <th className="border-r border-sky-200 py-1.5 text-center w-24">E</th>
                        <th className="border-r border-sky-200 py-1.5 text-center w-24">F</th>
                        <th className="border-r border-sky-200 py-1.5 text-center w-32">G</th>
                        <th className="border-r border-sky-200 py-1.5 text-center w-24">H</th>
                        <th className="border-r border-sky-200 py-1.5 text-center w-28">I</th>
                        <th className="border-r border-sky-200 py-1.5 text-center text-green-800 w-32">J</th>
                        <th className="border-r border-sky-200 py-1.5 text-center text-blue-800 w-32">K</th>
                        <th className="border-r border-sky-200 py-1.5 text-center text-green-800 w-32">L</th>
                        {allCols.map((_, idx) => (
                          <th key={idx} className="border-r border-sky-200 py-1.5 text-center text-slate-900 text-[11px] font-black bg-sky-100/50">
                            {getExcelColumnName(idx + 12)}
                          </th>
                        ))}
                      </tr>
                      {/* Grouping Header Row */}
                      <tr className="bg-sky-100 text-slate-900 text-[13px] font-black uppercase tracking-widest border-b border-sky-200">
                        <th colSpan={10} className="py-2.5 border-r border-sky-200 bg-sky-200/40">Item Details</th>
                        <th colSpan={2} className="py-2.5 border-r border-sky-200 bg-blue-200 text-blue-900">OVERRIDE</th>
                        <th colSpan={allCols.length} className="py-2.5 bg-purple-200 text-purple-900">Custom Filters & Totals</th>
                      </tr>
                      <tr className="bg-sky-200 text-slate-900 border-b border-sky-300 text-[12px] font-black uppercase tracking-wider shadow-sm">
                        <th className="border-r border-sky-300 px-2 py-2.5 text-center w-10">
                          <GripVertical size={18} className="mx-auto text-sky-600" />
                        </th>
                        <th className="border-r border-sky-300 px-1 py-2.5 text-left min-w-[30px] w-12 text-[11px]">S.No</th>
                        <th className="border-r border-sky-300 px-3 py-2.5 text-left min-w-[250px] text-[11px]">Product / Material</th>
                        <th className="border-r border-sky-300 px-3 py-2.5 text-left min-w-[250px] text-[11px]">Description / Location</th>
                        <th className="border-r border-sky-300 px-1 py-2.5 text-center w-24 text-[11px]">HSN</th>
                        <th className="border-r border-sky-300 px-1 py-2.5 text-center w-24 text-[11px]">SAC</th>
                        <th className="border-r border-sky-300 px-1 py-2.5 text-right w-32 text-[11px]">Rate</th>
                        <th className="border-r border-sky-300 px-1 py-2.5 text-center w-24 text-[11px]">Unit</th>
                        <th className="border-r border-sky-300 px-1 py-2.5 text-center w-28 text-[11px]">Qty</th>
                        <th className="border-r border-sky-300 px-1 py-1.5 text-right w-32 text-emerald-900 bg-emerald-100/50 text-[11px]">System Total (J)</th>
                        <th className="border-r border-sky-300 px-1 py-1.5 text-right w-32 text-blue-900 bg-blue-100/50 text-[11px]">Rate (K)</th>
                        <th className="border-r border-sky-300 px-1 py-1.5 text-right w-32 text-emerald-900 bg-emerald-100/50 text-[11px]">Total (L)</th>
                        <Reorder.Group
                          axis="x"
                          values={allCols}
                          onReorder={handleColumnReorder}
                          as="div"
                          style={{ display: "contents" }}
                        >
                          {allCols.map((col, idx) => (
                            <DraggableHeaderCol
                              key={col.name}
                              col={col}
                              idx={idx}
                              isVersionSubmitted={isVersionSubmitted}
                              allCols={allCols}
                              getExcelColumnName={getExcelColumnName}
                              handleGlobalCalculation={handleGlobalCalculation}
                              globalColSettings={globalColSettings}
                              handleHideColumn={handleHideColumn}
                              boqItems={boqItems}
                              customColumns={customColumns}
                              customColumnValues={customColumnValues}
                              saveItemLayout={saveItemLayout}
                              toast={toast}
                              setCustomColumns={setCustomColumns}
                              setCustomColumnValues={setCustomColumnValues}
                              setGlobalColSettings={setGlobalColSettings}
                            />
                          ))}
                        </Reorder.Group>
                      </tr>
                    </thead>
                    <Reorder.Group
                      axis="y"
                      values={boqItems}
                      onReorder={async (newItems) => {
                        setBoqItems(newItems);
                        if (isVersionSubmitted) return;

                        try {
                          const resp = await apiFetch("/api/boq-items/reorder", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ itemIds: newItems.map((i) => i.id) }),
                          });

                          if (resp.ok) {
                            toast({
                              title: "Sequence Saved",
                              description: "BOM item order has been updated.",
                            });
                          } else {
                            throw new Error("Failed to save order");
                          }
                        } catch (e) {
                          console.error("Sort order sync failed:", e);
                          toast({
                            title: "Error",
                            description: "Failed to save row order",
                            variant: "destructive",
                          });
                        }
                      }}
                      as="tbody"
                    >
                      {boqItems.map((boqItem, boqIdx) => {
                        let tableData = boqItem.table_data || {};
                        if (typeof tableData === "string") {
                          try { tableData = JSON.parse(tableData); } catch { tableData = {}; }
                        }

                        const currentStep11Items: Step11Item[] = Array.isArray(tableData.step11_items) ? tableData.step11_items : [];
                        const derivedProductName = tableData.product_name || boqItem.estimator || "—";
                        const productName = (derivedProductName === "Manual Product" || derivedProductName === "Manual" || boqItem.estimator === "manual_product" || boqItem.estimator === "Manual")
                          ? (currentStep11Items[0]?.title || currentStep11Items[0]?.description || derivedProductName)
                          : derivedProductName;
                        const category = tableData.category || "";
                        const isSelected = selectedProductIds.has(boqItem.id);

                        // Compute totals
                        let total = 0;
                        let rateSqft = 0;
                        if (tableData.materialLines && tableData.targetRequiredQty !== undefined) {
                          const result = computeBoq(tableData.configBasis, tableData.materialLines, tableData.targetRequiredQty);
                          const manualTotal = currentStep11Items.filter((it: any) => it.manual).reduce((s: number, it: any) =>
                            s + (Number(it.qty) || 0) * (Number(it.supply_rate || 0) + Number(it.install_rate || 0)), 0);
                          total = result.grandTotal + manualTotal;
                          rateSqft = tableData.targetRequiredQty > 0 ? total / tableData.targetRequiredQty : 0;
                        } else {
                          total = currentStep11Items.reduce((s: number, it: any) =>
                            s + (it.qty || 0) * ((it.supply_rate || 0) + (it.install_rate || 0)), 0);
                          rateSqft = (currentStep11Items[0]?.qty ?? 0) > 0 ? total / (currentStep11Items[0]?.qty || 1) : total;
                        }

                        const manualDesc = productDescriptions[boqItem.id] ?? (
                          tableData.subcategory || currentStep11Items[0]?.description || category || ""
                        );

                        return (
                          <Reorder.Item
                            key={boqItem.id}
                            value={boqItem}
                            as="tr"
                            dragListener={false}
                            dragControls={dragControls}
                            className={`hover:bg-blue-50/40 cursor-default transition-colors border-b border-gray-100 ${isSelected ? "bg-blue-50/60" : "bg-white"}`}
                          >
                            <td className="border-r px-2 py-1.5 text-center bg-gray-50/50 align-middle">
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-[10px] font-bold text-gray-500">{boqIdx + 1}</span>
                                <div
                                  onPointerDown={(e) => dragControls.start(e)}
                                  className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-blue-400 transition-colors flex items-center justify-center"
                                >
                                  <GripVertical size={14} className="mx-auto" />
                                </div>
                              </div>
                            </td>
                            <td className="border-r px-2 py-1.5 text-center align-middle">
                              <div className="flex flex-col items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={isVersionSubmitted}
                                  onChange={e => {
                                    setSelectedProductIds(prev => {
                                      const next = new Set(prev);
                                      e.target.checked ? next.add(boqItem.id) : next.delete(boqItem.id);
                                      return next;
                                    });
                                  }}
                                  className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                                />
                              </div>
                            </td>
                            <td className="border-r px-1.5 py-1 font-medium text-gray-800 text-[10px] align-middle">
                              <div className="flex flex-col gap-0.5">
                                <div className="font-bold leading-tight line-clamp-2">{productName}</div>
                                {category && <div className="text-[8px] text-blue-500 font-extrabold uppercase tracking-tighter">{category}</div>}
                              </div>
                            </td>
                            <td className="border-r px-1.5 py-1 align-middle">
                              <textarea
                                value={manualDesc || tableData.finalize_description || ""}
                                disabled={isVersionSubmitted}
                                onChange={e => setProductDescriptions(prev => ({ ...prev, [boqItem.id]: e.target.value }))}
                                onBlur={() => saveItemLayout(boqItem.id, undefined, undefined, productDescriptions[boqItem.id])}
                                rows={2}
                                className="w-full border-none rounded p-1 text-[10px] focus:ring-1 ring-blue-300 outline-none bg-transparent resize-y min-h-[35px] leading-tight"
                                placeholder="Description..."
                              />
                            </td>
                            <td className="border-r px-2 py-1 text-center font-semibold text-gray-700 text-[10px] align-middle bg-gray-50/30">
                              {tableData.hsn_code || (tableData.hsn_sac_type === 'hsn' ? tableData.hsn_sac_code : "") || "—"}
                            </td>
                            <td className="border-r px-2 py-1 text-center font-semibold text-gray-700 text-[10px] align-middle bg-gray-50/30">
                              {tableData.sac_code || (tableData.hsn_sac_type === 'sac' ? tableData.hsn_sac_code : "") || "—"}
                            </td>
                            <td className="border-r px-2 py-1.5 text-right font-semibold text-gray-500 text-[10px] align-middle">
                              ₹{rateSqft.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="border-r px-2 py-1 text-center font-medium text-gray-800 align-middle w-24 min-w-[80px]">
                              <input
                                type="text"
                                value={productUnits[boqItem.id] ?? (currentStep11Items[0]?.unit || tableData.unit || "")}
                                disabled={isVersionSubmitted}
                                onChange={e => setProductUnits(prev => ({ ...prev, [boqItem.id]: e.target.value }))}
                                onBlur={() => saveItemLayout(boqItem.id, undefined, undefined, undefined, undefined, undefined, productUnits[boqItem.id])}
                                className="w-full border-none rounded p-0.5 text-[10px] focus:ring-1 ring-blue-300 outline-none bg-transparent text-center font-semibold h-7"
                                placeholder="Unit"
                              />
                            </td>
                            <td className="border-r px-2 py-1 text-center font-semibold text-gray-800 align-middle w-32 min-w-[100px]">
                              <input
                                type="number"
                                value={productQuantities[boqItem.id] ?? (tableData.materialLines && tableData.targetRequiredQty !== undefined ? tableData.targetRequiredQty : (currentStep11Items[0]?.qty || 0))}
                                disabled={isVersionSubmitted}
                                onChange={e => setProductQuantities(prev => ({ ...prev, [boqItem.id]: e.target.value }))}
                                onBlur={() => saveItemLayout(boqItem.id, undefined, undefined, undefined, productQuantities[boqItem.id])}
                                className="w-full border-none rounded p-0.5 text-[10px] focus:ring-1 ring-blue-300 outline-none bg-blue-100/50 text-center font-semibold h-7"
                                placeholder="Qty"
                              />
                            </td>
                            <td className="border-r px-2 py-1.5 text-right font-semibold text-green-700 bg-green-50/20 align-middle text-[10px] w-32">
                              ₹{(rateSqft * (productQuantities[boqItem.id] !== undefined ? parseFloat(productQuantities[boqItem.id]) || 0 : (tableData.materialLines && tableData.targetRequiredQty !== undefined ? Number(tableData.targetRequiredQty) : Number(currentStep11Items[0]?.qty || 0)))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="border-r px-2 py-1 text-center font-semibold text-gray-800 align-middle w-32 min-w-[100px]">
                              <input
                                type="number"
                                value={overrideRates[boqItem.id] ?? ""}
                                disabled={isVersionSubmitted}
                                onChange={e => setOverrideRates(prev => ({ ...prev, [boqItem.id]: e.target.value }))}
                                onBlur={() => saveItemLayout(boqItem.id, undefined, undefined, undefined, undefined, overrideRates[boqItem.id])}
                                className="w-full border-none rounded p-0.5 text-[10px] focus:ring-1 ring-blue-300 outline-none bg-blue-50/50 text-right font-semibold h-7 px-2"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="border-r px-2 py-1.5 text-right font-semibold text-green-800 bg-green-50/40 align-middle text-[10px] w-32">
                              ₹{((parseFloat(overrideRates[boqItem.id] || "0") || 0) * (productQuantities[boqItem.id] !== undefined ? parseFloat(productQuantities[boqItem.id]) || 0 : (tableData.materialLines && tableData.targetRequiredQty !== undefined ? Number(tableData.targetRequiredQty) : Number(currentStep11Items[0]?.qty || 0)))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            {/* Custom columns */}
                            {(() => {
                              const manualQtyStr = productQuantities[boqItem.id];
                              const displayQty = manualQtyStr !== undefined ? (parseFloat(manualQtyStr) || 0) : (tableData.targetRequiredQty || currentStep11Items[0]?.qty || 0);
                              const baseTotalValue = rateSqft * displayQty;

                              let itemTotal = baseTotalValue;
                              let accumulator = 0;
                              const rowCalculatedValues: { [colName: string]: number } = {};

                              return allCols.map((col, idx) => {
                                if (col.isTotal) {
                                  itemTotal += accumulator;
                                  accumulator = 0;
                                  rowCalculatedValues[col.name] = itemTotal;
                                  return (
                                    <td key={`${col.name}-${idx}`} className="border-r px-2 py-1.5 text-right font-semibold text-green-900 bg-green-100/40 text-[10px]">
                                      ₹{itemTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  );
                                } else {
                                  const itemColList = customColumns[boqItem.id] || [];
                                  const itemCol = itemColList.find((c: any) => c.name === col.name) || col;
                                  const baseSource = (itemCol as any).baseSource;
                                  const isCalculated = baseSource && baseSource !== "manual";
                                  let valNum = 0;
                                  const multiplierSource = (itemCol as any).multiplierSource || "manual";
                                  const manualMultiplier = (itemCol as any).percentageValue || 0;
                                  const operator = (itemCol as any).operator || "%";
                                  let multiplierVal = 0;

                                  if (isCalculated) {
                                    let baseVal = 0;
                                    if (baseSource === "Total Value (₹)") {
                                      baseVal = baseTotalValue;
                                    } else if (baseSource === "Rate / Unit") {
                                      baseVal = rateSqft;
                                    } else if (baseSource === "Unit") {
                                      baseVal = 0; // Units aren't numeric
                                    } else if (baseSource === "Qty") {
                                      baseVal = displayQty;
                                    } else if (baseSource === "Override Rate") {
                                      baseVal = parseFloat(overrideRates[boqItem.id] || "0") || 0;
                                    } else if (baseSource === "Override Total") {
                                      baseVal = (parseFloat(overrideRates[boqItem.id] || "0") || 0) * displayQty;
                                    } else if (rowCalculatedValues[baseSource] !== undefined) {
                                      baseVal = rowCalculatedValues[baseSource];
                                    } else {
                                      const baseValStr = customColumnValues[boqItem.id]?.[0]?.[baseSource] || "0";
                                      baseVal = parseFloat(baseValStr) || 0;
                                    }

                                    if (multiplierSource === "manual") {
                                      multiplierVal = manualMultiplier;
                                    } else if (multiplierSource === "Total Value (₹)") {
                                      multiplierVal = baseTotalValue;
                                    } else if (multiplierSource === "Rate / Unit") {
                                      multiplierVal = rateSqft;
                                    } else if (multiplierSource === "Qty") {
                                      multiplierVal = displayQty;
                                    } else if (multiplierSource === "Override Rate") {
                                      multiplierVal = parseFloat(overrideRates[boqItem.id] || "0") || 0;
                                    } else if (multiplierSource === "Override Total") {
                                      multiplierVal = (parseFloat(overrideRates[boqItem.id] || "0") || 0) * displayQty;
                                    } else if (rowCalculatedValues[multiplierSource] !== undefined) {
                                      multiplierVal = rowCalculatedValues[multiplierSource];
                                    } else {
                                      const mValStr = customColumnValues[boqItem.id]?.[0]?.[multiplierSource] || "0";
                                      multiplierVal = parseFloat(mValStr) || 0;
                                    }

                                    if (operator === "%") valNum = baseVal * (multiplierVal / 100);
                                    else if (operator === "*") valNum = baseVal * multiplierVal;
                                    else if (operator === "/") valNum = multiplierVal !== 0 ? baseVal / multiplierVal : 0;
                                    else if (operator === "+") valNum = baseVal + multiplierVal;
                                  } else {
                                    valNum = parseFloat(customColumnValues[boqItem.id]?.[0]?.[col.name] || "0") || 0;
                                  }

                                  rowCalculatedValues[col.name] = valNum;
                                  accumulator += valNum;
                                  const displayVal = isCalculated ? valNum.toFixed(2) : (customColumnValues[boqItem.id]?.[0]?.[col.name] || "");
                                  const itemMultiplier = (itemCol as any).percentageValue || 0;
                                  const itemOp = (itemCol as any).operator || "%";

                                  return (
                                    <td key={`${col.name}-${idx}`} className="border-r px-2 py-1 bg-purple-50/10 relative group/cell align-middle text-[11px] min-w-[180px]">
                                      <div className="flex flex-col h-full min-h-[45px] justify-between">
                                        {isCalculated && (
                                          <div className="absolute left-1 top-1 z-20 pointer-events-none group-hover/cell:pointer-events-auto focus-within:pointer-events-auto">
                                            <div className="flex items-center gap-1 opacity-0 group-hover/cell:opacity-100 focus-within:opacity-100 transition-opacity bg-white/95 p-1 rounded-md shadow-md border border-purple-200">
                                              <select
                                                className="bg-white border border-purple-300 rounded text-[10px] font-semibold text-purple-700 outline-none h-6 px-1 cursor-pointer"
                                                value={(itemCol as any).multiplierSource || "manual"}
                                                disabled={isVersionSubmitted}
                                                onChange={(e) => {
                                                  handleItemCalculation(boqItem.id, col.name, itemMultiplier, itemOp, e.target.value);
                                                }}
                                              >
                                                <option value="manual">Val</option>
                                                <option value="Rate / Unit">G: Rate</option>
                                                <option value="Unit">H: Unit</option>
                                                <option value="Qty">I: Qty</option>
                                                <option value="Total Value (₹)">J: Total</option>
                                                <option value="Override Rate">K: O.Rate</option>
                                                <option value="Override Total">L: O.Total</option>
                                                {allCols.filter(c => c.name !== col.name).map((c) => {
                                                  const ci = allCols.findIndex(cc => cc.name === c.name);
                                                  return (
                                                    <option key={c.name} value={c.name}>
                                                      {getExcelColumnName(ci + 12)}: {c.name.substring(0, 8)}
                                                    </option>
                                                  );
                                                })}
                                              </select>

                                              <select
                                                className="bg-white border border-purple-300 rounded text-[10px] font-semibold text-purple-700 outline-none h-6 px-1 cursor-pointer"
                                                value={(itemCol as any).baseSource || "manual"}
                                                disabled={isVersionSubmitted}
                                                onChange={(e) => {
                                                  handleItemCalculation(boqItem.id, col.name, itemMultiplier, itemOp, (itemCol as any).multiplierSource || "manual", e.target.value);
                                                }}
                                              >
                                                <option value="manual">Source</option>
                                                <option value="Total Value (₹)">J: Total</option>
                                                <option value="Rate / Unit">G: Rate</option>
                                                <option value="Qty">I: Qty</option>
                                                <option value="Override Rate">K: O.Rate</option>
                                                <option value="Override Total">L: O.Total</option>
                                                {allCols.filter(c => c.name !== col.name).map((c) => {
                                                  const ci = allCols.findIndex(cc => cc.name === c.name);
                                                  return (
                                                    <option key={c.name} value={c.name}>
                                                      {getExcelColumnName(ci + 12)}: {c.name.substring(0, 8)}
                                                    </option>
                                                  );
                                                })}
                                              </select>

                                              {((itemCol as any).multiplierSource || "manual") === "manual" && (
                                                <input
                                                  type="number"
                                                  className="w-16 h-6 bg-white border border-purple-400 rounded-md px-1.5 text-[11px] font-semibold text-purple-800 outline-none text-right shadow-sm focus:ring-1 ring-purple-600/30"
                                                  value={itemMultiplier}
                                                  disabled={isVersionSubmitted}
                                                  onChange={(e) => {
                                                    const newVal = parseFloat(e.target.value) || 0;
                                                    handleItemCalculation(boqItem.id, col.name, newVal, itemOp, (itemCol as any).multiplierSource || "manual", (itemCol as any).baseSource || "manual");
                                                  }}
                                                />
                                              )}

                                              <select
                                                className="bg-white border border-purple-300 rounded text-[10px] font-semibold text-purple-700 outline-none h-6 px-1 cursor-pointer"
                                                value={itemOp}
                                                disabled={isVersionSubmitted}
                                                onChange={(e) => {
                                                  handleItemCalculation(boqItem.id, col.name, itemMultiplier, e.target.value, (itemCol as any).multiplierSource || "manual", (itemCol as any).baseSource || "manual");
                                                }}
                                              >
                                                <option value="%">%</option>
                                                <option value="*">×</option>
                                                <option value="/">÷</option>
                                                <option value="+">+</option>
                                              </select>
                                            </div>
                                          </div>
                                        )}

                                        <input
                                          type="number"
                                          disabled={isVersionSubmitted || isCalculated}
                                          value={displayVal}
                                          onChange={e => setCustomColumnValues(prev => ({
                                            ...prev,
                                            [boqItem.id]: {
                                              ...prev[boqItem.id],
                                              0: { ...(prev[boqItem.id]?.[0] || {}), [col.name]: e.target.value }
                                            }
                                          }))}
                                          onBlur={() => saveItemLayout(boqItem.id)}
                                          className={`w-full h-7 border-transparent rounded px-1 py-0.5 text-[11px] outline-none bg-transparent text-right font-bold transition-colors ${isCalculated ? "text-indigo-700" : "text-purple-800 focus:ring-1 ring-purple-400 hover:border-purple-200"}`}
                                          placeholder="0.00"
                                        />

                                        {/* Row-level badges removed per user request */}
                                      </div>
                                    </td>
                                  );
                                }
                              });
                            })()}
                          </Reorder.Item>
                        );
                      })}
                    </Reorder.Group>
                    {showColumnTotals && (
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold group">
                          <td className="border-r bg-gray-100/50"></td>
                          <td className="border-r text-center text-xs text-gray-400 bg-gray-100/50">∑</td>
                          <td className="border-r px-2 py-1.5 font-bold text-gray-800 relative text-[11px]">
                            COLUMN TOTALS
                            <button
                              onClick={() => setShowColumnTotals(false)}
                              className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                              title="Hide Column Totals"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                          <td className="border-r px-4 py-3 text-right font-semibold text-gray-600 bg-gray-50/50">
                            {/* Description total - empty */}
                          </td>
                          <td className="border-r px-2 py-1.5 text-right font-semibold text-gray-600 bg-gray-50/50 text-[11px] w-24">
                            {/* HSN Total - empty */}
                          </td>
                          <td className="border-r px-2 py-1.5 text-right font-semibold text-gray-600 bg-gray-50/50 text-[11px] w-24">
                            {/* SAC Total - empty */}
                          </td>
                          <td className="border-r px-2 py-1.5 text-right font-semibold text-gray-600 bg-gray-50/50 text-[11px] w-32">
                            ₹{calculatedColumnTotals.totalRateSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="border-r px-4 py-3 text-right font-semibold text-gray-600 bg-gray-50/50">
                            {/* Unit Total - empty */}
                          </td>
                          <td className="border-r px-4 py-3 text-right font-semibold text-gray-600 bg-gray-50/50">
                            {/* Qty Total intentionally left empty per user request */}
                          </td>
                          <td className="border-r px-2 py-1.5 text-right font-semibold text-green-700 bg-green-50/30 group/total relative text-[11px] w-32">
                            {!hideSystemTotalFooter ? (
                              <>
                                ₹{calculatedColumnTotals.totalValueSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <button
                                  onClick={() => handleSetSystemTotalVisibility(false)}
                                  className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/total:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                                  title="Hide System Total"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleSetSystemTotalVisibility(true)}
                                className="text-blue-500 hover:text-blue-700 text-[10px] font-bold uppercase transition-colors"
                              >
                                + Restore Total
                              </button>
                            )}
                          </td>
                          <td className="border-r px-2 py-1.5 text-right font-semibold text-gray-600 bg-gray-50/50 text-[11px] w-32">
                            {/* Override Rate total - empty */}
                          </td>
                          <td className="border-r px-2 py-1.5 text-right font-semibold text-green-800 bg-green-50/40 text-[11px] w-32">
                            ₹{calculatedColumnTotals.overrideTotalSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          {allCols.map((col, idx) => (
                            <td
                              key={`total-${idx}`}
                              className={`border-r px-2 py-1.5 text-right font-semibold group/total relative text-[11px] ${col.isTotal ? "text-green-900 bg-green-100/40" : "text-purple-700 bg-purple-50"}`}
                            >
                              {!col.hideTotal ? (
                                <>
                                  ₹{calculatedColumnTotals.totals[idx].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  <button
                                    onClick={() => handleToggleColumnTotalVisibility(col.name, true)}
                                    className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/total:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                                    title="Hide Column Total"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleToggleColumnTotalVisibility(col.name, false)}
                                  className="text-blue-500 hover:text-blue-700 text-[10px] font-bold uppercase transition-colors"
                                >
                                  + Restore
                                </button>
                              )}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </Card>
            )}

            {boqItems.length > 0 && showColumnTotals && (
              <div className="flex flex-col lg:flex-row gap-4 pt-4">
                {/* Terms and Conditions Section */}
                <div className="flex-1 min-w-[300px]">
                  <Card className="bg-gray-50/50 border-gray-200">
                    <CardHeader className="py-2 px-4 border-b">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Global Terms & Conditions</span>
                        <span className="text-[9px] text-gray-400 font-medium italic">(Applied to all projects)</span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <textarea
                        className="w-full min-h-[100px] p-4 bg-transparent outline-none text-[12px] text-gray-700 leading-relaxed scrollbar-hide resize-y"
                        placeholder="Enter terms and conditions here..."
                        value={termsAndConditions}
                        onChange={(e) => handleUpdateTermsAndConditions(e.target.value)}
                      />
                    </CardContent>
                  </Card>
                </div>

                {/* Grand Total Section */}
                <div className="flex flex-col items-end">
                  <div className="bg-gray-800 text-white rounded-lg px-4 py-3 flex items-center gap-8 shadow-lg group relative border border-gray-700 w-full lg:w-auto min-w-[500px]">
                    <button
                      onClick={() => setShowColumnTotals(false)}
                      className="absolute -left-2 -top-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover/total:opacity-100 transition-opacity shadow-md hover:bg-red-600 z-10"
                      title="Hide Grand Total"
                    >
                      <Trash2 size={12} />
                    </button>

                    <div className="flex flex-col gap-1 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Grand Total Source</span>
                      <Select value={grandTotalColumn} onValueChange={handleSetGrandTotalColumn}>
                        <SelectTrigger className="h-8 bg-gray-700/50 border-gray-600 text-white text-[11px] font-semibold w-full">
                          <SelectValue placeholder="Select summary column" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 text-white border-gray-700">
                          <SelectItem value="Total Value (₹)">Standard Total</SelectItem>
                          <SelectItem value="Override Total">Override Total</SelectItem>
                          {allCols.map(col => (
                            <SelectItem key={col.name} value={col.name}>{col.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="h-10 w-[1px] bg-gray-600/50 mx-2" />

                    <div className="flex flex-col items-end min-w-[150px]">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-400/80 mb-1">
                        {grandTotalColumn === "Total Value (₹)" ? "Base Grand Total" :
                          grandTotalColumn === "Override Total" ? "Override Grand Total" :
                            `${grandTotalColumn} Total`}
                      </span>
                      <span className="text-2xl font-black text-green-400 font-mono tracking-tighter">
                        ₹{(() => {
                          if (grandTotalColumn === "Total Value (₹)") return calculatedColumnTotals.totalValueSum;
                          if (grandTotalColumn === "Override Total") return calculatedColumnTotals.overrideTotalSum;
                          const idx = allCols.findIndex(c => c.name === grandTotalColumn);
                          return idx >= 0 ? calculatedColumnTotals.totals[idx] : 0;
                        })().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

        {/* Save Template Dialog */}
        <Dialog open={isSaveTemplateDialogOpen} onOpenChange={setIsSaveTemplateDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Save BOQ Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  placeholder="e.g., Standard Office Interior"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  This will save the current column names and formulas.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSaveTemplateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveAsTemplate}>
                Save Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
