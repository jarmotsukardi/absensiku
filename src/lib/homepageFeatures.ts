export interface HomepageFeature {
  id: string;
  icon: string;
  title: string;
  description: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const asString = (value: unknown): string => {
  return typeof value === "string" ? value : "";
};

export const DEFAULT_HOMEPAGE_FEATURES: HomepageFeature[] = [
  {
    id: "1",
    icon: "MapPin",
    title: "Absensi GPS",
    description:
      "Validasi lokasi real-time dengan teknologi GPS canggih yang akurat hingga beberapa meter. Sistem secara otomatis memverifikasi apakah pegawai berada dalam radius yang ditentukan saat check-in/check-out.",
  },
  {
    id: "2",
    icon: "Shield",
    title: "Anti Fake GPS",
    description:
      "Keamanan tingkat tinggi dengan deteksi otomatis terhadap aplikasi fake GPS, mock location, dan upaya manipulasi lokasi lainnya.",
  },
  {
    id: "3",
    icon: "Clock",
    title: "Multi Shift",
    description:
      "Kelola berbagai shift kerja fleksibel seperti shift pagi, siang, malam, atau custom sesuai kebutuhan organisasi.",
  },
  {
    id: "4",
    icon: "Building2",
    title: "Multi Kantor",
    description:
      "Satu akun organisasi dapat mengelola banyak lokasi kantor atau cabang. Setiap lokasi memiliki titik koordinat dan radius toleransi masing-masing.",
  },
  {
    id: "5",
    icon: "FileText",
    title: "Izin & Cuti",
    description:
      "Pengajuan izin, cuti tahunan, sakit, dan tugas luar secara online dengan alur persetujuan digital.",
  },
  {
    id: "6",
    icon: "Timer",
    title: "Pengajuan Lembur",
    description:
      "Request lembur dengan sistem approval berjenjang dan perhitungan otomatis berdasarkan rate yang dikonfigurasi.",
  },
  {
    id: "7",
    icon: "Globe",
    title: "WFH & Dinas Luar",
    description:
      "Absensi dari mana saja untuk pegawai dengan tugas lapangan atau bekerja dari rumah dengan persetujuan.",
  },
  {
    id: "8",
    icon: "UserCheck",
    title: "Approval Berjenjang",
    description:
      "Persetujuan bertingkat sesuai struktur organisasi dari atasan langsung hingga admin.",
  },
  {
    id: "9",
    icon: "Bell",
    title: "Notifikasi Realtime",
    description:
      "Alert otomatis ke pegawai & admin via push notification, email, dan WhatsApp.",
  },
  {
    id: "10",
    icon: "PieChart",
    title: "Laporan Lengkap",
    description:
      "Export rekap absensi ke Excel & PDF dengan berbagai filter dan visualisasi data.",
  },
  {
    id: "11",
    icon: "Calendar",
    title: "Hari Libur Nasional",
    description:
      "Integrasi kalender libur nasional otomatis dan pengaturan hari libur custom per organisasi.",
  },
  {
    id: "12",
    icon: "Users",
    title: "Multi-Tenant SaaS",
    description:
      "Platform untuk banyak instansi dengan isolasi data yang aman dan independen.",
  },
];

const normalizeFeatureArray = (raw: unknown[]): HomepageFeature[] => {
  return raw
    .filter(isRecord)
    .map((item, index) => {
      const id = asString(item.id).trim() || String(index + 1);
      const icon = asString(item.icon).trim() || "MapPin";
      const title = asString(item.title).trim();
      const description = asString(item.description).trim();
      return { id, icon, title, description };
    })
    .filter((feature) => feature.title.length > 0);
};

/**
 * Normalize legacy/new variants:
 * - Array<Feature>
 * - { items: Array<Feature> }
 *
 * Returns:
 * - Feature[] when value has known shape (including empty array)
 * - null when unsupported shape (caller can keep fallback state)
 */
export const normalizeHomepageFeatures = (value: unknown): HomepageFeature[] | null => {
  if (Array.isArray(value)) {
    return normalizeFeatureArray(value);
  }

  if (isRecord(value) && Array.isArray(value.items)) {
    return normalizeFeatureArray(value.items);
  }

  return null;
};
