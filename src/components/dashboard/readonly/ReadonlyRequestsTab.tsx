import { FileText, Home as HomeIcon, MapPinOff, Timer } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaveRequestForm } from "@/components/employee/LeaveRequestForm";
import { LeaveRequestList } from "@/components/employee/LeaveRequestList";
import { WfhRequestForm } from "@/components/employee/WfhRequestForm";
import { WfhRequestList } from "@/components/employee/WfhRequestList";
import { OvertimeRequestForm } from "@/components/employee/OvertimeRequestForm";
import { OvertimeRequestList } from "@/components/employee/OvertimeRequestList";
import { FlexibleAttendanceRequestForm } from "@/components/employee/FlexibleAttendanceRequestForm";
import { FlexibleAttendanceRequestList } from "@/components/employee/FlexibleAttendanceRequestList";

type RequestType = "leave" | "wfh" | "overtime" | "flexible";
type LeaveRequest = Tables<"leave_requests">;
type OvertimeSettingsRow = Tables<"overtime_settings">;

interface NormalizedWfhRequest {
  id: string;
  request_date: string;
  reason: string;
  status: "menunggu" | "disetujui" | "ditolak";
  rejection_reason: string | null;
  created_at: string;
}

interface ReadonlyRequestsTabProps {
  panelClass: string;
  activeRequestType: RequestType;
  onChangeRequestType: (type: RequestType) => void;
  createLeaveRequest: (data: {
    leave_type: Tables<"leave_requests">["leave_type"];
    start_date: string;
    end_date: string;
    reason: string;
    is_half_day?: boolean;
  }) => Promise<{ success: boolean; message: string }>;
  leaveSubmitting: boolean;
  leaveRequests: LeaveRequest[];
  leaveLoading: boolean;
  cancelLeaveRequest: (id: string) => Promise<{ success: boolean; message: string }>;
  handleSubmitWfh: (dates: string[], reason: string) => Promise<boolean>;
  wfhRequestsNormalized: NormalizedWfhRequest[];
  isWfhLoading: boolean;
  employeeId?: string | null;
  tenantId?: string | null;
  overtimeSettings: OvertimeSettingsRow | null;
  overtimeSettingsFallback: OvertimeSettingsRow;
  refreshFlexible: number;
  onFlexibleSuccess: () => void;
}

export function ReadonlyRequestsTab({
  panelClass,
  activeRequestType,
  onChangeRequestType,
  createLeaveRequest,
  leaveSubmitting,
  leaveRequests,
  leaveLoading,
  cancelLeaveRequest,
  handleSubmitWfh,
  wfhRequestsNormalized,
  isWfhLoading,
  employeeId,
  tenantId,
  overtimeSettings,
  overtimeSettingsFallback,
  refreshFlexible,
  onFlexibleSuccess,
}: ReadonlyRequestsTabProps) {
  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Pengajuan</CardTitle>
        <CardDescription>Izin/cuti, WFH, lembur, dan absen fleksibel. Semua pengajuan dapat dilakukan dari sini.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={activeRequestType === "leave" ? "default" : "outline"} className={activeRequestType === "leave" ? "" : "hover:border-blue-300 hover:bg-blue-50"} onClick={() => onChangeRequestType("leave")}>
            <FileText className="mr-1 h-4 w-4" /> Cuti/Izin
          </Button>
          <Button size="sm" variant={activeRequestType === "wfh" ? "default" : "outline"} className={activeRequestType === "wfh" ? "" : "hover:border-blue-300 hover:bg-blue-50"} onClick={() => onChangeRequestType("wfh")}>
            <HomeIcon className="mr-1 h-4 w-4" /> WFH
          </Button>
          <Button size="sm" variant={activeRequestType === "overtime" ? "default" : "outline"} className={activeRequestType === "overtime" ? "" : "hover:border-blue-300 hover:bg-blue-50"} onClick={() => onChangeRequestType("overtime")}>
            <Timer className="mr-1 h-4 w-4" /> Lembur
          </Button>
          <Button size="sm" variant={activeRequestType === "flexible" ? "default" : "outline"} className={activeRequestType === "flexible" ? "" : "hover:border-blue-300 hover:bg-blue-50"} onClick={() => onChangeRequestType("flexible")}>
            <MapPinOff className="mr-1 h-4 w-4" /> Absensi Khusus
          </Button>
        </div>

        {activeRequestType === "leave" && (
          <div className="space-y-4">
            <LeaveRequestForm onSubmit={createLeaveRequest} isSubmitting={leaveSubmitting} />
            <LeaveRequestList requests={leaveRequests} isLoading={leaveLoading} onCancel={cancelLeaveRequest} />
          </div>
        )}

        {activeRequestType === "wfh" && (
          <div className="space-y-4">
            <WfhRequestForm onSubmit={handleSubmitWfh} />
            <WfhRequestList requests={wfhRequestsNormalized} isLoading={isWfhLoading} />
          </div>
        )}

        {activeRequestType === "overtime" && employeeId && tenantId && (
          <div className="space-y-4">
            <OvertimeRequestForm
              employeeId={employeeId}
              tenantId={tenantId}
              settings={overtimeSettings || overtimeSettingsFallback}
            />
            <OvertimeRequestList employeeId={employeeId} />
          </div>
        )}

        {activeRequestType === "flexible" && employeeId && tenantId && (
          <div className="space-y-4">
            <FlexibleAttendanceRequestForm
              employeeId={employeeId}
              tenantId={tenantId}
              onSuccess={onFlexibleSuccess}
            />
            <FlexibleAttendanceRequestList employeeId={employeeId} refreshTrigger={refreshFlexible} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
