# AbsensiKu Android WebView APK

Project ini adalah wrapper Android WebView untuk URL:

- https://absensiku-alpha.vercel.app/employee/login

## Fitur keamanan yang dipasang

- Blokir jika ada `mock_location_app` aktif di Developer Options.
- Blokir jika terdeteksi aplikasi Fake GPS populer.
- Blokir jika update lokasi Android terdeteksi `isMock` / `isFromMockProvider`.

## Build APK (Android Studio)

1. Buka folder `android-webview` di Android Studio.
2. Tunggu Gradle sync selesai.
3. Build APK debug:
   - `Build` -> `Build Bundle(s) / APK(s)` -> `Build APK(s)`
4. Output debug APK:
   - `android-webview/app/build/outputs/apk/debug/app-debug.apk`

## Build APK via CLI

Jika Android SDK sudah terpasang dan `gradlew` tersedia:

```bash
cd android-webview
./gradlew assembleDebug
```

Output:

- `android-webview/app/build/outputs/apk/debug/app-debug.apk`

## Build APK via GitHub Actions

Workflow tersedia di:

- `.github/workflows/build-android-webview.yml`

Cara pakai:

1. Push perubahan ke GitHub.
2. Buka tab `Actions` pada repo.
3. Jalankan workflow `Build Android WebView APK` (manual `workflow_dispatch`) atau cukup push file di `android-webview/`.
4. Download artifact `absensiku-webview-debug-apk`.

## Catatan penting

Proteksi anti fake GPS di level client tidak bisa 100% anti-bypass.
Untuk produksi, gabungkan juga validasi server-side (mis. anomali kecepatan, audit device binding, dan verifikasi sesi) agar lebih kuat.
