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
  | "admin_stress_test"
  | "admin_cron_jobs"
  | "admin_org_onboarding_templates"
  | "settings_migration_wizard"
  | "settings_data_import"
  | "settings_full_backup"
  | "settings_system"
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
  | "org_master_data"
  | "org_schedule_work_holidays"
  | "org_schedule_overtime_settings";

const PRESETS: Record<PageGlossaryPreset, GlossaryPresetConfig> = {
  admin_supabase_settings: {
    title: "Glosary & Penjelasan Supabase",
    description: "Istilah kunci untuk backup, migrasi, secret, dan validasi koneksi Supabase.",
    entries: [
      { term: "Anon Key", description: "Kunci publik untuk request dari browser. Tidak boleh dipakai untuk bypass kebijakan RLS." },
      { term: "Service Role Key", description: "Kunci server berprivilege tinggi. Hanya dipakai di backend/Edge Function yang aman." },
      { term: "RLS (Row Level Security)", description: "Kebijakan akses baris data agar tenant/pengguna hanya melihat data yang berhak." },
      { term: "Edge Function Secrets", description: "Environment variable privat untuk fungsi server (OTP, email, WA, billing, dll)." },
      { term: "Checklist Migrasi", description: "Urutan aman perpindahan project: schema -> data -> function -> validasi -> cutover." },
    ],
    workflowTitle: "Alur Kerja Aman",
    workflowSteps: [
      "Ambil backup penuh project sumber.",
      "Terapkan schema + RLS di project target.",
      "Import data, set secrets, lalu jalankan smoke test endpoint utama.",
    ],
  },
  admin_database_management: {
    title: "Glosary & Penjelasan Database",
    description: "Panduan membaca statistik tabel, pengaturan sistem, dan operasi pemeliharaan data.",
    entries: [
      { term: "Table Stats", description: "Ringkasan jumlah record per tabel untuk mendeteksi pertumbuhan data dan anomali." },
      { term: "System Settings", description: "Konfigurasi global yang dibaca modul aplikasi (rate limit, skalabilitas, OTP, dll)." },
      { term: "Auto-Fix Office", description: "Data kantor hasil perbaikan otomatis yang perlu diverifikasi koordinat real." },
      { term: "Snapshot Export", description: "Ekspor cepat data penting untuk audit/diagnostik tanpa mengubah isi database." },
      { term: "Retention", description: "Kebijakan durasi simpan data log/riwayat agar performa tetap stabil." },
    ],
    workflowTitle: "Checklist Operasional",
    workflowSteps: [
      "Pantau anomali jumlah data di tab statistik.",
      "Periksa setting kritis sebelum ubah nilai global.",
      "Lakukan ekspor snapshot sebelum aksi korektif massal.",
    ],
  },
  admin_subscription_management: {
    title: "Glosary & Penjelasan Langganan",
    description: "Istilah status langganan dan relasinya dengan kebijakan streak/billing.",
    entries: [
      { term: "Status Langganan", description: "Status teknis layanan tenant: trial, active, expired, atau cancelled." },
      { term: "Kebijakan Streak", description: "Status proses berbasis streak: tracking, near_suspension, invoiced, suspended." },
      { term: "Grace Period", description: "Masa tenggang setelah due date sebelum tenant masuk status suspend." },
      { term: "Harga Negosiasi B2B", description: "Harga per pegawai khusus tenant yang meng-override harga global billing untuk invoice baru." },
      { term: "Recommended Status", description: "Saran status otomatis berdasarkan data streak + invoice agar admin cepat mengambil aksi." },
      { term: "Ready for Invoicing", description: "Kondisi tenant sudah memenuhi aturan untuk diterbitkan tagihan." },
    ],
    workflowTitle: "Alur Monitoring",
    workflowSteps: [
      "Pantau tenant yang masuk near_suspension dan invoiced.",
      "Set harga negosiasi B2B per tenant bila perlu (mis. tenant besar >= ambang pegawai).",
      "Pastikan status langganan sinkron dengan status invoice/payment.",
      "Terapkan perubahan status hanya setelah verifikasi data billing.",
    ],
  },
  admin_notifications: {
    title: "Glosary & Penjelasan Notifikasi Admin",
    description: "Penjelasan target penerima, tipe notifikasi, dan pelacakan riwayat kirim.",
    entries: [
      { term: "All Admin", description: "Target seluruh admin organisasi yang aktif di sistem." },
      { term: "Org Admin", description: "Target hanya admin dari organisasi yang dipilih." },
      { term: "Org Employee", description: "Target pegawai dalam organisasi terpilih (berbasis user_id aktif)." },
      { term: "Delivery Record", description: "Catatan notifikasi tersimpan di tabel notifikasi sebagai riwayat kirim." },
      { term: "Read Status", description: "Status sudah dibaca atau belum oleh penerima pada aplikasi client." },
    ],
    workflowTitle: "Alur Kirim",
    workflowSteps: [
      "Pilih target yang tepat (global, organisasi, atau pegawai organisasi).",
      "Kirim notifikasi dan cek riwayat untuk validasi jumlah penerima.",
      "Audit notifikasi gagal/duplikat sebelum kirim ulang massal.",
    ],
  },
  admin_feedback: {
    title: "Glosary & Penjelasan Feedback & Bug",
    description: "Definisi status feedback dan cara penanganan agar antrian laporan tetap terkendali.",
    entries: [
      { term: "Feedback Type", description: "Kategori masukan pengguna: bug (masalah) atau saran (improvement)." },
      { term: "Status Open/Resolved", description: "Open menunggu tindak lanjut, resolved berarti sudah ditangani." },
      { term: "Survey Day", description: "Hari keberapa survei muncul sejak pegawai aktif menggunakan aplikasi." },
      { term: "Resolution Notes", description: "Catatan teknis penyelesaian yang memudahkan audit dan knowledge transfer." },
      { term: "Feedback Toggle", description: "Kontrol enable/disable agar input tidak menumpuk saat maintenance." },
    ],
    workflowTitle: "Alur Triage",
    workflowSteps: [
      "Filter laporan prioritas tinggi (rating rendah/bug kritis).",
      "Isi catatan resolusi saat menutup tiket.",
      "Gunakan export PDF/CSV untuk review periodik dengan tim.",
    ],
  },
  admin_audit_logs: {
    title: "Glosary & Penjelasan Audit Log",
    description: "Panduan membaca aktivitas sistem per aksi, aktor, organisasi, dan waktu kejadian.",
    entries: [
      { term: "Action Type", description: "Jenis perubahan data: INSERT, UPDATE, atau DELETE." },
      { term: "Table Name", description: "Nama tabel yang berubah, ditampilkan dengan label bisnis agar mudah dibaca." },
      { term: "Actor", description: "Pelaku perubahan (user/pegawai/system) yang mengeksekusi aksi." },
      { term: "IP & User Agent", description: "Jejak teknis sumber akses untuk kebutuhan keamanan dan forensik." },
      { term: "Retention 60 Hari", description: "Kebijakan hot data audit agar query tetap ringan di skala besar." },
    ],
    workflowTitle: "Cara Pakai",
    workflowSteps: [
      "Filter bulan dan kata kunci untuk memperkecil dataset.",
      "Fokus pada aksi DELETE/UPDATE untuk investigasi perubahan kritis.",
      "Ekspor dan arsipkan laporan untuk compliance berkala.",
    ],
  },
  admin_stress_test: {
    title: "Glosary & Penjelasan Stress Test",
    description: "Metrik utama untuk menilai kesiapan sistem menghadapi lonjakan trafik absensi.",
    entries: [
      { term: "Virtual Users", description: "Jumlah pengguna simulasi yang mengirim request bersamaan." },
      { term: "Success Rate", description: "Persentase request sukses dari total request selama pengujian." },
      { term: "P95 Latency", description: "Waktu respons yang mencakup 95% request tercepat (indikator UX mayoritas)." },
      { term: "Circuit Breaker Trips", description: "Jumlah pemutusan sementara saat backend dianggap tidak sehat." },
      { term: "Throughput", description: "Kapasitas proses request per detik selama beban berlangsung." },
    ],
    workflowTitle: "Interpretasi Cepat",
    workflowSteps: [
      "Success rate >= 95% dan P95 stabil menandakan sistem siap produksi.",
      "Jika circuit breaker sering trip, cek koneksi DB dan query berat.",
      "Gunakan hasil uji untuk tuning tier di tab skalabilitas.",
    ],
  },
  admin_cron_jobs: {
    title: "Glosary & Penjelasan Cron Jobs",
    description: "Istilah inti penjadwalan task, fallback mode, dan evaluasi riwayat run.",
    entries: [
      { term: "Registry Cron", description: "Daftar job standar sistem yang seharusnya ada di scheduler." },
      { term: "Scheduled vs Active", description: "Scheduled berarti terdaftar; active berarti aktif dijalankan." },
      { term: "Run Details", description: "Riwayat eksekusi task (sukses/gagal/durasi) dari pg_cron." },
      { term: "Fallback Mode", description: "Mode katalog standar saat RPC cron belum tersedia di database." },
      { term: "Sync Jobs", description: "Aksi menyelaraskan job standar sistem ke scheduler aktif." },
    ],
    workflowTitle: "Alur Verifikasi",
    workflowSteps: [
      "Pastikan job penting statusnya scheduled + active.",
      "Cek run gagal terbaru dan tindak lanjuti error berulang.",
      "Jalankan sync jika ada job belum terdaftar.",
    ],
  },
  admin_org_onboarding_templates: {
    title: "Glosary & Penjelasan Template Onboarding Org",
    description:
      "Template global superadmin untuk membantu organisasi baru menyelesaikan setup awal secara aman tanpa menimpa data existing.",
    entries: [
      { term: "Template Master Data", description: "Default OPD, satuan kerja, jabatan, dan lokasi kerja untuk tenant baru." },
      { term: "Template Schedule", description: "Default hari kerja, jam masuk/pulang, serta toleransi keterlambatan awal." },
      { term: "Feature Flags", description: "Default toggle WFH, approval WFH, dan notifikasi batas absen." },
      { term: "Seed Announcement", description: "Pengumuman awal otomatis jika tenant belum memiliki konten." },
      { term: "Safe Apply", description: "Template hanya mengisi tabel kosong agar data yang sudah valid tidak tertimpa." },
    ],
    workflowTitle: "Alur Template",
    workflowSteps: [
      "Superadmin menyusun template global onboarding.",
      "Template disimpan ke system settings dan dipakai oleh wizard /org/onboarding.",
      "Tenant baru bisa terapkan otomatis lalu melengkapi data real di modul terkait.",
    ],
  },
  settings_migration_wizard: {
    title: "Glosary & Penjelasan Migration Wizard",
    description: "Istilah inti untuk perpindahan project Supabase secara aman dan bertahap.",
    entries: [
      { term: "Source/Target Project", description: "Project asal data dan project tujuan migrasi." },
      { term: "Schema SQL", description: "Definisi struktur tabel, index, type, dan fungsi yang wajib sinkron." },
      { term: "Data Cutover", description: "Momen perpindahan trafik dari project lama ke project baru." },
      { term: "Rollback Plan", description: "Rencana kembali ke project lama jika validasi target gagal." },
      { term: "Post-Migration Validation", description: "Pengujian login, absensi, notifikasi, billing setelah migrasi." },
    ],
    workflowTitle: "Urutan Aman",
    workflowSteps: [
      "Selesaikan langkah persiapan dan backup.",
      "Migrasikan schema dulu, baru data dan storage/function.",
      "Lakukan cutover hanya setelah semua validasi lulus.",
    ],
  },
  settings_data_import: {
    title: "Glosary & Penjelasan Data Import",
    description: "Panduan format backup, urutan import, dan mitigasi konflik relasi data.",
    entries: [
      { term: "Full Backup Format", description: "Struktur file backup berisi data, metadata, schema, dan RLS opsional." },
      { term: "Import Order", description: "Urutan tabel agar foreign key valid (tenant -> employee -> relasi turunan)." },
      { term: "Selected Tables", description: "Pemilihan tabel parsial untuk restore terbatas sesuai kebutuhan." },
      { term: "Import Result", description: "Ringkasan sukses/gagal per tabel untuk audit dan retry terarah." },
      { term: "Unsupported Table", description: "Tabel yang terdeteksi namun tidak diproses karena di luar whitelist import." },
    ],
    workflowTitle: "Praktik Aman",
    workflowSteps: [
      "Validasi file backup sebelum import.",
      "Jalankan import bertahap mulai dari tabel inti.",
      "Review error per tabel sebelum menjalankan import ulang.",
    ],
  },
  settings_full_backup: {
    title: "Glosary & Penjelasan Full Backup",
    description: "Istilah utama ekspor backup lengkap untuk recovery, audit, dan migrasi.",
    entries: [
      { term: "Full Snapshot", description: "Ekspor seluruh tabel penting dalam satu berkas backup." },
      { term: "Schema + RLS Export", description: "Ekspor struktur database dan kebijakan keamanan akses data." },
      { term: "Edge Function Manifest", description: "Daftar fungsi backend yang ikut didokumentasikan saat backup." },
      { term: "Storage Inventory", description: "Daftar bucket/file penting yang perlu dipastikan pada restore." },
      { term: "Last Backup Stats", description: "Ringkasan backup terakhir: jumlah tabel, record, dan ukuran file." },
    ],
    workflowTitle: "Siklus Backup",
    workflowSteps: [
      "Jalankan full backup sebelum perubahan besar.",
      "Simpan arsip backup di lokasi terpisah dan aman.",
      "Uji restore berkala untuk memastikan backup valid.",
    ],
  },
  settings_system: {
    title: "Glosary & Penjelasan Pengaturan Sistem",
    description: "Istilah penting untuk pengaturan umum, keamanan, dan backup sistem global.",
    entries: [
      { term: "Timezone & Date Format", description: "Basis waktu aplikasi untuk perhitungan jadwal, laporan, dan log." },
      { term: "Password Policy", description: "Aturan kekuatan password untuk menurunkan risiko akun dibobol." },
      { term: "2FA Toggle", description: "Aktivasi verifikasi dua langkah per jenis role (super admin/admin org)." },
      { term: "Backup Frequency", description: "Frekuensi backup otomatis (hourly/daily/weekly)." },
      { term: "Danger Zone", description: "Aksi sensitif seperti clear cache yang perlu kehati-hatian." },
    ],
    workflowTitle: "Urutan Pengubahan Setting",
    workflowSteps: [
      "Ubah parameter satu per satu lalu simpan.",
      "Catat perubahan kritis pada audit log internal.",
      "Uji login, OTP, dan backup setelah update kebijakan.",
    ],
  },
  settings_email_gateway: {
    title: "Glosary & Penjelasan Email Gateway",
    description: "Istilah konfigurasi SMTP dan pengujian kirim email dari sistem.",
    entries: [
      { term: "SMTP Host/Port", description: "Alamat server dan port pengiriman email provider." },
      { term: "TLS/SSL", description: "Lapisan enkripsi koneksi agar kredensial email lebih aman." },
      { term: "Sender Identity", description: "Email dan nama pengirim yang muncul di kotak masuk penerima." },
      { term: "Test Email", description: "Uji kirim langsung untuk validasi konfigurasi gateway." },
      { term: "Session Token", description: "Token sesi yang dipakai saat invoke Edge Function pengiriman email." },
    ],
    workflowTitle: "Langkah Aktivasi",
    workflowSteps: [
      "Lengkapi SMTP + sender identity.",
      "Simpan konfigurasi lalu kirim test email.",
      "Jika gagal, cek log error + ref ID untuk trace backend.",
    ],
  },
  settings_whatsapp_gateway: {
    title: "Glosary & Penjelasan WhatsApp Gateway",
    description: "Panduan istilah provider WA, template, dan uji pengiriman pesan.",
    entries: [
      { term: "Provider", description: "Layanan gateway WA yang dipakai (Fonnte/Wablas/WhaCenter/dll)." },
      { term: "API Key/Token", description: "Kredensial otentikasi request kirim pesan ke provider." },
      { term: "Sender Number", description: "Nomor WA pengirim yang terdaftar dan aktif di provider." },
      { term: "Template Variable", description: "Placeholder dinamis pada pesan, misal {name}, {date}, {status}." },
      { term: "Test Message", description: "Uji kirim ke nomor tujuan untuk memastikan konfigurasi valid." },
    ],
    workflowTitle: "Langkah Aktivasi",
    workflowSteps: [
      "Pilih provider dan isi kredensial wajib.",
      "Simpan setting lalu jalankan kirim test message.",
      "Gunakan Ref error bila gagal untuk investigasi cepat.",
    ],
  },
  org_dashboard: {
    title: "Glosary & Penjelasan Dashboard Organisasi",
    description: "Ringkasan metrik operasional organisasi, notifikasi tagihan, dan mode snapshot adaptif saat jam sibuk absensi.",
    entries: [
      { term: "Total Pegawai", description: "Jumlah pegawai terdaftar pada tenant organisasi aktif." },
      { term: "Pending Approval", description: "Total pengajuan yang menunggu persetujuan admin organisasi." },
      { term: "Trend Kehadiran", description: "Grafik ringkas kehadiran untuk memantau pola absensi terbaru." },
      { term: "Billing Alert", description: "Peringatan tagihan saat memasuki grace period atau mendekati suspend." },
      { term: "Snapshot Source", description: "Sumber data dashboard: fresh (hitung baru), cache (snapshot valid), peak-hour cache (snapshot dipakai saat jam sibuk)." },
      { term: "APK Info", description: "Versi dan tautan aplikasi mobile untuk dibagikan ke pegawai." },
    ],
    workflowTitle: "Alur Monitoring Harian",
    workflowSteps: [
      "Cek metrik pengajuan dan kehadiran.",
      "Pada jam sibuk absensi, dashboard memakai peak-hour cache untuk menurunkan beban query real-time.",
      "Tindak lanjuti notifikasi billing prioritas.",
      "Validasi aplikasi dan data dashboard tetap sinkron.",
    ],
  },
  org_settings: {
    title: "Glosary & Penjelasan Pengaturan Organisasi",
    description: "Panduan tab profil, branding, WhatsApp, keamanan, dan kebijakan pembiayaan.",
    entries: [
      { term: "Profil Organisasi", description: "Data identitas instansi: nama, kode, kontak, alamat, dan deskripsi." },
      { term: "Branding", description: "Logo dan hero image untuk tampilan dashboard dan landing page organisasi." },
      { term: "Floating WhatsApp", description: "Widget kontak cepat yang tampil pada halaman tenant organisasi." },
      { term: "OTP Verifikasi", description: "Validasi perubahan sensitif (mis. tipe organisasi atau mode pembiayaan)." },
      { term: "Billing Mode", description: "Pola pembiayaan centralized atau individual untuk langganan organisasi." },
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
    title: "Glosary & Penjelasan Notifikasi Organisasi",
    description: "Penjelasan target kirim notifikasi berdasarkan pegawai, OPD, dan satuan kerja.",
    entries: [
      { term: "Target Semua Pegawai", description: "Kirim ke seluruh pegawai aktif yang memiliki akun penerima notifikasi." },
      { term: "Target Pilih Pegawai", description: "Kirim terarah ke daftar pegawai tertentu melalui pencarian nama." },
      { term: "Target OPD/Satuan Kerja", description: "Kirim notifikasi berbasis struktur organisasi untuk broadcast tersegmentasi." },
      { term: "Preview Penerima Final", description: "Daftar akhir penerima valid setelah filter dan deduplikasi user." },
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
    title: "Glosary & Penjelasan Audit Log Organisasi",
    description: "Panduan membaca jejak perubahan data pada modul organisasi.",
    entries: [
      { term: "Action", description: "Jenis aksi data: tambah, ubah, atau hapus." },
      { term: "Table", description: "Nama tabel yang terdampak oleh aksi pengguna/sistem." },
      { term: "Actor", description: "Pelaku perubahan data berdasarkan user/employee terkait." },
      { term: "Timestamp", description: "Waktu kejadian log dalam zona waktu sistem organisasi." },
      { term: "Change Summary", description: "Ringkasan field penting yang berubah pada satu aksi." },
    ],
    workflowTitle: "Alur Investigasi",
    workflowSteps: [
      "Gunakan filter action + tabel untuk memperkecil data.",
      "Cari entri kritis berdasarkan waktu kejadian.",
      "Simpan hasil audit untuk kebutuhan compliance internal.",
    ],
  },
  org_invitations: {
    title: "Glosary & Penjelasan Undangan Pegawai",
    description: "Istilah penting proses onboarding pegawai menggunakan kode undangan.",
    entries: [
      { term: "Invitation Code", description: "Kode unik untuk aktivasi akun pegawai." },
      { term: "Invitation Type", description: "Jenis undangan: individual, per OPD, atau per kantor/satuan kerja." },
      { term: "Expired Invitation", description: "Undangan melewati masa berlaku dan tidak bisa dipakai lagi." },
      { term: "Verification Status", description: "Status undangan: menunggu, terverifikasi, atau ditolak." },
      { term: "Resend/Copy Link", description: "Aksi cepat untuk membagikan ulang tautan undangan ke calon pegawai." },
    ],
    workflowTitle: "Alur Onboarding",
    workflowSteps: [
      "Buat undangan sesuai tipe target.",
      "Pantau status verifikasi dan masa berlaku.",
      "Edit atau kirim ulang undangan jika diperlukan.",
    ],
  },
  org_help_center: {
    title: "Glosary & Penjelasan Pusat Bantuan",
    description: "Cara memakai FAQ, kategori bantuan, dan kanal dukungan organisasi.",
    entries: [
      { term: "FAQ Category", description: "Kelompok topik pertanyaan agar pengguna cepat menemukan jawaban." },
      { term: "Search FAQ", description: "Pencarian pertanyaan berdasarkan kata kunci pada judul/konten." },
      { term: "Support Email", description: "Kanal resmi dukungan teknis via email." },
      { term: "Support WhatsApp", description: "Kanal bantuan cepat untuk konsultasi operasional." },
      { term: "Fallback FAQ", description: "Data FAQ cadangan saat sumber utama belum tersedia." },
    ],
    workflowTitle: "Alur Bantuan",
    workflowSteps: [
      "Cari FAQ sesuai kata kunci/kategori.",
      "Jika belum terjawab, gunakan email atau WhatsApp support.",
      "Catat isu berulang untuk perbaikan dokumentasi internal.",
    ],
  },
  org_schedule_work_hours: {
    title: "Glosary & Penjelasan Jadwal Jam Kerja",
    description: "Definisi hari kerja, template jadwal, dan status aktif/nonaktif jam kerja.",
    entries: [
      { term: "Institution Type", description: "Klasifikasi instansi untuk membedakan pola jam kerja." },
      { term: "Day of Week", description: "Hari kerja yang dijadwalkan untuk absensi masuk/pulang." },
      { term: "Template Senin-Jumat", description: "Penerapan cepat jam kerja untuk hari kerja standar." },
      { term: "Template Senin-Minggu", description: "Penerapan cepat jadwal 7 hari untuk instansi shift." },
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
    title: "Glosary & Penjelasan Jadwal WFH",
    description: "Panduan aturan WFH berdasarkan scope organisasi/OPD/satuan kerja/pegawai.",
    entries: [
      { term: "Scope WFH", description: "Tingkat penerapan jadwal WFH: organisasi, OPD, unit, atau individu." },
      { term: "Recurring", description: "Jadwal berulang mingguan pada hari tertentu." },
      { term: "Specific Date", description: "Jadwal WFH pada tanggal tunggal." },
      { term: "Date Range", description: "Jadwal WFH dalam rentang tanggal tertentu." },
      { term: "Priority Scope", description: "Scope lebih spesifik umumnya mengoverride aturan yang lebih umum." },
    ],
    workflowTitle: "Alur Pengaturan WFH",
    workflowSteps: [
      "Tentukan scope dan tipe jadwal.",
      "Isi periode dan keterangan kebijakan.",
      "Aktifkan jadwal lalu monitor dampaknya di laporan.",
    ],
  },
  org_schedule_absence_limits: {
    title: "Glosary & Penjelasan Batas Absen",
    description: "Aturan ambang ketidakhadiran untuk notifikasi dan eskalasi.",
    entries: [
      { term: "Max Days", description: "Ambang jumlah hari ketidakhadiran sebelum aturan aktif." },
      { term: "Warning Type", description: "Jenis teguran/notifikasi saat ambang terlampaui." },
      { term: "Rule Active", description: "Aturan aktif akan dipakai saat proses evaluasi absensi." },
      { term: "Notification Toggle", description: "Toggle global untuk mengaktifkan/menonaktifkan notifikasi batas absen ke pegawai." },
      { term: "Notify by Rule", description: "Aksi kirim notifikasi berdasarkan aturan tertentu." },
      { term: "Rule Description", description: "Catatan kebijakan internal agar konteks aturan jelas." },
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
    title: "Glosary & Penjelasan Libur Nasional",
    description: "Sumber data libur nasional dan penggunaannya pada kalender organisasi.",
    entries: [
      { term: "Source Pull", description: "Sumber tarik data libur (utama/fallback) untuk pengisian kalender nasional." },
      { term: "Year Filter", description: "Penyaringan data libur berdasarkan tahun tertentu." },
      { term: "Active Holiday", description: "Hari libur aktif yang dipakai sebagai referensi jadwal kerja." },
      { term: "Fallback Preview", description: "Pratinjau data alternatif saat sumber utama bermasalah." },
      { term: "Sync to Calendar", description: "Proses menyalin daftar libur ke kalender kerja organisasi." },
    ],
    workflowTitle: "Alur Sinkron Libur",
    workflowSteps: [
      "Tarik data libur nasional per tahun.",
      "Validasi hasil lalu cek status aktif.",
      "Gunakan sebagai basis penjadwalan kerja/absensi.",
    ],
  },
  org_report_attendance: {
    title: "Glosary & Penjelasan Laporan Absensi",
    description: "Parameter filter dan interpretasi status pada laporan absensi harian.",
    entries: [
      { term: "Status", description: "Hasil akhir absensi (hadir, izin, cuti, sakit, tugas luar, tidak hadir)." },
      { term: "Keterangan", description: "Kondisi detail seperti telat/pulang cepat/tidak absen pulang." },
      { term: "Range Tanggal", description: "Periode data yang dipakai untuk query laporan." },
      { term: "Search NIP/Nama", description: "Pencarian cepat record pegawai tertentu." },
      { term: "Export CSV/PDF", description: "Ekspor laporan untuk arsip atau kebutuhan rapat evaluasi." },
    ],
    workflowTitle: "Alur Audit Kehadiran",
    workflowSteps: [
      "Terapkan filter tanggal dan unit organisasi.",
      "Tinjau anomali status/keterangan.",
      "Ekspor hasil untuk dokumentasi periodik.",
    ],
  },
  org_report_recap: {
    title: "Glosary & Penjelasan Rekap Bulanan",
    description: "Ringkasan agregat kehadiran bulanan per pegawai.",
    entries: [
      { term: "Rekap Bulanan", description: "Akumulasi status absensi pegawai dalam satu periode bulan-tahun." },
      { term: "RPC Rekap", description: "Sumber data agregat server-side untuk kinerja query lebih stabil." },
      { term: "Total Rows", description: "Jumlah pegawai yang masuk hasil rekap untuk filter aktif." },
      { term: "Paging", description: "Pembagian hasil agar halaman tetap ringan pada data besar." },
      { term: "Export & Print", description: "Output laporan untuk pelaporan manajemen dan arsip." },
    ],
    workflowTitle: "Alur Pelaporan Bulanan",
    workflowSteps: [
      "Pilih periode bulan/tahun dan unit.",
      "Tampilkan rekap lalu analisis indikator utama.",
      "Cetak atau ekspor untuk pelaporan resmi.",
    ],
  },
  org_report_leave: {
    title: "Glosary & Penjelasan Laporan Izin/Cuti",
    description: "Definisi jenis izin, status persetujuan, dan perhitungan durasi.",
    entries: [
      { term: "Leave Type", description: "Jenis pengajuan seperti izin, cuti tahunan, sakit, atau tugas luar." },
      { term: "Request Status", description: "Status proses: menunggu, disetujui, ditolak." },
      { term: "Duration", description: "Lama pengajuan dihitung berdasarkan rentang tanggal atau setengah hari." },
      { term: "OPD/Work Unit Filter", description: "Penyaringan laporan berdasarkan struktur organisasi." },
      { term: "Reason", description: "Alasan pengajuan yang disampaikan pegawai." },
    ],
    workflowTitle: "Alur Review Pengajuan",
    workflowSteps: [
      "Filter periode dan status pengajuan.",
      "Periksa alasan serta durasi pengajuan.",
      "Ekspor hasil untuk evaluasi kedisiplinan dan beban kerja.",
    ],
  },
  org_report_overtime: {
    title: "Glosary & Penjelasan Laporan Lembur",
    description: "Penjelasan data pengajuan lembur dan total jam kerja tambahan.",
    entries: [
      { term: "Request Number", description: "Nomor referensi unik setiap pengajuan lembur." },
      { term: "Rentang Lembur", description: "Periode tanggal lembur berdasarkan detail per hari." },
      { term: "Total Hours", description: "Akumulasi jam lembur yang diajukan." },
      { term: "Status Approval", description: "Status persetujuan pengajuan lembur." },
      { term: "Reason", description: "Alasan kebutuhan lembur yang diajukan pegawai." },
    ],
    workflowTitle: "Alur Kontrol Lembur",
    workflowSteps: [
      "Filter periode + unit kerja.",
      "Cek jam lembur dan status approval.",
      "Ekspor untuk validasi kompensasi lembur.",
    ],
  },
  org_report_flexible: {
    title: "Glosary & Penjelasan Laporan Absensi Khusus/WFH",
    description: "Gabungan laporan permohonan WFH dan absensi fleksibel.",
    entries: [
      { term: "Request Type", description: "Tipe permohonan: WFH atau absensi khusus/fleksibel." },
      { term: "Category", description: "Kategori alasan seperti dinas luar, rapat eksternal, dll." },
      { term: "Request Date", description: "Tanggal pelaksanaan permohonan." },
      { term: "Created At", description: "Waktu pengajuan dibuat oleh pegawai." },
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
    title: "Glosary & Penjelasan Laporan Mutasi",
    description: "Riwayat permintaan perubahan profil dan mutasi pegawai.",
    entries: [
      { term: "Mutation Type", description: "Jenis perubahan: perubahan profil atau perpindahan unit/OPD." },
      { term: "Current/Target OPD", description: "Perbandingan unit asal dan unit tujuan mutasi." },
      { term: "Requested Changes", description: "Data yang diajukan untuk diubah oleh pegawai." },
      { term: "Approval Status", description: "Status persetujuan mutasi dari admin organisasi." },
      { term: "Change Summary", description: "Ringkasan perubahan penting untuk audit cepat." },
    ],
    workflowTitle: "Alur Audit Mutasi",
    workflowSteps: [
      "Filter data berdasarkan tipe dan status.",
      "Validasi perpindahan unit tujuan.",
      "Ekspor riwayat untuk kebutuhan administrasi kepegawaian.",
    ],
  },
  org_landing_settings: {
    title: "Glosary & Penjelasan Landing Organisasi",
    description: "Panduan pengaturan halaman publik organisasi agar konsisten dengan branding instansi.",
    entries: [
      { term: "Landing URL", description: "Tautan halaman publik organisasi untuk calon pengguna/pelanggan." },
      { term: "Hero Content", description: "Judul, deskripsi, dan elemen visual utama di bagian atas halaman." },
      { term: "CTA (Call to Action)", description: "Tombol ajakan aksi seperti daftar, hubungi admin, atau pelajari lebih lanjut." },
      { term: "Logo & Hero Image", description: "Asset visual utama yang mempengaruhi identitas halaman publik." },
      { term: "Preview Publish", description: "Pratinjau hasil sebelum dibagikan ke publik." },
    ],
    workflowTitle: "Alur Pengaturan Landing",
    workflowSteps: [
      "Ubah konten utama dan visual branding.",
      "Cek preview lintas perangkat.",
      "Simpan lalu salin tautan landing untuk distribusi.",
    ],
  },
  org_news: {
    title: "Glosary & Penjelasan Berita/Pengumuman Organisasi",
    description: "Istilah utama untuk publikasi informasi internal organisasi.",
    entries: [
      { term: "Status Publish", description: "Menandai konten aktif/tayang atau nonaktif/arsip." },
      { term: "Kategori Konten", description: "Pengelompokan berita, artikel, dan pengumuman agar mudah difilter." },
      { term: "Pinned Content", description: "Konten prioritas yang ditampilkan lebih atas untuk visibilitas tinggi." },
      { term: "Pagination", description: "Pembagian daftar berita agar halaman tetap ringan saat data besar." },
      { term: "CRUD Konten", description: "Tambah, ubah, hapus berita langsung dari panel admin organisasi." },
    ],
    workflowTitle: "Alur Editorial Singkat",
    workflowSteps: [
      "Buat konten dengan judul dan deskripsi jelas.",
      "Aktifkan status publish setelah review.",
      "Arsipkan atau hapus konten usang secara berkala.",
    ],
  },
  org_profile: {
    title: "Glosary & Penjelasan Profil Admin Organisasi",
    description: "Data akun admin organisasi untuk keamanan dan pemulihan akses.",
    entries: [
      { term: "Display Name", description: "Nama tampilan admin organisasi pada sistem." },
      { term: "Email Akun", description: "Email login utama untuk autentikasi." },
      { term: "Kontak Pemulihan", description: "No HP/WhatsApp untuk validasi lupa password." },
      { term: "Ubah Password", description: "Fitur penggantian password dengan validasi keamanan." },
      { term: "Tenant Context", description: "Keterkaitan akun dengan organisasi/tenant tertentu." },
    ],
    workflowTitle: "Checklist Keamanan Akun",
    workflowSteps: [
      "Pastikan kontak pemulihan terisi benar.",
      "Ganti password secara berkala.",
      "Verifikasi profil setelah perubahan data sensitif.",
    ],
  },
  org_profile_setup: {
    title: "Glosary & Penjelasan Setup Profil Organisasi",
    description: "Tahap inisialisasi data wajib organisasi setelah aktivasi akun admin.",
    entries: [
      { term: "PIC Name", description: "Nama penanggung jawab utama organisasi." },
      { term: "PIC WhatsApp", description: "Kontak WhatsApp resmi untuk komunikasi operasional." },
      { term: "Alamat Organisasi", description: "Alamat lengkap instansi sebagai data administratif." },
      { term: "NPWP", description: "Nomor pajak organisasi untuk kebutuhan legal/billing." },
      { term: "Logo Setup", description: "Upload logo awal agar identitas organisasi langsung terbentuk." },
    ],
    workflowTitle: "Alur Setup Awal",
    workflowSteps: [
      "Isi data PIC dan kontak organisasi.",
      "Lengkapi alamat serta NPWP jika tersedia.",
      "Simpan untuk melanjutkan onboarding organisasi.",
    ],
  },
  org_onboarding_setup: {
    title: "Glosary & Penjelasan Setup Awal Org",
    description:
      "Wizard onboarding untuk member baru /org agar master data, jadwal, dan konten awal siap sebelum operasional harian.",
    entries: [
      { term: "Checklist Modul", description: "Menampilkan status siap/belum siap berdasarkan jumlah data per modul inti." },
      { term: "Terapkan Template Admin", description: "Mengisi modul kosong dari template global yang ditetapkan superadmin." },
      { term: "No Overwrite Rule", description: "Jika modul sudah berisi data, wizard akan skip agar konfigurasi existing tetap aman." },
      { term: "Setup Completion", description: "Indikator progres jumlah modul yang sudah terisi data." },
      { term: "Module Deep Link", description: "Tombol buka modul untuk lanjut melengkapi data real (OPD, lokasi, jam kerja, dll)." },
    ],
    workflowTitle: "Alur Onboarding Tenant",
    workflowSteps: [
      "Buka /org/onboarding setelah akun admin organisasi aktif.",
      "Jalankan Terapkan Template Admin untuk isi data awal yang kosong.",
      "Lanjutkan validasi dan penyempurnaan data real di tiap modul.",
    ],
  },
  org_employee_management: {
    title: "Glosary & Penjelasan Manajemen Pegawai",
    description: "Istilah inti untuk pengelolaan pegawai aktif/nonaktif di organisasi.",
    entries: [
      { term: "Pegawai Aktif", description: "Pegawai yang masih memiliki akses operasional sistem." },
      { term: "Pegawai Nonaktif", description: "Pegawai yang dinonaktifkan namun datanya tetap tersimpan." },
      { term: "Aktivasi Ulang", description: "Proses mengembalikan status pegawai nonaktif menjadi aktif." },
      { term: "Device Binding", description: "Keterikatan akun pegawai dengan perangkat untuk keamanan absensi." },
      { term: "Filter OPD/Unit", description: "Penyaringan daftar pegawai berdasarkan struktur organisasi." },
    ],
    workflowTitle: "Alur Kelola Pegawai",
    workflowSteps: [
      "Kelola data pegawai aktif dan status akun.",
      "Review pegawai nonaktif sebelum reaktivasi.",
      "Audit perubahan status untuk mencegah akses tidak sah.",
    ],
  },
  org_mutation_requests: {
    title: "Glosary & Penjelasan Permintaan Mutasi",
    description: "Panduan review permintaan mutasi/perubahan profil pegawai.",
    entries: [
      { term: "Mutation Request", description: "Pengajuan perubahan data atau perpindahan unit pegawai." },
      { term: "Approval Flow", description: "Alur persetujuan: menunggu, disetujui, atau ditolak." },
      { term: "Rejection Reason", description: "Alasan wajib saat menolak pengajuan mutasi." },
      { term: "Before/After Data", description: "Perbandingan data lama dan data usulan perubahan." },
      { term: "Admin Mutation Form", description: "Form mutasi manual yang dapat dibuat langsung oleh admin." },
    ],
    workflowTitle: "Alur Persetujuan Mutasi",
    workflowSteps: [
      "Buka detail pengajuan dan validasi usulan.",
      "Setujui atau tolak dengan catatan yang jelas.",
      "Pantau riwayat mutasi agar konsisten dengan data master.",
    ],
  },
  org_leave_requests: {
    title: "Glosary & Penjelasan Permohonan Kehadiran",
    description: "Modul permohonan mencakup cuti/izin, WFH, lembur, sakit, dinas, dan absensi khusus.",
    entries: [
      { term: "Request Queue", description: "Antrian pengajuan yang menunggu aksi admin organisasi." },
      { term: "Approval Status", description: "Status proses pengajuan untuk setiap pegawai." },
      { term: "Request Type", description: "Jenis pengajuan: cuti/izin, WFH, lembur, dinas, dsb." },
      { term: "Rejection Notes", description: "Catatan penolakan untuk transparansi keputusan." },
      { term: "Operational Export", description: "Ekspor daftar pengajuan untuk arsip dan evaluasi periodik." },
    ],
    workflowTitle: "Alur Operasional Permohonan",
    workflowSteps: [
      "Filter pengajuan berdasarkan tipe dan status.",
      "Proses approval/rejection secara konsisten.",
      "Gunakan ekspor laporan untuk audit dan evaluasi kebijakan.",
    ],
  },
  org_master_data: {
    title: "Glosary & Penjelasan Master Data Organisasi",
    description: "Data referensi inti organisasi: OPD, unit kerja, jabatan, lokasi, admin OPD, dan import pegawai.",
    entries: [
      { term: "Master Reference", description: "Data acuan yang dipakai modul absensi, pengajuan, dan pelaporan." },
      { term: "Kode Unik", description: "Identifier penting (code) untuk sinkronisasi lintas modul." },
      { term: "Status Aktif", description: "Menandai entitas master masih berlaku atau tidak." },
      { term: "Import Pegawai", description: "Proses ingest data massal pegawai dari berkas terstruktur." },
      { term: "Data Integrity", description: "Konsistensi relasi antar master (OPD-unit-jabatan-lokasi)." },
    ],
    workflowTitle: "Alur Pemeliharaan Master Data",
    workflowSteps: [
      "Perbarui master data sebelum update data pegawai.",
      "Pastikan kode unik tidak duplikat.",
      "Lakukan audit berkala untuk menjaga integritas relasi.",
    ],
  },
  org_schedule_work_holidays: {
    title: "Glosary & Penjelasan Libur Kerja Organisasi",
    description: "Pengaturan hari libur kerja internal yang dapat berbeda per jenis instansi.",
    entries: [
      { term: "Institution Scope", description: "Penerapan hari libur berdasarkan tipe instansi." },
      { term: "Month/Year Rule", description: "Aturan hari libur per bulan dan tahun." },
      { term: "Holiday Dates", description: "Daftar tanggal non-kerja dalam bulan tertentu." },
      { term: "Copy Month", description: "Duplikasi pola libur untuk mempercepat setup bulan berikutnya." },
      { term: "Description", description: "Catatan kebijakan libur kerja internal organisasi." },
    ],
    workflowTitle: "Alur Pengaturan Libur Kerja",
    workflowSteps: [
      "Tentukan scope instansi dan periode.",
      "Isi tanggal libur dan deskripsi kebijakan.",
      "Review dampak ke jadwal absensi sebelum disimpan.",
    ],
  },
  org_schedule_overtime_settings: {
    title: "Glosary & Penjelasan Pengaturan Lembur",
    description: "Aturan dasar pengajuan dan perhitungan lembur pada organisasi.",
    entries: [
      { term: "Minimum Duration", description: "Durasi minimum lembur agar pengajuan valid." },
      { term: "Rate Multiplier", description: "Pengali perhitungan lembur untuk hari kerja/libur." },
      { term: "Requires Approval", description: "Menentukan apakah semua lembur wajib persetujuan admin." },
      { term: "Multi-Date Request", description: "Izin pengajuan lembur dalam beberapa tanggal sekaligus." },
      { term: "Auto-Reject", description: "Batas waktu otomatis penolakan jika pengajuan tidak diproses." },
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
