import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SurveyModalProps {
  tenantId?: string;
  employeeId?: string;
  reporterName?: string;
  reporterRole?: "admin_organisasi" | "pegawai";
  streakCount: number;
}

const SURVEY_DAYS = [10, 20, 30];

interface FeedbackBugSettings {
  is_enabled: boolean;
  bugs_enabled: boolean;
  suggestions_enabled: boolean;
}

const normalizeFeedbackSettings = (raw: unknown): FeedbackBugSettings => {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const legacyEnabled = value.is_enabled !== false;
  const bugsEnabled = typeof value.bugs_enabled === "boolean" ? value.bugs_enabled : legacyEnabled;
  const suggestionsEnabled = typeof value.suggestions_enabled === "boolean" ? value.suggestions_enabled : legacyEnabled;
  return {
    is_enabled: bugsEnabled || suggestionsEnabled,
    bugs_enabled: bugsEnabled,
    suggestions_enabled: suggestionsEnabled,
  };
};

export function SurveyModal({ tenantId, employeeId, reporterName, reporterRole = "pegawai", streakCount }: SurveyModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<FeedbackBugSettings>({
    is_enabled: true,
    bugs_enabled: true,
    suggestions_enabled: true,
  });
  const [surveyDay, setSurveyDay] = useState(0);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "feedback_bug_settings")
          .maybeSingle();
        if (error) throw error;
        setSettings(normalizeFeedbackSettings(data?.value));
      } catch {
        setSettings({
          is_enabled: true,
          bugs_enabled: true,
          suggestions_enabled: true,
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (!settings.suggestions_enabled) return;
    if (!SURVEY_DAYS.includes(streakCount)) return;

    // Check if user already submitted survey for this day
    const storageKey = `survey_submitted_${tenantId}_day${streakCount}`;
    if (localStorage.getItem(storageKey)) return;

    setSurveyDay(streakCount);
    const timer = setTimeout(() => setIsOpen(true), 2000);
    return () => clearTimeout(timer);
  }, [streakCount, tenantId, settings.suggestions_enabled]);

  const handleSubmit = async () => {
    if (!settings.suggestions_enabled) {
      toast.error("Fitur survei feedback sedang dinonaktifkan.");
      setIsOpen(false);
      return;
    }
    if (rating === 0) {
      toast.error("Berikan rating terlebih dahulu");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from("feedback_reports").insert({
        tenant_id: tenantId || null,
        user_id: user?.id || null,
        employee_id: employeeId || null,
        reporter_name: reporterName || "Anonim",
        reporter_role: reporterRole,
        feedback_type: "saran",
        rating,
        message: message.trim() || `Survei otomatis hari ke-${surveyDay}`,
        os_info: navigator.platform || "Unknown",
        browser_info: navigator.userAgent.split(" ").slice(-2).join(" ") || "Unknown",
        survey_day: surveyDay,
      });

      localStorage.setItem(`survey_submitted_${tenantId}_day${surveyDay}`, "true");
      toast.success("Terima kasih atas feedback Anda!");
      setIsOpen(false);
    } catch (error: any) {
      toast.error("Gagal mengirim survei");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(`survey_submitted_${tenantId}_day${surveyDay}`, "skipped");
    setIsOpen(false);
  };

  const titles: Record<number, string> = {
    10: "Bagaimana pengalaman 10 hari pertama?",
    20: "Anda sudah 20 hari! Bagaimana sejauh ini?",
    30: "Selamat 30 hari! Berikan penilaian akhir.",
  };

  if (!settings.suggestions_enabled || !isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            Survei Hari Ke-{surveyDay}
          </DialogTitle>
          <DialogDescription>{titles[surveyDay] || "Bagaimana pengalaman Anda?"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Rating Keseluruhan</Label>
            <div className="flex gap-1 justify-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1"
                >
                  <Star className={cn("w-8 h-8 transition-colors", (hoverRating || rating) >= star ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Komentar (Opsional)</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ada masukan untuk kami?" rows={3} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleSkip}>Lewati</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || rating === 0}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Kirim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
