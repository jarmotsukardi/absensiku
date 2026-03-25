# 🔧 TROUBLESHOOTING - Login Tidak Bisa Masuk Dashboard

> Dokumen ini adalah catatan troubleshooting historis. Contoh akun di bawah harus diperlakukan sebagai placeholder, bukan kredensial tetap.

**Date:** March 10, 2026
**Issue:** Setelah login tidak dapat masuk ke dashboard

---

## 📊 **SYMPTOM**

User melaporkan:
- ✅ App terbuka
- ✅ Email & password terisi
- ❌ Setelah tap "Masuk", tidak masuk ke dashboard
- ❌ Tetap di login screen

---

## 🔍 **ROOT CAUSE ANALYSIS**

Dari logs, **TIDAK ADA** error authentication atau network request ke Supabase.

**Kemungkinan Penyebab:**

### **1. Login Button Tidak Ter-Tap** ❌ (MOST LIKELY)

**Evidence:**
- Tidak ada log "Memproses..." atau "Meneruskan sesi..."
- Tidak ada network request ke Supabase
- App tetap di MainActivity

**Root Cause:**
- ADB `input tap` coordinates tidak tepat
- Emulator tidak support touch simulation
- Button tidak mendapat focus

**Solution:** **Manual tap required**

---

### **2. Credentials Salah/Invalid** ⚠️

**Credentials yang digunakan:**
```
Email: <akun-employee-uji-aktif>
Password: <lihat-sumber-operasional-aman>
```

**Check:**
```sql
-- Verify user exists
SELECT * FROM auth.users WHERE email = '<akun-employee-uji-aktif>';

-- Verify user has employee role
SELECT * FROM user_roles WHERE user_id = '<user_id>' AND role = 'pegawai';
```

**Jika user tidak ada:**
- Create user di Supabase Auth
- Atau gunakan credentials lain yang valid

**Jika user tidak punya role 'pegawai':**
- Add role 'pegawai' di table `user_roles`

---

### **3. Supabase Config Tidak Valid** ⚠️

**Current Config:**
```
ABSENSIKU_SUPABASE_URL=https://zrhgqpjbeyzwpgywelcr.supabase.co
ABSENSIKU_SUPABASE_PUBLISHABLE_KEY=sb_publishable_NTxseoWSkfk5R3CayWWt9w_Ku8MADAm
```

**Check:**
1. Buka Supabase Dashboard
2. Verify project URL: `https://zrhgqpjbeyzwpgywelcr.supabase.co`
3. Verify anon/public key matches

**Jika config salah:**
- Update `local.properties`
- Rebuild APK
- Reinstall

---

### **4. Network Error** ⚠️

**Check emulator internet:**
```
1. Buka browser di emulator
2. Visit: https://absensiku-alpha.vercel.app
3. Jika tidak bisa akses → emulator tidak ada internet
```

**Fix:**
- Restart emulator
- Check host network
- Enable airplane mode → disable

---

### **5. Session Bootstrap Gagal** ⚠️

**Symptom:**
- Login sukses
- Dashboard terbuka
- Tapi langsung kembali ke login

**Check logs:**
```bash
adb logcat | grep -i "bootstrap\|session\|webview"
```

**Possible causes:**
- WebView tidak bisa load URL
- Session injection gagal
- Supabase session invalid

---

## 🛠️ **DEBUGGING STEPS**

### **Step 1: Manual Login Test**

**Di emulator:**

1. **Tap tombol "Masuk"** dengan mouse (bukan ADB)

2. **Observe:**
   - ✅ Loading overlay muncul?
   - ✅ Text: "Memproses..." atau "Meneruskan sesi..."?
   - ✅ WebView terbuka?
   - ❌ Error message muncul?

3. **Jika error muncul, screenshot dan catat error message**

---

### **Step 2: Check Logs**

```bash
# Real-time logs
adb logcat | grep -i "absensiku\|supabase\|auth"

# Filter errors only
adb logcat | grep -E "error|Error|ERROR" | grep -i absensiku

# Check network requests
adb logcat | grep -i "http\|okhttp\|network"
```

**Expected logs on login success:**
```
D/AbsensikuWebView: Native login success
D/AbsensikuWebView: Session saved
D/AbsensikuWebView: Bootstrapping session...
I/AbsensikuWebView: Loading dashboard...
```

**Error logs to look for:**
```
E/AbsensikuWebView: Login failed: Invalid credentials
E/AbsensikuWebView: Supabase error: ...
E/AbsensikuWebView: Bootstrap failed: ...
```

---

### **Step 3: Verify User Exists**

**Di Supabase Dashboard:**

1. **Auth → Users**
   - Search: `<akun-employee-uji-aktif>`
   - Verify user exists dan status = active

2. **Database → user_roles**
   - Search: user_id dari user tersebut
   - Verify role = 'pegawai' exists

3. **Database → employees**
   - Search: user_id atau email
   - Verify employee record exists

---

### **Step 4: Test dengan User Lain**

**Jika user tersebut tidak valid:**

1. **Create test user:**
   - Email: `test@example.com`
   - Password: `test123456`

2. **Add roles:**
   ```sql
   INSERT INTO user_roles (user_id, tenant_id, role)
   VALUES ('<user_id>', '<tenant_id>', 'pegawai');
   ```

3. **Add employee record:**
   ```sql
   INSERT INTO employees (user_id, tenant_id, name, email, is_active)
   VALUES ('<user_id>', '<tenant_id>', 'Test User', 'test@example.com', true);
   ```

4. **Test login dengan user baru**

---

## 📋 **QUICK FIX CHECKLIST**

```
[ ] 1. Tap "Masuk" button dengan mouse (manual)
[ ] 2. Observe error message (jika ada)
[ ] 3. Check logs untuk error detail
[ ] 4. Verify credentials valid di Supabase
[ ] 5. Verify user has role 'pegawai'
[ ] 6. Verify emulator punya internet
[ ] 7. Test dengan user lain (jika perlu)
[ ] 8. Screenshot error untuk dokumentasi
```

---

## 🎯 **EXPECTED FLOW**

**On Login Success:**

```
1. Tap "Masuk"
   ↓
2. Loading overlay: "Memproses..."
   ↓
3. Supabase API call: POST /auth/v1/token
   ↓
4. Success response: { access_token, refresh_token, ... }
   ↓
5. Save session to encrypted storage
   ↓
6. Loading overlay: "Meneruskan sesi ke dashboard..."
   ↓
7. Clear WebView data
   ↓
8. Load: https://absensiku-alpha.vercel.app/employee/dashboard
   ↓
9. Inject session ke WebView
   ↓
10. Dashboard terbuka
   ↓
11. Background: Fetch tenant info
   ↓
12. Update branding (logo + nama org)
```

---

## 🐛 **COMMON ISSUES & FIXES**

### **Issue 1: "Email atau password salah"**

**Fix:**
- Verify credentials di Supabase Auth
- Reset password jika perlu
- Create user baru

---

### **Issue 2: "Tidak dapat menghubungi server"**

**Fix:**
- Check emulator internet
- Verify Supabase URL correct
- Check firewall/network blocking

---

### **Issue 3: Login sukses tapi kembali ke login**

**Fix:**
- Check session bootstrap logic
- Verify WebView URL allowlist
- Check error logs untuk detail

---

### **Issue 4: Dashboard blank/white screen**

**Fix:**
- Check WebView JavaScript enabled
- Verify URL correct
- Check console logs via Chrome DevTools

---

## 📞 **NEXT STEPS**

1. **Manual tap "Masuk" button** dengan mouse
2. **Observe hasil** (success atau error)
3. **Check logs** untuk detail
4. **Report hasil** untuk troubleshooting lanjutan

---

## 📝 **TEST CREDENTIALS**

```
Email: <akun-employee-uji-aktif>
Password: <lihat-sumber-operasional-aman>
```

**Alternative (create if not exists):**
```
Email: test@example.com
Password: test123456
```

---

**Status:** 🔍 **NEEDS MANUAL VERIFICATION**
**Recommendation:** **Manual tap required untuk verify login flow**
