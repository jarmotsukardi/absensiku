#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: scripts/set-android-logo.sh /absolute/path/logo.png"
  exit 1
fi

SRC="$1"
if [ ! -f "$SRC" ]; then
  echo "File tidak ditemukan: $SRC"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RES_DIR="$ROOT_DIR/android-webview/app/src/main/res"

TMP_FILE="$(mktemp /tmp/absensiku-logo-XXXXXX.png)"
trap 'rm -f "$TMP_FILE"' EXIT

sips -s format png "$SRC" --out "$TMP_FILE" >/dev/null

mkdir -p \
  "$RES_DIR/mipmap-mdpi" \
  "$RES_DIR/mipmap-hdpi" \
  "$RES_DIR/mipmap-xhdpi" \
  "$RES_DIR/mipmap-xxhdpi" \
  "$RES_DIR/mipmap-xxxhdpi" \
  "$RES_DIR/drawable"

make_icon() {
  local size="$1"
  local folder="$2"
  sips -z "$size" "$size" "$TMP_FILE" --out "$RES_DIR/$folder/ic_launcher.png" >/dev/null
  cp "$RES_DIR/$folder/ic_launcher.png" "$RES_DIR/$folder/ic_launcher_round.png"
}

make_icon 48 mipmap-mdpi
make_icon 72 mipmap-hdpi
make_icon 96 mipmap-xhdpi
make_icon 144 mipmap-xxhdpi
make_icon 192 mipmap-xxxhdpi

sips -z 432 432 "$TMP_FILE" --out "$RES_DIR/drawable/ic_launcher_foreground.png" >/dev/null

echo "Logo Android berhasil di-generate dari: $SRC"
echo "Resource diupdate di: $RES_DIR"
