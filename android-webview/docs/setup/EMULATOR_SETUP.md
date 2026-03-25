# 🎮 Panduan Setup Emulator untuk Testing

Dokumen ini menjelaskan cara setup emulator untuk testing APK AbsensiKu.

---

## ✅ **Yang Sudah Terinstall**

| Software | Status | Lokasi |
|----------|--------|--------|
| **Genymotion** | ✅ Installed | `/Applications/Genymotion.app` |
| **Android SDK** | ✅ Installed | `/Users/user/Library/Android/sdk` |
| **ADB** | ✅ Available | `/Users/user/Library/Android/sdk/platform-tools/adb` |

---

## ⚠️ **Yang Perlu Diinstall Manual**

### **VirtualBox (Required untuk Genymotion)**

Genymotion membutuhkan VirtualBox untuk menjalankan virtual device.

**Cara Install:**

1. **Download VirtualBox:**
   - Buka: https://www.virtualbox.org/wiki/Downloads
   - Download: "OS X hosts"

2. **Install:**
   - Buka file `.dmg` yang didownload
   - Double-click `VirtualBox.pkg`
   - Ikuti wizard installation
   - **Masukkan password Mac** saat diminta

3. **Allow Security Permission:**
   - Buka **System Preferences** → **Security & Privacy**
   - Klik **Allow** untuk "Oracle America, Inc."
   - Restart Mac jika diminta

4. **Verify Installation:**
   ```bash
   ls -la /Applications/ | grep -i virtualbox
   # Output: VirtualBox.app
   ```

---

## 🚀 **Setup Genymotion**

### **Step 1: Buka Genymotion**

```bash
open /Applications/Genymotion.app
```

Atau double-click icon Genymotion di Applications folder.

### **Step 2: Login/Register**

- Jika belum punya akun: **Sign Up** di https://www.genymotion.com/
- Pilih: **Personal Use** (Free)
- Login dengan email & password

### **Step 3: Download Virtual Device**

1. Di Genymotion, klik **Add** (icon `+`)
2. Pilih device yang tersedia (contoh: **Google Pixel 6**)
3. Pilih Android version (contoh: **Android 11/12/13**)
4. Klik **Next** → **Download**
5. Tunggu download selesai (size: ~500MB-1GB)

### **Step 4: Start Virtual Device**

1. Select device yang sudah didownload
2. Klik **Start** (icon ▶️)
3. Tunggu booting (1-2 menit pertama kali)

### **Step 5: Verify Device**

```bash
adb devices
# Output:
# List of devices attached
# 192.168.56.101:5555    device
```

---

## 📱 **Alternatif: HP Android Fisik (RECOMMENDED)**

Jika tidak ingin setup emulator, pakai HP Android langsung:

### **Step 1: Enable Developer Options**

1. Buka **Settings** → **About Phone**
2. Tap **Build Number** 7 kali
3. Kembali ke **Settings** → **Developer Options**

### **Step 2: Enable USB Debugging**

1. Di **Developer Options**, enable **USB Debugging**
2. Connect HP ke Mac via USB cable

### **Step 3: Verify**

```bash
adb devices
# Output:
# List of devices attached
# XXXXXXXXXXXXXX    device
```

---

## 🧪 **Testing APK**

### **Opsi 1: Pakai Script Otomatis**

```bash
cd /Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview
./tools/test-apk.sh
```

Script akan:
- ✅ Cek device tersedia
- ✅ Install APK
- ✅ Launch app
- ✅ Ambil screenshot

### **Opsi 2: Manual**

```bash
# 1. Install APK
adb install -r app/build/outputs/apk/release/app-release-signed.apk

# 2. Launch app
adb shell am start -n com.absensiku.webview/.MainActivity

# 3. View logs
adb logcat | grep -i absensiku

# 4. Take screenshot
adb shell screencap -p /data/local/tmp/screenshot.png
adb pull /data/local/tmp/screenshot.png
```

---

## 🐛 **Troubleshooting**

### **Genymotion: "VirtualBox not found"**

```bash
# Verify VirtualBox installed
ls -la /Applications/ | grep -i virtualbox

# Jika tidak ada, install VirtualBox dulu
# See: https://www.virtualbox.org/wiki/Downloads
```

### **ADB: "No devices found"**

**Untuk Emulator:**
- Pastikan emulator sudah fully booted
- Restart ADB server:
  ```bash
  adb kill-server
  adb start-server
  adb devices
  ```

**Untuk HP Fisik:**
- Check USB cable connected properly
- Enable USB Debugging di Developer Options
- Allow USB debugging permission di HP saat connect

### **Genymotion: "Unable to start virtual device"**

1. Buka Genymotion → **Settings**
2. Tab **ADB**
3. Set: **Use Android SDK ADB tools**
4. ADB location: `/Users/user/Library/Android/sdk/platform-tools/adb`
5. Restart Genymotion

### **Mac Security Block VirtualBox**

1. Buka **System Preferences** → **Security & Privacy**
2. Tab **General**
3. Klik **Allow** untuk VirtualBox
4. Restart Mac

---

## 📊 **Comparison: Emulator vs Physical Device**

| Aspect | Emulator | Physical Device |
|--------|----------|-----------------|
| **Setup Time** | 30-60 min | 5 min |
| **Speed** | Medium | Fast |
| **Accuracy** | Good | **Best** |
| **GPS Testing** | Simulated | **Real** |
| **Camera Testing** | No | **Yes** |
| **Performance** | Varies | **Real** |
| **Cost** | Free | Need device |

**Recommendation:** 
- Development: Emulator OK
- Production Testing: **Physical Device Required**

---

## 🎯 **Quick Start (TL;DR)**

**Paling Cepat (Recommended):**
```bash
# 1. Connect HP Android via USB
# 2. Enable USB Debugging di HP
# 3. Run:
cd /Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview
./tools/test-apk.sh
```

**Pakai Genymotion:**
```bash
# 1. Install VirtualBox: https://www.virtualbox.org/
# 2. Open Genymotion
# 3. Login & download virtual device
# 4. Start device
# 5. Run:
./tools/test-apk.sh
```

---

## 📞 **Need Help?**

- Genymotion Docs: https://www.genymotion.com/help/
- ADB Guide: https://developer.android.com/studio/command-line/adb
- Test Guide: See `TEST_GUIDE.md` in this directory

---

**Last Updated:** March 10, 2026
**APK Version:** 1.0.0
