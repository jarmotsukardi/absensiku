import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadonlyAttendanceNotice } from "@/components/dashboard/ReadonlyAttendanceNotice";

interface FaqItem {
  id: string;
  question: string;
  answer?: string | null;
}

interface ReadonlyHelpTabProps {
  panelClass: string;
  faqItems: FaqItem[];
  expandedFaqId: string | null;
  onToggleFaq: (id: string) => void;
}

export function ReadonlyHelpTab({
  panelClass,
  faqItems,
  expandedFaqId,
  onToggleFaq,
}: ReadonlyHelpTabProps) {
  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Bantuan</CardTitle>
        <CardDescription>Pertanyaan yang sering diajukan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ReadonlyAttendanceNotice className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" />
        {faqItems.length === 0 ? (
          <p className="text-sm text-slate-600">Belum ada FAQ.</p>
        ) : (
          faqItems.map((f) => (
            <div key={f.id} className="overflow-hidden rounded-xl border border-slate-200">
              <button
                className="flex w-full items-center justify-between p-3 text-left hover:bg-slate-50"
                onClick={() => onToggleFaq(f.id)}
              >
                <p className="font-medium">{f.question}</p>
                <ChevronRight
                  className={`h-4 w-4 text-slate-500 transition-transform ${expandedFaqId === f.id ? "rotate-90" : ""}`}
                />
              </button>
              {expandedFaqId === f.id && (
                <div className="border-t border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-sm text-slate-700">{f.answer || "Jawaban belum tersedia."}</p>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
