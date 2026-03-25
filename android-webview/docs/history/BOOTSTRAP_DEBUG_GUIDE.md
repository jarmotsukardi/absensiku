# 🔍 BOOTSTRAP DEBUG GUIDE - Enhanced Logging

> Arsip historis debugging per 10 Maret 2026. Kredensial di dokumen ini harus diperlakukan sebagai placeholder.

**Date:** March 10, 2026
**Issue:** Masih terhalang halaman login webview setelah native login
**Action:** Enhanced logging + active bootstrap session injection

---

## 🔧 **ENHANCEMENTS ADDED**

### **1. Active Session Injection**

APK sekarang akan **actively inject** bootstrap session ke WebView dengan:

```javascript
// Injected 1 second after page load
window.Android.consumeBootstrapSession()
window.dispatchEvent(new CustomEvent('native-session-available'))
```

### **2. Enhanced Logging**

Logs ditambahkan di:
- `stageBootstrapSession()` - Saat session disiapkan
- `consumeBootstrapSession()` - Saat web side call bridge
- `syncWebSession()` - Saat session disinkronkan
- `showNativeLogin()` - Saat kembali ke login

---

## 📋 **MANUAL TEST WITH LOGGING**

### **Step 1: Install APK**

APK sudah terinstall dengan enhanced logging.

### **Step 2: Start Logcat**

```bash
adb logcat | grep -E "AbsensikuWebView|bootstrap|consumeBootstrapSession"
```

### **Step 3: Login**

1. Input email: `<akun-employee-uji-aktif>`
2. Input password: `<lihat-sumber-operasional-aman>`
3. Tap "Masuk"

### **Step 4: Observe Logs**

**Expected logs (SUCCESS):**

```
D/AbsensikuWebView: Loading bootstrap URL: .../employee/dashboard?bootstrap=1&ts=...
D/AbsensikuWebView: Injecting bootstrap session to WebView...
D/AbsensikuWebView: consumeBootstrapSession called, returning: session data (XXX chars)
D/AbsensikuWebView: notifySessionBootstrapComplete called
```

**Logs jika web side TIDAK call consumeBootstrapSession:**

```
D/AbsensikuWebView: Loading bootstrap URL: ...
D/AbsensikuWebView: Injecting bootstrap session to WebView...
(No further logs - web side tidak call consumeBootstrapSession)
```

**Logs jika kembali ke login:**

```
D/AbsensikuWebView: showNativeLogin called with message: null
```

---

## 🎯 **EXPECTED FLOW**

### **Ideal Flow:**

```
1. Native login sukses
   ↓
2. [LOG] Loading bootstrap URL: .../employee/dashboard?bootstrap=1
   ↓
3. [LOG] Injecting bootstrap session to WebView...
   ↓
4. WebView load dashboard
   ↓
5. Web side detect ?bootstrap=1 flag
   ↓
6. Web side call Android.consumeBootstrapSession()
   ↓
7. [LOG] consumeBootstrapSession called, returning: session data
   ↓
8. Web side inject session ke Supabase client
   ↓
9. [LOG] notifySessionBootstrapComplete called
   ↓
10. Dashboard terbuka dengan user logged in
```

### **Current Issue Flow:**

```
1. Native login sukses
   ↓
2. [LOG] Loading bootstrap URL
   ↓
3. [LOG] Injecting bootstrap session
   ↓
4. WebView load dashboard
   ↓
5. Web side redirect ke /employee/login
   ↓
6. APK redirect back to /employee/dashboard
   ↓
7. Web side TIDAK call consumeBootstrapSession() ❌
   ↓
8. Session tidak inject ❌
   ↓
9. Dashboard terbuka tapi user tidak login ❌
```

---

## 🔍 **DEBUG SCENARIOS**

### **Scenario 1: No consumeBootstrapSession Call**

**Logs:**
```
D/AbsensikuWebView: Loading bootstrap URL...
D/AbsensikuWebView: Injecting bootstrap session...
(No consumeBootstrapSession log)
```

**Root Cause:** Web side tidak call `Android.consumeBootstrapSession()`

**Fix Needed:** Web side code perlu update untuk call consumeBootstrapSession saat detect `?bootstrap=1`

---

### **Scenario 2: consumeBootstrapSession Called tapi Null**

**Logs:**
```
D/AbsensikuWebView: consumeBootstrapSession called, returning: null
```

**Root Cause:** `pendingBootstrapSession` sudah null saat dipanggil

**Fix:** Check timing - mungkin dipanggil terlalu lama setelah login

---

### **Scenario 3: Session Inject tapi Redirect ke Login**

**Logs:**
```
D/AbsensikuWebView: consumeBootstrapSession called, returning: session data
D/AbsensikuWebView: notifySessionBootstrapComplete called
D/AbsensikuWebView: showNativeLogin called
```

**Root Cause:** Web side redirect ke /employee/login setelah session inject

**Fix:** APK sudah handle dengan redirect ke dashboard jika ada pending session

---

## 📝 **LOG PATTERNS TO LOOK FOR**

### **Success Pattern:**

```
AbsensikuWebView: Loading bootstrap URL
AbsensikuWebView: Injecting bootstrap session
AbsensikuWebView: consumeBootstrapSession called, returning: session data
AbsensikuWebView: notifySessionBootstrapComplete called
```

### **Failure Pattern 1 (No Call):**

```
AbsensikuWebView: Loading bootstrap URL
AbsensikuWebView: Injecting bootstrap session
(Nothing else - web side tidak call)
```

### **Failure Pattern 2 (Null Session):**

```
AbsensikuWebView: Loading bootstrap URL
AbsensikuWebView: Injecting bootstrap session
AbsensikuWebView: consumeBootstrapSession called, returning: null
```

### **Failure Pattern 3 (Back to Login):**

```
AbsensikuWebView: Loading bootstrap URL
AbsensikuWebView: Injecting bootstrap session
AbsensikuWebView: consumeBootstrapSession called, returning: session data
AbsensikuWebView: showNativeLogin called
```

---

## 🛠️ **NEXT STEPS BASED ON LOGS**

### **If Pattern 1 (No Call):**

**Issue:** Web side code tidak call `Android.consumeBootstrapSession()`

**Action Required:**
1. Check web side code di `/employee/dashboard`
2. Verify code detect `?bootstrap=1` flag
3. Verify code call `Android.consumeBootstrapSession()`
4. Verify code inject session ke Supabase client

**Web side code yang diharapkan:**
```javascript
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('bootstrap') === '1') {
    const sessionData = Android.consumeBootstrapSession();
    if (sessionData) {
        const session = JSON.parse(sessionData);
        // Inject to Supabase client
        supabase.auth.setSession(session);
    }
}
```

---

### **If Pattern 2 (Null Session):**

**Issue:** Session expired atau cleared terlalu cepat

**Action:**
1. Check timing antara login dan consumeBootstrapSession call
2. Verify `pendingBootstrapSession` tidak di-clear terlalu cepat
3. Add timeout handling

---

### **If Pattern 3 (Back to Login):**

**Issue:** Web side redirect ke login page

**Action:**
1. APK sudah handle dengan redirect logic
2. Check apakah redirect logic bekerja
3. Verify web side tidak force redirect ke /employee/login

---

## 📊 **TEST CHECKLIST**

```
[ ] 1. Install APK dengan enhanced logging
[ ] 2. Start logcat monitoring
[ ] 3. Login dengan credentials test
[ ] 4. Capture semua logs dari login sampai hasil akhir
[ ] 5. Identify pattern (Success/Failure 1/2/3)
[ ] 6. Share logs untuk analisis lanjutan
```

---

## 📝 **TEST CREDENTIALS**

```
Email: <akun-employee-uji-aktif>
Password: <lihat-sumber-operasional-aman>
```

---

## 📞 **SHARE LOGS UNTUK ANALYSIS**

**Setelah test, share:**

1. **Full logs** dari login sampai hasil akhir
2. **Screenshot** hasil di emulator
3. **Observation** (apa yang terjadi setelah login)

**Format:**

```
=== LOGS ===
(paste logs dari logcat)

=== OBSERVATION ===
Setelah login, yang terjadi adalah:
- Loading overlay muncul: Ya/Tidak
- WebView terbuka: Ya/Tidak
- Halaman yang muncul: /employee/dashboard atau /employee/login
- User logged in: Ya/Tidak
```

---

**Status:** 🔍 **ENHANCED LOGGING READY**
**Next:** **Manual test dengan logcat monitoring**
