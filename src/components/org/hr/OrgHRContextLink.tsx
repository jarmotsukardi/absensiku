import { forwardRef } from "react";
import { Link, useLocation, type LinkProps } from "react-router-dom";
import { buildOrgHrOverlayHref } from "@/lib/orgHrOverlay";

type OrgHRContextLinkProps = Omit<LinkProps, "to"> & {
  to: string;
};

export const OrgHRContextLink = forwardRef<HTMLAnchorElement, OrgHRContextLinkProps>(
  ({ to, ...props }, ref) => {
    const location = useLocation();
    const nextTo = buildOrgHrOverlayHref(location.pathname, location.search, to);

    return <Link ref={ref} to={nextTo} {...props} />;
  },
);

OrgHRContextLink.displayName = "OrgHRContextLink";
