# HR Payroll-Ready Fields

Dokumen ini merinci field minimum yang sebaiknya sudah lengkap dan konsisten di domain HR sebelum payroll disambungkan.

Status per 14 Maret 2026:
- Dokumen ini adalah turunan teknis dari [docs/hr-to-payroll-readiness.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-to-payroll-readiness.md).
- Dokumen ini tidak mengaktifkan payroll.
- Dokumen ini dipakai untuk mengecek kelengkapan data HR sebelum workflow payroll dibuka.

Arti status:
- `mandatory`: field minimum yang harus ada agar payroll aman dibangun
- `recommended`: sebaiknya ada agar payroll tidak cepat mentok
- `optional`: belum wajib untuk baseline payroll, tetapi berguna untuk ekspansi

## 1. Employee Master

Entitas utama: `employees`

| Field | Status | Kenapa |
|---|---|---|
| `id` | mandatory | pengenal utama lintas HR dan payroll |
| `tenant_id` | mandatory | memastikan data payroll tidak bocor lintas tenant |
| `user_id` | recommended | penting untuk sinkronisasi akun dan akses self-service |
| `name` | mandatory | identitas utama pegawai |
| `email` | recommended | penting untuk notifikasi dan referensi lintas modul |
| `nip` atau nomor induk setara | mandatory | identitas operasional pegawai |
| `employee_category` | mandatory | membedakan tipe pegawai untuk aturan payroll |
| `golongan` | recommended | penting bila payroll memakai golongan/level organisasi |
| `position` atau referensi jabatan | mandatory | dasar mapping grade dan komponen payroll |
| `is_active` | mandatory | memisahkan pegawai aktif vs nonaktif |
| `office_id` | recommended | penting untuk pelaporan dan grouping organisasi |
| `opd_id` | recommended | penting bila payroll mengikuti struktur OPD |
| `work_unit_id` | recommended | penting bila payroll mengikuti unit kerja |
| `phone` atau `whatsapp` | optional | tidak wajib untuk payroll, tetapi berguna untuk operasional |

Checklist payroll-ready:
- pegawai aktif bisa dibedakan jelas dari pegawai nonaktif
- tidak ada pegawai payroll yang kehilangan identitas induk
- jabatan, kategori, dan tenant pegawai terisi konsisten

## 2. Status Kepegawaian

Entitas utama:
- `employees`
- turunan status kepegawaian di HR

| Field | Status | Kenapa |
|---|---|---|
| status aktif/nonaktif | mandatory | payroll harus tahu siapa yang masih boleh dihitung |
| jenis hubungan kerja | mandatory | tetap/kontrak/magang/lepas memengaruhi aturan payroll |
| tanggal efektif status | mandatory | payroll butuh titik waktu yang tegas |
| alasan perubahan status | recommended | penting untuk audit dan investigasi |

Checklist payroll-ready:
- perubahan status tidak ambigu
- status berlaku pada tanggal efektif yang jelas
- histori perubahan status bisa dilacak

## 3. Position, Grade, dan Golongan

Entitas utama:
- `positions`
- master `employee_categories`
- master `employee_golongan`

| Field | Status | Kenapa |
|---|---|---|
| nama jabatan | mandatory | dasar struktur payroll |
| kode jabatan | recommended | penting bila payroll butuh mapping yang stabil |
| grade | mandatory | dasar skala gaji atau komponen turunan |
| golongan | recommended | sering dipakai untuk grouping dan kebijakan |
| status aktif master | mandatory | jangan pakai master nonaktif untuk payroll baru |

Checklist payroll-ready:
- setiap pegawai punya jabatan yang bisa dipetakan
- grade/golongan yang dipakai payroll berasal dari master aktif
- tidak ada pegawai aktif yang jatuh ke jabatan atau grade kosong tanpa alasan

## 4. Kontrak Kerja

Entitas utama:
- kontrak HR

| Field | Status | Kenapa |
|---|---|---|
| `employee_id` | mandatory | relasi kontrak ke pegawai |
| jenis kontrak | mandatory | memengaruhi aturan kompensasi |
| tanggal mulai | mandatory | dasar efektif payroll |
| tanggal berakhir | mandatory untuk kontrak berjangka | penting untuk batas aktif |
| status kontrak | mandatory | membedakan draft, aktif, selesai, batal |
| nomor kontrak | recommended | penting untuk audit dan legal |
| dokumen kontrak | recommended | penting untuk verifikasi |

Checklist payroll-ready:
- tidak ada kontrak aktif overlap tanpa aturan jelas
- hanya ada satu kontrak aktif efektif per pegawai jika kebijakan menuntut demikian
- payroll bisa membaca kontrak aktif pada tanggal tertentu

## 5. Struktur Organisasi

Entitas utama:
- organisasi
- OPD
- unit kerja
- kantor/lokasi kerja

| Field | Status | Kenapa |
|---|---|---|
| tenant organisasi aktif | mandatory | dasar isolasi payroll tenant |
| unit kerja/OPD | recommended | penting untuk grouping payroll |
| lokasi kerja | optional | berguna untuk analitik dan kebijakan lokasi |
| atasan langsung | recommended | penting untuk approval, bukan komponen payroll inti |

Checklist payroll-ready:
- pegawai aktif bisa ditempatkan ke struktur organisasi yang jelas
- grouping organisasi tidak bergantung pada data bebas/teks manual

## 6. Policy Kerja

Entitas utama:
- work hours
- shifts
- late settings
- leave policy

| Field | Status | Kenapa |
|---|---|---|
| jam kerja aktif | mandatory | dasar hitung keterlambatan dan lembur |
| shift aktif | recommended | penting bila payroll sensitif ke pola kerja |
| aturan keterlambatan | recommended | penting bila payroll menghitung penalti/disiplin |
| policy cuti/izin | recommended | penting bila payroll dipengaruhi cuti tertentu |
| policy lembur | mandatory bila lembur dihitung payroll | dasar komponen lembur |

Checklist payroll-ready:
- jam kerja dan shift tidak ambigu untuk pegawai aktif
- lembur punya rule yang bisa dibaca payroll
- cuti/izin yang memengaruhi penggajian punya klasifikasi jelas

## 7. Audit Trail

Entitas utama:
- histori perubahan HR
- log approval
- audit log perubahan penting

| Field / Bukti | Status | Kenapa |
|---|---|---|
| referensi perubahan | mandatory | perubahan payroll-impact harus bisa ditelusuri |
| actor/approver | mandatory | harus jelas siapa yang mengubah |
| waktu efektif | mandatory | audit payroll sangat sensitif terhadap tanggal |
| alasan perubahan | recommended | penting untuk investigasi |

Checklist payroll-ready:
- perubahan pegawai, kontrak, dan approval bisa ditelusuri
- perubahan efektif tidak hanya tersimpan sebagai update terakhir tanpa histori

## 8. Readiness Minimum Sebelum Payroll

Sebelum status `partial` dinaikkan menjadi `ready`, minimum yang harus lolos adalah:

1. `employees` punya identitas, status, jabatan, kategori, dan tenant yang konsisten
2. `contracts` punya status aktif dan tanggal efektif yang bisa dipercaya
3. `position-grade` sudah cukup stabil untuk memetakan pegawai ke grade/golongan
4. `reports` minimal bisa dipakai audit dasar
5. `policy kerja` yang berdampak ke payroll sudah punya rule aktif
6. `audit trail` perubahan penting bisa ditelusuri

## 9. Status Saat Ini

Kalimat paling akurat saat ini:

`Field fondasi HR untuk payroll sudah jauh lebih siap, tetapi masih perlu pengetatan di create/import master pegawai, validasi kontrak efektif, dan pembuktian write end-to-end sebelum payroll aman dibuka.`
