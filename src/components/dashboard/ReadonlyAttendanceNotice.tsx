import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface ReadonlyAttendanceNoticeProps {
  className?: string;
  compact?: boolean;
}

export function ReadonlyAttendanceNotice({ className, compact = false }: ReadonlyAttendanceNoticeProps) {
  return (
    <div className={className}>
      <p>
        Absensi dilakukan melalui aplikasi mobile di <code>/employee/dashboard</code>. Halaman ini
        untuk monitoring dan pengelolaan data pribadi.
      </p>
      <div className={compact ? "mt-3" : "mt-4"}>
        <Button asChild size={compact ? "sm" : "default"} variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
          <Link to="/employee/dashboard">Buka Dashboard Mobile</Link>
        </Button>
      </div>
    </div>
  );
}
