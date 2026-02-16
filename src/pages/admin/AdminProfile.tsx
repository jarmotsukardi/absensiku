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
    Crown
} from "lucide-react";
import { toast } from "sonner";

interface AdminEmployeeRow {
    id: string;
    email: string;
    phone: string | null;
    whatsapp: string | null;
    user_id: string | null;
}

export default function AdminProfile() {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [phoneNumber, setPhoneNumber] = useState("");
    const [isSavingPhone, setIsSavingPhone] = useState(false);

    // Password change state
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    useEffect(() => {
        const hydrateProfile = async (incomingSession?: Session | null) => {
            const currentSession = incomingSession ?? (await supabase.auth.getSession()).data.session;
            const { data: authUserData } = await supabase.auth.getUser();
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

                    const { data: byUserRows } = await supabase
                        .from("employees")
                        .select("id, email, phone, whatsapp, user_id")
                        .eq("user_id", currentUser.id)
                        .order("updated_at", { ascending: false })
                        .limit(1);

                    let employee = (byUserRows?.[0] || null) as AdminEmployeeRow | null;

                    if (!employee && currentUser.email) {
                        const { data: byEmailRows } = await supabase
                            .from("employees")
                            .select("id, email, phone, whatsapp, user_id")
                            .ilike("email", currentUser.email)
                            .order("updated_at", { ascending: false })
                            .limit(1);
                        employee = (byEmailRows?.[0] || null) as AdminEmployeeRow | null;

                        if (employee && !employee.user_id) {
                            await supabase
                                .from("employees")
                                .update({ user_id: currentUser.id })
                                .eq("id", employee.id);
                        }
                    }

                    resolvedPhone = employee?.phone || employee?.whatsapp || metadataPhone;

                    if (!resolvedPhone) {
                        const { data: systemSettingRow } = await supabase
                            .from("system_settings")
                            .select("value")
                            .eq("key", settingKey)
                            .maybeSingle();
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
        };

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
            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (error) throw error;

            toast.success("Password Admin berhasil diubah");
            setShowPasswordForm(false);
            setNewPassword("");
            setConfirmPassword("");
        } catch (error: any) {
            toast.error("Gagal mengubah password", {
                description: error.message || "Terjadi kesalahan",
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
            const { error } = await supabase.auth.updateUser({
                data: {
                    ...existingMetadata,
                    phone: normalizedPhone,
                    whatsapp: normalizedPhone,
                },
            });

            if (error) throw error;

            if (user?.id) {
                const { data: byUserUpdated, error: updateByUserError } = await supabase
                    .from("employees")
                    .update({ phone: normalizedPhone, whatsapp: normalizedPhone })
                    .eq("user_id", user.id)
                    .select("id, email");
                if (updateByUserError) throw updateByUserError;

                if ((!byUserUpdated || byUserUpdated.length === 0) && user.email) {
                    const { error: updateByEmailError } = await supabase
                        .from("employees")
                        .update({ phone: normalizedPhone, whatsapp: normalizedPhone, user_id: user.id })
                        .ilike("email", user.email);
                    if (updateByEmailError) throw updateByEmailError;
                }
            }

            if (settingKey) {
                const settingPayload = {
                    phone: normalizedPhone,
                    whatsapp: normalizedPhone,
                    saved_at: new Date().toISOString(),
                };
                const { data: existingSetting, error: checkSettingError } = await supabase
                    .from("system_settings")
                    .select("id")
                    .eq("key", settingKey)
                    .maybeSingle();
                if (checkSettingError) throw checkSettingError;

                if (existingSetting?.id) {
                    const { error: updateSettingError } = await supabase
                        .from("system_settings")
                        .update({
                            value: settingPayload,
                            updated_by: user?.id || null,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("key", settingKey);
                    if (updateSettingError) throw updateSettingError;
                } else {
                    const { error: insertSettingError } = await supabase
                        .from("system_settings")
                        .insert({
                            key: settingKey,
                            description: "Nomor recovery super admin",
                            value: settingPayload,
                            updated_by: user?.id || null,
                        });
                    if (insertSettingError) throw insertSettingError;
                }
            }

            const { data: userData } = await supabase.auth.getUser();
            if (userData.user) {
                setUser(userData.user);
            }

            toast.success("No HP super admin berhasil disimpan");
        } catch (error: any) {
            toast.error("Gagal menyimpan No HP", {
                description: error.message || "Terjadi kesalahan",
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
