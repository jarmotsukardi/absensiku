import { useCallback } from "react";
import { useLocation, useNavigate, type NavigateOptions } from "react-router-dom";
import { buildOrgHrOverlayHref } from "@/lib/orgHrOverlay";

export function useOrgHrContextNavigate() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (to: string, options?: NavigateOptions) => {
      navigate(buildOrgHrOverlayHref(location.pathname, location.search, to), options);
    },
    [location.pathname, location.search, navigate],
  );
}
