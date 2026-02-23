import { useState, useEffect } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import {
    User as UserIcon,
    Mail,
    Lock,
    Eye,
    EyeOff,
    Save,
    Loader2,
    ShieldCheck,
    Crown,
    RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
    isRetryableError,
    withExponentialBackoff,
    withTimeout,
} from "@/lib/attendanceResilience";

interface AdminEmployeeRow {
    id: string;
    email: string;
    phone: string | null;
    whatsapp: string | null;
    user_id: string | null;
}

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return "Terjadi kesalahan";
};

const ADMIN_PROFILE_READ_TIMEOUT_MS = 12000;
const ADMIN_PROFILE_WRITE_TIMEOUT_MS = 15000;
const ADMIN_PROFILE_MAX_RETRIES = 2;

export default function AdminProfile() {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRetrying, setIsRetrying] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [phoneNumber, setPhoneNumber] = useState("");
    const [isSavingPhone, setIsSavingPhone] = useState(false);

    // Password change state
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const hydrateProfile = async (incomingSession?: Session | null) => {
        try {
            setLoadError(null);
            setIsRetrying(false);
            const currentSession = incomingSession ?? (await withExponentialBackoff(
                () =>
                    withTimeout(
                        supabase.auth.getSession(),
                        ADMIN_PROFILE_READ_TIMEOUT_MS,
                        "Permintaan session auth timeout."
                    ),
                {
                    maxRetries: ADMIN_PROFILE_MAX_RETRIES,
                    shouldRetry: isRetryableError,
                    onRetry: () => setIsRetrying(true),
                }
            )).data.session;
            const { data: authUserData } = await withExponentialBackoff(
                () =>
                    withTimeout(
                        supabase.auth.getUser(),
                        ADMIN_PROFILE_READ_TIMEOUT_MS,
                        "Permintaan user auth timeout."
                    ),
                {
                    maxRetries: ADMIN_PROFILE_MAX_RETRIES,
                    shouldRetry: isRetryableError,
                    onRetry: () => setIsRetrying(true),
                }
            );
            const currentUser = authUserData?.user ?? currentSession?.user ?? null;
            setSession(currentSession);
            setUser(currentUser);

            const metadataPhone = String(
                currentUser?.user_metadata?.phone ||
                currentUser?.user_metadata?.whatsapp ||
                ""
            );
            let resolvedPhone = metadataPhone;

            try {
                if (currentUser?.id) {
                    const settingKey = `super_admin_recovery_phone_${currentUser.id}`;

                    const { data: byUserRows } = await withExponentialBackoff(
                        () =>
                            withTimeout(
                                supabase
                                    .from("employees")
                                    .select("id, email, phone, whatsapp, user_id")
                                    .eq("user_id", currentUser.id)
                                    .order("updated_at", { ascending: false })
                                    .limit(1),
                                ADMIN_PROFILE_READ_TIMEOUT_MS,
                                "Permintaan employee by user timeout."
                            ),
                        {
                            maxRetries: ADMIN_PROFILE_MAX_RETRIES,
                            shouldRetry: isRetryableError,
                            onRetry: () => setIsRetrying(true),
                        }
                    );

                    let employee = (byUserRows?.[0] || null) as AdminEmployeeRow | null;

                    if (!employee && currentUser.email) {
                        const { data: byEmailRows } = await withExponentialBackoff(
                            () =>
                                withTimeout(
                                    supabase
                                        .from("employees")
                                        .select("id, email, phone, whatsapp, user_id")
                                        .ilike("email", currentUser.email)
                                        .order("updated_at", { ascending: false })
                                        .limit(1),
                                    ADMIN_PROFILE_READ_TIMEOUT_MS,
                                    "Permintaan employee by email timeout."
                                ),
                            {
                                maxRetries: ADMIN_PROFILE_MAX_RETRIES,
                                shouldRetry: isRetryableError,
                                onRetry: () => setIsRetrying(true),
                            }
                        );
                        employee = (byEmailRows?.[0] || null) as AdminEmployeeRow | null;

                        if (employee && !employee.user_id) {
                            await withTimeout(
                                supabase
                                    .from("employees")
                                    .update({ user_id: currentUser.id })
                                    .eq("id", employee.id),
                                ADMIN_PROFILE_WRITE_TIMEOUT_MS,
                                "Update user_id employee timeout."
                            );
                        }
                    }

                    resolvedPhone = employee?.phone || employee?.whatsapp || metadataPhone;

                    if (!resolvedPhone) {
                        const { data: systemSettingRow } = await withExponentialBackoff(
                            () =>
                                withTimeout(
                                    supabase
                                        .from("system_settings")
                                        .select("value")
                                        .eq("key", settingKey)
                                        .maybeSingle(),
                                    ADMIN_PROFILE_READ_TIMEOUT_MS,
                                    "Permintaan system setting recovery phone timeout."
                                ),
                            {
                                maxRetries: ADMIN_PROFILE_MAX_RETRIES,
                                shouldRetry: isRetryableError,
                                onRetry: () => setIsRetrying(true),
                            }
                        );
                        const savedPhone = (
                            (systemSettingRow?.value as { phone?: string; whatsapp?: string } | null)?.phone ||
                            (systemSettingRow?.value as { phone?: string; whatsapp?: string } | null)?.whatsapp ||
                            ""
                        ).toString();
                        resolvedPhone = savedPhone || resolvedPhone;
                    }
                }
            } catch {
                resolvedPhone = metadataPhone;
            }

            setPhoneNumber(resolvedPhone || "");
            setIsLoading(false);
        } catch (error) {
            const errorRef = reportError(error, "admin.profile.hydrate");
            const message = appendErrorReference("Gagal memuat profil admin", errorRef);
            setLoadError(message);
            toast.error(message);
            setIsLoading(false);
        } finally {
            setIsRetrying(false);
        }
    };

    useEffect(() => {
        void hydrateProfile();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            void hydrateProfile(nextSession);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) {
            toast.error("Password baru tidak cocok");
            return;
        }

        if (newPassword.length < 6) {
            toast.error("Password minimal 6 karakter");
            return;
        }

        setIsChangingPassword(true);

        try {
            const { error } = await withTimeout(
                supabase.auth.updateUser({
                    password: newPassword,
                }),
                ADMIN_PROFILE_WRITE_TIMEOUT_MS,
                "Update password timeout."
            );

            if (error) throw error;

            toast.success("Password Admin berhasil diubah");
            setShowPasswordForm(false);
            setNewPassword("");
            setConfirmPassword("");
        } catch (error: unknown) {
            const errorRef = reportError(error, "admin.profile.change_password");
            toast.error(appendErrorReference("Gagal mengubah password", errorRef), {
                description: getErrorMessage(error),
            });
        } finally {
            setIsChangingPassword(false);
        }
    };

    const handleSavePhoneNumber = async () => {
        const normalizedPhone = phoneNumber.trim().replace(/[\s-]/g, "");
        const phoneRegex = /^(\+?62|0)[0-9]{8,13}$/;

        if (!normalizedPhone) {
            toast.error("No HP wajib diisi");
            return;
        }

        if (!phoneRegex.test(normalizedPhone)) {
            toast.error("Format No HP tidak valid", {
                description: "Contoh: 081234567890 atau 6281234567890",
            });
            return;
        }

        setIsSavingPhone(true);
        try {
            const settingKey = user?.id ? `super_admin_recovery_phone_${user.id}` : null;
            const existingMetadata = user?.user_metadata && typeof user.user_metadata === "object"
                ? user.user_metadata
                : {};
            const { error } = await withTimeout(
                supabase.auth.updateUser({
                    data: {
                        ...existingMetadata,
                        phone: normalizedPhone,
                        whatsapp: normalizedPhone,
                    },
                }),
                ADMIN_PROFILE_WRITE_TIMEOUT_MS,
                "Update metadata phone timeout."
            );

            if (error) throw error;

            if (user?.id) {
                const { data: byUserUpdated, error: updateByUserError } = await withTimeout(
                    supabase
                        .from("employees")
                        .update({ phone: normalizedPhone, whatsapp: normalizedPhone })
                        .eq("user_id", user.id)
                        .select("id, email"),
                    ADMIN_PROFILE_WRITE_TIMEOUT_MS,
                    "Update phone employee by user timeout."
                );
                if (updateByUserError) throw updateByUserError;

                if ((!byUserUpdated || byUserUpdated.length === 0) && user.email) {
                    const { error: updateByEmailError } = await withTimeout(
                        supabase
                            .from("employees")
                            .update({ phone: normalizedPhone, whatsapp: normalizedPhone, user_id: user.id })
                            .ilike("email", user.email),
                        ADMIN_PROFILE_WRITE_TIMEOUT_MS,
                        "Update phone employee by email timeout."
                    );
                    if (updateByEmailError) throw updateByEmailError;
                }
            }

            if (settingKey) {
                const settingPayload = {
                    phone: normalizedPhone,
                    whatsapp: normalizedPhone,
                    saved_at: new Date().toISOString(),
                };
                const { data: existingSetting, error: checkSettingError } = await withTimeout(
                    supabase
                        .from("system_settings")
                        .select("id")
                        .eq("key", settingKey)
                        .maybeSingle(),
                    ADMIN_PROFILE_WRITE_TIMEOUT_MS,
                    "Check recovery phone setting timeout."
                );
                if (checkSettingError) throw checkSettingError;

                if (existingSetting?.id) {
                    const { error: updateSettingError } = await withTimeout(
                        supabase
                            .from("system_settings")
                            .update({
                                value: settingPayload,
                                updated_by: user?.id || null,
                                updated_at: new Date().toISOString(),
                            })
                            .eq("key", settingKey),
                        ADMIN_PROFILE_WRITE_TIMEOUT_MS,
                        "Update recovery phone setting timeout."
                    );
                    if (updateSettingError) throw updateSettingError;
                } else {
                    const { error: insertSettingError } = await withTimeout(
                        supabase
                            .from("system_settings")
                            .insert({
                                key: settingKey,
                                description: "Nomor recovery super admin",
                                value: settingPayload,
                                updated_by: user?.id || null,
                            }),
                        ADMIN_PROFILE_WRITE_TIMEOUT_MS,
                        "Insert recovery phone setting timeout."
                    );
                    if (insertSettingError) throw insertSettingError;
                }
            }

            const { data: userData } = await withTimeout(
                supabase.auth.getUser(),
                ADMIN_PROFILE_READ_TIMEOUT_MS,
                "Refresh auth user timeout."
            );
            if (userData.user) {
                setUser(userData.user);
            }

            toast.success("No HP super admin berhasil disimpan");
        } catch (error: unknown) {
            const errorRef = reportError(error, "admin.profile.save_phone");
            toast.error(appendErrorReference("Gagal menyimpan No HP", errorRef), {
                description: getErrorMessage(error),
            });
        } finally {
            setIsSavingPhone(false);
        }
    };

    if (isLoading) {
        return (
            <SuperAdminLayout title="Profil Saya">
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            </SuperAdminLayout>
        );
    }

    return (
        <SuperAdminLayout
            title="Profil Saya"
            subtitle="Kelola informasi akun Super Admin Anda"
        >
            <div className="max-w-xl space-y-4">
                {isRetrying && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
                        Mencoba ulang memuat profil admin...
                    </div>
                )}

                {loadError && (
                    <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
                        <span>{loadError}</span>
                        <Button variant="outline" size="sm" onClick={() => void hydrateProfile(session)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Coba Lagi
                        </Button>
                    </div>
                )}

                {/* Profile Info */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Crown className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-xl">Super Admin</CardTitle>
                                <CardDescription className="text-xs">Hak akses penuh ke seluruh sistem AbsensiKu</CardDescription>
                                <Badge className="mt-1 bg-purple-500 hover:bg-purple-600">
                                    <ShieldCheck className="w-3 h-3 mr-1" />
                                    Super Admin
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Separator />
                        <div className="space-y-3 pt-1">
                            <div className="flex items-start gap-3">
                                <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <div>
                                    <p className="text-xs font-medium">Alamat Email</p>
                                    <p className="text-xs text-muted-foreground">{user?.email || "-"}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <UserIcon className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <div>
                                    <p className="text-xs font-medium">User ID</p>
                                    <p className="text-xs text-muted-foreground font-mono">{user?.id || "-"}</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Security */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Keamanan</CardTitle>
                        <CardDescription className="text-xs">Perbarui password akses Super Admin Anda</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!showPasswordForm ? (
                            <Button
                                variant="outline"
                                onClick={() => setShowPasswordForm(true)}
                            >
                                <Lock className="w-4 h-4 mr-2" />
                                Ubah Password
                            </Button>
                        ) : (
                            <div className="space-y-3 max-w-sm">
                                <div className="space-y-2">
                                    <Label>Password Baru</Label>
                                    <div className="relative">
                                        <Input
                                            type={showNewPassword ? "text" : "password"}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="Minimal 6 karakter"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                        >
                                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Konfirmasi Password Baru</Label>
                                    <Input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Ulangi password baru"
                                    />
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setShowPasswordForm(false);
                                            setNewPassword("");
                                            setConfirmPassword("");
                                        }}
                                        disabled={isChangingPassword}
                                    >
                                        Batal
                                    </Button>
                                    <Button
                                        onClick={handleChangePassword}
                                        disabled={isChangingPassword || !newPassword || !confirmPassword}
                                    >
                                        {isChangingPassword ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4 mr-2" />
                                        )}
                                        Simpan Password
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Kontak Pemulihan</CardTitle>
                        <CardDescription className="text-xs">
                            Nomor ini dipakai untuk validasi lupa password Super Admin
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 max-w-sm">
                        <div className="space-y-2">
                            <Label htmlFor="admin-phone">No HP / WhatsApp</Label>
                            <Input
                                id="admin-phone"
                                type="tel"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                placeholder="Masukkan no HP aktif (contoh: 08xxxxxxxxxx)"
                            />
                        </div>
                        <Button
                            onClick={handleSavePhoneNumber}
                            disabled={isSavingPhone || !phoneNumber.trim()}
                        >
                            {isSavingPhone ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4 mr-2" />
                            )}
                            Simpan No HP
                        </Button>
                    </CardContent>
                </Card>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        Perhatian: Menjadi Super Admin berarti Anda memiliki akses penuh ke pengaturan sistem, database, dan data organisasi. Harap jaga kerahasiaan password Anda.
                    </p>
                </div>
            </div>
        </SuperAdminLayout>
    );
}
