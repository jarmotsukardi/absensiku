import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { reportError } from "@/lib/errorLogger";
import { logAuditIfEnabled } from "@/lib/auditLoggingPolicy";

export type ReportOutputCell = string | number | boolean | Date | null | undefined;

export type ReportOutputColumn<Row> = {
  header: string;
  value: (row: Row, index: number) => ReportOutputCell;
  align?: "left" | "center" | "right";
  width?: number;
};

export type ReportSummaryItem = {
  label: string;
  value: ReportOutputCell;
};

type DownloadReportPdfOptions<Row> = {
  columns: ReportOutputColumn<Row>[];
  emptyStateLabel?: string;
  filename: string;
  metadataLines?: string[];
  orientation?: "portrait" | "landscape";
  rows: Row[];
  sourceLabel?: string;
  summary?: ReportSummaryItem[];
  title: string;
  traceId?: string;
};

const normalizeCellValue = (value: ReportOutputCell): string => {
  if (value == null || value === "") return "-";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return String(value);
};

const escapeCsvCell = (value: ReportOutputCell) => {
  const text = normalizeCellValue(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
};

export function buildReportCsv<Row>({
  columns,
  includeBom = true,
  rows,
}: {
  columns: ReportOutputColumn<Row>[];
  includeBom?: boolean;
  rows: Row[];
}) {
  const lines = [
    columns.map((column) => escapeCsvCell(column.header)).join(","),
    ...rows.map((row, index) => columns.map((column) => escapeCsvCell(column.value(row, index))).join(",")),
  ];

  return `${includeBom ? "\uFEFF" : ""}${lines.join("\n")}`;
}

export function downloadBlobFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadCsvFile(filename: string, csvContent: string) {
  downloadBlobFile(filename, new Blob([csvContent], { type: "text/csv;charset=utf-8;" }));
}

export function createReportTraceId(prefix = "RPT") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function downloadReportPdf<Row>({
  columns,
  emptyStateLabel = "Tidak ada data.",
  filename,
  metadataLines = [],
  orientation = "landscape",
  rows,
  sourceLabel,
  summary = [],
  title,
  traceId,
}: DownloadReportPdfOptions<Row>) {
  const document = new jsPDF({
    orientation,
    unit: "pt",
    format: "a4",
  });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 80;

  let cursorY = 40;
  document.setFont("helvetica", "bold");
  document.setFontSize(16);
  document.text(title, 40, cursorY);
  cursorY += 18;

  document.setFont("helvetica", "normal");
  document.setFontSize(9);
  const printedAt = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const lines = [...metadataLines, `Dibuat: ${printedAt}`];
  for (const line of lines) {
    const wrappedLines = document.splitTextToSize(line, contentWidth);
    document.text(wrappedLines, 40, cursorY);
    cursorY += wrappedLines.length * 11;
  }

  if (summary.length > 0) {
    cursorY += 4;
    document.setFont("helvetica", "bold");
    document.text("Ringkasan", 40, cursorY);
    cursorY += 12;
    document.setFont("helvetica", "normal");

    for (const item of summary) {
      const wrappedLines = document.splitTextToSize(`${item.label}: ${normalizeCellValue(item.value)}`, contentWidth);
      document.text(wrappedLines, 40, cursorY);
      cursorY += wrappedLines.length * 11;
    }
  }

  const bodyRows =
    rows.length > 0
      ? rows.map((row, index) => columns.map((column) => normalizeCellValue(column.value(row, index))))
      : [[emptyStateLabel, ...Array.from({ length: Math.max(0, columns.length - 1) }, () => "")]];

  const columnStyles = columns.reduce<Record<number, { cellWidth?: number; halign?: "left" | "center" | "right" }>>(
    (styles, column, index) => {
      styles[index] = {
        halign: column.align || "left",
      };
      if (column.width) {
        styles[index].cellWidth = column.width;
      }
      return styles;
    },
    {},
  );

  autoTable(document, {
    body: bodyRows,
    columnStyles,
    head: [columns.map((column) => column.header)],
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
    },
    margin: {
      bottom: 32,
      left: 40,
      right: 40,
      top: 40,
    },
    startY: cursorY + 8,
    styles: {
      cellPadding: 4,
      fontSize: 8,
      overflow: "linebreak",
      valign: "top",
    },
  });

  const footerText = [sourceLabel ? `Sumber: ${sourceLabel}` : null, traceId ? `Ref: ${traceId}` : null]
    .filter(Boolean)
    .join(" | ");

  if (footerText) {
    const totalPages = document.getNumberOfPages();
    document.setFontSize(8);
    document.setTextColor(100);
    for (let page = 1; page <= totalPages; page += 1) {
      document.setPage(page);
      document.text(footerText, 40, pageHeight - 16);
      document.text(`Halaman ${page}/${totalPages}`, pageWidth - 40, pageHeight - 16, { align: "right" });
    }
  }

  const blob = document.output("blob");
  downloadBlobFile(filename, blob);
  return blob;
}

export async function recordReportOutputAudit({
  action,
  filters,
  outputType,
  reportName,
  rowCount,
  tenantId,
  traceId,
}: {
  action: string;
  filters?: Record<string, unknown>;
  outputType: "csv" | "pdf";
  reportName: string;
  rowCount: number;
  tenantId?: string | null;
  traceId: string;
}) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await logAuditIfEnabled({
      tenantId,
      payload: {
        tenant_id: tenantId || null,
        user_id: user?.id || null,
        table_name: "report_exports",
        action,
        record_id: traceId,
        new_values: {
          trace_id: traceId,
          report_name: reportName,
          output_type: outputType,
          row_count: rowCount,
          filters: filters || null,
        } as Json,
      },
    });

    if (error) throw error;
    return { ok: true as const };
  } catch (error) {
    const errorRef = reportError(error, "report.output.audit", {
      action,
      output_type: outputType,
      report_name: reportName,
      row_count: rowCount,
      tenant_id: tenantId,
      trace_id: traceId,
    });
    return {
      errorRef,
      ok: false as const,
    };
  }
}
