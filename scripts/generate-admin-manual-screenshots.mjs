import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const BASE_URL = "http://127.0.0.1:5173";
const SHOT_DIR = path.join(ROOT, "public", "manuals", "screenshots");
const HR_DIR = path.join(SHOT_DIR, "hr");
const PAYROLL_DIR = path.join(SHOT_DIR, "payroll");
const CREDS_PATH = path.join(ROOT, "ops", "test-accounts.local.json");

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const HR_PAGES = [
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

const PAYROLL_PAGES = [
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

const readCreds = () => {
  const raw = fs.readFileSync(CREDS_PATH, "utf8");
  const json = JSON.parse(raw);
  const account = json.org_admin_centralized;
  if (!account?.email || !account?.password) {
    throw new Error("Kredensial org_admin_centralized tidak tersedia.");
  }
  return account;
};

const waitForAppReady = async (page) => {
  await page.waitForTimeout(1200);
};

const login = async (page, { email, password }) => {
  await page.goto(`${BASE_URL}/org/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const captchaInput = page.getByLabel("Masukkan kode captcha");
  if (await captchaInput.isVisible().catch(() => false)) {
    const captchaText = await page.locator("div.font-mono.text-xl").textContent();
    const cleaned = (captchaText || "").replace(/\\s+/g, "").trim();
    if (cleaned.length > 0) {
      await captchaInput.fill(cleaned);
    }
  }
  await page.getByRole("button", { name: /Masuk|Login/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/org"), { timeout: 20000 });
  await waitForAppReady(page);
};

const capturePages = async (page, pages, outDir, prefix) => {
  let index = 1;
  for (const item of pages) {
    const slug = slugify(`${prefix}-${item.section}-${item.title}`);
    const fileName = `${String(index).padStart(2, "0")}-${slug}.png`;
    const target = path.join(outDir, fileName);

    await page.goto(`${BASE_URL}${item.path}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await page.screenshot({ path: target, fullPage: true });
    index += 1;
  }
};

const main = async () => {
  ensureDir(HR_DIR);
  ensureDir(PAYROLL_DIR);

  const creds = readCreds();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await login(page, creds);
  await capturePages(page, HR_PAGES, HR_DIR, "hr");
  await capturePages(page, PAYROLL_PAGES, PAYROLL_DIR, "payroll");

  await browser.close();
  console.log("Screenshots generated for HR and Payroll manuals.");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
