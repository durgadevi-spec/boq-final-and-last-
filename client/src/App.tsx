import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./lib/auth-context";
import { DataProvider } from "./lib/store";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import PendingApproval from "@/pages/PendingApproval";

import Dashboard from "@/pages/Dashboard";
import SoftwareDashboard from "@/pages/SoftwareDashboard";
import PurchaseDashboard from "@/pages/PurchaseDashboard";
import SupplierDashboard from "@/pages/SupplierDashboard";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import ManageMaterialsPage from "@/pages/admin/ManageMaterialsPage";
import SupplierApproval from "@/pages/SupplierApproval";
import MaterialSubmissionApproval from "@/pages/admin/MaterialSubmissionApproval";
import ManageProduct from "@/pages/admin/ManageProduct";
import VendorCategories from "@/pages/admin/VendorCategories";
import ManageCategories from "@/pages/admin/ManageCategories";
import BulkMaterialUpload from "@/pages/admin/BulkMaterialUpload";

import CivilWallEstimator from "@/pages/estimators/CivilWallEstimator";
import FlooringEstimator from "@/pages/estimators/FlooringEstimator";
import FalseCeilingEstimator from "@/pages/estimators/FalseCeilingEstimator";
import PaintingEstimator from "@/pages/estimators/PaintingEstimator";
import DoorsEstimator from "@/pages/estimators/DoorsEstimator";
import BlindsEstimator from "@/pages/estimators/BlindsEstimator";
import ElectricalEstimator from "@/pages/estimators/ElectricalEstimator";
import PlumbingEstimator from "@/pages/estimators/PlumbingEstimator";
import MSWorkEstimator from "@/pages/estimators/MSWorkEstimator";
import SSWorkEstimator from "@/pages/estimators/SSWorkEstimator";
import FireFightingEstimator from "@/pages/estimators/FireFightingEstimator";
import DynamicEstimator from "@/pages/estimators/DynamicEstimator";

import ItemMaster from "@/pages/ItemMaster";
import Subscription from "@/pages/Subscription";
import BoqReview from "@/pages/BoqReview";
import CreateBoq from "@/pages/CreateBoq";
import FinalizeBoq from "@/pages/FinalizeBoq";
import CreateProject from "@/pages/CreateProject";

import SupplierMaterials from "@/pages/supplier/SupplierMaterials";
import SupplierShops from "@/pages/supplier/SupplierShops";
import { SupplierSupport } from "@/pages/supplier/SupplierSupport";

function Router() {
  return (
    <Switch>
      {/* ================= PUBLIC ================= */}
      <Route path="/" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />

      {/* ✅ Pending approval page (MAIN) */}
      <Route path="/pending-approval" component={PendingApproval} />

      {/* ✅ Pending approval page (ALIAS) – fixes /supplier-pending 404 */}
      <Route path="/supplier-pending" component={PendingApproval} />

      {/* ================= DASHBOARDS ================= */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/software/dashboard" component={SoftwareDashboard} />
      <Route path="/purchase/dashboard" component={PurchaseDashboard} />
      <Route path="/supplier/dashboard" component={SupplierDashboard} />

      {/* ================= MISC ================= */}
      <Route path="/subscription" component={Subscription} />
      <Route path="/create-project" component={CreateProject} />
      <Route path="/create-bom" component={CreateBoq} />
      <Route path="/finalize-bom" component={FinalizeBoq} />
      <Route path="/item-master" component={ItemMaster} />
      <Route path="/bom-review" component={BoqReview} />

      {/* ================= ESTIMATORS ================= */}
      {/* Hardcoded estimators for predefined categories */}
      <Route path="/estimators/civil-wall" component={CivilWallEstimator} />
      <Route path="/estimators/flooring" component={FlooringEstimator} />
      <Route
        path="/estimators/false-ceiling"
        component={FalseCeilingEstimator}
      />
      <Route path="/estimators/painting" component={PaintingEstimator} />
      <Route path="/estimators/doors" component={DoorsEstimator} />
      <Route path="/estimators/blinds" component={BlindsEstimator} />
      <Route path="/estimators/electrical" component={ElectricalEstimator} />
      <Route path="/estimators/plumbing" component={PlumbingEstimator} />
      <Route path="/estimators/ms-work" component={MSWorkEstimator} />
      <Route path="/estimators/ss-work" component={SSWorkEstimator} />
      <Route
        path="/estimators/fire-fighting"
        component={FireFightingEstimator}
      />

      {/* Dynamic estimator for new database subcategories - fallback route */}
      <Route path="/estimators/:subcategory" component={DynamicEstimator} />

      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/manage-materials" component={ManageMaterialsPage} />
      <Route path="/admin/manage-categories" component={ManageCategories} />
      <Route path="/admin/bulk-material-upload" component={BulkMaterialUpload} />
      <Route path="/admin/manage-product" component={ManageProduct} />
      <Route path="/admin/vendor-categories" component={VendorCategories} />

      {/* ✅ Supplier Approval (MAIN) */}
      <Route path="/admin/supplier-approval" component={SupplierApproval} />

      {/* ✅ Supplier Approval (ALIAS) – fixes /admin/suppliers */}
      <Route path="/admin/suppliers" component={SupplierApproval} />

      <Route
        path="/admin/material-submissions"
        component={MaterialSubmissionApproval}
      />

      {/* ================= SUPPLIER ================= */}
      <Route path="/supplier/shops" component={SupplierShops} />
      <Route path="/supplier/materials" component={SupplierMaterials} />
      <Route path="/supplier/support" component={() => <SupplierSupport />} />
      <Route path="/supplier/dashboard" component={SupplierDashboard} />

      {/* ================= FALLBACK ================= */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DataProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </DataProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
