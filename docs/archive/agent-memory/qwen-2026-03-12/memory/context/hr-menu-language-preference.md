# Preferensi Bahasa Menu HR

## Tanggal: 2026-03-12

### Instruksi User (Wajib Diikuti)

1. **Semua nama menu HARUS dalam Bahasa Indonesia**
   - Contoh: `Data Pegawai`, `Struktur Organisasi`, `Kontrak Kerja`
   - JANGAN gunakan: `Employees`, `Organization Structure`, `Contracts`

2. **Setiap masukan user WAJIB dicatat ke memory file**
   - Lokasi: `.qwen/memory/context/` atau `.qwen/memory/tasks/`
   - Format: Markdown dengan tanggal
   - Tujuan: AI model lain (ChatGPT, Claude, dll) bisa melanjutkan

3. **Fokus domain HR, tidak mengubah absensi**
   - HR boleh MEMBACA data absensi untuk reporting
   - HR TIDAK BOLEH MENGUBAH data absensi
   - Boundary jelas: HR = policy, lifecycle, reporting; Absensi = event operasional

### Konvensi Naming Menu HR

| Kategori | Contoh Nama Menu (Bahasa Indonesia) |
|----------|-------------------------------------|
| **Dashboard** | Ringkasan HR, Beranda HR |
| **Pegawai** | Data Pegawai, Status Kepegawaian, Riwayat Jabatan |
| **Organisasi** | Struktur Organisasi, Departemen, Lokasi Kerja |
| **Hubungan Kerja** | Jabatan dan Grade, Kontrak Kerja |
| **Dokumen** | Dokumen HR, Template Dokumen |
| **Laporan** | Laporan HR, Rekap Kehadiran, Analitik SDM |
| **Layanan** | FAQ HR, Tiket HR, Bantuan HR |
| **Pengaturan** | Pengaturan HR, Role dan Permission |
| **Lifecycle** | Proses Masuk Pegawai (Onboarding), Proses Keluar Pegawai (Offboarding) |
| **Kebijakan** | Jenis Cuti, Kuota Cuti, Jam Kerja, Pengaturan Keterlambatan |

### Prinsip Integrasi HR ↔ Absensi

```
HR → Membaca Absensi (untuk reporting, analytics, context)
Absensi → Sumber kebenaran event operasional (check-in, check-out, leave requests)
```

**HR TIDAK BOLEH:**
- Mengubah `attendance_records`
- Mengubah `work_hours` (operasional)
- Mengubah `leave_requests` (approval flow)
- CRUD check-in/check-out

**HR BOLEH:**
- JOIN `employees` + `attendance_records` untuk laporan
- Aggregate data absensi untuk dashboard
- Tampilkan history kehadiran di profil pegawai
- Validasi kontrak dengan absensi

### Riwayat Masukan User

| Tanggal | Masukan | Status |
|---------|---------|--------|
| 2026-03-12 | Jangan masuk ke absensi, fokus ke HR | ✅ Dicatat |
| 2026-03-12 | Data absensi bisa direlasikan ke HR (read-only) | ✅ Dicatat |
| 2026-03-12 | Setiap menu selalu dalam Bahasa Indonesia | ✅ Dicatat |
| 2026-03-12 | Setiap user beri masukan → catat ke memory | ✅ Dicatat |
| 2026-03-12 | Audit absensi /org dan /admin, identifikasi relasi ke HR | ✅ Dicatat |
| 2026-03-12 | Audit /hr dan simpulkan yang belum dikerjakan, hubungkan dengan panduan | ✅ Dicatat |
| 2026-03-12 | Analisis menu baru berdasarkan panduan | ✅ Dicatat |
| 2026-03-12 | Kerjakan 4 menu baru HR tanpa konfirmasi | ✅ Selesai |

### Catatan untuk AI Model Lain

Jika kamu melanjutkan pekerjaan di repo ini:

1. **Baca file ini** sebelum mulai kerja
2. **Ikuti konvensi naming** Bahasa Indonesia
3. **Jaga boundary HR vs Absensi**
4. **Catat setiap masukan baru** user ke file memory
5. **Update file ini** jika ada preferensi baru

---

**File terkait:**
- `.qwen/memory/tasks/` - Catatan task yang dikerjakan
- `.qwen/memory/decisions/` - Keputusan arsitektur
- `docs/panduan_membangun_hr.md` - Panduan lengkap HR
