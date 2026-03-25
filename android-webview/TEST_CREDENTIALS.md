# 🧪 Test Credentials & Test Plan

> Dokumen ini adalah catatan uji historis. Jangan simpan kredensial nyata di file ini. Gunakan akun uji aktif dari sumber operasional yang aman.

**Date:** March 10, 2026
**Purpose:** Testing Dynamic Tenant Branding feature

---

## 📝 **TEST CREDENTIALS**

### **Employee Account**

| Field | Value |
|-------|-------|
| **Email** | `<akun-employee-uji-aktif>` |
| **Password** | `<lihat-sumber-operasional-aman>` |
| **Role** | Pegawai (Employee) |
| **Expected Tenant** | Will be fetched from database |

---

## 🎯 **TEST OBJECTIVES**

### **Primary Goal:**
Verify that **Dynamic Tenant Branding** feature works correctly:
1. Fetch tenant info from database after login
2. Display logo and organization name on login screen
3. Cache tenant info for subsequent logins
4. Clear cache on logout

---

## 📋 **TEST SCENARIOS**

### **Test 1: First Login (No Cache)**

**Pre-condition:** Fresh install or cache cleared

**Steps:**
1. Open app
2. Observe login screen (should show BuildConfig branding)
3. Enter email: `<akun-employee-uji-aktif>`
4. Enter password: `<lihat-sumber-operasional-aman>`
5. Tap "Masuk"
6. Wait for dashboard to load
7. Observe branding update

**Expected Results:**
- ✅ Login screen shows fallback branding (BuildConfig)
- ✅ Login successful
- ✅ Dashboard loads
- ✅ Background fetch gets tenant info
- ✅ Next login shows cached tenant info

**Pass Criteria:**
- Login succeeds
- No crash during tenant fetch
- Cache saved after login

---

### **Test 2: Second Login (With Cache)**

**Pre-condition:** Completed Test 1

**Steps:**
1. Close app completely (swipe away from recent apps)
2. Reopen app
3. Observe login screen

**Expected Results:**
- ✅ Cached tenant info loaded instantly
- ✅ Logo visible (if tenant has logo_url)
- ✅ Organization name visible
- ✅ Background refresh fetches fresh data

**Pass Criteria:**
- Cache loads within 1 second
- UI updates correctly
- No network error visible to user

---

### **Test 3: Logout & Cache Clear**

**Pre-condition:** Logged in user

**Steps:**
1. Logout from dashboard
2. Observe login screen

**Expected Results:**
- ✅ Cache cleared on logout
- ✅ Login screen shows fallback branding
- ✅ Next login will fetch fresh data

**Pass Criteria:**
- Tenant info cleared from storage
- UI falls back to BuildConfig

---

### **Test 4: Network Error Handling**

**Pre-condition:** Cache exists

**Steps:**
1. Disable network (airplane mode)
2. Open app
3. Observe branding

**Expected Results:**
- ✅ Cached data displayed
- ✅ No crash or error dialog
- ✅ Graceful fallback

**Pass Criteria:**
- App doesn't crash
- Cache displayed correctly

---

## 📊 **TEST EXECUTION LOG**

### **Test 1: First Login**

| Step | Status | Notes |
|------|--------|-------|
| Open app | ⏳ Pending | |
| Observe branding | ⏳ Pending | Expected: BuildConfig |
| Enter credentials | ⏳ Pending | akun uji aktif |
| Login | ⏳ Pending | |
| Dashboard loads | ⏳ Pending | |
| Cache saved | ⏳ Pending | Verify in storage |

**Result:** ⏳ PENDING

---

### **Test 2: Cache Test**

| Step | Status | Notes |
|------|--------|-------|
| Close app | ⏳ Pending | |
| Reopen app | ⏳ Pending | |
| Cache loads | ⏳ Pending | Should be instant |
| Logo visible | ⏳ Pending | If logo_url exists |
| Name visible | ⏳ Pending | From cache |

**Result:** ⏳ PENDING

---

### **Test 3: Logout Test**

| Step | Status | Notes |
|------|--------|-------|
| Logout | ⏳ Pending | From dashboard |
| Cache cleared | ⏳ Pending | Verify in storage |
| Fallback shown | ⏳ Pending | BuildConfig |

**Result:** ⏳ PENDING

---

## 🔍 **DEBUGGING COMMANDS**

### **Check App Logs:**
```bash
adb logcat | grep -i "absensiku\|tenant\|branding"
```

### **Check Storage (if rooted):**
```bash
adb shell
run-as com.absensiku.webview
cat shared_prefs/absensiku_native_auth_encrypted.xml
```

### **Take Screenshot:**
```bash
adb shell screencap -p /data/local/tmp/screenshot.png
adb pull /data/local/tmp/screenshot.png
```

### **Force Stop App:**
```bash
adb shell am force-stop com.absensiku.webview
```

---

## 📸 **SCREENSHOT CHECKLIST**

- [ ] `test_before_login.png` - Login screen (before login)
- [ ] `test_login_screen.png` - Login screen (with credentials)
- [ ] `test_dashboard.png` - Dashboard after login
- [ ] `test_cached_login.png` - Login screen (after cache)
- [ ] `test_logout.png` - Login screen (after logout)

---

## ✅ **PASS/FAIL CRITERIA**

### **Overall Pass:**
- ✅ Test 1: Login successful, no crash
- ✅ Test 2: Cache loads correctly
- ✅ Test 3: Cache clears on logout

### **Critical Bugs (Auto-Fail):**
- ❌ App crash during login
- ❌ App crash during tenant fetch
- ❌ Cache not saving
- ❌ Cache not loading

### **Minor Issues (Warning):**
- ⚠️ Logo not loading (check URL accessibility)
- ⚠️ Slow cache load (>2 seconds)
- ⚠️ Fallback not working

---

## 🐛 **KNOWN ISSUES**

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| - | No known issues yet | - | - |

---

## 📝 **TEST NOTES**

### **Environment:**
- **Emulator:** Genymotion - Xiaomi Redmi Note 9
- **Android:** Android 11
- **APK Version:** 1.0.0 (debug)
- **Build Date:** March 10, 2026

### **Test Data:**
- **User:** akun uji aktif
- **Expected Tenant:** Will be determined from database

---

## 🚀 **NEXT STEPS AFTER TEST**

### **If All Tests Pass:**
1. ✅ Feature ready for production
2. ✅ Document in release notes
3. ✅ Update user documentation

### **If Tests Fail:**
1. 🔍 Debug failing tests
2. 🐛 Fix identified bugs
3. ♻️ Re-test after fixes

---

**Test Status:** ⏳ **PENDING EXECUTION**
**Test Date:** March 10, 2026
**Tester:** Automated Test Script
