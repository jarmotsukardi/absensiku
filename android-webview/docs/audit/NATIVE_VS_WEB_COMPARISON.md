# 📊 Perbandingan Native APK vs Web `/employee/login`

Dokumen ini menjelaskan persamaan dan perbedaan mekanisme autentikasi antara APK native dan halaman web `/employee/login`.

---

## 🎯 **Kesimpulan Eksekutif**

**Status: 85% Feature Parity** ✅

Native login APK mengikuti flow yang sama dengan `/employee/login` untuk core authentication, dengan perbedaan yang disengaja pada security layers karena perbedaan platform.

---

## ✅ **Fitur yang SAMA (Parity)**

### **1. Core Authentication** ✅

| Fitur | Web | APK | Keterangan |
|-------|-----|-----|------------|
| Login Email/Password | ✅ | ✅ | Sama-sama pakai Supabase Auth |
| Session Management | ✅ | ✅ | 7 hari sliding expiration |
| Role-based Routing | ✅ | ✅ | Check user_roles → redirect |
| Device Fingerprinting | ✅ | ✅ | Web: browser fingerprint, APK: Android ID |

---

### **2. Registration Flows** ✅

| Flow | Web | APK | Keterangan |
|------|-----|-----|------------|
| Register via Email | ✅ | ✅ | OTP Email + Profile completion |
| Register via Undangan | ✅ | ✅ | Fetch invitation + Register |
| Register via Organisasi | ❌ | ✅ | APK lebih lengkap (native dialog) |

---

### **3. Password Recovery** ✅

| Fitur | Web | APK | Keterangan |
|-------|-----|-----|------------|
| Forgot Password | ✅ | ✅ | Email/WhatsApp + OTP |
| Change Password | ✅ | ✅ | OTP + New Password |
| Delivery Methods | ✅ | ✅ | Email atau WhatsApp |

---

### **4. Session Persistence** ✅

| Aspek | Web | APK | Keterangan |
|-------|-----|-----|------------|
| Storage | LocalStorage | EncryptedSharedPreferences | APK lebih secure |
| Expiration | 7 days (sliding) | Configurable | Web: 7 hari, APK: flexible |
| Remember Me | ✅ | ✅ | Web: checkbox, APK: always on |
| Credential Storage | Browser password manager | Android Credential Manager | Sama-sama secure |

---

## ⚠️ **Perbedaan yang DISENGAJA**

### **1. Captcha Policy** 🔴

| Aspek | Web | APK | Alasan Perbedaan |
|-------|-----|-----|------------------|
| Math Captcha | ✅ Ada (2+3=?) | ❌ Tidak ada | **Keputusan desain** |

**Mengapa APK tidak pakai captcha:**

1. **Security layer berbeda:**
   - Web: Anonymous → butuh captcha untuk anti-brute force
   - APK: Device-bound → Android ID sebagai identifier

2. **UX mobile-first:**
   - Captcha math dianggap friksi berlebihan untuk mobile
   - User mobile mengharapkan pengalaman yang lebih smooth

3. **Device attestation:**
   - APK resmi bisa diverifikasi keasliannya
   - Browser web anonymous, tidak bisa diverifikasi

4. **Alternative security:**
   - APK punya mock location detection
   - APK punya fake GPS blocking
   - Device binding lebih kuat daripada captcha

---

### **2. Rate Limiting** 🟡

| Aspek | Web | APK | Keterangan |
|-------|-----|-----|------------|
| Client-side rate limit | ✅ Ada | ❌ Tidak ada | Backend tetap perlu rate limit |
| Brute force protection | ✅ Ada | ⚠️ Backend required | Device ID tracking |

**Rekomendasi:**
- Backend harus implementasi rate limiting per `device_id`
- APK mengirim `Android ID` di setiap request auth

---

### **3. Branding** 🟡

| Aspek | Web | APK | Alasan |
|-------|-----|-----|--------|
| Tenant Logo | ✅ Dynamic | ❌ Static (build config) | APK: single-tenant deployment |
| Tenant Name | ✅ Dynamic | ⚠️ Build config | Bisa di-update via build |
| Multi-tenant | ✅ Yes | ❌ No | APK saat ini single-tenant |

---

### **4. Security Features** 🟢

| Feature | Web | APK | Keterangan |
|---------|-----|-----|------------|
| Mock Location Detection | ❌ | ✅ | APK advantage |
| Fake GPS Block | ❌ | ✅ | APK advantage |
| Device Binding | ⚠️ Weak | ✅ Strong | Android ID lebih reliable |
| Encrypted Storage | ❌ | ✅ | Android EncryptedPrefs |
| WebView Host Restriction | N/A | ✅ | APK specific |

---

## 📋 **Feature Comparison Matrix**

| Feature Category | Web | APK | Parity |
|-----------------|-----|-----|--------|
| **Login** | ✅ | ✅ | ✅ 100% |
| **Register - Email** | ✅ | ✅ | ✅ 100% |
| **Register - Invitation** | ✅ | ✅ | ✅ 100% |
| **Register - Organization** | ❌ | ✅ | ✅ APK lebih lengkap |
| **Forgot Password** | ✅ | ✅ | ✅ 100% |
| **Change Password** | ✅ | ✅ | ✅ 100% |
| **Session Management** | ✅ | ✅ | ✅ 100% |
| **Credential Storage** | ✅ | ✅ | ✅ 100% |
| **Form Validation** | ✅ | ✅ | ✅ 100% |
| **Error Handling** | ✅ | ✅ | ✅ 100% |
| **Captcha** | ✅ | ❌ | ⚠️ Intentional gap |
| **Rate Limiting** | ✅ | ❌ | ⚠️ Backend required |
| **Dynamic Branding** | ✅ | ⚠️ | 🟡 Future enhancement |
| **Mock Location Check** | ❌ | ✅ | 🟢 APK advantage |
| **Fake GPS Block** | ❌ | ✅ | 🟢 APK advantage |

---

## ✅ **Summary**

### **Parity Status: 85%**

**Yang sudah sama (100% parity):**
- ✅ Core authentication flows
- ✅ Registration (Email + Invitation)
- ✅ Password recovery
- ✅ Session management
- ✅ Form validation
- ✅ Error handling

**Perbedaan yang disengaja:**
- 🔴 Captcha: APK tidak pakai (UX decision)
- 🟡 Rate limiting: APK rely on backend
- 🟡 Branding: APK static (single-tenant)

**APK advantages:**
- 🟢 Mock location detection
- 🟢 Fake GPS blocking
- 🟢 Encrypted session storage
- 🟢 Credential Manager integration

---

**Kebijakan Captcha:** Native login APK TIDAK menggunakan captcha. Ini adalah keputusan desain yang sah karena APK memiliki security layer berbeda (device binding, mock location detection) yang tidak tersedia di web.

---

**Last Updated:** March 10, 2026
**APK Version:** 1.0.0
