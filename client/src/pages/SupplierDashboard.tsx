import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useData } from "@/lib/store";
import { Layout } from "@/components/layout/Layout";
import {
  Card, 
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Clock, Building2, Loader2 } from "lucide-react";
import { AddShopForm } from "@/components/supplier/AddShopForm";
import { SupplierDashboardPage } from "@/pages/supplier/SupplierDashboardPage";
import { SupplierLayout } from "@/components/layout/SupplierLayout";

interface Shop {
  id: string;
  name: string;
  location?: string;
  approved?: boolean;
  city?: string;
  created_at?: string;
}

type SupplierStatus = 
  | "not-approved" 
  | "no-shop" 
  | "shop-pending" 
  | "shop-approved" 
  | "loading";

export default function SupplierDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useData();
  const [status, setStatus] = useState<SupplierStatus>("loading");
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== "supplier") {
      setLocation("/");
      return;
    }

    // Check supplier approval and shop status
    checkSupplierStatus();
  }, [user, setLocation]);

  const checkSupplierStatus = async () => {
    try {
      setLoading(true);

      // Check if supplier is approved
      if (user?.approved !== "approved") {
        setStatus("not-approved");
        setLoading(false);
        return;
      }

      // Load supplier's shops
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/supplier/my-shops", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        console.error("Failed to load shops");
        setStatus("no-shop");
        setLoading(false);
        return;
      }

      const data = await response.json();
      const supplierShops = data.shops || [];
      setShops(supplierShops);

      // Determine status based on shops
      if (supplierShops.length === 0) {
        setStatus("no-shop");
      } else {
        // Check if any shop is approved
        const approvedShop = supplierShops.find((s: Shop) => s.approved === true);
        if (approvedShop) {
          setStatus("shop-approved");
        } else {
          setStatus("shop-pending");
        }
      }
    } catch (error) {
      console.error("Error checking supplier status:", error);
      setStatus("no-shop");
    } finally {
      setLoading(false);
    }
  };

  const handleShopAdded = () => {
    setStatus("shop-pending");
    checkSupplierStatus();
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // STATUS: Supplier account not approved
  if (status === "not-approved") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
          <Card className="w-full max-w-md border-red-200 bg-white">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
              </div>
              <CardTitle className="text-red-600">Account Pending Review</CardTitle>
              <CardDescription>
                Your supplier account is awaiting approval
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-gray-700">
                  Thank you for registering as a supplier! Your account is
                  currently under review by our admin team. You'll receive an
                  email notification once your account is approved.
                </p>
              </div>

              {user?.approvalReason && (
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-xs font-semibold text-yellow-800 mb-1">
                    Reason for Rejection
                  </p>
                  <p className="text-sm text-yellow-700">{user.approvalReason}</p>
                </div>
              )}

              <div className="text-sm text-gray-600 space-y-2">
                <p>
                  <strong>What we're checking:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Business credentials and validity</li>
                  <li>GST registration details</li>
                  <li>Business address verification</li>
                  <li>Contact information</li>
                </ul>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 text-sm">
                <p className="text-blue-900">
                  <strong>Typical approval time:</strong> 24-48 hours
                </p>
              </div>

              <Button
                onClick={() => setLocation("/")}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Go to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      );
  }

  // STATUS: Supplier approved but no shop yet
  if (status === "no-shop") {
    return <AddShopForm onShopAdded={handleShopAdded} />;
  }

  // STATUS: Shop pending approval
  if (status === "shop-pending") {
    const pendingShop = shops.find((s) => !s.approved);

    return (
      
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 to-orange-50 p-4">
          <Card className="w-full max-w-md border-yellow-200 bg-white">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-yellow-100 rounded-full">
                  <Clock className="w-8 h-8 text-yellow-600" />
                </div>
              </div>
              <CardTitle className="text-yellow-600">
                Shop Under Review
              </CardTitle>
              <CardDescription>
                Your shop is awaiting approval
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingShop && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start gap-2 mb-3">
                    <Building2 className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-gray-900">
                        {pendingShop.name}
                      </p>
                      {pendingShop.city && (
                        <p className="text-xs text-gray-600">
                          {pendingShop.city}
                          {pendingShop.location && ` • ${pendingShop.location}`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-gray-700">
                  We're reviewing your shop details. Our team typically
                  completes this within 24-48 hours. You'll get an email
                  notification once your shop is approved.
                </p>
              </div>

              <div className="text-sm text-gray-600 space-y-2">
                <p>
                  <strong>We're verifying:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Shop name and location</li>
                  <li>Contact information</li>
                  <li>GST details</li>
                  <li>Business legitimacy</li>
                </ul>
              </div>

              <Button
                onClick={() => setLocation("/")}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Go to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      
    );
  }

  // STATUS: Shop approved - Show full dashboard
  if (status === "shop-approved") {
    const approvedShop = shops.find((s) => s.approved === true);

    return (
      <SupplierDashboardPage
        shopName={approvedShop?.name || "Shop"}
        shopLocation={approvedShop?.location || ""}
      />
    );
  }

  return null;
}

