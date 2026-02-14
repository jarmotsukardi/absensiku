#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android-webview"

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

echo "APK debug berhasil dibuat:"
echo "$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
