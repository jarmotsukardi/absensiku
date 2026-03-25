# 📱 Panduan Testing APK AbsensiKu

Dokumen ini berisi panduan lengkap untuk testing APK AbsensiKu.

---

## ✅ **Status Build APK**

| Item | Status | Lokasi |
|------|--------|--------|
| **APK Release (Signed)** | ✅ Ready | `app/build/outputs/apk/release/app-release-signed.apk` |
| **Keystore** | ✅ Ready | `signing/absensiku-release.keystore` |
| **Version** | 1.0.0 (Version Code: 1) | |
| **Min SDK** | 24 (Android 7.0) | |
| **Target SDK** | 35 (Android 15) | |

---

## 🛠️ **Cara Install APK**

### **Opsi 1: Via ADB (USB Debugging)**

```bash
# 1. Hubungkan HP Android via USB atau start emulator
adb devices

# 2. Install APK
cd /Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview
adb install -r app/build/outputs/apk/release/app-release-signed.apk

# 3. Verify installation
adb shell pm list packages | grep absensiku
# Output: package:com.absensiku.webview
```

### **Opsi 2: Manual Install (File Transfer)**

1. Copy file `app-release-signed.apk` ke HP Android
2. Buka File Manager di HP
3. Tap file APK → **Install**
4. Izinkan "Install from Unknown Sources" jika diminta

---

## 🧪 **Test Checklist**

### **A. Basic Sanity Test (5 menit)**

```
[ ] 1. App bisa dibuka tanpa crash
[ ] 2. Login screen muncul dengan branding "Aplikasi Internal Pegawai"
[ ] 3. Logo app tampil di bagian atas
[ ] 4. Tab "Masuk" dan "Daftar" ada dan bisa diklik
[ ] 5. Field email dan password bisa di-input
[ ] 6. Tombol "Masuk" bisa diklik
[ ] 7. Tombol "Lupa / Ganti Password?" ada dan bisa diklik
```

### **B. Login Flow Test (10 menit)**

```
[ ] 1. Login dengan empty email → error "Email wajib diisi"
[ ] 2. Login dengan invalid email → error "Format email tidak valid"
[ ] 3. Login dengan password < 6 karakter → error "Password minimal 6 karakter"
[ ] 4. Login dengan kredensial salah → error "Email atau password salah"
[ ] 5. Login sukses → loading "Meneruskan sesi ke dashboard..."
[ ] 6. Dashboard terbuka setelah login sukses
```

### **C. Session Persistensi Test (5 menit)**

```
[ ] 1. Setelah login sukses, close app
[ ] 2. Buka app lagi → langsung ke dashboard (tidak perlu login ulang)
[ ] 3. Force stop app dari Settings
[ ] 4. Buka app lagi → masih login (session persist)
```

### **D. Logout Test (3 menit)**

```
[ ] 1. Dari dashboard, lakukan logout
[ ] 2. App kembali ke login screen
[ ] 3. Close app dan buka lagi → tetap di login screen
```

### **E. Security Test - Fake GPS Detection (10 menit)**

```
[ ] 1. Install aplikasi Fake GPS dari Play Store
[ ] 2. Enable "Allow mock locations" di Developer Options
[ ] 3. Set lokasi palsu di Fake GPS app
[ ] 4. Buka app AbsensiKu
[ ] 5. App harus menampilkan screen blokir: "Akses Diblokir"
[ ] 6. Disable mock location / uninstall Fake GPS
[ ] 7. Tap "Coba Lagi" → app bisa dibuka normal
```

### **F. Register Flow Test (15 menit)**

```
[ ] 1. Tab "Daftar" → pilih "Email"
[ ] 2. Tab "Daftar" → pilih "Undangan"  
[ ] 3. Tab "Daftar" → pilih "Organisasi"
[ ] 4. Semua flow registrasi berfungsi tanpa crash
```

### **G. Forgot Password Test (5 menit)**

```
[ ] 1. Login screen → tap "Lupa / Ganti Password?"
[ ] 2. Dialog muncul dengan opsi "Lupa Password" dan "Ganti Password"
[ ] 3. Pilih metode pengiriman (Email/WhatsApp)
[ ] 4. OTP/password baru terkirim
```

---

## 🐛 **Troubleshooting**

### **App Crash saat Dibuka**
```bash
# Cek logcat
adb logcat | grep -i absensiku

# Uninstall dan reinstall
adb uninstall com.absensiku.webview
adb install -r app/build/outputs/apk/release/app-release-signed.apk
```

### **Session Tidak Persist**
- Clear data app dan login ulang
- Pastikan koneksi internet stabil

### **Fake GPS Tidak Terdeteksi**
- Pastikan Developer Options aktif
- Test dengan Fake GPS app yang known (Lexa Fake GPS)

---

## 📋 **Test Report Template**

```
## Test Report - AbsensiKu APK v1.0.0

**Tanggal Test:** [YYYY-MM-DD]
**Tester:** [Nama]
**Device:** [HP/Emulator, Android Version]

### Results Summary
- Total Tests: XX
- Passed: XX
- Failed: XX

### Issues Found
| ID | Test Case | Expected | Actual | Severity |
|----|-----------|----------|--------|----------|

### Conclusion
[ ] Ready for production
[ ] Need fixes
```

---

**Last Updated:** March 10, 2026
**APK Version:** 1.0.0
