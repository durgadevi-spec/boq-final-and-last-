import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus } from "lucide-react";

const COUNTRY_CODES = [
  { code: "+91", country: "India" },
  { code: "+1", country: "USA" },
  { code: "+44", country: "UK" },
  { code: "+61", country: "Australia" },
  { code: "+971", country: "UAE" },
  { code: "+81", country: "Japan" },
  { code: "+49", country: "Germany" },
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

const Required = () => <span className="text-red-500 ml-1">*</span>;

export default function SupplierShops() {
  const { toast } = useToast();
  const [shops, setShops] = useState<any[]>([]);
  const [loadingShops, setLoadingShops] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    location: "",
    city: "",
    phoneCountryCode: "+91",
    contactNumber: "",
    state: "Tamil Nadu",
    country: "India",
    pincode: "",
    gstNo: "",
    new_location: "",
    terms_and_conditions: "",
  });

  // Load supplier's shops on mount
  useEffect(() => {
    loadSupplierShops();
  }, []);

  const loadSupplierShops = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/supplier/my-shops", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        console.error("load shops failed", response.status);
        setShops([]);
        return;
      }
      const data = await response.json();
      setShops(data.shops || []);
    } catch (error) {
      console.error("Error loading shops:", error);
      setShops([]);
    } finally {
      setLoadingShops(false);
    }
  };

  const handleSubmitShop = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Shop name is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.location.trim() || !formData.city.trim()) {
      toast({
        title: "Error",
        description: "Location and city are required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.contactNumber.trim()) {
      toast({
        title: "Error",
        description: "Contact number is required",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/shops", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("submit shop failed", response.status, text);
        throw new Error(`Failed to submit shop (${response.status})`);
      }

      const data = await response.json();
      toast({
        title: "Success",
        description: "Shop submitted for approval. Admin will review and approve it.",
      });

      // Reset form
      setFormData({
        name: "",
        location: "",
        city: "",
        phoneCountryCode: "+91",
        contactNumber: "",
        state: "Tamil Nadu",
        country: "India",
        pincode: "",
        gstNo: "",
        new_location: "",
        terms_and_conditions: "",
      });
      setShowForm(false);

      // Reload shops
      loadSupplierShops();
    } catch (error) {
      console.error("Error submitting shop:", error);
      toast({
        title: "Error",
        description: "Failed to submit shop",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">My Shops</h1>
          <p className="text-gray-600">
            Add and manage your shops. Submit for approval to appear in the system.
          </p>
        </div>

        <div className="grid gap-8">
          {/* Add Shop Button */}
          {!showForm && (
            <Button
              onClick={() => setShowForm(true)}
              className="w-fit bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" /> Add New Shop
            </Button>
          )}

          {/* Shop Form */}
          {showForm && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-blue-900 flex items-center gap-2">
                  <Building2 className="h-5 w-5" /> Add New Shop
                </CardTitle>
                <CardDescription className="text-blue-800">
                  Fill in your shop details and submit for approval
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitShop} className="space-y-6">
                  {/* Shop Name */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>
                        Shop Name <Required />
                      </Label>
                      <Input
                        placeholder="Enter shop name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Address <Required />
                      </Label>
                      <Input
                        placeholder="Enter address"
                        value={formData.location}
                        onChange={(e) =>
                          setFormData({ ...formData, location: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* New Location and City */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Input
                        placeholder="Enter location"
                        value={formData.new_location}
                        onChange={(e) =>
                          setFormData({ ...formData, new_location: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>
                        City <Required />
                      </Label>
                      <Input
                        placeholder="Enter city"
                        value={formData.city}
                        onChange={(e) =>
                          setFormData({ ...formData, city: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* State and Country */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Select
                        value={formData.state}
                        onValueChange={(value) =>
                          setFormData({ ...formData, state: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDIAN_STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Country</Label>
                      <Input
                        placeholder="Enter country"
                        value={formData.country}
                        onChange={(e) =>
                          setFormData({ ...formData, country: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* Pincode */}
                  <div className="space-y-2">
                    <Label>Pincode</Label>
                    <Input
                      placeholder="Enter pincode"
                      value={formData.pincode}
                      onChange={(e) =>
                        setFormData({ ...formData, pincode: e.target.value })
                      }
                    />
                  </div>

                  {/* Phone Number */}
                  <div className="space-y-2">
                    <Label>
                      Phone Number <Required />
                    </Label>
                    <div className="flex gap-2">
                      <Select
                        value={formData.phoneCountryCode}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            phoneCountryCode: value,
                          })
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
                        placeholder="Enter phone number"
                        value={formData.contactNumber}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            contactNumber: e.target.value,
                          })
                        }
                        type="tel"
                        className="flex-1"
                      />
                    </div>
                  </div>

                  {/* GST and Terms */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>GST Number</Label>
                      <Input
                        placeholder="Enter GST number"
                        value={formData.gstNo}
                        onChange={(e) =>
                          setFormData({ ...formData, gstNo: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Terms and Conditions</Label>
                      <Input
                        placeholder="Enter terms and conditions"
                        value={formData.terms_and_conditions}
                        onChange={(e) =>
                          setFormData({ ...formData, terms_and_conditions: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* Submit Buttons */}
                  <div className="flex gap-3">
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {submitting ? "Submitting..." : "Submit for Approval"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowForm(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* My Shops List */}
          {!loadingShops && shops.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>My Shops ({shops.length})</CardTitle>
                <CardDescription>
                  List of your submitted and approved shops
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {shops.map((shop: any) => (
                    <div
                      key={shop.id}
                      className="p-4 border rounded-lg flex items-start justify-between"
                    >
                      <div>
                        <h3 className="font-semibold text-sm">{shop.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {shop.location}, {shop.city}
                          {shop.state && `, ${shop.state}`}
                          {shop.country && `, ${shop.country}`}
                        </p>
                        {shop.new_location && (
                          <p className="text-xs text-muted-foreground italic">
                            Alt Location: {shop.new_location}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {shop.phoneCountryCode} {shop.contactNumber}
                        </p>
                        {shop.gstNo && (
                          <p className="text-xs text-muted-foreground">
                            GST: {shop.gstNo}
                          </p>
                        )}
                        {shop.terms_and_conditions && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                             T&C: {shop.terms_and_conditions}
                          </p>
                        )}
                      </div>
                      <Badge variant={shop.approved ? "default" : "secondary"}>
                        {shop.approved ? "Approved" : "Pending"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {!loadingShops && shops.length === 0 && !showForm && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-gray-500">
                  No shops submitted yet. Click "Add New Shop" to get started.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
