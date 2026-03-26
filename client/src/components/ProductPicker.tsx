import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Product = {
  id: string;
  name: string;
  code: string;
  image?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  category_name?: string;
  subcategory_name?: string;
};

type ProductPickerProps = {
  onSelectProduct: (product: Product) => void;
  selectedProjectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const parseImages = (imageField: string | null | undefined): string[] => {
  if (!imageField) return [];
  try {
    if (imageField.startsWith('[')) return JSON.parse(imageField);
    return [imageField];
  } catch (e) {
    return [imageField];
  }
};

export default function ProductPicker({
  onSelectProduct,
  selectedProjectId,
  open,
  onOpenChange,
}: ProductPickerProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Load all products on mount
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await apiFetch("/api/products", {
          headers: {},
        });
        if (response.ok) {
          const data = await response.json();
          const productList = (data.products || []).map((p: any) => ({
            id: p.id, // Use base product ID
            name: p.name,
            code: p.code || "",
            image: p.image,
            category: p.category,
            subcategory: p.subcategory,
            category_name: p.category_name,
            subcategory_name: p.subcategory_name,
            description: p.description
          }));
          setProducts(productList);
          setFilteredProducts(productList);
        } else {
          toast({
            title: "Error",
            description: "Failed to load products",
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("Failed to load products:", err);
        toast({
          title: "Error",
          description: "Failed to load products",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [toast]);

  // Filter products based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProducts(products);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = products.filter((product) => {
      const name = product.name?.toLowerCase() || "";
      const category = product.category?.toLowerCase() || "";
      const subcategory = product.subcategory?.toLowerCase() || "";
      const categoryName = product.category_name?.toLowerCase() || "";
      const subcategoryName = product.subcategory_name?.toLowerCase() || "";
      const description = product.description?.toLowerCase() || "";

      return (
        name.includes(query) ||
        category.includes(query) ||
        subcategory.includes(query) ||
        categoryName.includes(query) ||
        subcategoryName.includes(query) ||
        description.includes(query)
      );
    });

    setFilteredProducts(filtered);
  }, [searchQuery, products]);

  const handleProductSelect = (product: Product) => {
    onSelectProduct(product);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Product</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="product-search">Search Products</Label>
            <Input
              id="product-search"
              placeholder="Search by product name, category, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mt-2"
            />
          </div>

          {loading ? (
            <div className="text-center py-8">Loading products...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {products.length === 0
                ? "No products available"
                : "No products match your search"}
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
              {filteredProducts.map((product) => (
                <Button
                  key={product.id}
                  variant="outline"
                  onClick={() => handleProductSelect(product)}
                  className="w-full justify-start h-auto py-3 px-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="flex items-center gap-4 w-full">
                    <div className="h-12 w-12 border rounded bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                      {product.image ? (
                        <img
                          src={parseImages(product.image)[0]}
                          alt=""
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <div className="text-[10px] text-gray-400 font-bold uppercase">No Icon</div>
                      )}
                    </div>
                    <div className="text-left space-y-1 flex-1 min-w-0">
                      <div className="font-semibold truncate">{product.name}</div>
                      <div className="text-[10px] text-gray-500 bg-gray-100/50 px-1.5 py-0.5 rounded-full inline-block">
                        {product.category_name && product.subcategory_name
                          ? `${product.category_name} → ${product.subcategory_name}`
                          : product.category
                            ? product.category
                            : "No category"}
                      </div>
                      {product.description && (
                        <div className="text-[10px] text-gray-600 italic truncate">
                          {product.description}
                        </div>
                      )}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          )}

          {filteredProducts.length > 0 && (
            <div className="text-xs text-gray-500 text-center">
              Showing {filteredProducts.length} of {products.length} products
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
