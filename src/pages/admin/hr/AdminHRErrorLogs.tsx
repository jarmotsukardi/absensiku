import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";

export default function AdminHRErrorLogs() {
  const navigate = useNavigate();

  return (
    <AdminHRPageShell
      title="Log Error HR"
      subtitle="Pemantauan error khusus modul HR"
      description="Lacak error kritis/non-kritis HR lintas tenant tanpa keluar dari workspace HR."
    >
      <Button onClick={() => navigate("/admin/hr/audit")}>Buka Audit HR</Button>
    </AdminHRPageShell>
  );
}
