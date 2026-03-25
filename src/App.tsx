import { Suspense, lazy, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { PersistentNotificationDialog } from "@/components/common/PersistentNotificationDialog";
import { ConfirmDialogProvider } from "@/components/common/ConfirmDialogProvider";
import { LocalhostProductionGuardBanner } from "@/components/common/LocalhostProductionGuardBanner";
import { AndroidBackButtonHandler } from "@/hooks/useAndroidBackButton";
import { PayrollRouteGuard } from "@/components/org/payroll/PayrollRouteGuard";
import { OrgHRRouteGuard } from "@/components/org/hr/OrgHRRouteGuard";
import { AndroidSessionSync } from "@/components/employee/AndroidSessionSync";

const queryClient = new QueryClient();
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const About = lazy(() => import("./pages/About"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const FAQPage = lazy(() => import("./pages/FAQ"));
const DownloadApk = lazy(() => import("./pages/DownloadApk"));
const HRLanding = lazy(() => import("./pages/HRLanding"));
const PayrollLanding = lazy(() => import("./pages/PayrollLanding"));
const Consultation = lazy(() => import("./pages/Consultation"));
const NewsIndex = lazy(() => import("./pages/news/NewsIndex"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const Organizations = lazy(() => import("./pages/admin/Organizations"));
const OrganizationForm = lazy(() => import("./pages/admin/OrganizationForm"));
const OrganizationDetail = lazy(() => import("./pages/admin/OrganizationDetail"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const RoleManagement = lazy(() => import("./pages/admin/RoleManagement"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const UatMonitoringPage = lazy(() => import("./pages/admin/UatMonitoringPage"));
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
const EmployeeNativeBootstrap = lazy(() => import("./pages/employee/EmployeeNativeBootstrap"));
const EmployeeDashboardNew = lazy(() => import("./pages/employee/EmployeeDashboardNew"));
const EmployeeDashboardReadonly = lazy(() => import("./pages/dashboard/EmployeeDashboardReadonly"));
const EmployeeProfile = lazy(() => import("./pages/employee/EmployeeProfile"));
const EmployeeHelp = lazy(() => import("./pages/employee/EmployeeHelp"));
const EmployeeBilling = lazy(() => import("./pages/employee/EmployeeBilling"));
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
const OrgHRHome = lazy(() => import("./pages/org/hr/OrgHRHome"));
const OrgHREmployees = lazy(() => import("./pages/org/hr/OrgHREmployees"));
const OrgHRStructure = lazy(() => import("./pages/org/hr/OrgHRStructure"));
const OrgHRPositionGrade = lazy(() => import("./pages/org/hr/OrgHRPositionGrade"));
const OrgPayrollHome = lazy(() => import("./pages/org/payroll/OrgPayrollHome"));
const OrgHRContracts = lazy(() => import("./pages/org/hr/OrgHRContracts"));
const OrgHRDocuments = lazy(() => import("./pages/org/hr/OrgHRDocuments"));
const OrgHRReports = lazy(() => import("./pages/org/hr/OrgHRReports"));
const OrgHRAttendanceInsights = lazy(() => import("./pages/org/hr/OrgHRAttendanceInsights"));
const OrgHRSettings = lazy(() => import("./pages/org/hr/OrgHRSettings"));
const OrgHRFAQ = lazy(() => import("./pages/org/hr/OrgHRFAQ"));
const OrgHRTickets = lazy(() => import("./pages/org/hr/OrgHRTickets"));
const OrgHRErrorLogs = lazy(() => import("./pages/org/hr/OrgHRErrorLogs"));
const OrgHRApprovalHierarchy = lazy(() => import("./pages/org/hr/OrgHRApprovalHierarchy"));
const OrgHRDocumentTemplates = lazy(() => import("./pages/org/hr/OrgHRDocumentTemplates"));
const OrgHREmployeeStatus = lazy(() => import("./pages/org/hr/OrgHREmployeeStatus"));
const OrgHRJobHistory = lazy(() => import("./pages/org/hr/OrgHRJobHistory"));
const OrgHROffboarding = lazy(() => import("./pages/org/hr/OrgHROffboarding"));
const OrgHROnboarding = lazy(() => import("./pages/org/hr/OrgHROnboarding"));
const OrgHRLateSettings = lazy(() => import("./pages/org/hr/OrgHRLateSettings"));
const OrgHRLeaveTypes = lazy(() => import("./pages/org/hr/OrgHRLeaveTypes"));
const OrgHRLeaveQuota = lazy(() => import("./pages/org/hr/OrgHRLeaveQuota"));
const OrgHRLeaveValidity = lazy(() => import("./pages/org/hr/OrgHRLeaveValidity"));
const OrgHRShifts = lazy(() => import("./pages/org/hr/OrgHRShifts"));
const OrgHRKpi = lazy(() => import("./pages/org/hr/OrgHRKpi"));
const OrgHRPerformancePeriods = lazy(() => import("./pages/org/hr/OrgHRPerformancePeriods"));
const OrgHRPerformanceForms = lazy(() => import("./pages/org/hr/OrgHRPerformanceForms"));
const OrgHRReview360 = lazy(() => import("./pages/org/hr/OrgHRReview360"));
const OrgHREvaluationResults = lazy(() => import("./pages/org/hr/OrgHREvaluationResults"));
const OrgHRTrainingData = lazy(() => import("./pages/org/hr/OrgHRTrainingData"));
const OrgHRCertifications = lazy(() => import("./pages/org/hr/OrgHRCertifications"));
const OrgHRSkillMatrix = lazy(() => import("./pages/org/hr/OrgHRSkillMatrix"));
const OrgHRRecruitmentJobs = lazy(() => import("./pages/org/hr/OrgHRRecruitmentJobs"));
const OrgHRRecruitmentCandidates = lazy(() => import("./pages/org/hr/OrgHRRecruitmentCandidates"));
const OrgHRRecruitmentInterviews = lazy(() => import("./pages/org/hr/OrgHRRecruitmentInterviews"));
const OrgHRRecruitmentOffers = lazy(() => import("./pages/org/hr/OrgHRRecruitmentOffers"));
const OrgHRESSRequests = lazy(() => import("./pages/org/hr/OrgHRESSRequests"));
const OrgHRESSAttendance = lazy(() => import("./pages/org/hr/OrgHRESSAttendance"));
const OrgHRESSDocuments = lazy(() => import("./pages/org/hr/OrgHRESSDocuments"));
const OrgHRESSProfile = lazy(() => import("./pages/org/hr/OrgHRESSProfile"));
const OrgHRPriorityWorkspace = lazy(() => import("./pages/org/hr/OrgHRPriorityWorkspace"));
const OrgPayrollPolicies = lazy(() => import("./pages/org/payroll/OrgPayrollPolicies"));
const OrgPayrollComplianceMaster = lazy(() => import("./pages/org/payroll/OrgPayrollComplianceMaster"));
const OrgPayrollPeriods = lazy(() => import("./pages/org/payroll/OrgPayrollPeriods"));
const OrgPayrollValidation = lazy(() => import("./pages/org/payroll/OrgPayrollValidation"));
const OrgPayrollEmployees = lazy(() => import("./pages/org/payroll/OrgPayrollEmployees"));
const OrgPayrollOrgGrade = lazy(() => import("./pages/org/payroll/OrgPayrollOrgGrade"));
const OrgPayrollIncomeComponents = lazy(() => import("./pages/org/payroll/OrgPayrollIncomeComponents"));
const OrgPayrollDeductionComponents = lazy(() => import("./pages/org/payroll/OrgPayrollDeductionComponents"));
const OrgPayrollVariableInput = lazy(() => import("./pages/org/payroll/OrgPayrollVariableInput"));
const OrgPayrollRunEngine = lazy(() => import("./pages/org/payroll/OrgPayrollRunEngine"));
const OrgPayrollApproval = lazy(() => import("./pages/org/payroll/OrgPayrollApproval"));
const OrgPayrollSlips = lazy(() => import("./pages/org/payroll/OrgPayrollSlips"));
const OrgPayrollPayment = lazy(() => import("./pages/org/payroll/OrgPayrollPayment"));
const OrgPayrollTaxCompliance = lazy(() => import("./pages/org/payroll/OrgPayrollTaxCompliance"));
const OrgPayrollReports = lazy(() => import("./pages/org/payroll/OrgPayrollReports"));
const OrgPayrollAuditLog = lazy(() => import("./pages/org/payroll/OrgPayrollAuditLog"));
const OrgPayrollSettings = lazy(() => import("./pages/org/payroll/OrgPayrollSettings"));
const OrgPayrollHelp = lazy(() => import("./pages/org/payroll/OrgPayrollHelp"));
const OrgPayrollRoles = lazy(() => import("./pages/org/payroll/OrgPayrollRoles"));
const OrgPayrollIntegrations = lazy(() => import("./pages/org/payroll/OrgPayrollIntegrations"));
const FeedbackManagement = lazy(() => import("./pages/admin/FeedbackManagement"));
const StreakMonitoring = lazy(() => import("./pages/admin/StreakMonitoring"));
const AdminInstitutionTypesManagement = lazy(() => import("./pages/admin/InstitutionTypesManagement"));
const AttendanceStressTest = lazy(() => import("./pages/admin/AttendanceStressTest"));
const AttendanceReport = lazy(() => import("./pages/admin/reports/AttendanceReport"));
const RecapReport = lazy(() => import("./pages/admin/reports/RecapReport"));
const AdminHRDashboard = lazy(() => import("./pages/admin/hr/AdminHRDashboard"));
const AdminHRTenants = lazy(() => import("./pages/admin/hr/AdminHRTenants"));
const AdminHRPolicies = lazy(() => import("./pages/admin/hr/AdminHRPolicies"));
const AdminHRErrorLogs = lazy(() => import("./pages/admin/hr/AdminHRErrorLogs"));
const AdminHRAudit = lazy(() => import("./pages/admin/hr/AdminHRAudit"));
const AdminHRSettings = lazy(() => import("./pages/admin/hr/AdminHRSettings"));
const AdminHRProfile = lazy(() => import("./pages/admin/hr/AdminHRProfile"));
const AdminHRHelp = lazy(() => import("./pages/admin/hr/AdminHRHelp"));
const AdminHRFAQ = lazy(() => import("./pages/admin/hr/AdminHRFAQ"));
const AdminHRSupport = lazy(() => import("./pages/admin/hr/AdminHRSupport"));
const AdminHRTickets = lazy(() => import("./pages/admin/hr/AdminHRTickets"));
const AdminHRSectionBridge = lazy(() => import("./pages/admin/hr/AdminHRSectionBridge"));
const AdminPayrollDashboard = lazy(() => import("./pages/admin/payroll/AdminPayrollDashboard"));
const AdminPayrollTenants = lazy(() => import("./pages/admin/payroll/AdminPayrollTenants"));
const AdminPayrollMonitoring = lazy(() => import("./pages/admin/payroll/AdminPayrollMonitoring"));
const AdminPayrollErrorLogs = lazy(() => import("./pages/admin/payroll/AdminPayrollErrorLogs"));
const AdminPayrollAudit = lazy(() => import("./pages/admin/payroll/AdminPayrollAudit"));
const AdminPayrollIntegrations = lazy(() => import("./pages/admin/payroll/AdminPayrollIntegrations"));
const AdminPayrollSettings = lazy(() => import("./pages/admin/payroll/AdminPayrollSettings"));
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

const withHrGuard = (routePath: string, element: ReactNode) => (
  <OrgHRRouteGuard routePath={routePath}>{element}</OrgHRRouteGuard>
);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConfirmDialogProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <LocalhostProductionGuardBanner />
            <AndroidBackButtonHandler />
            <AndroidSessionSync>
              <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/hr" element={<HRLanding />} />
              <Route path="/payroll" element={<PayrollLanding />} />
              <Route path="/konsultasi" element={<Consultation />} />
              <Route path="/news" element={<NewsIndex />} />
              <Route path="/faq" element={<FAQPage />} />
              <Route path="/download" element={<DownloadApk />} />
              <Route path="/download-apk" element={<Navigate to="/download" replace />} />
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
              <Route path="/admin/uat" element={<UatMonitoringPage workspaceMode="absensi" lockedDomain="absensi" autoRedirectByWorkspace />} />
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
              <Route path="/admin/homepage-layout/*" element={<Navigate to="/admin/homepage-layout" replace />} />
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
              <Route path="/admin/hr" element={<AdminHRDashboard />} />
              <Route path="/admin/hr/tenants" element={<AdminHRTenants />} />
              <Route path="/admin/hr/policies" element={<AdminHRPolicies />} />
              <Route path="/admin/hr/error-logs" element={<AdminHRErrorLogs />} />
              <Route path="/admin/hr/audit" element={<AdminHRAudit />} />
              <Route path="/admin/hr/uat" element={<UatMonitoringPage workspaceMode="hr" lockedDomain="hr" />} />
              <Route path="/admin/hr/settings" element={<AdminHRSettings />} />
              <Route path="/admin/hr/sections/struktur-organisasi" element={<Navigate to="/admin/hr/sections/struktur-unit-organisasi" replace />} />
              <Route path="/admin/hr/sections/departemen" element={<Navigate to="/admin/hr/sections/struktur-unit-organisasi" replace />} />
              <Route path="/admin/hr/sections/divisi" element={<Navigate to="/admin/hr/sections/struktur-unit-organisasi" replace />} />
              <Route path="/admin/hr/sections/jabatan" element={<Navigate to="/admin/hr/sections/jabatan-grade" replace />} />
              <Route path="/admin/hr/sections/lokasi-kerja" element={<Navigate to="/admin/hr/sections/lokasi-kalender-kerja" replace />} />
              <Route path="/admin/hr/sections/kalender-kerja" element={<Navigate to="/admin/hr/sections/lokasi-kalender-kerja" replace />} />
              <Route path="/admin/hr/sections/:sectionKey" element={<AdminHRSectionBridge />} />
              <Route path="/admin/hr/profile" element={<AdminHRProfile />} />
              <Route path="/admin/hr/faq" element={<Navigate to="/admin/hr/help/faq" replace />} />
              <Route path="/admin/hr/support" element={<Navigate to="/admin/hr/help/support" replace />} />
              <Route path="/admin/hr/tickets" element={<Navigate to="/admin/hr/help/tickets" replace />} />
              <Route path="/admin/hr/help" element={<AdminHRHelp />} />
              <Route path="/admin/hr/help/faq" element={<AdminHRFAQ />} />
              <Route path="/admin/hr/help/support" element={<AdminHRSupport />} />
              <Route path="/admin/hr/help/tickets" element={<AdminHRTickets />} />
              <Route path="/admin/payroll" element={<AdminPayrollDashboard />} />
              <Route path="/admin/payroll/tenants" element={<AdminPayrollTenants />} />
              <Route path="/admin/payroll/monitoring" element={<AdminPayrollMonitoring />} />
              <Route path="/admin/payroll/uat" element={<UatMonitoringPage workspaceMode="payroll" lockedDomain="payroll" />} />
              <Route path="/admin/payroll/error-logs" element={<AdminPayrollErrorLogs />} />
              <Route path="/admin/payroll/audit" element={<AdminPayrollAudit />} />
              <Route path="/admin/payroll/integrations" element={<AdminPayrollIntegrations />} />
              <Route path="/admin/payroll/settings" element={<AdminPayrollSettings />} />
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
              <Route path="/org/hr" element={withHrGuard("/org/hr", <OrgHRHome />)} />
              <Route path="/org/hr/employees" element={withHrGuard("/org/hr/employees", <OrgHREmployees />)} />
              <Route path="/org/hr/structure" element={withHrGuard("/org/hr/structure", <OrgHRStructure />)} />
              <Route path="/org/hr/position-grade" element={withHrGuard("/org/hr/position-grade", <OrgHRPositionGrade />)} />
              <Route path="/org/hr/contracts" element={withHrGuard("/org/hr/contracts", <OrgHRContracts />)} />
              <Route path="/org/hr/documents" element={withHrGuard("/org/hr/documents", <OrgHRDocuments />)} />
              <Route path="/org/hr/reports" element={withHrGuard("/org/hr/reports", <OrgHRReports />)} />
              <Route path="/org/hr/attendance-insights" element={withHrGuard("/org/hr/attendance-insights", <OrgHRAttendanceInsights />)} />
              <Route path="/org/hr/settings" element={withHrGuard("/org/hr/settings", <OrgHRSettings />)} />
              <Route path="/org/hr/priority" element={withHrGuard("/org/hr/priority", <OrgHRPriorityWorkspace />)} />
              <Route
                path="/org/hr/priority-workspace"
                element={withHrGuard("/org/hr/priority-workspace", <Navigate to="/org/hr/priority" replace />)}
              />
              <Route path="/org/hr/faq" element={withHrGuard("/org/hr/faq", <Navigate to="/org/hr/help/faq" replace />)} />
              <Route path="/org/hr/support" element={withHrGuard("/org/hr/support", <Navigate to="/org/hr/help/tickets" replace />)} />
              <Route path="/org/hr/tickets" element={withHrGuard("/org/hr/tickets", <Navigate to="/org/hr/help/tickets" replace />)} />
              <Route path="/org/hr/help" element={withHrGuard("/org/hr/help", <Navigate to="/org/hr/help/tickets" replace />)} />
              <Route path="/org/hr/help/faq" element={withHrGuard("/org/hr/help/faq", <OrgHRFAQ />)} />
              <Route path="/org/hr/help/support" element={withHrGuard("/org/hr/help/support", <Navigate to="/org/hr/help/tickets" replace />)} />
              <Route path="/org/hr/help/tickets" element={withHrGuard("/org/hr/help/tickets", <OrgHRTickets />)} />
              <Route path="/org/hr/help/error-logs" element={withHrGuard("/org/hr/help/error-logs", <OrgHRErrorLogs />)} />
              <Route path="/org/hr/notifications" element={withHrGuard("/org/hr/notifications", <Navigate to="/org/hr/settings" replace />)} />
              <Route path="/org/hr/dashboard-notifications" element={withHrGuard("/org/hr/dashboard-notifications", <Navigate to="/org/hr" replace />)} />
              <Route path="/org/hr/activity-log" element={withHrGuard("/org/hr/activity-log", <Navigate to="/org/hr/settings" replace />)} />
              <Route path="/org/hr/dashboard-activity" element={withHrGuard("/org/hr/dashboard-activity", <Navigate to="/org/hr" replace />)} />
              <Route path="/org/hr/company" element={withHrGuard("/org/hr/company", <Navigate to="/org/hr/structure" replace />)} />
              <Route path="/org/hr/departments" element={withHrGuard("/org/hr/departments", <Navigate to="/org/hr/structure" replace />)} />
              <Route path="/org/hr/divisions" element={withHrGuard("/org/hr/divisions", <Navigate to="/org/hr/structure" replace />)} />
              <Route path="/org/hr/work-locations" element={withHrGuard("/org/hr/work-locations", <Navigate to="/org/hr/structure" replace />)} />
              <Route path="/org/hr/work-calendar" element={withHrGuard("/org/hr/work-calendar", <Navigate to="/org/hr/structure" replace />)} />
              <Route path="/org/hr/employee-status" element={withHrGuard("/org/hr/employee-status", <OrgHREmployeeStatus />)} />
              <Route path="/org/hr/job-history" element={withHrGuard("/org/hr/job-history", <OrgHRJobHistory />)} />
              <Route path="/org/hr/offboarding" element={withHrGuard("/org/hr/offboarding", <OrgHROffboarding />)} />
              <Route path="/org/hr/leave-types" element={withHrGuard("/org/hr/leave-types", <OrgHRLeaveTypes />)} />
              <Route path="/org/hr/onboarding" element={withHrGuard("/org/hr/onboarding", <OrgHROnboarding />)} />
              <Route path="/org/hr/work-hours" element={withHrGuard("/org/hr/work-hours", <OrgWorkHoursManagement />)} />
              <Route path="/org/hr/shifts" element={withHrGuard("/org/hr/shifts", <OrgHRShifts />)} />
              <Route path="/org/hr/national-holidays" element={withHrGuard("/org/hr/national-holidays", <Navigate to="/org/hr/reports" replace />)} />
              <Route path="/org/hr/late-settings" element={withHrGuard("/org/hr/late-settings", <OrgHRLateSettings />)} />
              <Route path="/org/hr/attendance-integrations" element={withHrGuard("/org/hr/attendance-integrations", <Navigate to="/org/hr/reports" replace />)} />
              <Route path="/org/hr/attendance-recap" element={withHrGuard("/org/hr/attendance-recap", <Navigate to="/org/hr/reports" replace />)} />
              <Route path="/org/hr/leave-quota" element={withHrGuard("/org/hr/leave-quota", <OrgHRLeaveQuota />)} />
              <Route path="/org/hr/leave-approval" element={withHrGuard("/org/hr/leave-approval", <OrgLeaveRequests />)} />
              <Route path="/org/hr/mutation-approval" element={withHrGuard("/org/hr/mutation-approval", <OrgMutationRequests />)} />
              <Route path="/org/hr/leave-recap" element={withHrGuard("/org/hr/leave-recap", <Navigate to="/org/hr/reports" replace />)} />
              <Route path="/org/hr/leave-validity" element={withHrGuard("/org/hr/leave-validity", <OrgHRLeaveValidity />)} />
              <Route path="/org/hr/kpi" element={withHrGuard("/org/hr/kpi", <OrgHRKpi />)} />
              <Route path="/org/hr/performance-periods" element={withHrGuard("/org/hr/performance-periods", <OrgHRPerformancePeriods />)} />
              <Route path="/org/hr/performance-forms" element={withHrGuard("/org/hr/performance-forms", <OrgHRPerformanceForms />)} />
              <Route path="/org/hr/review-360" element={withHrGuard("/org/hr/review-360", <OrgHRReview360 />)} />
              <Route path="/org/hr/evaluation-results" element={withHrGuard("/org/hr/evaluation-results", <OrgHREvaluationResults />)} />
              <Route path="/org/hr/training-data" element={withHrGuard("/org/hr/training-data", <OrgHRTrainingData />)} />
              <Route path="/org/hr/certifications" element={withHrGuard("/org/hr/certifications", <OrgHRCertifications />)} />
              <Route path="/org/hr/skill-matrix" element={withHrGuard("/org/hr/skill-matrix", <OrgHRSkillMatrix />)} />
              <Route path="/org/hr/document-templates" element={withHrGuard("/org/hr/document-templates", <OrgHRDocumentTemplates />)} />
              <Route path="/org/hr/warning-letters" element={withHrGuard("/org/hr/warning-letters", <Navigate to="/org/hr/documents" replace />)} />
              <Route path="/org/hr/contract-templates" element={withHrGuard("/org/hr/contract-templates", <Navigate to="/org/hr/documents" replace />)} />
              <Route path="/org/hr/digital-signature" element={withHrGuard("/org/hr/digital-signature", <Navigate to="/org/hr/documents" replace />)} />
              <Route path="/org/hr/users" element={withHrGuard("/org/hr/users", <Navigate to="/org/hr/settings" replace />)} />
              <Route path="/org/hr/roles" element={withHrGuard("/org/hr/roles", <Navigate to="/org/hr/settings" replace />)} />
              <Route path="/org/hr/permissions" element={withHrGuard("/org/hr/permissions", <Navigate to="/org/hr/settings" replace />)} />
              <Route path="/org/hr/approval-hierarchy" element={withHrGuard("/org/hr/approval-hierarchy", <OrgHRApprovalHierarchy />)} />
              <Route path="/org/hr/general-settings" element={withHrGuard("/org/hr/general-settings", <Navigate to="/org/hr/settings" replace />)} />
              <Route path="/org/hr/branding" element={withHrGuard("/org/hr/branding", <Navigate to="/org/hr/settings" replace />)} />
              <Route path="/org/hr/import-export" element={withHrGuard("/org/hr/import-export", <Navigate to="/org/hr/settings" replace />)} />
              <Route path="/org/hr/backup" element={withHrGuard("/org/hr/backup", <Navigate to="/org/hr/settings" replace />)} />
              <Route path="/org/hr/recruitment/jobs" element={withHrGuard("/org/hr/recruitment/jobs", <OrgHRRecruitmentJobs />)} />
              <Route path="/org/hr/recruitment/candidates" element={withHrGuard("/org/hr/recruitment/candidates", <OrgHRRecruitmentCandidates />)} />
              <Route path="/org/hr/recruitment/interviews" element={withHrGuard("/org/hr/recruitment/interviews", <OrgHRRecruitmentInterviews />)} />
              <Route path="/org/hr/recruitment/offers" element={withHrGuard("/org/hr/recruitment/offers", <OrgHRRecruitmentOffers />)} />
              <Route path="/org/hr/ess/requests" element={withHrGuard("/org/hr/ess/requests", <OrgHRESSRequests />)} />
              <Route path="/org/hr/ess/leave-requests" element={withHrGuard("/org/hr/ess/leave-requests", <OrgLeaveRequests />)} />
              <Route path="/org/hr/ess/wfh-requests" element={withHrGuard("/org/hr/ess/wfh-requests", <OrgWfhRequests />)} />
              <Route path="/org/hr/ess/flexible-attendance" element={withHrGuard("/org/hr/ess/flexible-attendance", <OrgFlexibleAttendanceRequests />)} />
              <Route path="/org/hr/ess/overtime-requests" element={withHrGuard("/org/hr/ess/overtime-requests", <OrgOvertimeRequests />)} />
              <Route path="/org/hr/ess/attendance" element={withHrGuard("/org/hr/ess/attendance", <OrgHRESSAttendance />)} />
              <Route path="/org/hr/ess/documents" element={withHrGuard("/org/hr/ess/documents", <OrgHRESSDocuments />)} />
              <Route path="/org/hr/ess/profile" element={withHrGuard("/org/hr/ess/profile", <OrgHRESSProfile />)} />
              <Route path="/org/payroll" element={<PayrollRouteGuard permission="payroll.workspace.view"><OrgPayrollHome /></PayrollRouteGuard>} />
              <Route path="/org/payroll/employees" element={<PayrollRouteGuard permission="payroll.master.manage"><OrgPayrollEmployees /></PayrollRouteGuard>} />
              <Route path="/org/payroll/org-grade" element={<PayrollRouteGuard permission="payroll.master.manage"><OrgPayrollOrgGrade /></PayrollRouteGuard>} />
              <Route path="/org/payroll/income-components" element={<PayrollRouteGuard permission="payroll.master.manage"><OrgPayrollIncomeComponents /></PayrollRouteGuard>} />
              <Route path="/org/payroll/deduction-components" element={<PayrollRouteGuard permission="payroll.master.manage"><OrgPayrollDeductionComponents /></PayrollRouteGuard>} />
              <Route path="/org/payroll/policies" element={<PayrollRouteGuard permission="payroll.policy.manage"><OrgPayrollPolicies /></PayrollRouteGuard>} />
              <Route path="/org/payroll/compliance-master" element={<PayrollRouteGuard permission="payroll.master.manage"><OrgPayrollComplianceMaster /></PayrollRouteGuard>} />
              <Route path="/org/payroll/periods" element={<PayrollRouteGuard permission="payroll.period.manage"><OrgPayrollPeriods /></PayrollRouteGuard>} />
              <Route path="/org/payroll/variable-input" element={<PayrollRouteGuard permission="payroll.variable.manage"><OrgPayrollVariableInput /></PayrollRouteGuard>} />
              <Route path="/org/payroll/validation" element={<PayrollRouteGuard permission="payroll.validation.manage"><OrgPayrollValidation /></PayrollRouteGuard>} />
              <Route path="/org/payroll/run-engine" element={<PayrollRouteGuard permission="payroll.run.manage"><OrgPayrollRunEngine /></PayrollRouteGuard>} />
              <Route path="/org/payroll/approval" element={<PayrollRouteGuard permission="payroll.approval.manage"><OrgPayrollApproval /></PayrollRouteGuard>} />
              <Route path="/org/payroll/slips" element={<PayrollRouteGuard permission="payroll.slips.manage"><OrgPayrollSlips /></PayrollRouteGuard>} />
              <Route path="/org/payroll/payment" element={<PayrollRouteGuard permission="payroll.payment.manage"><OrgPayrollPayment /></PayrollRouteGuard>} />
              <Route path="/org/payroll/tax-compliance" element={<PayrollRouteGuard permission="payroll.tax.manage"><OrgPayrollTaxCompliance /></PayrollRouteGuard>} />
              <Route path="/org/payroll/reports" element={<PayrollRouteGuard permission="payroll.reports.view"><OrgPayrollReports /></PayrollRouteGuard>} />
              <Route path="/org/payroll/audit-log" element={<PayrollRouteGuard permission="payroll.audit.view"><OrgPayrollAuditLog /></PayrollRouteGuard>} />
              <Route path="/org/payroll/settings" element={<PayrollRouteGuard permission="payroll.integration.manage"><OrgPayrollSettings /></PayrollRouteGuard>} />
              <Route path="/org/payroll/help" element={<PayrollRouteGuard permission="payroll.workspace.view"><OrgPayrollHelp /></PayrollRouteGuard>} />
              <Route path="/org/payroll/roles" element={<PayrollRouteGuard permission="payroll.roles.manage"><OrgPayrollRoles /></PayrollRouteGuard>} />
              <Route path="/org/payroll/integrations" element={<PayrollRouteGuard permission="payroll.integration.manage"><OrgPayrollIntegrations /></PayrollRouteGuard>} />
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
              <Route path="/employee/native-bootstrap" element={<EmployeeNativeBootstrap />} />
              <Route path="/employee/dashboard" element={<EmployeeDashboardNew />} />
              <Route path="/employee/profile" element={<EmployeeProfile />} />
              <Route path="/employee/help" element={<EmployeeHelp />} />
              <Route path="/employee/billing" element={<EmployeeBilling />} />
              <Route path="/employee/reset-password" element={<ResetPassword />} />

              {/* Organization Landing Page */}
              <Route path="/landing/:code" element={<OrganizationLanding />} />

              {/* News Detail Page */}
              <Route path="/news/:id" element={<NewsDetail />} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AndroidSessionSync>
            <PersistentNotificationDialog />
          </BrowserRouter>
        </ConfirmDialogProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
