import { useEffect, useState } from "react";
import { resolveHrPageAccess, type HrPageAccessResolution } from "@/lib/hrPageAccess";
import { reportError } from "@/lib/errorLogger";

const FALLBACK_ACCESS: HrPageAccessResolution = {
  allowed: false,
  role: "unknown",
  ref: "HR-ACT-UNKNOWN",
  reason: "Capability halaman HR belum dapat diverifikasi.",
  redirectTo: "/org",
  pagePath: "",
  label: "Halaman HR",
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canExport: false,
  canConfigure: false,
  canApprove: false,
};

export function useHrPageAccess(pagePath: string) {
  const [access, setAccess] = useState<HrPageAccessResolution>({
    ...FALLBACK_ACCESS,
    pagePath,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!pagePath) {
      setAccess({
        ...FALLBACK_ACCESS,
        pagePath: "",
      });
      setIsLoading(false);
      return;
    }

    let mounted = true;
    setIsLoading(true);

    const run = async () => {
      try {
        const nextAccess = await resolveHrPageAccess(pagePath);
        if (!mounted) return;
        setAccess(nextAccess);
      } catch (error) {
        const ref = reportError(error, "hr.page_access.hook", { page_path: pagePath });
        if (!mounted) return;
        setAccess({
          ...FALLBACK_ACCESS,
          pagePath,
          ref: ref || FALLBACK_ACCESS.ref,
          reason: "Terjadi error saat memuat capability halaman HR.",
        });
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [pagePath]);

  return { access, isLoading };
}
