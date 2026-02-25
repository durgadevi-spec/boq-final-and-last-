import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Edit, Loader2, Search } from "lucide-react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/Layout";
import { computeBoq, UnitType } from "@/lib/boqCalc";

type Product = {
    id: string;
    name: string;
    subcategory: string;
    created_at: string;
    created_by?: string;
};

type Category = {
    id: string;
    name: string;
};

type Subcategory = {
    id: string;
    name: string;
    category: string;
};

type Material = {
    id: string;
    name: string;
    unit: string;
    rate: number;
    category: string;
    subcategory: string;
    description?: string;
    shop_name?: string;
    code?: string;
    technicalspecification?: string;
};

type SelectedMaterial = Material & {
    qty: number;         // effective scaled qty (incl wastage)
    baseQty: number;     // raw input (at basis)
    wastagePct?: number; // per-row override
    amount: number;
    rate: number;
    supplyRate: number;
    installRate: number;
    location: string;
    applyWastage: boolean;
};

export default function ManageProduct() {
    const [step, setStep] = useState(1);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [configName, setConfigName] = useState<string>("");
    const ALL_TOKEN = "__ALL__";
    const [selectedCategory, setSelectedCategory] = useState<string>(ALL_TOKEN);
    const [selectedSubcategory, setSelectedSubcategory] = useState<string>(ALL_TOKEN);
    const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([]);
    const [configMaterials, setConfigMaterials] = useState<SelectedMaterial[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [previousConfigs, setPreviousConfigs] = useState<any[]>([]);
    const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
    const { toast } = useToast();

    // BOQ Config Basis state
    const [requiredUnitType, setRequiredUnitType] = useState<UnitType>("Sqft");
    const [baseRequiredQty, setBaseRequiredQty] = useState<number>(100);
    const [wastagePctDefault, setWastagePctDefault] = useState<number>(5); // as percentage e.g. 5 for 5%
    const [dimA, setDimA] = useState<number | undefined>(undefined);
    const [dimB, setDimB] = useState<number | undefined>(undefined);
    const [dimC, setDimC] = useState<number | undefined>(undefined);

    const resetSelection = () => {
        setConfigName("");
        setSelectedCategory("");
        setSelectedSubcategory("");
        setSelectedMaterials([]);
        setConfigMaterials([]);
        setRequiredUnitType("Sqft");
        setBaseRequiredQty(100);
        setWastagePctDefault(5);
        setDimA(undefined);
        setDimB(undefined);
        setDimC(undefined);
    };

    const fetchPreviousConfigs = async (productId: string) => {
        setIsLoadingConfigs(true);
        try {
            const res = await apiFetch(`/api/step11-products/${productId}`);
            if (res.ok) {
                const data = await res.json();
                setPreviousConfigs(data.configurations || []);
            }
        } catch (error) {
            console.error("Failed to fetch previous configs", error);
        } finally {
            setIsLoadingConfigs(false);
        }
    };

    // Auto-calculate baseRequiredQty when dimensions change (Excel alignment)
    useEffect(() => {
        if (dimA !== undefined || dimB !== undefined || dimC !== undefined) {
            const a = Number(dimA) || 1;
            const b = Number(dimB) || 1;
            const c = Number(dimC) || 1;
            setBaseRequiredQty(a * b * c);
        }
    }, [dimA, dimB, dimC]);

    // Auto-fetch previous configs when selectedProduct changes
    useEffect(() => {
        if (selectedProduct) {
            fetchPreviousConfigs(selectedProduct.id);
        } else {
            setPreviousConfigs([]);
        }
    }, [selectedProduct?.id]);

    // Step 1: Fetch Products
    const { data: productsData, isLoading: loadingProducts } = useQuery({
        queryKey: ["/api/products"],
        queryFn: async () => {
            const res = await apiFetch("/api/products");
            if (!res.ok) throw new Error("Failed to fetch products");
            const data = await res.json();
            return ((data.products || []) as Product[]).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        },
    });

    // Step 2: Fetch Categories
    const { data: categoriesData } = useQuery({
        queryKey: ["/api/material-categories"],
        queryFn: async () => {
            const res = await apiFetch("/api/material-categories");
            if (!res.ok) throw new Error("Failed to fetch categories");
            const data = await res.json();
            return ((data.categories || []) as string[]).sort((a, b) => a.localeCompare(b));
        },
        enabled: step === 2,
    });

    // Fetch Subcategories based on selected Category
    const { data: subcategoriesData } = useQuery({
        queryKey: ["/api/material-subcategories", selectedCategory],
        queryFn: async () => {
            const res = await apiFetch(`/api/material-subcategories/${selectedCategory}`);
            if (!res.ok) throw new Error("Failed to fetch subcategories");
            const data = await res.json();
            // Subcategories route returns { subcategories: string[] }
            return ((data.subcategories || []) as string[]).sort((a, b) => a.localeCompare(b));
        },
        enabled: step === 2 && !!selectedCategory && selectedCategory !== ALL_TOKEN,
    });

    // Fetch all materials
    const { data: materialsData, isLoading: loadingMaterials } = useQuery({
        queryKey: ["/api/materials"],
        queryFn: async () => {
            const res = await apiFetch("/api/materials");
            if (!res.ok) throw new Error("Failed to fetch materials");
            const data = await res.json();
            return ((data.materials || []) as Material[]).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        },
        enabled: step === 2,
    });

    // Deduplicate by id (some installs may have duplicate rows). Then filter by category/subcategory.
    // Prefer deduplication by `code` (many materials share same code across shops), fallback to id
    const uniqueMaterials = Array.from(
        new Map((materialsData || []).map(m => [(m.code || m.id || Math.random()).toString().trim().toLowerCase(), m])).values()
    );

    const [materialSearch, setMaterialSearch] = useState<string>("");

    const filteredMaterials = uniqueMaterials.filter((m) => {
        if (materialSearch) {
            const q = materialSearch.toLowerCase();
            const matchName = (m.name || "").toLowerCase().includes(q);
            const matchCode = (m.code || "").toLowerCase().includes(q);
            if (!matchName && !matchCode) return false;
        }
        const includesValue = (field: string | undefined | null, val: string) => {
            if (!val || val === ALL_TOKEN) return true;
            if (!field) return false;
            if (field === val) return true;
            // support comma-separated stored values (e.g. "CatA,CatB")
            return field.split(",").map(s => s.trim().toLowerCase()).includes(val.trim().toLowerCase());
        };

        const matchesCategory = includesValue(m.category, selectedCategory);
        const matchesSubcategory = includesValue(m.subcategory, selectedSubcategory);
        return matchesCategory && matchesSubcategory;
    });

    const nextStep = () => {
        if (step === 1 && !selectedProduct) {
            toast({ title: "Product Required", description: "Please select a product to proceed.", variant: "destructive" });
            return;
        }
        if (step === 2 && selectedMaterials.length === 0) {
            toast({ title: "Selection Required", description: "Please select at least one material.", variant: "destructive" });
            return;
        }

        if (step === 2) {
            // Build Step 3 from ONLY the materials selected in Step 2.
            // If a material was previously configured (saved rate/qty), preserve those values.
            const existingConfigMap = new Map(configMaterials.map(m => [m.id, m]));

            setConfigMaterials(
                selectedMaterials.map((m) => {
                    const existing = existingConfigMap.get(m.id);
                    if (existing) {
                        // Preserve previously saved rate/qty for this material
                        return existing;
                    }
                    // New material — initialize with defaults
                    const rate = Number(m.rate) || 0;
                    return {
                        ...m,
                        qty: 1,
                        baseQty: 1,
                        wastagePct: undefined,
                        amount: rate,
                        rate: rate,
                        supplyRate: rate,
                        installRate: 0,
                        location: m.technicalspecification || m.name || "",
                        description: m.technicalspecification || m.name || "",
                        applyWastage: true
                    };
                })
            );
        }

        setStep(step + 1);
    };

    const handleSave = async () => {
        if (!selectedProduct) return;

        setIsSaving(true);
        try {
            // Generate unique config name if none provided to ensure new configuration creation
            const uniqueConfigName = configName || `${selectedProduct.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const res = await apiFetch("/api/step11-products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    productId: selectedProduct.id,
                    productName: selectedProduct.name,
                    configName: uniqueConfigName,
                    categoryId: selectedCategory,
                    subcategoryId: selectedSubcategory,
                    totalCost: totalCost,
                    requiredUnitType: requiredUnitType,
                    baseRequiredQty: baseRequiredQty,
                    wastagePctDefault: wastagePctDefault,
                    items: boqResults.computed.map(m => ({
                        materialId: m.id,
                        materialName: m.name,
                        unit: m.unit,
                        qty: m.roundOffQty,
                        rate: m.rate,
                        supplyRate: m.supplyRate,
                        installRate: m.installRate,
                        location: m.location,
                        amount: m.lineTotal,
                        baseQty: m.baseQty,
                        wastagePct: m.wastagePct ?? null,
                        applyWastage: m.applyWastage,
                        shop_name: m.shop_name
                    }))
                }),
            });

            if (!res.ok) throw new Error("Failed to save configuration");

            toast({
                title: "Success",
                description: "Product configuration saved permanently.",
                variant: "default",
            });
            // Optionally redirect or reset
            setStep(1);
            setSelectedProduct(null);
            setConfigName("");
            setSelectedMaterials([]);
            setConfigMaterials([]);
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Failed to save configuration",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Save without navigating away — stays on current step, saves to Step 3's own table
    const handleSaveInPlace = async () => {
        if (!selectedProduct) return;

        setIsSaving(true);
        try {
            const uniqueConfigName = configName || `${selectedProduct.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Save to Step 3's own table
            const step3Res = await apiFetch("/api/product-step3-config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    productId: selectedProduct.id,
                    productName: selectedProduct.name,
                    configName: uniqueConfigName,
                    categoryId: selectedCategory,
                    subcategoryId: selectedSubcategory,
                    totalCost: totalCost,
                    requiredUnitType: requiredUnitType,
                    baseRequiredQty: baseRequiredQty,
                    wastagePctDefault: wastagePctDefault,
                    dimA: dimA,
                    dimB: dimB,
                    dimC: dimC,
                    items: boqResults.computed.map(m => ({
                        materialId: m.id,
                        materialName: m.name,
                        unit: m.unit,
                        qty: m.roundOffQty, // Use effective qty (incl wastage)
                        rate: m.rate,
                        supplyRate: m.supplyRate,
                        installRate: m.installRate,
                        location: m.location,
                        amount: m.lineTotal, // Use calculated total
                        baseQty: m.baseQty,
                        wastagePct: m.wastagePct ?? null,
                        applyWastage: m.applyWastage,
                        shop_name: m.shop_name
                    }))
                }),
            });

            if (!step3Res.ok) throw new Error("Failed to save configuration to step3-config table");

            // Also save to step11_products table
            const step11Res = await apiFetch("/api/step11-products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    productId: selectedProduct.id,
                    productName: selectedProduct.name,
                    configName: uniqueConfigName,
                    categoryId: selectedCategory,
                    subcategoryId: selectedSubcategory,
                    totalCost: totalCost,
                    requiredUnitType: requiredUnitType,
                    baseRequiredQty: baseRequiredQty,
                    wastagePctDefault: wastagePctDefault,
                    items: boqResults.computed.map(m => ({
                        materialId: m.id,
                        materialName: m.name,
                        unit: m.unit,
                        qty: m.roundOffQty, // Use effective qty (incl wastage)
                        rate: m.rate,
                        supplyRate: m.supplyRate,
                        installRate: m.installRate,
                        location: m.location,
                        amount: m.lineTotal, // Use calculated total
                        baseQty: m.baseQty,
                        wastagePct: m.wastagePct ?? null,
                        applyWastage: m.applyWastage,
                        shop_name: m.shop_name
                    }))
                }),
            });

            if (!step11Res.ok) throw new Error("Failed to save configuration to step11-products table");

            toast({
                title: "Configuration Saved",
                description: `"${selectedProduct.name}" configuration saved. It will now appear in Manage Product and when using Add Product in Create BOM.`,
            });

            // Refresh the previous configs list
            fetchPreviousConfigs(selectedProduct.id);

            // Stay on the same step — don't reset anything
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Failed to save configuration",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const loadExistingConfig = async (product: Product) => {
        try {
            // First: try to load from Step 3's own table (has user-edited qty/rates)
            const step3Res = await apiFetch(`/api/product-step3-config/${product.id}`);
            if (step3Res.ok) {
                const step3Data = await step3Res.json();
                if (step3Data.items && step3Data.items.length > 0) {
                    const mappedItems = step3Data.items.map((item: any) => ({
                        id: item.material_id,
                        name: item.material_name,
                        unit: item.unit,
                        qty: Number(item.qty || 0),
                        baseQty: Number(item.base_qty ?? item.qty ?? 0),
                        wastagePct: (item.wastage_pct !== null && item.wastage_pct !== undefined) ? Number(item.wastage_pct) : undefined,
                        rate: Number(item.rate),
                        supplyRate: Number(item.supply_rate || item.rate || 0),
                        installRate: Number(item.install_rate || 0),
                        location: item.location || "Main Area",
                        amount: Number(item.amount),
                        applyWastage: item.apply_wastage !== undefined ? Boolean(item.apply_wastage) : (item.applyWastage !== undefined ? Boolean(item.applyWastage) : true),
                        shop_name: item.shop_name,
                        category: "",
                        subcategory: ""
                    }));
                    setConfigName(step3Data.config.config_name || "");
                    setSelectedCategory(step3Data.config.category_id || "");
                    setSelectedSubcategory(step3Data.config.subcategory_id || "");

                    // New fields
                    setRequiredUnitType(step3Data.config.required_unit_type || "Sqft");
                    setBaseRequiredQty(Number(step3Data.config.base_required_qty || 100));
                    setWastagePctDefault(Number(step3Data.config.wastage_pct_default || 0));
                    setDimA(step3Data.config.dim_a ? Number(step3Data.config.dim_a) : undefined);
                    setDimB(step3Data.config.dim_b ? Number(step3Data.config.dim_b) : undefined);
                    setDimC(step3Data.config.dim_c ? Number(step3Data.config.dim_c) : undefined);

                    setSelectedMaterials(mappedItems);
                    setConfigMaterials(mappedItems);
                    toast({
                        title: "Configuration Loaded",
                        description: `Loaded saved Step 3 configuration for ${product.name}.`,
                    });
                    return; // Done — don't fall through to step11_products
                }
            }

            // Fallback: load from step11_products (Step 4 table)
            const res = await apiFetch(`/api/step11-products/${product.id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.configurations && data.configurations.length > 0) {
                    const configs = data.configurations;
                    const latestConfig = configs[0];

                    toast({
                        title: "Configuration Found",
                        description: `Existing configuration "${latestConfig.product.config_name || 'Unnamed'}" for ${product.name} loaded.`,
                    });

                    const mappedItems = latestConfig.items.map((item: any) => ({
                        id: item.material_id,
                        name: item.material_name,
                        unit: item.unit,
                        qty: Number(item.qty || 0),
                        baseQty: Number(item.qty || 0),
                        wastagePct: undefined,
                        rate: Number(item.rate),
                        supplyRate: Number(item.supply_rate || item.rate || 0),
                        installRate: Number(item.install_rate || 0),
                        location: item.location || "Main Area",
                        amount: Number(item.amount || 0),
                        applyWastage: item.apply_wastage !== undefined ? Boolean(item.apply_wastage) : (item.applyWastage !== undefined ? Boolean(item.applyWastage) : true),
                        shop_name: item.shop_name,
                        category: "",
                        subcategory: ""
                    }));

                    setConfigName(latestConfig.product.config_name || "");
                    setSelectedCategory(latestConfig.product.category_id || "");
                    setSelectedSubcategory(latestConfig.product.subcategory_id || "");

                    // Smart fallbacks for older Step 11 snapshots
                    setRequiredUnitType(latestConfig.product.required_unit_type || "Sqft");
                    setBaseRequiredQty(Number(latestConfig.product.base_required_qty || 100));
                    setWastagePctDefault(Number(latestConfig.product.wastage_pct_default || 0));
                    setDimA(latestConfig.product.dim_a ? Number(latestConfig.product.dim_a) : undefined);
                    setDimB(latestConfig.product.dim_b ? Number(latestConfig.product.dim_b) : undefined);
                    setDimC(latestConfig.product.dim_c ? Number(latestConfig.product.dim_c) : undefined);

                    setSelectedMaterials(mappedItems);
                    setConfigMaterials(mappedItems);
                }
            }
        } catch (error) {
            console.error("Failed to load existing config", error);
        }
    };

    const loadSpecificConfig = async (configData: any) => {
        try {
            const config = configData.product;
            const items = configData.items;

            const mappedItems = items.map((item: any) => ({
                id: item.material_id,
                name: item.material_name,
                unit: item.unit,
                qty: Number(item.qty || 0),
                baseQty: Number(item.base_qty ?? item.qty ?? 0),
                wastagePct: (item.wastage_pct !== null && item.wastage_pct !== undefined) ? Number(item.wastage_pct) : undefined,
                rate: Number(item.rate),
                supplyRate: Number(item.supply_rate || item.rate || 0),
                installRate: Number(item.install_rate || 0),
                location: item.location || "Main Area",
                amount: Number(item.amount),
                applyWastage: item.apply_wastage !== undefined ? Boolean(item.apply_wastage) : true,
                shop_name: item.shop_name,
                category: "",
                subcategory: ""
            }));

            setConfigName(config.config_name || "");
            setSelectedCategory(config.category_id || "");
            setSelectedSubcategory(config.subcategory_id || "");
            setRequiredUnitType(config.required_unit_type || "Sqft");
            setBaseRequiredQty(Number(config.base_required_qty || 100));
            setWastagePctDefault(Number(config.wastage_pct_default || 0));
            setDimA(config.dim_a ? Number(config.dim_a) : undefined);
            setDimB(config.dim_b ? Number(config.dim_b) : undefined);
            setDimC(config.dim_c ? Number(config.dim_c) : undefined);

            setSelectedMaterials(mappedItems);
            setConfigMaterials(mappedItems);

            toast({
                title: "Configuration Loaded",
                description: `Configuration "${config.config_name || 'Unnamed'}" loaded successfully.`,
            });
        } catch (error) {
            console.error("Failed to load specific config", error);
            toast({
                title: "Error",
                description: "Failed to load the selected configuration.",
                variant: "destructive"
            });
        }
    };



    const deleteConfig = async (configId: number) => {
        if (!confirm("Are you sure you want to delete this configuration?")) return;
        try {
            const res = await apiFetch(`/api/step11-products/config/${configId}`, {
                method: "DELETE"
            });
            if (res.ok) {
                setPreviousConfigs(prev => prev.filter(c => c.product.id !== configId));
                toast({
                    title: "Deleted",
                    description: "Configuration deleted successfully.",
                });
            } else {
                throw new Error("Failed to delete");
            }
        } catch (error) {
            console.error("Delete failed", error);
            toast({
                title: "Error",
                description: "Failed to delete configuration.",
                variant: "destructive"
            });
        }
    };

    const prevStep = () => setStep(step - 1);

    const toggleMaterial = (material: Material) => {
        setSelectedMaterials((prev) =>
            prev.find((m) => m.id === material.id)
                ? prev.filter((m) => m.id !== material.id)
                : [...prev, material]
        );
    };

    const updateConfig = (id: string, field: keyof SelectedMaterial, value: any) => {
        setConfigMaterials((prev) =>
            prev.map((m) => {
                if (m.id === id) {
                    const updated = { ...m, [field]: value };

                    // Trigger recalculation logic if any relevant field changes
                    if (field === "baseQty" || field === "wastagePct" || field === "supplyRate" || field === "installRate") {
                        // We'll let the derive calculation handle the actual amounts for preview
                    }

                    // Legacy total calculation for simple fields
                    if (field === "supplyRate" || field === "installRate") {
                        updated.rate = (Number(updated.supplyRate) || 0) + (Number(updated.installRate) || 0);
                    }

                    return updated;
                }
                return m;
            })
        );
    };

    // Calculate derived results for preview on Step 3
    const boqResults = useMemo(() => computeBoq(
        {
            requiredUnitType,
            baseRequiredQty,
            wastagePctDefault: wastagePctDefault
        },
        configMaterials,
        baseRequiredQty // For ManageProduct preview, we scale to the basis qty itself
    ), [requiredUnitType, baseRequiredQty, wastagePctDefault, configMaterials]);

    const totalCost = boqResults.grandTotal;

    return (
        <Layout>
            <div className="container mx-auto py-8 px-4">
                <Card className="max-w-6xl mx-auto shadow-xl border-none">
                    <CardHeader className="bg-primary/5 border-b pb-6">
                        <CardTitle className="flex items-center justify-between">
                            <span className="text-3xl font-extrabold tracking-tight">Manage Product</span>
                            {selectedProduct && (
                                <Badge variant="outline" className="text-sm font-semibold py-1.5 px-4 bg-primary/10 border-primary/20">
                                    {selectedProduct.name}
                                </Badge>
                            )}
                        </CardTitle>
                        {/* Progress Bar Removed */}
                    </CardHeader>

                    <CardContent className="p-8">
                        {/* Step 1: Product Selection */}
                        {step === 1 && (
                            <div className="space-y-8">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <h2 className="text-2xl font-bold">1. Select Base Product</h2>
                                    <div className="relative w-full md:w-80">
                                        <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                                        <Input placeholder="Search by name..." className="pl-10 h-10" />
                                    </div>
                                </div>

                                {loadingProducts ? (
                                    <div className="flex flex-col items-center justify-center p-20 space-y-4">
                                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                        <p className="text-muted-foreground font-medium">Loading products...</p>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border shadow-sm overflow-hidden bg-white">
                                        <Table>
                                            <TableHeader className="bg-muted/30">
                                                <TableRow>
                                                    <TableHead className="w-[60px]"></TableHead>
                                                    <TableHead className="font-bold">Product Name</TableHead>
                                                    <TableHead className="font-bold">Created Date</TableHead>

                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {productsData?.map((product) => (
                                                    <TableRow
                                                        key={product.id}
                                                        className={`hover:bg-muted/20 transition-colors cursor-pointer ${selectedProduct?.id === product.id ? "bg-primary/5 hover:bg-primary/10" : ""
                                                            }`}
                                                        onClick={() => {
                                                            setSelectedProduct(product);
                                                            // Reset state first to ensure "nothing from previous loads"
                                                            resetSelection();
                                                        }}
                                                    >
                                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                                            <Checkbox
                                                                checked={selectedProduct?.id === product.id}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked) {
                                                                        setSelectedProduct(product);
                                                                        // Reset state first to ensure "nothing from previous loads"
                                                                        resetSelection();
                                                                    } else {
                                                                        setSelectedProduct(null);
                                                                    }
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="font-semibold text-base">{product.name}</TableCell>
                                                        <TableCell className="text-muted-foreground">
                                                            {product.created_at ? new Date(product.created_at).toLocaleDateString() : 'N/A'}
                                                        </TableCell>

                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}

                                {selectedProduct && (
                                    <div className="space-y-3 p-6 bg-primary/5 rounded-xl border border-primary/20">
                                        <div className="flex flex-col md:flex-row gap-6">
                                            {previousConfigs.length > 0 && (
                                                <div className="flex-1 space-y-3">
                                                    <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Select Existing Configuration</label>
                                                    <Select
                                                        onValueChange={(val) => {
                                                            if (val === "none") {
                                                                resetSelection();
                                                                return;
                                                            }
                                                            const config = previousConfigs.find(c => c.product.id.toString() === val);
                                                            if (config) loadSpecificConfig(config);
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-12 bg-white border-primary/30 shadow-sm">
                                                            <SelectValue placeholder="Choose a previous config..." />
                                                        </SelectTrigger>
                                                        <SelectContent className="max-h-[300px]">
                                                            <SelectItem value="none" className="text-muted-foreground italic border-b border-muted/20 pb-2">
                                                                -- Clear Selection / Start Fresh --
                                                            </SelectItem>
                                                            {previousConfigs.map((configData) => (
                                                                <SelectItem key={configData.product.id} value={configData.product.id.toString()}>
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold">{configData.product.config_name || "Unnamed Configuration"}</span>
                                                                        <span className="text-[10px] text-muted-foreground">Saved: {new Date(configData.product.created_at).toLocaleDateString()}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                            <div className="flex-1 space-y-3">
                                                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                                                    {previousConfigs.length > 0 ? "Or Create New Name" : "Configuration Name (Optional)"}
                                                </label>
                                                <Input
                                                    value={configName}
                                                    onChange={(e) => setConfigName(e.target.value)}
                                                    placeholder="Enter a name (e.g., 'Standard', 'Premium')"
                                                    className="h-12 bg-white border-primary/30 shadow-sm"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {previousConfigs.length > 0
                                                ? "Select a previous configuration to load its data, or type a new name to save a distinct version."
                                                : "Give this configuration a name to distinguish it from other configurations of the same product."}
                                        </p>

                                        {/* Previous Configurations List */}
                                        <div className="mt-8 space-y-4">
                                            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                                Previous Configurations
                                                {isLoadingConfigs && <Loader2 className="h-4 w-4 animate-spin" />}
                                            </h3>

                                            {previousConfigs.length > 0 ? (
                                                <div className="rounded-xl border bg-white shadow-sm max-h-[250px] overflow-y-auto">
                                                    <div className="divide-y">
                                                        {previousConfigs.map((configData) => (
                                                            <div
                                                                key={configData.product.id}
                                                                className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors group"
                                                            >
                                                                <div className="space-y-1">
                                                                    <div className="font-bold text-sm">{configData.product.config_name || "Unnamed Config"}</div>
                                                                    <div className="text-[10px] text-muted-foreground">
                                                                        Saved: {new Date(configData.product.created_at).toLocaleString()} | Materials: {configData.items?.length || 0}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => loadSpecificConfig(configData)}
                                                                        className="h-8 text-primary hover:text-primary hover:bg-primary/10"
                                                                    >
                                                                        <Edit className="h-4 w-4 mr-1" /> Load
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => deleteConfig(configData.product.id)}
                                                                        className="h-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                                    >
                                                                        <span className="text-xs font-bold">🗑 Delete</span>
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                !isLoadingConfigs && (
                                                    <div className="p-8 text-center border rounded-xl bg-muted/5 italic text-muted-foreground text-sm">
                                                        No previously saved configurations found for this product.
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end pt-4">
                                    <Button size="lg" onClick={nextStep} disabled={!selectedProduct} className="px-8">
                                        Next Step <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Category/Subcategory & Material Selection */}
                        {step === 2 && (
                            <div className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Category</label>
                                        <Select
                                            value={selectedCategory}
                                            onValueChange={(val) => {
                                                setSelectedCategory(val);
                                                setSelectedSubcategory(ALL_TOKEN);
                                            }}
                                        >
                                            <SelectTrigger className="h-11">
                                                <SelectValue placeholder="All Categories" />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[300px] overflow-y-auto">
                                                <SelectItem value={ALL_TOKEN}>All Categories</SelectItem>
                                                {categoriesData?.map((cat) => (
                                                    <SelectItem key={cat} value={cat}>
                                                        {cat}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Subcategory</label>
                                        <Select
                                            value={selectedSubcategory}
                                            onValueChange={setSelectedSubcategory}
                                            disabled={selectedCategory === ALL_TOKEN}
                                        >
                                            <SelectTrigger className="h-11">
                                                <SelectValue placeholder="All Subcategories" />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[300px] overflow-y-auto">
                                                <SelectItem value={ALL_TOKEN}>All Subcategories</SelectItem>
                                                {subcategoriesData?.map((sub) => (
                                                    <SelectItem key={sub} value={sub}>
                                                        {sub}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-bold">2. Select Materials/Items</h3>
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input placeholder="Search materials by name or code..." className="pl-10 h-9" value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)} />
                                            </div>
                                            <span className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                                                {filteredMaterials.length} results found
                                            </span>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border shadow-sm max-h-[450px] overflow-y-auto bg-white">
                                        <Table>
                                            <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10 shadow-sm">
                                                <TableRow>
                                                    <TableHead className="w-[60px]"></TableHead>
                                                    <TableHead className="font-bold">Material Name</TableHead>
                                                    <TableHead className="font-bold">Unit</TableHead>
                                                    <TableHead className="font-bold">Shop</TableHead>
                                                    <TableHead className="text-right font-bold pr-6">Default Rate</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {loadingMaterials ? (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="text-center py-20">
                                                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                                                        </TableCell>
                                                    </TableRow>
                                                ) : filteredMaterials.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic">
                                                            No materials found matching the current filters.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    filteredMaterials.map((material) => (
                                                        <TableRow
                                                            key={material.id}
                                                            className={`hover:bg-muted/20 transition-colors cursor-pointer ${selectedMaterials.some(m => m.id === material.id) ? "bg-primary/5 hover:bg-primary/10" : ""
                                                                }`}
                                                            onClick={() => toggleMaterial(material)}
                                                        >
                                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                                <Checkbox
                                                                    checked={selectedMaterials.some(m => m.id === material.id)}
                                                                    onCheckedChange={() => toggleMaterial(material)}
                                                                />
                                                            </TableCell>
                                                            <TableCell className="font-medium">
                                                                {material.name}
                                                                <div className="text-xs text-muted-foreground">Code: {material.code || material.id}</div>
                                                            </TableCell>
                                                            <TableCell>{material.unit || "-"}</TableCell>
                                                            <TableCell>{material.shop_name || "-"}</TableCell>
                                                            <TableCell className="text-right pr-6 font-semibold">
                                                                {material.rate ? `₹${material.rate.toLocaleString()}` : "-"}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 mt-4 border-t">
                                    <Button variant="outline" size="lg" onClick={prevStep} className="w-full sm:w-auto px-8">
                                        <ArrowLeft className="mr-2 h-5 w-5" /> Back
                                    </Button>
                                    <div className="flex items-center gap-6 w-full sm:w-auto">
                                        <p className="text-sm font-bold text-muted-foreground whitespace-nowrap">
                                            {selectedMaterials.length} SELECTED
                                        </p>
                                        <Button size="lg" onClick={nextStep} disabled={selectedMaterials.length === 0} className="w-full sm:w-auto px-10">
                                            Review Selection <ArrowRight className="ml-2 h-5 w-5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Step 9 Table (Configuration) */}
                        {step === 3 && (
                            <div className="space-y-8">
                                <div className="space-y-6">
                                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-r from-muted/50 to-muted/20 p-6 rounded-2xl border">
                                        <div>
                                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Configuration For</h3>
                                            <p className="text-2xl font-extrabold">{selectedProduct?.name}</p>
                                        </div>
                                        <div className="text-center md:text-right">
                                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Current Total</h3>
                                            <p className="text-4xl font-extrabold text-primary">₹{totalCost.toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {/* Config Basis Fields */}
                                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 p-6 bg-white rounded-xl border shadow-sm items-end">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-muted-foreground">Unit Type</label>
                                            <Select value={requiredUnitType} onValueChange={(val: UnitType) => setRequiredUnitType(val)}>
                                                <SelectTrigger className="font-bold">
                                                    <SelectValue placeholder="Select unit" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Sqft">Sqft</SelectItem>
                                                    <SelectItem value="Sqmt">Sqmt</SelectItem>
                                                    <SelectItem value="Length">Length</SelectItem>
                                                    <SelectItem value="LS">LS</SelectItem>
                                                    <SelectItem value="RFT">RFT</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-muted-foreground">Dim A</label>
                                            <Input
                                                type="number"
                                                value={dimA ?? ""}
                                                onChange={(e) => setDimA(e.target.value ? Number(e.target.value) : undefined)}
                                                placeholder="A"
                                                className="font-bold"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-muted-foreground">Dim B</label>
                                            <Input
                                                type="number"
                                                value={dimB ?? ""}
                                                onChange={(e) => setDimB(e.target.value ? Number(e.target.value) : undefined)}
                                                placeholder="B"
                                                className="font-bold"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-muted-foreground">Dim C</label>
                                            <Input
                                                type="number"
                                                value={dimC ?? ""}
                                                onChange={(e) => setDimC(e.target.value ? Number(e.target.value) : undefined)}
                                                placeholder="C"
                                                className="font-bold"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-muted-foreground">Basis Qty</label>
                                            <Input
                                                type="number"
                                                value={baseRequiredQty}
                                                onChange={(e) => setBaseRequiredQty(Number(e.target.value) || 0)}
                                                className="font-bold bg-muted/30"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-muted-foreground">Wastage %</label>
                                            <Input
                                                type="number"
                                                value={wastagePctDefault}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value) || 0;
                                                    setWastagePctDefault(val);
                                                    // Apply to all rows where the Selection checkbox is checked
                                                    setConfigMaterials(prev => prev.map(m =>
                                                        m.applyWastage ? { ...m, wastagePct: val } : m
                                                    ));
                                                }}
                                                className="font-bold border-orange-200"
                                            />
                                        </div>
                                    </div>

                                    <div className="rounded-xl border shadow-sm overflow-hidden bg-white">
                                        <Table>
                                            <TableHeader className="bg-muted/30">
                                                <TableRow>
                                                    <TableHead className="w-[40px] font-bold">Sl</TableHead>
                                                    <TableHead className="font-bold py-4">Item</TableHead>
                                                    <TableHead className="w-[100px] font-bold">Shop</TableHead>
                                                    <TableHead className="w-[120px] font-bold">Description</TableHead>
                                                    <TableHead className="w-[60px] font-bold">Unit</TableHead>
                                                    <TableHead className="w-[80px] font-bold">Qty</TableHead>
                                                    <TableHead className="w-[100px] font-bold">Rate</TableHead>
                                                    <TableHead className="w-[110px] font-bold">Base Amount</TableHead>
                                                    <TableHead className="w-[70px] font-bold">
                                                        <div className="flex flex-col items-center gap-1">
                                                            <span className="text-[10px]">Selection</span>
                                                            <Checkbox
                                                                checked={configMaterials.length > 0 && configMaterials.every(m => m.applyWastage)}
                                                                onCheckedChange={(checked) => {
                                                                    setConfigMaterials(prev => prev.map(m => ({ ...m, applyWastage: !!checked })));
                                                                }}
                                                            />
                                                            <span className="text-[9px] font-normal">All</span>
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="w-[80px] font-bold">Wastage %</TableHead>
                                                    <TableHead className="w-[80px] font-bold">Wastage Qty</TableHead>
                                                    <TableHead className="w-[90px] font-bold">Total Qty</TableHead>
                                                    <TableHead className="w-[90px] font-bold">Final Amount</TableHead>
                                                    <TableHead className="w-[90px] font-bold">Per {requiredUnitType} Qty</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {boqResults.computed.map((m, idx) => {
                                                    const baseAmt = m.baseQty * (m.supplyRate + m.installRate);
                                                    return (
                                                        <TableRow key={m.id} className="hover:bg-muted/5">
                                                            <TableCell className="text-center font-medium text-[10px]">{idx + 1}</TableCell>
                                                            <TableCell className="font-semibold text-[10px]">{m.name}</TableCell>
                                                            <TableCell className="text-[10px]">{m.shop_name || "N/A"}</TableCell>
                                                            <TableCell>
                                                                <Input
                                                                    value={m.location}
                                                                    onChange={(e) => updateConfig(m.id!, "location", e.target.value)}
                                                                    className="h-8 border-muted text-[10px] px-2"
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-[10px] font-medium">{m.unit}</TableCell>
                                                            <TableCell>
                                                                <Input
                                                                    type="number"
                                                                    value={m.baseQty}
                                                                    onChange={(e) => updateConfig(m.id!, "baseQty", Number(e.target.value))}
                                                                    className="h-8 border-muted text-[10px] px-2 font-bold w-full"
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-[10px] font-bold">
                                                                ₹{(m.supplyRate + m.installRate).toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-[10px] font-bold">
                                                                ₹{baseAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Checkbox
                                                                    checked={m.applyWastage}
                                                                    onCheckedChange={(checked) => updateConfig(m.id!, "applyWastage", checked)}
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                <Input
                                                                    type="number"
                                                                    value={m.wastagePct ?? ""}
                                                                    onChange={(e) => updateConfig(m.id!, "wastagePct", e.target.value ? Number(e.target.value) : undefined)}
                                                                    placeholder="Global"
                                                                    className="h-8 border-orange-200 text-[10px] px-2 font-bold w-full"
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-[10px] font-bold text-orange-600">
                                                                {m.wastageQty.toFixed(2)}
                                                            </TableCell>
                                                            <TableCell className="text-[10px] font-bold">
                                                                {m.roundOffQty.toFixed(2)}
                                                            </TableCell>
                                                            <TableCell className="text-[10px] font-bold text-blue-600">
                                                                ₹{m.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </TableCell>
                                                            <TableCell className="text-[10px] font-bold text-primary">
                                                                {m.perUnitQty.toFixed(4)}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                                {/* Total row like Excel */}
                                                <TableRow className="bg-muted/20 font-black">
                                                    <TableCell colSpan={8} className="text-right py-3 pr-4">Total (Incl. Wastage)</TableCell>
                                                    <TableCell className="text-[11px] text-primary">
                                                        ₹{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </TableCell>
                                                    <TableCell colSpan={5}></TableCell>
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    </div>

                                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 mt-4 border-t">
                                        <div className="flex items-center gap-3 w-full sm:w-auto">
                                            <Button variant="outline" size="lg" onClick={prevStep} className="w-full sm:w-auto px-8">
                                                <ArrowLeft className="mr-2 h-5 w-5" /> Back to Selection
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="lg"
                                                onClick={() => {
                                                    // Reset everything and go to Step 1
                                                    setSelectedProduct(null);
                                                    setConfigName("");
                                                    setSelectedCategory("");
                                                    setSelectedSubcategory("");
                                                    setSelectedMaterials([]);
                                                    setConfigMaterials([]);
                                                    setRequiredUnitType("Sqft");
                                                    setBaseRequiredQty(100);
                                                    setWastagePctDefault(5);
                                                    setDimA(undefined);
                                                    setDimB(undefined);
                                                    setDimC(undefined);
                                                    setStep(1);
                                                }}
                                                className="w-full sm:w-auto px-8 border-blue-400 text-blue-700 hover:bg-blue-50"
                                            >
                                                + Add Another Product
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-3 w-full sm:w-auto">
                                            <Button
                                                size="lg"
                                                onClick={handleSaveInPlace}
                                                disabled={isSaving || configMaterials.length === 0}
                                                className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold px-10 transition-all shadow-lg"
                                            >
                                                {isSaving ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Saving...
                                                    </>
                                                ) : (
                                                    "Save Configuration"
                                                )}
                                            </Button>
                                            <Button size="lg" onClick={nextStep} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white font-bold px-12 transition-all">
                                                Continue to Review <ArrowRight className="ml-2 h-5 w-5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Step 11 Summary (Final Review) - REDESIGNED */}
                        {step === 4 && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                {/* Header Removed */}

                                <div className="grid grid-cols-2 gap-8 py-4 px-6 bg-muted/30 rounded-xl border border-dashed border-muted-foreground/30">
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Product Configuration For</p>
                                        <p className="text-xl font-bold uppercase">{selectedProduct?.name}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Category / Subcategory</p>
                                        <p className="text-lg font-bold">{selectedCategory} <span className="text-muted-foreground mx-1">/</span> {selectedSubcategory}</p>
                                    </div>
                                </div>

                                <div className="overflow-x-auto border-2 border-black rounded-sm shadow-xl">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-white text-black text-[11px] font-black uppercase tracking-widest border-b border-black">
                                                <th rowSpan={2} className="border border-black p-3 text-center w-[50px]">S.No</th>
                                                <th rowSpan={2} className="border border-black p-3 text-left">Item</th>
                                                <th rowSpan={2} className="border border-black p-3 text-center w-[120px]">Location</th>
                                                <th rowSpan={2} className="border border-black p-3 text-left">Description</th>
                                                <th rowSpan={2} className="border border-black p-3 text-center w-[80px]">Unit</th>
                                                <th rowSpan={2} className="border border-black p-3 text-center w-[80px]">Qty</th>
                                                <th colSpan={2} className="border border-black p-3 text-center border-b-0">Rate (INR)</th>
                                                <th colSpan={2} className="border border-black p-3 text-center border-b-0">Amount (INR)</th>
                                            </tr>
                                            <tr className="bg-white text-black text-[9px] font-black uppercase tracking-widest border-t border-black">
                                                <th className="border border-black p-2 text-right w-[100px]">Supply</th>
                                                <th className="border border-black p-2 text-right w-[100px]">Installation</th>
                                                <th className="border border-black p-2 text-right w-[110px]">Supply</th>
                                                <th className="border border-black p-2 text-right w-[110px]">Installation</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white">
                                            {/* Single Consolidated Product Row */}
                                            <tr className="text-[12px] border-b border-black/10 hover:bg-muted/10 transition-colors">
                                                <td className="border-r border-black p-3 text-center font-bold">1</td>
                                                <td className="border-r border-black p-3 font-black text-xs uppercase">
                                                    {selectedProduct?.name}
                                                </td>
                                                <td className="border-r border-black p-3 text-center italic">Main Area</td>
                                                <td className="border-r border-black p-3 text-[10px] text-muted-foreground leading-tight">
                                                    Consolidated configuration for {selectedProduct?.name}
                                                </td>
                                                <td className="border-r border-black p-3 text-center font-bold text-xs">{requiredUnitType}</td>
                                                <td className="border-r border-black p-3 text-center font-black">{baseRequiredQty}</td>
                                                <td className="border-r border-black p-3 text-right font-bold">
                                                    ₹{boqResults.totalSupply.toLocaleString()}
                                                </td>
                                                <td className="border-r border-black p-3 text-right font-bold">
                                                    ₹{boqResults.totalInstall.toLocaleString()}
                                                </td>
                                                <td className="border-r border-black p-3 text-right font-black text-primary">
                                                    ₹{boqResults.totalSupply.toLocaleString()}
                                                </td>
                                                <td className="border-black p-3 text-right font-black text-primary">
                                                    ₹{boqResults.totalInstall.toLocaleString()}
                                                </td>
                                            </tr>
                                        </tbody>
                                        <tfoot className="bg-black/5">
                                            <tr className="border-t-2 border-black font-black">
                                                <td colSpan={8} className="p-4 text-right uppercase tracking-tighter">Grand Total Amount (INR)</td>
                                                <td colSpan={2} className="p-4 text-right pr-6 text-xl text-primary bg-primary/5 border-l border-black/10">₹{totalCost.toLocaleString()}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {/* Remarks & Signature Removed */}

                                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-12 mt-8 border-t border-black/10">
                                    <Button variant="outline" onClick={prevStep} className="w-full sm:w-auto px-6 font-bold uppercase tracking-wide" disabled={isSaving}>
                                        <ArrowLeft className="mr-2 h-4 w-4" /> Back
                                    </Button>
                                    <Button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 uppercase tracking-wide transition-all shadow-lg hover:scale-105"
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Finalizing...
                                            </>
                                        ) : (
                                            "Add to Create BOQ"
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </Layout>
    );
}
