import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { PersistentNotificationDialog } from "@/components/common/PersistentNotificationDialog";
import { AndroidBackButtonHandler } from "@/hooks/useAndroidBackButton";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import LeaveRequests from "./pages/LeaveRequests";
import AttendanceHistory from "./pages/AttendanceHistory";
import AdminDashboard from "./pages/admin/AdminDashboard";
import TenantDashboard from "./pages/admin/TenantDashboard";
import Organizations from "./pages/admin/Organizations";
import OrganizationForm from "./pages/admin/OrganizationForm";
import OrganizationDetail from "./pages/admin/OrganizationDetail";
import UserManagement from "./pages/admin/UserManagement";
import RoleManagement from "./pages/admin/RoleManagement";
import AuditLogs from "./pages/admin/AuditLogs";
import Settings from "./pages/admin/Settings";
import SubscriptionManagement from "./pages/admin/SubscriptionManagement";
import MasterOffices from "./pages/admin/MasterOffices";
import MasterEmployees from "./pages/admin/MasterEmployees";
import MasterHolidays from "./pages/admin/MasterHolidays";
import LeaveApprovals from "./pages/admin/LeaveApprovals";
import NotificationManagement from "./pages/admin/NotificationManagement";
import DatabaseManagement from "./pages/admin/DatabaseManagement";
import PartitionMonitoring from "./pages/admin/PartitionMonitoring";
import FAQManagement from "./pages/admin/FAQManagement";
import SuperAdminLogin from "./pages/admin/SuperAdminLogin";
import OrganizationTypeSettings from "./pages/admin/OrganizationTypeSettings";
import HomepageLayoutSettings from "./pages/admin/HomepageLayoutSettings";
import NationalHolidaysManagement from "./pages/admin/NationalHolidaysManagement";
import ManualPaymentsManagement from "./pages/admin/ManualPaymentsManagement";
import TrialSettings from "./pages/admin/TrialSettings";
import SupabaseSettings from "./pages/admin/SupabaseSettings";
import BillingDashboard from "./pages/admin/billing/BillingDashboard";
import OPDManagement from "./pages/admin/master/OPDManagement";
import OPDAdminsManagement from "./pages/admin/master/OPDAdminsManagement";
import EmployeeImport from "./pages/admin/master/EmployeeImport";
// Organization Admin Pages
import OrgDashboard from "./pages/org/OrgDashboard";
import OrgOPDManagement from "./pages/org/master/OrgOPDManagement";
import OrgEmployeeInvitations from "./pages/org/OrgEmployeeInvitations";
import OrgLandingSettings from "./pages/org/OrgLandingSettings";
// Employee Pages
import EmployeeLogin from "./pages/employee/EmployeeLogin";
import EmployeeDashboardNew from "./pages/employee/EmployeeDashboardNew";
import EmployeeProfile from "./pages/employee/EmployeeProfile";
import EmployeeHelp from "./pages/employee/EmployeeHelp";
// Dashboard Pages (Web untuk pegawai)
import DashboardProfile from "./pages/dashboard/DashboardProfile";
import DashboardHelp from "./pages/dashboard/DashboardHelp";
import DashboardAttendanceHistory from "./pages/dashboard/DashboardAttendanceHistory";
import DashboardLeaveRequests from "./pages/dashboard/DashboardLeaveRequests";
import DashboardNotifications from "./pages/dashboard/DashboardNotifications";
// Org Login
import OrgLogin from "./pages/org/OrgLogin";
// Landing Pages
import OrganizationLanding from "./pages/landing/OrganizationLanding";
import NewsDetail from "./pages/news/NewsDetail";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import About from "./pages/About";
import OrgInstitutionTypesManagement from "./pages/org/master/OrgInstitutionTypesManagement";
import OrgWorkUnitsManagement from "./pages/org/master/OrgWorkUnitsManagement";
import OrgWorkLocationsManagement from "./pages/org/master/OrgWorkLocationsManagement";
import OrgPositionsManagement from "./pages/org/master/OrgPositionsManagement";
import OrgHolidaysManagement from "./pages/org/schedule/OrgHolidaysManagement";
import OrgNationalHolidaysManagement from "./pages/org/schedule/OrgNationalHolidaysManagement";
import OrgWorkHoursManagement from "./pages/org/schedule/OrgWorkHoursManagement";
import OrgAbsenceLimitsManagement from "./pages/org/schedule/OrgAbsenceLimitsManagement";
import OrgWfhScheduleManagement from "./pages/org/schedule/OrgWfhScheduleManagement";
import AttendanceSecuritySettings from "./pages/admin/AttendanceSecuritySettings";
import OrgActiveEmployees from "./pages/org/employees/OrgActiveEmployees";
import OrgInactiveEmployees from "./pages/org/employees/OrgInactiveEmployees";
import OrgLeaveRequests from "./pages/org/leave/OrgLeaveRequests";
import OrgApprovedLeaveList from "./pages/org/leave/OrgApprovedLeaveList";
import OrgSickLeaveList from "./pages/org/leave/OrgSickLeaveList";
import OrgOfficialTravelList from "./pages/org/leave/OrgOfficialTravelList";
import OrgAbsentWithoutNotice from "./pages/org/leave/OrgAbsentWithoutNotice";
import OrgWfhRequests from "./pages/org/leave/OrgWfhRequests";
import OrgFlexibleAttendanceRequests from "./pages/org/leave/OrgFlexibleAttendanceRequests";
import OrgAttendanceReport from "./pages/org/reports/OrgAttendanceReport";
import OrgRecapReport from "./pages/org/reports/OrgRecapReport";
import OrgSettings from "./pages/org/OrgSettings";
import OrgActivation from "./pages/org/OrgActivation";
import OrgProfileSetup from "./pages/org/OrgProfileSetup";
import OrgOPDAdminsManagement from "./pages/org/master/OrgOPDAdminsManagement";
import OrgEmployeeImport from "./pages/org/master/OrgEmployeeImport";
import OrgNewsManagement from "./pages/org/OrgNewsManagement";
import OrgNotificationManagement from "./pages/org/OrgNotificationManagement";
import OrgHelp from "./pages/org/OrgHelp";
import OrgAuditLog from "./pages/org/OrgAuditLog";
import OrgMutationRequests from "./pages/org/employees/OrgMutationRequests";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import NotFound from "./pages/NotFound";
import OrgOvertimeRequests from "./pages/org/leave/OrgOvertimeRequests";
import OrgOvertimeSettings from "./pages/org/schedule/OrgOvertimeSettings";
import FAQPage from "./pages/FAQ";
import FeedbackManagement from "./pages/admin/FeedbackManagement";
import StreakMonitoring from "./pages/admin/StreakMonitoring";
import AdminInstitutionTypesManagement from "./pages/admin/InstitutionTypesManagement";
import AttendanceStressTest from "./pages/admin/AttendanceStressTest";
import AttendanceReport from "./pages/admin/reports/AttendanceReport";
import RecapReport from "./pages/admin/reports/RecapReport";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AndroidBackButtonHandler />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/faq" element={<FAQPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth/forgot-password" element={<ForgotPassword />} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard" element={<EmployeeDashboard />} />
          <Route path="/dashboard/profile" element={<DashboardProfile />} />
          <Route path="/dashboard/help" element={<DashboardHelp />} />
          <Route path="/dashboard/attendance-history" element={<DashboardAttendanceHistory />} />
          <Route path="/dashboard/leave-requests" element={<DashboardLeaveRequests />} />
          <Route path="/dashboard/notifications" element={<DashboardNotifications />} />
          <Route path="/notifications" element={<DashboardNotifications />} />
          <Route path="/leave-requests" element={<LeaveRequests />} />
          <Route path="/attendance-history" element={<AttendanceHistory />} />
          
          {/* Super Admin Routes */}
          <Route path="/admin/login" element={<SuperAdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/dashboard" element={<TenantDashboard />} />
          <Route path="/admin/organizations" element={<Organizations />} />
          <Route path="/admin/organizations/new" element={<OrganizationForm />} />
          <Route path="/admin/organizations/:id" element={<OrganizationDetail />} />
          <Route path="/admin/organizations/:id/edit" element={<OrganizationForm />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/admin/roles" element={<RoleManagement />} />
          <Route path="/admin/profile" element={<Navigate to="/admin/settings" replace />} />
          <Route path="/admin/reports" element={<Navigate to="/admin/reports/attendance" replace />} />
          <Route path="/admin/reports/attendance" element={<AttendanceReport />} />
          <Route path="/admin/reports/recap" element={<RecapReport />} />
          <Route path="/admin/reports/audit" element={<AuditLogs />} />
          <Route path="/admin/settings" element={<Settings />} />
          <Route path="/admin/subscriptions" element={<SubscriptionManagement />} />
          <Route path="/admin/master/offices" element={<MasterOffices />} />
          <Route path="/admin/master/employees" element={<MasterEmployees />} />
          <Route path="/admin/schedule/holidays" element={<MasterHolidays />} />
          <Route path="/admin/leave-approvals" element={<LeaveApprovals />} />
          <Route path="/admin/notifications" element={<NotificationManagement />} />
          <Route path="/admin/database" element={<DatabaseManagement />} />
          <Route path="/admin/partition-monitoring" element={<PartitionMonitoring />} />
          <Route path="/admin/faq" element={<FAQManagement />} />
          <Route path="/admin/org-type-settings" element={<OrganizationTypeSettings />} />
          <Route path="/admin/homepage-layout" element={<HomepageLayoutSettings />} />
          <Route path="/admin/national-holidays" element={<NationalHolidaysManagement />} />
          <Route path="/admin/manual-payments" element={<ManualPaymentsManagement />} />
          <Route path="/admin/trial-settings" element={<TrialSettings />} />
          <Route path="/admin/supabase-settings" element={<SupabaseSettings />} />
          <Route path="/admin/attendance-security" element={<AttendanceSecuritySettings />} />
          <Route path="/admin/billing" element={<BillingDashboard />} />
          <Route path="/admin/feedback" element={<FeedbackManagement />} />
          <Route path="/admin/streak-monitoring" element={<StreakMonitoring />} />
          <Route path="/admin/master/opd" element={<OPDManagement />} />
          <Route path="/admin/master/opd-admins" element={<OPDAdminsManagement />} />
          <Route path="/admin/master/employee-import" element={<EmployeeImport />} />
          <Route path="/admin/institution-types" element={<AdminInstitutionTypesManagement />} />
          <Route path="/admin/stress-test" element={<AttendanceStressTest />} />
          
          {/* Organization Admin Routes */}
          <Route path="/org/login" element={<OrgLogin />} />
          <Route path="/org" element={<OrgDashboard />} />
          <Route path="/org/master/opd" element={<OrgOPDManagement />} />
          <Route path="/org/master/opd-admins" element={<OrgOPDAdminsManagement />} />
          <Route path="/org/master/institution-types" element={<OrgInstitutionTypesManagement />} />
          <Route path="/org/master/work-units" element={<OrgWorkUnitsManagement />} />
          <Route path="/org/master/work-locations" element={<OrgWorkLocationsManagement />} />
          <Route path="/org/master/positions" element={<OrgPositionsManagement />} />
          <Route path="/org/master/employee-import" element={<OrgEmployeeImport />} />
          <Route path="/org/schedule/national-holidays" element={<OrgNationalHolidaysManagement />} />
          <Route path="/org/schedule/holidays" element={<OrgHolidaysManagement />} />
          <Route path="/org/schedule/work-hours" element={<OrgWorkHoursManagement />} />
          <Route path="/org/schedule/absence-limits" element={<OrgAbsenceLimitsManagement />} />
          <Route path="/org/schedule/wfh" element={<OrgWfhScheduleManagement />} />
          <Route path="/org/employees/active" element={<OrgActiveEmployees />} />
          <Route path="/org/employees/inactive" element={<OrgInactiveEmployees />} />
          <Route path="/org/employees/mutations" element={<OrgMutationRequests />} />
          <Route path="/org/leave/requests" element={<OrgLeaveRequests />} />
          <Route path="/org/leave/approved" element={<OrgApprovedLeaveList />} />
          <Route path="/org/leave/sick" element={<OrgSickLeaveList />} />
          <Route path="/org/leave/official" element={<OrgOfficialTravelList />} />
          <Route path="/org/leave/absent" element={<OrgAbsentWithoutNotice />} />
          <Route path="/org/leave/wfh" element={<OrgWfhRequests />} />
          <Route path="/org/leave/flexible" element={<OrgFlexibleAttendanceRequests />} />
           <Route path="/org/leave/overtime" element={<OrgOvertimeRequests />} />
           <Route path="/org/schedule/overtime" element={<OrgOvertimeSettings />} />
          <Route path="/org/reports/attendance" element={<OrgAttendanceReport />} />
          <Route path="/org/reports/recap" element={<OrgRecapReport />} />
          <Route path="/org/settings" element={<OrgSettings />} />
          <Route path="/org/subscription" element={<Navigate to="/org/activation" replace />} />
          <Route path="/org/activation" element={<OrgActivation />} />
          <Route path="/org/profile/setup" element={<OrgProfileSetup />} />
          <Route path="/org/invitations" element={<OrgEmployeeInvitations />} />
          <Route path="/org/landing-settings" element={<OrgLandingSettings />} />
          <Route path="/org/news" element={<OrgNewsManagement />} />
          <Route path="/org/notifications" element={<OrgNotificationManagement />} />
          <Route path="/org/help" element={<OrgHelp />} />
          <Route path="/org/audit-log" element={<OrgAuditLog />} />
          {/* Employee Routes */}
          <Route path="/employee/login" element={<EmployeeLogin />} />
          <Route path="/employee/dashboard" element={<EmployeeDashboardNew />} />
          <Route path="/employee/profile" element={<EmployeeProfile />} />
          <Route path="/employee/help" element={<EmployeeHelp />} />
          <Route path="/employee/reset-password" element={<ResetPassword />} />
          
          {/* Organization Landing Page */}
          <Route path="/landing/:code" element={<OrganizationLanding />} />
          
          {/* News Detail Page */}
          <Route path="/news/:id" element={<NewsDetail />} />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
        <PersistentNotificationDialog />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;
