import React, { useState } from "react";
import { postJSON } from "@/lib/api";
import { useData } from "@/lib/store";
import { Layout } from "@/components/layout/Layout";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  Upload,
  Trash2,
  Eye,
  Copy,
  FileText,
  AlertCircle,
  CheckCircle2,
  Store
} from "lucide-react";

// ===== Material constants =====
const materialHeaders = [
  "name",
  "code",
  "unit",
  "rate",
  "category",
  "subcategory",
  "shop_name",
  "vendor_category",
  "tax_code_type",
  "tax_code_value",
  "brandname",
  "technicalspecification",
];

const materialHeaderLine = materialHeaders.join("\t");

const materialHeaderLabels: Record<string, string> = {
  technicalspecification: "Technical Specification",
  shop_name: "Shop Name",
  vendor_category: "Vendor Category",
  tax_code_type: "Tax Code Type",
  tax_code_value: "Tax Code Value",
  brandname: "Brand",
};

function generateCodeFromName(name: string) {
  if (!name) return "";
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function emptyMaterialRow() {
  return {
    name: "", code: "", unit: "", rate: "",
    category: "", subcategory: "", shop_name: "", vendor_category: "",
    tax_code_type: "", tax_code_value: "", brandname: "", technicalspecification: ""
  };
}

// ===== Shop constants =====
const shopHeaders = [
  "name",
  "location",
  "city",
  "state",
  "country",
  "pincode",
  "phoneCountryCode",
  "contactNumber",
  "gstNo",
  "vendorCategory",
];

const shopHeaderLine = shopHeaders.join("\t");

const shopHeaderLabels: Record<string, string> = {
  phoneCountryCode: "Phone Code",
  contactNumber: "Contact Number",
  gstNo: "GST No",
  vendorCategory: "Vendor Category",
};

function emptyShopRow() {
  return {
    name: "", location: "", city: "", state: "", country: "",
    pincode: "", phoneCountryCode: "", contactNumber: "", gstNo: "", vendorCategory: ""
  };
}

type ActiveTab = "materials" | "shops";

export default function BulkMaterialUpload() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("materials");

  // ===== Material state =====
  const [matRows, setMatRows] = useState<Record<string, string>[]>(
    Array(10).fill(null).map(() => emptyMaterialRow())
  );
  const [matPreview, setMatPreview] = useState<{
    headers: string[];
    rows: Record<string, any>[];
  } | null>(null);
  const [matLoading, setMatLoading] = useState(false);
  const [matResult, setMatResult] = useState<any>(null);

  // ===== Shop state =====
  const [shopRows, setShopRows] = useState<Record<string, string>[]>(
    Array(10).fill(null).map(() => emptyShopRow())
  );
  const [shopPreview, setShopPreview] = useState<{
    headers: string[];
    rows: Record<string, any>[];
  } | null>(null);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopResult, setShopResult] = useState<any>(null);

  const { toast } = useToast();
  const { refreshMaterials, refreshPendingApprovals } = useData();

  // ===== Material handlers =====
  const updateMatCell = (rowIndex: number, column: string, value: string) => {
    setMatRows((prev) => {
      const next = [...prev];
      const currentRow = { ...next[rowIndex] };
      currentRow[column] = value;
      if (column === "name") {
        currentRow["code"] = generateCodeFromName(value);
      }
      next[rowIndex] = currentRow;
      return next;
    });
  };

  const addMatRows = (count: number = 5) => {
    setMatRows((prev) => [
      ...prev,
      ...Array(count).fill(null).map(() => emptyMaterialRow())
    ]);
  };

  const handleMatPaste = (e: React.ClipboardEvent) => {
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData || !pasteData.includes('\t')) return;
    e.preventDefault();
    const lines = pasteData.split(/\r?\n/).filter(line => line.trim() !== "");

    setMatRows((prev) => {
      const next = [...prev];
      lines.forEach((line, lineIdx) => {
        const cols = line.split('\t');
        if (lineIdx >= next.length) {
          next.push(emptyMaterialRow());
        }
        const rowData = { ...next[lineIdx] };
        materialHeaders.forEach((header, colIdx) => {
          if (cols[colIdx] !== undefined) {
            rowData[header] = cols[colIdx].trim();
          }
        });
        if (rowData.name && !rowData.code) {
          rowData.code = generateCodeFromName(rowData.name);
        }
        next[lineIdx] = rowData;
      });
      return next;
    });

    toast({
      title: "Data Pasted",
      description: `Imported ${lines.length} rows. Auto-generated missing codes.`,
    });
  };

  const handleMatPreview = () => {
    const activeRows = matRows.filter(row =>
      Object.values(row).some(val => val.trim() !== "")
    );
    if (activeRows.length === 0) {
      toast({ title: "No Data", description: "Please enter some material data first.", variant: "destructive" });
      return;
    }
    const invalid = activeRows.filter((r) => !r.name?.trim());
    if (invalid.length > 0) {
      toast({ title: "Validation Error", description: "Some rows are missing 'Name'. This field is required.", variant: "destructive" });
      return;
    }
    setMatPreview({ headers: materialHeaders, rows: activeRows });
    toast({ title: "Preview Generated", description: `Parsed ${activeRows.length} active rows.` });
  };

  const handleMatUpload = async () => {
    if (!matPreview || matPreview.rows.length === 0) {
      toast({ title: "No Preview", description: "Please preview your data before uploading.", variant: "destructive" });
      return;
    }
    setMatLoading(true);
    setMatResult(null);
    try {
      const res = await postJSON("/bulk-materials", { rows: matPreview.rows });
      setMatResult(res);
      if (!res.errors || res.errors.length === 0) {
        setMatPreview(null);
        setMatRows(Array(10).fill(null).map(() => emptyMaterialRow()));
      } else {
        toast({ title: "Partial Success/Errors", description: `Processed with ${res.errors.length} errors. Please fix highlighted rows.`, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err?.message || "Something went wrong during upload.", variant: "destructive" });
    } finally {
      setMatLoading(false);
    }
  };

  const copyMatTemplate = () => {
    navigator.clipboard.writeText(materialHeaderLine);
    toast({ title: "Template Copied", description: "Header template (TSV) copied to clipboard." });
  };

  // ===== Shop handlers =====
  const updateShopCell = (rowIndex: number, column: string, value: string) => {
    setShopRows((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [column]: value };
      return next;
    });
  };

  const addShopRows = (count: number = 5) => {
    setShopRows((prev) => [
      ...prev,
      ...Array(count).fill(null).map(() => emptyShopRow())
    ]);
  };

  const handleShopPaste = (e: React.ClipboardEvent) => {
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData || !pasteData.includes('\t')) return;
    e.preventDefault();
    const lines = pasteData.split(/\r?\n/).filter(line => line.trim() !== "");

    setShopRows((prev) => {
      const next = [...prev];
      lines.forEach((line, lineIdx) => {
        const cols = line.split('\t');
        if (lineIdx >= next.length) {
          next.push(emptyShopRow());
        }
        const rowData = { ...next[lineIdx] };
        shopHeaders.forEach((header, colIdx) => {
          if (cols[colIdx] !== undefined) {
            rowData[header] = cols[colIdx].trim();
          }
        });
        next[lineIdx] = rowData;
      });
      return next;
    });

    toast({
      title: "Data Pasted",
      description: `Imported ${lines.length} shop rows.`,
    });
  };

  const handleShopPreview = () => {
    const activeRows = shopRows.filter(row =>
      Object.values(row).some(val => val.trim() !== "")
    );
    if (activeRows.length === 0) {
      toast({ title: "No Data", description: "Please enter some shop data first.", variant: "destructive" });
      return;
    }
    const missingName = activeRows.filter((r) => !r.name?.trim());
    if (missingName.length > 0) {
      toast({ title: "Validation Error", description: "Some rows are missing 'Name'. This field is required.", variant: "destructive" });
      return;
    }
    const missingCity = activeRows.filter((r) => !r.city?.trim());
    if (missingCity.length > 0) {
      toast({ title: "Validation Error", description: "Some rows are missing 'City'. This field is required.", variant: "destructive" });
      return;
    }
    setShopPreview({ headers: shopHeaders, rows: activeRows });
    toast({ title: "Preview Generated", description: `Parsed ${activeRows.length} active shop rows.` });
  };

  const handleShopUpload = async () => {
    if (!shopPreview || shopPreview.rows.length === 0) {
      toast({ title: "No Preview", description: "Please preview your data before uploading.", variant: "destructive" });
      return;
    }
    setShopLoading(true);
    setShopResult(null);
    try {
      const res = await postJSON("/bulk-shops", { rows: shopPreview.rows });
      setShopResult(res);
      if (!res.errors || res.errors.length === 0) {
        setShopPreview(null);
        setShopRows(Array(10).fill(null).map(() => emptyShopRow()));
      } else {
        toast({ title: "Partial Success/Errors", description: `Processed with ${res.errors.length} errors. Please fix highlighted rows.`, variant: "destructive" });
      }
      toast({ title: "Success", description: `${res.createdShopsCount || 0} shops submitted for approval.` });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err?.message || "Something went wrong during upload.", variant: "destructive" });
    } finally {
      setShopLoading(false);
    }
  };

  const copyShopTemplate = () => {
    navigator.clipboard.writeText(shopHeaderLine);
    toast({ title: "Template Copied", description: "Shop header template (TSV) copied to clipboard." });
  };

  // ===== Shared rendering helpers =====
  const isMatTab = activeTab === "materials";
  const currentHeaders = isMatTab ? materialHeaders : shopHeaders;
  const currentHeaderLabels = isMatTab ? materialHeaderLabels : shopHeaderLabels;
  const currentRows = isMatTab ? matRows : shopRows;
  const currentPreview = isMatTab ? matPreview : shopPreview;
  const currentLoading = isMatTab ? matLoading : shopLoading;
  const currentResult = isMatTab ? matResult : shopResult;

  const handleCellUpdate = isMatTab ? updateMatCell : updateShopCell;
  const handlePaste = isMatTab ? handleMatPaste : handleShopPaste;
  const handlePreview = isMatTab ? handleMatPreview : handleShopPreview;
  const handleUpload = isMatTab ? handleMatUpload : handleShopUpload;
  const copyTemplate = isMatTab ? copyMatTemplate : copyShopTemplate;
  const addRows = isMatTab ? addMatRows : addShopRows;

  const resetGrid = () => {
    if (isMatTab) {
      setMatRows(Array(10).fill(null).map(() => emptyMaterialRow()));
      setMatPreview(null);
      setMatResult(null);
    } else {
      setShopRows(Array(10).fill(null).map(() => emptyShopRow()));
      setShopPreview(null);
      setShopResult(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Bulk Upload</h2>
            <p className="text-muted-foreground">
              Add multiple {isMatTab ? "materials" : "shops"} by typing below or pasting directly from Excel.
            </p>
          </div>
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-md text-xs text-blue-800 max-w-xs">
            <p className="flex items-center gap-1 font-semibold mb-1">
              <AlertCircle className="h-3 w-3" />
              Pro Tip
            </p>
            Copy cells from Excel and paste anywhere in the table grid!
          </div>
        </div>

        {/* ===== Tab Switcher ===== */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("materials")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
              activeTab === "materials"
                ? "bg-white shadow-sm text-primary"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <FileText className="h-4 w-4" />
            Materials
          </button>
          <button
            onClick={() => setActiveTab("shops")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
              activeTab === "shops"
                ? "bg-white shadow-sm text-primary"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Store className="h-4 w-4" />
            Shops
          </button>
        </div>

        <Card className="border-none shadow-md overflow-hidden bg-slate-50/30">
          <CardHeader className="bg-white border-b py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-xl">
                {isMatTab ? (
                  <FileText className="h-5 w-5 text-primary" />
                ) : (
                  <Store className="h-5 w-5 text-primary" />
                )}
                {isMatTab ? "Material Entry Grid" : "Shop Entry Grid"}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyTemplate}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy Headers
                </Button>
                <Button variant="ghost" size="sm" onClick={resetGrid} className="text-destructive hover:bg-destructive/5 h-8">
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Reset Grid
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[600px] border-b" onPaste={handlePaste}>
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 bg-slate-100 z-10 shadow-sm border-b">
                  <TableRow>
                    <TableHead className="w-10 text-center font-bold text-slate-600 border-r">#</TableHead>
                    {currentHeaders.map((h) => (
                      <TableHead key={h} className="min-w-[150px] font-bold text-slate-600 border-r">
                        <div className="flex items-center gap-1">
                          {currentHeaderLabels[h] || (h.charAt(0).toUpperCase() + h.slice(1).replace(/_/g, " "))}
                          {isMatTab && h === "code" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertCircle className="h-3 w-3 text-slate-400 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Strictly auto-generated from Name (non-editable)</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {!isMatTab && (h === "name" || h === "city") && (
                            <span className="text-red-400 text-xs">*</span>
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-white">
                  {currentRows.map((row, rowIndex) => (
                    <TableRow key={rowIndex} className="group hover:bg-slate-50 transition-colors">
                      <TableCell className="text-center font-mono text-xs text-slate-400 border-r bg-slate-50/50">
                        {rowIndex + 1}
                      </TableCell>
                      {currentHeaders.map((header) => (
                        <TableCell key={header} className="p-0 border-r">
                          <input
                            type="text"
                            value={row[header]}
                            readOnly={isMatTab && header === "code"}
                            tabIndex={isMatTab && header === "code" ? -1 : 0}
                            onChange={(e) => handleCellUpdate(rowIndex, header, e.target.value)}
                            className={cn(
                              "w-full h-10 px-3 border-none focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm bg-transparent",
                              isMatTab && header === "code" && "bg-slate-50/50 text-slate-500 cursor-not-allowed font-mono text-xs"
                            )}
                            placeholder={
                              header === 'name' ? 'Required...' :
                                !isMatTab && header === 'city' ? 'Required...' : ''
                            }
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="bg-white border-t p-4 flex justify-between items-center">
            <Button variant="ghost" size="sm" onClick={() => addRows(5)} className="text-slate-600 h-9">
              + Add 5 More Rows
            </Button>
            <Button onClick={handlePreview} className="min-w-[150px] shadow-sm">
              <Eye className="mr-2 h-4 w-4" />
              Preview & Validate
            </Button>
          </CardFooter>
        </Card>

        {currentPreview && (
          <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500 border-primary/20 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b bg-primary/5 py-4">
              <div>
                <CardTitle className="text-lg text-primary flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Ready to Upload
                </CardTitle>
                <CardDescription className="text-primary/70">
                  Verified {currentPreview.rows.length} valid {isMatTab ? "material" : "shop"} rows.
                  {!isMatTab && " Shops will be submitted for approval."}
                </CardDescription>
              </div>
              <Button onClick={handleUpload} disabled={currentLoading} size="lg" className="bg-primary hover:bg-primary/90 px-8">
                {currentLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                )}
                {currentLoading ? "Uploading..." : "Confirm Bulk Import"}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[300px]">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      {currentPreview.headers.map((h) => (
                        <TableHead key={h} className="text-xs uppercase tracking-wider text-slate-500">
                          {(isMatTab ? materialHeaderLabels : shopHeaderLabels)[h] || (h.charAt(0).toUpperCase() + h.slice(1).replace(/_/g, " "))}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentPreview.rows.map((row, idx) => (
                      <TableRow key={idx} className="hover:bg-muted/30">
                        {currentPreview.headers.map((h) => (
                          <TableCell key={h} className="text-sm py-2">
                            {row[h] || <span className="text-slate-300 italic">empty</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {currentResult && (
          <Card className="border-green-200 bg-green-50/30">
            <CardHeader className="py-3 border-b border-green-100">
              <CardTitle className="flex items-center gap-2 text-green-700 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Upload Results
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <pre className="text-[10px] bg-white border rounded p-3 text-green-800 font-mono overflow-auto max-h-[150px]">
                {JSON.stringify(currentResult, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
