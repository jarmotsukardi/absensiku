import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Shield, 
  Crown, 
  Users, 
  Edit,
  Plus,
  CheckCircle2,
  XCircle
} from "lucide-react";

const roles = [
  {
    id: "super_admin",
    name: "Super Admin",
    description: "Akses penuh ke semua fitur dan data platform",
    icon: Crown,
    color: "bg-purple-500",
    permissions: [
      { name: "Kelola Organisasi", allowed: true },
      { name: "Kelola Langganan", allowed: true },
      { name: "Kelola User", allowed: true },
      { name: "Akses Audit Log", allowed: true },
      { name: "Pengaturan Sistem", allowed: true },
    ],
  },
  {
    id: "admin_instansi",
    name: "Admin Instansi",
    description: "Mengelola organisasi dan pegawai dalam instansi",
    icon: Shield,
    color: "bg-blue-500",
    permissions: [
      { name: "Kelola Pegawai", allowed: true },
      { name: "Kelola Kantor", allowed: true },
      { name: "Approval Cuti", allowed: true },
      { name: "Lihat Laporan", allowed: true },
      { name: "Pengaturan Instansi", allowed: true },
    ],
  },
  {
    id: "atasan",
    name: "Atasan",
    description: "Supervisi dan approval untuk bawahan",
    icon: Users,
    color: "bg-green-500",
    permissions: [
      { name: "Lihat Bawahan", allowed: true },
      { name: "Approval Cuti", allowed: true },
      { name: "Lihat Absensi Tim", allowed: true },
      { name: "Kelola Pegawai", allowed: false },
      { name: "Pengaturan", allowed: false },
    ],
  },
  {
    id: "pegawai",
    name: "Pegawai",
    description: "Akses dasar untuk absensi dan pengajuan",
    icon: Users,
    color: "bg-gray-500",
    permissions: [
      { name: "Absensi", allowed: true },
      { name: "Pengajuan Cuti", allowed: true },
      { name: "Lihat Riwayat", allowed: true },
      { name: "Edit Profil", allowed: true },
      { name: "Akses Admin", allowed: false },
    ],
  },
];

export default function RoleManagement() {
  return (
    <SuperAdminLayout title="Role & Permission" subtitle="Kelola role dan hak akses pengguna">
      <div className="space-y-6">
        {/* Role Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${role.color}`}>
                      <role.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{role.name}</CardTitle>
                      <CardDescription>{role.description}</CardDescription>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon">
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {role.permissions.map((perm, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1">
                      <span className="text-sm">{perm.name}</span>
                      {perm.allowed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Info Card */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium text-blue-700 dark:text-blue-400">
                  Tentang Sistem Role
                </p>
                <p className="text-sm text-blue-600/80 dark:text-blue-400/80 mt-1">
                  Role menentukan hak akses pengguna dalam sistem. Setiap pengguna dapat memiliki 
                  satu atau lebih role. Permission yang lebih tinggi akan override permission yang lebih rendah.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}