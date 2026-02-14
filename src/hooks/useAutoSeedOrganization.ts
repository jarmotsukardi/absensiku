import { supabase } from "@/integrations/supabase/client";

/**
 * Auto-seed data contoh saat admin organisasi pertama kali setup:
 * 1 OPD, 1 Satuan Kerja, 1 Lokasi Kerja
 */
export async function autoSeedOrganizationData(tenantId: string, organizationName: string) {
  try {
    // Cek apakah sudah ada data OPD untuk tenant ini
    const { count: opdCount } = await supabase
      .from("opd")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    if (opdCount && opdCount > 0) {
      // Data sudah ada, skip seeding
      return;
    }

    // 1. Buat OPD contoh
    const { data: opd, error: opdError } = await supabase
      .from("opd")
      .insert({
        tenant_id: tenantId,
        name: `Bagian Umum ${organizationName}`,
        code: "UMUM",
        is_active: true,
      })
      .select("id")
      .single();

    if (opdError) {
      console.error("Error seeding OPD:", opdError);
      return;
    }

    // 2. Buat Satuan Kerja contoh
    const { data: workUnit, error: wuError } = await supabase
      .from("work_units")
      .insert({
        tenant_id: tenantId,
        opd_id: opd.id,
        name: "Satuan Kerja Utama",
        institution_type: "pemerintahan",
        is_active: true,
      })
      .select("id")
      .single();

    if (wuError) {
      console.error("Error seeding Work Unit:", wuError);
      return;
    }

    // 3. Buat Lokasi Kerja contoh
    const { error: officeError } = await supabase
      .from("offices")
      .insert({
        tenant_id: tenantId,
        opd_id: opd.id,
        name: `Kantor ${organizationName}`,
        latitude: -3.6553,
        longitude: 128.1908,
        radius_meters: 100,
        is_active: true,
      });

    if (officeError) {
      console.error("Error seeding Office:", officeError);
      return;
    }

    // 4. Buat Jabatan contoh
    await supabase.from("positions").insert({
      tenant_id: tenantId,
      work_unit_id: workUnit.id,
      name: "Staf",
      is_active: true,
    });

    console.log("Auto-seed organization data completed for tenant:", tenantId);
  } catch (error) {
    console.error("Error in autoSeedOrganizationData:", error);
  }
}
