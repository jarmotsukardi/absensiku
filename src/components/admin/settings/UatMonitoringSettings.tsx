import { useDeferredValue, useEffect, useMemo, useState } from "react";
import checklistSource from "../../../../docs/checklist-uji-aplikasi.md?raw";
import {
  parseUatChecklist,
  isDeviceOnlyStatus,
  isRetestStatus,
  isUntestedStatus,
  type UatChecklistItem,
} from "@/lib/uatChecklist";
import {
  appendUatExecutionLogEntry,
  fetchRuntimeUatChecklist,
  fetchUatExecutionLogbook,
  fetchUatExecutionLogbookFilterOptions,
  fetchUatExecutionLogbookPage,
  saveRuntimeUatChecklist,
  type UatExecutionLogEntry,
} from "@/lib/uatChecklistSettings";
import {
  UAT_DOMAIN_DEFAULT_MARKDOWN,
  UAT_DOMAIN_LABELS,
  UAT_DOMAIN_SUBDOMAIN_SUGGESTIONS,
  type UatDomain,
} from "@/lib/uatChecklistDomains";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { cn } from "@/lib/utils";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  CircleDashed,
  Download,
  FileCheck2,
  Loader2,
  RefreshCcw,
  Save,
  Smartphone,
  TriangleAlert,
} from "lucide-react";

const REQUEST_TIMEOUT_MS = 12000;
const LOGBOOK_PAGE_SIZE = 5;
const UAT_DOMAINS: UatDomain[] = ["absensi", "hr", "payroll"];
const UAT_DOMAIN_QUERY_PARAM = "domain";

const isUatDomain = (value: string | null): value is UatDomain =>
  value === "absensi" || value === "hr" || value === "payroll";

const getDefaultMarkdownForDomain = (domain: UatDomain) =>
  domain === "absensi" ? checklistSource : UAT_DOMAIN_DEFAULT_MARKDOWN[domain];

const createInitialLogbookForm = (domain: UatDomain) => ({
  tanggal: new Date().toISOString().slice(0, 10),
  releaseVersion: "",
  update: "",
  tester: "",
  reviewer: "",
  approver: "",
  workflowStatus: "diuji" as UatExecutionLogEntry["workflowStatus"],
  subdomain: "",
  areaDiuji: "",
  ringkasanHasil: "",
  referensi: "",
  status: "lolos" as UatExecutionLogEntry["status"],
  domain,
});

const getStatusBadgeVariant = (status: string): "success" | "warning" | "secondary" => {
  if (isUntestedStatus(status) || isRetestStatus(status)) {
    return "warning";
  }

  if (isDeviceOnlyStatus(status)) {
    return "secondary";
  }

  return "success";
};

const getStatusShortLabel = (status: string) => {
  if (isRetestStatus(status)) return "Perlu retest";
  if (isUntestedStatus(status)) return "Belum diuji";
  if (isDeviceOnlyStatus(status)) return "Device nyata";
  return "Lolos";
};

const getExecutionStatusLabel = (status: UatExecutionLogEntry["status"]) =>
  status === "lolos" ? "Lolos" : "Perlu tindak lanjut";

const getExecutionStatusVariant = (status: UatExecutionLogEntry["status"]): "success" | "warning" =>
  status === "lolos" ? "success" : "warning";

const getWorkflowStatusLabel = (status: UatExecutionLogEntry["workflowStatus"]) => {
  switch (status) {
    case "draft":
      return "Draft";
    case "diuji":
      return "Diuji";
    case "sign_off":
      return "Sign-off";
    case "closed":
      return "Closed";
    default:
      return status;
  }
};

const getWorkflowStatusVariant = (
  status: UatExecutionLogEntry["workflowStatus"],
): "outline" | "secondary" | "info" | "success" => {
  switch (status) {
    case "draft":
      return "outline";
    case "diuji":
      return "secondary";
    case "sign_off":
      return "info";
    case "closed":
      return "success";
    default:
      return "outline";
  }
};

const calculatePriorityCoverage = (items: UatChecklistItem[], priority: string) => {
  const filteredItems = items.filter((item) => (item.priority ?? "").toUpperCase() === priority.toUpperCase());
  const passed = filteredItems.filter((item) => item.isPassed).length;
  const total = filteredItems.length;

  return {
    total,
    passed,
    percent: total > 0 ? Math.round((passed / total) * 100) : 100,
  };
};

const validateRingkasanHasil = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "Ringkasan hasil wajib diisi.";
  }

  const hasScorePattern = /\b\d+\s*\/\s*\d+\s*(lulus|lolos)\b/i.test(value);
  const hasReadyPattern = /\bsiap\b/i.test(value);
  if (!hasScorePattern && !hasReadyPattern) {
    return "Gunakan format seperti `15/15 lulus`, `8/10 lolos`, atau frasa yang mengandung `siap`.";
  }

  return null;
};

const validateReferensi = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return "Referensi bukti wajib diisi.";
  }

  const hasReferenceHint =
    normalized.includes("docs/") ||
    normalized.includes("http://") ||
    normalized.includes("https://") ||
    normalized.includes(".md") ||
    normalized.includes(".pdf") ||
    normalized.toLowerCase().includes("sign-off") ||
    normalized.toLowerCase().includes("go-no-go") ||
    normalized.toLowerCase().includes("uat-");

  if (!hasReferenceHint) {
    return "Referensi harus mengarah ke dokumen/bukti, misalnya path `docs/...`, link, `sign-off`, atau file UAT.";
  }

  return null;
};

const escapeCsvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

const downloadCsvFile = (filename: string, rows: string[][]) => {
  const csvContent = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const UAT_SUMMARY_GLOSSARY = [
  {
    term: "Gate Rilis",
    description: "Status ringkas apakah domain aktif sudah layak maju ke rilis. Nilainya siap jika P0 sudah 100%, P1 minimal 80%, dan batch terakhir minimal sign-off.",
  },
  {
    term: "Total Lolos",
    description: "Jumlah item checklist dengan status lolos penuh. Angka ini mewakili skenario yang sudah diuji dan dinyatakan bersih.",
  },
  {
    term: "Belum Lolos",
    description: "Total item yang masih tertahan. Ini gabungan dari item belum diuji, perlu retest, dan yang masih menunggu validasi device nyata.",
  },
  {
    term: "Belum Diuji",
    description: "Item yang belum masuk eksekusi verifikasi. Biasanya ini backlog testing yang masih harus dijalankan.",
  },
  {
    term: "Perlu Retest",
    description: "Item yang sudah pernah diuji tetapi hasilnya belum bersih, sehingga perlu diuji ulang setelah perbaikan atau klarifikasi.",
  },
  {
    term: "Coverage P0 / P1",
    description: "Persentase kelulusan item prioritas tinggi. P0 dipakai untuk fungsi paling kritikal, sedangkan P1 untuk fungsi penting pendukung rilis.",
  },
  {
    term: "Khusus Device Nyata",
    description: "Jumlah item yang tidak cukup diverifikasi di browser atau simulator dan masih harus dibuktikan di perangkat nyata.",
  },
] as const;

const UAT_ACTION_GLOSSARY = [
  {
    term: "Tab Absensi / HR / Payroll",
    description: "Pemecahan domain UAT agar scope pengujian tidak bercampur. Semua kartu, logbook, dan checklist mengikuti domain yang sedang aktif.",
  },
  {
    term: "Sudah UAT",
    description: "Mode tampilan yang hanya menampilkan item yang sudah lolos UAT pada domain aktif.",
  },
  {
    term: "Perlu UAT",
    description: "Mode tampilan yang memfokuskan daftar item yang masih butuh aksi: belum diuji, perlu retest, atau validasi device nyata.",
  },
  {
    term: "Lihat Semua",
    description: "Mode gabungan untuk menampilkan daftar lolos dan belum lolos dalam satu area halaman.",
  },
  {
    term: "Batch UAT Terakhir",
    description: "Ringkasan batch terbaru untuk domain aktif. Data diprioritaskan dari logbook permanen, lalu fallback ke log yang ada di checklist.",
  },
  {
    term: "Progres Domain",
    description: "Ringkasan pass rate keseluruhan dan breakdown per seksi agar bottleneck UAT cepat terlihat.",
  },
] as const;

const UAT_LOGBOOK_GLOSSARY = [
  {
    term: "Riwayat Logbook UAT",
    description: "Jejak permanen append-only untuk setiap batch uji yang pernah dijalankan. Dipakai sebagai audit trail dan dasar evaluasi kesiapan rilis.",
  },
  {
    term: "Hasil Batch",
    description: "Kesimpulan eksekusi satu batch, misalnya lolos atau perlu tindak lanjut. Ini bukan status per item, tetapi status batch uji.",
  },
  {
    term: "Workflow UAT",
    description: "Tahap administrasi batch: draft, diuji, sign-off, lalu closed. Ini membantu membedakan batch yang baru dicatat dengan batch yang sudah resmi disetujui.",
  },
  {
    term: "Release / Versi",
    description: "Penanda build atau kandidat rilis yang sedang diuji agar riwayat UAT tidak bercampur antar release.",
  },
  {
    term: "PIC Tester / Reviewer / Approver",
    description: "Peran yang menjalankan tes, meninjau hasil, dan menyetujui batch. Kolom ini dipakai untuk akuntabilitas dan jejak keputusan.",
  },
  {
    term: "Subdomain UAT",
    description: "Kelompok area modul yang diuji dalam satu batch, misalnya check-in, approval, cuti, atau slip gaji.",
  },
  {
    term: "Area Diuji",
    description: "Flow riil yang benar-benar dijalankan dalam batch tersebut, misalnya CRUD, approval, export, guard route, atau error handling.",
  },
  {
    term: "Ringkasan Hasil",
    description: "Kesimpulan singkat hasil uji, misalnya `15/15 lulus` atau `siap dengan catatan`, agar keputusan batch cepat dibaca.",
  },
  {
    term: "Referensi Bukti",
    description: "Path dokumen, link, sign-off, go/no-go, screenshot, atau artefak lain yang bisa dipakai untuk membuktikan eksekusi UAT.",
  },
  {
    term: "Export CSV",
    description: "Fungsi ekspor seluruh logbook domain aktif ke file CSV untuk audit, laporan, atau handover ke tim lain.",
  },
] as const;

const UAT_CHECKLIST_GLOSSARY = [
  {
    term: "Sumber Runtime Checklist",
    description: "Editor markdown yang mengontrol baseline checklist UAT saat runtime. Perubahan di sini akan mengubah monitoring domain aktif tanpa perlu rebuild.",
  },
  {
    term: "Preview dari Editor",
    description: "Menguji hasil parse markdown sebelum disimpan, agar admin bisa memeriksa struktur checklist lebih dulu.",
  },
  {
    term: "Simpan ke Supabase",
    description: "Menyimpan override checklist runtime ke Supabase untuk domain aktif.",
  },
  {
    term: "Isi dari Dokumen Bawaan",
    description: "Mengembalikan isi editor ke baseline markdown default yang dibawa aplikasi.",
  },
  {
    term: "Daftar Status UAT",
    description: "Panel status yang memecah item checklist menjadi daftar sudah UAT dan perlu UAT agar tim bisa fokus sesuai prioritas aksi.",
  },
  {
    term: "Breakdown Checklist per Seksi",
    description: "Tampilan per seksi checklist untuk melihat bagian mana yang paling tertahan dan item mana yang masih pending.",
  },
  {
    term: "Prioritas P0 / P1",
    description: "Label penting untuk menandai dampak item terhadap gate rilis. P0 berarti kritikal, P1 berarti penting namun di bawah P0.",
  },
  {
    term: "Reminder UAT",
    description: "Peringatan ketika checklist lebih baru daripada logbook atau belum ada batch yang dicatat, sehingga domain aktif berisiko belum tervalidasi sepenuhnya.",
  },
] as const;

const renderItemRow = (item: UatChecklistItem, tone: "success" | "pending") => (
  <TableRow key={item.id} className={tone === "success" ? "bg-emerald-50/30" : undefined}>
    <TableCell className="align-top">
      <div className="space-y-1">
        <p className="font-medium text-slate-900">{item.title}</p>
        <p className="text-xs text-slate-500">{item.sectionTitle}</p>
      </div>
    </TableCell>
    <TableCell className="align-top">
      <Badge variant={getStatusBadgeVariant(item.status)}>{getStatusShortLabel(item.status)}</Badge>
    </TableCell>
    <TableCell className="align-top text-xs text-slate-600">{item.status}</TableCell>
    <TableCell className="align-top text-xs text-slate-600">{item.priority ?? "-"}</TableCell>
  </TableRow>
);

interface UatMonitoringSettingsProps {
  lockedDomain?: UatDomain;
}

export function UatMonitoringSettings({ lockedDomain }: UatMonitoringSettingsProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const availableDomains = lockedDomain ? [lockedDomain] : UAT_DOMAINS;
  const isDomainLocked = Boolean(lockedDomain);
  const [activeDomain, setActiveDomain] = useState<UatDomain>(() => {
    if (lockedDomain) {
      return lockedDomain;
    }
    const requestedDomain = searchParams.get(UAT_DOMAIN_QUERY_PARAM);
    return isUatDomain(requestedDomain) ? requestedDomain : "absensi";
  });
  const [checklistView, setChecklistView] = useState<"all" | "passed" | "pending">("all");
  const [runtimeMarkdown, setRuntimeMarkdown] = useState(getDefaultMarkdownForDomain("absensi"));
  const [editorMarkdown, setEditorMarkdown] = useState(getDefaultMarkdownForDomain("absensi"));
  const [runtimeUpdatedAt, setRuntimeUpdatedAt] = useState<string | null>(null);
  const [runtimeSourceLabel, setRuntimeSourceLabel] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [isFetchingLogbook, setIsFetchingLogbook] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingLogbook, setIsSavingLogbook] = useState(false);
  const [isExportingLogbook, setIsExportingLogbook] = useState(false);
  const [isPreviewingEditor, setIsPreviewingEditor] = useState(false);
  const [executionLogbook, setExecutionLogbook] = useState<UatExecutionLogEntry[]>([]);
  const [latestExecutionEntry, setLatestExecutionEntry] = useState<UatExecutionLogEntry | null>(null);
  const [logbookTotalItems, setLogbookTotalItems] = useState(0);
  const [releaseFilterOptions, setReleaseFilterOptions] = useState<string[]>([]);
  const [testerFilterOptions, setTesterFilterOptions] = useState<string[]>([]);
  const [logbookForm, setLogbookForm] = useState(createInitialLogbookForm("absensi"));
  const [logbookSearch, setLogbookSearch] = useState("");
  const [logbookStatusFilter, setLogbookStatusFilter] = useState<"all" | UatExecutionLogEntry["status"]>("all");
  const [logbookWorkflowFilter, setLogbookWorkflowFilter] = useState<
    "all" | UatExecutionLogEntry["workflowStatus"]
  >("all");
  const [logbookReleaseFilter, setLogbookReleaseFilter] = useState("all");
  const [logbookTesterFilter, setLogbookTesterFilter] = useState("all");
  const [logbookPage, setLogbookPage] = useState(1);
  const [logbookReloadToken, setLogbookReloadToken] = useState(0);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const deferredLogbookSearch = useDeferredValue(logbookSearch);
  const domainSelectionHint = isDomainLocked
    ? `Workspace ini sudah terkunci ke domain ${UAT_DOMAIN_LABELS[activeDomain]}.`
    : "Gunakan tab `Absensi`, `HR`, atau `Payroll`.";

  useEffect(() => {
    if (lockedDomain) {
      if (activeDomain !== lockedDomain) {
        setActiveDomain(lockedDomain);
      }
      return;
    }

    const requestedDomain = searchParams.get(UAT_DOMAIN_QUERY_PARAM);
    if (isUatDomain(requestedDomain) && requestedDomain !== activeDomain) {
      setActiveDomain(requestedDomain);
      return;
    }

    if (!requestedDomain && activeDomain !== "absensi") {
      setActiveDomain("absensi");
    }
  }, [activeDomain, lockedDomain, searchParams]);

  useEffect(() => {
    if (lockedDomain) {
      return;
    }

    const currentDomain = searchParams.get(UAT_DOMAIN_QUERY_PARAM);
    const expectedDomain = activeDomain === "absensi" ? null : activeDomain;

    if (currentDomain === expectedDomain) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    if (expectedDomain) {
      nextParams.set(UAT_DOMAIN_QUERY_PARAM, expectedDomain);
    } else {
      nextParams.delete(UAT_DOMAIN_QUERY_PARAM);
    }
    setSearchParams(nextParams, { replace: true });
  }, [activeDomain, lockedDomain, searchParams, setSearchParams]);

  useEffect(() => {
    let isMounted = true;

    setLogbookForm(createInitialLogbookForm(activeDomain));
    setLogbookSearch("");
    setLogbookStatusFilter("all");
    setLogbookWorkflowFilter("all");
    setLogbookReleaseFilter("all");
    setLogbookTesterFilter("all");
    setLogbookPage(1);
    setIsPreviewingEditor(false);
    setExecutionLogbook([]);
    setLatestExecutionEntry(null);
    setLogbookTotalItems(0);
    setReleaseFilterOptions([]);
    setTesterFilterOptions([]);
    setChecklistView("all");

    const loadRuntimeState = async () => {
      setIsFetching(true);

      const fallbackMarkdown = getDefaultMarkdownForDomain(activeDomain);
      try {
        const runtimeSettings = await withTimeout(
          fetchRuntimeUatChecklist(activeDomain),
          REQUEST_TIMEOUT_MS,
          `Memuat checklist UAT runtime domain ${activeDomain} terlalu lama`,
        );

        if (!isMounted) {
          return;
        }

        const nextMarkdown = runtimeSettings?.markdown ?? fallbackMarkdown;
        setRuntimeMarkdown(nextMarkdown);
        setEditorMarkdown(runtimeSettings?.markdown ?? fallbackMarkdown);
        setRuntimeUpdatedAt(runtimeSettings?.updatedAt ?? null);
        setRuntimeSourceLabel(runtimeSettings?.sourceLabel ?? null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setRuntimeMarkdown(fallbackMarkdown);
        setEditorMarkdown(fallbackMarkdown);
        setRuntimeUpdatedAt(null);
        setRuntimeSourceLabel(null);

        const errorRef = reportError(error, "admin.settings.uat_runtime.fetch");
        toast.error(
          appendErrorReference(
            `Gagal memuat checklist UAT domain ${UAT_DOMAIN_LABELS[activeDomain]}.`,
            errorRef,
          ),
        );
      } finally {
        if (isMounted) {
          setIsFetching(false);
        }
      }
    };

    void loadRuntimeState();

    return () => {
      isMounted = false;
    };
  }, [activeDomain]);

  useEffect(() => {
    let isMounted = true;

    const loadLogbookMetadata = async () => {
      try {
        const [filterOptions, latestLogbookResult] = await Promise.all([
          withTimeout(
            fetchUatExecutionLogbookFilterOptions(activeDomain),
            REQUEST_TIMEOUT_MS,
            `Memuat filter logbook UAT domain ${activeDomain} terlalu lama`,
          ),
          withTimeout(
            fetchUatExecutionLogbookPage(activeDomain, { page: 1, pageSize: 1 }),
            REQUEST_TIMEOUT_MS,
            `Memuat batch logbook UAT terbaru domain ${activeDomain} terlalu lama`,
          ),
        ]);

        if (!isMounted) {
          return;
        }

        setReleaseFilterOptions(filterOptions.releaseVersions);
        setTesterFilterOptions(filterOptions.testers);
        setLatestExecutionEntry(latestLogbookResult.entries[0] ?? null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setReleaseFilterOptions([]);
        setTesterFilterOptions([]);
        setLatestExecutionEntry(null);

        const errorRef = reportError(error, "admin.settings.uat_logbook.meta");
        toast.error(
          appendErrorReference(
            `Gagal memuat metadata logbook UAT domain ${UAT_DOMAIN_LABELS[activeDomain]}.`,
            errorRef,
          ),
        );
      }
    };

    void loadLogbookMetadata();

    return () => {
      isMounted = false;
    };
  }, [activeDomain, logbookReloadToken]);

  useEffect(() => {
    let isMounted = true;

    const loadLogbookPage = async () => {
      setIsFetchingLogbook(true);

      try {
        const pageResult = await withTimeout(
          fetchUatExecutionLogbookPage(activeDomain, {
            page: logbookPage,
            pageSize: LOGBOOK_PAGE_SIZE,
            search: deferredLogbookSearch,
            status: logbookStatusFilter,
            workflowStatus: logbookWorkflowFilter,
            releaseVersion: logbookReleaseFilter === "all" ? "" : logbookReleaseFilter,
            tester: logbookTesterFilter === "all" ? "" : logbookTesterFilter,
          }),
          REQUEST_TIMEOUT_MS,
          `Memuat daftar logbook UAT domain ${activeDomain} terlalu lama`,
        );

        if (!isMounted) {
          return;
        }

        setExecutionLogbook(pageResult.entries);
        setLogbookTotalItems(pageResult.totalItems);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setExecutionLogbook([]);
        setLogbookTotalItems(0);

        const errorRef = reportError(error, "admin.settings.uat_logbook.page");
        toast.error(
          appendErrorReference(
            `Gagal memuat daftar logbook UAT domain ${UAT_DOMAIN_LABELS[activeDomain]}.`,
            errorRef,
          ),
        );
      } finally {
        if (isMounted) {
          setIsFetchingLogbook(false);
        }
      }
    };

    void loadLogbookPage();

    return () => {
      isMounted = false;
    };
  }, [
    activeDomain,
    deferredLogbookSearch,
    logbookStatusFilter,
    logbookWorkflowFilter,
    logbookReleaseFilter,
    logbookTesterFilter,
    logbookPage,
    logbookReloadToken,
  ]);

  const parsedChecklist = useMemo(() => parseUatChecklist(runtimeMarkdown), [runtimeMarkdown]);
  const latestChecklistLogEntry = parsedChecklist.logEntries[0] ?? null;
  const latestRun = latestExecutionEntry
    ? {
        tanggal: latestExecutionEntry.tanggal,
        releaseVersion: latestExecutionEntry.releaseVersion,
        update: latestExecutionEntry.update,
        tester: latestExecutionEntry.tester,
        reviewer: latestExecutionEntry.reviewer,
        approver: latestExecutionEntry.approver,
        workflowStatus: latestExecutionEntry.workflowStatus,
        areaDiuji: latestExecutionEntry.areaDiuji,
        ringkasanHasil: latestExecutionEntry.ringkasanHasil,
        referensi: latestExecutionEntry.referensi,
      }
    : parsedChecklist.logEntries[0] ?? null;
  const activeSource = isPreviewingEditor ? "Preview editor lokal" : runtimeUpdatedAt ? "Supabase Runtime" : "Dokumen bawaan";
  const allItems = parsedChecklist.sections.flatMap((section) => section.items);
  const passedItems = allItems.filter((item) => item.isPassed);
  const pendingItems = allItems.filter((item) => !item.isPassed);
  const sectionsByPending = [...parsedChecklist.sections].sort((a, b) => b.pendingCount - a.pendingCount);
  const subdomainSuggestions = UAT_DOMAIN_SUBDOMAIN_SUGGESTIONS[activeDomain];
  const priorityCoverage = {
    p0: calculatePriorityCoverage(allItems, "P0"),
    p1: calculatePriorityCoverage(allItems, "P1"),
  };
  const gateStatus = {
    p0Ready: priorityCoverage.p0.percent === 100,
    p1Ready: priorityCoverage.p1.percent >= 80,
    workflowReady: latestExecutionEntry
      ? latestExecutionEntry.workflowStatus === "sign_off" || latestExecutionEntry.workflowStatus === "closed"
      : false,
  };
  const releaseReady = gateStatus.p0Ready && gateStatus.p1Ready && gateStatus.workflowReady;
  const logbookTotalPages = Math.max(1, Math.ceil(logbookTotalItems / LOGBOOK_PAGE_SIZE));
  const safeLogbookPage = Math.min(logbookPage, logbookTotalPages);
  const hasAnyLogbookEntries = latestExecutionEntry !== null;
  const hasActiveLogbookFilters = Boolean(
    deferredLogbookSearch ||
      logbookStatusFilter !== "all" ||
      logbookWorkflowFilter !== "all" ||
      logbookReleaseFilter !== "all" ||
      logbookTesterFilter !== "all",
  );
  const shouldShowPassedList = checklistView === "all" || checklistView === "passed";
  const shouldShowPendingList = checklistView === "all" || checklistView === "pending";
  const logbookFormErrors = {
    tanggal: logbookForm.tanggal ? null : "Tanggal uji wajib diisi.",
    releaseVersion: logbookForm.releaseVersion.trim() ? null : "Release / versi wajib diisi.",
    update: logbookForm.update.trim() ? null : "Nama batch/update wajib diisi.",
    tester: logbookForm.tester.trim() ? null : "PIC tester wajib diisi.",
    subdomain: logbookForm.subdomain.trim() ? null : "Subdomain UAT wajib diisi.",
    areaDiuji: logbookForm.areaDiuji.trim() ? null : "Area diuji wajib diisi.",
    ringkasanHasil: validateRingkasanHasil(logbookForm.ringkasanHasil),
    referensi: validateReferensi(logbookForm.referensi),
  };
  const hasLogbookFormErrors = Object.values(logbookFormErrors).some(Boolean);
  const isChecklistAheadOfLogbook = Boolean(
    latestChecklistLogEntry &&
      (!latestExecutionEntry || latestChecklistLogEntry.tanggal.localeCompare(latestExecutionEntry.tanggal) > 0),
  );
  const isRuntimeSourceAheadOfLogbook = Boolean(
    runtimeUpdatedAt &&
      (!latestExecutionEntry || new Date(runtimeUpdatedAt).getTime() > new Date(latestExecutionEntry.createdAt).getTime()),
  );

  const handleChecklistViewChange = (view: "all" | "passed" | "pending") => {
    setChecklistView(view);
    requestAnimationFrame(() => {
      document.getElementById("uat-checklist-status-lists")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const scrollToSection = (sectionId: string) => {
    setHighlightedSection(sectionId);
    window.setTimeout(() => {
      setHighlightedSection((current) => (current === sectionId ? null : current));
    }, 2200);

    requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const getSectionHighlightClass = (sectionId: string) =>
    highlightedSection === sectionId
      ? "ring-2 ring-sky-300 ring-offset-2 ring-offset-white shadow-[0_0_0_1px_rgba(125,211,252,0.35),0_20px_40px_rgba(14,165,233,0.12)] transition-all duration-300"
      : "";

  const handleSaveRuntime = async () => {
    setIsSaving(true);
    try {
      const nextMarkdown = editorMarkdown.trim();
      const saved = await withTimeout(
        saveRuntimeUatChecklist(nextMarkdown, "Diperbarui dari Pengaturan Admin", activeDomain),
        REQUEST_TIMEOUT_MS,
        `Menyimpan checklist UAT runtime domain ${activeDomain} terlalu lama`,
      );
      setRuntimeMarkdown(saved.markdown);
      setEditorMarkdown(saved.markdown);
      setRuntimeUpdatedAt(saved.updatedAt);
      setRuntimeSourceLabel(saved.sourceLabel);
      setIsPreviewingEditor(false);
      toast.success(`Checklist runtime UAT ${UAT_DOMAIN_LABELS[activeDomain]} berhasil disimpan`);
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.uat_runtime.save");
      toast.error(
        appendErrorReference(`Gagal menyimpan checklist UAT runtime ${UAT_DOMAIN_LABELS[activeDomain]}.`, errorRef),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetEditorToBundled = () => {
    setEditorMarkdown(getDefaultMarkdownForDomain(activeDomain));
  };

  const handleUseEditorPreview = () => {
    setRuntimeMarkdown(editorMarkdown);
    setIsPreviewingEditor(true);
  };

  const handleExportLogbookCsv = async () => {
    setIsExportingLogbook(true);
    try {
      const exportEntries = await withTimeout(
        fetchUatExecutionLogbook(activeDomain),
        REQUEST_TIMEOUT_MS,
        `Mengambil export logbook UAT domain ${activeDomain} terlalu lama`,
      );

      if (exportEntries.length === 0) {
        toast.error(`Belum ada entri logbook UAT ${UAT_DOMAIN_LABELS[activeDomain]} untuk diexport.`);
        return;
      }

      downloadCsvFile(
        `uat-logbook-${activeDomain}-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          [
            "Tanggal",
            "Release",
            "Domain",
            "Subdomain",
            "Update",
            "Workflow",
            "Status",
            "Tester",
            "Reviewer",
            "Approver",
            "Area Diuji",
            "Ringkasan Hasil",
            "Referensi",
            "Dibuat Pada",
          ],
          ...exportEntries.map((entry) => [
            entry.tanggal,
            entry.releaseVersion ?? "-",
            UAT_DOMAIN_LABELS[entry.domain],
            entry.subdomain ?? "-",
            entry.update,
            getWorkflowStatusLabel(entry.workflowStatus),
            getExecutionStatusLabel(entry.status),
            entry.tester ?? "-",
            entry.reviewer ?? "-",
            entry.approver ?? "-",
            entry.areaDiuji,
            entry.ringkasanHasil,
            entry.referensi,
            entry.createdAt,
          ]),
        ],
      );
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.uat_logbook.export");
      toast.error(appendErrorReference(`Gagal menyiapkan export logbook UAT ${UAT_DOMAIN_LABELS[activeDomain]}.`, errorRef));
    } finally {
      setIsExportingLogbook(false);
    }
  };

  const handleSaveLogbookEntry = async () => {
    if (hasLogbookFormErrors) {
      toast.error("Form logbook UAT belum valid. Periksa field yang masih ditandai.");
      return;
    }

    setIsSavingLogbook(true);
    try {
      await withTimeout(
        appendUatExecutionLogEntry({
          domain: activeDomain,
          tanggal: logbookForm.tanggal,
          releaseVersion: logbookForm.releaseVersion.trim(),
          subdomain: logbookForm.subdomain.trim(),
          update: logbookForm.update.trim(),
          tester: logbookForm.tester.trim(),
          reviewer: logbookForm.reviewer.trim() || null,
          approver: logbookForm.approver.trim() || null,
          workflowStatus: logbookForm.workflowStatus,
          areaDiuji: logbookForm.areaDiuji.trim(),
          ringkasanHasil: logbookForm.ringkasanHasil.trim(),
          referensi: logbookForm.referensi.trim(),
          status: logbookForm.status,
        }),
        REQUEST_TIMEOUT_MS,
        `Menyimpan logbook UAT domain ${activeDomain} terlalu lama`,
      );
      setLogbookPage(1);
      setLogbookForm(createInitialLogbookForm(activeDomain));
      setLogbookReloadToken((prev) => prev + 1);
      toast.success(`Entri hasil uji UAT ${UAT_DOMAIN_LABELS[activeDomain]} berhasil dicatat`);
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.uat_logbook.save");
      toast.error(appendErrorReference(`Gagal menyimpan logbook UAT ${UAT_DOMAIN_LABELS[activeDomain]}.`, errorRef));
    } finally {
      setIsSavingLogbook(false);
    }
  };

  if (isFetching) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <Tabs
      value={activeDomain}
      onValueChange={(value) => setActiveDomain(value as UatDomain)}
      className="space-y-6"
    >
      <div className="space-y-3">
        {lockedDomain ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Domain Terkunci</Badge>
              <Badge variant="outline">{UAT_DOMAIN_LABELS[activeDomain]}</Badge>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Workspace ini hanya menampilkan UAT {UAT_DOMAIN_LABELS[activeDomain]}, sehingga checklist, logbook, dan gate rilis tidak bercampur dengan domain lain.
            </p>
          </div>
        ) : (
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-3xl border-slate-200 bg-slate-100/80 p-2 md:grid-cols-3">
            {availableDomains.map((domain) => (
              <TabsTrigger
                key={domain}
                value={domain}
                className="h-auto min-h-[88px] flex-col items-start justify-between gap-2 rounded-2xl px-4 py-3 text-left"
              >
                <span className="text-sm font-semibold text-slate-900">{UAT_DOMAIN_LABELS[domain]}</span>
                <span className="text-xs text-slate-500">
                  {domain === "absensi"
                    ? "Check-in, jadwal, approval, laporan"
                    : domain === "hr"
                      ? "Karyawan, cuti, dokumen, workflow"
                      : "Komponen gaji, approval, slip, audit"}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Monitoring Hasil UAT {UAT_DOMAIN_LABELS[activeDomain]}</h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Setiap domain UAT sekarang dipisahkan permanen. Halaman ini merangkum baseline checklist, hasil yang lolos,
              yang belum lolos, dan logbook batch uji khusus domain {UAT_DOMAIN_LABELS[activeDomain]}. Sumber aktif saat ini: {activeSource}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info" className="w-fit">
              {activeSource}
            </Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => scrollToSection("uat-glossary")}>
              Buka Glosarium UAT
            </Button>
          </div>
        </div>
      </div>

      <TabsContent value={activeDomain} className="mt-0 space-y-6">
      <div
        id="uat-summary-top"
        className={cn("grid gap-4 rounded-3xl md:grid-cols-2 xl:grid-cols-6", getSectionHighlightClass("uat-summary-top"))}
      >
        <Card className={cn("border-slate-200/80", releaseReady ? "bg-emerald-50/80 border-emerald-200/80" : "bg-rose-50/80 border-rose-200/80")}>
          <CardHeader className="pb-2">
            <CardDescription>Gate Rilis</CardDescription>
            <CardTitle className={cn("flex items-center gap-2 text-2xl", releaseReady ? "text-emerald-700" : "text-rose-700")}>
              <FileCheck2 className="h-6 w-6" />
              {releaseReady ? "Siap" : "Tertahan"}
            </CardTitle>
          </CardHeader>
          <CardContent className={cn("pt-0 text-xs", releaseReady ? "text-emerald-700/90" : "text-rose-700/90")}>
            P0 100%, P1 minimal 80%, dan batch terakhir minimal sign-off
          </CardContent>
        </Card>

        <Card className="border-emerald-200/80 bg-emerald-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Total Lolos</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
              {parsedChecklist.summary.passed}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-emerald-700/90">Item dengan status `Sudah diuji`</CardContent>
        </Card>

        <Card className="border-amber-200/80 bg-amber-50/80">
          <CardHeader className="pb-2">
            <CardDescription>Belum Lolos</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl text-amber-700">
              <TriangleAlert className="h-6 w-6" />
              {parsedChecklist.summary.pending}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-amber-700/90">
            Gabungan belum diuji, retest, dan validasi device nyata
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Belum Diuji</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl text-slate-900">
              <CircleDashed className="h-6 w-6" />
              {parsedChecklist.summary.untested}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-600">Item yang belum masuk eksekusi verifikasi</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Perlu Retest</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl text-slate-900">
              <RefreshCcw className="h-6 w-6" />
              {parsedChecklist.summary.retest}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-600">Item yang sudah diuji tapi belum bersih</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Coverage P0 / P1</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl text-slate-900">
              <Smartphone className="h-6 w-6" />
              {priorityCoverage.p0.percent}% / {priorityCoverage.p1.percent}%
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-600">
            P0: {priorityCoverage.p0.passed}/{priorityCoverage.p0.total || 0} dan P1: {priorityCoverage.p1.passed}/{priorityCoverage.p1.total || 0}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Khusus Device Nyata</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl text-slate-900">
              <Smartphone className="h-6 w-6" />
              {parsedChecklist.summary.deviceOnly}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-600">Item yang masih perlu validasi di device nyata</CardContent>
        </Card>
      </div>

      <Card className="border-slate-200/80 bg-slate-50/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cara Pakai Monitoring UAT</CardTitle>
          <CardDescription>
            Alur cepat untuk memantau status domain {UAT_DOMAIN_LABELS[activeDomain]} tanpa perlu membaca seluruh halaman.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Langkah 1</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">Pilih domain dan baca kartu atas</p>
            <p className="mt-2 text-sm text-slate-600">
              {domainSelectionHint} Lalu cek `Gate Rilis`, `Belum Lolos`, dan `Coverage P0/P1`.
            </p>
            <div className="mt-3">
              <Button type="button" size="sm" variant="outline" onClick={() => scrollToSection("uat-summary-top")}>
                Lihat Monitoring Atas
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Langkah 2</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">Fokus ke item yang perlu aksi</p>
            <p className="mt-2 text-sm text-slate-600">
              Pakai tombol `Perlu UAT` untuk melihat item yang belum lolos, lalu cek `Batch UAT Terakhir` dan `Riwayat Logbook`.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="warning" onClick={() => handleChecklistViewChange("pending")}>
                Lihat Perlu UAT
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => scrollToSection("uat-logbook-history")}>
                Scroll ke Logbook
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => scrollToSection("uat-glossary")}>
                Buka Glosarium
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Langkah 3</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">Catat hasil uji setelah testing</p>
            <p className="mt-2 text-sm text-slate-600">
              Setelah batch selesai, isi form logbook domain ini agar status rilis dan jejak audit UAT selalu terbarui.
            </p>
            <div className="mt-3">
              <Button type="button" size="sm" onClick={() => scrollToSection("uat-logbook-form")}>
                Isi Hasil Uji
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="uat-glossary" className={cn("border-slate-200/80 bg-white/90", getSectionHighlightClass("uat-glossary"))}>
        <CardHeader>
          <CardTitle className="text-base">Penjelasan & Glosarium UAT</CardTitle>
          <CardDescription>
            Ringkasan istilah dan fungsi yang tampil di halaman ini, supaya admin bisa membaca metrik, tombol, dan form UAT dengan konsisten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">Kapan dipakai</p>
              <p className="mt-2 text-sm text-slate-600">
                Buka section ini saat Anda ingin memahami arti kartu monitoring, tombol filter, field logbook, dan editor checklist runtime
                tanpa perlu menebak istilah UAT yang tampil.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">Cara baca cepat</p>
              <p className="mt-2 text-sm text-slate-600">
                Mulai dari kategori `Ringkasan atas`, lanjut ke `Tombol & navigasi`, lalu baca `Logbook & approval` dan
                `Checklist runtime` bila Anda mengelola batch uji atau baseline skenario.
              </p>
            </div>
          </div>

          <Accordion type="multiple" className="w-full space-y-3">
            <AccordionItem value="summary" className="rounded-2xl border border-slate-200 px-4">
              <AccordionTrigger className="text-left text-sm font-semibold text-slate-900">Ringkasan atas</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {UAT_SUMMARY_GLOSSARY.map((entry) => (
                    <div key={entry.term} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-sm font-semibold text-slate-900">{entry.term}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{entry.description}</p>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="actions" className="rounded-2xl border border-slate-200 px-4">
              <AccordionTrigger className="text-left text-sm font-semibold text-slate-900">Tombol & navigasi</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {UAT_ACTION_GLOSSARY.map((entry) => (
                    <div key={entry.term} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-sm font-semibold text-slate-900">{entry.term}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{entry.description}</p>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="logbook" className="rounded-2xl border border-slate-200 px-4">
              <AccordionTrigger className="text-left text-sm font-semibold text-slate-900">Logbook & approval</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {UAT_LOGBOOK_GLOSSARY.map((entry) => (
                    <div key={entry.term} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-sm font-semibold text-slate-900">{entry.term}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{entry.description}</p>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="checklist" className="rounded-2xl border border-slate-200 px-4">
              <AccordionTrigger className="text-left text-sm font-semibold text-slate-900">Checklist runtime & validasi</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {UAT_CHECKLIST_GLOSSARY.map((entry) => (
                    <div key={entry.term} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-sm font-semibold text-slate-900">{entry.term}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{entry.description}</p>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {(!latestExecutionEntry || isChecklistAheadOfLogbook || isRuntimeSourceAheadOfLogbook) && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-700">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Reminder UAT {UAT_DOMAIN_LABELS[activeDomain]}</AlertTitle>
          <AlertDescription>
            {!latestExecutionEntry
              ? `Belum ada batch uji ${UAT_DOMAIN_LABELS[activeDomain]} yang tercatat di logbook permanen. Batch berikutnya wajib dicatat di halaman ini.`
              : isRuntimeSourceAheadOfLogbook
                ? `Checklist runtime ${UAT_DOMAIN_LABELS[activeDomain]} berubah setelah entri logbook terakhir. Jalankan uji ulang bila perlu lalu catat batch terbarunya.`
                : `Log checklist ${UAT_DOMAIN_LABELS[activeDomain]} terlihat lebih baru daripada logbook permanen. Pastikan hasil uji terbaru juga dicatat di halaman ini.`}
          </AlertDescription>
        </Alert>
      )}

      {!releaseReady && latestExecutionEntry && (
        <Alert className="border-sky-200 bg-sky-50 text-sky-900 [&>svg]:text-sky-700">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Gate Rilis {UAT_DOMAIN_LABELS[activeDomain]} Belum Siap</AlertTitle>
          <AlertDescription>
            {!gateStatus.p0Ready
              ? "Masih ada item prioritas P0 yang belum 100% lolos."
              : !gateStatus.p1Ready
                ? "Coverage prioritas P1 belum mencapai target minimum 80%."
                : "Batch terakhir belum mencapai status sign-off atau closed."}
          </AlertDescription>
        </Alert>
      )}

      <Card id="uat-logbook-form" className={cn("border-slate-200/80", getSectionHighlightClass("uat-logbook-form"))}>
        <CardHeader>
          <CardTitle className="text-base">Mekanisme Permanen Pencatatan UAT per Domain</CardTitle>
          <CardDescription>
            {isDomainLocked
              ? `Domain ${UAT_DOMAIN_LABELS[activeDomain]} sekarang punya baseline dan logbook terpisah. Setiap batch uji wajib dicatat pada domain ini.`
              : "Absensi, HR, dan Payroll sekarang punya baseline dan logbook terpisah. Setiap batch uji wajib dicatat pada domain yang sesuai."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">Aturan operasional domain {UAT_DOMAIN_LABELS[activeDomain]}</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li>Setelah setiap batch uji selesai, wajib isi 1 entri logbook di domain ini.</li>
                <li>Setiap entri harus terkait 1 release/version yang jelas agar jejak rilis tidak bercampur.</li>
                <li>Isi `PIC tester`, `reviewer`, dan `approver` sesuai orang yang benar-benar terlibat.</li>
                <li>Isi `Subdomain UAT` sesuai klaster modul yang benar-benar dites.</li>
                <li>Isi `Area diuji` berdasarkan flow riil yang dieksekusi, bukan rencana.</li>
                <li>Isi `Referensi` dengan dokumen UAT, sign-off, go/no-go, atau bukti eksekusi yang dapat ditelusuri.</li>
              </ul>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Tanggal Uji</label>
                  <Input
                    type="date"
                    value={logbookForm.tanggal}
                    onChange={(event) => setLogbookForm((prev) => ({ ...prev, tanggal: event.target.value }))}
                  />
                  {logbookFormErrors.tanggal ? <p className="text-xs text-rose-600">{logbookFormErrors.tanggal}</p> : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Hasil Batch</label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={logbookForm.status === "lolos" ? "success" : "outline"}
                      onClick={() => setLogbookForm((prev) => ({ ...prev, status: "lolos" }))}
                    >
                      Lolos
                    </Button>
                    <Button
                      type="button"
                      variant={logbookForm.status === "perlu_tindak_lanjut" ? "warning" : "outline"}
                      onClick={() => setLogbookForm((prev) => ({ ...prev, status: "perlu_tindak_lanjut" }))}
                    >
                      Perlu tindak lanjut
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Release / Versi</label>
                  <Input
                    value={logbookForm.releaseVersion}
                    onChange={(event) => setLogbookForm((prev) => ({ ...prev, releaseVersion: event.target.value }))}
                    placeholder="Contoh: v2026.03.20-rc1"
                  />
                  {logbookFormErrors.releaseVersion ? (
                    <p className="text-xs text-rose-600">{logbookFormErrors.releaseVersion}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Workflow UAT</label>
                  <div className="flex flex-wrap gap-2">
                    {(["draft", "diuji", "sign_off", "closed"] as const).map((status) => (
                      <Button
                        key={status}
                        type="button"
                        variant={logbookForm.workflowStatus === status ? "default" : "outline"}
                        size="sm"
                        onClick={() => setLogbookForm((prev) => ({ ...prev, workflowStatus: status }))}
                      >
                        {getWorkflowStatusLabel(status)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Update / Nama Batch</label>
                <Input
                  value={logbookForm.update}
                  onChange={(event) => setLogbookForm((prev) => ({ ...prev, update: event.target.value }))}
                  placeholder={`Contoh: ${UAT_DOMAIN_LABELS[activeDomain]} regression 2026-03-20`}
                />
                {logbookFormErrors.update ? <p className="text-xs text-rose-600">{logbookFormErrors.update}</p> : null}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">PIC Tester</label>
                  <Input
                    value={logbookForm.tester}
                    onChange={(event) => setLogbookForm((prev) => ({ ...prev, tester: event.target.value }))}
                    placeholder="Contoh: Jason"
                  />
                  {logbookFormErrors.tester ? <p className="text-xs text-rose-600">{logbookFormErrors.tester}</p> : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Reviewer</label>
                  <Input
                    value={logbookForm.reviewer}
                    onChange={(event) => setLogbookForm((prev) => ({ ...prev, reviewer: event.target.value }))}
                    placeholder="Opsional"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Approver</label>
                  <Input
                    value={logbookForm.approver}
                    onChange={(event) => setLogbookForm((prev) => ({ ...prev, approver: event.target.value }))}
                    placeholder="Opsional"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Subdomain UAT</label>
                <Input
                  value={logbookForm.subdomain}
                  onChange={(event) => setLogbookForm((prev) => ({ ...prev, subdomain: event.target.value }))}
                  placeholder={`Contoh: ${subdomainSuggestions[0]}`}
                />
                <div className="flex flex-wrap gap-2">
                  {subdomainSuggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLogbookForm((prev) => ({ ...prev, subdomain: suggestion }))}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
                {logbookFormErrors.subdomain ? <p className="text-xs text-rose-600">{logbookFormErrors.subdomain}</p> : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Area Diuji</label>
                <Textarea
                  value={logbookForm.areaDiuji}
                  onChange={(event) => setLogbookForm((prev) => ({ ...prev, areaDiuji: event.target.value }))}
                  rows={3}
                  placeholder="Contoh: flow guard route, CRUD, approval, export, error handling"
                />
                {logbookFormErrors.areaDiuji ? <p className="text-xs text-rose-600">{logbookFormErrors.areaDiuji}</p> : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Ringkasan Hasil</label>
                <Input
                  value={logbookForm.ringkasanHasil}
                  onChange={(event) => setLogbookForm((prev) => ({ ...prev, ringkasanHasil: event.target.value }))}
                  placeholder="Contoh: 15/15 lulus, siap dengan catatan"
                />
                {logbookFormErrors.ringkasanHasil ? (
                  <p className="text-xs text-rose-600">{logbookFormErrors.ringkasanHasil}</p>
                ) : (
                  <p className="text-xs text-slate-500">Gunakan format seperti `15/15 lulus` atau `siap dengan catatan`.</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Referensi Bukti</label>
                <Textarea
                  value={logbookForm.referensi}
                  onChange={(event) => setLogbookForm((prev) => ({ ...prev, referensi: event.target.value }))}
                  rows={3}
                  placeholder="Contoh: docs/uat/hr/uat-2026-03-20.md, sign-off, go/no-go"
                />
                {logbookFormErrors.referensi ? (
                  <p className="text-xs text-rose-600">{logbookFormErrors.referensi}</p>
                ) : (
                  <p className="text-xs text-slate-500">Sertakan path dokumen, link, atau artefak sign-off/go-no-go.</p>
                )}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveLogbookEntry} disabled={isSavingLogbook || hasLogbookFormErrors}>
                  {isSavingLogbook ? <Loader2 className="animate-spin" /> : <Save />}
                  Catat ke Logbook UAT
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-slate-200/80">
          <CardHeader>
            <CardTitle className="text-base">Batch UAT Terakhir</CardTitle>
            <CardDescription>
              Batch terbaru domain {UAT_DOMAIN_LABELS[activeDomain]} diprioritaskan dari logbook permanen, lalu fallback ke checklist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {latestRun ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{latestRun.tanggal}</Badge>
                  {"releaseVersion" in latestRun && latestRun.releaseVersion ? (
                    <Badge variant="secondary">{latestRun.releaseVersion}</Badge>
                  ) : null}
                  <Badge variant="info">{latestRun.update}</Badge>
                  {"workflowStatus" in latestRun && latestRun.workflowStatus ? (
                    <Badge variant={getWorkflowStatusVariant(latestRun.workflowStatus)}>{getWorkflowStatusLabel(latestRun.workflowStatus)}</Badge>
                  ) : null}
                </div>
                {latestExecutionEntry?.subdomain ? (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium text-slate-900">Subdomain:</span> {latestExecutionEntry.subdomain}
                  </p>
                ) : null}
                {"tester" in latestRun && latestRun.tester ? (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium text-slate-900">PIC tester:</span> {latestRun.tester}
                  </p>
                ) : null}
                {"reviewer" in latestRun && latestRun.reviewer ? (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium text-slate-900">Reviewer:</span> {latestRun.reviewer}
                  </p>
                ) : null}
                {"approver" in latestRun && latestRun.approver ? (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium text-slate-900">Approver:</span> {latestRun.approver}
                  </p>
                ) : null}
                <p className="text-sm text-slate-700">
                  <span className="font-medium text-slate-900">Area diuji:</span> {latestRun.areaDiuji}
                </p>
                <p className="text-sm text-slate-700">
                  <span className="font-medium text-slate-900">Ringkasan:</span> {latestRun.ringkasanHasil}
                </p>
                <p className="text-sm text-slate-700">
                  <span className="font-medium text-slate-900">Referensi:</span> {latestRun.referensi}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Belum ada log update maupun entri logbook untuk domain ini.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader>
            <CardTitle className="text-base">Progres Domain</CardTitle>
            <CardDescription>
              Pass rate {UAT_DOMAIN_LABELS[activeDomain]} saat ini {parsedChecklist.summary.passRate}% dari {parsedChecklist.summary.total} item.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>Progress keseluruhan</span>
                <span className="font-semibold text-slate-900">{parsedChecklist.summary.passRate}%</span>
              </div>
              <Progress value={parsedChecklist.summary.passRate} className="h-2" />
            </div>

            <div className="space-y-3">
              {sectionsByPending.map((section) => {
                const totalItems = section.items.length || 1;
                const sectionPassRate = Math.round((section.passedCount / totalItems) * 100);
                return (
                  <div key={section.id} className="space-y-2 rounded-2xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{section.title}</p>
                        <p className="text-xs text-slate-500">
                          {section.passedCount}/{section.items.length} lolos
                        </p>
                      </div>
                      <Badge variant={section.pendingCount > 0 ? "warning" : "success"}>{sectionPassRate}%</Badge>
                    </div>
                    <Progress value={sectionPassRate} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card
        id="uat-logbook-history"
        className={cn("border-slate-200/80", getSectionHighlightClass("uat-logbook-history"))}
      >
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Riwayat Logbook UAT {UAT_DOMAIN_LABELS[activeDomain]}</CardTitle>
            <CardDescription>
              Logbook permanen append-only untuk domain aktif, kini dengan pencarian, filter, dan pagination.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => void handleExportLogbookCsv()} disabled={!hasAnyLogbookEntries || isExportingLogbook}>
            {isExportingLogbook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {isFetchingLogbook ? (
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat riwayat logbook UAT...
            </div>
          ) : logbookTotalItems === 0 ? (
            <p className="text-sm text-slate-600">
              {hasAnyLogbookEntries || hasActiveLogbookFilters
                ? "Tidak ada entri logbook yang cocok dengan pencarian atau filter saat ini."
                : "Belum ada entri logbook permanen untuk domain ini."}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Cari logbook</label>
                  <Input
                    value={logbookSearch}
                    onChange={(event) => {
                      setLogbookSearch(event.target.value);
                      setLogbookPage(1);
                    }}
                    placeholder="Cari release, batch, subdomain, PIC, atau referensi"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Filter hasil batch</label>
                  <div className="flex flex-wrap gap-2">
                    {(["all", "lolos", "perlu_tindak_lanjut"] as const).map((status) => (
                      <Button
                        key={status}
                        type="button"
                        variant={logbookStatusFilter === status ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setLogbookStatusFilter(status);
                          setLogbookPage(1);
                        }}
                      >
                        {status === "all" ? "Semua" : getExecutionStatusLabel(status)}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Filter workflow</label>
                  <div className="flex flex-wrap gap-2">
                    {(["all", "draft", "diuji", "sign_off", "closed"] as const).map((status) => (
                      <Button
                        key={status}
                        type="button"
                        variant={logbookWorkflowFilter === status ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setLogbookWorkflowFilter(status);
                          setLogbookPage(1);
                        }}
                      >
                        {status === "all" ? "Semua" : getWorkflowStatusLabel(status)}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Filter release</label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={logbookReleaseFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setLogbookReleaseFilter("all");
                        setLogbookPage(1);
                      }}
                    >
                      Semua
                    </Button>
                    {releaseFilterOptions.map((release) => (
                      <Button
                        key={release}
                        type="button"
                        variant={logbookReleaseFilter === release ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setLogbookReleaseFilter(release);
                          setLogbookPage(1);
                        }}
                      >
                        {release}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Filter PIC tester</label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={logbookTesterFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setLogbookTesterFilter("all");
                        setLogbookPage(1);
                      }}
                    >
                      Semua
                    </Button>
                    {testerFilterOptions.map((tester) => (
                      <Button
                        key={tester}
                        type="button"
                        variant={logbookTesterFilter === tester ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setLogbookTesterFilter(tester);
                          setLogbookPage(1);
                        }}
                      >
                        {tester}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <ScrollArea className="max-h-[380px]">
                <div className="space-y-3 pr-4">
                  {executionLogbook.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{entry.tanggal}</Badge>
                      {entry.releaseVersion ? <Badge variant="secondary">{entry.releaseVersion}</Badge> : null}
                      <Badge variant="secondary">{entry.subdomain ?? "Tanpa subdomain"}</Badge>
                      <Badge variant={getWorkflowStatusVariant(entry.workflowStatus)}>
                        {getWorkflowStatusLabel(entry.workflowStatus)}
                      </Badge>
                      <Badge variant={getExecutionStatusVariant(entry.status)}>{getExecutionStatusLabel(entry.status)}</Badge>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{entry.update}</p>
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">PIC tester:</span> {entry.tester ?? "-"}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">Reviewer / Approver:</span> {entry.reviewer ?? "-"} / {entry.approver ?? "-"}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">Area diuji:</span> {entry.areaDiuji}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">Ringkasan hasil:</span> {entry.ringkasanHasil}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">Referensi:</span> {entry.referensi}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Dicatat pada {new Date(entry.createdAt).toLocaleString("id-ID")}
                    </p>
                  </div>
                  ))}
                </div>
              </ScrollArea>

              {logbookTotalItems > 0 ? (
                <TablePaginationFooter
                  currentPage={safeLogbookPage}
                  totalPages={logbookTotalPages}
                  totalItems={logbookTotalItems}
                  pageSize={LOGBOOK_PAGE_SIZE}
                  itemLabel="entri logbook"
                  onPrevious={() => setLogbookPage((prev) => Math.max(1, prev - 1))}
                  onNext={() => setLogbookPage((prev) => Math.min(logbookTotalPages, prev + 1))}
                />
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        id="uat-checklist-status-lists"
        className={cn("border-slate-200/80", getSectionHighlightClass("uat-checklist-status-lists"))}
      >
        <CardHeader className="space-y-4">
          <div>
            <CardTitle className="text-base">Daftar Status UAT {UAT_DOMAIN_LABELS[activeDomain]}</CardTitle>
            <CardDescription>
              Gunakan tombol cepat ini untuk langsung melihat item yang sudah UAT atau yang masih perlu UAT.
            </CardDescription>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Button
              type="button"
              variant={checklistView === "passed" ? "success" : "outline"}
              className="h-auto justify-between rounded-2xl px-4 py-4"
              onClick={() => handleChecklistViewChange("passed")}
            >
              <span className="text-left">
                <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Sudah UAT</span>
                <span className="mt-1 block text-lg font-semibold text-emerald-700">{passedItems.length} item</span>
              </span>
              <CheckCircle2 className="h-5 w-5" />
            </Button>

            <Button
              type="button"
              variant={checklistView === "pending" ? "warning" : "outline"}
              className="h-auto justify-between rounded-2xl px-4 py-4"
              onClick={() => handleChecklistViewChange("pending")}
            >
              <span className="text-left">
                <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Perlu UAT</span>
                <span className="mt-1 block text-lg font-semibold text-amber-700">{pendingItems.length} item</span>
              </span>
              <TriangleAlert className="h-5 w-5" />
            </Button>

            <Button
              type="button"
              variant={checklistView === "all" ? "default" : "outline"}
              className="h-auto justify-between rounded-2xl px-4 py-4"
              onClick={() => handleChecklistViewChange("all")}
            >
              <span className="text-left">
                <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Lihat Semua</span>
                <span className="mt-1 block text-lg font-semibold text-slate-900">{allItems.length} item</span>
              </span>
              <CircleDashed className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className={cn("grid gap-4", checklistView === "all" ? "xl:grid-cols-[0.9fr_1.1fr]" : "grid-cols-1")}>
        {shouldShowPassedList ? (
        <Card className="border-emerald-200/60">
          <CardHeader>
            <CardTitle className="text-base text-emerald-800">Daftar Sudah UAT</CardTitle>
            <CardDescription>{passedItems.length} item sudah lolos UAT di domain {UAT_DOMAIN_LABELS[activeDomain]}.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Prioritas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {passedItems.length > 0 ? (
                  passedItems.map((item) => renderItemRow(item, "success"))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                      Belum ada item yang lolos.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        ) : null}

        {shouldShowPendingList ? (
        <Card className="border-amber-200/60">
          <CardHeader>
            <CardTitle className="text-base text-amber-800">Daftar Perlu UAT</CardTitle>
            <CardDescription>{pendingItems.length} item masih perlu diuji atau ditindaklanjuti di domain {UAT_DOMAIN_LABELS[activeDomain]}.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Prioritas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingItems.length > 0 ? (
                  pendingItems.map((item) => renderItemRow(item, "pending"))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                      Semua item domain ini sudah lolos.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        ) : null}
      </div>

      <Card className="border-slate-200/80">
        <CardHeader>
          <CardTitle className="text-base">Breakdown Checklist per Seksi</CardTitle>
          <CardDescription>Gunakan ini untuk melihat item mana yang masih tertahan di tiap seksi domain aktif.</CardDescription>
        </CardHeader>
        <CardContent>
          {parsedChecklist.sections.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {parsedChecklist.sections.map((section) => (
                <AccordionItem key={section.id} value={section.id}>
                  <AccordionTrigger>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left">
                      <span className="font-medium text-slate-900">{section.title}</span>
                      <Badge variant={section.pendingCount > 0 ? "warning" : "success"}>
                        {section.passedCount}/{section.items.length} lolos
                      </Badge>
                      {section.statusLabel ? <Badge variant="outline">{section.statusLabel}</Badge> : null}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>Prioritas default: {section.defaultPriority ?? "-"}</span>
                        <span>Metode umum: {section.defaultMethod ?? "-"}</span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Detail</TableHead>
                            <TableHead>Prioritas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {section.items.map((item) => renderItemRow(item, item.isPassed ? "success" : "pending"))}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">
              Checklist domain ini belum punya seksi yang bisa diparse. Periksa format markdown runtime sebelum menyimpan.
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        id="uat-runtime-checklist"
        className={cn("border-slate-200/80", getSectionHighlightClass("uat-runtime-checklist"))}
      >
        <CardHeader>
          <CardTitle className="text-base">Sumber Runtime Checklist {UAT_DOMAIN_LABELS[activeDomain]}</CardTitle>
          <CardDescription>
            Edit markdown checklist domain ini lalu simpan ke Supabase setelah monitoring, logbook, dan status UAT selesai ditinjau.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-3">
              <Textarea
                value={editorMarkdown}
                onChange={(event) => setEditorMarkdown(event.target.value)}
                rows={14}
                className="min-h-[340px] font-mono text-xs"
                placeholder="Tempel markdown checklist UAT domain di sini..."
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveRuntime} disabled={isSaving || !editorMarkdown.trim()}>
                  {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
                  Simpan ke Supabase
                </Button>
                <Button variant="outline" onClick={handleUseEditorPreview} disabled={!editorMarkdown.trim()}>
                  Preview dari Editor
                </Button>
                <Button variant="ghost" onClick={handleResetEditorToBundled}>
                  Isi dari Dokumen Bawaan
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status sumber</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{activeSource}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {runtimeUpdatedAt
                    ? `Runtime aktif ${UAT_DOMAIN_LABELS[activeDomain]} tersimpan di Supabase pada ${new Date(runtimeUpdatedAt).toLocaleString("id-ID")}.`
                    : `Belum ada override runtime untuk ${UAT_DOMAIN_LABELS[activeDomain]}. Monitoring masih memakai baseline bawaan.`}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Label sumber: {isPreviewingEditor ? "Preview editor lokal" : runtimeSourceLabel ?? "Fallback dokumen bawaan"}
                </p>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-slate-700">
                Gunakan `Preview dari Editor` untuk cek hasil parse sebelum menyimpan. Baseline domain
                {` ${UAT_DOMAIN_LABELS[activeDomain]} `}
                dipisahkan dari domain lain, jadi perubahan di sini tidak akan mencampur UAT absensi, HR, dan payroll.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 bg-slate-50/60">
        <CardHeader>
          <CardTitle className="text-base">Catatan Domain</CardTitle>
          <CardDescription>
            {isDomainLocked
              ? `Struktur UAT ${UAT_DOMAIN_LABELS[activeDomain]} sekarang dipisah permanen agar scope workspace ini tidak bercampur dengan domain lain.`
              : "Struktur UAT sekarang dipisah permanen agar scope tidak bercampur antar Absensi, HR, dan Payroll."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <div className="flex items-start gap-3">
            <FileCheck2 className="mt-0.5 h-4 w-4 text-slate-500" />
            <p>Baseline checklist dan logbook disimpan terpisah per domain di `system_settings` Supabase.</p>
          </div>
          <div className="flex items-start gap-3">
            <FileCheck2 className="mt-0.5 h-4 w-4 text-slate-500" />
            <p>Absensi tetap memakai dokumen bawaan sebagai fallback, sedangkan HR dan Payroll memakai template runtime masing-masing.</p>
          </div>
          <div className="flex items-start gap-3">
            <FileCheck2 className="mt-0.5 h-4 w-4 text-slate-500" />
            <p>Logbook tetap append-only agar jejak audit eksekusi UAT tiap domain tidak hilang.</p>
          </div>
        </CardContent>
      </Card>
      </TabsContent>
    </Tabs>
  );
}
