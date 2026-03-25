import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, "docs");
const SHOT_BASE = "../public/manuals/screenshots";

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const hrPages = [
  { section: "Beranda", title: "Ringkasan HR", path: "/org/hr" },
  { section: "Organisasi", title: "Struktur Organisasi", path: "/org/hr/structure" },
  { section: "Organisasi", title: "Jabatan dan Grade", path: "/org/hr/position-grade" },
  { section: "Pegawai", title: "Data Pegawai", path: "/org/hr/employees" },
  { section: "Pegawai", title: "Status Kepegawaian", path: "/org/hr/employee-status" },
  { section: "Pegawai", title: "Riwayat Jabatan", path: "/org/hr/job-history" },
  { section: "Pegawai", title: "Persetujuan Mutasi", path: "/org/hr/mutation-approval" },
  { section: "Pegawai", title: "Kontrak Kerja", path: "/org/hr/contracts" },
  { section: "Administrasi HR", title: "Dokumen HR", path: "/org/hr/documents" },
  { section: "Administrasi HR", title: "Templat Dokumen", path: "/org/hr/document-templates" },
  { section: "Administrasi HR", title: "Jenis Cuti", path: "/org/hr/leave-types" },
  { section: "Administrasi HR", title: "Kuota Cuti", path: "/org/hr/leave-quota" },
  { section: "Administrasi HR", title: "Pengaturan HR", path: "/org/hr/settings" },
  { section: "Administrasi HR", title: "Hierarki Persetujuan", path: "/org/hr/approval-hierarchy" },
  { section: "Operasional", title: "Proses Masuk Pegawai", path: "/org/hr/onboarding" },
  { section: "Operasional", title: "Proses Keluar Pegawai", path: "/org/hr/offboarding" },
  { section: "Operasional", title: "Pengaturan Keterlambatan", path: "/org/hr/late-settings" },
  { section: "Operasional", title: "Laporan HR", path: "/org/hr/reports" },
  { section: "Operasional", title: "Analitik Kehadiran HR", path: "/org/hr/attendance-insights" },
  { section: "Kinerja", title: "KPI", path: "/org/hr/kpi" },
  { section: "Kinerja", title: "Periode Penilaian", path: "/org/hr/performance-periods" },
  { section: "Kinerja", title: "Form Penilaian", path: "/org/hr/performance-forms" },
  { section: "Kinerja", title: "Ulasan 360", path: "/org/hr/review-360" },
  { section: "Kinerja", title: "Hasil Evaluasi", path: "/org/hr/evaluation-results" },
  { section: "Pengembangan", title: "Data Pelatihan", path: "/org/hr/training-data" },
  { section: "Pengembangan", title: "Sertifikasi", path: "/org/hr/certifications" },
  { section: "Pengembangan", title: "Matriks Kompetensi", path: "/org/hr/skill-matrix" },
  { section: "Rekrutmen", title: "Lowongan Kerja", path: "/org/hr/recruitment/jobs" },
  { section: "Rekrutmen", title: "Kandidat", path: "/org/hr/recruitment/candidates" },
  { section: "Rekrutmen", title: "Tahap Interview", path: "/org/hr/recruitment/interviews" },
  { section: "Rekrutmen", title: "Penawaran Kerja", path: "/org/hr/recruitment/offers" },
  { section: "ESS", title: "Pengajuan Saya", path: "/org/hr/ess/requests" },
  { section: "ESS", title: "Cuti dan Izin Saya", path: "/org/hr/ess/leave-requests" },
  { section: "ESS", title: "WFH Pegawai", path: "/org/hr/ess/wfh-requests" },
  { section: "ESS", title: "Absensi Khusus", path: "/org/hr/ess/flexible-attendance" },
  { section: "ESS", title: "Lembur Pegawai", path: "/org/hr/ess/overtime-requests" },
  { section: "ESS", title: "Kehadiran Saya", path: "/org/hr/ess/attendance" },
  { section: "ESS", title: "Dokumen Saya", path: "/org/hr/ess/documents" },
  { section: "ESS", title: "Profil Saya", path: "/org/hr/ess/profile" },
  { section: "Bantuan", title: "FAQ HR", path: "/org/hr/help/faq" },
  { section: "Bantuan", title: "Tiket HR", path: "/org/hr/help/tickets" },
  { section: "Bantuan", title: "Log Error HR", path: "/org/hr/help/error-logs" },
];

const payrollPages = [
  { section: "Inti", title: "Beranda Payroll", path: "/org/payroll" },
  { section: "Referensi", title: "Data Pegawai Payroll", path: "/org/payroll/employees" },
  { section: "Referensi", title: "Struktur Organisasi dan Grade", path: "/org/payroll/org-grade" },
  { section: "Lanjutan", title: "Komponen Penghasilan", path: "/org/payroll/income-components" },
  { section: "Lanjutan", title: "Komponen Potongan", path: "/org/payroll/deduction-components" },
  { section: "Inti", title: "Kebijakan Payroll", path: "/org/payroll/policies" },
  { section: "Inti", title: "Periode Payroll", path: "/org/payroll/periods" },
  { section: "Inti", title: "Input Variabel", path: "/org/payroll/variable-input" },
  { section: "Inti", title: "Validasi Payroll", path: "/org/payroll/validation" },
  { section: "Inti", title: "Proses Payroll", path: "/org/payroll/run-engine" },
  { section: "Inti", title: "Persetujuan Payroll", path: "/org/payroll/approval" },
  { section: "Lanjutan", title: "Slip Gaji", path: "/org/payroll/slips" },
  { section: "Lanjutan", title: "Pembayaran Payroll", path: "/org/payroll/payment" },
  { section: "Lanjutan", title: "Pajak dan Kepatuhan", path: "/org/payroll/tax-compliance" },
  { section: "Inti", title: "Laporan Payroll", path: "/org/payroll/reports" },
  { section: "Lanjutan", title: "Log Audit Payroll", path: "/org/payroll/audit-log" },
  { section: "Pengaturan", title: "Hak Akses Payroll", path: "/org/payroll/roles" },
  { section: "Pengaturan", title: "Integrasi Payroll", path: "/org/payroll/integrations" },
  { section: "Pengaturan", title: "Bantuan Payroll", path: "/org/payroll/help" },
];

const renderMdSection = (item, index, type) => {
  const prefix = type === "hr" ? "hr" : "payroll";
  const file = `${String(index).padStart(2, "0")}-${slugify(`${prefix}-${item.section}-${item.title}`)}.png`;
  const imgPath = `${SHOT_BASE}/${type}/${file}`;
  return `### ${index}. ${item.title}\n\n` +
    `![${item.title}](${imgPath})\n\n` +
    `**Tujuan:** memahami proses pada modul **${item.title}**.\n\n` +
    `**Langkah admin:**\n` +
    `- Buka menu **${item.title}** melalui sidebar ${type === "hr" ? "HR" : "Payroll"}.\n` +
    `- Pastikan data inti tampil dan gunakan **pencarian/filter** jika tersedia.\n` +
    `- Lakukan verifikasi cepat pada status, ringkasan, dan aksi utama di halaman ini.\n\n`;
};

const renderGlossary = (items) =>
  items.map((item) => `- **${item.term}**: ${item.desc}`).join("\n");

const hrGlossary = [
  { term: "OPD", desc: "Unit organisasi pemerintahan di bawah instansi." },
  { term: "Work Unit", desc: "Unit kerja di bawah OPD yang menaungi pegawai." },
  { term: "Jabatan", desc: "Posisi struktural/fungsional pegawai." },
  { term: "Grade", desc: "Level atau tingkat jabatan/kompensasi." },
  { term: "Kontrak Kerja", desc: "Dokumen hubungan kerja pegawai." },
  { term: "Cuti", desc: "Hak izin tidak masuk kerja dalam periode tertentu." },
  { term: "ESS", desc: "Employee Self Service, pengajuan mandiri pegawai." },
  { term: "KPI", desc: "Indikator kinerja utama." },
  { term: "Ulasan 360", desc: "Penilaian dari atasan, rekan, dan bawahan." },
  { term: "Onboarding", desc: "Proses masuk pegawai baru." },
  { term: "Offboarding", desc: "Proses keluar pegawai." },
  { term: "Log Error", desc: "Catatan error untuk investigasi." },
];

const payrollGlossary = [
  { term: "Periode Payroll", desc: "Rentang waktu penggajian tertentu." },
  { term: "Kebijakan Payroll", desc: "Aturan utama perhitungan gaji." },
  { term: "Input Variabel", desc: "Komponen gaji bersifat variabel (lembur, bonus, dll)." },
  { term: "Validasi Payroll", desc: "Pengecekan kelengkapan data sebelum run." },
  { term: "Run Payroll", desc: "Eksekusi perhitungan payroll." },
  { term: "Approval Payroll", desc: "Persetujuan hasil run payroll." },
  { term: "Slip Gaji", desc: "Dokumen rincian gaji per pegawai." },
  { term: "Pembayaran Payroll", desc: "Proses pembayaran gaji." },
  { term: "Pajak & Kepatuhan", desc: "Pelaporan pajak dan compliance." },
  { term: "Audit Log", desc: "Jejak aktivitas payroll." },
];

const renderManual = ({
  title,
  fileBase,
  type,
  pages,
  glossary,
}) => {
  const sections = pages.map((item, index) => renderMdSection(item, index + 1, type)).join("\n");
  const md = `# ${title}\n\nTanggal: 16 Maret 2026\n\n## Tujuan\n- Panduan operasional admin untuk modul ${type.toUpperCase()} lengkap dengan gambar dan langkah kerja.\n\n## Prasyarat\n- Login sebagai admin organisasi (Kab. Maluku Tengah).\n- Akses menu ${type.toUpperCase()} aktif di sidebar.\n\n## Daftar Modul & Langkah\n\n${sections}\n## Glosarium\n${renderGlossary(glossary)}\n`;

  const htmlSections = pages
    .map((item, index) => {
      const prefix = type === "hr" ? "hr" : "payroll";
      const file = `${String(index + 1).padStart(2, "0")}-${slugify(`${prefix}-${item.section}-${item.title}`)}.png`;
      const imgPath = `../public/manuals/screenshots/${type}/${file}`;
      return `
      <div class="module">
        <h3>${index + 1}. ${item.title}</h3>
        <img src="${imgPath}" alt="${item.title}" />
        <p><strong>Tujuan:</strong> memahami proses pada modul <strong>${item.title}</strong>.</p>
        <ul>
          <li>Buka menu <strong>${item.title}</strong> melalui sidebar ${type === "hr" ? "HR" : "Payroll"}.</li>
          <li>Pastikan data inti tampil dan gunakan <strong>pencarian/filter</strong> jika tersedia.</li>
          <li>Lakukan verifikasi cepat pada status, ringkasan, dan aksi utama di halaman ini.</li>
        </ul>
      </div>`;
    })
    .join("\n");

  const glossaryHtml = glossary
    .map((item) => `<li><strong>${item.term}</strong>: ${item.desc}</li>`)
    .join("\n");

  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Times New Roman", Times, serif; line-height: 1.5; margin: 40px; color: #111; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    h2 { font-size: 16px; margin-top: 22px; }
    h3 { font-size: 14px; margin-top: 16px; }
    p { margin: 0 0 10px; }
    ul { padding-left: 18px; margin: 6px 0 12px; }
    img { width: 100%; border: 1px solid #ddd; margin: 8px 0 12px; }
    .module { margin-bottom: 18px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>Terakhir diperbarui: 16 Maret 2026</p>

  <h2>Tujuan</h2>
  <ul>
    <li>Panduan operasional admin untuk modul ${type.toUpperCase()} lengkap dengan gambar dan langkah kerja.</li>
  </ul>

  <h2>Prasyarat</h2>
  <ul>
    <li>Login sebagai admin organisasi (Kab. Maluku Tengah).</li>
    <li>Akses menu ${type.toUpperCase()} aktif di sidebar.</li>
  </ul>

  <h2>Daftar Modul & Langkah</h2>
  ${htmlSections}

  <h2>Glosarium</h2>
  <ul>
    ${glossaryHtml}
  </ul>
</body>
</html>`;

  fs.writeFileSync(path.join(DOCS_DIR, `${fileBase}.md`), md, "utf8");
  fs.writeFileSync(path.join(DOCS_DIR, `${fileBase}.html`), html, "utf8");
};

renderManual({
  title: "Manual Operasional HR Admin - Kab. Maluku Tengah",
  fileBase: "manual-hr-admin-kab-maluku-tengah-2026-03-16",
  type: "hr",
  pages: hrPages,
  glossary: hrGlossary,
});

renderManual({
  title: "Manual Operasional Payroll Admin - Kab. Maluku Tengah",
  fileBase: "manual-payroll-admin-kab-maluku-tengah-2026-03-16",
  type: "payroll",
  pages: payrollPages,
  glossary: payrollGlossary,
});

console.log("Admin manuals generated (MD + HTML)." );
