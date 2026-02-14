import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';

interface OrganizationInfo {
  id: string;
  name: string;
  code: string;
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
  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganization = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get tenant_id from employee
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (empError) throw empError;
      if (!employee?.tenant_id) throw new Error('Tenant not found');

      // Get tenant info
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', employee.tenant_id)
        .single();

      if (tenantError) throw tenantError;

      setOrganization({
        id: tenant.id,
        name: tenant.name,
        code: tenant.code,
        timezone: (tenant as any).timezone || DEFAULT_TIMEZONE,
        email: tenant.email,
        phone: tenant.phone,
        address: tenant.address,
        logo_url: tenant.logo_url,
        landing_hero_image: tenant.landing_hero_image,
        description: tenant.description,
        organization_type: tenant.organization_type,
        whatsapp: tenant.whatsapp,
        pic_name: (tenant as any).pic_name || null,
        pic_whatsapp: (tenant as any).pic_whatsapp || null,
      });
    } catch (err: any) {
      console.error('Error fetching organization:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

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
    } catch (err: any) {
      console.error('Error updating organization:', err);
      toast.error('Gagal menyimpan pengaturan: ' + (err.message || 'Unknown error'));
      return false;
    }
  };

  const updateTimezone = async (timezone: string) => {
    return updateOrganization({ timezone });
  };

  useEffect(() => {
    fetchOrganization();
  }, []);

  return {
    organization,
    isLoading,
    error,
    updateOrganization,
    updateTimezone,
    refetch: fetchOrganization,
  };
}
