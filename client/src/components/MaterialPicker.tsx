import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Material = {
  id: string;
  name: string;
  code: string;
  category?: string;
  subcategory?: string;
  vendor_category?: string;
  tax_code_type?: string;
  tax_code_value?: string;
  shop_name?: string;
  unit?: string;
  hsn_code?: string;
  sac_code?: string;
  rate?: number;
  created_at: string;
  updated_at: string;
};

type MaterialPickerProps = {
  onSelectTemplate: (material: Material) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function MaterialPicker({
  onSelectTemplate,
  open,
  onOpenChange,
}: MaterialPickerProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Load all materials on mount
  useEffect(() => {
    const loadMaterials = async () => {
      try {
        const response = await apiFetch("/api/materials", {
          headers: {},
        });
        if (response.ok) {
          const data = await response.json();
          const materialList = data.materials || [];
          setMaterials(materialList);
          setFilteredMaterials(materialList);
        } else {
          toast({
            title: "Error",
            description: "Failed to load materials",
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("Failed to load materials:", err);
        toast({
          title: "Error",
          description: "Failed to load materials",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      loadMaterials();
    }
  }, [open, toast]);

  // Filter materials based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredMaterials(materials);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = materials.filter((material) => {
      const name = material.name?.toLowerCase() || "";
      const code = material.code?.toLowerCase() || "";
      const category = material.category?.toLowerCase() || "";
      const subcategory = material.subcategory?.toLowerCase() || "";
      const shopName = material.shop_name?.toLowerCase() || "";
      const hsn = material.hsn_code?.toLowerCase() || "";
      const sac = material.sac_code?.toLowerCase() || "";

      return (
        name.includes(query) ||
        code.includes(query) ||
        category.includes(query) ||
        subcategory.includes(query) ||
        shopName.includes(query) ||
        hsn.includes(query) ||
        sac.includes(query)
      );
    });

    setFilteredMaterials(filtered);
  }, [searchQuery, materials]);

  const handleMaterialSelect = (material: Material) => {
    onSelectTemplate(material);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Material</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose a material from a shop to add to your BOQ
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="material-search">Search Materials</Label>
            <Input
              id="material-search"
              placeholder="Search by name, code, shop, category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mt-2"
            />
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
              <span>Loading materials...</span>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {materials.length === 0
                ? "No materials available"
                : "No materials match your search"}
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
              {filteredMaterials.map((material) => (
                <Button
                  key={material.id}
                  variant="outline"
                  onClick={() => handleMaterialSelect(material)}
                  className="w-full justify-start h-auto py-3 px-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="text-left w-full">
                    <div className="flex justify-between items-start">
                      <div className="font-bold text-gray-900">{material.name}</div>
                      <div className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {material.code}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {material.shop_name && (
                        <div className="text-xs font-semibold text-blue-700 flex items-center">
                          <span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5"></span>
                          {material.shop_name}
                        </div>
                      )}
                      {material.category && (
                        <div className="text-[11px] text-gray-500">
                          {material.category} {material.subcategory && ` → ${material.subcategory}`}
                        </div>
                      )}
                      {material.hsn_code && (
                        <div className="text-[10px] bg-amber-50 text-amber-700 px-1 rounded">HSN: {material.hsn_code}</div>
                      )}
                      {material.sac_code && (
                        <div className="text-[10px] bg-blue-50 text-blue-700 px-1 rounded">SAC: {material.sac_code}</div>
                      )}
                    </div>

                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 italic">
                      <div className="text-[11px] text-gray-500">
                        {material.unit || "unit"}
                      </div>
                      <div className="font-extrabold text-green-700">
                        ₹{Number(material.rate || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          )}

          {filteredMaterials.length > 0 && (
            <div className="text-[10px] text-gray-400 text-center uppercase tracking-widest">
              Showing {filteredMaterials.length} of {materials.length} available materials
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
