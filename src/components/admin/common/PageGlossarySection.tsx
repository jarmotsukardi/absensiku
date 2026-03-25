import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BookOpen, Info, ListChecks } from "lucide-react";

interface GlossaryEntry {
  term: string;
  description: string;
}

interface GlossaryPresetConfig {
  title: string;
  description: string;
  entries: GlossaryEntry[];
  workflowTitle?: string;
  workflowSteps?: string[];
  note?: string;
}

export type PageGlossaryPreset =
  | "admin_supabase_settings"
  | "admin_database_management"
  | "admin_subscription_management"
  | "admin_notifications"
  | "admin_feedback"
  | "admin_audit_logs"
  | "admin_error_logs"
  | "admin_stress_test"
  | "admin_cron_jobs"
  | "admin_org_onboarding_templates"
  | "settings_migration_wizard"
  | "settings_data_import"
  | "settings_full_backup"
  | "settings_system"
  | "settings_cloud_capacity"
  | "settings_email_gateway"
  | "settings_whatsapp_gateway"
  | "org_dashboard"
  | "org_settings"
  | "org_notifications"
  | "org_audit_log"
  | "org_invitations"
  | "org_help_center"
  | "org_schedule_work_hours"
  | "org_schedule_wfh"
  | "org_schedule_absence_limits"
  | "org_schedule_national_holidays"
  | "org_report_attendance"
  | "org_report_recap"
  | "org_report_leave"
  | "org_report_overtime"
  | "org_report_flexible"
  | "org_report_mutation"
  | "org_landing_settings"
  | "org_news"
  | "org_profile"
  | "org_profile_setup"
  | "org_onboarding_setup"
  | "org_employee_management"
  | "org_mutation_requests"
  | "org_leave_requests"
  | "org_leave_absent_without_notice"
  | "org_master_data"
  | "org_schedule_work_holidays"
  | "org_schedule_overtime_settings";

const PRESETS: Record<PageGlossaryPreset, GlossaryPresetConfig> = {
  admin_supabase_settings: {
    title: "Glosarium & Penjelasan Supabase",
    description: "Istilah kunci untuk backup, migrasi, rahasia sistem, dan validasi koneksi Supabase.",
    entries: [
      { term: "Kunci Anon", description: "Kunci publik untuk permintaan dari browser. Tidak boleh dipakai untuk melewati kebijakan RLS." },
      { term: "Kunci Peran Layanan", description: "Kunci server berprivilege tinggi. Hanya dipakai di backend/fungsi edge yang aman." },
      { term: "RLS (Keamanan Tingkat Baris)", description: "Kebijakan akses baris data agar tenant/pengguna hanya melihat data yang berhak." },
      { term: "Rahasia Fungsi Edge", description: "Variabel lingkungan privat untuk fungsi server (OTP, email, WA, tagihan, dll)." },
      { term: "Daftar Periksa Migrasi", description: "Urutan aman perpindahan proyek: skema -> data -> fungsi -> validasi -> pengalihan trafik." },
    ],
    workflowTitle: "Alur Kerja Aman",
    workflowSteps: [
      "Ambil backup penuh proyek sumber.",
      "Terapkan skema + RLS di proyek target.",
      "Impor data, atur rahasia sistem, lalu jalankan uji asap endpoint utama.",
    ],
  },
  admin_database_management: {
    title: "Glosarium & Penjelasan Database",
    description: "Panduan membaca statistik tabel, pengaturan sistem, dan operasi pemeliharaan data.",
    entries: [
      { term: "Statistik Tabel", description: "Ringkasan jumlah rekaman per tabel untuk mendeteksi pertumbuhan data dan anomali." },
      { term: "Pengaturan Sistem", description: "Konfigurasi global yang dibaca modul aplikasi (batas laju, skalabilitas, OTP, dll)." },
      { term: "Perbaikan Otomatis Kantor", description: "Data kantor hasil perbaikan otomatis yang perlu diverifikasi koordinat real." },
      { term: "Ekspor Cuplikan", description: "Ekspor cepat data penting untuk audit/diagnostik tanpa mengubah isi database." },
      { term: "Retensi", description: "Kebijakan durasi simpan data log/riwayat agar performa tetap stabil." },
    ],
    workflowTitle: "Daftar Periksa Operasional",
    workflowSteps: [
      "Pantau anomali jumlah data di tab statistik.",
      "Periksa setting kritis sebelum ubah nilai global.",
      "Lakukan ekspor cuplikan sebelum aksi korektif massal.",
    ],
  },
  admin_subscription_management: {
    title: "Glosarium & Penjelasan Langganan",
    description: "Istilah status langganan dan relasinya dengan kebijakan streak/tagihan.",
    entries: [
      { term: "Status Langganan", description: "Status teknis layanan tenant: uji coba, aktif, kedaluwarsa, atau dibatalkan." },
      { term: "Kebijakan Streak", description: "Status proses berbasis streak: tracking, near_suspension, invoiced, suspended." },
      { term: "Masa Tenggang", description: "Masa tenggang setelah tanggal jatuh tempo sebelum tenant masuk status suspend." },
      { term: "Harga Negosiasi B2B", description: "Harga per pegawai khusus tenant yang menimpa harga global tagihan untuk tagihan baru." },
      { term: "Status Rekomendasi", description: "Saran status otomatis berdasarkan data streak + tagihan agar admin cepat mengambil aksi." },
      { term: "Siap Ditagihkan", description: "Kondisi tenant sudah memenuhi aturan untuk diterbitkan tagihan." },
    ],
    workflowTitle: "Alur Pemantauan",
    workflowSteps: [
      "Pantau tenant yang masuk status mendekati suspend dan sudah ditagihkan.",
      "Set harga negosiasi B2B per tenant bila perlu (mis. tenant besar >= ambang pegawai).",
      "Pastikan status langganan sinkron dengan status tagihan/pembayaran.",
      "Terapkan perubahan status hanya setelah verifikasi data tagihan.",
    ],
  },
  admin_notifications: {
    title: "Glosarium & Penjelasan Notifikasi Admin",
    description: "Penjelasan target penerima, tipe notifikasi, dan pelacakan riwayat kirim.",
    entries: [
      { term: "Semua Admin", description: "Target seluruh admin organisasi yang aktif di sistem." },
      { term: "Admin Organisasi", description: "Target hanya admin dari organisasi yang dipilih." },
      { term: "Pegawai Organisasi", description: "Target pegawai dalam organisasi terpilih (berbasis user_id aktif)." },
      { term: "Catatan Pengiriman", description: "Catatan notifikasi tersimpan di tabel notifikasi sebagai riwayat kirim." },
      { term: "Status Dibaca", description: "Status sudah dibaca atau belum oleh penerima pada aplikasi klien." },
    ],
    workflowTitle: "Alur Kirim",
    workflowSteps: [
      "Pilih target yang tepat (global, organisasi, atau pegawai organisasi).",
      "Kirim notifikasi dan cek riwayat untuk validasi jumlah penerima.",
      "Audit notifikasi gagal/duplikat sebelum kirim ulang massal.",
    ],
  },
  admin_feedback: {
    title: "Glosarium & Penjelasan Masukan & Bug",
    description: "Definisi status masukan dan cara penanganan agar antrian laporan tetap terkendali.",
    entries: [
      { term: "Jenis Masukan", description: "Kategori masukan pengguna: bug (masalah) atau saran (peningkatan)." },
      { term: "Status Terbuka/Selesai", description: "Terbuka menunggu tindak lanjut, selesai berarti sudah ditangani." },
      { term: "Hari Survei", description: "Hari keberapa survei muncul sejak pegawai aktif menggunakan aplikasi." },
      { term: "Catatan Penyelesaian", description: "Catatan teknis penyelesaian yang memudahkan audit dan transfer pengetahuan." },
      { term: "Sakelar Masukan", description: "Kontrol aktif/nonaktif agar masukan tidak menumpuk saat pemeliharaan." },
    ],
    workflowTitle: "Alur Triage",
    workflowSteps: [
      "Filter laporan prioritas tinggi (rating rendah/bug kritis).",
      "Isi catatan resolusi saat menutup tiket.",
      "Gunakan ekspor PDF/CSV untuk tinjauan periodik dengan tim.",
    ],
  },
  admin_audit_logs: {
    title: "Glosarium & Penjelasan Audit Log",
    description: "Panduan membaca aktivitas sistem per aksi, aktor, organisasi, dan waktu kejadian.",
    entries: [
      { term: "Jenis Aksi", description: "Jenis perubahan data: INSERT, UPDATE, atau DELETE." },
      { term: "Nama Tabel", description: "Nama tabel yang berubah, ditampilkan dengan label bisnis agar mudah dibaca." },
      { term: "Pelaku", description: "Pelaku perubahan (user/pegawai/system) yang mengeksekusi aksi." },
      { term: "IP & Agen Pengguna", description: "Jejak teknis sumber akses untuk kebutuhan keamanan dan forensik." },
      { term: "Retensi 60 Hari", description: "Kebijakan data audit aktif agar query tetap ringan di skala besar." },
    ],
    workflowTitle: "Cara Pakai",
    workflowSteps: [
      "Filter bulan dan kata kunci untuk memperkecil dataset.",
      "Fokus pada aksi DELETE/UPDATE untuk investigasi perubahan kritis.",
      "Ekspor dan arsipkan laporan untuk kepatuhan berkala.",
    ],
  },
  admin_error_logs: {
    title: "Glosarium & Penjelasan Operasional Log Error",
    description: "Panduan membaca daftar gagal muat data di /admin/log-errors berdasarkan nomor error, dampak, dan tindak lanjut.",
    entries: [
      { term: "Nomor Error (Ref)", description: "Kode unik format ERR-... yang dipakai untuk pelacakan, eskalasi, dan verifikasi perbaikan." },
      { term: "Gagal Memuat Data", description: "Kondisi saat halaman/fitur tidak bisa memuat data karena error klien, API, atau koneksi." },
      { term: "Kritis", description: "Error yang mengganggu alur utama pengguna dan wajib diprioritaskan perbaikannya." },
      { term: "Non Kritis", description: "Error ringan/intermiten yang tidak menghentikan layanan utama, tetapi tetap dicatat untuk perbaikan." },
      { term: "Selesai", description: "Status insiden kritis yang sudah diperbaiki dan diverifikasi hasilnya." },
      { term: "Arsip Kritis", description: "Riwayat insiden kritis yang tidak lagi aktif, disimpan untuk audit dan referensi." },
      { term: "Arsip Non Kritis", description: "Riwayat log non-kritis yang sudah dipindahkan dari antrian aktif agar fokus monitoring tetap ke error prioritas." },
      { term: "Salin Ref Error", description: "Tombol salin cepat nomor error agar mudah ditempel ke tiket, chat, atau catatan investigasi." },
      { term: "Retensi Otomatis", description: "Pembersihan berkala log lama agar performa query tetap ringan dan daftar tetap relevan." },
    ],
    workflowTitle: "Alur Kerja Harian Tim Admin",
    workflowSteps: [
      "Pantau tab Kritis terlebih dahulu dan prioritaskan error terbaru dengan dampak terbesar.",
      "Gunakan tombol Copy pada Ref Error untuk investigasi, koordinasi, dan pembuatan tiket.",
      "Setelah perbaikan tervalidasi, ubah status ke Selesai agar keluar dari antrian kritis aktif.",
      "Pindahkan insiden yang sudah final ke Arsip Kritis untuk menjaga daftar aktif tetap bersih.",
      "Pakai ekspor CSV/JSON saat diperlukan untuk audit, laporan teknis, atau eskalasi vendor.",
    ],
    note:
      "Filter default adalah 24 jam agar fokus ke insiden terkini. Jika data terlihat kosong, cek filter konteks/rentang waktu dan ubah ke 7 hari, 30 hari, atau Semua Waktu.",
  },
  admin_stress_test: {
    title: "Glosarium & Penjelasan Uji Beban",
    description: "Metrik utama untuk menilai kesiapan sistem menghadapi lonjakan trafik absensi.",
    entries: [
      { term: "Pengguna Virtual", description: "Jumlah pengguna simulasi yang mengirim request bersamaan." },
      { term: "Tingkat Keberhasilan", description: "Persentase request sukses dari total request selama pengujian." },
      { term: "Latensi P95", description: "Waktu respons yang mencakup 95% request tercepat (indikator UX mayoritas)." },
      { term: "Jumlah Aktivasi Circuit Breaker", description: "Jumlah pemutusan sementara saat backend dianggap tidak sehat." },
      { term: "Laju Proses", description: "Kapasitas proses request per detik selama beban berlangsung." },
    ],
    workflowTitle: "Interpretasi Cepat",
    workflowSteps: [
      "Tingkat keberhasilan >= 95% dan P95 stabil menandakan sistem siap produksi.",
      "Jika circuit breaker sering aktif, cek koneksi DB dan query berat.",
      "Gunakan hasil uji untuk tuning tier di tab skalabilitas.",
    ],
  },
  admin_cron_jobs: {
    title: "Glosarium & Penjelasan Pekerjaan Cron",
    description: "Istilah inti penjadwalan tugas, mode angka WIB, cron teknis UTC, dan evaluasi riwayat eksekusi.",
    entries: [
      { term: "Registri Cron", description: "Daftar job standar sistem yang seharusnya ada di scheduler." },
      { term: "Terjadwal vs Aktif", description: "Terjadwal berarti terdaftar; aktif berarti aktif dijalankan." },
      { term: "Mode Angka WIB", description: "Pengaturan jam/menit harian dengan angka lokal WIB. Sistem akan konversi otomatis ke cron UTC." },
      { term: "Cron Teknis (UTC)", description: "Format lanjutan 5 kolom untuk kebutuhan pola khusus di luar pengaturan angka standar." },
      { term: "Retensi Log", description: "Durasi simpan data log. Cron cleanup hanya menghapus data yang sudah melewati retensi aktif." },
      { term: "Rincian Eksekusi", description: "Riwayat eksekusi task (sukses/gagal/durasi) dari pg_cron." },
      { term: "Mode Cadangan", description: "Mode katalog standar saat RPC cron belum tersedia di database." },
      { term: "Sinkronkan Job", description: "Aksi menyelaraskan job standar sistem ke scheduler aktif." },
    ],
    workflowTitle: "Alur Verifikasi",
    workflowSteps: [
      "Atur waktu cleanup lewat mode angka WIB, lalu simpan.",
      "Pastikan job penting statusnya terjadwal + aktif.",
      "Cek run gagal terbaru dan tindak lanjuti error berulang.",
      "Jalankan sync jika ada job belum terdaftar.",
    ],
  },
  admin_org_onboarding_templates: {
    title: "Glosarium & Penjelasan Templat Orientasi Organisasi",
    description:
      "Templat global superadmin untuk membantu organisasi baru menyelesaikan pengaturan awal secara aman tanpa menimpa data yang sudah ada.",
    entries: [
      { term: "Templat Data Master", description: "Bawaan OPD, satuan kerja, jabatan, dan lokasi kerja untuk tenant baru." },
      { term: "Templat Jadwal", description: "Bawaan hari kerja, jam masuk/pulang, serta toleransi keterlambatan awal." },
      { term: "Penanda Fitur", description: "Bawaan sakelar WFH, persetujuan WFH, dan notifikasi batas absen." },
      { term: "Pengumuman Awal", description: "Pengumuman awal otomatis jika tenant belum memiliki konten." },
      { term: "Terapkan Aman", description: "Templat hanya mengisi tabel kosong agar data yang sudah valid tidak tertimpa." },
    ],
    workflowTitle: "Alur Templat",
    workflowSteps: [
      "Superadmin menyusun templat global onboarding.",
      "Templat disimpan ke pengaturan sistem dan dipakai oleh alur `/org/onboarding`.",
      "Tenant baru bisa menerapkan otomatis lalu melengkapi data riil di modul terkait.",
    ],
  },
  settings_migration_wizard: {
    title: "Glosarium & Penjelasan Panduan Migrasi",
    description: "Istilah inti untuk perpindahan proyek Supabase secara aman dan bertahap.",
    entries: [
      { term: "Proyek Sumber/Tujuan", description: "Proyek asal data dan proyek tujuan migrasi." },
      { term: "Skema SQL", description: "Definisi struktur tabel, indeks, tipe, dan fungsi yang wajib sinkron." },
      { term: "RPC (Remote Procedure Call)", description: "Fungsi database yang dipanggil aplikasi untuk eksekusi server-side yang konsisten." },
      { term: "Pindah Trafik Data", description: "Momen perpindahan trafik dari proyek lama ke proyek baru." },
      { term: "Rencana Pemulihan", description: "Rencana kembali ke proyek lama jika validasi target gagal." },
      { term: "Validasi Pasca Migrasi", description: "Pengujian login, absensi, notifikasi, tagihan setelah migrasi." },
    ],
    workflowTitle: "Urutan Aman",
    workflowSteps: [
      "Selesaikan langkah persiapan dan backup.",
      "Migrasikan skema dulu, baru data dan storage/fungsi.",
      "Lakukan pengalihan trafik hanya setelah semua validasi lulus.",
    ],
  },
  settings_data_import: {
    title: "Glosarium & Penjelasan Impor Data",
    description: "Panduan format backup, urutan impor, dan mitigasi konflik relasi data.",
    entries: [
      { term: "Format Backup Penuh", description: "Struktur file backup berisi data, metadata, skema, dan RLS opsional." },
      { term: "Urutan Impor", description: "Urutan tabel agar foreign key valid (tenant -> pegawai -> relasi turunan)." },
      { term: "UPSERT", description: "Mode impor yang melakukan update jika data ada dan insert jika data baru." },
      { term: "Tabel Terpilih", description: "Pemilihan tabel parsial untuk restore terbatas sesuai kebutuhan." },
      { term: "Hasil Impor", description: "Ringkasan sukses/gagal per tabel untuk audit dan coba ulang terarah." },
      { term: "Tabel Tidak Didukung", description: "Tabel yang terdeteksi namun tidak diproses karena di luar whitelist import." },
    ],
    workflowTitle: "Praktik Aman",
    workflowSteps: [
      "Validasi file backup sebelum import.",
      "Jalankan import bertahap mulai dari tabel inti.",
      "Tinjau error per tabel sebelum menjalankan import ulang.",
    ],
  },
  settings_full_backup: {
    title: "Glosarium & Penjelasan Backup Penuh",
    description: "Istilah utama ekspor backup lengkap untuk recovery, audit, dan migrasi.",
    entries: [
      { term: "Cuplikan Penuh", description: "Ekspor seluruh tabel penting dalam satu berkas backup." },
      { term: "Ekspor Skema + RLS", description: "Ekspor struktur database dan kebijakan keamanan akses data." },
      { term: "Bucket Storage", description: "Wadah penyimpanan file di Supabase Storage yang perlu disalin saat migrasi." },
      { term: "Edge Function", description: "Fungsi backend yang berjalan di edge untuk proses server-side cepat." },
      { term: "Manifest Fungsi Edge", description: "Daftar fungsi backend yang ikut didokumentasikan saat backup." },
      { term: "Inventaris Storage", description: "Daftar bucket/file penting yang perlu dipastikan pada proses pemulihan." },
      { term: "Statistik Backup Terakhir", description: "Ringkasan backup terakhir: jumlah tabel, rekaman, dan ukuran file." },
    ],
    workflowTitle: "Siklus Backup",
    workflowSteps: [
      "Jalankan full backup sebelum perubahan besar.",
      "Simpan arsip backup di lokasi terpisah dan aman.",
      "Uji restore berkala untuk memastikan backup valid.",
    ],
  },
  settings_system: {
    title: "Glosarium & Penjelasan Pengaturan Sistem",
    description: "Istilah penting untuk pengaturan umum, keamanan, dan backup sistem global.",
    entries: [
      { term: "Zona Waktu & Format Tanggal", description: "Basis waktu aplikasi untuk perhitungan jadwal, laporan, dan log." },
      { term: "Kebijakan Kata Sandi", description: "Aturan kekuatan password untuk menurunkan risiko akun dibobol." },
      { term: "Sakelar 2FA", description: "Aktivasi verifikasi dua langkah per jenis role (super admin/admin org)." },
      { term: "Frekuensi Backup", description: "Frekuensi backup otomatis (hourly/daily/weekly)." },
      { term: "Zona Bahaya", description: "Aksi sensitif seperti clear cache yang perlu kehati-hatian." },
    ],
    workflowTitle: "Urutan Pengubahan Setting",
    workflowSteps: [
      "Ubah parameter satu per satu lalu simpan.",
      "Catat perubahan kritis pada audit log internal.",
      "Uji login, OTP, dan backup setelah update kebijakan.",
    ],
  },
  settings_cloud_capacity: {
    title: "Glosarium & Penjelasan Kapasitas Awan",
    description: "Panduan memantau kapasitas Supabase & Vercel per paket (free/pro/team/enterprise) agar upgrade paket bisa diantisipasi.",
    entries: [
      { term: "Penggunaan Saat Ini", description: "Nilai pemakaian terkini untuk metrik database, storage, bandwidth, active users, dan edge invocations." },
      { term: "Batas Paket", description: "Batas kapasitas per paket provider yang dapat disesuaikan mengikuti kebijakan internal/kontrak." },
      { term: "Ambang Peringatan", description: "Persentase batas kapasitas yang memicu status waspada dan notifikasi dini." },
      { term: "Peringatan Paket Gratis", description: "Notifikasi otomatis ke superadmin jika paket free mendekati limit agar siap upgrade." },
      { term: "Metrik Manual", description: "Input metrik yang belum tersedia otomatis dari API provider (misalnya bandwidth/invocation)." },
    ],
    workflowTitle: "Alur Antisipasi Upgrade",
    workflowSteps: [
      "Muat ulang snapshot penggunaan dan cek persentase setiap metrik.",
      "Sesuaikan plan limits dengan kebijakan paket provider aktual.",
      "Jika paket free mendekati limit, tindak lanjuti notifikasi dan siapkan migrasi ke paket berbayar.",
    ],
  },
  settings_email_gateway: {
    title: "Glosarium & Penjelasan Gerbang Email",
    description: "Istilah konfigurasi SMTP dan pengujian kirim email dari sistem.",
    entries: [
      { term: "SMTP Host/Port", description: "Alamat server dan port pengiriman email provider." },
      { term: "TLS/SSL", description: "Lapisan enkripsi koneksi agar kredensial email lebih aman." },
      { term: "Identitas Pengirim", description: "Email dan nama pengirim yang muncul di kotak masuk penerima." },
      { term: "Uji Email", description: "Uji kirim langsung untuk validasi konfigurasi gateway." },
      { term: "Token Sesi", description: "Token sesi yang dipakai saat invoke Edge Function pengiriman email." },
    ],
    workflowTitle: "Langkah Aktivasi",
    workflowSteps: [
      "Lengkapi SMTP + sender identity.",
      "Simpan konfigurasi lalu kirim test email.",
      "Jika gagal, cek log error + ref ID untuk trace backend.",
    ],
  },
  settings_whatsapp_gateway: {
    title: "Glosarium & Penjelasan Gerbang WhatsApp",
    description: "Panduan istilah provider WA, template, dan uji pengiriman pesan.",
    entries: [
      { term: "Penyedia", description: "Layanan gateway WA yang dipakai (Fonnte/Wablas/WhaCenter/dll)." },
      { term: "Kunci API/Token", description: "Kredensial otentikasi request kirim pesan ke provider." },
      { term: "Nomor Pengirim", description: "Nomor WA pengirim yang terdaftar dan aktif di provider." },
      { term: "Variabel Templat", description: "Placeholder dinamis pada pesan, misal {name}, {date}, {status}." },
      { term: "Uji Pesan", description: "Uji kirim ke nomor tujuan untuk memastikan konfigurasi valid." },
    ],
    workflowTitle: "Langkah Aktivasi",
    workflowSteps: [
      "Pilih provider dan isi kredensial wajib.",
      "Simpan setting lalu jalankan kirim test message.",
      "Gunakan Ref error bila gagal untuk investigasi cepat.",
    ],
  },
  org_dashboard: {
    title: "Glosarium & Penjelasan Dasbor Organisasi",
    description: "Ringkasan metrik operasional organisasi, notifikasi tagihan, dan mode snapshot adaptif saat jam sibuk absensi.",
    entries: [
      { term: "Total Pegawai", description: "Jumlah pegawai terdaftar pada tenant organisasi aktif." },
      { term: "Menunggu Persetujuan", description: "Total pengajuan yang menunggu persetujuan admin organisasi." },
      { term: "Tren Kehadiran", description: "Grafik ringkas kehadiran untuk memantau pola absensi terbaru." },
      { term: "Peringatan Tagihan", description: "Peringatan tagihan saat memasuki grace period atau mendekati suspend." },
      { term: "Sumber Cuplikan", description: "Sumber data dashboard: fresh (hitung baru), cache (snapshot valid), cache jam sibuk (snapshot dipakai saat jam sibuk)." },
      { term: "Informasi APK", description: "Versi dan tautan aplikasi seluler untuk dibagikan ke pegawai." },
    ],
    workflowTitle: "Alur Pemantauan Harian",
    workflowSteps: [
      "Cek metrik pengajuan dan kehadiran.",
      "Pada jam sibuk absensi, dashboard memakai cache jam sibuk untuk menurunkan beban query real-time.",
      "Tindak lanjuti notifikasi billing prioritas.",
      "Validasi aplikasi dan data dashboard tetap sinkron.",
    ],
  },
  org_settings: {
    title: "Glosarium & Penjelasan Pengaturan Organisasi",
    description: "Panduan tab profil, branding, WhatsApp, keamanan, dan kebijakan pembiayaan.",
    entries: [
      { term: "Profil Organisasi", description: "Data identitas instansi: nama, kode, kontak, alamat, dan deskripsi." },
      { term: "Branding", description: "Logo dan gambar hero untuk tampilan dashboard dan halaman publik organisasi." },
      { term: "WhatsApp Mengambang", description: "Widget kontak cepat yang tampil pada halaman tenant organisasi." },
      { term: "OTP Verifikasi", description: "Validasi perubahan sensitif (mis. tipe organisasi atau mode pembiayaan)." },
      { term: "Mode Tagihan", description: "Pola pembiayaan centralized atau individual untuk langganan organisasi." },
      { term: "Ambang B2B", description: "Batas jumlah pegawai aktif untuk memicu rekomendasi negosiasi harga korporasi." },
    ],
    workflowTitle: "Urutan Ubah Setting",
    workflowSteps: [
      "Perbarui profil dasar dan kontak resmi.",
      "Atur branding lalu cek preview landing.",
      "Ubah kebijakan sensitif dengan OTP dan verifikasi hasil simpan.",
    ],
  },
  org_notifications: {
    title: "Glosarium & Penjelasan Notifikasi Organisasi",
    description: "Penjelasan target kirim notifikasi berdasarkan pegawai, OPD, dan satuan kerja.",
    entries: [
      { term: "Target Semua Pegawai", description: "Kirim ke seluruh pegawai aktif yang memiliki akun penerima notifikasi." },
      { term: "Target Pilih Pegawai", description: "Kirim terarah ke daftar pegawai tertentu melalui pencarian nama." },
      { term: "Target OPD/Satuan Kerja", description: "Kirim notifikasi berbasis struktur organisasi untuk siaran tersegmentasi." },
      { term: "Pratinjau Penerima Akhir", description: "Daftar akhir penerima valid setelah filter dan deduplikasi user." },
      { term: "Riwayat Kirim", description: "Log notifikasi yang dapat dipantau status terbaca dan waktu kirimnya." },
    ],
    workflowTitle: "Alur Kirim Aman",
    workflowSteps: [
      "Pilih target dan cek preview penerima final.",
      "Kirim notifikasi lalu pantau riwayatnya.",
      "Hapus notifikasi yang tidak relevan untuk menjaga kebersihan data.",
    ],
  },
  org_audit_log: {
    title: "Glosarium & Penjelasan Audit Log Organisasi",
    description: "Panduan membaca jejak perubahan data, retensi, dan mekanisme clean manual pada modul organisasi.",
    entries: [
      { term: "Aksi", description: "Jenis aksi data: tambah, ubah, atau hapus." },
      { term: "Tabel", description: "Nama tabel yang terdampak oleh aksi pengguna/sistem." },
      { term: "Pelaku", description: "Pelaku perubahan data berdasarkan user/employee terkait." },
      { term: "Penanda Waktu", description: "Waktu kejadian log dalam zona waktu sistem organisasi." },
      { term: "Ringkasan Perubahan", description: "Ringkasan field penting yang berubah pada satu aksi." },
      { term: "Auto-Clean Harian", description: "Pembersihan otomatis dari cron superadmin berdasarkan retensi aktif server." },
      { term: "Clean Manual", description: "Tombol pembersihan manual khusus tenant aktif untuk menghapus log yang sudah melewati retensi." },
      { term: "Data Dikecualikan", description: "Aksi sistem tertentu (mis. perawatan partisi) tetap dipertahankan dan tidak ikut terhapus." },
    ],
    workflowTitle: "Alur Investigasi",
    workflowSteps: [
      "Gunakan filter action + tabel untuk memperkecil data.",
      "Cari entri kritis berdasarkan waktu kejadian.",
      "Jika data lama belum terhapus karena jadwal cron belum berjalan, jalankan Clean Manual.",
      "Simpan hasil audit untuk kebutuhan compliance internal.",
    ],
  },
  org_invitations: {
    title: "Glosarium & Penjelasan Undangan Pegawai",
    description: "Istilah penting proses onboarding pegawai menggunakan kode undangan.",
    entries: [
      { term: "Kode Undangan", description: "Kode unik untuk aktivasi akun pegawai." },
      { term: "Jenis Undangan", description: "Jenis undangan: individual, per OPD, atau per kantor/satuan kerja." },
      { term: "Undangan Kedaluwarsa", description: "Undangan melewati masa berlaku dan tidak bisa dipakai lagi." },
      { term: "Status Verifikasi", description: "Status undangan: menunggu, terverifikasi, atau ditolak." },
      { term: "Kirim Ulang/Salin Tautan", description: "Aksi cepat untuk membagikan ulang tautan undangan ke calon pegawai." },
    ],
    workflowTitle: "Alur Onboarding",
    workflowSteps: [
      "Buat undangan sesuai tipe target.",
      "Pantau status verifikasi dan masa berlaku.",
      "Edit atau kirim ulang undangan jika diperlukan.",
    ],
  },
  org_help_center: {
    title: "Glosarium & Penjelasan FAQ & Bantuan",
    description: "Cara membaca tahap akses HR/Payroll, memakai FAQ, dan menentukan kapan perlu meminta bantuan.",
    entries: [
      { term: "Fondasi Absensi", description: "Kesiapan dasar organisasi seperti struktur, lokasi kerja, jam kerja, batas absen, data pegawai, dan rekam absensi awal." },
      { term: "Mode Lihat Saja", description: "Status ketika menu sudah dapat dibuka untuk dipelajari, tetapi data belum bisa ditambah atau diubah." },
      { term: "Bisa Diedit", description: "Status ketika admin organisasi sudah dapat menambah, mengubah, dan mengelola data di modul terkait." },
      { term: "Komitmen Pembayaran", description: "Tahap ketika organisasi sudah menyatakan kesiapan melanjutkan aktivasi sehingga HR dapat dibuka lebih lanjut sesuai kebijakan akses." },
      { term: "Langganan Aktif", description: "Status ketika layanan berjalan penuh dan akses fitur mengikuti paket yang dipilih organisasi." },
      { term: "Kategori FAQ", description: "Kelompok topik pertanyaan agar pengguna cepat menemukan jawaban." },
      { term: "Cari FAQ", description: "Pencarian pertanyaan berdasarkan kata kunci pada judul/konten." },
      { term: "Email Dukungan", description: "Kanal resmi dukungan teknis via email." },
      { term: "WhatsApp Dukungan", description: "Kanal bantuan cepat untuk konsultasi operasional." },
      { term: "Tiket Bantuan", description: "Laporan kendala resmi dari admin organisasi dengan subjek, kategori, prioritas, dan detail masalah." },
      { term: "Status Tiket", description: "Status progres tiket, minimal Terbuka (menunggu tindak lanjut) dan Selesai." },
      { term: "Prioritas Tiket", description: "Level dampak masalah (Rendah, Normal, Tinggi, Mendesak) untuk membantu triase support." },
      { term: "FAQ Cadangan", description: "Data FAQ cadangan saat sumber utama belum tersedia." },
    ],
    workflowTitle: "Alur Bantuan",
    workflowSteps: [
      "Pahami dulu apakah modul sedang Terkunci, Lihat Saja, atau sudah Bisa Diedit.",
      "Cari FAQ sesuai kata kunci/kategori.",
      "Jika topiknya terkait aktivasi HR/Payroll, cocokkan dulu dengan status langganan dan kesiapan absensi organisasi.",
      "Jika belum terjawab, buka menu Buat Tiket dan isi detail kendala.",
      "Pantau status tiket (Terbuka/Selesai) pada daftar tiket organisasi.",
      "Gunakan email atau WhatsApp support untuk eskalasi jika diperlukan.",
    ],
    note:
      "Untuk admin organisasi, istilah paling penting adalah Fondasi Absensi, Mode Lihat Saja, Bisa Diedit, Komitmen Pembayaran, dan Langganan Aktif. Kelima istilah ini menentukan kapan HR atau Payroll sudah siap dipakai penuh.",
  },
  org_schedule_work_hours: {
    title: "Glosarium & Penjelasan Jadwal Jam Kerja",
    description: "Definisi hari kerja, template jadwal, dan status aktif/nonaktif jam kerja.",
    entries: [
      { term: "Jenis Instansi", description: "Klasifikasi instansi untuk membedakan pola jam kerja." },
      { term: "Hari dalam Minggu", description: "Hari kerja yang dijadwalkan untuk absensi masuk/pulang." },
      { term: "Templat Senin-Jumat", description: "Penerapan cepat jam kerja untuk hari kerja standar." },
      { term: "Templat Senin-Minggu", description: "Penerapan cepat jadwal 7 hari untuk instansi shift." },
      { term: "Status Aktif", description: "Menandai jadwal yang dipakai sistem saat validasi absensi." },
    ],
    workflowTitle: "Alur Setup Jam Kerja",
    workflowSteps: [
      "Pilih jenis instansi target.",
      "Gunakan template lalu sesuaikan hari tertentu.",
      "Simpan dan verifikasi hasil pada absensi harian.",
    ],
  },
  org_schedule_wfh: {
    title: "Glosarium & Penjelasan Jadwal WFH",
    description: "Panduan aturan WFH berdasarkan scope organisasi/OPD/satuan kerja/pegawai.",
    entries: [
      { term: "Cakupan WFH", description: "Tingkat penerapan jadwal WFH: organisasi, OPD, unit, atau individu." },
      { term: "Berulang", description: "Jadwal berulang mingguan pada hari tertentu." },
      { term: "Tanggal Spesifik", description: "Jadwal WFH pada tanggal tunggal." },
      { term: "Rentang Tanggal", description: "Jadwal WFH dalam rentang tanggal tertentu." },
      { term: "Cakupan Prioritas", description: "Scope lebih spesifik umumnya mengoverride aturan yang lebih umum." },
    ],
    workflowTitle: "Alur Pengaturan WFH",
    workflowSteps: [
      "Tentukan scope dan tipe jadwal.",
      "Isi periode dan keterangan kebijakan.",
      "Aktifkan jadwal lalu monitor dampaknya di laporan.",
    ],
  },
  org_schedule_absence_limits: {
    title: "Glosarium & Penjelasan Batas Absen",
    description: "Aturan ambang ketidakhadiran untuk notifikasi dan eskalasi.",
    entries: [
      { term: "Batas Hari Maksimal", description: "Ambang jumlah hari ketidakhadiran sebelum aturan aktif." },
      { term: "Jenis Peringatan", description: "Jenis teguran/notifikasi saat ambang terlampaui." },
      { term: "Aturan Aktif", description: "Aturan aktif akan dipakai saat proses evaluasi absensi." },
      { term: "Sakelar Notifikasi", description: "Toggle global untuk mengaktifkan/menonaktifkan notifikasi batas absen ke pegawai." },
      { term: "Notifikasi per Aturan", description: "Aksi kirim notifikasi berdasarkan aturan tertentu." },
      { term: "Deskripsi Aturan", description: "Catatan kebijakan internal agar konteks aturan jelas." },
    ],
    workflowTitle: "Alur Penerapan Aturan",
    workflowSteps: [
      "Tambahkan aturan ambang sesuai kebijakan HR.",
      "Aktifkan toggle notifikasi bila ingin aturan mengirim notifikasi otomatis ke pegawai bersangkutan.",
      "Aktifkan rule yang relevan dan nonaktifkan rule lama.",
      "Uji kirim notifikasi untuk memastikan rule berjalan.",
    ],
  },
  org_schedule_national_holidays: {
    title: "Glosarium & Penjelasan Libur Nasional",
    description: "Sumber data libur nasional dan penggunaannya pada kalender organisasi.",
    entries: [
      { term: "Sumber Penarikan", description: "Sumber tarik data libur (utama/fallback) untuk pengisian kalender nasional." },
      { term: "Filter Tahun", description: "Penyaringan data libur berdasarkan tahun tertentu." },
      { term: "Libur Aktif", description: "Hari libur aktif yang dipakai sebagai referensi jadwal kerja." },
      { term: "Pratinjau Cadangan", description: "Pratinjau data alternatif saat sumber utama bermasalah." },
      { term: "Sinkron ke Kalender", description: "Proses menyalin daftar libur ke kalender kerja organisasi." },
    ],
    workflowTitle: "Alur Sinkron Libur",
    workflowSteps: [
      "Tarik data libur nasional per tahun.",
      "Validasi hasil lalu cek status aktif.",
      "Gunakan sebagai basis penjadwalan kerja/absensi.",
    ],
  },
  org_report_attendance: {
    title: "Glosarium & Penjelasan Laporan Absensi",
    description: "Parameter filter dan interpretasi status pada laporan absensi harian.",
    entries: [
      { term: "Status", description: "Hasil akhir absensi (hadir, izin, cuti, sakit, tugas luar, tidak hadir)." },
      { term: "Keterangan", description: "Kondisi detail seperti telat/pulang cepat/tidak absen pulang." },
      { term: "Rentang Tanggal", description: "Periode data yang dipakai untuk query laporan." },
      { term: "Cari NIP/Nama", description: "Pencarian cepat record pegawai tertentu." },
      { term: "Batas Jam Sibuk", description: "Penarikan laporan dibatasi saat jam sibuk absensi (06:00-09:00 dan 15:00-18:00) untuk menjaga performa sistem." },
      { term: "Ekspor CSV/PDF", description: "Ekspor laporan untuk arsip atau kebutuhan rapat evaluasi." },
    ],
    workflowTitle: "Alur Audit Kehadiran",
    workflowSteps: [
      "Terapkan filter tanggal dan unit organisasi.",
      "Jalankan penarikan laporan di luar jam sibuk absensi.",
      "Tinjau anomali status/keterangan.",
      "Ekspor hasil untuk dokumentasi periodik.",
    ],
  },
  org_report_recap: {
    title: "Glosarium & Penjelasan Rekap Bulanan",
    description: "Ringkasan agregat kehadiran bulanan per pegawai.",
    entries: [
      { term: "Rekap Bulanan", description: "Akumulasi status absensi pegawai dalam satu periode bulan-tahun." },
      { term: "RPC Rekap", description: "Sumber data agregat server-side untuk kinerja query lebih stabil." },
      { term: "Total Baris", description: "Jumlah pegawai yang masuk hasil rekap untuk filter aktif." },
      { term: "Paginasi", description: "Pembagian hasil agar halaman tetap ringan pada data besar." },
      { term: "Batas Jam Sibuk", description: "Penarikan rekap dibatasi saat jam sibuk absensi (06:00-09:00 dan 15:00-18:00) untuk menjaga kestabilan layanan." },
      { term: "Ekspor & Cetak", description: "Output laporan untuk pelaporan manajemen dan arsip." },
    ],
    workflowTitle: "Alur Pelaporan Bulanan",
    workflowSteps: [
      "Pilih periode bulan/tahun dan unit.",
      "Tampilkan rekap di luar jam sibuk absensi.",
      "Tampilkan rekap lalu analisis indikator utama.",
      "Cetak atau ekspor untuk pelaporan resmi.",
    ],
  },
  org_report_leave: {
    title: "Glosarium & Penjelasan Laporan Izin/Cuti",
    description: "Definisi jenis izin, status persetujuan, dan perhitungan durasi.",
    entries: [
      { term: "Jenis Izin", description: "Jenis pengajuan seperti izin, cuti tahunan, sakit, atau tugas luar." },
      { term: "Status Pengajuan", description: "Status proses: menunggu, disetujui, ditolak." },
      { term: "Durasi", description: "Lama pengajuan dihitung berdasarkan rentang tanggal atau setengah hari." },
      { term: "Filter OPD/Unit Kerja", description: "Penyaringan laporan berdasarkan struktur organisasi." },
      { term: "Alasan", description: "Alasan pengajuan yang disampaikan pegawai." },
    ],
    workflowTitle: "Alur Tinjau Pengajuan",
    workflowSteps: [
      "Filter periode dan status pengajuan.",
      "Periksa alasan serta durasi pengajuan.",
      "Ekspor hasil untuk evaluasi kedisiplinan dan beban kerja.",
    ],
  },
  org_report_overtime: {
    title: "Glosarium & Penjelasan Laporan Lembur",
    description: "Penjelasan data pengajuan lembur dan total jam kerja tambahan.",
    entries: [
      { term: "Nomor Pengajuan", description: "Nomor referensi unik setiap pengajuan lembur." },
      { term: "Rentang Lembur", description: "Periode tanggal lembur berdasarkan detail per hari." },
      { term: "Total Jam", description: "Akumulasi jam lembur yang diajukan." },
      { term: "Status Persetujuan", description: "Status persetujuan pengajuan lembur." },
      { term: "Alasan", description: "Alasan kebutuhan lembur yang diajukan pegawai." },
    ],
    workflowTitle: "Alur Kontrol Lembur",
    workflowSteps: [
      "Filter periode + unit kerja.",
      "Cek jam lembur dan status approval.",
      "Ekspor untuk validasi kompensasi lembur.",
    ],
  },
  org_report_flexible: {
    title: "Glosarium & Penjelasan Laporan Absensi Khusus/WFH",
    description: "Gabungan laporan permohonan WFH dan absensi fleksibel.",
    entries: [
      { term: "Jenis Pengajuan", description: "Tipe permohonan: WFH atau absensi khusus/fleksibel." },
      { term: "Kategori", description: "Kategori alasan seperti dinas luar, rapat eksternal, dll." },
      { term: "Tanggal Pengajuan", description: "Tanggal pelaksanaan permohonan." },
      { term: "Dibuat Pada", description: "Waktu pengajuan dibuat oleh pegawai." },
      { term: "Status", description: "Status proses persetujuan pengajuan." },
    ],
    workflowTitle: "Alur Evaluasi Permohonan",
    workflowSteps: [
      "Filter tipe permohonan dan periode.",
      "Bandingkan volume per kategori/status.",
      "Gunakan hasil untuk evaluasi kebijakan fleksibilitas kerja.",
    ],
  },
  org_report_mutation: {
    title: "Glosarium & Penjelasan Laporan Mutasi",
    description: "Riwayat permintaan perubahan profil dan mutasi pegawai.",
    entries: [
      { term: "Jenis Mutasi", description: "Jenis perubahan: perubahan profil atau perpindahan unit/OPD." },
      { term: "OPD Asal/Tujuan", description: "Perbandingan unit asal dan unit tujuan mutasi." },
      { term: "Perubahan Diajukan", description: "Data yang diajukan untuk diubah oleh pegawai." },
      { term: "Status Persetujuan", description: "Status persetujuan mutasi dari admin organisasi." },
      { term: "Ringkasan Perubahan", description: "Ringkasan perubahan penting untuk audit cepat." },
    ],
    workflowTitle: "Alur Audit Mutasi",
    workflowSteps: [
      "Filter data berdasarkan tipe dan status.",
      "Validasi perpindahan unit tujuan.",
      "Ekspor riwayat untuk kebutuhan administrasi kepegawaian.",
    ],
  },
  org_landing_settings: {
    title: "Glosarium & Penjelasan Landing Organisasi",
    description: "Panduan pengaturan halaman publik organisasi agar konsisten dengan branding instansi.",
    entries: [
      { term: "URL Halaman Publik", description: "Tautan halaman publik organisasi untuk calon pengguna/pelanggan." },
      { term: "Konten Hero", description: "Judul, deskripsi, dan elemen visual utama di bagian atas halaman." },
      { term: "CTA (Ajakan Aksi)", description: "Tombol ajakan aksi seperti daftar, hubungi admin, atau pelajari lebih lanjut." },
      { term: "Logo & Gambar Hero", description: "Aset visual utama yang mempengaruhi identitas halaman publik." },
      { term: "Pratinjau Publikasi", description: "Pratinjau hasil sebelum dibagikan ke publik." },
    ],
    workflowTitle: "Alur Pengaturan Landing",
    workflowSteps: [
      "Ubah konten utama dan visual branding.",
      "Cek preview lintas perangkat.",
      "Simpan lalu salin tautan landing untuk distribusi.",
    ],
  },
  org_news: {
    title: "Glosarium & Penjelasan Berita/Pengumuman Organisasi",
    description: "Istilah utama untuk publikasi pengumuman internal organisasi.",
    entries: [
      { term: "Status Publikasi", description: "Menandai pengumuman tayang (dipublikasikan) atau tidak tayang (draft)." },
      { term: "Editor Teks Biasa", description: "Konten ditulis dalam teks biasa (non-HTML) agar mudah dibaca dan konsisten." },
      { term: "Batas 15 Pengumuman", description: "Setiap organisasi maksimal menyimpan 15 pengumuman terbaru." },
      { term: "Hapus Otomatis Terlama", description: "Saat jumlah melebihi 15, pengumuman paling lama dihapus otomatis oleh sistem." },
      { term: "Paginasi", description: "Pembagian daftar berita agar halaman tetap ringan saat data besar." },
      { term: "Konten Disematkan", description: "Pengumuman prioritas yang ditampilkan lebih atas untuk visibilitas tinggi." },
    ],
    workflowTitle: "Alur Editorial Singkat",
    workflowSteps: [
      "Tulis judul dan konten pengumuman dengan bahasa yang jelas.",
      "Atur status publish dan pin bila diperlukan.",
      "Pantau jumlah pengumuman agar tetap pada 15 data terbaru (sisanya dibersihkan otomatis).",
    ],
  },
  org_profile: {
    title: "Glosarium & Penjelasan Profil Admin Organisasi",
    description: "Data akun admin organisasi untuk keamanan dan pemulihan akses.",
    entries: [
      { term: "Nama Tampilan", description: "Nama tampilan admin organisasi pada sistem." },
      { term: "Email Akun", description: "Email login utama untuk autentikasi." },
      { term: "Kontak Pemulihan", description: "No HP/WhatsApp untuk validasi lupa password." },
      { term: "Ubah Password", description: "Fitur penggantian password dengan validasi keamanan." },
      { term: "Konteks Tenant", description: "Keterkaitan akun dengan organisasi/tenant tertentu." },
    ],
    workflowTitle: "Daftar Periksa Keamanan Akun",
    workflowSteps: [
      "Pastikan kontak pemulihan terisi benar.",
      "Ganti password secara berkala.",
      "Verifikasi profil setelah perubahan data sensitif.",
    ],
  },
  org_profile_setup: {
    title: "Glosarium & Penjelasan Pengaturan Awal Profil Organisasi",
    description: "Tahap inisialisasi data wajib organisasi setelah aktivasi akun admin.",
    entries: [
      { term: "Nama Penanggung Jawab", description: "Nama penanggung jawab utama organisasi." },
      { term: "WhatsApp Penanggung Jawab", description: "Kontak WhatsApp resmi untuk komunikasi operasional." },
      { term: "Alamat Organisasi", description: "Alamat lengkap instansi sebagai data administratif." },
      { term: "NPWP", description: "Nomor pajak organisasi untuk kebutuhan legal/billing." },
      { term: "Pengaturan Logo", description: "Upload logo awal agar identitas organisasi langsung terbentuk." },
    ],
    workflowTitle: "Alur Setup Awal",
    workflowSteps: [
      "Isi data PIC dan kontak organisasi.",
      "Lengkapi alamat serta NPWP jika tersedia.",
      "Simpan untuk melanjutkan onboarding organisasi.",
    ],
  },
  org_onboarding_setup: {
    title: "Glosarium & Penjelasan Pengaturan Awal Organisasi",
    description:
      "Wizard onboarding untuk member baru /org agar master data, jadwal, dan konten awal siap sebelum operasional harian.",
    entries: [
      { term: "Daftar Periksa Modul", description: "Menampilkan status siap/belum siap berdasarkan jumlah data per modul inti." },
      { term: "Terapkan Templat Pengelola", description: "Mengisi modul kosong dari templat global yang ditetapkan superadmin." },
      { term: "Aturan Tanpa Menimpa", description: "Jika modul sudah berisi data, wizard akan melewati agar konfigurasi existing tetap aman." },
      { term: "Progres Pengaturan Awal", description: "Indikator progres jumlah modul yang sudah terisi data." },
      { term: "Tautan Langsung Modul", description: "Tombol buka modul untuk lanjut melengkapi data real (OPD, lokasi, jam kerja, dll)." },
    ],
    workflowTitle: "Alur Onboarding Tenant",
    workflowSteps: [
      "Buka /org/onboarding setelah akun admin organisasi aktif.",
      "Jalankan Terapkan Templat Pengelola untuk isi data awal yang kosong.",
      "Lanjutkan validasi dan penyempurnaan data real di tiap modul.",
    ],
  },
  org_employee_management: {
    title: "Glosarium & Penjelasan Manajemen Pegawai",
    description: "Istilah inti untuk pengelolaan pegawai aktif/nonaktif di organisasi.",
    entries: [
      { term: "Pegawai Aktif", description: "Pegawai yang masih memiliki akses operasional sistem." },
      { term: "Pegawai Nonaktif", description: "Pegawai yang dinonaktifkan namun datanya tetap tersimpan." },
      { term: "Aktivasi Ulang", description: "Proses mengembalikan status pegawai nonaktif menjadi aktif." },
      { term: "Pengikatan Perangkat", description: "Keterikatan akun pegawai dengan perangkat untuk keamanan absensi." },
      { term: "Filter OPD/Unit", description: "Penyaringan daftar pegawai berdasarkan struktur organisasi." },
    ],
    workflowTitle: "Alur Kelola Pegawai",
    workflowSteps: [
      "Kelola data pegawai aktif dan status akun.",
      "Tinjau pegawai nonaktif sebelum reaktivasi.",
      "Audit perubahan status untuk mencegah akses tidak sah.",
    ],
  },
  org_mutation_requests: {
    title: "Glosarium & Penjelasan Permintaan Mutasi",
    description: "Panduan review permintaan mutasi/perubahan profil pegawai.",
    entries: [
      { term: "Permintaan Mutasi", description: "Pengajuan perubahan data atau perpindahan unit pegawai." },
      { term: "Alur Persetujuan", description: "Alur persetujuan: menunggu, disetujui, atau ditolak." },
      { term: "Alasan Penolakan", description: "Alasan wajib saat menolak pengajuan mutasi." },
      { term: "Data Sebelum/Sesudah", description: "Perbandingan data lama dan data usulan perubahan." },
      { term: "Formulir Mutasi Admin", description: "Form mutasi manual yang dapat dibuat langsung oleh admin." },
      { term: "Referensi Dokumen", description: "Nomor surat, tanggal, dan penerbit dokumen rujukan tanpa penyimpanan berkas file di aplikasi." },
    ],
    workflowTitle: "Alur Persetujuan Mutasi",
    workflowSteps: [
      "Buka detail pengajuan dan validasi usulan.",
      "Setujui atau tolak dengan catatan yang jelas.",
      "Pantau riwayat mutasi agar konsisten dengan data master.",
    ],
  },
  org_leave_requests: {
    title: "Glosarium & Penjelasan Permohonan Kehadiran",
    description: "Modul permohonan mencakup cuti/izin, WFH, lembur, sakit, dinas, dan absensi khusus.",
    entries: [
      { term: "Antrian Pengajuan", description: "Antrian pengajuan yang menunggu aksi admin organisasi." },
      { term: "Status Persetujuan", description: "Status proses pengajuan untuk setiap pegawai." },
      { term: "Jenis Pengajuan", description: "Jenis pengajuan: cuti/izin, WFH, lembur, dinas, dsb." },
      { term: "Catatan Penolakan", description: "Catatan penolakan untuk transparansi keputusan." },
      { term: "Ekspor Operasional", description: "Ekspor daftar pengajuan untuk arsip dan evaluasi periodik." },
    ],
    workflowTitle: "Alur Operasional Permohonan",
    workflowSteps: [
      "Filter pengajuan berdasarkan tipe dan status.",
      "Proses approval/rejection secara konsisten.",
      "Gunakan ekspor laporan untuk audit dan evaluasi kebijakan.",
    ],
  },
  org_leave_absent_without_notice: {
    title: "Glosarium & Penjelasan Tanpa Keterangan",
    description:
      "Halaman monitoring ketidakhadiran yang bersumber dari data absensi harian berstatus tidak_hadir.",
    entries: [
      { term: "Tanpa Keterangan", description: "Pegawai tercatat tidak hadir pada hari kerja dan belum ada keterangan operasional pada data absensi hari itu." },
      { term: "Status tidak_hadir", description: "Status pada tabel absensi harian (`attendance_records_partitioned`) yang menjadi sumber daftar ini." },
      { term: "Catatan", description: "Informasi tambahan dari sistem/admin terkait absensi hari tersebut. Jika kosong ditampilkan '-'." },
      { term: "OPD", description: "Unit organisasi pegawai untuk membantu pemetaan tindak lanjut per instansi/bidang." },
      { term: "Tidak ada data", description: "Tidak ditemukan pegawai berstatus tidak_hadir pada hasil pencarian/filter saat ini." },
    ],
    workflowTitle: "Alur Tindak Lanjut",
    workflowSteps: [
      "Validasi tanggal dan identitas pegawai pada baris yang muncul.",
      "Konfirmasi ke atasan/unit terkait apakah ada keterangan yang belum diinput.",
      "Gunakan data ini sebagai bahan rekonsiliasi dengan modul permohonan/laporan kehadiran.",
    ],
    note: "Halaman ini bersifat monitoring. Perubahan status dilakukan melalui proses absensi/pengajuan terkait.",
  },
  org_master_data: {
    title: "Glosarium & Penjelasan Master Data Organisasi",
    description: "Data referensi inti organisasi: OPD, unit kerja, jabatan, lokasi, admin OPD, dan import pegawai.",
    entries: [
      { term: "Referensi Master", description: "Data acuan yang dipakai modul absensi, pengajuan, dan pelaporan." },
      { term: "Kode Unik", description: "Pengenal penting (kode) untuk sinkronisasi lintas modul." },
      { term: "Status Aktif", description: "Menandai entitas master masih berlaku atau tidak." },
      { term: "Impor Pegawai", description: "Proses impor data massal pegawai dari berkas terstruktur." },
      { term: "Integritas Data", description: "Konsistensi relasi antar master (OPD-unit-jabatan-lokasi)." },
    ],
    workflowTitle: "Alur Pemeliharaan Master Data",
    workflowSteps: [
      "Perbarui master data sebelum update data pegawai.",
      "Pastikan kode unik tidak duplikat.",
      "Lakukan audit berkala untuk menjaga integritas relasi.",
    ],
  },
  org_schedule_work_holidays: {
    title: "Glosarium & Penjelasan Libur Kerja Organisasi",
    description: "Pengaturan hari libur kerja internal yang dapat berbeda per jenis instansi.",
    entries: [
      { term: "Cakupan Instansi", description: "Penerapan hari libur berdasarkan tipe instansi." },
      { term: "Aturan Bulan/Tahun", description: "Aturan hari libur per bulan dan tahun." },
      { term: "Tanggal Libur", description: "Daftar tanggal non-kerja dalam bulan tertentu." },
      { term: "Salin Bulan", description: "Duplikasi pola libur untuk mempercepat setup bulan berikutnya." },
      { term: "Deskripsi", description: "Catatan kebijakan libur kerja internal organisasi." },
    ],
    workflowTitle: "Alur Pengaturan Libur Kerja",
    workflowSteps: [
      "Tentukan scope instansi dan periode.",
      "Isi tanggal libur dan deskripsi kebijakan.",
      "Tinjau dampak ke jadwal absensi sebelum disimpan.",
    ],
  },
  org_schedule_overtime_settings: {
    title: "Glosarium & Penjelasan Pengaturan Lembur",
    description: "Aturan dasar pengajuan dan perhitungan lembur pada organisasi.",
    entries: [
      { term: "Durasi Minimum", description: "Durasi minimum lembur agar pengajuan valid." },
      { term: "Pengali Tarif", description: "Pengali perhitungan lembur untuk hari kerja/libur." },
      { term: "Perlu Persetujuan", description: "Menentukan apakah semua lembur wajib persetujuan admin." },
      { term: "Pengajuan Multi-Tanggal", description: "Izin pengajuan lembur dalam beberapa tanggal sekaligus." },
      { term: "Tolak Otomatis", description: "Batas waktu otomatis penolakan jika pengajuan tidak diproses." },
    ],
    workflowTitle: "Alur Kebijakan Lembur",
    workflowSteps: [
      "Atur parameter durasi dan kompensasi lembur.",
      "Tetapkan mekanisme approval sesuai SOP.",
      "Simpan dan evaluasi dampaknya pada antrian pengajuan.",
    ],
  },
};

interface PageGlossarySectionProps {
  preset: PageGlossaryPreset;
  className?: string;
}

export function PageGlossarySection({ preset, className }: PageGlossarySectionProps) {
  const config = PRESETS[preset];

  return (
    <Card className={cn("border-dashed", className)}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          {config.title}
        </CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {config.entries.map((entry) => (
            <div key={entry.term} className="rounded-md border p-3">
              <p className="text-sm font-semibold">{entry.term}</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1">{entry.description}</p>
            </div>
          ))}
        </div>

        {(config.workflowTitle || config.workflowSteps?.length) && (
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              {config.workflowTitle || "Cara Kerja"}
            </p>
            {config.workflowSteps && (
              <ol className="mt-2 space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                {config.workflowSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        )}

        {config.note && (
          <div className="rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-100">
            <p className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{config.note}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
