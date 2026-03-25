import { useCallback } from "react";
import { useLocation, useNavigate, type NavigateOptions } from "react-router-dom";
import { buildAdminOrgOverlayHref } from "@/lib/adminOrgOverlay";

export function useAdminOrgContextNavigate() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (to: string, options?: NavigateOptions) => {
      navigate(buildAdminOrgOverlayHref(location.pathname, location.search, to), options);
    },
    [location.pathname, location.search, navigate],
  );
}
