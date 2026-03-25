import { Link } from "react-router-dom";
import { ArrowRight, Briefcase, Calculator, MapPin, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

const solutions = [
  {
    title: "Absensi",
    subtitle: "Fondasi operasional harian",
    description:
      "Mulai dari check-in, check-out, sinkronisasi, validasi lokasi, device binding, approval dasar, dan dashboard kehadiran yang bisa dipakai tim lapangan maupun kantor.",
    accent: "bg-primary/10 text-primary",
    href: "/#fitur",
    cta: "Lihat Fitur Absensi",
    icon: MapPin,
  },
  {
    title: "HR",
    subtitle: "Tahap lanjutan untuk operasi SDM",
    description:
      "Rapikan data pegawai, struktur organisasi, cuti, onboarding, offboarding, dokumen, dan layanan mandiri karyawan saat organisasi sudah siap memperluas fondasi Absensi.",
    accent: "bg-info/10 text-info",
    href: "/hr",
    cta: "Lihat Solusi HR",
    icon: Briefcase,
  },
  {
    title: "Payroll",
    subtitle: "Tahap lanjutan untuk proses penggajian",
    description:
      "Lanjutkan ke komponen gaji, periode payroll, validasi, approval, slip gaji, pembayaran, dan audit payroll ketika data Absensi dan HR organisasi sudah cukup matang.",
    accent: "bg-accent/15 text-accent-foreground",
    href: "/payroll",
    cta: "Lihat Solusi Payroll",
    icon: Calculator,
  },
];

export function SolutionsSection() {
  return (
    <section id="solusi" className="py-20 px-4 bg-muted/20">
      <div className="container mx-auto">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">
            <ShieldCheck className="h-4 w-4" />
            Jalur Pengembangan Dalam Satu Platform
          </div>
          <h2 className="mt-5 text-3xl font-bold text-foreground md:text-4xl">
            Absensi tetap jadi fokus utama operasional harian.
            <span className="block text-gradient">HR dan Payroll tersedia sebagai tahap lanjutan saat organisasi siap berkembang.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Mulai dari fondasi absensi yang rapi untuk tim lapangan maupun kantor. Ketika organisasi sudah siap,
            jalur lanjutan ke HR dan Payroll bisa dibuka tanpa memecah data atau pindah ekosistem.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {solutions.map((solution) => {
            const Icon = solution.icon;
            return (
              <article
                key={solution.title}
                className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-large"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${solution.accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {solution.subtitle}
                </p>
                <h3 className="mt-3 text-2xl font-bold text-foreground">{solution.title}</h3>
                <p className="mt-4 flex-1 text-sm leading-7 text-muted-foreground">{solution.description}</p>
                <div className="mt-6">
                  <Link to={solution.href}>
                    <Button variant="outline" className="group/cta w-full justify-between">
                      {solution.cta}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-1" />
                    </Button>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
