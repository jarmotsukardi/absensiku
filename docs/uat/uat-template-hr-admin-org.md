# Template UAT HR Admin dan Org

## Log Update yang Sudah Diuji
Gunakan format ini agar file hasil UAT bisa disinkronkan ke Monitoring UAT HR dengan `npm run uat:sync-monitoring`.

| Tanggal | Update | Area diuji | Ringkasan hasil | Referensi |
|---|---|---|---|---|
| YYYY-MM-DD | UAT HR <scope> | <area batch> | `0/0` lulus, siap | `docs/uat/uat-YYYY-MM-DD-hr-<scope>.md` |

## Metadata
- Tanggal:
- Scope:
- Environment: Localhost `http://127.0.0.1:5173` dengan Supabase remote
- Device / Browser:
- Build / Versi:
- Penguji:
- Release version:

## Data uji
- Tenant:
- Admin:
- Org admin:
- Operator:
- Pegawai:
- Catatan data:

## Ringkasan hasil
- Total skenario diuji:
- Lulus:
- Gagal:
- Skip:
- Verdict:

## Mapping monitoring
- Domain: `hr`
- Subdomain:
- Area diuji:
- Status logbook:
- Referensi monitoring:

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-01 |  |  |  |  |  |  |
| UAT-02 |  |  |  |  |  |  |
| UAT-03 |  |  |  |  |  |  |

## Command validasi
- 

## Checklist bukti
- Screenshot route inti
- Hasil command validasi
- Trace atau screenshot failure bila ada
- Bukti sync monitoring

## Bukti tambahan
- Screenshot:
- Link trace:
- Query/cek data:

## Risiko tersisa
- 

## Tindak lanjut
- 

## Sinkron monitoring
- Command:
  - `npm run uat:sync-monitoring -- --domain=hr --file docs/uat/<nama-file>.md`
- Hasil sync:

## Sign-off
- Status akhir:
- Disetujui oleh:
- Tanggal:
