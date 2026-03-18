import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { useToast } from "@/hooks/use-toast";
import { Building2, AlertCircle, CheckCircle2 } from "lucide-react";

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

interface AddShopFormProps {
  onShopAdded?: (shop: any) => void;
}

export function AddShopForm({ onShopAdded }: AddShopFormProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

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

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
        description: "Address and city are required",
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
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to create shop");
      }

      const data = await response.json();
      toast({
        title: "Success",
        description:
          "Shop submitted for approval! You will be notified once it's approved.",
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

      if (onShopAdded) {
        onShopAdded(data.shop);      
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to create shop",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="w-full max-w-2xl">
        {/* Header Section */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-blue-100 rounded-full">
              <Building2 size={32} className="text-blue-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Add Your Shop
          </h1>
          <p className="text-gray-600">
            Complete your supplier profile by adding your shop details
          </p>
        </div>

        {/* Info Card */}
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 mb-1">
                  Shop Approval Required
                </p>
                <p className="text-sm text-gray-700">
                  After you submit your shop details, our team will review
                  them. You'll be notified once your shop is approved and you
                  can start managing materials.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form Card */}
        <Card>
          <CardHeader>
            <CardTitle>Shop Information</CardTitle>
            <CardDescription>
              Provide accurate details about your shop
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitShop} className="space-y-6">
              {/* Shop Name */}
              <div>
                <Label htmlFor="name">
                  Shop Name
                  <Required />
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your shop name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  required
                  className="mt-2"
                />
              </div>

              {/* Address and City */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location">
                    Address
                    <Required />
                  </Label>
                  <Input
                    id="location"
                    type="text"
                    placeholder="Enter shop address"
                    value={formData.location}
                    onChange={(e) =>
                      handleInputChange("location", e.target.value)
                    }
                    required
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="city">
                    City
                    <Required />
                  </Label>
                  <Input
                    id="city"
                    type="text"
                    placeholder="Enter city"
                    value={formData.city}
                    onChange={(e) => handleInputChange("city", e.target.value)}
                    required
                    className="mt-2"
                  />
                </div>
              </div>

              {/* New Location and Pincode */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="new_location">Location</Label>
                  <Input
                    id="new_location"
                    type="text"
                    placeholder="Enter additional location info"
                    value={formData.new_location}
                    onChange={(e) =>
                      handleInputChange("new_location", e.target.value)
                    }
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="pincode">Pin Code</Label>
                  <Input
                    id="pincode"
                    type="text"
                    placeholder="Enter pin code"
                    value={formData.pincode}
                    onChange={(e) =>
                      handleInputChange("pincode", e.target.value)
                    }
                    className="mt-2"
                  />
                </div>
              </div>

              {/* State and Country */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="state">State</Label>
                  <Select
                    value={formData.state}
                    onValueChange={(value) => handleInputChange("state", value)}
                  >
                    <SelectTrigger className="mt-2">
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
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    type="text"
                    placeholder="Enter country"
                    value={formData.country}
                    onChange={(e) =>
                      handleInputChange("country", e.target.value)
                    }
                    className="mt-2"
                  />
                </div>
              </div>

              {/* Contact Number */}
              <div>
                <Label>
                  Contact Number
                  <Required />
                </Label>
                <div className="flex gap-2 mt-2">
                  <Select
                    value={formData.phoneCountryCode}
                    onValueChange={(value) =>
                      handleInputChange("phoneCountryCode", value)
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {item.code} {item.country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="tel"
                    placeholder="Phone number"
                    value={formData.contactNumber}
                    onChange={(e) =>
                      handleInputChange("contactNumber", e.target.value)
                    }
                    required
                    className="flex-1"
                  />
                </div>
              </div>

              {/* GST Number */}
              <div>
                <Label htmlFor="gstNo">GST Number</Label>
                <Input
                  id="gstNo"
                  type="text"
                  placeholder="Enter GST number (optional)"
                  value={formData.gstNo}
                  onChange={(e) => handleInputChange("gstNo", e.target.value)}
                  className="mt-2"
                />
              </div>

              {/* Terms and Conditions */}
              <div>
                <Label htmlFor="terms_and_conditions">Terms and Conditions</Label>
                <Input
                  id="terms_and_conditions"
                  type="text"
                  placeholder="Enter terms and conditions"
                  value={formData.terms_and_conditions}
                  onChange={(e) =>
                    handleInputChange("terms_and_conditions", e.target.value)
                  }
                  className="mt-2"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Submitting...
                  </>
                ) : (
                  "Submit for Approval"
                )}
              </Button>
            </form>

            {/* Bottom Info */}
            <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200">
              <div className="flex gap-3">
                <CheckCircle2 className="text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700">
                  <strong>What happens next?</strong> After submitting your shop
                  details, our approval team will review them within 24-48 hours.
                
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
