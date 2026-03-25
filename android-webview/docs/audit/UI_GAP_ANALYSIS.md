# 🔍 UI Gap Analysis: Native APK vs Web `/employee/login`

Analisis field-field form yang tidak sesuai antara native APK dan web `/employee/login`.

---

## 📊 **Summary**

**Status:** 6 field gaps ditemukan yang perlu diperbaiki untuk parity penuh.

---

## 🔴 **GAP 1: Self Registration - Field "Alamat" Tidak Ada di Web** ❌

### **Web `/employee/login`:**
```typescript
// Step profile completion TIDAK ada field "Alamat"
Fields:
- Nama Lengkap
- No. WhatsApp  
- Password
- Konfirmasi Password
```

### **Native APK:**
```kotlin
// openSelfRegistrationProfileDialog()
Fields:
- Nama Lengkap ✅
- No. WhatsApp ✅
- Password ✅
- Konfirmasi Password ✅
- Alamat ❌ ← TIDAK ADA DI WEB
```

**Impact:** APK meminta field yang tidak diperlukan backend

**Fix:** Hapus field "Alamat" dari self registration dialog

---

## 🔴 **GAP 2: Self Registration - Tidak Ada Captcha** ❌

### **Web `/employee/login`:**
```typescript
// Step email input
Fields:
- Email
- Captcha (math: 2+3=?) ← ADA DI WEB
```

### **Native APK:**
```kotlin
// openSelfRegistrationStartDialog()
Fields:
- Email ✅
- Captcha ❌ ← TIDAK ADA DI APK
```

**Impact:** Tidak sesuai dengan kebijakan "no captcha" yang sudah ditetapkan

**Fix:** Biarkan tanpa captcha (sesuai keputusan desain)

---

## 🔴 **GAP 3: Invitation Registration - Field "NIK" Tidak Ada** ❌

### **Web `/employee/login`:**
```typescript
// After fetching invitation, pre-fill dari invitation data:
Fields:
- Nama (pre-fill dari invitation)
- Email (pre-fill dari invitation)
- No. WhatsApp (pre-fill dari invitation)
- NIK (pre-fill dari invitation.jika ada) ← ADA DI WEB
```

### **Native APK:**
```kotlin
// openInviteRegistrationDialog()
Fields:
- Nama ✅ (pre-fill)
- Email ✅ (pre-fill)
- No. WhatsApp ✅ (pre-fill)
- NIK ❌ ← TIDAK ADA DI APK
- Alamat ❌ ← TIDAK ADA DI WEB
```

**Impact:** 
- NIK tidak di-capture (padang ada di invitation data)
- Alamat ditambahkan tanpa perlu

**Fix:** 
- Tambahkan field NIK (read-only jika sudah ada di invitation)
- Hapus field Alamat

---

## 🔴 **GAP 4: Forgot Password - Tidak Ada Captcha** ⚠️

### **Web `/employee/login`:**
```typescript
// Forgot Password Dialog - Step Email
Fields:
- Email
- WhatsApp
- Captcha (math) ← ADA DI WEB
```

### **Native APK:**
```kotlin
// openRecoveryIdentityDialog()
Fields:
- Email ✅
- WhatsApp ✅
- Captcha ❌ ← TIDAK ADA (sesuai keputusan desain)
```

**Status:** Sesuai dengan kebijakan "no captcha" - **NO ACTION NEEDED**

---

## 🔴 **GAP 5: Login Form - Tidak Ada "Tetap Masuk" Checkbox** ⚠️

### **Web `/employee/login`:**
```typescript
// Login form
- Email
- Password
- Checkbox "Ingat saya selama 7 hari" ← ADA DI WEB
```

### **Native APK:**
```kotlin
// Login form (activity_main.xml)
- Email ✅
- Password ✅
- Checkbox "Tetap masuk" ✅ ADA (tapi visibility="gone")
```

**Code:**
```xml
<CheckBox
    android:id="@+id/rememberSessionCheck"
    android:visibility="gone"  ← HIDDEN
/>
```

**Impact:** User tidak bisa kontrol session persistence

**Fix:** Tampilkan checkbox atau set always-on dengan dokumentasi jelas

---

## 🔴 **GAP 6: Register Organisasi - Field Berbeda** ⚠️

### **Web `/org/login?mode=register`:**
```typescript
Fields:
- Nama lengkap admin
- Email admin
- No. WhatsApp
- Password
- Konfirmasi Password
- Nama organisasi
- Tipe organisasi
- Nama kantor
- Alamat kantor
- Latitude
- Longitude
```

### **Native APK:**
```kotlin
// openOrganizationRegistrationDialog()
Fields:
- Nama lengkap admin ✅
- Email admin ✅
- No. WhatsApp ✅
- Password ✅
- Konfirmasi Password ✅
- Nama organisasi ✅
- Tipe organisasi ✅
- Nama kantor ✅
- Alamat kantor ✅
- Latitude ✅
- Longitude ✅
```

**Status:** ✅ **SAME** - Register organisasi sudah parity

---

## 📋 **Rekap Gap yang Perlu Diperbaiki**

| # | Gap | Severity | Fix Required |
|---|-----|----------|--------------|
| 1 | Self Reg: Field "Alamat" tidak ada di web | 🔴 High | Hapus field Alamat |
| 2 | Self Reg: Tidak ada captcha | ⚠️ Medium | Sesuai kebijakan (no action) |
| 3 | Invite Reg: Field NIK tidak ada | 🔴 High | Tambah field NIK (read-only) |
| 4 | Invite Reg: Field "Alamat" tidak ada di web | 🔴 High | Hapus field Alamat |
| 5 | Forgot Password: Tidak ada captcha | ⚠️ Medium | Sesuai kebijakan (no action) |
| 6 | Login: Checkbox "Tetap masuk" hidden | 🟡 Low | Show atau dokumentasi |

---

## ✅ **Action Plan**

### **Priority 1: High (Must Fix)** 🔴

**1. Hapus field "Alamat" dari Self Registration**
```kotlin
// openSelfRegistrationProfileDialog()
// REMOVE:
val (addressLayout, addressInput) = createInputField(
    hint = "Alamat",
    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES,
    multiline = true
)
container.addView(addressLayout)

// Update submit handler untuk tidak include address
```

**2. Tambah field NIK di Invitation Registration**
```kotlin
// openInviteRegistrationDialog()
// ADD after WhatsApp field:
val (nikLayout, nikInput) = createInputField(
    hint = "NIK",
    inputType = InputType.TYPE_CLASS_NUMBER,
    initialText = invitation.nik.orEmpty(),
    enabled = invitation.nik.isNotBlank() // read-only jika sudah ada
)
container.addView(nikLayout)
```

**3. Hapus field "Alamat" dari Invitation Registration**
```kotlin
// openInviteRegistrationDialog()
// REMOVE address field
```

### **Priority 2: Low (Nice to Have)** 🟡

**4. Tampilkan checkbox "Tetap masuk"**
```kotlin
// activity_main.xml
// CHANGE:
<CheckBox
    android:id="@+id/rememberSessionCheck"
    android:visibility="visible"  <!-- Was "gone" -->
/>
```

**Atau** dokumentasikan sebagai always-on (current behavior).

---

## 📝 **Field Mapping Complete**

### **Login Form**

| Field | Web | APK | Status |
|-------|-----|-----|--------|
| Email | ✅ | ✅ | ✅ Match |
| Password | ✅ | ✅ | ✅ Match |
| Captcha | ✅ | ❌ | ⚠️ Intentional (no captcha policy) |
| Remember Me | ✅ | ⚠️ (hidden) | 🟡 Show or document |

### **Self Registration (Email)**

| Field | Web | APK | Status |
|-------|-----|-----|--------|
| Email (step 1) | ✅ | ✅ | ✅ Match |
| Captcha (step 1) | ✅ | ❌ | ⚠️ Intentional |
| OTP (step 2) | ✅ | ✅ | ✅ Match |
| Nama (step 3) | ✅ | ✅ | ✅ Match |
| WhatsApp (step 3) | ✅ | ✅ | ✅ Match |
| ~~Alamat~~ (step 3) | ❌ | ✅ | ❌ **MUST REMOVE** |
| Password (step 3) | ✅ | ✅ | ✅ Match |
| Confirm Password (step 3) | ✅ | ✅ | ✅ Match |

### **Invitation Registration**

| Field | Web | APK | Status |
|-------|-----|-----|--------|
| Invitation Code | ✅ | ✅ | ✅ Match |
| Organization Info | ✅ | ✅ | ✅ Match |
| Nama | ✅ | ✅ | ✅ Match |
| Email | ✅ | ✅ | ✅ Match |
| WhatsApp | ✅ | ✅ | ✅ Match |
| **NIK** | ✅ | ❌ | ❌ **MUST ADD** |
| ~~Alamat~~ | ❌ | ✅ | ❌ **MUST REMOVE** |
| Password | ✅ | ✅ | ✅ Match |
| Confirm Password | ✅ | ✅ | ✅ Match |

### **Forgot Password**

| Field | Web | APK | Status |
|-------|-----|-----|--------|
| Email | ✅ | ✅ | ✅ Match |
| WhatsApp | ✅ | ✅ | ✅ Match |
| Captcha | ✅ | ❌ | ⚠️ Intentional |
| OTP | ✅ | ✅ | ✅ Match |
| New Password | ✅ | ✅ | ✅ Match |
| Confirm Password | ✅ | ✅ | ✅ Match |

---

## 🎯 **Kesimpulan**

**Field yang HARUS diperbaiki:**

1. ❌ **Self Registration:** Hapus field "Alamat"
2. ❌ **Invitation Registration:** Tambah field "NIK" (read-only jika ada)
3. ❌ **Invitation Registration:** Hapus field "Alamat"

**Field yang SUDAH SESUAI (no action):**
- ✅ Tidak ada captcha (sesuai kebijakan)
- ✅ Register Organisasi (sudah parity)

**Field OPTIONAL:**
- 🟡 Checkbox "Tetap masuk" (show atau dokumentasi)

---

**Last Updated:** March 10, 2026
**APK Version:** 1.0.0
