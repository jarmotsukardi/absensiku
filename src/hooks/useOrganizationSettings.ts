import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from "react-router-dom";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';
import type { Tables } from '@/integrations/supabase/types';

type Tenant = Tables<'tenants'>;

interface OrganizationInfo {
  id: string;
  name: string;
  code: string;
  billing_mode: string;
  timezone: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  landing_hero_image: string | null;
  description: string | null;
  organization_type: string | null;
  whatsapp: string | null;
  pic_name: string | null;
  pic_whatsapp: string | null;
}

export function useOrganizationSettings() {
  const [searchParams] = useSearchParams();
  const queryTenantId = searchParams.get("tenant_id");
  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganization = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Resolve tenant context:
      // 1) admin_instansi role tenant_id
      // 2) super_admin with explicit ?tenant_id=...
      // 3) fallback employee.tenant_id
      const { data: roleRows, error: roleError } = await supabase
        .from('user_roles')
        .select('role, tenant_id')
        .eq('user_id', user.id);
      if (roleError) throw roleError;

      const adminRole = roleRows?.find((r) => r.role === "admin_instansi" && r.tenant_id);
      const isSuperAdmin = roleRows?.some((r) => r.role === "super_admin");

      let resolvedTenantId: string | null = adminRole?.tenant_id || null;
      if (!resolvedTenantId && isSuperAdmin && queryTenantId) {
        resolvedTenantId = queryTenantId;
      }

      if (!resolvedTenantId) {
        const { data: employee, error: empError } = await supabase
          .from('employees')
          .select('tenant_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (empError) throw empError;
        resolvedTenantId = employee?.tenant_id || null;
      }

      if (!resolvedTenantId) throw new Error('Tenant not found');

      // Get tenant info
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', resolvedTenantId)
        .single();

      if (tenantError) throw tenantError;

      const tenantData = tenant as Tenant;
      setOrganization({
        id: tenantData.id,
        name: tenantData.name,
        code: tenantData.code,
        billing_mode: tenantData.billing_mode,
        timezone: tenantData.timezone || DEFAULT_TIMEZONE,
        email: tenantData.email,
        phone: tenantData.phone,
        address: tenantData.address,
        logo_url: tenantData.logo_url,
        landing_hero_image: tenantData.landing_hero_image,
        description: tenantData.description,
        organization_type: tenantData.organization_type,
        whatsapp: tenantData.whatsapp,
        pic_name: tenantData.pic_name || null,
        pic_whatsapp: tenantData.pic_whatsapp || null,
      });
    } catch (err: unknown) {
      console.error('Error fetching organization:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [queryTenantId]);

  const updateOrganization = async (updates: Partial<OrganizationInfo>): Promise<boolean> => {
    if (!organization) return false;
    
    try {
      // Buat object update yang bersih (tanpa id dan code)
      const cleanUpdates: Record<string, unknown> = {};
      const allowedFields = ['name', 'email', 'phone', 'address', 'description', 'timezone', 'logo_url', 'landing_hero_image', 'whatsapp', 'organization_type', 'pic_name', 'pic_whatsapp'];
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          cleanUpdates[key] = value;
        }
      }
      
      // Tambahkan updated_at
      cleanUpdates.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('tenants')
        .update(cleanUpdates)
        .eq('id', organization.id);

      if (error) {
        console.error('Supabase update error:', error);
        throw error;
      }

      // Refetch data setelah update untuk memastikan data tersinkron
      await fetchOrganization();
      
      toast.success('Pengaturan berhasil disimpan');
      return true;
    } catch (err: unknown) {
      console.error('Error updating organization:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Gagal menyimpan pengaturan: ' + errorMessage);
      return false;
    }
  };

  const updateTimezone = async (timezone: string) => {
    return updateOrganization({ timezone });
  };

  useEffect(() => {
    void fetchOrganization();
  }, [fetchOrganization]);

  return {
    organization,
    isLoading,
    error,
    updateOrganization,
    updateTimezone,
    refetch: fetchOrganization,
  };
}
