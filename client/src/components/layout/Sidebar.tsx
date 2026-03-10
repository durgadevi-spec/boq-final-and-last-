import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  BrickWall,
  DoorOpen,
  Cloud,
  Layers,
  PaintBucket,
  Blinds,
  Zap,
  Droplets,
  Hammer,
  ShieldAlert,
  Menu,
  X,
  LogOut,
  Settings,
  Package,
  MessageSquare,
  CheckCircle2,
  ShoppingCart,
  AlertCircle,
  Users,
  Tags,
  FolderKanban,
  Truck,
  FileText,
  ClipboardCheck,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useData } from "@/lib/store";
import apiFetch from "@/lib/api";

type SubcategoryItem = {
  id: string;
  name: string;
  href: string | null;
  icon: string;
  category: string;
};

const iconMap: Record<string, any> = {
  BrickWall: BrickWall,
  DoorOpen: DoorOpen,
  Cloud: Cloud,
  Layers: Layers,
  PaintBucket: PaintBucket,
  Blinds: Blinds,
  Zap: Zap,
  Droplets: Droplets,
  Hammer: Hammer,
  ShieldAlert: ShieldAlert,
};

const estimatorItems = [
  { icon: BrickWall, label: "Civil ", href: "/estimators/civil-wall" },
  { icon: DoorOpen, label: "Doors", href: "/estimators/doors" },
  { icon: Cloud, label: "False Ceiling", href: "/estimators/false-ceiling" },
  { icon: Layers, label: "Flooring", href: "/estimators/flooring" },
  { icon: PaintBucket, label: "Painting", href: "/estimators/painting" },
  { icon: Blinds, label: "Blinds", href: "/estimators/blinds" },
  { icon: Zap, label: "Electrical", href: "/estimators/electrical" },
  { icon: Droplets, label: "Plumbing", href: "/estimators/plumbing" },
  //{ icon: Hammer, label: "MS Work", href: "/estimators/ms-work" },
  //{ icon: Hammer, label: "SS Work", href: "/estimators/ss-work" },
  //{ icon: ShieldAlert, label: "Fire-Fighting", href: "/estimators/fire-fighting" },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(true);
  const [estSearch, setEstSearch] = useState("");
  const [subcategories, setSubcategories] = useState<SubcategoryItem[]>([]);
  const [loadingSubcategories, setLoadingSubcategories] = useState(true);
  const { user, logout, supportMessages, materialApprovalRequests } = useData();
  const [alertsCount, setAlertsCount] = useState(0);

  // Fetch pending counts from API
  const [pendingShopCount, setPendingShopCount] = useState(0);
  const [pendingMaterialCount, setPendingMaterialCount] = useState(0);
  const [pendingProductCount, setPendingProductCount] = useState(0);
  const [pendingBomCount, setPendingBomCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);

  // Fetch subcategories from API
  useEffect(() => {
    const loadSubcategories = async () => {
      try {
        setLoadingSubcategories(true);
        const response = await apiFetch("/api/sidebar-subcategories", {
          headers: {},
        });
        if (response.ok) {
          const data = await response.json();
          const items = data.subcategories || [];

          // Map subcategories to items with icons
          const mappedItems = items.map((item: SubcategoryItem) => ({
            ...item,
            icon: iconMap[item.icon] || Layers,
          }));

          setSubcategories(mappedItems);
        }
      } catch (error) {
        console.warn("Failed to load subcategories:", error);
        // Fallback to predefined items if API fails
        setSubcategories(estimatorItems.map(item => ({
          id: item.label,
          name: item.label,
          href: item.href,
          icon: Object.entries(iconMap).find(([_, icon]) => icon === item.icon)?.[0] || "Layers",
          category: "Estimators",
        })));
      } finally {
        setLoadingSubcategories(false);
      }
    };

    loadSubcategories();

    // Refresh subcategories every 30 seconds to pick up new database entries
    const interval = setInterval(loadSubcategories, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch('/alerts');
        if (!res || !res.ok) return setAlertsCount(0);
        const data = await res.json();
        if (cancelled) return;
        const list = data?.alerts || data || [];
        setAlertsCount(Array.isArray(list) ? list.length : 0);
      } catch (e) {
        console.warn('load alerts count failed', e);
        setAlertsCount(0);
      }
    };

    load();
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/shops-pending-approval");
        if (res.ok) {
          const data = await res.json();
          setPendingShopCount(
            (data?.shops || []).filter((r: any) => r.status === "pending")
              .length,
          );
        }
      } catch (e) {
        console.warn("load shop count failed", e);
      }
    })();
  }, []);

  // fetch pending product approvals count
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch("/api/product-approvals");
        if (!res || !res.ok) return setPendingProductCount(0);
        const data = await res.json();
        if (cancelled) return;
        setPendingProductCount((data?.approvals || []).filter((a: any) => a.status === "pending").length || 0);
      } catch (e) {
        console.warn("load product approval count failed", e);
        setPendingProductCount(0);
      }
    };

    load();
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  // fetch pending BOM approvals count
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch("/api/bom-approvals");
        if (!res || !res.ok) return setPendingBomCount(0);
        const data = await res.json();
        if (cancelled) return;
        setPendingBomCount((data?.approvals || []).filter((a: any) => a.status === "pending_approval" || a.status === "submitted").length || 0);
      } catch (e) {
        console.warn("load BOM approval count failed", e);
        setPendingBomCount(0);
      }
    };

    load();
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  // derive material pending count from central store (keeps counts consistent)
  useEffect(() => {
    try {
      if (!materialApprovalRequests) {
        setPendingMaterialCount(0);
        return;
      }
      setPendingMaterialCount(
        (materialApprovalRequests || []).filter(
          (r: any) => r.status === "pending",
        ).length,
      );
    } catch (e) {
      console.warn("compute material pending count failed", e);
      setPendingMaterialCount(0);
    }
  }, [materialApprovalRequests]);

  // derive message count from store-loaded support messages (prefer unread count)
  useEffect(() => {
    try {
      if (!supportMessages) {
        setMessageCount(0);
        return;
      }
      // count unread messages for admin view, otherwise count messages sent by the user
      const unread = (supportMessages || []).filter(
        (m: any) => m.is_read === false,
      ).length;
      setMessageCount(unread || (supportMessages || []).length);
    } catch (e) {
      console.warn("compute message count failed", e);
      setMessageCount(0);
    }
  }, [supportMessages]);

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const isAdminOrSoftware =
    user?.role === "admin" || user?.role === "software_team";
  const isPreSales = user?.role === "pre_sales";
  const isContractor = user?.role === "contractor";
  const isAdminOrSoftwareOrPurchaseTeam =
    user?.role === "admin" ||
    user?.role === "software_team" ||
    user?.role === "purchase_team";
  const isSupplierOrPurchase =
    user?.role === "supplier" || user?.role === "purchase_team";
  const isProductManager = user?.role === "product_manager";
  const isClient = user?.role === "user";

  // ✅ Supplier approval visible ONLY for admin
  const isAdminOnly = user?.role === "admin";

  // ✅ Create BOQ and Create Project visible for ADMIN, SOFTWARE TEAM and PRE_SALES
  const canCreateBOQAndProject =
    user?.role === "admin" || user?.role === "software_team" || isPreSales;

  const getAdminTab = () => {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("tab");
  };

  const currentAdminTab = getAdminTab();

  const filteredEstimators = estSearch
    ? subcategories.filter((item: any) =>
      (item.name || item.label).toLowerCase().includes(estSearch.toLowerCase()),
    )
    : subcategories;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </Button>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform bg-sidebar border-r border-sidebar-border transition-transform duration-200 ease-in-out md:translate-x-0 flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-center border-b border-sidebar-border bg-sidebar-primary/10">
          <h1 className="text-xl font-bold tracking-tight text-sidebar-primary font-heading">
            BUILD<span className="text-foreground">ESTIMATE</span>
          </h1>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {/* Overview Section */}
          <div className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Overview
          </div>
          {/* Dashboard Link - hidden for suppliers, pre-sales, contractors currently per existing logic */}
          {(!isPreSales && !isContractor && user?.role !== "supplier" && !isProductManager) && (
            <Link href="/dashboard">
              <span
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors mb-2 cursor-pointer",
                  location === "/dashboard"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </span>
            </Link>
          )}

          {isAdminOrSoftware && (
            <Link href="/project-dashboard">
              <span
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors mb-2 cursor-pointer",
                  location === "/project-dashboard"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
                onClick={() => setIsOpen(false)}
              >
                <FolderKanban className="h-4 w-4" /> Project Dashboard
              </span>
            </Link>
          )}

          {isAdminOnly && (
            <Link href="/admin/dashboard?tab=alerts">
              <span
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors mb-2 cursor-pointer",
                  currentAdminTab === "alerts"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
                onClick={() => setIsOpen(false)}
              >
                <AlertCircle className="h-4 w-4" /> Alerts
                {alertsCount > 0 && (
                  <Badge variant="destructive" className="ml-auto">
                    {alertsCount}
                  </Badge>
                )}
              </span>
            </Link>
          )}

          {/* Creations Section */}
          {(isAdminOrSoftwareOrPurchaseTeam || isPreSales || isProductManager) && (
            <>
              <div className="px-3 mb-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Creations
              </div>
              {isAdminOrSoftwareOrPurchaseTeam && !isPreSales && !isContractor && !isProductManager && (
                <Link href="/admin/dashboard?tab=materials">
                  <span
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      currentAdminTab === "materials"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <Package className="h-4 w-4" /> Create Item
                  </span>
                </Link>
              )}
              {(isAdminOrSoftwareOrPurchaseTeam || isPreSales || isProductManager) && (
                <Link href="/admin/dashboard?tab=create-product">
                  <span
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      (currentAdminTab === "create-product" || location === "/admin/dashboard?tab=create-product")
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <Package className="h-4 w-4" /> Create Product
                  </span>
                </Link>
              )}
              {canCreateBOQAndProject && !isProductManager && (
                <Link href="/create-project">
                  <span
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      location === "/create-project"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <Building2 className="h-4 w-4" /> Create Project
                  </span>
                </Link>
              )}
              {isAdminOrSoftwareOrPurchaseTeam && !isPreSales && !isContractor && !isProductManager && (
                <Link href="/admin/vendor-categories">
                  <span
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      location === "/admin/vendor-categories"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <Tags className="h-4 w-4" /> Create Vendor Category
                  </span>
                </Link>
              )}
            </>
          )}

          {/* Management Section */}
          {(isAdminOrSoftwareOrPurchaseTeam || isPreSales || isProductManager) && (
            <>
              <div className="px-3 mb-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Management
              </div>
              <Link href="/admin/manage-product">
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    location === "/admin/manage-product"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <Package className="h-4 w-4" /> Manage Product
                </span>
              </Link>
              {isAdminOrSoftwareOrPurchaseTeam && !isPreSales && !isContractor && !isProductManager && (
                <>
                  <Link href="/admin/manage-materials">
                    <span
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                        location === "/admin/manage-materials"
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                      onClick={() => setIsOpen(false)}
                    >
                      <Package className="h-4 w-4" /> Manage Materials
                    </span>
                  </Link>

                  <Link href="/admin/dashboard?tab=shops">
                    <span
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                        currentAdminTab === "shops"
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                      onClick={() => setIsOpen(false)}
                    >
                      <Building2 className="h-4 w-4" /> Manage Shops
                    </span>
                  </Link>

                  <Link href="/admin/manage-categories">
                    <span
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                        location === "/admin/manage-categories"
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                      onClick={() => setIsOpen(false)}
                    >
                      <Tags className="h-4 w-4" /> Manage Categories
                    </span>
                  </Link>

                  <Link href="/admin/bulk-material-upload">
                    <span
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                        location === "/admin/bulk-material-upload"
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                      onClick={() => setIsOpen(false)}
                    >
                      <Package className="h-4 w-4" /> Bulk Upload
                    </span>
                  </Link>
                </>
              )}
            </>
          )}

          {/* BOQ / Projects Section */}
          {(isAdminOrSoftware || isPreSales) && !isProductManager && (
            <>
              <div className="px-3 mb-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                BOQ / Projects
              </div>
              <Link href="/create-bom">
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    location === "/create-bom"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <ShoppingCart className="h-4 w-4" /> Generate BOM
                </span>
              </Link>
              <Link href="/generate-po">
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    location === "/generate-po"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <FileText className="h-4 w-4" /> Generate PO
                </span>
              </Link>
              {isAdminOrSoftware && (
                <Link href="/finalize-bom">
                  <span
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      location === "/finalize-bom"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Finalize BOQ
                  </span>
                </Link>
              )}
            </>
          )}

          {/* Procurement Section */}
          {(isAdminOrSoftware) && (
            <>
              <div className="px-3 mb-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Procurement
              </div>
              <Link href="/purchase-orders">
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    location === "/purchase-orders"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <FileText className="h-4 w-4" /> Purchase Orders
                  <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 h-3.5 border-amber-200 bg-amber-50 text-amber-700 font-medium tracking-wide leading-none flex items-center">
                    Under Const.
                  </Badge>
                </span>
              </Link>
              <Link href="/po-approvals">
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    location === "/po-approvals"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <ClipboardCheck className="h-4 w-4" /> PO Approvals
                  <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 h-3.5 border-amber-200 bg-amber-50 text-amber-700 font-medium tracking-wide leading-none flex items-center">
                    Under Const.
                  </Badge>
                </span>
              </Link>
            </>
          )}

          {/* PO Requests Section */}
          {!isContractor && user?.role !== "supplier" && (
            <>
              <div className="px-3 mb-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                PO Requests
              </div>
              <Link href="/raise-po-request">
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    location === "/raise-po-request"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <FileText className="h-4 w-4" /> Raise PO Request
                  <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 h-3.5 border-amber-200 bg-amber-50 text-amber-700 font-medium tracking-wide leading-none flex items-center">
                    Under Const.
                  </Badge>
                </span>
              </Link>
              <Link href="/my-po-requests">
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    location === "/my-po-requests"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <ClipboardCheck className="h-4 w-4" /> My Requests
                  <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 h-3.5 border-amber-200 bg-amber-50 text-amber-700 font-medium tracking-wide leading-none flex items-center">
                    Under Const.
                  </Badge>
                </span>
              </Link>
              {isAdminOrSoftware && (
                <>
                  <Link href="/admin/po-request-approvals">
                    <span
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                        location === "/admin/po-request-approvals"
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                      onClick={() => setIsOpen(false)}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Pending Approvals
                      <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 h-3.5 border-amber-200 bg-amber-50 text-amber-700 font-medium tracking-wide leading-none flex items-center">
                        Under Const.
                      </Badge>
                    </span>
                  </Link>
                  <Link href="/admin/approved-po-requests">
                    <span
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                        location === "/admin/approved-po-requests"
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                      onClick={() => setIsOpen(false)}
                    >
                      <ShoppingCart className="h-4 w-4" /> Approved Requests
                      <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 h-3.5 border-amber-200 bg-amber-50 text-amber-700 font-medium tracking-wide leading-none flex items-center">
                        Under Const.
                      </Badge>
                    </span>
                  </Link>
                </>
              )}
            </>
          )}

          {/* Approvals Section */}
          {(isAdminOrSoftwareOrPurchaseTeam || isProductManager) && !isPreSales && !isContractor && (
            <>
              <div className="px-3 mb-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Approvals
              </div>
              {!isProductManager && (
                <Link href="/admin/dashboard?tab=approvals">
                  <span
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      currentAdminTab === "approvals"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <ShieldAlert className="h-4 w-4" /> Shop Approvals
                    {pendingShopCount > 0 && (
                      <Badge variant="destructive" className="ml-auto">
                        {pendingShopCount}
                      </Badge>
                    )}
                  </span>
                </Link>
              )}

              {!isProductManager && (
                <Link href="/admin/dashboard?tab=material-approvals">
                  <span
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      currentAdminTab === "material-approvals"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Material Approvals
                    {pendingMaterialCount > 0 && (
                      <Badge variant="destructive" className="ml-auto">
                        {pendingMaterialCount}
                      </Badge>
                    )}
                  </span>
                </Link>
              )}


              {/* Supplier approvals (admin only) */}
              {isAdminOnly && (
                <Link href="/admin/suppliers">
                  <span
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      location === "/admin/suppliers"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <Users className="h-4 w-4" /> Supplier Approvals
                  </span>
                </Link>
              )}

              {/* Product approvals (admin + software_team + product_manager) */}
              {(isAdminOrSoftware || isProductManager) && (
                <Link href="/admin/product-approvals">
                  <span
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      location === "/admin/product-approvals"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <FolderKanban className="h-4 w-4" /> Product Approvals
                    {pendingProductCount > 0 && (
                      <Badge variant="destructive" className="ml-auto">
                        {pendingProductCount}
                      </Badge>
                    )}
                  </span>
                </Link>
              )}

              {/* BOM approvals (admin + software_team) */}
              {isAdminOrSoftware && (
                <Link href="/admin/bom-approvals">
                  <span
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      location === "/admin/bom-approvals"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <CheckCircle2 className="h-4 w-4" /> BOM Approvals
                    {pendingBomCount > 0 && (
                      <Badge variant="destructive" className="ml-auto">
                        {pendingBomCount}
                      </Badge>
                    )}
                  </span>
                </Link>
              )}
            </>
          )}
          {/* Communication Section */}
          {isAdminOrSoftwareOrPurchaseTeam && !isPreSales && !isContractor && !isProductManager && (
            <>
              <div className="px-3 mb-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Communication
              </div>
              <Link href="/admin/dashboard?tab=messages">
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    currentAdminTab === "messages"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <MessageSquare className="h-4 w-4" /> Messages
                  {messageCount > 0 && (
                    <Badge variant="secondary" className="ml-auto">
                      {messageCount}
                    </Badge>
                  )}
                </span>
              </Link>
            </>
          )}

          {/* Supplier Role Sections */}
          {!isPreSales && !isContractor && user?.role === "supplier" ? (
            <>
              <div className="px-3 mb-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Supplier
              </div>
              <Link href="/supplier/shops">
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    location === "/supplier/shops"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <Building2 className="h-4 w-4" /> Add Shop
                </span>
              </Link>
              <Link href="/supplier/materials">
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    location === "/supplier/materials"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <Package className="h-4 w-4" /> Manage Materials
                </span>
              </Link>
            </>
          ) : null}

          {/* Other Resources Section */}
          {!isPreSales && !isContractor && (
            <>
              <div className="mt-6 px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Resources
              </div>
              <Link href="/subscription">
                <span className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer">
                  <Package className="h-4 w-4" />
                  Subscription
                </span>
              </Link>
              <Link href="/user-manual">
                <span className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                  location === "/user-manual"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}>
                  <BookOpen className="h-4 w-4" />
                  User Manual
                </span>
              </Link>
            </>
          )}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-sidebar-primary font-bold">
              {(user as any)?.fullName?.[0]?.toUpperCase() ||
                (user as any)?.username?.[0]?.toUpperCase() ||
                "U"}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium text-sidebar-foreground truncate">
                {(user as any)?.fullName || (user as any)?.username || "Guest"}
              </span>
              <span className="text-xs text-muted-foreground truncate capitalize">
                {user?.role?.replace("_", " ") || "Visitor"}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" /> Log Out
          </Button>
        </div>
      </aside>
    </>
  );
}
