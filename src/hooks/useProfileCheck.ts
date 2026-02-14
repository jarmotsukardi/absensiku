import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export function useProfileCheck() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [isProfileComplete, setIsProfileComplete] = useState(false);

  useEffect(() => {
    checkProfile();
  }, []);

  const checkProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsChecking(false);
        return;
      }

      // Check if user is admin_instansi
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id)
        .single();

      if (roleData?.role !== "admin_instansi") {
        // Not an org admin, skip check
        setIsProfileComplete(true);
        setIsChecking(false);
        return;
      }

      if (!roleData?.tenant_id) {
        setIsChecking(false);
        return;
      }

      // Check if profile is complete
      const { data: tenant } = await supabase
        .from("tenants")
        .select("pic_name, pic_whatsapp, address")
        .eq("id", roleData.tenant_id)
        .single();

      if (!tenant?.pic_name || !tenant?.pic_whatsapp || !tenant?.address) {
        // Profile incomplete, redirect to setup
        navigate("/org/profile/setup");
        return;
      }

      setIsProfileComplete(true);
    } catch (error) {
      console.error("Error checking profile:", error);
    } finally {
      setIsChecking(false);
    }
  };

  return { isChecking, isProfileComplete };
}
