# Panduan User: 4 Fitur Baru HR

## Tanggal: 2026-03-12

### Daftar Fitur Baru

1. **Hierarki Persetujuan** - Konfigurasi approval workflow
2. **Template Dokumen** - Template untuk kontrak, SP, mutasi, dll
3. **Status Kepegawaian** - Filter dan export pegawai by status
4. **Riwayat Jabatan** - Timeline mutasi pegawai

---

## 1. HIERARKI PERSETUJUAN

### **Akses:**
Menu → **HRIS** → **Fondasi HR** → **Hierarki Persetujuan**

### **Fungsi:**
Mengkonfigurasi alur approval untuk berbagai jenis permohonan (cuti, WFH, lembur, mutasi).

### **Cara Menambah Jenis Approval Baru:**

1. Buka menu **Hierarki Persetujuan**
2. Klik tombol **Tambah Jenis** (pojok kanan atas)
3. Isi form:
   - **Nama Jenis Approval**: Contoh: "Cuti Tahunan"
   - **Kode Jenis**: Pilih dari dropdown (LEAVE, WFH, OVERTIME, MUTATION, OTHER)
   - **Aktif**: Centang untuk mengaktifkan
4. Tambah level approval:
   - Klik **Tambah Level**
   - Pilih **Approver** (Atasan Langsung, Kepala Bidang, Kepala Dinas, HR Admin, Admin Instansi)
   - Isi **SLA (jam)**: Contoh: 24 (artinya approver harus merespon dalam 24 jam)
   - Isi **Catatan** (opsional): Contoh: "Jika tidak ada respon, eskalasi ke level berikutnya"
5. Klik **Simpan**

### **Cara Edit Hierarki Approval:**

1. Buka menu **Hierarki Persetujuan**
2. Cari jenis approval yang ingin diedit
3. Klik ikon **Pencil** (Edit)
4. Edit nama, status, atau level approval
5. Klik **Perbarui**

### **Cara View Detail Hierarki:**

1. Buka menu **Hierarki Persetujuan**
2. Klik tombol **Lihat** pada jenis approval
3. Dialog akan menampilkan:
   - Status aktif/nonaktif
   - Jumlah level
   - Detail setiap level (approver, SLA, catatan)

### **Contoh Konfigurasi:**

**Approval Cuti (3 Level):**
```
Level 1: Atasan Langsung (SLA: 24 jam)
  Catatan: Approval awal dari atasan langsung
  
Level 2: Kepala Bidang (SLA: 48 jam)
  Catatan: Jika level 1 tidak merespon dalam 24 jam
  
Level 3: HR Admin (SLA: 72 jam)
  Catatan: Final approval dari HR
```

**Approval WFH (1 Level):**
```
Level 1: Atasan Langsung (SLA: 12 jam)
  Catatan: Approval WFH harian
```

### **Tips:**
- Gunakan SLA yang realistis (jangan terlalu singkat)
- Tambahkan catatan untuk memperjelas alur eskalasi
- Minimal 1 level, maksimal tidak terbatas
- Approval hierarchy akan digunakan saat employee mengajukan cuti/WFH/lembur

---

## 2. TEMPLATE DOKUMEN

### **Akses:**
Menu → **HRIS** → **Fondasi HR** → **Template Dokumen**

### **Fungsi:**
Membuat template dokumen HR yang dapat di-generate otomatis dengan data pegawai.

### **Cara Menambah Template Baru:**

1. Buka menu **Template Dokumen**
2. Klik tombol **Tambah Template** (pojok kanan atas)
3. Isi form:
   - **Nama Template**: Contoh: "Template Kontrak PKWT 2026"
   - **Jenis Template**: Pilih dari dropdown (Kontrak PKWT, PKWTT, Magang, SP1, SP2, SP3, Mutasi, Promosi, Resign, Rekomendasi, Lainnya)
   - **Deskripsi**: Deskripsi singkat (opsional)
   - **Aktif**: Centang untuk mengaktifkan
4. Pilih **Variabel** yang akan digunakan:
   - Klik variabel di daftar ({{nama}}, {{nip}}, {{jabatan}}, dll)
   - Variabel terpilih akan muncul di bagian "Variabel yang digunakan"
5. Isi **Konten Template**:
   - Ketik atau paste konten template
   - Sisipkan variabel dengan mengklik variabel di daftar
   - Contoh: "Yang bertanda tangan di bawah ini: {{nama_pejabat}}, NIP: {{nip_pejabat}}"
6. Klik **Simpan**

### **Cara Preview Template:**

1. Buka menu **Template Dokumen**
2. Klik ikon **Eye** (Preview) pada template
3. Dialog akan menampilkan:
   - Status dan versi template
   - Daftar variabel yang digunakan
   - Konten template lengkap

### **Cara Duplikasi Template:**

1. Buka menu **Template Dokumen**
2. Klik ikon **Copy** (Duplikasi) pada template
3. Template baru akan dibuat dengan nama "[Nama Template] (Copy)"
4. Edit template hasil duplikasi sesuai kebutuhan

### **Daftar Variabel yang Tersedia:**

| Variabel | Keterangan |
|----------|------------|
| `{{nama}}` | Nama lengkap pegawai |
| `{{nip}}` | NIP pegawai |
| `{{jabatan}}` | Jabatan pegawai |
| `{{unit_kerja}}` | Unit kerja/OPD |
| `{{tanggal_lahir}}` | Tanggal lahir |
| `{{alamat}}` | Alamat |
| `{{tanggal_mulai}}` | Tanggal mulai (kontrak/mutasi) |
| `{{tanggal_selesai}}` | Tanggal selesai |
| `{{nomor_surat}}` | Nomor surat |
| `{{tanggal_surat}}` | Tanggal surat |
| `{{nama_pejabat}}` | Nama pejabat penanda tangan |
| `{{nip_pejabat}}` | NIP pejabat |
| `{{jabatan_pejabat}}` | Jabatan pejabat |

### **Contoh Template Kontrak PKWT:**

```
SURAT PERJANJIAN KERJA WAKTU TERTENTU (PKWT)
Nomor: {{nomor_surat}}

Yang bertanda tangan di bawah ini:
Nama: {{nama_pejabat}}
NIP: {{nip_pejabat}}
Jabatan: {{jabatan_pejabat}}

Dalam hal ini bertindak untuk dan atas nama instansi.

Nama: {{nama}}
NIP: {{nip}}
Jabatan: {{jabatan}}
Unit Kerja: {{unit_kerja}}

Pasal 1
PIHAK KEDUA akan bekerja pada PIHAK PERTAMA terhitung mulai tanggal {{tanggal_mulai}} sampai dengan {{tanggal_selesai}}.

{{tanggal_surat}}

PIHAK PERTAMA,

{{nama_pejabat}}
NIP: {{nip_pejabat}}
```

### **Tips:**
- Gunakan variabel untuk data yang berubah-ubah per dokumen
- Simpan template dengan nama yang jelas (include tahun)
- Duplicate template untuk membuat variasi (contoh: Kontrak PKWT 2025 → Kontrak PKWT 2026)
- Preview template sebelum digunakan untuk memastikan variabel benar

---

## 3. STATUS KEPEGAWAIAN

### **Akses:**
Menu → **HRIS** → **Fondasi HR** → **Status Kepegawaian**

### **Fungsi:**
Melihat dan filter daftar pegawai berdasarkan status kepegawaian.

### **Cara Filter Pegawai:**

1. Buka menu **Status Kepegawaian**
2. Gunakan filter di bagian atas:
   - **Dropdown Status**: Pilih Aktif, Kontrak, Magang, atau Nonaktif
   - **Dropdown Kategori**: Pilih kategori pegawai (PNS, Kontrak, Honorer, dll)
   - **Search Box**: Cari nama, email, NIP, unit kerja, atau jabatan
3. Hasil akan otomatis terfilter

### **Cara Export Data ke CSV:**

1. Buka menu **Status Kepegawaian**
2. Filter data sesuai kebutuhan (opsional)
3. Klik tombol **Export CSV** (pojok kanan atas)
4. File akan otomatis terdownload dengan format: `status-kepegawaian-YYYY-MM-DD.csv`

### **Statistik yang Ditampilkan:**

- **Total Pegawai**: Jumlah semua pegawai
- **Pegawai Aktif**: PNS/Tetap
- **Pegawai Kontrak**: Kontrak/PKWT
- **Pegawai Magang**: Magang/Internship
- **Pegawai Nonaktif**: Sudah tidak aktif

### **Informasi per Pegawai:**

- Nama
- NIP
- Status (badge warna: hijau=Aktif, orange=Kontrak, ungu=Magang, merah=Nonaktif)
- Kategori
- Golongan
- Unit Kerja
- Jabatan
- Tanggal Masuk

### **Tips:**
- Gunakan filter Status untuk melihat pegawai aktif saja
- Export CSV untuk laporan bulanan
- Badge warna memudahkan identifikasi status sekilas

---

## 4. RIWAYAT JABATAN

### **Akses:**
Menu → **HRIS** → **Fondasi HR** → **Riwayat Jabatan**

### **Fungsi:**
Melacak riwayat mutasi, promosi, dan demosi pegawai.

### **Cara Filter Riwayat Mutasi:**

1. Buka menu **Riwayat Jabatan**
2. Gunakan filter di bagian atas:
   - **Dropdown Jenis**: Pilih Promosi, Mutasi, Demosi, atau Semua Jenis
   - **Dropdown Unit Kerja**: Filter berdasarkan unit tujuan
   - **Search Box**: Cari nama, NIP, jabatan, unit kerja, atau no. SK
3. Hasil akan otomatis terfilter

### **Cara Export Data ke CSV:**

1. Buka menu **Riwayat Jabatan**
2. Filter data sesuai kebutuhan (opsional)
3. Klik tombol **Export CSV** (pojok kanan atas)
4. File akan otomatis terdownload dengan format: `riwayat-jabatan-YYYY-MM-DD.csv`

### **Statistik yang Ditampilkan:**

- **Total Mutasi**: Jumlah semua mutasi yang disetujui
- **Promosi**: Kenaikan jabatan
- **Mutasi**: Perpindahan unit (horizontal)
- **Demosi**: Penurunan jabatan

### **Informasi per Mutasi:**

- Nama Pegawai + NIP
- Jenis Mutasi (badge: hijau=Promosi, orange=Mutasi, merah=Demosi)
- Jabatan Lama
- Unit Lama
- Jabatan Baru
- Unit Baru
- Tanggal Efektif
- Nomor SK

### **Statistik per Unit:**

Di bagian bawah halaman, ditampilkan distribusi mutasi per unit kerja tujuan.

### **Tips:**
- Gunakan filter Jenis untuk melihat hanya promosi atau mutasi
- Search dengan NIP untuk melihat riwayat seorang pegawai
- Export CSV untuk laporan mutasi bulanan/tahunan
- Statistik per unit membantu identifikasi unit dengan mutasi tertinggi

---

## TROUBLESHOOTING

### **Hierarki Persetujuan:**

**Q: Tidak bisa menambah level approval**
- A: Pastikan Anda login sebagai admin_instansi
- A: Minimal harus ada 1 level approval

**Q: SLA tidak tersimpan**
- A: SLA harus antara 1-168 jam (1 jam - 7 hari)
- A: Pastikan input angka, bukan teks

### **Template Dokumen:**

**Q: Variabel tidak muncul di preview**
- A: Pastikan variabel ditulis dengan benar: {{nama}} (pakai kurung kurawal ganda)
- A: Tambahkan variabel ke daftar "Variabel yang digunakan"

**Q: Template tidak bisa disimpan**
- A: Nama template harus unik (tidak boleh sama dengan yang sudah ada)
- A: Konten template tidak boleh kosong

### **Status Kepegawaian:**

**Q: Export CSV tidak download**
- A: Pastikan browser mengizinkan download
- A: Cek pop-up blocker di browser

**Q: Filter tidak bekerja**
- A: Refresh halaman dan coba lagi
- A: Pastikan data pegawai sudah lengkap

### **Riwayat Jabatan:**

**Q: Tidak ada data mutasi**
- A: Pastikan sudah ada mutasi yang disetujui (status = approved)
- A: Mutasi yang masih pending tidak ditampilkan

**Q: Search tidak menemukan pegawai**
- A: Cek ejaan nama atau NIP
- A: Gunakan kata kunci yang lebih umum

---

## FAQ LENGKAP

Lihat FAQ HR di menu **Bantuan** → **FAQ HR** untuk pertanyaan lebih lanjut.

---

**File Terkait:**
- `docs/panduan-deploy-migration-hr-2026-03-12.md` - Panduan migration
- `docs/archive/agent-memory/qwen-2026-03-12/memory/tasks/implementasi-4-menu-baru-hr-2026-03-12.md` - Detail implementasi

**Update Terakhir:** 2026-03-12
**Status:** ✅ Siap digunakan
