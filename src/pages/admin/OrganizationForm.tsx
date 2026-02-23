import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { applyOrgOnboardingTemplateToTenant } from "@/lib/orgOnboardingTemplates";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

const organizationSchema = z.object({
  name: z.string().min(1, "Nama organisasi wajib diisi").max(200),
  code: z.string().min(1, "Kode organisasi wajib diisi").max(50),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  description: z.string().max(1000).optional().or(z.literal("")),
  organization_type: z.enum(["pemerintah_daerah", "instansi_pemerintah", "perusahaan", "sekolah"]),
  is_active: z.boolean(),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

export default function OrganizationForm() {
  const ADMIN_ORG_FORM_QUERY_TIMEOUT_MS = 15000;
  const ADMIN_ORG_FORM_QUERY_RETRY_MAX = 1;
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Auth guard - check super admin access
  useEffect(() => {
    let mounted = true;
    const checkAuth = async () => {
      try {
        setIsRetrying(false);
        const { data: { session } } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase.auth.getSession(),
              ADMIN_ORG_FORM_QUERY_TIMEOUT_MS,
              "admin.organization_form.check_auth.get_session timeout",
            ),
          {
            maxRetries: ADMIN_ORG_FORM_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (!session?.user) {
          navigate("/admin/login", { replace: true });
          return;
        }
        const { data: isSA } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase.rpc("is_super_admin", { _user_id: session.user.id }),
              ADMIN_ORG_FORM_QUERY_TIMEOUT_MS,
              "admin.organization_form.check_auth.is_super_admin timeout",
            ),
          {
            maxRetries: ADMIN_ORG_FORM_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (!mounted) return;
        if (!isSA) {
          toast.error("Akses ditolak: hanya Super Admin");
          navigate("/admin/login", { replace: true });
          return;
        }
        setIsAuthorized(true);
        if (!isEdit) setIsFetching(false);
    } catch (error) {
      reportError(error, "admin.organization_form.check_auth");
      navigate("/admin/login", { replace: true });
    } finally {
      setIsRetrying(false);
      }
    };
    checkAuth();
    return () => { mounted = false; };
  }, [navigate, isEdit]);
  const [formData, setFormData] = useState<OrganizationFormData>({
    name: "",
    code: "",
    email: "",
    phone: "",
    address: "",
    description: "",
    organization_type: "perusahaan",
    is_active: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchOrganization = useCallback(async (orgId: string) => {
    try {
      setIsRetrying(false);
      setLoadError(null);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("tenants")
              .select("*")
              .eq("id", orgId)
              .single(),
            ADMIN_ORG_FORM_QUERY_TIMEOUT_MS,
            "admin.organization_form.fetch_org timeout",
          ),
        {
          maxRetries: ADMIN_ORG_FORM_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;

      if (data) {
        setFormData({
          name: data.name,
          code: data.code,
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || "",
          description: data.description || "",
          organization_type: (data.organization_type as OrganizationFormData["organization_type"]) || "perusahaan",
          is_active: data.is_active ?? true,
        });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.organization_form.fetch_org", { tenant_id: orgId });
      const message = appendErrorReference("Gagal memuat data organisasi", errorRef);
      setLoadError(message);
      toast.error(message);
      navigate("/admin");
    } finally {
      setIsFetching(false);
      setIsRetrying(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (isEdit && id && isAuthorized) {
      fetchOrganization(id);
    }
  }, [id, isEdit, isAuthorized, fetchOrganization]);

  const handleChange = (field: keyof OrganizationFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = organizationSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    setIsRetrying(false);
    setLoadError(null);

    try {
      const dataToSave = {
        name: formData.name,
        code: formData.code,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        description: formData.description || null,
        organization_type: formData.organization_type,
        is_active: formData.is_active,
      };

      if (isEdit && id) {
        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("tenants")
                .update(dataToSave)
                .eq("id", id),
              ADMIN_ORG_FORM_QUERY_TIMEOUT_MS,
              "admin.organization_form.submit.update_tenant timeout",
            ),
          {
            maxRetries: ADMIN_ORG_FORM_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );

        if (error) throw error;
        toast.success("Organisasi berhasil diperbarui");
      } else {
        const { data: newTenant, error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("tenants")
                .insert(dataToSave)
                .select()
                .single(),
              ADMIN_ORG_FORM_QUERY_TIMEOUT_MS,
              "admin.organization_form.submit.insert_tenant timeout",
            ),
          {
            maxRetries: ADMIN_ORG_FORM_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );

        if (error) throw error;

        // Create default subscription for new tenant.
        if (newTenant) {
          const { error: subscriptionError } = await withExponentialBackoff(
            () =>
              withTimeout(
                supabase.from("subscriptions").insert({
                  tenant_id: newTenant.id,
                  status: "trial",
                }),
                ADMIN_ORG_FORM_QUERY_TIMEOUT_MS,
                "admin.organization_form.submit.insert_subscription timeout",
              ),
            {
              maxRetries: ADMIN_ORG_FORM_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            },
          );
          if (subscriptionError) throw subscriptionError;

          // Seed onboarding template (master/schedule/settings/content) for first-time tenant usage.
          try {
            await withExponentialBackoff(
              () =>
                withTimeout(
                  applyOrgOnboardingTemplateToTenant(newTenant.id),
                  ADMIN_ORG_FORM_QUERY_TIMEOUT_MS,
                  "admin.organization_form.submit.seed_onboarding timeout",
                ),
              {
                maxRetries: ADMIN_ORG_FORM_QUERY_RETRY_MAX,
                shouldRetry: isRetryableError,
                onRetry: () => setIsRetrying(true),
              },
            );
          } catch (seedError: unknown) {
            const errorRef = reportError(seedError, "admin.organization.seed_onboarding_template", {
              tenant_id: newTenant.id,
            });
            toast.warning(
              appendErrorReference(
                "Organisasi berhasil dibuat, tetapi template setup awal gagal disalin.",
                errorRef
              )
            );
          }
        }

        toast.success("Organisasi berhasil ditambahkan");
      }

      navigate("/admin");
    } catch (error: unknown) {
      const isUniqueCodeError =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505";

      if (isUniqueCodeError) {
        toast.error("Kode organisasi sudah digunakan");
        setErrors({ code: "Kode sudah digunakan" });
      } else {
        const errorRef = reportError(error, "admin.organization_form.submit", {
          is_edit: isEdit,
          tenant_id: id || null,
          code: formData.code,
        });
        const message = appendErrorReference("Gagal menyimpan organisasi", errorRef);
        setLoadError(message);
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  };

  if (isFetching || !isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {isEdit ? "Edit Organisasi" : "Tambah Organisasi Baru"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isEdit ? "Perbarui informasi organisasi" : "Daftarkan organisasi baru ke platform"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {isRetrying && (
          <Card className="mb-4 border-amber-300/60 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-sm text-amber-800">Sedang mencoba ulang koneksi data organisasi...</p>
            </CardContent>
          </Card>
        )}
        {loadError && (
          <Card className="mb-4 border-destructive/40">
            <CardContent className="pt-4">
              <p className="text-sm text-destructive">{loadError}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Informasi Organisasi
            </CardTitle>
            <CardDescription>
              Isi data organisasi dengan lengkap dan benar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Organisasi *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="Contoh: Pemerintah Kota Bandung"
                    className={errors.name ? "border-destructive" : ""}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="code">Kode Organisasi *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
                    placeholder="Contoh: PEMKOT-BDG"
                    className={errors.code ? "border-destructive" : ""}
                  />
                  {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization_type">Tipe Organisasi *</Label>
                <Select
                  value={formData.organization_type}
                  onValueChange={(value) => handleChange("organization_type", value)}
                >
                  <SelectTrigger className={errors.organization_type ? "border-destructive" : ""}>
                    <SelectValue placeholder="Pilih tipe organisasi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pemerintah_daerah">Pemerintah Daerah</SelectItem>
                    <SelectItem value="instansi_pemerintah">Instansi Pemerintah</SelectItem>
                    <SelectItem value="perusahaan">Perusahaan</SelectItem>
                    <SelectItem value="sekolah">Sekolah</SelectItem>
                  </SelectContent>
                </Select>
                {errors.organization_type && (
                  <p className="text-sm text-destructive">{errors.organization_type}</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="admin@organisasi.go.id"
                    className={errors.email ? "border-destructive" : ""}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telepon</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="022-1234567"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Alamat</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  placeholder="Alamat lengkap organisasi"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Deskripsi</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Deskripsi singkat tentang organisasi"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="is_active" className="font-medium">Status Aktif</Label>
                  <p className="text-sm text-muted-foreground">
                    Organisasi nonaktif tidak dapat mengakses layanan
                  </p>
                </div>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => handleChange("is_active", checked)}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate("/admin")}
                >
                  Batal
                </Button>
                <Button type="submit" className="flex-1" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {isEdit ? "Simpan Perubahan" : "Tambah Organisasi"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
