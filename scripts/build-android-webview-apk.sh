#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android-webview"
APK_RELEASE_CONFIG="$ROOT_DIR/src/config/android-apk-release.json"

if ! command -v java >/dev/null 2>&1; then
  echo "Error: Java runtime belum terpasang. Install JDK 17 terlebih dulu."
  exit 1
fi

if [ ! -x "$ANDROID_DIR/gradlew" ]; then
  echo "Error: gradlew tidak ditemukan di $ANDROID_DIR"
  exit 1
fi

cd "$ANDROID_DIR"
./gradlew --no-daemon assembleDebug

APK_VERSION="$(node -e "const fs=require('fs'); const cfg=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(cfg.currentVersion || '1.0.0')" "$APK_RELEASE_CONFIG")"

echo "APK debug berhasil dibuat:"
echo "$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
echo "Versi APK saat ini: v$APK_VERSION"
echo "Catatan: artefak ini hanya untuk debug lokal, bukan distribusi publik."
