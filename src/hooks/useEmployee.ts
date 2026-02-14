import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;
type Office = Tables<"offices">;

export function useEmployee(user: User | null) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [office, setOffice] = useState<Office | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setEmployee(null);
      setOffice(null);
      setIsLoading(false);
      return;
    }

    const fetchEmployee = async () => {
      try {
        setIsLoading(true);
        
        const { data: employeeData, error: employeeError } = await supabase
          .from("employees")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (employeeError) {
          if (employeeError.code === "PGRST116") {
            // No employee record found
            setEmployee(null);
            setError("Data pegawai tidak ditemukan");
          } else {
            throw employeeError;
          }
        } else {
          setEmployee(employeeData);

          // Fetch office if employee has one
          if (employeeData.office_id) {
            const { data: officeData, error: officeError } = await supabase
              .from("offices")
              .select("*")
              .eq("id", employeeData.office_id)
              .single();

            if (!officeError && officeData) {
              setOffice(officeData);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching employee:", err);
        setError(err instanceof Error ? err.message : "Gagal memuat data pegawai");
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployee();
  }, [user]);

  return { employee, office, isLoading, error };
}
