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
import ProductApprovals from "@/pages/admin/ProductApprovals";
import BomApprovals from "@/pages/admin/BomApprovals";
import AdminAccessControl from "@/pages/admin/AdminAccessControl";
import GeneratePO from "@/pages/GeneratePO";




import Subscription from "@/pages/Subscription";
import BoqReview from "@/pages/BoqReview";
import CreateBoq from "@/pages/CreateBoq";
import FinalizeBoq from "@/pages/FinalizeBoq";
import CreateProject from "@/pages/CreateProject";
import ProjectDashboard from "@/pages/ProjectDashboard";

import SketchPlans from "@/pages/SketchPlans";
import CreateSketchPlan from "@/pages/CreateSketchPlan";
import SketchTemplates from "@/pages/SketchTemplates";

import SupplierMaterials from "@/pages/supplier/SupplierMaterials";
import SupplierShops from "@/pages/supplier/SupplierShops";
import { SupplierSupport } from "@/pages/supplier/SupplierSupport";

import PurchaseOrders from "@/pages/PurchaseOrders";
import PurchaseOrderDetail from "@/pages/PurchaseOrderDetail";
import POApprovals from "@/pages/POApprovals";
import DeliveryTracker from "@/pages/DeliveryTracker";

import RaisePORequest from "@/pages/RaisePORequest";
import MyPORequests from "@/pages/MyPORequests";
import PORequestApprovals from "@/pages/admin/PORequestApprovals";
import ApprovedPORequests from "@/pages/admin/ApprovedPORequests";
import PORequestDetail from "@/pages/PORequestDetail";
import UserManual from "@/pages/UserManual";

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
      <Route path="/project-dashboard" component={ProjectDashboard} />
      <Route path="/bom-review" component={BoqReview} />
      <Route path="/user-manual" component={UserManual} />

      {/* ================= SKETCH A PLAN ================= */}
      <Route path="/sketch-plans" component={SketchPlans} />
      <Route path="/create-sketch-plan" component={CreateSketchPlan} />
      <Route path="/edit-sketch-plan/:id" component={CreateSketchPlan} />
      <Route path="/sketch-templates" component={SketchTemplates} />

      {/* ================= PROCUREMENT ================= */}
      <Route path="/purchase-orders" component={PurchaseOrders} />
      <Route path="/purchase-orders/:id" component={PurchaseOrderDetail} />
      <Route path="/po-approvals" component={POApprovals} />
      <Route path="/po-requests/:id" component={PORequestDetail} />
      <Route path="/delivery-tracker" component={DeliveryTracker} />

      {/* ================= PO REQUESTS ================= */}
      <Route path="/raise-po-request" component={RaisePORequest} />
      <Route path="/my-po-requests" component={MyPORequests} />
      <Route path="/admin/po-request-approvals" component={PORequestApprovals} />
      <Route path="/admin/approved-po-requests" component={ApprovedPORequests} />


      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/manage-materials" component={ManageMaterialsPage} />
      <Route path="/admin/manage-categories" component={ManageCategories} />
      <Route path="/admin/bulk-material-upload" component={BulkMaterialUpload} />
      <Route path="/admin/manage-product" component={ManageProduct} />
      <Route path="/admin/vendor-categories" component={VendorCategories} />
      <Route path="/admin/product-approvals" component={ProductApprovals} />
      <Route path="/admin/bom-approvals" component={BomApprovals} />
      <Route path="/admin/access-control" component={AdminAccessControl} />
      <Route path="/generate-po" component={GeneratePO} />

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
