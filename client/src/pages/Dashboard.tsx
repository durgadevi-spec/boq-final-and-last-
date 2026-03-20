import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Zap, Building2, MessageSquare, Trash2 } from "lucide-react";
import { useData } from "@/lib/store";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import SupplierMaterials from "@/pages/supplier/SupplierMaterials";

function ClientDashboard() {
  const { user } = useData();

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <div className="p-6 bg-primary/10 rounded-full">
          <Building2 className="w-12 h-12 text-primary" />
        </div>
        <h1 className="text-3xl font-bold font-heading">
          Welcome, {user?.username}
        </h1>
        <p className="text-muted-foreground max-w-md">
          Use the sidebar menu to navigate. If you believe you should have access to more features, please contact your administrator.
        </p>
      </div>
    </Layout>
  );
}

import apiFetch from "@/lib/api";

export default function Dashboard() {
  const { user } = useData();
  const [, setLocation] = useLocation();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setLocation("/");
      return;
    }

    if (user.username === "VoltAmpele@gmail.com") {
      setLocation("/admin/manage-product");
      return;
    }

    // Role-based redirects mapping
    switch (user.role) {
      case 'admin':
        setLocation("/admin/dashboard");
        return;
      case 'software_team':
        setLocation("/software/dashboard");
        return;
      case 'purchase_team':
        setLocation("/admin/dashboard");
        return;
      case 'supplier':
        setLocation("/supplier/dashboard");
        return;
      case 'product_manager':
        setLocation("/admin/dashboard?tab=create-product");
        return;
      default:
        break; // regular users proceed to check custom permissions
    }

    // Check dynamic access for regular user
    let cancelled = false;
    apiFetch('/api/my-permissions')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.isCustomManaged) {
          const modules = new Set(data.modules || []);
          if (!modules.has('dashboard')) {
             // Redirect or block if no access
             setHasAccess(false);
          } else {
             setHasAccess(true);
          }
        } else {
          // If not custom managed, fallback to true if role implies it
          setHasAccess(true); 
        }
      })
      .catch(() => {
        if (!cancelled) setHasAccess(true);
      });

    return () => { cancelled = true; };
  }, [user, setLocation]);

  if (!user) return null;
  
  if (hasAccess === false) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4">
          <div className="p-4 bg-red-50 text-red-600 rounded-full">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <h2 className="text-xl font-bold">Access Denied</h2>
          <p className="text-muted-foreground">You do not have permission to view this page.</p>
        </div>
      </Layout>
    );
  }

  // Still loading access check
  if (hasAccess === null) return <Layout><div className="flex justify-center p-8">Loading...</div></Layout>;

  // Client / User role 
  return <ClientDashboard />;
}
