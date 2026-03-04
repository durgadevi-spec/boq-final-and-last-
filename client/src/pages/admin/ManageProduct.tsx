import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Plus, ArrowRight, ArrowLeft, Trash2, Edit, Save, Check, XCircle, Layers } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/Layout";
import { computeBoq, UnitType } from "@/lib/boqCalc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Product = { id: string; name: string; subcategory: string; created_at: string; created_by?: string };
type Material = { id: string; name: string; unit: string; rate: number; category: string; subcategory: string; description?: string; shop_name?: string; code?: string; technicalspecification?: string };
type SelectedMaterial = Material & { qty: number; baseQty: number; wastagePct?: number; amount: number; rate: number; supplyRate: number; installRate: number; location: string; applyWastage: boolean };

const ALL = "__ALL__";

export default function ManageProduct() {
    const [step, setStep] = useState(1);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [configName, setConfigName] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(ALL);
    const [selectedSubcategory, setSelectedSubcategory] = useState(ALL);
    const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([]);
    const [configMaterials, setConfigMaterials] = useState<SelectedMaterial[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [previousConfigs, setPreviousConfigs] = useState<any[]>([]);
    const [rejectedConfigs, setRejectedConfigs] = useState<any[]>([]);
    const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
    const [productSearch, setProductSearch] = useState("");
    const [materialSearch, setMaterialSearch] = useState("");
    const [requiredUnitType, setRequiredUnitType] = useState<UnitType>("Sqft");
    const [baseRequiredQty, setBaseRequiredQty] = useState(100);
    const [wastagePctDefault, setWastagePctDefault] = useState(5);
    const [dimA, setDimA] = useState<number | undefined>();
    const [dimB, setDimB] = useState<number | undefined>();
    const [dimC, setDimC] = useState<number | undefined>();
    const [productDescription, setProductDescription] = useState("");
    const [compactMode, setCompactMode] = useState(false);
    const [step3MaterialSearch, setStep3MaterialSearch] = useState("");
    const { toast } = useToast();

    const resetSelection = () => {
        setConfigName(""); setSelectedCategory(""); setSelectedSubcategory("");
        setSelectedMaterials([]); setConfigMaterials([]);
        setRequiredUnitType("Sqft"); setBaseRequiredQty(100); setWastagePctDefault(5);
        setDimA(undefined); setDimB(undefined); setDimC(undefined); setProductDescription("");
    };

    const fetchPreviousConfigs = async (productId: string) => {
        setIsLoadingConfigs(true);
        try {
            const [pRes, aRes] = await Promise.all([
                apiFetch(`/api/step11-products/${productId}`),
                apiFetch(`/api/product-approvals`)
            ]);

            if (pRes.ok) {
                const d = await pRes.json();
                setPreviousConfigs(d.configurations || []);
            }

            if (aRes.ok) {
                const d = await aRes.json();
                const rejected = (d.approvals || []).filter((a: any) => a.product_id === productId && a.status === 'rejected');
                setRejectedConfigs(rejected);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingConfigs(false);
        }
    };

    useEffect(() => {
        if (dimA !== undefined || dimB !== undefined || dimC !== undefined)
            setBaseRequiredQty((Number(dimA) || 1) * (Number(dimB) || 1) * (Number(dimC) || 1));
    }, [dimA, dimB, dimC]);

    useEffect(() => {
        if (selectedProduct) fetchPreviousConfigs(selectedProduct.id);
        else setPreviousConfigs([]);
    }, [selectedProduct?.id]);

    const { data: productsData, isLoading: loadingProducts } = useQuery({
        queryKey: ["/api/products"],
        queryFn: async () => {
            const res = await apiFetch("/api/products");
            if (!res.ok) throw new Error("Failed to fetch products");
            const d = await res.json();
            return ((d.products || []) as Product[]).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        },
    });

    const filteredProducts = useMemo(() => {
        if (!productsData) return [];
        if (!productSearch) return productsData;
        const q = productSearch.toLowerCase();
        return productsData.filter(p => (p.name || "").toLowerCase().includes(q));
    }, [productsData, productSearch]);

    const { data: categoriesData } = useQuery({
        queryKey: ["/api/material-categories"],
        queryFn: async () => {
            const res = await apiFetch("/api/material-categories");
            if (!res.ok) throw new Error();
            const d = await res.json();
            return ((d.categories || []) as string[]).sort((a, b) => a.localeCompare(b));
        },
        enabled: step === 2,
    });

    const { data: subcategoriesData } = useQuery({
        queryKey: ["/api/material-subcategories", selectedCategory],
        queryFn: async () => {
            const res = await apiFetch(`/api/material-subcategories/${selectedCategory}`);
            if (!res.ok) throw new Error();
            const d = await res.json();
            return ((d.subcategories || []) as string[]).sort((a, b) => a.localeCompare(b));
        },
        enabled: step === 2 && !!selectedCategory && selectedCategory !== ALL,
    });

    const { data: materialsData, isLoading: loadingMaterials } = useQuery({
        queryKey: ["/api/materials"],
        queryFn: async () => {
            const res = await apiFetch("/api/materials");
            if (!res.ok) throw new Error();
            const d = await res.json();
            return ((d.materials || []) as Material[]).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        },
        enabled: step === 2,
    });

    const uniqueMaterials = Array.from(new Map((materialsData || []).map(m => [(m.id || Math.random()).toString(), m])).values());

    // Units from materials + defaults
    const availableUnitTypes = useMemo(() => {
        const defaults = ["Sqft", "Sqmt", "Length", "LS", "RFT", "RMT"];
        const materialUnits = (materialsData || []).map(m => m.unit?.trim()).filter(Boolean) as string[];

        const finalUnits = [...defaults];
        materialUnits.forEach(u => {
            const lowerU = u.toLowerCase();
            // Treat 'sft' and 'sqft' variant identically for deduplication
            const isSqftVariant = lowerU === 'sft' || lowerU === 'sqft';
            const hasSqftVariant = finalUnits.some(fu => {
                const lfu = fu.toLowerCase();
                return lfu === 'sft' || lfu === 'sqft';
            });
            if (isSqftVariant && hasSqftVariant) return;

            // General case-insensitive check
            const exists = finalUnits.some(fu => fu.toLowerCase() === lowerU);
            if (!exists) finalUnits.push(u);
        });

        return finalUnits.sort();
    }, [materialsData]);

    const filteredMaterials = uniqueMaterials.filter(m => {
        if (materialSearch) {
            const q = materialSearch.toLowerCase();
            if (!(m.name || "").toLowerCase().includes(q) && !(m.code || "").toLowerCase().includes(q)) return false;
        }
        const inc = (field: string | undefined | null, val: string) => {
            if (!val || val === ALL) return true;
            if (!field) return false;
            if (field === val) return true;
            return field.split(",").map(s => s.trim().toLowerCase()).includes(val.trim().toLowerCase());
        };
        return inc(m.category, selectedCategory) && inc(m.subcategory, selectedSubcategory);
    });

    const nextStep = () => {
        if (step === 1 && !selectedProduct) { toast({ title: "Product Required", description: "Please select a product.", variant: "destructive" }); return; }
        if (step === 2 && selectedMaterials.length === 0) { toast({ title: "Selection Required", description: "Select at least one material.", variant: "destructive" }); return; }
        if (step === 2) {
            const existingMap = new Map(configMaterials.map(m => [m.id, m]));
            setConfigMaterials(selectedMaterials.map(m => {
                const ex = existingMap.get(m.id);
                if (ex) return ex;
                const rate = Number(m.rate) || 0;
                return { ...m, qty: 1, baseQty: 1, wastagePct: undefined, amount: rate, rate, supplyRate: rate, installRate: 0, location: m.technicalspecification || m.name || "", description: m.technicalspecification || m.name || "", applyWastage: true };
            }));
        }
        setStep(step + 1);
    };

    const buildPayloadItems = () => boqResults.computed.map(m => ({
        materialId: m.id, materialName: m.name, unit: m.unit, qty: m.roundOffQty, rate: m.rate,
        supplyRate: m.supplyRate, installRate: m.installRate, location: m.location, amount: m.lineTotal,
        baseQty: m.baseQty, wastagePct: m.wastagePct ?? null, applyWastage: m.applyWastage, shop_name: m.shop_name
    }));

    const handleSave = async () => {
        if (!selectedProduct) return;
        setIsSaving(true);
        try {
            const configN = configName || `${selectedProduct.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const res = await apiFetch("/api/step11-products", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId: selectedProduct.id, productName: selectedProduct.name, configName: configN, categoryId: selectedCategory, subcategoryId: selectedSubcategory, totalCost, description: productDescription, requiredUnitType, baseRequiredQty, wastagePctDefault, items: buildPayloadItems() }),
            });
            if (!res.ok) throw new Error("Failed to save");
            toast({ title: "Success", description: "Product configuration saved permanently." });
            setStep(1); setSelectedProduct(null); setConfigName(""); setSelectedMaterials([]); setConfigMaterials([]);
        } catch (e: any) {
            toast({ title: "Error", description: e.message || "Failed to save", variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleSaveInPlace = async () => {
        if (!selectedProduct) return;
        setIsSaving(true);
        try {
            const configN = configName || `${selectedProduct.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const res = await apiFetch("/api/product-approvals", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId: selectedProduct.id, productName: selectedProduct.name, configName: configN, categoryId: selectedCategory, subcategoryId: selectedSubcategory, totalCost, requiredUnitType, baseRequiredQty, wastagePctDefault, dimA, dimB, dimC, description: productDescription, items: buildPayloadItems() }),
            });
            if (!res.ok) throw new Error("Failed to submit");
            toast({ title: "Submitted for Approval", description: `"${selectedProduct.name}" submitted for approval.` });
        } catch (e: any) {
            toast({ title: "Error", description: e.message || "Failed to submit", variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const handleSaveDraft = async () => {
        if (!selectedProduct) return;
        setIsSaving(true);
        try {
            const payload = {
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                configName: configName || "Latest Draft",
                categoryId: selectedCategory,
                subcategoryId: selectedSubcategory,
                totalCost,
                requiredUnitType,
                baseRequiredQty,
                wastagePctDefault,
                dimA,
                dimB,
                dimC,
                description: productDescription,
                items: buildPayloadItems()
            };
            const res = await apiFetch("/api/product-step3-config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Failed to save draft");
            toast({ title: "Draft Saved", description: "Your configuration progress has been saved." });
        } catch (e: any) {
            toast({ title: "Error", description: e.message || "Failed to save draft", variant: "destructive" });
        } finally { setIsSaving(false); }
    };

    const mapItems = (items: any[]) => items.map((item: any) => ({
        id: item.material_id, name: item.material_name, unit: item.unit,
        qty: Number(item.qty || 0), baseQty: Number(item.base_qty ?? item.qty ?? 0),
        wastagePct: (item.wastage_pct != null) ? Number(item.wastage_pct) : undefined,
        rate: Number(item.rate), supplyRate: Number(item.supply_rate || item.rate || 0),
        install_rate: Number(item.install_rate || 0),
        installRate: Number(item.install_rate || 0),
        location: item.location || "Main Area",
        amount: Number(item.amount),
        rejection_reason: item.rejection_reason || null,
        applyWastage: item.apply_wastage !== undefined ? Boolean(item.apply_wastage) : (item.applyWastage !== undefined ? Boolean(item.applyWastage) : true),
        shop_name: item.shop_name, category: "", subcategory: ""
    }));

    const applyConfig = (config: any, items: any[], src: string) => {
        setConfigName(config.config_name || ""); setSelectedCategory(config.category_id || ""); setSelectedSubcategory(config.subcategory_id || "");
        setRequiredUnitType(config.required_unit_type || "Sqft"); setBaseRequiredQty(Number(config.base_required_qty || 100));
        setWastagePctDefault(Number(config.wastage_pct_default || 0));
        setDimA(config.dim_a ? Number(config.dim_a) : undefined); setDimB(config.dim_b ? Number(config.dim_b) : undefined); setDimC(config.dim_c ? Number(config.dim_c) : undefined);
        setProductDescription(config.description || "");
        const mapped = mapItems(items);
        setSelectedMaterials(mapped); setConfigMaterials(mapped);
        // Store rejection reason in a temporary way if needed, or just rely on the config object
        toast({ title: "Configuration Loaded", description: src });
    };

    const loadExistingConfig = async (product: Product) => {
        try {
            const s3 = await apiFetch(`/api/product-step3-config/${product.id}`);
            if (s3.ok) {
                const d = await s3.json();
                if (d.items?.length > 0) { applyConfig(d.config, d.items, `Loaded Step 3 config for ${product.name}.`); return; }
            }
            const res = await apiFetch(`/api/step11-products/${product.id}`);
            if (res.ok) {
                const d = await res.json();
                if (d.configurations?.length > 0) {
                    const latest = d.configurations[0];
                    applyConfig(latest.product, latest.items, `Loaded config "${latest.product.config_name || 'Unnamed'}" for ${product.name}.`);
                }
            }
        } catch (e) { console.error(e); }
    };

    const loadSpecificConfig = async (configData: any) => {
        try { applyConfig(configData.product, configData.items, `Config "${configData.product.config_name || 'Unnamed'}" loaded.`); }
        catch (e) { console.error(e); toast({ title: "Error", description: "Failed to load config.", variant: "destructive" }); }
    };

    const loadRejectedConfig = async (config: any) => {
        try {
            setIsLoadingConfigs(true);
            const res = await apiFetch(`/api/product-approvals/${config.id}`);
            if (res.ok) {
                const d = await res.json();
                applyConfig(d.approval, d.items, `Rejected config "${config.config_name}" loaded for editing.`);
            } else {
                throw new Error("Failed to load details");
            }
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Failed to load rejected configuration.", variant: "destructive" });
        } finally {
            setIsLoadingConfigs(false);
        }
    };

    const deleteConfig = async (configId: number) => {
        if (!confirm("Delete this configuration?")) return;
        try {
            const res = await apiFetch(`/api/step11-products/config/${configId}`, { method: "DELETE" });
            if (res.ok) { setPreviousConfigs(prev => prev.filter(c => c.product.id !== configId)); toast({ title: "Deleted", description: "Configuration deleted." }); }
            else throw new Error();
        } catch { toast({ title: "Error", description: "Failed to delete.", variant: "destructive" }); }
    };

    const toggleMaterial = (m: Material) =>
        setSelectedMaterials(prev => prev.find(x => x.id === m.id) ? prev.filter(x => x.id !== m.id) : [...prev, m]);

    const updateConfig = (id: string, field: keyof SelectedMaterial, value: any) =>
        setConfigMaterials(prev => prev.map(m => {
            if (m.id !== id) return m;
            const u = { ...m, [field]: value };
            if (field === "supplyRate" || field === "installRate")
                u.rate = (Number(u.supplyRate) || 0) + (Number(u.installRate) || 0);
            return u;
        }));

    const removeConfigMaterial = (id: string) => {
        setSelectedMaterials(prev => prev.filter(m => m.id !== id));
        setConfigMaterials(prev => prev.filter(m => m.id !== id));
    };

    // Keep configMaterials in sync with selectedMaterials during Selection Phase (Step 2)
    // to allow auto-saving even before explicitly moving to Step 3.
    useEffect(() => {
        if (step === 2) {
            const existingMap = new Map(configMaterials.map(m => [m.id, m]));
            setConfigMaterials(selectedMaterials.map(m => {
                const ex = existingMap.get(m.id);
                if (ex) return ex;
                const rate = Number(m.rate) || 0;
                return { ...m, qty: 1, baseQty: 1, wastagePct: undefined, amount: rate, rate, supplyRate: rate, installRate: 0, location: m.technicalspecification || m.name || "", description: m.technicalspecification || m.name || "", applyWastage: true } as SelectedMaterial;
            }));
        }
    }, [selectedMaterials, step]);

    const boqResults = useMemo(() => computeBoq({ requiredUnitType, baseRequiredQty, wastagePctDefault }, configMaterials, baseRequiredQty), [requiredUnitType, baseRequiredQty, wastagePctDefault, configMaterials]);
    const totalCost = boqResults.grandTotal;

    // Auto-save effect for Step 3
    useEffect(() => {
        if (selectedProduct && (step === 2 || step === 3)) {
            const timer = setTimeout(async () => {
                try {
                    const payload = {
                        productId: selectedProduct.id,
                        productName: selectedProduct.name,
                        configName: configName || "Latest Draft",
                        categoryId: selectedCategory,
                        subcategoryId: selectedSubcategory,
                        totalCost,
                        requiredUnitType,
                        baseRequiredQty,
                        wastagePctDefault,
                        dimA,
                        dimB,
                        dimC,
                        description: productDescription,
                        items: buildPayloadItems()
                    };
                    await apiFetch("/api/product-step3-config", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    });
                } catch (e) {
                    console.error("Auto-save failed:", e);
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [selectedProduct, configName, selectedCategory, selectedSubcategory, totalCost, requiredUnitType, baseRequiredQty, wastagePctDefault, dimA, dimB, dimC, productDescription, configMaterials, step]);

    return (
        <Layout>
            <div className="container mx-auto py-8 px-4">
                <Card className="max-w-6xl mx-auto shadow-xl border-none">
                    <CardHeader className="bg-primary/5 border-b pb-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <CardTitle className="flex items-center gap-4">
                                <span className="text-3xl font-extrabold tracking-tight">Manage Product</span>
                                {selectedProduct && <Badge variant="outline" className="text-sm font-semibold py-1.5 px-4 bg-primary/10 border-primary/20">{selectedProduct.name}</Badge>}
                            </CardTitle>

                            {/* Materials Filter - Only shown in Step 2 */}
                            {step === 2 && (
                                <div className="flex flex-wrap items-center gap-4 animate-in fade-in duration-300">
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Category</label>
                                        <Select value={selectedCategory} onValueChange={val => { setSelectedCategory(val); setSelectedSubcategory(ALL); }}>
                                            <SelectTrigger className="h-9 w-[180px] bg-white border-primary/20 shadow-sm text-xs font-bold">
                                                <SelectValue placeholder="All Categories" />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[300px] overflow-y-auto">
                                                <SelectItem value={ALL}>All Categories</SelectItem>
                                                {categoriesData?.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Subcategory</label>
                                        <Select value={selectedSubcategory} onValueChange={setSelectedSubcategory} disabled={selectedCategory === ALL}>
                                            <SelectTrigger className="h-9 w-[180px] bg-white border-primary/20 shadow-sm text-xs font-bold">
                                                <SelectValue placeholder="All Subcategories" />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[300px] overflow-y-auto">
                                                <SelectItem value={ALL}>All Subcategories</SelectItem>
                                                {subcategoriesData?.map(sub => <SelectItem key={sub} value={sub}>{sub}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="p-8">

                        {/* Step 1 */}
                        {step === 1 && (
                            <div className="space-y-8">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <h2 className="text-2xl font-bold">1. Select Base Product</h2>
                                    <div className="relative w-full md:w-80">
                                        <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                                        <Input placeholder="Search by name..." className="pl-10 h-10" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                                    </div>
                                </div>
                                {loadingProducts ? (
                                    <div className="flex flex-col items-center justify-center p-20 space-y-4">
                                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                        <p className="text-muted-foreground font-medium">Loading products...</p>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border shadow-sm overflow-hidden bg-white max-h-[500px] overflow-y-auto">
                                        <Table>
                                            <TableHeader className="bg-muted/30 sticky top-0 z-10">
                                                <TableRow>
                                                    <TableHead className="w-[60px]"></TableHead>
                                                    <TableHead className="font-bold">Product Name</TableHead>
                                                    <TableHead className="font-bold">Created Date</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredProducts.length === 0 ? (
                                                    <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground">No products found matching "{productSearch}"</TableCell></TableRow>
                                                ) : filteredProducts.map(product => (
                                                    <TableRow key={product.id} className={`hover:bg-muted/20 transition-colors cursor-pointer ${selectedProduct?.id === product.id ? "bg-primary/5 hover:bg-primary/10" : ""}`}
                                                        onClick={() => { setSelectedProduct(product); resetSelection(); loadExistingConfig(product); }}>
                                                        <TableCell onClick={e => e.stopPropagation()}>
                                                            <Checkbox checked={selectedProduct?.id === product.id}
                                                                onCheckedChange={checked => { if (checked) { setSelectedProduct(product); resetSelection(); loadExistingConfig(product); } else setSelectedProduct(null); }} />
                                                        </TableCell>
                                                        <TableCell className="font-semibold text-base">{product.name}</TableCell>
                                                        <TableCell className="text-muted-foreground">{product.created_at ? new Date(product.created_at).toLocaleDateString() : 'N/A'}</TableCell>
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
                                                    <Select onValueChange={val => { if (val === "none") { resetSelection(); return; } const c = previousConfigs.find(c => c.product.id.toString() === val); if (c) loadSpecificConfig(c); }}>
                                                        <SelectTrigger className="h-12 bg-white border-primary/30 shadow-sm"><SelectValue placeholder="Choose a previous config..." /></SelectTrigger>
                                                        <SelectContent className="max-h-[300px]">
                                                            <SelectItem value="none" className="text-muted-foreground italic border-b border-muted/20 pb-2">-- Clear Selection / Start Fresh --</SelectItem>
                                                            {previousConfigs.map(cd => (
                                                                <SelectItem key={cd.product.id} value={cd.product.id.toString()}>
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold">{cd.product.config_name || "Unnamed Configuration"}</span>
                                                                        <span className="text-[10px] text-muted-foreground">Saved: {new Date(cd.product.created_at).toLocaleDateString()}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                            <div className="flex-1 space-y-3">
                                                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{previousConfigs.length > 0 ? "Or Create New Name" : "Configuration Name (Optional)"}</label>
                                                <Input value={configName} onChange={e => setConfigName(e.target.value)} placeholder="Enter a name (e.g., 'Standard', 'Premium')" className="h-12 bg-white border-primary/30 shadow-sm" />
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{previousConfigs.length > 0 ? "Select a previous configuration to load its data, or type a new name to save a distinct version." : "Give this configuration a name to distinguish it from others."}</p>
                                        <div className="mt-8 space-y-4">
                                            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                                Previous Configurations {isLoadingConfigs && <Loader2 className="h-4 w-4 animate-spin" />}
                                            </h3>
                                            {previousConfigs.length > 0 ? (
                                                <div className="rounded-xl border bg-white shadow-sm max-h-[250px] overflow-y-auto">
                                                    <div className="divide-y">
                                                        {previousConfigs.map(cd => (
                                                            <div key={cd.product.id} className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors group">
                                                                <div className="space-y-1">
                                                                    <div className="font-bold text-sm">{cd.product.config_name || "Unnamed Config"}</div>
                                                                    <div className="text-[10px] text-muted-foreground">Saved: {new Date(cd.product.created_at).toLocaleString()} | Materials: {cd.items?.length || 0}</div>
                                                                </div>
                                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Button variant="ghost" size="sm" onClick={() => loadSpecificConfig(cd)} className="h-8 text-primary hover:text-primary hover:bg-primary/10"><Edit className="h-4 w-4 mr-1" /> Load</Button>
                                                                    <Button variant="ghost" size="sm" onClick={async () => {
                                                                        const newName = prompt('Enter new configuration name:', cd.product.config_name || '');
                                                                        if (newName === null) return;
                                                                        const trimmed = newName.trim();
                                                                        if (!trimmed) { alert('Name cannot be empty'); return; }
                                                                        try {
                                                                            const res = await apiFetch(`/api/step11-products/config/${cd.product.id}`, {
                                                                                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config_name: trimmed })
                                                                            });
                                                                            if (res.ok) {
                                                                                // update local list
                                                                                setPreviousConfigs(prev => prev.map(p => p.product.id === cd.product.id ? { ...p, product: { ...p.product, config_name: trimmed } } : p));
                                                                                setConfigName(trimmed);
                                                                                toast({ title: 'Renamed', description: 'Configuration renamed successfully.' });
                                                                            } else {
                                                                                const data = await res.json().catch(() => ({}));
                                                                                toast({ title: 'Error', description: data.message || 'Failed to rename', variant: 'destructive' });
                                                                            }
                                                                        } catch (e) {
                                                                            console.error(e);
                                                                            toast({ title: 'Error', description: 'Failed to rename', variant: 'destructive' });
                                                                        }
                                                                    }} className="h-8 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"><span className="text-xs font-bold">✎ Edit</span></Button>
                                                                    <Button variant="ghost" size="sm" onClick={() => deleteConfig(cd.product.id)} className="h-8 text-red-500 hover:text-red-700 hover:bg-red-50"><span className="text-xs font-bold">🗑 Delete</span></Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : !isLoadingConfigs && (
                                                <div className="p-8 text-center border rounded-xl bg-muted/5 italic text-muted-foreground text-sm">No previously saved configurations found for this product.</div>
                                            )}
                                        </div>

                                        {rejectedConfigs.length > 0 && (
                                            <div className="mt-8 space-y-4">
                                                <h3 className="text-sm font-bold uppercase tracking-wider text-red-600 flex items-center justify-between">
                                                    Rejected Configurations {isLoadingConfigs && <Loader2 className="h-4 w-4 animate-spin" />}
                                                </h3>
                                                <div className="rounded-xl border border-red-100 bg-red-50/30 shadow-sm max-h-[250px] overflow-y-auto">
                                                    <div className="divide-y divide-red-100">
                                                        {rejectedConfigs.map(config => (
                                                            <div key={config.id} className="flex items-center justify-between p-4 hover:bg-red-50/50 transition-colors group">
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="font-bold text-sm">{config.config_name || "Unnamed Config"}</div>
                                                                        <Badge variant="destructive" className="h-4 text-[8px] uppercase px-1.5 font-bold">Rejected</Badge>
                                                                    </div>
                                                                    <div className="text-[10px] text-muted-foreground">Rejected: {new Date(config.updated_at).toLocaleString()}</div>
                                                                    {config.rejection_reason && (
                                                                        <div className="text-[10px] text-red-600 font-medium italic">Reason: {config.rejection_reason}</div>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <Button variant="outline" size="sm" onClick={() => loadRejectedConfig(config)} className="text-red-700 border-red-200 hover:bg-red-50 font-bold h-8">Edit & Resubmit</Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="flex justify-end pt-4">
                                    <Button size="sm" onClick={nextStep} disabled={!selectedProduct} className="px-6 h-10">Next Step <ArrowRight className="ml-2 h-4 w-4" /></Button>
                                </div>
                            </div>
                        )}

                        {/* Step 2 */}
                        {step === 2 && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-2xl font-bold flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-black">2</div>
                                        Select Materials/Items
                                    </h2>
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-64">
                                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input placeholder="Search materials..." className="pl-10 h-10 bg-muted/5 font-medium" value={materialSearch} onChange={e => setMaterialSearch(e.target.value)} />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                                    {/* Left Side: AVAILABLE MATERIALS (Now on Left) */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between px-2">
                                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                                                <Layers className="h-4 w-4" /> Available Materials ({filteredMaterials.length})
                                            </h3>
                                            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Filtered View</span>
                                        </div>
                                        <div className="rounded-2xl border-2 border-slate-100 bg-white shadow-inner min-h-[450px] max-h-[600px] overflow-y-auto custom-scrollbar">
                                            {loadingMaterials ? (
                                                <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
                                                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Loading Items...</p>
                                                </div>
                                            ) : filteredMaterials.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-3 p-6 italic">
                                                    <Search className="h-10 w-10 text-muted-foreground opacity-20" />
                                                    <p className="text-sm font-medium text-muted-foreground">No matching materials found</p>
                                                    <p className="text-[10px] text-muted-foreground/60">Try adjusting your filters or search term.</p>
                                                </div>
                                            ) : (
                                                <div className="divide-y divide-slate-50">
                                                    {filteredMaterials.map((material) => {
                                                        const isSelected = selectedMaterials.some(m => m.id === material.id);
                                                        return (
                                                            <div key={material.id}
                                                                onClick={() => toggleMaterial(material)}
                                                                className={`p-4 flex items-center justify-between cursor-pointer transition-all hover:bg-slate-50 relative overflow-hidden group ${isSelected ? "opacity-40 grayscale-[0.5]" : ""}`}
                                                            >
                                                                {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                                                                <div className="flex-1 min-w-0 pr-4">
                                                                    <div className="flex items-center gap-2 mb-0.5">
                                                                        <span className="font-bold text-slate-900 group-hover:text-primary transition-colors">{material.name}</span>
                                                                        {isSelected && <Check className="h-3 w-3 text-primary animate-in zoom-in" />}
                                                                    </div>
                                                                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                                                                        <span>{material.unit}</span>
                                                                        <span>•</span>
                                                                        <span className="truncate max-w-[120px]">{material.shop_name || "Multiple Vendors"}</span>
                                                                        <span>•</span>
                                                                        <span className="text-slate-400 font-mono tracking-tighter">Code: {material.code || material.id?.slice(0, 8)}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right shrink-0">
                                                                    <div className="text-xs font-black text-slate-800">₹{material.rate?.toLocaleString()}</div>
                                                                    <div className={`text-[10px] font-bold mt-0.5 ${isSelected ? "text-primary" : "text-muted-foreground group-hover:text-primary"} transition-colors`}>
                                                                        {isSelected ? "Added" : "+ Add to list"}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Side: SELECTED MATERIALS (Now on Right) */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between px-2">
                                            <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2">
                                                <Check className="h-4 w-4" /> Selected Materials ({selectedMaterials.length})
                                            </h3>
                                            {selectedMaterials.length > 0 && (
                                                <Button variant="ghost" size="sm" onClick={() => setSelectedMaterials([])} className="text-[10px] font-bold text-red-500 hover:text-red-600 hover:bg-red-50 h-7">Clear All</Button>
                                            )}
                                        </div>
                                        <div className="rounded-2xl border-2 border-dashed border-blue-100 bg-blue-50/20 min-h-[450px] max-h-[600px] overflow-y-auto p-4 custom-scrollbar">
                                            {selectedMaterials.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-3 p-6">
                                                    <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
                                                        <Plus className="h-8 w-8 text-blue-300" />
                                                    </div>
                                                    <p className="text-sm font-semibold text-blue-400">No materials selected yet</p>
                                                    <p className="text-xs text-muted-foreground max-w-[200px]">Click on materials from the left panel to add them to your configuration.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {selectedMaterials.map((material) => (
                                                        <div key={material.id} className="flex items-center justify-between p-3 bg-white rounded-xl border-2 border-blue-100 shadow-sm hover:border-blue-300 transition-all group animate-in slide-in-from-right-4 duration-300">
                                                            <div className="flex flex-col min-w-0 pr-4">
                                                                <span className="font-bold text-slate-800 text-sm truncate">{material.name}</span>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <Badge variant="outline" className="text-[9px] h-4 px-1 bg-blue-50/50 text-blue-600 font-bold border-blue-100">{material.unit}</Badge>
                                                                    <span className="text-[10px] text-muted-foreground font-medium truncate">{material.shop_name}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span className="text-xs font-black text-slate-700">₹{material.rate?.toLocaleString()}</span>
                                                                <Button variant="ghost" size="sm" onClick={() => toggleMaterial(material)} className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 group-hover:scale-110 transition-transform">
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-8 mt-4 border-t border-dashed">
                                    <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} className="w-full sm:w-auto px-8 h-10 border-slate-200 font-bold uppercase tracking-wide"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                                    <div className="flex items-center gap-6 w-full sm:w-auto">
                                        <div className="flex flex-col items-end">
                                            <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase leading-none mb-1">Total Selected</p>
                                            <p className="text-sm font-black text-primary leading-none">{selectedMaterials.length} Items</p>
                                        </div>
                                        <Button size="sm" onClick={nextStep} disabled={selectedMaterials.length === 0} className="w-full sm:w-auto h-12 px-12 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest shadow-xl shadow-primary/20 transition-all hover:scale-[1.02]">
                                            Continue <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3 */}
                        {step === 3 && (
                            <div className="space-y-8">
                                {rejectedConfigs.some(rc => rc.config_name === configName) && (
                                    <div className="bg-red-50 border-2 border-red-200 p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
                                        <XCircle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="font-bold text-red-800 uppercase text-xs tracking-wider mb-1">Rejection Reason</h4>
                                            <p className="text-sm text-red-700 font-medium">
                                                {rejectedConfigs.find(rc => rc.config_name === configName)?.rejection_reason || "No specific reason provided."}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-6">
                                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-r from-muted/50 to-muted/20 p-6 rounded-2xl border">
                                        <div>
                                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Configuration For</h3>
                                            <p className="text-2xl font-extrabold">{selectedProduct?.name}</p>
                                        </div>
                                        <div className="text-center md:text-right flex flex-col items-center md:items-end gap-2">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase">Compact View</span>
                                                <Checkbox checked={compactMode} onCheckedChange={(val) => setCompactMode(!!val)} />
                                            </div>
                                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Current Total</h3>
                                            <p className="text-4xl font-extrabold text-primary">₹{totalCost.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 p-6 bg-white rounded-xl border shadow-sm items-end">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-muted-foreground">Unit Type</label>
                                            <Select value={requiredUnitType} onValueChange={(val: string) => setRequiredUnitType(val)}>
                                                <SelectTrigger className="font-bold"><SelectValue placeholder="Select unit" /></SelectTrigger>
                                                <SelectContent className="max-h-[300px] overflow-y-auto">
                                                    {availableUnitTypes.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="md:col-span-5 space-y-2">
                                            <label className="text-xs font-bold uppercase text-muted-foreground">Product Description</label>
                                            <Textarea placeholder="Enter a description..." value={productDescription} onChange={e => setProductDescription(e.target.value)} className="min-h-[80px] font-medium" />
                                        </div>
                                        {[["Dim A", dimA, setDimA], ["Dim B", dimB, setDimB], ["Dim C", dimC, setDimC]].map(([label, val, setter]: any) => (
                                            <div key={label} className="space-y-2">
                                                <label className="text-xs font-bold uppercase text-muted-foreground">{label}</label>
                                                <Input type="number" value={val ?? ""} onChange={e => setter(e.target.value ? Number(e.target.value) : undefined)} placeholder={label.split(" ")[1]} className="font-bold" />
                                            </div>
                                        ))}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-muted-foreground">Basis Qty</label>
                                            <Input type="number" value={baseRequiredQty} onChange={e => setBaseRequiredQty(Number(e.target.value) || 0)} className="font-bold bg-muted/30" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-muted-foreground">Wastage %</label>
                                            <Input type="number" value={wastagePctDefault} onChange={e => { const v = Number(e.target.value) || 0; setWastagePctDefault(v); setConfigMaterials(prev => prev.map(m => m.applyWastage ? { ...m, wastagePct: v } : m)); }} className="font-bold border-orange-200" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase text-muted-foreground invisible">Actions</label>
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" size="sm" className="w-full h-10 px-4 text-xs font-bold text-primary border-primary hover:bg-primary/10 transition-all flex items-center justify-center gap-2">
                                                        <Plus className="h-4 w-4" /> Add Item
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                                                    <DialogHeader>
                                                        <DialogTitle className="text-xl font-bold">Add Additional Materials</DialogTitle>
                                                    </DialogHeader>
                                                    <div className="relative my-4">
                                                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                        <Input
                                                            placeholder="Search materials by name or code..."
                                                            className="pl-10 h-10"
                                                            value={step3MaterialSearch}
                                                            onChange={e => setStep3MaterialSearch(e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="overflow-y-auto border rounded-xl flex-1">
                                                        <Table>
                                                            <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                                                <TableRow>
                                                                    <TableHead className="font-bold">Material Name</TableHead>
                                                                    <TableHead className="font-bold">Unit</TableHead>
                                                                    <TableHead className="font-bold">Shop</TableHead>
                                                                    <TableHead className="text-right font-bold pr-6">Action</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {loadingMaterials ? (
                                                                    <TableRow><TableCell colSpan={4} className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                                                                ) : (uniqueMaterials || []).filter(m => {
                                                                    const q = step3MaterialSearch.toLowerCase();
                                                                    return (m.name || "").toLowerCase().includes(q) || (m.code || "").toLowerCase().includes(q);
                                                                }).map(material => (
                                                                    <TableRow key={material.id} className="hover:bg-muted/10">
                                                                        <TableCell className="font-medium">{material.name}<div className="text-[10px] text-muted-foreground">Code: {material.code || material.id}</div></TableCell>
                                                                        <TableCell>{material.unit || "-"}</TableCell>
                                                                        <TableCell>{material.shop_name || "-"}</TableCell>
                                                                        <TableCell className="text-right pr-4">
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                className="h-8 text-xs font-bold border-primary text-primary hover:bg-primary hover:text-white"
                                                                                onClick={() => {
                                                                                    if (configMaterials.some(m => m.id === material.id)) {
                                                                                        toast({ title: "Already Added", description: "This material is already in your configuration.", variant: "destructive" });
                                                                                        return;
                                                                                    }
                                                                                    const rate = Number(material.rate) || 0;
                                                                                    const newItem: SelectedMaterial = {
                                                                                        ...material,
                                                                                        qty: 1,
                                                                                        baseQty: 1,
                                                                                        wastagePct: wastagePctDefault,
                                                                                        amount: rate,
                                                                                        rate,
                                                                                        supplyRate: rate,
                                                                                        installRate: 0,
                                                                                        location: material.technicalspecification || material.name || "",
                                                                                        description: material.technicalspecification || material.name || "",
                                                                                        applyWastage: true
                                                                                    };
                                                                                    setConfigMaterials(prev => [...prev, newItem]);
                                                                                    setSelectedMaterials(prev => [...prev, material]);
                                                                                    toast({ title: "Material Added", description: `${material.name} added to configuration.` });
                                                                                }}
                                                                            >
                                                                                Add
                                                                            </Button>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>
                                    <div className="rounded-xl border shadow-sm overflow-hidden bg-white">
                                        <Table>
                                            <TableHeader className="bg-muted/30">
                                                <TableRow>
                                                    <TableHead className="w-[40px] font-bold">Sl</TableHead>
                                                    <TableHead className="w-[40px] font-bold"></TableHead>
                                                    <TableHead className="font-bold py-4">Item</TableHead>
                                                    <TableHead className="w-[100px] font-bold">Shop</TableHead>
                                                    <TableHead className="w-[120px] font-bold">Item Description</TableHead>
                                                    <TableHead className="w-[60px] font-bold">Unit</TableHead>
                                                    <TableHead className="w-[120px] font-bold text-center">Qty / {baseRequiredQty} {requiredUnitType}</TableHead>
                                                    <TableHead className="w-[120px] font-bold">Rate / Material Unit</TableHead>
                                                    {!compactMode && (
                                                        <>
                                                            <TableHead className="w-[110px] font-bold">Base Amount</TableHead>
                                                            <TableHead className="w-[70px] font-bold">
                                                                <div className="flex flex-col items-center gap-1">
                                                                    <span className="text-[10px]">Wastage</span>
                                                                    <Checkbox checked={configMaterials.length > 0 && configMaterials.every(m => m.applyWastage)} onCheckedChange={checked => setConfigMaterials(prev => prev.map(m => ({ ...m, applyWastage: !!checked })))} />
                                                                </div>
                                                            </TableHead>
                                                            <TableHead className="w-[80px] font-bold">Wastage %</TableHead>
                                                            <TableHead className="w-[80px] font-bold">Wastage Qty</TableHead>
                                                            <TableHead className="w-[90px] font-bold">Total Qty</TableHead>
                                                        </>
                                                    )}
                                                    <TableHead className="w-[90px] font-bold">Final Amount</TableHead>
                                                    {!compactMode && <TableHead className="w-[90px] font-bold">Per {requiredUnitType} Qty</TableHead>}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {boqResults.computed.map((m, idx) => {
                                                    const baseAmt = m.baseQty * (m.supplyRate + m.installRate);
                                                    return (
                                                        <TableRow key={m.id} className="hover:bg-muted/5">
                                                            <TableCell className="text-center font-medium text-[10px]">{idx + 1}</TableCell>
                                                            <TableCell className="text-center">
                                                                <Button variant="ghost" size="sm" onClick={() => removeConfigMaterial(m.id!)} className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50">
                                                                    <span className="text-xs font-bold">×</span>
                                                                </Button>
                                                            </TableCell>
                                                            <TableCell className="font-semibold text-[10px]">{m.name}</TableCell>
                                                            <TableCell className="text-[10px]">{m.shop_name || "N/A"}</TableCell>
                                                            <TableCell><Input value={m.location} onChange={e => updateConfig(m.id!, "location", e.target.value)} className="h-8 border-muted text-[10px] px-2" /></TableCell>
                                                            <TableCell className="text-[10px] font-medium">{m.unit}</TableCell>
                                                            <TableCell><div className="flex justify-center"><Input type="number" value={m.baseQty} onChange={e => updateConfig(m.id!, "baseQty", Number(e.target.value))} className="h-8 border-muted text-[11px] px-2 font-bold w-20 text-center" /></div></TableCell>
                                                            <TableCell className="text-[10px] font-bold">₹{(m.supplyRate + m.installRate).toLocaleString()}</TableCell>
                                                            {!compactMode && (
                                                                <>
                                                                    <TableCell className="text-[10px] font-bold">₹{baseAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                                    <TableCell className="text-center"><Checkbox checked={m.applyWastage} onCheckedChange={checked => updateConfig(m.id!, "applyWastage", checked)} /></TableCell>
                                                                    <TableCell><Input type="number" value={m.wastagePct ?? ""} onChange={e => updateConfig(m.id!, "wastagePct", e.target.value ? Number(e.target.value) : undefined)} placeholder="Global" className="h-8 border-orange-200 text-[10px] px-2 font-bold w-full" /></TableCell>
                                                                    <TableCell className="text-[10px] font-bold text-orange-600">{m.wastageQty.toFixed(2)}</TableCell>
                                                                    <TableCell className="text-[10px] font-bold">{m.roundOffQty.toFixed(2)}</TableCell>
                                                                </>
                                                            )}
                                                            <TableCell className="text-[10px] font-bold text-blue-600">₹{m.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                            {!compactMode && <TableCell className="text-[10px] font-bold text-primary">{m.perUnitQty.toFixed(4)}</TableCell>}
                                                        </TableRow>
                                                    );
                                                })}
                                                <TableRow className="bg-muted/20 font-black">
                                                    <TableCell colSpan={compactMode ? 8 : 13} className="text-right py-3 pr-4">Total (Incl. Wastage)</TableCell>
                                                    <TableCell className="text-[11px] text-primary">₹{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    {!compactMode && <TableCell></TableCell>}
                                                </TableRow>
                                                <TableRow className="bg-primary/5 font-black border-t-2 border-primary/20">
                                                    <TableCell colSpan={compactMode ? 8 : 13} className="text-right py-4 pr-4 text-primary uppercase tracking-widest text-xs">Rate per {requiredUnitType}</TableCell>
                                                    <TableCell className="text-sm text-primary font-black underline decoration-primary decoration-2 underline-offset-8">
                                                        ₹{(totalCost / (baseRequiredQty || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </TableCell>
                                                    {!compactMode && <TableCell></TableCell>}
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 mt-4 border-t">
                                        <div className="flex items-center gap-3 w-full sm:w-auto">
                                            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} className="w-full sm:w-auto px-6 h-10"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Selection</Button>
                                            <Button variant="outline" size="sm" onClick={() => { setSelectedProduct(null); setConfigName(""); setSelectedCategory(""); setSelectedSubcategory(""); setSelectedMaterials([]); setConfigMaterials([]); setRequiredUnitType("Sqft"); setBaseRequiredQty(100); setWastagePctDefault(5); setDimA(undefined); setDimB(undefined); setDimC(undefined); setStep(1); }} className="w-full sm:w-auto px-6 h-10 border-blue-400 text-blue-700 hover:bg-blue-50">+ Add Another Product</Button>
                                        </div>
                                        <div className="flex items-center gap-3 w-full sm:w-auto">
                                            <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={isSaving || configMaterials.length === 0} className="w-full sm:w-auto h-10 border-orange-400 text-orange-700 hover:bg-orange-50 px-6">
                                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Draft"}
                                            </Button>
                                            <Button size="sm" onClick={handleSaveInPlace} disabled={isSaving || configMaterials.length === 0} className="w-full sm:w-auto h-10 bg-green-600 hover:bg-green-700 text-white font-bold px-6 transition-all shadow-md">
                                                {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : "Submit for Approval"}
                                            </Button>
                                            <Button size="sm" onClick={nextStep} className="w-full sm:w-auto h-10 bg-primary hover:bg-primary/90 text-white font-bold px-6 transition-all">Continue to Review <ArrowRight className="ml-2 h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4 */}
                        {step === 4 && (
                            <div className="space-y-8 animate-in fade-in duration-500">
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
                                            <tr className="text-[12px] border-b border-black/10 hover:bg-muted/10 transition-colors">
                                                <td className="border-r border-black p-3 text-center font-bold">1</td>
                                                <td className="border-r border-black p-3 font-black text-xs uppercase">{selectedProduct?.name}</td>
                                                <td className="border-r border-black p-3 text-center italic">Main Area</td>
                                                <td className="border-r border-black p-3 text-[10px] text-muted-foreground leading-tight">Consolidated configuration for {selectedProduct?.name}</td>
                                                <td className="border-r border-black p-3 text-center font-bold text-xs">{requiredUnitType}</td>
                                                <td className="border-r border-black p-3 text-center font-black">{baseRequiredQty}</td>
                                                <td className="border-r border-black p-3 text-right font-bold">₹{boqResults.totalSupply.toLocaleString()}</td>
                                                <td className="border-r border-black p-3 text-right font-bold">₹{boqResults.totalInstall.toLocaleString()}</td>
                                                <td className="border-r border-black p-3 text-right font-black text-primary">₹{boqResults.totalSupply.toLocaleString()}</td>
                                                <td className="border-black p-3 text-right font-black text-primary">₹{boqResults.totalInstall.toLocaleString()}</td>
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
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-8 mt-8 border-t border-black/10">
                                    <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} className="w-full sm:w-auto px-6 h-10 font-bold uppercase tracking-wide" disabled={isSaving}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                                    <Button size="sm" onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto h-10 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 uppercase tracking-wide transition-all shadow-md">
                                        {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finalizing...</> : "Add to Create BOQ"}
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