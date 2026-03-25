import { useCallback, useEffect, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { fetchTenantHrEssPolicySettings } from "@/lib/hrEssPolicySettings";
import { resolveHrEssSessionEmployee, type HrEssSessionEmployee } from "@/lib/hrEssSessionEmployee";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { Mail, MapPin, Phone, ShieldCheck, User2 } from "lucide-react";
import { toast } from "sonner";

export default function OrgHRESSProfile() {
  const [isLoading, setIsLoading] = useState(true);
  const [employee, setEmployee] = useState<HrEssSessionEmployee | null>(null);
  const [missingEmployee, setMissingEmployee] = useState(false);
  const [isDisabledByPolicy, setIsDisabledByPolicy] = useState(false);
  const [profileEditableContact, setProfileEditableContact] = useState(false);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/ess/profile");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setMissingEmployee(false);
    setIsDisabledByPolicy(false);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const essPolicy = await fetchTenantHrEssPolicySettings(tenantId);

      setProfileEditableContact(essPolicy.profileEditableContact);
      if (!essPolicy.enableProfileView) {
        setIsDisabledByPolicy(true);
        setEmployee(null);
        return;
      }

      const { employee: sessionEmployee } = await resolveHrEssSessionEmployee(tenantId);
      setEmployee(sessionEmployee);
      setMissingEmployee(!sessionEmployee);
    } catch (error) {
      const ref = reportError(error, "org.hr.ess.profile.fetch");
      toast.error(appendErrorReference("Gagal memuat profil ESS", ref));
      setEmployee(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">ESS</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Profil ESS</h1>
          <p className="text-sm text-muted-foreground">
            Ringkasan profil dari perspektif ESS untuk akun organisasi yang juga terhubung ke data pegawai tenant aktif.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "monitoring hanya-baca"}
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Identitas Pegawai</CardTitle>
                <CardDescription>
                  Data ini diambil dari master pegawai dan menjadi dasar layanan mandiri karyawan di workspace HR.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {profileEditableContact ? (
                  <Button asChild variant="outline" size="sm">
                    <OrgHRContextLink to="/org/profile?section=contact">Edit Kontak</OrgHRContextLink>
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <OrgHRContextLink to="/org/profile?section=contact">Kelola Kontak</OrgHRContextLink>
                  </Button>
                )}
                <Button asChild size="sm">
                  <OrgHRContextLink to="/org/profile?section=password">Ubah Password</OrgHRContextLink>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : isDisabledByPolicy ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
                Tampilan profil ESS sedang dinonaktifkan pada baseline tenant ini. Hubungi admin HR bila akses perlu dibuka kembali.
              </div>
            ) : missingEmployee ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
                Akun ini belum terhubung ke data pegawai tenant aktif. Profil ESS belum bisa menampilkan data personal.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{employee?.is_active === false ? "Nonaktif" : "Aktif"}</Badge>
                  {employee?.employee_category ? <Badge variant="secondary">{employee.employee_category}</Badge> : null}
                  {employee?.golongan ? <Badge variant="secondary">Gol. {employee.golongan}</Badge> : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <InfoCard icon={User2} label="Nama Lengkap" value={employee?.name || "-"} />
                  <InfoCard icon={Mail} label="Email" value={employee?.email || "-"} />
                  <InfoCard icon={Phone} label="No. Telepon" value={employee?.phone || employee?.whatsapp || "-"} />
                  <InfoCard icon={Phone} label="WhatsApp" value={employee?.whatsapp || "-"} />
                  <InfoCard icon={User2} label="NIP" value={employee?.nip || "-"} />
                  <InfoCard icon={User2} label="NIK" value={employee?.nik || "-"} />
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-3 text-sm font-medium">Informasi Kepegawaian</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <InfoCard icon={ShieldCheck} label="Jabatan" value={employee?.position || "-"} />
                    <InfoCard icon={ShieldCheck} label="Tanggal Masuk" value={formatDate(employee?.joined_date || null)} />
                    <InfoCard icon={MapPin} label="Instansi/OPD" value={employee?.opd?.name || "-"} />
                    <InfoCard icon={MapPin} label="Unit Kerja" value={employee?.work_unit?.name || "-"} />
                    <InfoCard icon={MapPin} label="Kantor" value={employee?.offices?.name || "-"} />
                    <InfoCard icon={MapPin} label="Alamat Kantor" value={employee?.offices?.address || "-"} />
                  </div>
                </div>

                {profileEditableContact ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    Baseline tenant mengizinkan pembaruan kontak dari profil organisasi. Gunakan tombol "Edit Kontak" untuk memperbarui data kontak.
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Perubahan kontak dan password tetap dilakukan dari halaman profil organisasi agar audit perubahan akun tetap terpusat.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID");
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-white/80 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-sm font-medium">{value}</div>
        </div>
      </div>
    </div>
  );
}
