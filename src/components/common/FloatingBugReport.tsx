import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bug, Star, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FloatingBugReportProps {
  tenantId?: string;
  employeeId?: string;
  reporterName?: string;
  reporterRole?: "admin_organisasi" | "pegawai";
}

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

export function FloatingBugReport({ tenantId, employeeId, reporterName, reporterRole = "pegawai" }: FloatingBugReportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settings, setSettings] = useState<FeedbackBugSettings>({
    is_enabled: true,
    bugs_enabled: true,
    suggestions_enabled: true,
  });
  const [feedbackType, setFeedbackType] = useState<"bug" | "saran">("saran");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");

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
    if (feedbackType === "bug" && !settings.bugs_enabled && settings.suggestions_enabled) {
      setFeedbackType("saran");
      return;
    }
    if (feedbackType === "saran" && !settings.suggestions_enabled && settings.bugs_enabled) {
      setFeedbackType("bug");
    }
  }, [feedbackType, settings.bugs_enabled, settings.suggestions_enabled]);

  const getMetadata = () => ({
    os_info: navigator.platform || "Unknown",
    browser_info: navigator.userAgent.split(" ").slice(-2).join(" ") || "Unknown",
  });

  const handleSubmit = async () => {
    if (!settings.is_enabled) {
      toast.error("Fitur feedback sedang dinonaktifkan sementara.");
      setIsOpen(false);
      return;
    }
    if (feedbackType === "bug" && !settings.bugs_enabled) {
      toast.error("Input bug sedang dinonaktifkan.");
      return;
    }
    if (feedbackType === "saran" && !settings.suggestions_enabled) {
      toast.error("Input saran sedang dinonaktifkan.");
      return;
    }
    if (!message.trim()) {
      toast.error("Pesan tidak boleh kosong");
      return;
    }
    if (rating === 0) {
      toast.error("Berikan rating terlebih dahulu");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const meta = getMetadata();

      const { error } = await supabase.from("feedback_reports").insert({
        tenant_id: tenantId || null,
        user_id: user?.id || null,
        employee_id: employeeId || null,
        reporter_name: reporterName || user?.email || "Anonim",
        reporter_role: reporterRole,
        feedback_type: feedbackType,
        rating,
        message: message.trim(),
        screenshot_url: screenshotUrl || null,
        os_info: meta.os_info,
        browser_info: meta.browser_info,
      });

      if (error) throw error;

      toast.success("Terima kasih! Feedback Anda telah dikirim.");
      setIsOpen(false);
      setMessage("");
      setRating(0);
      setScreenshotUrl("");
      setFeedbackType("saran");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Gagal mengirim feedback: " + message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!settings.is_enabled) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        aria-label="Lapor Bug / Feedback"
      >
        <Bug className="w-5 h-5" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="w-5 h-5 text-primary" />
              Kirim Feedback
            </DialogTitle>
            <DialogDescription>
              Laporkan bug atau berikan saran untuk meningkatkan kualitas layanan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipe</Label>
              <Select value={feedbackType} onValueChange={(v) => setFeedbackType(v as "bug" | "saran")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {settings.bugs_enabled && <SelectItem value="bug">🐛 Bug / Error</SelectItem>}
                  {settings.suggestions_enabled && <SelectItem value="saran">💡 Saran / Masukan</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Rating</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1"
                  >
                    <Star
                      className={cn(
                        "w-6 h-6 transition-colors",
                        (hoverRating || rating) >= star
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground"
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pesan</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={feedbackType === "bug" ? "Jelaskan bug yang Anda temui..." : "Berikan saran Anda..."}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Screenshot URL (Opsional)</Label>
              <Input
                value={screenshotUrl}
                onChange={(e) => setScreenshotUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Kirim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
