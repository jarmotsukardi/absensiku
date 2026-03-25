# 🚀 Quick Setup Genymotion - Step by Step

Panduan cepat setup Genymotion untuk testing APK AbsensiKu.

---

## ✅ **Status Saat Ini**

| Item | Status |
|------|--------|
| **VirtualBox** | ✅ Terinstall |
| **Genymotion** | ✅ Running |
| **Virtual Device** | ❌ Belum ada (perlu download) |
| **APK** | ✅ Ready |

---

## 📥 **Step-by-Step Setup (15-20 menit)**

### **Step 1: Login ke Genymotion**

1. Genymotion sudah terbuka (jika belum: `open /Applications/Genymotion.app`)
2. Jika muncul dialog login:
   - **Email:** Masukkan email Anda
   - **Password:** Masukkan password Genymotion
3. Jika belum punya akun:
   - Klik **"Sign Up"** atau buka: https://www.genymotion.com/account/register/
   - Pilih: **"Personal Use"** (FREE)
   - Isi form registrasi
   - Verify email

### **Step 2: Download Virtual Device**

1. Di jendela Genymotion, klik tombol **"Add"** (icon `+` di kiri atas)
2. Akan muncul daftar available devices
3. **Pilih device yang recommended:**
   - **Name:** Google Pixel 6
   - **Android version:** Android 11.0 atau Android 12.0
   - **API level:** 30 atau 31
   
4. Klik **"Next"** (pojok kanan bawah)

5. Di layar berikutnya:
   - **Shared folder:** (optional, bisa skip)
   - Klik **"Finish"**

6. Download akan dimulai (~500MB-1GB, tunggu 5-10 menit tergantung internet)

### **Step 3: Start Virtual Device**

1. Setelah download selesai, device akan muncul di list Genymotion
2. **Select device** (klik nama device)
3. Klik tombol **"Start"** (icon ▶️ hijau di toolbar)
4. Tunggu booting (1-3 menit pertama kali)

### **Step 4: Verify Device Ready**

Setelah device booting sempurna:

```bash
# Cek apakah device terdeteksi ADB
/Users/user/Library/Android/sdk/platform-tools/adb devices

# Output yang diharapkan:
# List of devices attached
# 192.168.56.101:5555    device
```

Jika muncul "device", berarti **Genymotion siap!** ✅

---

## 🧪 **Test APK AbsensiKu**

Setelah device ready, langsung test:

```bash
cd /Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview

# Jalankan test script
./tools/test-apk.sh
```

Script akan otomatis:
- ✅ Install APK ke Genymotion
- ✅ Launch app
- ✅ Ambil screenshot

---

## 🐛 **Troubleshooting**

### **Genymotion: "VirtualBox not found"**

```bash
# Verify VirtualBox terinstall
ls -la /Applications/VirtualBox.app

# Jika tidak ada, install ulang:
sudo installer -pkg /usr/local/Caskroom/virtualbox/7.2.6,172322/VirtualBox.pkg -target /
```

### **Device tidak muncul di ADB**

```bash
# Restart ADB server
/Users/user/Library/Android/sdk/platform-tools/adb kill-server
/Users/user/Library/Android/sdk/platform-tools/adb start-server
/Users/user/Library/Android/sdk/platform-tools/adb devices

# Configure Genymotion ADB settings:
# 1. Genymotion → Settings (icon gear)
# 2. Tab "ADB"
# 3. Select: "Use Android SDK ADB tools"
# 4. Set path: /Users/user/Library/Android/sdk/platform-tools/adb
# 5. Restart Genymotion
```

### **Genymotion: "Unable to start virtual device"**

1. Buka **Genymotion** → **Settings** (⚙️)
2. Tab **ADB**
3. Pilih: **"Use Android SDK ADB tools"**
4. ADB location: `/Users/user/Library/Android/sdk/platform-tools/adb`
5. Restart Genymotion

### **Bootloop / Stuck di Logo**

- Force close device (icon ❌ di toolbar)
- Start ulang device
- Jika masih, wipe data device (klik icon 🗑️)

---

## 📋 **Test Checklist Cepat**

Setelah APK terinstall di Genymotion:

```
[ ] 1. App bisa dibuka tanpa crash
[ ] 2. Login screen muncul
[ ] 3. Bisa input email/password
[ ] 4. Login dengan kredensial salah → error muncul
[ ] 5. Login sukses → dashboard terbuka
[ ] 6. Close app → buka lagi → masih login (session persist)
```

**Total waktu test: ~10 menit**

---

## 🎯 **Keyboard Shortcuts Genymotion**

| Shortcut | Function |
|----------|----------|
| `Cmd + F` | Toggle fullscreen |
| `Cmd + H` | Go to home screen |
| `Cmd + B` | Back button |
| `Cmd + M` | Menu button |
| `Cmd + P` | Screenshot |
| `Cmd + R` | Rotate screen |

---

## 📸 **Take Screenshot**

```bash
# Via ADB
/Users/user/Library/Android/sdk/platform-tools/adb shell screencap -p /data/local/tmp/screenshot.png
/Users/user/Library/Android/sdk/platform-tools/adb pull /data/local/tmp/screenshot.png ./genymotion-screenshot.png
```

Atau pakai shortcut Genymotion: `Cmd + P`

---

## 📞 **Need Help?**

- **Genymotion Docs:** https://www.genymotion.com/help/
- **Test Guide:** See `TEST_GUIDE.md`
- **Emulator Setup:** See `android-webview/docs/setup/EMULATOR_SETUP.md`

---

**Last Updated:** March 10, 2026
