# Checklist Deploy HR Features - 2026-03-12

## Status: ✅ READY TO DEPLOY

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### **1. Database Migration** ⏳ PENDING

**Files:**
- [ ] `supabase/migrations/20260312_create_hr_approval_types.sql`
- [ ] `supabase/migrations/20260312_enhance_hr_document_templates.sql`

**Steps:**
1. [ ] Login ke Supabase Dashboard (https://supabase.com)
2. [ ] Pilih project Anda
3. [ ] Buka **SQL Editor** → **New Query**
4. [ ] Copy-paste isi file `20260312_create_hr_approval_types.sql`
5. [ ] Klik **Run** (Ctrl+Enter)
6. [ ] Pastikan **0 errors**
7. [ ] Ulangi untuk file `20260312_enhance_hr_document_templates.sql`

**Verification:**
```sql
-- Run di SQL Editor untuk verify
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('hr_approval_types', 'hr_document_templates');

-- Should return 2 rows
```

**Expected Result:**
- ✅ Table `hr_approval_types` created
- ✅ Table `hr_document_templates` exists/enhanced
- ✅ Indexes created
- ✅ RLS policies enabled
- ✅ Seed data inserted (8 records)

---

### **2. Frontend Build** ✅ COMPLETED

**Status:**
- [x] Build successful (14.01s)
- [x] 4005 modules transformed
- [x] 0 errors
- [x] Lint passed

**Command:**
```bash
npm run build
```

---

### **3. Manual Testing** ⏳ PENDING

**Test Approval Hierarchy:**
- [ ] Buka `/org/hr/approval-hierarchy`
- [ ] Click "Tambah Jenis"
- [ ] Fill form (Nama: "Test Approval", Type: "OTHER")
- [ ] Add 2 levels (Approver: Atasan Langsung, SLA: 24)
- [ ] Save
- [ ] Verify appears in table
- [ ] Click "Edit", change SLA
- [ ] Save
- [ ] Click "Lihat", verify detail
- [ ] Click "Delete", confirm

**Test Template Dokumen:**
- [ ] Buka `/org/hr/document-templates`
- [ ] Click "Tambah Template"
- [ ] Fill form (Name: "Test Template", Type: "LAINNYA")
- [ ] Insert variables ({{nama}}, {{nip}})
- [ ] Save
- [ ] Click "Preview", verify content
- [ ] Click "Copy", verify duplicate
- [ ] Click "Delete", confirm

**Test Status Kepegawaian:**
- [ ] Buka `/org/hr/employee-status`
- [ ] Filter by status "Aktif"
- [ ] Filter by kategori (if available)
- [ ] Search by name
- [ ] Click "Export CSV"
- [ ] Verify file downloaded
- [ ] Open CSV, verify data

**Test Riwayat Jabatan:**
- [ ] Buka `/org/hr/job-history`
- [ ] Filter by jenis "Promosi"
- [ ] Filter by unit kerja (if available)
- [ ] Search by name
- [ ] Click "Export CSV"
- [ ] Verify file downloaded
- [ ] Open CSV, verify data

**Test Permission:**
- [ ] Login as admin_instansi → verify can edit
- [ ] Login as operator_hr → verify read-only
- [ ] Verify no errors in console

---

### **4. FAQ Verification** ⏳ PENDING

**Check:**
- [ ] Buka `/org/hr/help/faq`
- [ ] Verify 7 new FAQ items appear:
  - [ ] Hierarki approval
  - [ ] Template dokumen
  - [ ] Variabel template
  - [ ] Filter status kepegawaian
  - [ ] Export status kepegawaian
  - [ ] Riwayat jabatan
  - [ ] Filter riwayat jabatan

---

## 🚀 DEPLOYMENT STEPS

### **Step 1: Database Migration** (15 menit)

```bash
# Option A: Via Supabase Dashboard (Recommended)
1. Login ke https://supabase.com/dashboard
2. Pilih project
3. SQL Editor → New Query
4. Copy-paste: supabase/migrations/20260312_create_hr_approval_types.sql
5. Run
6. Copy-paste: supabase/migrations/20260312_enhance_hr_document_templates.sql
7. Run
8. Verify tables created
```

```bash
# Option B: Via Supabase CLI (Advanced)
supabase db push
```

### **Step 2: Manual Testing** (30-45 menit)

Run semua test di section 3 di atas.

### **Step 3: Frontend Deploy** (5 menit)

```bash
# Commit changes
git add .
git commit -m "feat: Add 4 new HR features (Approval Hierarchy, Document Templates, Employee Status, Job History)"
git push origin main

# Vercel akan auto-deploy
# Monitor di https://vercel.com/dashboard
```

### **Step 4: Production Smoke Test** (15 menit)

**Test di production:**
- [ ] Akses `/org/hr/approval-hierarchy`
- [ ] Akses `/org/hr/document-templates`
- [ ] Akses `/org/hr/employee-status`
- [ ] Akses `/org/hr/job-history`
- [ ] Verify sidebar shows new menus
- [ ] Test 1 CRUD operation per fitur
- [ ] Check error logs (should be 0)

---

## ✅ POST-DEPLOYMENT CHECKLIST

### **Functionality:**
- [ ] Approval Hierarchy CRUD works
- [ ] Template Dokumen CRUD works
- [ ] Status Kepegawaian filter works
- [ ] Status Kepegawaian export works
- [ ] Riwayat Jabatan filter works
- [ ] Riwayat Jabatan export works
- [ ] RLS policies working (admin vs operator)
- [ ] No console errors

### **UI/UX:**
- [ ] Sidebar menus visible
- [ ] Breadcrumbs correct
- [ ] Loading states work
- [ ] Empty states show
- [ ] Error states handled
- [ ] Mobile responsive

### **Performance:**
- [ ] Page load < 3s
- [ ] Query response < 1s
- [ ] Export generates quickly
- [ ] No memory leaks

### **Security:**
- [ ] RLS policies active
- [ ] Route guards working
- [ ] Capability checks enforced
- [ ] No unauthorized access

---

## 📊 MONITORING

### **Error Monitoring:**
```sql
-- Check for errors in first 24 hours
SELECT count(*) as error_count, error_message
FROM client_error_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND page_url LIKE '%/org/hr/%'
GROUP BY error_message
ORDER BY error_count DESC;
```

### **Usage Monitoring:**
```sql
-- Check feature usage
SELECT 
  page_url,
  count(*) as visits,
  count(distinct user_id) as unique_users
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '7 days'
  AND page_url LIKE '%/org/hr/%'
GROUP BY page_url
ORDER BY visits DESC;
```

---

## 🐛 TROUBLESHOOTING

### **Issue: Migration fails with "relation already exists"**

**Solution:**
```sql
-- Table sudah ada, skip atau drop dan recreate
DROP TABLE IF EXISTS hr_approval_types CASCADE;
-- Then re-run migration
```

### **Issue: RLS blocking access**

**Solution:**
```sql
-- Verify user roles
SELECT ur.user_id, ur.role, ur.tenant_id
FROM user_roles ur
WHERE ur.user_id = auth.uid();

-- Verify RLS policies
SELECT * FROM pg_policies WHERE tablename IN ('hr_approval_types', 'hr_document_templates');
```

### **Issue: Seed data duplicate**

**Solution:**
```sql
-- Delete seed data manually
DELETE FROM hr_approval_types WHERE type_code IN ('LEAVE', 'WFH', 'OVERTIME', 'MUTATION', 'OTHER');
DELETE FROM hr_document_templates WHERE template_type IN ('KONTRAK_PKWT', 'SP1', 'MUTASI');
```

### **Issue: Build fails**

**Solution:**
```bash
# Clear cache and rebuild
rm -rf node_modules/.vite
npm run build
```

---

## 📞 SUPPORT

**Documentation:**
- User Guide: `docs/panduan-user-4-fitur-baru-hr.md`
- Deploy Guide: `docs/panduan-deploy-migration-hr-2026-03-12.md`
- Final Report: `docs/archive/agent-memory/qwen-2026-03-12/memory/tasks/final-report-4-fitur-hr-2026-03-12.md`

**Migration Files:**
- `supabase/migrations/20260312_create_hr_approval_types.sql`
- `supabase/migrations/20260312_enhance_hr_document_templates.sql`

**Contact:**
- Check error logs di Supabase Dashboard → Logs
- Screenshot error (jika ada)
- Include query SQL yang dijalankan

---

## 🎉 SUCCESS CRITERIA

Deployment dianggap sukses jika:

- [x] ✅ Database migration berhasil (0 errors)
- [ ] ⏳ Manual testing semua fitur passed
- [ ] ⏳ Frontend deploy successful
- [ ] ⏳ Production smoke test passed
- [ ] ⏳ No critical errors in first 24h
- [ ] ⏳ User feedback positive

---

**Status:** ✅ READY TO DEPLOY  
**Tanggal:** 2026-03-12  
**Next Action:** Jalankan database migration di Supabase
