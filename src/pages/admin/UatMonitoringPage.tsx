import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { UatMonitoringSettings } from "@/components/admin/settings/UatMonitoringSettings";
import { UAT_DOMAIN_LABELS, type UatDomain } from "@/lib/uatChecklistDomains";
import { getStoredSuperAdminWorkspaceMode, type SuperAdminWorkspaceMode } from "@/lib/superAdminWorkspace";

interface UatMonitoringPageProps {
  workspaceMode?: SuperAdminWorkspaceMode;
  lockedDomain?: UatDomain;
  autoRedirectByWorkspace?: boolean;
}

export default function UatMonitoringPage({
  workspaceMode = "absensi",
  lockedDomain,
  autoRedirectByWorkspace = false,
}: UatMonitoringPageProps) {
  const navigate = useNavigate();
  const storedWorkspaceMode = getStoredSuperAdminWorkspaceMode();
  const domainLabel = lockedDomain ? UAT_DOMAIN_LABELS[lockedDomain] : "Lintas Domain";
  const redirectTarget =
    autoRedirectByWorkspace
      ? storedWorkspaceMode === "hr"
        ? "/admin/hr/uat"
        : storedWorkspaceMode === "payroll"
          ? "/admin/payroll/uat"
          : null
      : null;

  useEffect(() => {
    if (!redirectTarget) {
      return;
    }

    navigate(redirectTarget, { replace: true });
  }, [navigate, redirectTarget]);

  if (redirectTarget) {
    return null;
  }

  return (
    <SuperAdminLayout
      title={lockedDomain ? `Monitoring UAT ${domainLabel}` : "Monitoring UAT"}
      subtitle={
        lockedDomain
          ? `Pantau hasil uji UAT ${domainLabel}, logbook batch, dan gate kesiapan rilis untuk workspace ini.`
          : "Pantau hasil uji UAT per domain, logbook batch, dan gate kesiapan rilis."
      }
      workspaceMode={workspaceMode}
    >
      <Helmet>
        <title>{lockedDomain ? `Admin - Monitoring UAT ${domainLabel} | AbsensiKu` : "Admin - Monitoring UAT | AbsensiKu"}</title>
        <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
        <meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet" />
      </Helmet>
      <UatMonitoringSettings lockedDomain={lockedDomain} />
    </SuperAdminLayout>
  );
}
