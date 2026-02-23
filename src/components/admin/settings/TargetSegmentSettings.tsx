import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2, HeartHandshake, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface SegmentItem {
  title: string;
  description: string;
  features: string[];
  icon: string;
  color: string;
}

interface TargetSegmentConfig {
  section_title: string;
  section_subtitle: string;
  badge_text: string;
  segments: SegmentItem[];
}

const defaultConfig: TargetSegmentConfig = {
  section_title: "Dirancang untuk Berbagai Organisasi",
  section_subtitle: "AbsensiKu melayani kebutuhan absensi dari berbagai jenis organisasi dengan fitur yang dapat dikustomisasi.",
  badge_text: "Solusi untuk Semua",
  segments: [
    {
      title: "Pemerintah Daerah",
      description: "Solusi absensi untuk Pemda, OPD, dan unit kerja pemerintah daerah dengan standar audit BPK.",
      features: ["Multi OPD & Lokasi Kerja", "Audit trail Inspektorat", "Laporan rekapitulasi"],
      icon: "Landmark",
      color: "primary",
    },
    {
      title: "Instansi Pemerintah",
      description: "Untuk Kementerian, Lembaga, BUMN, BUMD, Institusi dan instansi pemerintah vertikal lainnya.",
      features: ["Struktur hierarki ASN", "Integrasi NIP", "Sinkronisasi SIMPEG"],
      icon: "Building",
      color: "info",
    },
    {
      title: "Perusahaan",
      description: "Solusi fleksibel untuk perusahaan swasta dari startup hingga korporasi besar.",
      features: ["Multi cabang & divisi", "Shift kerja fleksibel", "API Integrasi HR & payroll"],
      icon: "Briefcase",
      color: "accent",
    },
    {
      title: "Sekolah",
      description: "Sistem absensi guru, staf, dan tenaga kependidikan untuk semua jenjang pendidikan.",
      features: ["Guru & tenaga pendidik", "Kalender akademik", "Laporan"],
      icon: "GraduationCap",
      color: "success",
    },
  ],
};

export function TargetSegmentSettings() {
  const [config, setConfig] = useState<TargetSegmentConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "target_segment_settings")
            .maybeSingle(),
        10000,
        "Load target segment settings timeout"
      );

      if (error) throw error;
      if (data?.value) {
        setConfig({ ...defaultConfig, ...(data.value as Partial<TargetSegmentConfig>) });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.target_segment.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan target segment", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const configValue = JSON.parse(JSON.stringify(config));
      
      const { data: existing } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("id")
            .eq("key", "target_segment_settings")
            .maybeSingle(),
        10000,
        "Load target segment existing setting timeout"
      );

      if (existing) {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .update({
                value: configValue,
                updated_at: new Date().toISOString(),
              })
              .eq("key", "target_segment_settings"),
          10000,
          "Update target segment settings timeout"
        );
        if (error) throw error;
      } else {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .insert([{
                key: "target_segment_settings",
                value: configValue,
              }]),
          10000,
          "Insert target segment settings timeout"
        );
        if (error) throw error;
      }

      toast.success("Pengaturan berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.target_segment.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const updateSegment = <K extends keyof SegmentItem>(
    index: number,
    field: K,
    value: SegmentItem[K]
  ) => {
    const newSegments = [...config.segments];
    newSegments[index] = { ...newSegments[index], [field]: value };
    setConfig({ ...config, segments: newSegments });
  };

  const updateSegmentFeature = (segmentIndex: number, featureIndex: number, value: string) => {
    const newSegments = [...config.segments];
    const newFeatures = [...newSegments[segmentIndex].features];
    newFeatures[featureIndex] = value;
    newSegments[segmentIndex] = { ...newSegments[segmentIndex], features: newFeatures };
    setConfig({ ...config, segments: newSegments });
  };

  const addFeature = (segmentIndex: number) => {
    const newSegments = [...config.segments];
    newSegments[segmentIndex].features.push("");
    setConfig({ ...config, segments: newSegments });
  };

  const removeFeature = (segmentIndex: number, featureIndex: number) => {
    const newSegments = [...config.segments];
    newSegments[segmentIndex].features.splice(featureIndex, 1);
    setConfig({ ...config, segments: newSegments });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-primary" />
            Pengaturan Solusi untuk Semua
          </h3>
          <p className="text-sm text-muted-foreground">Kelola section target segment di halaman utama</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Simpan
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pengaturan Umum</CardTitle>
          <CardDescription>Judul dan deskripsi section</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="badge_text">Teks Badge</Label>
            <Input
              id="badge_text"
              value={config.badge_text}
              onChange={(e) => setConfig({ ...config, badge_text: e.target.value })}
              placeholder="Solusi untuk Semua"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="section_title">Judul Section</Label>
            <Input
              id="section_title"
              value={config.section_title}
              onChange={(e) => setConfig({ ...config, section_title: e.target.value })}
              placeholder="Dirancang untuk Berbagai Organisasi"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="section_subtitle">Subjudul</Label>
            <Textarea
              id="section_subtitle"
              value={config.section_subtitle}
              onChange={(e) => setConfig({ ...config, section_subtitle: e.target.value })}
              placeholder="Deskripsi singkat tentang section ini"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {config.segments.map((segment, segmentIndex) => (
        <Card key={segmentIndex}>
          <CardHeader>
            <CardTitle className="text-base">Segment {segmentIndex + 1}: {segment.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Judul</Label>
                <Input
                  value={segment.title}
                  onChange={(e) => updateSegment(segmentIndex, "title", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Warna</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={segment.color}
                  onChange={(e) => updateSegment(segmentIndex, "color", e.target.value)}
                >
                  <option value="primary">Primary</option>
                  <option value="info">Info</option>
                  <option value="accent">Accent</option>
                  <option value="success">Success</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Deskripsi</Label>
              <Textarea
                value={segment.description}
                onChange={(e) => updateSegment(segmentIndex, "description", e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Fitur</Label>
              <div className="space-y-2">
                {segment.features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex gap-2">
                    <Input
                      value={feature}
                      onChange={(e) => updateSegmentFeature(segmentIndex, featureIndex, e.target.value)}
                      placeholder="Nama fitur"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFeature(segmentIndex, featureIndex)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addFeature(segmentIndex)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Fitur
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
