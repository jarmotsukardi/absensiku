import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { PersistentNotificationDialog } from "@/components/common/PersistentNotificationDialog";
import { ConfirmDialogProvider } from "@/components/common/ConfirmDialogProvider";
import { AndroidBackButtonHandler } from "@/hooks/useAndroidBackButton";

const queryClient = new QueryClient();
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const About = lazy(() => import("./pages/About"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const FAQPage = lazy(() => import("./pages/FAQ"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const Organizations = lazy(() => import("./pages/admin/Organizations"));
const OrganizationForm = lazy(() => import("./pages/admin/OrganizationForm"));
const OrganizationDetail = lazy(() => import("./pages/admin/OrganizationDetail"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const RoleManagement = lazy(() => import("./pages/admin/RoleManagement"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const SubscriptionManagement = lazy(() => import("./pages/admin/SubscriptionManagement"));
const MasterOffices = lazy(() => import("./pages/admin/MasterOffices"));
const MasterEmployees = lazy(() => import("./pages/admin/MasterEmployees"));
const MasterHolidays = lazy(() => import("./pages/admin/MasterHolidays"));
const LeaveApprovals = lazy(() => import("./pages/admin/LeaveApprovals"));
const NotificationManagement = lazy(() => import("./pages/admin/NotificationManagement"));
const PartitionMonitoring = lazy(() => import("./pages/admin/PartitionMonitoring"));
const FAQManagement = lazy(() => import("./pages/admin/FAQManagement"));
const SuperAdminLogin = lazy(() => import("./pages/admin/SuperAdminLogin"));
const OrganizationTypeSettings = lazy(() => import("./pages/admin/OrganizationTypeSettings"));
const HomepageLayoutSettings = lazy(() => import("./pages/admin/HomepageLayoutSettings"));
const NationalHolidaysManagement = lazy(() => import("./pages/admin/NationalHolidaysManagement"));
const ManualPaymentsManagement = lazy(() => import("./pages/admin/ManualPaymentsManagement"));
const BillingDashboard = lazy(() => import("./pages/admin/billing/BillingDashboard"));
const OPDManagement = lazy(() => import("./pages/admin/master/OPDManagement"));
const OPDAdminsManagement = lazy(() => import("./pages/admin/master/OPDAdminsManagement"));
const EmployeeImport = lazy(() => import("./pages/admin/master/EmployeeImport"));
const AdminAbsenceLimitsManagement = lazy(() => import("./pages/admin/schedule/AbsenceLimitsManagement"));
const OrgOnboardingTemplates = lazy(() => import("./pages/admin/OrgOnboardingTemplates"));
const OrgDashboard = lazy(() => import("./pages/org/OrgDashboard"));
const OrgOnboardingSetup = lazy(() => import("./pages/org/OrgOnboardingSetup"));
const OrgOPDManagement = lazy(() => import("./pages/org/master/OrgOPDManagement"));
const OrgEmployeeInvitations = lazy(() => import("./pages/org/OrgEmployeeInvitations"));
const EmployeeLogin = lazy(() => import("./pages/employee/EmployeeLogin"));
const EmployeeDashboardNew = lazy(() => import("./pages/employee/EmployeeDashboardNew"));
const EmployeeDashboardReadonly = lazy(() => import("./pages/dashboard/EmployeeDashboardReadonly"));
const EmployeeProfile = lazy(() => import("./pages/employee/EmployeeProfile"));
const EmployeeHelp = lazy(() => import("./pages/employee/EmployeeHelp"));
const OrgLogin = lazy(() => import("./pages/org/OrgLogin"));
const OrganizationLanding = lazy(() => import("./pages/landing/OrganizationLanding"));
const NewsDetail = lazy(() => import("./pages/news/NewsDetail"));
const OrgInstitutionTypesManagement = lazy(() => import("./pages/org/master/OrgInstitutionTypesManagement"));
const OrgWorkUnitsManagement = lazy(() => import("./pages/org/master/OrgWorkUnitsManagement"));
const OrgWorkLocationsManagement = lazy(() => import("./pages/org/master/OrgWorkLocationsManagement"));
const OrgPositionsManagement = lazy(() => import("./pages/org/master/OrgPositionsManagement"));
const OrgEmployeeCategoriesManagement = lazy(() => import("./pages/org/master/OrgEmployeeCategoriesManagement"));
const OrgEmployeeGolonganManagement = lazy(() => import("./pages/org/master/OrgEmployeeGolonganManagement"));
const OrgHolidaysManagement = lazy(() => import("./pages/org/schedule/OrgHolidaysManagement"));
const OrgNationalHolidaysManagement = lazy(() => import("./pages/org/schedule/OrgNationalHolidaysManagement"));
const OrgWorkHoursManagement = lazy(() => import("./pages/org/schedule/OrgWorkHoursManagement"));
const OrgAbsenceLimitsManagement = lazy(() => import("./pages/org/schedule/OrgAbsenceLimitsManagement"));
const OrgWfhScheduleManagement = lazy(() => import("./pages/org/schedule/OrgWfhScheduleManagement"));
const AttendanceSecuritySettings = lazy(() => import("./pages/admin/AttendanceSecuritySettings"));
const OrgActiveEmployees = lazy(() => import("./pages/org/employees/OrgActiveEmployees"));
const OrgInactiveEmployees = lazy(() => import("./pages/org/employees/OrgInactiveEmployees"));
const OrgLeaveRequests = lazy(() => import("./pages/org/leave/OrgLeaveRequests"));
const OrgApprovedLeaveList = lazy(() => import("./pages/org/leave/OrgApprovedLeaveList"));
const OrgSickLeaveList = lazy(() => import("./pages/org/leave/OrgSickLeaveList"));
const OrgOfficialTravelList = lazy(() => import("./pages/org/leave/OrgOfficialTravelList"));
const OrgAbsentWithoutNotice = lazy(() => import("./pages/org/leave/OrgAbsentWithoutNotice"));
const OrgWfhRequests = lazy(() => import("./pages/org/leave/OrgWfhRequests"));
const OrgFlexibleAttendanceRequests = lazy(() => import("./pages/org/leave/OrgFlexibleAttendanceRequests"));
const OrgAttendanceReport = lazy(() => import("./pages/org/reports/OrgAttendanceReport"));
const OrgRecapReport = lazy(() => import("./pages/org/reports/OrgRecapReport"));
const OrgLeaveReport = lazy(() => import("./pages/org/reports/OrgLeaveReport"));
const OrgOvertimeReport = lazy(() => import("./pages/org/reports/OrgOvertimeReport"));
const OrgFlexibleReport = lazy(() => import("./pages/org/reports/OrgFlexibleReport"));
const OrgMutationReport = lazy(() => import("./pages/org/reports/OrgMutationReport"));
const OrgSettings = lazy(() => import("./pages/org/OrgSettings"));
const OrgAdminOperatorSettings = lazy(() => import("./pages/org/OrgAdminOperatorSettings"));
const OrgProfile = lazy(() => import("./pages/org/OrgProfile"));
const OrgBilling = lazy(() => import("./pages/org/OrgBilling"));
const OrgProfileSetup = lazy(() => import("./pages/org/OrgProfileSetup"));
const OrgOPDAdminsManagement = lazy(() => import("./pages/org/master/OrgOPDAdminsManagement"));
const OrgEmployeeImport = lazy(() => import("./pages/org/master/OrgEmployeeImport"));
const OrgNewsManagement = lazy(() => import("./pages/org/OrgNewsManagement"));
const OrgNotificationManagement = lazy(() => import("./pages/org/OrgNotificationManagement"));
const OrgHelp = lazy(() => import("./pages/org/OrgHelp"));
const OrgSupportTickets = lazy(() => import("./pages/org/OrgSupportTickets"));
const OrgAuditLog = lazy(() => import("./pages/org/OrgAuditLog"));
const OrgMutationRequests = lazy(() => import("./pages/org/employees/OrgMutationRequests"));
const OrgOvertimeRequests = lazy(() => import("./pages/org/leave/OrgOvertimeRequests"));
const OrgOvertimeSettings = lazy(() => import("./pages/org/schedule/OrgOvertimeSettings"));
const FeedbackManagement = lazy(() => import("./pages/admin/FeedbackManagement"));
const StreakMonitoring = lazy(() => import("./pages/admin/StreakMonitoring"));
const AdminInstitutionTypesManagement = lazy(() => import("./pages/admin/InstitutionTypesManagement"));
const AttendanceStressTest = lazy(() => import("./pages/admin/AttendanceStressTest"));
const AttendanceReport = lazy(() => import("./pages/admin/reports/AttendanceReport"));
const RecapReport = lazy(() => import("./pages/admin/reports/RecapReport"));
const DatabaseManagement = lazy(() => import("./pages/admin/DatabaseManagement"));
const TrialSettings = lazy(() => import("./pages/admin/TrialSettings"));
const SupabaseSettings = lazy(() => import("./pages/admin/SupabaseSettings"));
const CronJobsInfo = lazy(() => import("./pages/admin/CronJobsInfo"));
const AdminProfile = lazy(() => import("./pages/admin/AdminProfile"));
const ErrorLogs = lazy(() => import("./pages/admin/ErrorLogs"));

const RouteLoadingFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <p className="text-sm text-muted-foreground">Memuat halaman...</p>
  </div>
);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConfirmDialogProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AndroidBackButtonHandler />
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/faq" element={<FAQPage />} />
              <Route path="/about" element={<About />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/forgot-password" element={<ForgotPassword />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard" element={<EmployeeDashboardReadonly />} />
              <Route path="/dashboard/profile" element={<Navigate to="/dashboard?tab=profile" replace />} />
              <Route path="/dashboard/help" element={<Navigate to="/dashboard?tab=help" replace />} />
              <Route path="/dashboard/attendance-history" element={<Navigate to="/dashboard?tab=history" replace />} />
              <Route path="/dashboard/leave-requests" element={<Navigate to="/dashboard?tab=requests" replace />} />
              <Route path="/dashboard/notifications" element={<Navigate to="/dashboard?tab=notifications" replace />} />
              <Route path="/notifications" element={<Navigate to="/dashboard?tab=notifications" replace />} />
              <Route path="/leave-requests" element={<Navigate to="/dashboard?tab=requests" replace />} />
              <Route path="/attendance-history" element={<Navigate to="/dashboard?tab=history" replace />} />

              {/* Super Admin Routes */}
              <Route path="/admin/login" element={<SuperAdminLogin />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/organizations" element={<Organizations />} />
              <Route path="/admin/organizations/new" element={<OrganizationForm />} />
              <Route path="/admin/organizations/:id" element={<OrganizationDetail />} />
              <Route path="/admin/organizations/:id/edit" element={<OrganizationForm />} />
              <Route path="/admin/users" element={<UserManagement />} />
              <Route path="/admin/roles" element={<RoleManagement />} />
              <Route path="/admin/profile" element={<AdminProfile />} />
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
              <Route path="/admin/database-management" element={<Navigate to="/admin/database" replace />} />
              <Route path="/admin/partition-monitoring" element={<PartitionMonitoring />} />
              <Route path="/admin/faq" element={<FAQManagement />} />
              <Route path="/admin/org-type-settings" element={<OrganizationTypeSettings />} />
              <Route path="/admin/homepage-layout" element={<HomepageLayoutSettings />} />
              <Route path="/admin/national-holidays" element={<NationalHolidaysManagement />} />
              <Route path="/admin/manual-payments" element={<ManualPaymentsManagement />} />
              <Route path="/admin/trial-settings" element={<TrialSettings />} />
              <Route path="/admin/supabase-settings" element={<SupabaseSettings />} />
              <Route path="/admin/cron-jobs" element={<CronJobsInfo />} />
              <Route path="/admin/attendance-security" element={<AttendanceSecuritySettings />} />
              <Route path="/admin/billing" element={<BillingDashboard />} />
              <Route path="/admin/feedback" element={<FeedbackManagement />} />
              <Route path="/admin/help/tickets" element={<FeedbackManagement />} />
              <Route path="/admin/streak-monitoring" element={<StreakMonitoring />} />
              <Route path="/admin/log-errors" element={<ErrorLogs />} />
              <Route path="/admin/master/opd" element={<OPDManagement />} />
              <Route path="/admin/master/opd-admins" element={<OPDAdminsManagement />} />
              <Route path="/admin/master/employee-import" element={<EmployeeImport />} />
              <Route path="/admin/schedule/absence-limits" element={<AdminAbsenceLimitsManagement />} />
              <Route path="/admin/templates" element={<OrgOnboardingTemplates />} />
              <Route path="/admin/institution-types" element={<AdminInstitutionTypesManagement />} />
              <Route path="/admin/stress-test" element={<AttendanceStressTest />} />

              {/* Organization Admin Routes */}
              <Route path="/org/login" element={<OrgLogin />} />
              <Route path="/org" element={<OrgDashboard />} />
              <Route path="/org/dashboard" element={<Navigate to="/org" replace />} />
              <Route path="/org/onboarding" element={<OrgOnboardingSetup />} />
              <Route path="/org/master/opd" element={<OrgOPDManagement />} />
              <Route path="/org/master/opd-admins" element={<OrgOPDAdminsManagement />} />
              <Route path="/org/master/institution-types" element={<OrgInstitutionTypesManagement />} />
              <Route path="/org/master/work-units" element={<OrgWorkUnitsManagement />} />
              <Route path="/org/master/work-locations" element={<OrgWorkLocationsManagement />} />
              <Route path="/org/master/positions" element={<OrgPositionsManagement />} />
              <Route path="/org/master/employee-categories" element={<OrgEmployeeCategoriesManagement />} />
              <Route path="/org/master/employee-golongan" element={<OrgEmployeeGolonganManagement />} />
              <Route path="/org/master/employee-import" element={<Navigate to="/org/employees/import" replace />} />
              <Route path="/org/master" element={<Navigate to="/org/master/opd" replace />} />
              <Route path="/org/master/work-hours" element={<Navigate to="/org/schedule/work-hours" replace />} />
              <Route path="/org/employees" element={<Navigate to="/org/employees/active" replace />} />
              <Route path="/org/schedule/national-holidays" element={<OrgNationalHolidaysManagement />} />
              <Route path="/org/schedule/holidays" element={<OrgHolidaysManagement />} />
              <Route path="/org/schedule/work-hours" element={<OrgWorkHoursManagement />} />
              <Route path="/org/schedule/absence-limits" element={<OrgAbsenceLimitsManagement />} />
              <Route path="/org/schedule/wfh" element={<OrgWfhScheduleManagement />} />
              <Route path="/org/employees/active" element={<OrgActiveEmployees />} />
              <Route path="/org/employees/inactive" element={<OrgInactiveEmployees />} />
              <Route path="/org/employees/import" element={<OrgEmployeeImport />} />
              <Route path="/org/employees/mutations" element={<OrgMutationRequests />} />
              <Route path="/org/leave" element={<Navigate to="/org/leave/requests" replace />} />
              <Route path="/org/leave/requests" element={<OrgLeaveRequests />} />
              <Route path="/org/leave/approved" element={<OrgApprovedLeaveList />} />
              <Route path="/org/leave/sick" element={<OrgSickLeaveList />} />
              <Route path="/org/leave/official" element={<OrgOfficialTravelList />} />
              <Route path="/org/leave/official-travel" element={<Navigate to="/org/leave/official" replace />} />
              <Route path="/org/leave/absent" element={<OrgAbsentWithoutNotice />} />
              <Route path="/org/leave/wfh" element={<OrgWfhRequests />} />
              <Route path="/org/leave/flexible" element={<OrgFlexibleAttendanceRequests />} />
              <Route path="/org/leave/overtime" element={<OrgOvertimeRequests />} />
              <Route path="/org/schedule/overtime" element={<OrgOvertimeSettings />} />
              <Route path="/org/reports/attendance-recap" element={<Navigate to="/org/reports/attendance" replace />} />
              <Route path="/org/reports" element={<Navigate to="/org/reports/leave" replace />} />
              <Route path="/org/reports/requests" element={<Navigate to="/org/reports/leave" replace />} />
              <Route path="/org/reports/attendance" element={<OrgAttendanceReport />} />
              <Route path="/org/reports/recap" element={<OrgRecapReport />} />
              <Route path="/org/reports/leave" element={<OrgLeaveReport />} />
              <Route path="/org/reports/overtime" element={<OrgOvertimeReport />} />
              <Route path="/org/reports/flexible" element={<OrgFlexibleReport />} />
              <Route path="/org/reports/mutations" element={<OrgMutationReport />} />
              <Route path="/org/settings" element={<OrgSettings />} />
              <Route path="/org/settings/admin-operator" element={<OrgAdminOperatorSettings />} />
              <Route path="/org/profile" element={<OrgProfile />} />
              <Route path="/org/subscription" element={<Navigate to="/org/billing" replace />} />
              <Route path="/org/activation" element={<Navigate to="/org/billing" replace />} />
              <Route path="/org/billing" element={<OrgBilling />} />
              <Route path="/org/profile/setup" element={<OrgProfileSetup />} />
              <Route path="/org/invitations" element={<OrgEmployeeInvitations />} />
              <Route path="/org/landing-settings" element={<Navigate to="/org/settings?tab=landing" replace />} />
              <Route path="/org/news" element={<OrgNewsManagement />} />
              <Route path="/org/notifications" element={<OrgNotificationManagement />} />
              <Route path="/org/help" element={<Navigate to="/org/help/faq" replace />} />
              <Route path="/org/help/faq" element={<OrgHelp />} />
              <Route path="/org/help/support" element={<OrgHelp />} />
              <Route path="/org/help/tickets" element={<OrgSupportTickets />} />
              <Route path="/org/audit-log" element={<OrgAuditLog />} />
              {/* Employee Routes */}
              <Route path="/employee" element={<Navigate to="/employee/login" replace />} />
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
            </Suspense>
            <PersistentNotificationDialog />
          </BrowserRouter>
        </ConfirmDialogProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
