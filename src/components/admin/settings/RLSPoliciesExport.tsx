import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Shield,
  Download,
  Copy,
  FileCode,
  CheckCircle
} from "lucide-react";

// RLS Policies SQL Generator based on current schema
const generateRLSPoliciesSql = () => {
  return `-- ================================================
-- ABSENSIKU RLS POLICIES
-- Generated: ${new Date().toISOString()}
-- ================================================

-- ================================================
-- HELPER FUNCTIONS (Required before policies)
-- ================================================

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.employees WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_user_employee_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees WHERE user_id = _user_id LIMIT 1
$$;

-- ================================================
-- TENANTS POLICIES
-- ================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access on tenants"
ON public.tenants FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant admin can view own tenant"
ON public.tenants FOR SELECT
USING (id = public.get_user_tenant_id(auth.uid()));

-- ================================================
-- SUBSCRIPTIONS POLICIES
-- ================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage subscriptions"
ON public.subscriptions FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Admin can view tenant subscription"
ON public.subscriptions FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ================================================
-- EMPLOYEES POLICIES
-- ================================================
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage employees"
ON public.employees FOR ALL
USING (
  public.is_super_admin(auth.uid()) OR 
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
);

CREATE POLICY "Users can view own full profile"
ON public.employees FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON public.employees FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can view colleagues basic info"
ON public.employees FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid()) AND
  user_id <> auth.uid() AND
  NOT public.is_super_admin(auth.uid()) AND
  NOT public.has_role(auth.uid(), 'admin_instansi')
);

-- ================================================
-- USER ROLES POLICIES
-- ================================================
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage all roles"
ON public.user_roles FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Admin instansi can manage tenant roles"
ON public.user_roles FOR ALL
USING (
  public.has_role(auth.uid(), 'admin_instansi') AND
  tenant_id = public.get_user_tenant_id(auth.uid())
);

CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

-- ================================================
-- OFFICES POLICIES
-- ================================================
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage offices"
ON public.offices FOR ALL
USING (
  public.is_super_admin(auth.uid()) OR
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
);

CREATE POLICY "Users can view offices in their tenant"
ON public.offices FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- ================================================
-- OPD POLICIES
-- ================================================
ALTER TABLE public.opd ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage OPD"
ON public.opd FOR ALL
USING (
  public.is_super_admin(auth.uid()) OR
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
);

CREATE POLICY "Users can view OPD in their tenant"
ON public.opd FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- ================================================
-- ATTENDANCE RECORDS POLICIES
-- ================================================
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage attendance"
ON public.attendance_records FOR ALL
USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin_instansi'));

CREATE POLICY "Users can view own attendance"
ON public.attendance_records FOR SELECT
USING (employee_id = public.get_user_employee_id(auth.uid()));

CREATE POLICY "Users can insert their own attendance"
ON public.attendance_records FOR INSERT
WITH CHECK (employee_id = public.get_user_employee_id(auth.uid()));

CREATE POLICY "Users can update their own attendance"
ON public.attendance_records FOR UPDATE
USING (employee_id = public.get_user_employee_id(auth.uid()))
WITH CHECK (employee_id = public.get_user_employee_id(auth.uid()));

CREATE POLICY "Supervisors can view subordinate attendance"
ON public.attendance_records FOR SELECT
USING (
  public.has_role(auth.uid(), 'atasan') AND
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_records.employee_id
    AND e.supervisor_id = public.get_user_employee_id(auth.uid())
  )
);

-- ================================================
-- LEAVE REQUESTS POLICIES
-- ================================================
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own leave requests"
ON public.leave_requests FOR INSERT
WITH CHECK (employee_id = public.get_user_employee_id(auth.uid()));

CREATE POLICY "Users can view their own leave requests"
ON public.leave_requests FOR SELECT
USING (
  employee_id = public.get_user_employee_id(auth.uid()) OR
  public.is_super_admin(auth.uid()) OR
  public.has_role(auth.uid(), 'admin_instansi') OR
  public.has_role(auth.uid(), 'atasan')
);

CREATE POLICY "Users can update their own pending requests"
ON public.leave_requests FOR UPDATE
USING (
  (employee_id = public.get_user_employee_id(auth.uid()) AND status = 'menunggu') OR
  public.is_super_admin(auth.uid()) OR
  public.has_role(auth.uid(), 'admin_instansi') OR
  public.has_role(auth.uid(), 'atasan')
);

-- ================================================
-- WORK HOURS POLICIES
-- ================================================
ALTER TABLE public.work_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage work hours"
ON public.work_hours FOR ALL
USING (
  public.is_super_admin(auth.uid()) OR
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
);

CREATE POLICY "Users can view work hours in their tenant"
ON public.work_hours FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- ================================================
-- WORK HOLIDAYS POLICIES
-- ================================================
ALTER TABLE public.work_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage work holidays"
ON public.work_holidays FOR ALL
USING (
  public.is_super_admin(auth.uid()) OR
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
);

CREATE POLICY "Users can view work holidays in their tenant"
ON public.work_holidays FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- ================================================
-- AUDIT LOGS POLICIES
-- ================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view audit logs"
ON public.audit_logs FOR SELECT
USING (
  public.is_super_admin(auth.uid()) OR
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
);

-- ================================================
-- SYSTEM SETTINGS POLICIES
-- ================================================
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view system settings"
ON public.system_settings FOR SELECT
USING (true);

CREATE POLICY "Super admins can manage system settings"
ON public.system_settings FOR ALL
USING (public.is_super_admin(auth.uid()));

-- ================================================
-- FAQs POLICIES
-- ================================================
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active FAQs"
ON public.faqs FOR SELECT
USING (
  is_active = true AND
  (tenant_id IS NULL OR tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()))
);

CREATE POLICY "Admin can manage FAQs"
ON public.faqs FOR ALL
USING (
  public.is_super_admin(auth.uid()) OR
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
);

-- ================================================
-- NOTES:
-- 1. Run this after creating tables and enabling RLS
-- 2. Test each policy with different user roles
-- 3. Monitor performance if policies become complex
-- ================================================
`;
};

export function RLSPoliciesExport() {
  const [copied, setCopied] = useState(false);

  const exportPoliciesSql = () => {
    const sql = generateRLSPoliciesSql();
    const blob = new Blob([sql], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `absensiku_rls_policies_${new Date().toISOString().split("T")[0]}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("RLS Policies SQL berhasil diekspor");
  };

  const copyToClipboard = () => {
    const sql = generateRLSPoliciesSql();
    navigator.clipboard.writeText(sql);
    setCopied(true);
    toast.success("SQL berhasil disalin ke clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Export RLS Policies
        </CardTitle>
        <CardDescription>
          Export semua Row Level Security policies dalam format SQL untuk migrasi ke project baru
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <Button onClick={exportPoliciesSql} className="gap-2">
            <Download className="h-4 w-4" />
            Download RLS Policies SQL
          </Button>
          <Button variant="outline" onClick={copyToClipboard} className="gap-2">
            {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copied ? "Tersalin!" : "Copy ke Clipboard"}
          </Button>
        </div>

        <Separator />

        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Preview RLS Policies
          </h4>
          <ScrollArea className="h-[400px] w-full rounded-md border bg-muted/50">
            <pre className="p-4 text-xs font-mono whitespace-pre-wrap">
              {generateRLSPoliciesSql()}
            </pre>
          </ScrollArea>
        </div>

        <div className="text-sm text-muted-foreground space-y-2">
          <p className="font-medium">Cara Menggunakan:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Download atau copy SQL di atas</li>
            <li>Buka SQL Editor di project Supabase target</li>
            <li>Jalankan schema SQL terlebih dahulu (buat tabel dan enum types)</li>
            <li>Jalankan RLS Policies SQL ini</li>
            <li>Test dengan login sebagai user berbeda role</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
