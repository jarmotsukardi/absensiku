#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android-webview"
APK_RELEASE_CONFIG="$ROOT_DIR/src/config/android-apk-release.json"
LOCAL_PROPERTIES_FILE="$ANDROID_DIR/local.properties"

resolve_local_property() {
  local key="$1"
  if [ ! -f "$LOCAL_PROPERTIES_FILE" ]; then
    return 1
  fi

  awk -F= -v target="$key" '
    $1 == target {
      sub(/^[^=]+= */, "", $0)
      print $0
      exit
    }
  ' "$LOCAL_PROPERTIES_FILE"
}

resolve_config() {
  local key="$1"
  local env_value="${!key:-}"
  if [ -n "$env_value" ]; then
    printf '%s' "$env_value"
    return 0
  fi

  resolve_local_property "$key" || true
}

if ! command -v java >/dev/null 2>&1; then
  echo "Error: Java runtime belum terpasang. Install JDK 17 terlebih dulu."
  exit 1
fi

if [ ! -x "$ANDROID_DIR/gradlew" ]; then
  echo "Error: gradlew tidak ditemukan di $ANDROID_DIR"
  exit 1
fi

ANDROID_SDK_ROOT_VALUE="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$ANDROID_SDK_ROOT_VALUE" ]; then
  sdk_dir="$(resolve_local_property "sdk.dir" || true)"
  ANDROID_SDK_ROOT_VALUE="${sdk_dir:-}"
fi

if [ -z "$ANDROID_SDK_ROOT_VALUE" ]; then
  echo "Error: ANDROID_SDK_ROOT/ANDROID_HOME belum tersedia dan sdk.dir tidak ditemukan."
  exit 1
fi

APKSIGNER_BIN="$ANDROID_SDK_ROOT_VALUE/build-tools/36.0.0/apksigner"
if [ ! -x "$APKSIGNER_BIN" ]; then
  APKSIGNER_BIN="$(find "$ANDROID_SDK_ROOT_VALUE/build-tools" -name apksigner 2>/dev/null | sort | tail -n 1)"
fi

if [ -z "${APKSIGNER_BIN:-}" ] || [ ! -x "$APKSIGNER_BIN" ]; then
  echo "Error: apksigner tidak ditemukan di Android SDK Build-Tools."
  exit 1
fi

KEYSTORE_FILE="$(resolve_config "ABSENSIKU_ANDROID_KEYSTORE_FILE")"
KEYSTORE_PASSWORD="$(resolve_config "ABSENSIKU_ANDROID_KEYSTORE_PASSWORD")"
KEY_ALIAS="$(resolve_config "ABSENSIKU_ANDROID_KEY_ALIAS")"
KEY_PASSWORD="$(resolve_config "ABSENSIKU_ANDROID_KEY_PASSWORD")"

if [ -z "$KEYSTORE_FILE" ] && [ -f "$ANDROID_DIR/signing/absensiku-release-v101.keystore" ]; then
  KEYSTORE_FILE="$ANDROID_DIR/signing/absensiku-release-v101.keystore"
fi

if [ -n "$KEYSTORE_FILE" ] && [ "${KEYSTORE_FILE#/}" = "$KEYSTORE_FILE" ]; then
  KEYSTORE_FILE="$ROOT_DIR/$KEYSTORE_FILE"
fi

if [ -z "$KEYSTORE_FILE" ] || [ -z "$KEYSTORE_PASSWORD" ] || [ -z "$KEY_ALIAS" ] || [ -z "$KEY_PASSWORD" ]; then
  echo "Error: konfigurasi release signing belum lengkap."
  echo "Wajib isi:"
  echo "- ABSENSIKU_ANDROID_KEYSTORE_FILE"
  echo "- ABSENSIKU_ANDROID_KEYSTORE_PASSWORD"
  echo "- ABSENSIKU_ANDROID_KEY_ALIAS"
  echo "- ABSENSIKU_ANDROID_KEY_PASSWORD"
  exit 1
fi

if [ ! -f "$KEYSTORE_FILE" ]; then
  echo "Error: keystore release tidak ditemukan di $KEYSTORE_FILE"
  exit 1
fi

cd "$ANDROID_DIR"

ABSENSIKU_ANDROID_KEYSTORE_FILE="$KEYSTORE_FILE" \
ABSENSIKU_ANDROID_KEYSTORE_PASSWORD="$KEYSTORE_PASSWORD" \
ABSENSIKU_ANDROID_KEY_ALIAS="$KEY_ALIAS" \
ABSENSIKU_ANDROID_KEY_PASSWORD="$KEY_PASSWORD" \
./gradlew --no-daemon assembleRelease

SIGNED_APK_PATH="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$SIGNED_APK_PATH" ]; then
  SIGNED_APK_PATH="$(find "$ANDROID_DIR/app/build/outputs/apk/release" -maxdepth 1 -name '*.apk' | sort | tail -n 1)"
fi

if [ -z "${SIGNED_APK_PATH:-}" ] || [ ! -f "$SIGNED_APK_PATH" ]; then
  echo "Error: APK release hasil build tidak ditemukan."
  exit 1
fi

CERT_INFO="$("$APKSIGNER_BIN" verify --print-certs "$SIGNED_APK_PATH")"
if printf '%s' "$CERT_INFO" | grep -q "CN=Android Debug"; then
  echo "Error: APK release masih memakai Android Debug certificate."
  printf '%s\n' "$CERT_INFO"
  exit 1
fi

APK_VERSION="$(node -e "const fs=require('fs'); const cfg=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(cfg.currentVersion || '1.0.0')" "$APK_RELEASE_CONFIG")"

echo "APK release signed berhasil dibuat:"
echo "$SIGNED_APK_PATH"
echo "Versi APK saat ini: v$APK_VERSION"
printf '%s\n' "$CERT_INFO"
