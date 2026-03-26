import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SimpleCaptcha } from "@/components/common/SimpleCaptcha";
import { useToast } from "@/hooks/use-toast";
import { useLoginRateLimit } from "@/hooks/useLoginRateLimit";
import { cn } from "@/lib/utils";
import { validateOfficeCoordinateInput } from "@/lib/officeCoordinates";
import { LocationPicker } from "@/components/maps/LocationPicker";
import { 
  User, Mail, Lock, Phone, Building2, Loader2, Eye, EyeOff, 
  ArrowRight, ArrowLeft, CheckCircle2, Pencil, Copy, Monitor, 
  GraduationCap, Landmark, Briefcase, School
} from "lucide-react";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter"),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  confirmPassword: z.string(),
  whatsapp: z.string().min(10, "No WhatsApp minimal 10 digit"),
  organizationName: z.string().min(3, "Nama organisasi minimal 3 karakter"),
  organizationType: z.enum(["pemerintah_daerah", "instansi_pemerintah", "perusahaan", "sekolah"]),
}).refine(d => d.password === d.confirmPassword, { message: "Password tidak cocok", path: ["confirmPassword"] });

const orgTypes = [
  { value: "pemerintah_daerah", label: "Pemerintah Daerah", icon: Landmark, desc: "SKPD, Dinas, Badan di tingkat Kabupaten/Kota atau Provinsi" },
  { value: "instansi_pemerintah", label: "Instansi Pemerintah", icon: Building2, desc: "Kementerian, BUMN, atau lembaga pemerintah pusat" },
  { value: "perusahaan", label: "Perusahaan", icon: Briefcase, desc: "PT, CV, startup, atau badan usaha swasta lainnya" },
  { value: "sekolah", label: "Sekolah/Pendidikan", icon: GraduationCap, desc: "Sekolah, universitas, lembaga kursus, atau pesantren" },
];

interface OrgRegistrationFormProps {
  rateLimit: ReturnType<typeof useLoginRateLimit>;
}

export function OrgRegistrationForm({ rateLimit }: OrgRegistrationFormProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shakeForm, setShakeForm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Step 1 fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [whatsapp, setWhatsapp] = useState("+62");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  // Step 2 fields
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<string>("");
  const [officeName, setOfficeName] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [officeLatitude, setOfficeLatitude] = useState("");
  const [officeLongitude, setOfficeLongitude] = useState("");
  const [hoveredType, setHoveredType] = useState<string | null>(null);

  // Step 3
  const [captchaValid, setCaptchaValid] = useState(false);

  // Email & WhatsApp real-time validation
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [waStatus, setWaStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  // Password strength
  const getPasswordStrength = (pw: string) => {
    if (pw.length === 0) return { level: 0, label: "", color: "" };
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 2) return { level: 1, label: "Lemah", color: "bg-destructive" };
    if (score <= 3) return { level: 2, label: "Sedang", color: "bg-yellow-500" };
    return { level: 3, label: "Kuat", color: "bg-green-500" };
  };
  const pwStrength = getPasswordStrength(password);

  // Debounced email check
  useEffect(() => {
    if (!email || !z.string().email().safeParse(email).success) {
      setEmailStatus("idle");
      return;
    }
    setEmailStatus("checking");
    const timeout = setTimeout(async () => {
      try {
        // Check employees table
        const { data: empData } = await supabase.from("employees").select("id").eq("email", email.trim().toLowerCase()).limit(1);
        if (empData && empData.length > 0) { setEmailStatus("taken"); return; }
        // Check tenants table
        const { data: tenantData } = await supabase.from("tenants").select("id").eq("email", email.trim().toLowerCase()).limit(1);
        setEmailStatus(tenantData && tenantData.length > 0 ? "taken" : "available");
      } catch {
        setEmailStatus("idle");
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [email]);

  // Debounced WhatsApp check
  useEffect(() => {
    const cleanWa = whatsapp.replace(/\D/g, "");
    if (cleanWa.length < 10) {
      setWaStatus("idle");
      return;
    }
    setWaStatus("checking");
    const timeout = setTimeout(async () => {
      try {
        const { data } = await supabase.from("employees").select("id").eq("phone", whatsapp.trim()).limit(1);
        setWaStatus(data && data.length > 0 ? "taken" : "available");
      } catch {
        setWaStatus("idle");
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [whatsapp]);

  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!name || name.length < 3) errs.name = "Nama minimal 3 karakter";
    if (!email || !z.string().email().safeParse(email).success) errs.email = "Email tidak valid";
    if (emailStatus === "taken") errs.email = "Email sudah digunakan, gunakan email lain";
    if (!password || password.length < 6) errs.password = "Password minimal 6 karakter";
    if (password !== confirmPassword) errs.confirmPassword = "Password tidak cocok";
    if (!whatsapp || whatsapp.replace(/\D/g, "").length < 10) errs.whatsapp = "No WhatsApp minimal 10 digit";
    if (waStatus === "taken") errs.whatsapp = "No WhatsApp sudah digunakan, gunakan nomor lain";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    if (!orgName || orgName.length < 3) errs.organizationName = "Nama organisasi minimal 3 karakter";
    if (!orgType) errs.organizationType = "Pilih tipe organisasi";
    if (!officeName || officeName.length < 3) errs.officeName = "Nama kantor minimal 3 karakter";
    const coordinateValidation = validateOfficeCoordinateInput(officeLatitude, officeLongitude);
    if (!coordinateValidation.ok) {
      errs.officeCoordinates = coordinateValidation.message;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!captchaValid) {
      toast({ variant: "destructive", title: "Verifikasi captcha terlebih dahulu" });
      return;
    }
    if (rateLimit.isLocked) return;

    setIsLoading(true);
    try {
      const coordinateValidation = validateOfficeCoordinateInput(officeLatitude, officeLongitude);
      if (!coordinateValidation.ok) {
        setErrors((prev) => ({ ...prev, officeCoordinates: coordinateValidation.message }));
        setStep(2);
        toast({ variant: "destructive", title: "Koordinat kantor tidak valid", description: coordinateValidation.message });
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            name,
            tenant_name: orgName,
            organization_type: orgType,
            tenant_office_name: officeName,
            tenant_office_address: officeAddress,
            tenant_office_latitude: String(coordinateValidation.latitude),
            tenant_office_longitude: String(coordinateValidation.longitude),
          },
        },
      });

      if (error) {
        rateLimit.recordFailedAttempt();
        setShakeForm(true);
        setTimeout(() => setShakeForm(false), 600);
        if (error.message.includes("already registered")) {
          setErrors({ email: "Email sudah terdaftar" });
          setStep(1);
        } else {
          toast({ variant: "destructive", title: "Registrasi Gagal", description: error.message });
        }
        return;
      }

      rateLimit.resetAttempts();
      setShowSuccess(true);
      
      setTimeout(() => {
        navigate("/org/profile/setup", { replace: true });
      }, 3000);
    } catch (error) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Tidak dapat menghubungi server." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditField = (targetStep: number) => setStep(targetStep);

  const copyOrgUrl = () => {
    navigator.clipboard.writeText(`${window.location.origin}/org/login`);
    toast({ title: "URL Disalin", description: "Link halaman admin organisasi berhasil disalin." });
  };

  // Success Overlay
  if (showSuccess) {
    return (
      <div className="text-center space-y-6 py-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-foreground">Registrasi Berhasil!</h3>
          <p className="text-muted-foreground mt-2">Akun organisasi <strong>{orgName}</strong> telah dibuat.</p>
        </div>
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Monitor className="w-4 h-4 text-primary" />
              <span className="font-medium">Rekomendasi Desktop</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Pengelolaan data organisasi direkomendasikan menggunakan desktop (laptop/komputer) untuk pengalaman terbaik.
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={copyOrgUrl}>
              <Copy className="w-3 h-3 mr-2" />
              Salin URL Admin
            </Button>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">Mengalihkan ke setup profil organisasi dalam 3 detik...</p>
        <p className="text-xs text-muted-foreground">Langkah berikutnya: lengkapi profil organisasi, lalu selesaikan setup awal fondasi absensi.</p>
      </div>
    );
  }

  // Step indicator
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
            step === s ? "bg-primary text-primary-foreground scale-110" :
            step > s ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
          )}>
            {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
          </div>
          {s < 3 && <div className={cn("w-8 h-0.5", step > s ? "bg-primary" : "bg-muted")} />}
        </div>
      ))}
    </div>
  );

  const isTouch = typeof window !== "undefined" && "ontouchstart" in window;

  return (
    <div className={cn(shakeForm && "animate-shake")}>
      <StepIndicator />

      {/* Step 1: Credentials */}
      {step === 1 && (
        <div className="space-y-4 animate-in slide-in-from-right-5 duration-300">
          <h3 className="font-semibold text-center text-foreground">Kredensial Akun Admin</h3>
          
          <div className="space-y-2">
            <Label>Nama Lengkap</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nama lengkap Anda" className="pl-10 rounded-xl" disabled={rateLimit.isLocked} />
            </div>
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label>Email Admin</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@organisasi.id" className="pl-10 pr-10 rounded-xl" disabled={rateLimit.isLocked} />
              {emailStatus === "checking" && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              {emailStatus === "available" && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />}
            </div>
            {emailStatus === "taken" && <p className="text-xs text-destructive">Email sudah digunakan</p>}
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label>Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type={showPwd ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimal 6 karakter" className="pl-10 pr-10 rounded-xl" disabled={rateLimit.isLocked} />
              <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", pwStrength.color)} style={{ width: `${(pwStrength.level / 3) * 100}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">{pwStrength.label}</span>
              </div>
            )}
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          <div className="space-y-2">
            <Label>Konfirmasi Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type={showConfirmPwd ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Ulangi password" className="pl-10 pr-10 rounded-xl" disabled={rateLimit.isLocked} />
              <button type="button" onClick={() => setShowConfirmPwd(!showConfirmPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
          </div>

          <div className="space-y-2">
            <Label>No. WhatsApp</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={whatsapp} onChange={e => {
                let val = e.target.value;
                if (!val.startsWith("+62")) val = "+62";
                setWhatsapp(val);
              }} placeholder="+628xxxxxxxxxx" className="pl-10 pr-10 rounded-xl" />
              {waStatus === "checking" && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              {waStatus === "available" && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />}
            </div>
            {waStatus === "taken" && <p className="text-xs text-destructive">No WhatsApp sudah digunakan, gunakan nomor lain</p>}
            {errors.whatsapp && waStatus !== "taken" && <p className="text-xs text-destructive">{errors.whatsapp}</p>}
          </div>

          <Button className="w-full rounded-xl" onClick={goNext} disabled={rateLimit.isLocked}>
            Lanjut <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Step 2: Organization Profile */}
      {step === 2 && (
        <div className="space-y-4 animate-in slide-in-from-right-5 duration-300">
          <h3 className="font-semibold text-center text-foreground">Profil Organisasi</h3>

          <div className="space-y-2">
            <Label>Nama Organisasi</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Nama organisasi" className="pl-10 rounded-xl" />
            </div>
            {errors.organizationName && <p className="text-xs text-destructive">{errors.organizationName}</p>}
          </div>

          <div className="space-y-2">
            <Label>Tipe Organisasi</Label>
            <TooltipProvider delayDuration={200}>
              <div className="grid grid-cols-2 gap-3">
                {orgTypes.map((type) => {
                  const Icon = type.icon;
                  const isSelected = orgType === type.value;
                  const isHovered = hoveredType === type.value;

                  const cardContent = (
                    <div
                      key={type.value}
                      className={cn(
                        "relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 text-center",
                        isSelected ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/50 hover:bg-muted/50",
                      )}
                      onClick={() => setOrgType(type.value)}
                      onMouseEnter={() => !isTouch && setHoveredType(type.value)}
                      onMouseLeave={() => !isTouch && setHoveredType(null)}
                      onTouchStart={() => {
                        if (isTouch) {
                          if (hoveredType === type.value) {
                            setOrgType(type.value);
                            setHoveredType(null);
                          } else {
                            setHoveredType(type.value);
                          }
                        }
                      }}
                    >
                      {isSelected && (
                        <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-primary" />
                      )}
                      <Icon className={cn("w-8 h-8 mx-auto mb-2", isSelected ? "text-primary" : "text-muted-foreground")} />
                      <p className={cn("text-sm font-medium", isSelected ? "text-primary" : "text-foreground")}>{type.label}</p>
                      
                      {/* Mobile: show tooltip inline on hover */}
                      {isTouch && isHovered && !isSelected && (
                        <div className="mt-2 p-2 rounded-lg bg-popover border text-xs text-muted-foreground animate-in fade-in-50 duration-200">
                          {type.desc}
                        </div>
                      )}
                    </div>
                  );

                  // Desktop: use Tooltip
                  if (!isTouch) {
                    return (
                      <Tooltip key={type.value}>
                        <TooltipTrigger asChild>{cardContent}</TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[200px] text-center">
                          <p>{type.desc}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  return cardContent;
                })}
              </div>
            </TooltipProvider>
            {errors.organizationType && <p className="text-xs text-destructive">{errors.organizationType}</p>}
          </div>

          <div className="space-y-2">
            <Label>Nama Kantor Utama</Label>
            <Input
              value={officeName}
              onChange={(e) => setOfficeName(e.target.value)}
              placeholder="Contoh: Kantor Pusat"
              className="rounded-xl"
            />
            {errors.officeName && <p className="text-xs text-destructive">{errors.officeName}</p>}
          </div>

          <div className="space-y-2">
            <Label>Lokasi Kantor Utama</Label>
            <LocationPicker
              latitude={officeLatitude}
              longitude={officeLongitude}
              onLocationChange={(lat, lng) => {
                setOfficeLatitude(lat);
                setOfficeLongitude(lng);
              }}
              address={officeAddress}
              onAddressChange={setOfficeAddress}
            />
          </div>
          {errors.officeCoordinates && <p className="text-xs text-destructive">{errors.officeCoordinates}</p>}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={goBack}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
            </Button>
            <Button className="flex-1 rounded-xl" onClick={goNext}>
              Lanjut <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 3 && (
        <div className="space-y-4 animate-in slide-in-from-right-5 duration-300">
          <h3 className="font-semibold text-center text-foreground">Verifikasi & Finalisasi</h3>

          <Card className="bg-muted/30 backdrop-blur-sm border-border/50 rounded-xl">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Kredensial Akun</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditField(1)}>
                  <Pencil className="w-3 h-3" />
                </Button>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Nama:</span><span className="font-medium">{name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Email:</span><span className="font-medium">{email}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">WhatsApp:</span><span className="font-medium">{whatsapp}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30 backdrop-blur-sm border-border/50 rounded-xl">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Profil Organisasi</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditField(2)}>
                  <Pencil className="w-3 h-3" />
                </Button>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Organisasi:</span><span className="font-medium">{orgName}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipe:</span>
                  <Badge variant="secondary">{orgTypes.find(t => t.value === orgType)?.label || "-"}</Badge>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Kantor Utama:</span><span className="font-medium">{officeName}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Koordinat:</span>
                  <span className="font-medium">{officeLatitude || "-"}, {officeLongitude || "-"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label>Verifikasi Captcha</Label>
            <SimpleCaptcha onVerify={setCaptchaValid} />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={goBack}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
            </Button>
            <Button className="flex-1 rounded-xl" onClick={handleSubmit} disabled={isLoading || !captchaValid || rateLimit.isLocked}>
              {isLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Memproses...</> : "Daftar Sekarang"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
