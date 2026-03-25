import fs from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const configPath = path.join(rootDir, "src", "config", "android-apk-release.json");
const publicDownloadsDir = path.join(rootDir, "public", "downloads");
const androidBuildDownloadsDir = path.join(
  rootDir,
  "android-webview",
  "app",
  "build",
  "outputs",
  "apk",
  "debug",
);
const MAX_RELEASES = 3;

const input = process.argv[2]?.trim() || "patch";

const parseVersion = (value) => {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Format versi tidak valid: ${value}. Gunakan format x.y.z`);
  }
  return match.slice(1).map((part) => Number(part));
};

const formatVersion = ([major, minor, patch]) => `${major}.${minor}.${patch}`;

const nextVersionFromMode = (currentVersion, mode) => {
  const [major, minor, patch] = parseVersion(currentVersion);
  if (mode === "major") return formatVersion([major + 1, 0, 0]);
  if (mode === "minor") return formatVersion([major, minor + 1, 0]);
  if (mode === "patch") return formatVersion([major, minor, patch + 1]);
  parseVersion(mode);
  return mode;
};

const ensureReleaseEntry = (releases, version) => {
  const existingRelease = releases.find((release) => release.version === version);
  const defaultEntry = {
    version,
    url: `/downloads/AbsensiKu-Android-${version}.apk`,
    releasedAt: new Date().toISOString(),
    notes: `Rilis Android AbsensiKu v${version}.`,
  };

  if (!existingRelease) return [defaultEntry, ...releases].slice(0, MAX_RELEASES);

  return [
    {
      ...existingRelease,
      version,
      url: existingRelease.url || defaultEntry.url,
      releasedAt: existingRelease.releasedAt || defaultEntry.releasedAt,
      notes: existingRelease.notes || defaultEntry.notes,
    },
    ...releases.filter((release) => release.version !== version),
  ].slice(0, MAX_RELEASES);
};

const pruneVersionedApkFiles = async (targetDir, allowedVersions) => {
  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const allowedNames = new Set(
      [...allowedVersions].map((version) => `AbsensiKu-Android-${version}.apk`),
    );

    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .filter((entry) => /^AbsensiKu-Android-\d+\.\d+\.\d+\.apk$/.test(entry.name))
        .filter((entry) => !allowedNames.has(entry.name))
        .map((entry) => fs.rm(path.join(targetDir, entry.name), { force: true })),
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
};

const rawConfig = await fs.readFile(configPath, "utf8");
const config = JSON.parse(rawConfig);

const currentVersion = config.currentVersion || "1.0.0";
const nextVersion = nextVersionFromMode(currentVersion, input);
const currentVersionCode = Number(config.versionCode || 1);

config.currentVersion = nextVersion;
config.versionCode = currentVersion === nextVersion ? currentVersionCode : currentVersionCode + 1;
config.downloadPagePath = "/download";
config.releases = ensureReleaseEntry(Array.isArray(config.releases) ? config.releases : [], nextVersion);

await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

const allowedVersions = new Set(config.releases.map((release) => release.version));
await pruneVersionedApkFiles(publicDownloadsDir, allowedVersions);
await pruneVersionedApkFiles(androidBuildDownloadsDir, allowedVersions);

console.log(`APK version updated: ${currentVersion} -> ${nextVersion}`);
console.log(`versionCode: ${currentVersionCode} -> ${config.versionCode}`);
console.log(`config: ${path.relative(rootDir, configPath)}`);
console.log(`release window: top ${MAX_RELEASES} versi terbaru dipertahankan`);
