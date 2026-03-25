# HR Module Workspace (Blueprint Historis)

Modul HR tetap berada di folder `ABSENSIKU/apps/hr` sebagai blueprint dan referensi domain.

Catatan status:
- Dokumen di folder ini tidak menjadi sumber kebenaran status kerja harian.
- Status operasional aktual harus mengikuti `AGENTS.md`, dokumen operasional utama, dan arahan user pada turn aktif.
- Tidak ada penghapusan folder/file HR.
- Baseline workspace `/org/hr` sudah disiapkan lebih lengkap untuk fondasi domain:
  - fondasi pegawai dan struktur
  - lifecycle pegawai
  - kebijakan kehadiran dan cuti
  - kinerja
  - pelatihan
  - ATS
  - ESS
- Baseline `/admin/hr` juga sudah aktif untuk governance:
  - audit HR
  - kebijakan HR
  - helpdesk platform HR
  - coverage map dan section bridge

Catatan:
- Fokus operasional harian saat ini: absensi.
- Panduan domain utama tetap mengacu ke `docs/panduan_membangun_hr.md`.
- Untuk status route terbaru, acuan utama adalah `docs/panduan_membangun_hr.md` bagian `Status Cepat` dan `src/lib/hrRouteAccess.ts`.
- Payroll tidak boleh disimpulkan statusnya dari folder ini; lihat dokumen operasional utama.
