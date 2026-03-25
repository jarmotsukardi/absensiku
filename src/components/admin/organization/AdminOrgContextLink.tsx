import { forwardRef } from "react";
import { Link, useLocation, type LinkProps } from "react-router-dom";
import { buildAdminOrgOverlayHref } from "@/lib/adminOrgOverlay";

type AdminOrgContextLinkProps = Omit<LinkProps, "to"> & {
  to: string;
};

export const AdminOrgContextLink = forwardRef<HTMLAnchorElement, AdminOrgContextLinkProps>(
  ({ to, ...props }, ref) => {
    const location = useLocation();
    const nextTo = buildAdminOrgOverlayHref(location.pathname, location.search, to);

    return <Link ref={ref} to={nextTo} {...props} />;
  },
);

AdminOrgContextLink.displayName = "AdminOrgContextLink";
