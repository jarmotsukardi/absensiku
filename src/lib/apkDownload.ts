import androidApkReleaseConfig from "@/config/android-apk-release.json";

type ApkReleaseConfig = {
  downloadPagePath?: string;
  versionCode?: number;
  currentVersion?: string;
  releases?: ApkReleaseInfo[];
};

const apkReleaseConfig = androidApkReleaseConfig as ApkReleaseConfig;

export const APK_DOWNLOAD_PAGE_PATH = apkReleaseConfig.downloadPagePath || "/download";
export const HOMEPAGE_PUBLIC_APK_VERSION = apkReleaseConfig.currentVersion || "1.0.0";
export const HOMEPAGE_PUBLIC_APK_URL =
  apkReleaseConfig.releases?.[0]?.url || `/downloads/AbsensiKu-Android-${HOMEPAGE_PUBLIC_APK_VERSION}.apk`;

export interface ApkReleaseInfo {
  version: string;
  url: string;
  releasedAt: string;
  notes?: string;
  sha256?: string;
  fileSizeBytes?: number;
  signingSubject?: string;
  signingSha256?: string;
  signingSha1?: string;
}

type JsonLikeRecord = Record<string, unknown> | null | undefined;

const STATIC_APK_RELEASES: ApkReleaseInfo[] =
  apkReleaseConfig.releases?.length
    ? apkReleaseConfig.releases
    : [
        {
          version: HOMEPAGE_PUBLIC_APK_VERSION,
          url: HOMEPAGE_PUBLIC_APK_URL,
          releasedAt: new Date().toISOString(),
          notes: "Rilis Android terbaru untuk AbsensiKu.",
        },
      ];

const getTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getRecordString = (value: JsonLikeRecord, key: string): string | null => {
  if (!value || Array.isArray(value)) return null;
  return getTrimmedString(value[key]);
};

const normalizeVersion = (value: string | null, fallbackVersion: string): string => {
  if (!value) return fallbackVersion;
  const matchedVersion = value.match(/\d+(?:\.\d+)+/);
  return matchedVersion?.[0] ?? fallbackVersion;
};

interface ResolveApkUrlOptions {
  appDownloadValue?: JsonLikeRecord;
  globalApkValue?: JsonLikeRecord;
  apkSettingsValue?: JsonLikeRecord;
  fallbackUrl?: string | null;
}

export function resolveApkUrl({
  appDownloadValue,
  globalApkValue,
  apkSettingsValue,
  fallbackUrl = null,
}: ResolveApkUrlOptions): string | null {
  return (
    getRecordString(appDownloadValue, "apk_url") ??
    getRecordString(globalApkValue, "url") ??
    getRecordString(apkSettingsValue, "url") ??
    fallbackUrl
  );
}

interface ResolveConfiguredApkReleaseOptions extends ResolveApkUrlOptions {
  fallbackVersion?: string;
  fallbackReleasedAt?: string;
}

export function resolveConfiguredApkRelease({
  appDownloadValue,
  globalApkValue,
  apkSettingsValue,
  fallbackUrl = HOMEPAGE_PUBLIC_APK_URL,
  fallbackVersion = HOMEPAGE_PUBLIC_APK_VERSION,
  fallbackReleasedAt = STATIC_APK_RELEASES[0]?.releasedAt ?? new Date().toISOString(),
}: ResolveConfiguredApkReleaseOptions): ApkReleaseInfo | null {
  const url = resolveApkUrl({
    appDownloadValue,
    globalApkValue,
    apkSettingsValue,
    fallbackUrl,
  });

  if (!url) return null;

  const rawVersion =
    getRecordString(appDownloadValue, "apk_version") ??
    getRecordString(appDownloadValue, "version") ??
    getRecordString(globalApkValue, "version") ??
    getRecordString(apkSettingsValue, "version");

  const releasedAt =
    getRecordString(appDownloadValue, "updated_at") ??
    getRecordString(appDownloadValue, "updatedAt") ??
    getRecordString(globalApkValue, "updated_at") ??
    getRecordString(globalApkValue, "updatedAt") ??
    getRecordString(apkSettingsValue, "updated_at") ??
    getRecordString(apkSettingsValue, "updatedAt") ??
    fallbackReleasedAt;

  return {
    version: normalizeVersion(rawVersion, fallbackVersion),
    url,
    releasedAt,
  };
}

function enrichConfiguredRelease(configuredRelease?: ApkReleaseInfo | null): ApkReleaseInfo | null {
  if (!configuredRelease?.url) return null;

  const normalizedVersion = normalizeVersion(configuredRelease.version, HOMEPAGE_PUBLIC_APK_VERSION);
  const staticReleaseWithSameVersion = STATIC_APK_RELEASES.find(
    (release) => normalizeVersion(release.version, HOMEPAGE_PUBLIC_APK_VERSION) === normalizedVersion,
  );

  if (!staticReleaseWithSameVersion) {
    return {
      ...configuredRelease,
      version: normalizedVersion,
    };
  }

  return {
    ...staticReleaseWithSameVersion,
    ...configuredRelease,
    version: normalizedVersion,
    notes: configuredRelease.notes ?? staticReleaseWithSameVersion.notes,
    sha256: configuredRelease.sha256 ?? staticReleaseWithSameVersion.sha256,
    fileSizeBytes: configuredRelease.fileSizeBytes ?? staticReleaseWithSameVersion.fileSizeBytes,
    signingSubject: configuredRelease.signingSubject ?? staticReleaseWithSameVersion.signingSubject,
    signingSha256: configuredRelease.signingSha256 ?? staticReleaseWithSameVersion.signingSha256,
    signingSha1: configuredRelease.signingSha1 ?? staticReleaseWithSameVersion.signingSha1,
  };
}

export function getPublicApkReleases(configuredRelease?: ApkReleaseInfo | null): ApkReleaseInfo[] {
  const dedupedReleases = new Map<string, ApkReleaseInfo>();
  const normalizedConfiguredRelease = enrichConfiguredRelease(configuredRelease);

  [normalizedConfiguredRelease, ...STATIC_APK_RELEASES].forEach((release) => {
    if (!release?.url) return;
    const version = normalizeVersion(release.version, HOMEPAGE_PUBLIC_APK_VERSION);
    const normalizedRelease = {
      ...release,
      version,
    };
    const existingRelease = dedupedReleases.get(version);
    if (!existingRelease) {
      dedupedReleases.set(version, normalizedRelease);
      return;
    }

    if (new Date(normalizedRelease.releasedAt).getTime() > new Date(existingRelease.releasedAt).getTime()) {
      dedupedReleases.set(version, normalizedRelease);
    }
  });

  return Array.from(dedupedReleases.values())
    .sort((left, right) => new Date(right.releasedAt).getTime() - new Date(left.releasedAt).getTime())
    .slice(0, 3);
}
