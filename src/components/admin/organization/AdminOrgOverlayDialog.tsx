import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildAdminOrgEmbeddedTarget, getAdminOrgOverlayTarget, ADMIN_ORG_OVERLAY_PARAM } from "@/lib/adminOrgOverlay";
import { ExternalLink } from "lucide-react";

export function AdminOrgOverlayDialog() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const adminOrgOverlayTarget = location.pathname.startsWith("/admin")
    ? getAdminOrgOverlayTarget(searchParams.get(ADMIN_ORG_OVERLAY_PARAM))
    : null;

  const closeAdminOrgOverlay = useCallback(() => {
    if (!adminOrgOverlayTarget) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete(ADMIN_ORG_OVERLAY_PARAM);
    setSearchParams(nextSearchParams, { replace: true });
  }, [adminOrgOverlayTarget, searchParams, setSearchParams]);

  return (
    <Dialog open={Boolean(adminOrgOverlayTarget)} onOpenChange={(open) => !open && closeAdminOrgOverlay()}>
      <DialogContent className="flex h-[88vh] w-[min(1280px,96vw)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle>Halaman Organisasi Dibuka sebagai Overlay</DialogTitle>
              <DialogDescription className="mt-1">
                Rute admin organisasi tetap dibuka tanpa meninggalkan halaman saat ini. Gunakan tampilan penuh hanya jika memang perlu berpindah konteks.
              </DialogDescription>
            </div>
            {adminOrgOverlayTarget ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  closeAdminOrgOverlay();
                  navigate(adminOrgOverlayTarget);
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Buka Penuh
              </Button>
            ) : null}
          </div>
        </DialogHeader>
        {adminOrgOverlayTarget ? (
          <iframe
            key={adminOrgOverlayTarget}
            src={buildAdminOrgEmbeddedTarget(adminOrgOverlayTarget)}
            title={`Overlay ${adminOrgOverlayTarget}`}
            className="min-h-0 flex-1 bg-background"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
