import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import apiFetch, { getJSON } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";
import { getEstimatorTypeFromProduct } from "@/lib/estimatorUtils";

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

type Step11PreviewProps = {
  product: Product;
  onClose: () => void;
  onAddToBoq: (selectedItems: Step11Item[]) => void;
  open: boolean;
};

export default function Step11Preview({
  product,
  onClose,
  onAddToBoq,
  open,
}: Step11PreviewProps) {
  const [step11Items, setStep11Items] = useState<Step11Item[]>([]);
  const [configurations, setConfigurations] = useState<any[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [showMaterialDetails, setShowMaterialDetails] = useState(false);
  const { toast } = useToast();

  // Load Step 11 snapshot for this product
  useEffect(() => {
    const loadStep11Data = async () => {
      try {
        setLoading(true);

        // First: try step11_products (Step 4 / "Add to Create BOQ" saves)
        const data = await getJSON(
          `/api/step11-products/${encodeURIComponent(product.id)}`
        );

        console.log("Step 11 Config Data:", data);

        if (data.configurations && data.configurations.length > 0) {
          setConfigurations(data.configurations);
          // Auto-select the first (most recent) configuration
          const firstConfig = data.configurations[0];
          setSelectedConfig(firstConfig);

          // Use items directly from the configuration
          const items = firstConfig.items || [];

          // Convert configuration items to Step11Item format
          const step11ItemsFromConfig = items.map((item: any, index: number) => ({
            id: `${firstConfig.product.id}_${index}`,
            bill_no: `TEMPLATE_${product.id}_${firstConfig.product.config_name || 'default'}_${index}`,
            estimator: getEstimatorTypeFromProduct(product) || "generic",
            group_id: product.id,
            title: item.material_name || item.name || `Material ${index + 1}`,
            description: item.description || `${product.name} - ${item.material_name || item.name || `Material ${index + 1}`}`,
            unit: firstConfig.product.required_unit_type || "Sqft",
            qty: Number(item.qty || item.quantity || 1),
            supply_rate: Number(item.supply_rate || item.rate || 0),
            install_rate: Number(item.install_rate || 0),
            config_id: firstConfig.product.id,
            material_id: item.material_id,
          }));

          setStep11Items(step11ItemsFromConfig);
          return; // Done — step11 data found
        }

        // Fallback: try product-step3-config (Step 3 "Save Configuration" saves)
        try {
          const step3Res = await apiFetch(`/api/product-step3-config/${encodeURIComponent(product.id)}`);
          if (step3Res.ok) {
            const step3Data = await step3Res.json();
            if (step3Data.items && step3Data.items.length > 0) {
              const config = step3Data.config;
              // Build a synthetic "configuration" object matching step11 shape
              const syntheticConfig = {
                product: {
                  id: config.id,
                  config_name: config.config_name || product.name,
                  required_unit_type: config.required_unit_type || "Sqft",
                  created_at: config.created_at,
                },
                items: step3Data.items,
              };
              setConfigurations([syntheticConfig]);
              setSelectedConfig(syntheticConfig);

              const step11ItemsFromStep3 = step3Data.items.map((item: any, index: number) => ({
                id: `step3_${config.id}_${index}`,
                bill_no: `STEP3_${product.id}_${index}`,
                estimator: getEstimatorTypeFromProduct(product) || "generic",
                group_id: product.id,
                title: item.material_name || `Material ${index + 1}`,
                description: item.description || `${product.name} - ${item.material_name || `Material ${index + 1}`}`,
                unit: config.required_unit_type || "Sqft",
                qty: Number(item.base_qty || item.qty || 1),
                supply_rate: Number(item.supply_rate || item.rate || 0),
                install_rate: Number(item.install_rate || 0),
                config_id: config.id,
                material_id: item.material_id,
              }));

              setStep11Items(step11ItemsFromStep3);
              return; // Done — step3 data found
            }
          }
        } catch (step3Err) {
          console.warn("Step3 config fallback failed:", step3Err);
        }

        // No configuration found in either table
        setConfigurations([]);
        setStep11Items([]);

        toast({
          title: "Configuration Required",
          description: `No saved configuration found for ${product.name}. Please configure it in Manage Product first.`,
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = "/admin/manage-product";
              }}
            >
              Go to Manage Product
            </Button>
          )
        });
      } catch (error: any) {
        // If step11 returns 404, try step3 config as fallback
        if (error.message?.includes("HTTP 404") || error.message?.includes("404")) {
          try {
            const step3Res = await apiFetch(`/api/product-step3-config/${encodeURIComponent(product.id)}`);
            if (step3Res.ok) {
              const step3Data = await step3Res.json();
              if (step3Data.items && step3Data.items.length > 0) {
                const config = step3Data.config;
                const syntheticConfig = {
                  product: {
                    id: config.id,
                    config_name: config.config_name || product.name,
                    required_unit_type: config.required_unit_type || "Sqft",
                    created_at: config.created_at,
                  },
                  items: step3Data.items,
                };
                setConfigurations([syntheticConfig]);
                setSelectedConfig(syntheticConfig);

                const step11ItemsFromStep3 = step3Data.items.map((item: any, index: number) => ({
                  id: `step3_${config.id}_${index}`,
                  bill_no: `STEP3_${product.id}_${index}`,
                  estimator: getEstimatorTypeFromProduct(product) || "generic",
                  group_id: product.id,
                  title: item.material_name || `Material ${index + 1}`,
                  description: `${product.name} - ${item.material_name || `Material ${index + 1}`}`,
                  unit: config.required_unit_type || "Sqft",
                  qty: Number(item.base_qty || item.qty || 1),
                  supply_rate: Number(item.supply_rate || item.rate || 0),
                  install_rate: Number(item.install_rate || 0),
                  config_id: config.id,
                  material_id: item.material_id,
                }));

                setStep11Items(step11ItemsFromStep3);
                setLoading(false);
                return;
              }
            }
          } catch (step3Err) {
            console.warn("Step3 config fallback also failed:", step3Err);
          }

          setConfigurations([]);
          setStep11Items([]);
          toast({
            title: "Info",
            description: `No saved configuration found for ${product.name}. Please configure it in Manage Product first.`,
          });
        } else {
          console.error("Failed to load product snapshot:", error);
          setConfigurations([]);
          setStep11Items([]);
          toast({
            title: "Error",
            description: "Failed to load product configuration",
            variant: "destructive",
          });
        }
      } finally {
        setLoading(false);
      }
    };

    if (open && product?.id) {
      loadStep11Data();
    }
  }, [product, toast, open]);

  // Handle configuration selection
  const handleConfigChange = (config: any) => {
    setSelectedConfig(config);

    const items = config.items || [];

    // Convert configuration items to Step11Item format
    const step11ItemsFromConfig = items.map((item: any, index: number) => ({
      id: `${config.product.id}_${index}`,
      bill_no: `TEMPLATE_${product.id}_${config.product.config_name || 'default'}_${index}`,
      estimator: getEstimatorTypeFromProduct(product) || "generic",
      group_id: product.id,
      title: item.material_name || item.name || `Material ${index + 1}`,
      description: item.description || `${product.name} - ${item.material_name || item.name || `Material ${index + 1}`}`,
      unit: config.product.required_unit_type || "Sqft",
      qty: Number(item.qty || item.quantity || 1),
      supply_rate: Number(item.supply_rate || item.rate || 0),
      install_rate: Number(item.install_rate || 0),
      config_id: config.product.id,
      material_id: item.material_id,
    }));

    setStep11Items(step11ItemsFromConfig);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product.name} - Step 11 Configuration</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {product.category && product.subcategory && (
            <p className="text-sm text-gray-500">
              {product.category} → {product.subcategory}
            </p>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Loading Step 11 data...
            </div>
          ) : step11Items.length === 0 ? (
            <div className="text-center py-8 text-gray-500 space-y-4">
              <div className="text-lg font-medium">No Configuration Found</div>
              <div className="text-sm">
                No saved configuration exists for <strong>{product.name}</strong>.
              </div>
              <div className="text-sm text-gray-600">
                You need to create a product configuration in Manage Product first before you can add it to a BOQ.
              </div>
              <Button
                onClick={() => window.location.href = "/admin/manage-product"}
                variant="outline"
                className="mt-4"
              >
                Go to Manage Product
              </Button>
            </div>
          ) : (
            <>
              {/* Configuration Selector */}
              {configurations.length > 1 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Select Configuration</Label>
                  <Select
                    value={selectedConfig?.product.id || ""}
                    onValueChange={(value) => {
                      const config = configurations.find(c => c.product.id === value);
                      if (config) handleConfigChange(config);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a configuration" />
                    </SelectTrigger>
                    <SelectContent>
                      {configurations.map((config) => (
                        <SelectItem key={config.product.id} value={config.product.id}>
                          {config.product.config_name || 'Unnamed Configuration'}
                          (Created: {new Date(config.product.created_at).toLocaleDateString()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Consolidated Item Display */}
              <div className="space-y-4">
                <div className="font-black text-[13px] uppercase tracking-widest mb-2 border-b-2 border-black pb-1">
                  Product Configuration Preview
                </div>

                <div className="border-2 border-black rounded-sm overflow-hidden shadow-md">
                  <table className="w-full border-collapse">
                    <thead className="bg-white border-b border-black">
                      <tr className="text-[10px] font-black uppercase tracking-wider">
                        <th className="border-r border-black p-2 text-center w-[40px]">S.No</th>
                        <th className="border-r border-black p-2 text-left">Item</th>
                        <th className="border-r border-black p-2 text-center w-[100px]">Location</th>
                        <th className="border-r border-black p-2 text-left">Description</th>
                        <th className="border-r border-black p-2 text-center w-[60px]">Unit</th>
                        <th className="border-r border-black p-2 text-center w-[60px]">Qty</th>
                        <th className="border-r border-black p-2 text-right w-[100px]">Supply Rate</th>
                        <th className="border-r border-black p-2 text-right w-[100px]">Install Rate</th>
                        <th className="p-2 text-right w-[110px]">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      <tr className="text-[11px] hover:bg-muted/5 transition-colors">
                        <td className="border-r border-black p-3 text-center font-bold">1</td>
                        <td className="border-r border-black p-3 font-black uppercase text-xs">
                          {product.name}
                        </td>
                        <td className="border-r border-black p-3 text-center italic">Main Area</td>
                        <td className="border-r border-black p-3 text-[10px] text-muted-foreground leading-tight">
                          {selectedConfig?.product.description || `Consolidated configuration for ${product.name}`}
                        </td>
                        <td className="border-r border-black p-3 text-center font-bold">{selectedConfig?.product.required_unit_type || "Sqft"}</td>
                        <td className="border-r border-black p-3 text-center font-black">1</td>
                        <td className="border-r border-black p-3 text-right font-bold">
                          ₹{step11Items.reduce((sum, item) => sum + ((item.qty || 1) * (item.supply_rate || 0)), 0).toLocaleString()}
                        </td>
                        <td className="border-r border-black p-3 text-right font-bold">
                          ₹{step11Items.reduce((sum, item) => sum + ((item.qty || 1) * (item.install_rate || 0)), 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-black text-primary">
                          ₹{step11Items.reduce((sum, item) => sum + ((item.qty || 1) * ((item.supply_rate || 0) + (item.install_rate || 0))), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot className="bg-black/5 border-t border-black">
                      <tr className="font-black text-[12px]">
                        <td colSpan={8} className="p-3 text-right uppercase">Grand Total Amount (INR)</td>
                        <td className="p-3 text-right text-primary text-sm font-black">
                          ₹{step11Items.reduce((sum, item) => sum + ((item.qty || 1) * ((item.supply_rate || 0) + (item.install_rate || 0))), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <p className="text-[10px] text-gray-500 italic mt-2">
                  * This is a consolidated view of {step11Items.length} materials.
                </p>

                {/* Material Details Toggle */}
                <div className="mt-3">
                  <button
                    onClick={() => setShowMaterialDetails(prev => !prev)}
                    className="text-xs text-purple-600 hover:text-purple-800 font-semibold underline flex items-center gap-1"
                  >
                    {showMaterialDetails ? '▲ Hide Material Details' : '▼ View All Material Items'}
                  </button>
                  {showMaterialDetails && step11Items.length > 0 && (
                    <div className="mt-3 border border-purple-200 rounded-sm overflow-hidden">
                      <table className="w-full border-collapse text-[10px]">
                        <thead className="bg-purple-50">
                          <tr className="font-bold text-purple-900 border-b border-purple-200">
                            <th className="border border-purple-200 px-2 py-1 text-center w-8">#</th>
                            <th className="border border-purple-200 px-2 py-1 text-left">Material</th>
                            <th className="border border-purple-200 px-2 py-1 text-center w-14">Unit</th>
                            <th className="border border-purple-200 px-2 py-1 text-center w-16">Qty</th>
                            <th className="border border-purple-200 px-2 py-1 text-right w-24">Supply Rate</th>
                            <th className="border border-purple-200 px-2 py-1 text-right w-24">Install Rate</th>
                            <th className="border border-purple-200 px-2 py-1 text-right w-28">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {step11Items.map((item, idx) => {
                            const amt = (item.qty || 1) * ((item.supply_rate || 0) + (item.install_rate || 0));
                            return (
                              <tr key={idx} className="border-b border-purple-100 hover:bg-purple-50/40">
                                <td className="border border-purple-100 px-2 py-1 text-center text-gray-500">{idx + 1}</td>
                                <td className="border border-purple-100 px-2 py-1 font-medium">{item.title}</td>
                                <td className="border border-purple-100 px-2 py-1 text-center">{item.unit || '-'}</td>
                                <td className="border border-purple-100 px-2 py-1 text-center font-bold text-blue-700">{item.qty || 1}</td>
                                <td className="border border-purple-100 px-2 py-1 text-right text-green-700">₹{Number(item.supply_rate || 0).toLocaleString()}</td>
                                <td className="border border-purple-100 px-2 py-1 text-right text-orange-600">₹{Number(item.install_rate || 0).toLocaleString()}</td>
                                <td className="border border-purple-100 px-2 py-1 text-right font-bold">₹{amt.toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-purple-50/50 font-bold">
                          <tr>
                            <td colSpan={6} className="border border-purple-200 px-2 py-1.5 text-right uppercase text-gray-500">Grand Total</td>
                            <td className="border border-purple-200 px-2 py-1.5 text-right text-primary">
                              ₹{step11Items.reduce((s, i) => s + ((i.qty || 1) * ((i.supply_rate || 0) + (i.install_rate || 0))), 0).toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-6 border-t border-black/10">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 font-bold uppercase tracking-wider py-6"
                  disabled={isAdding}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    // Create single consolidated item to send to BOQ
                    const totalSupply = step11Items.reduce((sum, item) => sum + ((item.qty || 1) * (item.supply_rate || 0)), 0);
                    const totalInstall = step11Items.reduce((sum, item) => sum + ((item.qty || 1) * (item.install_rate || 0)), 0);

                    const consolidatedItem: Step11Item = {
                      id: `CONSOLIDATED_${product.id}_${selectedConfig?.product.id || 'default'}`,
                      bill_no: `PRODUCT_${product.id}`,
                      estimator: getEstimatorTypeFromProduct(product) || "generic",
                      group_id: product.id,
                      title: product.name,
                      description: selectedConfig?.product.description || `Consolidated configuration for ${product.name}`,
                      unit: selectedConfig?.product.required_unit_type || "Sqft",
                      qty: 1,
                      supply_rate: totalSupply,
                      install_rate: totalInstall,
                      config_id: selectedConfig?.product.id,
                      // We still keep the original items in table_data hidden from main view if needed
                      step11_items: step11Items,
                    };

                    onAddToBoq([consolidatedItem]);
                  }}
                  disabled={step11Items.length === 0 || isAdding}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-wider py-6 shadow-lg transition-all hover:scale-[1.02]"
                >
                  {isAdding
                    ? "Adding..."
                    : "Add to BOQ"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
