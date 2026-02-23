import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Info, Eye } from "lucide-react";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import DOMPurify from "dompurify";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

export function AboutPageSettings() {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "about_page_content")
            .maybeSingle(),
        10000,
        "Load about page settings timeout"
      );

      if (data?.value && typeof data.value === "object" && "content" in data.value) {
        setContent((data.value as { content: string }).content || "");
      } else {
        // Data dummy default
        setContent(`
<h2>Tentang AbsensiKu</h2>
<p><strong>AbsensiKu</strong> adalah platform sistem absensi digital modern berbasis GPS yang dirancang khusus untuk Pemerintah Daerah, Institusi, Perusahaan, dan Sekolah di seluruh Indonesia.</p>

<h3>Visi Kami</h3>
<p>Menjadi platform absensi digital terpercaya nomor satu di Indonesia yang membantu organisasi mengelola kehadiran pegawai dengan akurat, efisien, dan transparan.</p>

<h3>Misi Kami</h3>
<ul>
  <li>Menyediakan solusi absensi berbasis teknologi GPS yang akurat</li>
  <li>Membantu organisasi meningkatkan kedisiplinan pegawai</li>
  <li>Menghadirkan laporan kehadiran yang transparan dan real-time</li>
  <li>Mendukung digitalisasi pelayanan publik di Indonesia</li>
</ul>

<h3>Keunggulan AbsensiKu</h3>
<ul>
  <li><strong>Akurasi GPS:</strong> Verifikasi lokasi real-time dengan radius yang dapat dikonfigurasi</li>
  <li><strong>Multi-Platform:</strong> Tersedia dalam versi web dan aplikasi mobile</li>
  <li><strong>Keamanan Data:</strong> Enkripsi end-to-end dan perlindungan data sesuai standar</li>
  <li><strong>Laporan Lengkap:</strong> Rekapitulasi harian, mingguan, dan bulanan</li>
  <li><strong>Dukungan Teknis:</strong> Tim support yang siap membantu 24/7</li>
</ul>

<h3>Hubungi Kami</h3>
<p>Untuk informasi lebih lanjut, silakan hubungi tim kami melalui WhatsApp atau email yang tersedia di halaman kontak.</p>
        `.trim());
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.about_page.fetch");
      toast.error(appendErrorReference("Gagal memuat konten halaman Tentang", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("id")
            .eq("key", "about_page_content")
            .maybeSingle(),
        10000,
        "Load about page existing setting timeout"
      );

      const jsonValue = { content };

      if (existing) {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .update({ value: jsonValue, updated_at: new Date().toISOString() })
              .eq("key", "about_page_content"),
          10000,
          "Update about page setting timeout"
        );
        if (error) throw error;
      } else {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .insert({ key: "about_page_content", value: jsonValue }),
          10000,
          "Insert about page setting timeout"
        );
        if (error) throw error;
      }

      toast.success("Konten halaman Tentang berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.about_page.save");
      toast.error(appendErrorReference("Gagal menyimpan", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Halaman Tentang
          </CardTitle>
          <CardDescription>
            Kelola konten halaman "Tentang" yang ditampilkan di menu utama. Gunakan rich text editor untuk memformat konten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder="Tulis konten halaman Tentang di sini..."
          />

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setIsPreviewOpen(true)}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Simpan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Halaman Tentang</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none py-4">
            {content ? (
              <div
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(content, {
                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
                    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height', 'style'],
                  }),
                }}
              />
            ) : (
              <p className="text-muted-foreground">Belum ada konten.</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsPreviewOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
