import { useMemo } from "react";

import { useSystemSettings } from "@/hooks/useSystemSettings";

export const PUBLIC_BASE_URL = "https://absensipro.com";
export const PUBLIC_LOGO_URL = `${PUBLIC_BASE_URL}/favicon.ico`;

export interface PublicSeoSettings {
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
}

export const defaultPublicSeoSettings: PublicSeoSettings = {
  metaTitle: "AbsensiKu - Sistem Absensi GPS untuk Instansi dan Perusahaan",
  metaDescription:
    "Aplikasi absensi pegawai berbasis GPS untuk pemerintah daerah, instansi, perusahaan, dan sekolah. Harga publik difokuskan untuk layanan Absensi, dengan konsultasi lanjutan tersedia untuk kebutuhan HR dan Payroll.",
  metaKeywords:
    "absensi gps, aplikasi absensi pegawai, absensi pemerintah, absensi perusahaan, software absensi, sistem absensi digital",
  ogTitle: "AbsensiKu - Sistem Absensi GPS untuk Instansi dan Perusahaan",
  ogDescription:
    "Mulai dari absensi harian yang akurat. Kebutuhan HR dan Payroll dibahas sebagai tahap lanjutan saat organisasi siap.",
  ogImage: "",
  twitterTitle: "AbsensiKu - Sistem Absensi GPS",
  twitterDescription:
    "Platform absensi digital untuk pemerintah, instansi, perusahaan, dan sekolah.",
};

interface PublicSeoOverrides {
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
}

export function usePublicSeoSettings(overrides: PublicSeoOverrides = {}) {
  const { setting } = useSystemSettings("seo_settings");

  return useMemo(() => {
    const fetched =
      setting && typeof setting === "object"
        ? (setting as Partial<PublicSeoSettings>)
        : {};

    return {
      ...defaultPublicSeoSettings,
      ...fetched,
      ...overrides,
      ogTitle: overrides.ogTitle || overrides.metaTitle || fetched.ogTitle || fetched.metaTitle || defaultPublicSeoSettings.ogTitle,
      ogDescription:
        overrides.ogDescription ||
        overrides.metaDescription ||
        fetched.ogDescription ||
        fetched.metaDescription ||
        defaultPublicSeoSettings.ogDescription,
      twitterTitle:
        overrides.twitterTitle ||
        overrides.metaTitle ||
        fetched.twitterTitle ||
        fetched.metaTitle ||
        defaultPublicSeoSettings.twitterTitle,
      twitterDescription:
        overrides.twitterDescription ||
        overrides.metaDescription ||
        fetched.twitterDescription ||
        fetched.metaDescription ||
        defaultPublicSeoSettings.twitterDescription,
    };
  }, [overrides, setting]);
}
