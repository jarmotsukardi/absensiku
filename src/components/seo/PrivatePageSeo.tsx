import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

import { PUBLIC_BASE_URL } from "@/hooks/usePublicSeoSettings";

interface PrivatePageSeoProps {
  title?: string;
  canonicalPath?: string;
}

const PRIVATE_ROBOTS_CONTENT = "noindex, nofollow, noarchive, nosnippet";

const normalizeCanonicalPath = (path: string) => {
  const trimmedPath = path.trim();
  if (!trimmedPath || trimmedPath === "/") return "/";
  return trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
};

export function PrivatePageSeo({
  title = "Halaman Privat | AbsensiKu",
  canonicalPath,
}: PrivatePageSeoProps) {
  const location = useLocation();
  const resolvedCanonicalPath = normalizeCanonicalPath(canonicalPath ?? location.pathname);
  const canonicalUrl = `${PUBLIC_BASE_URL}${resolvedCanonicalPath}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="robots" content={PRIVATE_ROBOTS_CONTENT} />
      <meta name="googlebot" content={PRIVATE_ROBOTS_CONTENT} />
      <link rel="canonical" href={canonicalUrl} />
    </Helmet>
  );
}
