import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  UserPlus, 
  Search, 
  Copy, 
  Check, 
  X, 
  Clock, 
  Link as LinkIcon,
  Pencil,
  Trash2,
  MessageSquare,
  Building2,
  MapPin,
  User,
  CalendarClock,
} from "lucide-react";
import { addDays, format } from "date-fns";
import type { TablesInsert } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import {
  DEFAULT_ORG_MASTER_DATA_MODULES,
  fetchTenantOrgMasterDataModules,
} from "@/lib/orgMasterDataModules";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  buildInvitationLink,
  ensureIndividualEmployeeInvitation,
  logEmployeeInvitationFlowAudit,
  sendEmployeeInvitationEmail,
} from "@/lib/employeeInvitations";

interface Invitation {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  nik: string;
  status: string;
  invitation_code: string;
  invitation_type: string;
  expires_at: string | null;
  created_at: string;
  verified_at: string | null;
  opd_id: string | null;
  opd?: { id: string; name: string } | null;
  office?: { id: string; name: string } | null;
}

interface OPD {
  id: string;
  name: string;
}

interface Office {
  id: string;
  name: string;
}

interface EmployeeCandidate {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  nik: string;
  phone: string | null;
  opd_id: string | null;
  office_id: string | null;
}

type InvitationType = "individual" | "opd" | "office";

const DEFAULT_ITEMS_PER_PAGE = 15;
const INVITATION_PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;
const ORG_INVITATIONS_QUERY_TIMEOUT_MS = 12000;
const ORG_INVITATIONS_QUERY_RETRY_MAX = 2;

export default function OrgEmployeeInvitations() {
  const confirmDialog = useConfirmDialog();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalInvitations, setTotalInvitations] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterOpdId, setFilterOpdId] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(DEFAULT_ITEMS_PER_PAGE);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [invitationType, setInvitationType] = useState<InvitationType>("individual");
  const [expiryDays, setExpiryDays] = useState("7");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    nik: "",
    opd_id: "",
    office_id: "",
  });
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedExpiresAt, setGeneratedExpiresAt] = useState<string | null>(null);
  const [generatedInvitationId, setGeneratedInvitationId] = useState<string | null>(null);
  const [invitationEmailStatus, setInvitationEmailStatus] = useState<string | null>(null);
  const [isSendingInvitationEmail, setIsSendingInvitationEmail] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInvitationId, setEditingInvitationId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    email: "",
    phone: "",
    nik: "",
    opd_id: "",
    office_id: "",
    expires_at: "",
    status: "pending",
  });
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [officeList, setOfficeList] = useState<Office[]>([]);
  const [masterDataModules, setMasterDataModules] = useState(DEFAULT_ORG_MASTER_DATA_MODULES);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const canUseOpdInvitation = masterDataModules.opd_admins;
  const availableInvitationTypes = useMemo<InvitationType[]>(
    () => (canUseOpdInvitation ? ["individual", "opd", "office"] : ["individual", "office"]),
    [canUseOpdInvitation]
  );

  useEffect(() => {
    void fetchTenantAndData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (availableInvitationTypes.includes(invitationType)) return;
    const nextType = availableInvitationTypes[0] ?? "individual";
    setInvitationType(nextType);
    setFormData((prev) => ({ ...prev, opd_id: "" }));
  }, [availableInvitationTypes, invitationType]);

  useEffect(() => {
    if (!canUseOpdInvitation && filterOpdId !== "all") {
      setFilterOpdId("all");
    }
  }, [canUseOpdInvitation, filterOpdId]);

  const fetchTenantAndData = async () => {
    try {
      setLoadError(null);
      setIsRetrying(false);
      const resolvedTenantId = await withExponentialBackoff(
        () =>
          withTimeout(
            resolveOrgTenantId(),
            ORG_INVITATIONS_QUERY_TIMEOUT_MS,
            "org.invitations.fetch_tenant.resolve_tenant timeout"
          ),
        {
          maxRetries: ORG_INVITATIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (!resolvedTenantId) {
        setIsLoading(false);
        return;
      }
      setTenantId(resolvedTenantId);

      try {
        const moduleSetting = await withExponentialBackoff(
          () =>
            withTimeout(
              fetchTenantOrgMasterDataModules(resolvedTenantId),
              ORG_INVITATIONS_QUERY_TIMEOUT_MS,
              "org.invitations.fetch_tenant.modules timeout"
            ),
          {
            maxRetries: ORG_INVITATIONS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        setMasterDataModules(moduleSetting.modules);
      } catch (moduleError) {
        reportError(moduleError, "org.invitations.fetch_tenant.modules");
        setMasterDataModules(DEFAULT_ORG_MASTER_DATA_MODULES);
      }

      const [{ data: opdData, error: opdError }, { data: officeData, error: officeError }] = await withExponentialBackoff(
        () =>
          withTimeout(
            Promise.all([
              supabase
                .from("opd")
                .select("id, name")
                .eq("tenant_id", resolvedTenantId)
                .eq("is_active", true)
                .order("name"),
              supabase
                .from("offices")
                .select("id, name")
                .eq("tenant_id", resolvedTenantId)
                .eq("is_active", true)
                .order("name"),
            ]),
            ORG_INVITATIONS_QUERY_TIMEOUT_MS,
            "org.invitations.fetch_tenant.master_data timeout"
          ),
        {
          maxRetries: ORG_INVITATIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (opdError) throw opdError;
      if (officeError) throw officeError;
      setOpdList(opdData || []);
      setOfficeList(officeData || []);
    } catch (error) {
      const errorRef = reportError(error, "org.invitations.fetch_tenant_and_data");
      const message = appendErrorReference("Gagal memuat data undangan", errorRef);
      toast.error(message);
      setLoadError(message);
      setMasterDataModules(DEFAULT_ORG_MASTER_DATA_MODULES);
      setOpdList([]);
      setOfficeList([]);
    }
  };

  const fetchInvitations = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      setLoadError(null);
      setIsRetrying(false);
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from("employee_invitations")
        .select(`
          *,
          opd:opd_id(id, name),
          office:office_id(id, name)
        `, { count: "exact" })
        .eq("tenant_id", tenantId)
        .is("archived_at", null);

      if (filterStatus !== "all") {
        if (filterStatus === "pending") {
          const nowIso = new Date().toISOString();
          query = query
            .eq("status", "pending")
            .or(`expires_at.is.null,expires_at.gte.${nowIso}`);
        } else {
          query = query.eq("status", filterStatus);
        }
      }

      if (filterOpdId !== "all") {
        if (filterOpdId === "none") {
          query = query.is("opd_id", null);
        } else {
          query = query.eq("opd_id", filterOpdId);
        }
      }

      if (debouncedSearchTerm) {
        const escaped = debouncedSearchTerm.replace(/[%_]/g, "");
        query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,invitation_code.ilike.%${escaped}%`);
      }

      const { data, count, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            query
              .order("created_at", { ascending: false })
              .range(from, to),
            ORG_INVITATIONS_QUERY_TIMEOUT_MS,
            "org.invitations.fetch_list timeout"
          ),
        {
          maxRetries: ORG_INVITATIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setInvitations((data || []) as Invitation[]);
      setTotalInvitations(count || 0);
    } catch (error) {
      const errorRef = reportError(error, "org.invitations.fetch_list", {
        tenant_id: tenantId,
        page: currentPage,
        filter_status: filterStatus,
        filter_opd: filterOpdId,
      });
      const message = appendErrorReference("Gagal memuat daftar undangan", errorRef);
      toast.error(message);
      setLoadError(message);
      setInvitations([]);
      setTotalInvitations(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, currentPage, itemsPerPage, filterStatus, filterOpdId, debouncedSearchTerm]);

  useEffect(() => {
    if (!tenantId) return;
    void fetchInvitations();
  }, [tenantId, fetchInvitations]);

  const generateInvitationCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateInvitation = async () => {
    if (invitationType === "individual") {
      if (!formData.name || !formData.email || !formData.nik) {
        toast.error("Nama, Email, dan NIK harus diisi");
        return;
      }
    } else if (invitationType === "opd" && !canUseOpdInvitation) {
      toast.error("Undangan per OPD sedang dinonaktifkan di Setup Awal.");
      return;
    } else if (invitationType === "opd" && !formData.opd_id) {
      toast.error("Pilih OPD terlebih dahulu");
      return;
    } else if (invitationType === "office" && !formData.office_id) {
      toast.error("Pilih Lokasi Kerja terlebih dahulu");
      return;
    }

    try {
      setIsRetrying(false);
      const { data: { user } } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            ORG_INVITATIONS_QUERY_TIMEOUT_MS,
            "org.invitations.create.auth timeout"
          ),
        {
          maxRetries: ORG_INVITATIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (!user || !tenantId) return;

      const { data: empData } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .select("id")
              .eq("user_id", user.id)
              .maybeSingle(),
            ORG_INVITATIONS_QUERY_TIMEOUT_MS,
            "org.invitations.create.employee timeout"
          ),
        {
          maxRetries: ORG_INVITATIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      const code = generateInvitationCode();
      const expiresAt = addDays(new Date(), parseInt(expiryDays));
      if (invitationType === "individual") {
        const normalizedEmail = formData.email.trim().toLowerCase();
        const normalizedNik = formData.nik.trim();
        const [employeeByEmailRes, employeeByNikRes] = await withExponentialBackoff(
          () =>
            withTimeout(
              Promise.all([
                supabase
                  .from("employees")
                  .select("id, user_id, name, email, nik, phone, opd_id, office_id")
                  .eq("tenant_id", tenantId)
                  .ilike("email", normalizedEmail)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle(),
                supabase
                  .from("employees")
                  .select("id, user_id, name, email, nik, phone, opd_id, office_id")
                  .eq("tenant_id", tenantId)
                  .eq("nik", normalizedNik)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle(),
              ]),
              ORG_INVITATIONS_QUERY_TIMEOUT_MS,
              "org.invitations.create.resolve_existing_employee timeout"
            ),
          {
            maxRetries: ORG_INVITATIONS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        if (employeeByEmailRes.error) throw employeeByEmailRes.error;
        if (employeeByNikRes.error) throw employeeByNikRes.error;

        const matchedEmployee =
          (employeeByNikRes.data as EmployeeCandidate | null) ??
          (employeeByEmailRes.data as EmployeeCandidate | null);

        if (matchedEmployee?.user_id) {
          toast.error("Pegawai ini sudah memiliki akun aktif. Tidak perlu membuat undangan baru.");
          return;
        }

        const invitationResult = await ensureIndividualEmployeeInvitation({
          tenantId,
          name: matchedEmployee?.name || formData.name,
          email: matchedEmployee?.email || formData.email,
          nik: matchedEmployee?.nik || formData.nik,
          phone: formData.phone || matchedEmployee?.phone || null,
          opdId: matchedEmployee?.opd_id || null,
          officeId: matchedEmployee?.office_id || null,
          invitedByEmployeeId: empData?.id || null,
          expiresInDays: Number.parseInt(expiryDays, 10),
        });

        try {
          await logEmployeeInvitationFlowAudit({
            tenantId,
            invitationId: invitationResult.invitation.id,
            event: invitationResult.reused ? "INVITATION_REUSE_EXISTING" : "INVITATION_CREATE_NEW",
            payload: {
              source: "org_invitations_page",
              invitation_type: "individual",
              candidate_employee_id: matchedEmployee?.id ?? null,
              invited_by_employee_id: empData?.id ?? null,
              email: invitationResult.invitation.email,
            },
          });
        } catch (auditError) {
          reportError(auditError, "org.invitations.create.audit", {
            tenant_id: tenantId,
            invitation_id: invitationResult.invitation.id,
          });
        }

        setGeneratedCode(invitationResult.invitation.invitation_code);
        setGeneratedExpiresAt(invitationResult.invitation.expires_at ?? null);
        setGeneratedInvitationId(invitationResult.invitation.id);
        if (invitationResult.reused) {
          toast.info("Undangan aktif untuk pegawai ini sudah ada. Gunakan kode/link yang sama.");
        } else {
          toast.success("Undangan berhasil dibuat!");
        }

        setInvitationEmailStatus("Mengirim email undangan...");
        setIsSendingInvitationEmail(true);
        try {
          const emailResult = await sendEmployeeInvitationEmail(invitationResult.invitation.id);
          setInvitationEmailStatus(
            emailResult.email
              ? `Email undangan terkirim ke ${emailResult.email}.`
              : emailResult.message
          );
          toast.success(emailResult.message);
        } catch (emailError) {
          const emailErrorRef = reportError(emailError, "org.invitations.send_email", {
            invitation_id: invitationResult.invitation.id,
            tenant_id: tenantId,
          });
          const errorMessage = appendErrorReference(
            "Undangan dibuat, tetapi email gagal dikirim. Anda masih bisa membagikan kode atau link secara manual.",
            emailErrorRef
          );
          setInvitationEmailStatus(errorMessage);
          toast.error(errorMessage);
        } finally {
          setIsSendingInvitationEmail(false);
        }
      } else {
        const insertData: TablesInsert<"employee_invitations"> = {
          tenant_id: tenantId,
          invitation_code: code,
          invitation_type: invitationType,
          expires_at: expiresAt.toISOString(),
          invited_by: empData?.id || null,
        };

        if (invitationType === "opd") {
          insertData.opd_id = formData.opd_id;
          insertData.name = opdList.find(o => o.id === formData.opd_id)?.name || "Undangan OPD";
          insertData.email = "bulk@invitation.local";
          insertData.nik = "0000000000000000";
        } else if (invitationType === "office") {
          insertData.office_id = formData.office_id;
          insertData.name = officeList.find(o => o.id === formData.office_id)?.name || "Undangan Lokasi";
          insertData.email = "bulk@invitation.local";
          insertData.nik = "0000000000000000";
        }

        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase.from("employee_invitations").insert(insertData),
              ORG_INVITATIONS_QUERY_TIMEOUT_MS,
              "org.invitations.create.insert timeout"
            ),
          {
            maxRetries: ORG_INVITATIONS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        if (error) throw error;

        setGeneratedCode(code);
        setGeneratedExpiresAt(expiresAt.toISOString());
        setGeneratedInvitationId(null);
        setInvitationEmailStatus(null);
        toast.success("Undangan berhasil dibuat!");
      }

      setCurrentPage(1);
      if (currentPage === 1) {
        await fetchInvitations();
      }
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.invitations.create");
      toast.error(appendErrorReference("Gagal membuat undangan", errorRef));
    }
  };

  const handleVerify = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const { error } = await supabase
        .from("employee_invitations")
        .update({ 
          status: "verified", 
          verified_at: new Date().toISOString(),
          verified_by: empData?.id || null,
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Undangan diverifikasi!");
      await fetchInvitations();
    } catch (error) {
      toast.error("Gagal memverifikasi");
    }
  };

  const handleReject = async (id: string) => {
    try {
      const { error } = await supabase
        .from("employee_invitations")
        .update({ status: "rejected", rejection_reason: "Ditolak oleh admin" })
        .eq("id", id);

      if (error) throw error;
      toast.success("Undangan ditolak");
      await fetchInvitations();
    } catch (error) {
      toast.error("Gagal menolak");
    }
  };

  const openEditDialog = (inv: Invitation) => {
    setEditingInvitationId(inv.id);
    setEditFormData({
      name: inv.name || "",
      email: inv.email || "",
      phone: inv.phone || "",
      nik: inv.nik || "",
      opd_id: inv.opd?.id || "",
      office_id: inv.office?.id || "",
      expires_at: inv.expires_at ? new Date(inv.expires_at).toISOString().slice(0, 10) : "",
      status: inv.status || "pending",
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateInvitation = async () => {
    if (!editingInvitationId) return;
    if (!editFormData.name || !editFormData.email || !editFormData.nik) {
      toast.error("Nama, Email, dan NIK harus diisi");
      return;
    }

    setIsSavingEdit(true);
    try {
      const payload: Partial<TablesInsert<"employee_invitations">> & { status?: string } = {
        name: editFormData.name,
        email: editFormData.email,
        phone: editFormData.phone || null,
        nik: editFormData.nik,
        opd_id: editFormData.opd_id || null,
        office_id: editFormData.office_id || null,
        status: editFormData.status,
      };

      if (editFormData.expires_at) {
        payload.expires_at = new Date(`${editFormData.expires_at}T23:59:59`).toISOString();
      } else {
        payload.expires_at = null;
      }

      const { error } = await supabase
        .from("employee_invitations")
        .update(payload)
        .eq("id", editingInvitationId);

      if (error) throw error;

      toast.success("Undangan berhasil diperbarui");
      setIsEditDialogOpen(false);
      setEditingInvitationId(null);
      await fetchInvitations();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Gagal memperbarui undangan";
      toast.error(errorMessage);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteInvitation = async (id: string) => {
    const confirmed = await confirmDialog({
      title: "Hapus Undangan",
      description: "Hapus undangan ini? Tindakan ini tidak dapat dibatalkan.",
      confirmText: "Ya, hapus",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("employee_invitations")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Undangan berhasil dihapus");
      await fetchInvitations();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Gagal menghapus undangan";
      toast.error(errorMessage);
    }
  };

  const copyInviteLink = (code: string) => {
    const link = buildInvitationLink(code);
    navigator.clipboard.writeText(link);
    toast.success("Link undangan disalin!");
  };

  const handleSendInvitationEmail = useCallback(async () => {
    if (!generatedInvitationId) return;

    setIsSendingInvitationEmail(true);
    setInvitationEmailStatus("Mengirim email undangan...");
    try {
      const emailResult = await sendEmployeeInvitationEmail(generatedInvitationId);
      setInvitationEmailStatus(
        emailResult.email
          ? `Email undangan terkirim ke ${emailResult.email}.`
          : emailResult.message
      );
      toast.success(emailResult.message);
    } catch (error) {
      const errorRef = reportError(error, "org.invitations.resend_email", {
        invitation_id: generatedInvitationId,
        tenant_id: tenantId,
      });
      const message = appendErrorReference(
        "Gagal mengirim email undangan. Anda masih bisa membagikan kode atau link secara manual.",
        errorRef
      );
      setInvitationEmailStatus(message);
      toast.error(message);
    } finally {
      setIsSendingInvitationEmail(false);
    }
  }, [generatedInvitationId, tenantId]);

  const sendViaWhatsApp = (phone: string, code: string, name: string) => {
    const link = buildInvitationLink(code);
    const message = `Halo ${name},\n\nAnda diundang untuk bergabung dengan sistem absensi.\n\nKode Undangan: ${code}\nLink Daftar: ${link}\n\nSilakan klik link di atas untuk mendaftar.`;
    const waUrl = `https://wa.me/${phone.replace(/^0/, "62").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");
  };

  const totalPages = Math.max(1, Math.ceil(totalInvitations / itemsPerPage));
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visiblePageNumbers = pageNumbers.filter((page) =>
    page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1
  );
  const displayRangeFrom = totalInvitations === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const displayRangeTo = Math.min(currentPage * itemsPerPage, totalInvitations);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterOpdId, itemsPerPage]);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-500"><Check className="w-3 h-3 mr-1" />Terverifikasi</Badge>;
      case "rejected":
        return <Badge className="bg-red-500"><X className="w-3 h-3 mr-1" />Ditolak</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Menunggu</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "opd":
        return <Badge variant="outline"><Building2 className="w-3 h-3 mr-1" />OPD</Badge>;
      case "office":
        return <Badge variant="outline"><MapPin className="w-3 h-3 mr-1" />Lokasi</Badge>;
      default:
        return <Badge variant="outline"><User className="w-3 h-3 mr-1" />Individual</Badge>;
    }
  };

  const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", nik: "", opd_id: "", office_id: "" });
    setGeneratedCode(null);
    setGeneratedExpiresAt(null);
    setGeneratedInvitationId(null);
    setInvitationEmailStatus(null);
    setIsSendingInvitationEmail(false);
    setInvitationType("individual");
    setExpiryDays("7");
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sedang mencoba ulang memuat data undangan...
          </div>
        )}
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <span>{loadError}</span>
            <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => void fetchInvitations()}>
              Coba Lagi
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UserPlus className="h-6 w-6" />
              Undangan Pegawai
            </h1>
            <p className="text-muted-foreground">Kelola undangan dan verifikasi calon pegawai</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><UserPlus className="mr-2 h-4 w-4" /> Buat Undangan</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Buat Undangan Pegawai</DialogTitle>
                <DialogDescription>
                  Pilih jenis undangan dan tentukan masa berlaku
                </DialogDescription>
              </DialogHeader>
              
              {!generatedCode ? (
                <div className="space-y-4 py-4">
                  {/* Invitation Type */}
                  <div className="space-y-2">
                    <Label>Jenis Undangan</Label>
                    <Tabs value={invitationType} onValueChange={(value) => setInvitationType(value as InvitationType)}>
                      <TabsList className="h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
                        <TabsTrigger value="individual" className="flex items-center gap-1 whitespace-nowrap">
                          <User className="h-3 w-3" />
                          <span className="hidden sm:inline">Individual</span>
                        </TabsTrigger>
                        {canUseOpdInvitation && (
                          <TabsTrigger value="opd" className="flex items-center gap-1 whitespace-nowrap">
                            <Building2 className="h-3 w-3" />
                            <span className="hidden sm:inline">Per OPD</span>
                          </TabsTrigger>
                        )}
                        <TabsTrigger value="office" className="flex items-center gap-1 whitespace-nowrap">
                          <MapPin className="h-3 w-3" />
                          <span className="hidden sm:inline">Per Lokasi</span>
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {!canUseOpdInvitation && (
                      <p className="text-xs text-muted-foreground">
                        Opsi undangan Per OPD dimatikan dari Setup Awal organisasi.
                      </p>
                    )}
                  </div>

                  {/* Expiry */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4" />
                      Masa Berlaku
                    </Label>
                    <Select value={expiryDays} onValueChange={setExpiryDays}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Hari</SelectItem>
                        <SelectItem value="3">3 Hari</SelectItem>
                        <SelectItem value="7">7 Hari</SelectItem>
                        <SelectItem value="14">14 Hari</SelectItem>
                        <SelectItem value="30">30 Hari</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {invitationType === "individual" && (
                    <div className="space-y-3">
                      <div className="grid gap-2">
                        <Label>Nama Lengkap *</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Nama pegawai"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Email *</Label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="email@instansi.go.id"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>No. WhatsApp</Label>
                        <Input
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="08xxxxxxxxxx"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>NIK *</Label>
                        <Input
                          value={formData.nik}
                          onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                          placeholder="16 digit NIK"
                          maxLength={16}
                        />
                      </div>
                    </div>
                  )}

                  {invitationType === "opd" && canUseOpdInvitation && (
                    <div className="space-y-2">
                      <Label>Pilih OPD *</Label>
                      <Select value={formData.opd_id} onValueChange={(v) => setFormData({ ...formData, opd_id: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih OPD" />
                        </SelectTrigger>
                        <SelectContent>
                          {opdList.map((opd) => (
                            <SelectItem key={opd.id} value={opd.id}>{opd.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Kode undangan ini dapat digunakan oleh semua pegawai di OPD terpilih
                      </p>
                    </div>
                  )}

                  {invitationType === "office" && (
                    <div className="space-y-2">
                      <Label>Pilih Lokasi Kerja *</Label>
                      <Select value={formData.office_id} onValueChange={(v) => setFormData({ ...formData, office_id: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Lokasi" />
                        </SelectTrigger>
                        <SelectContent>
                          {officeList.map((office) => (
                            <SelectItem key={office.id} value={office.id}>{office.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Kode undangan ini dapat digunakan oleh semua pegawai di lokasi terpilih
                      </p>
                    </div>
                  )}

                  <DialogFooter className={dialogActionBarClassName}>
                    <DialogActionHint>Pastikan data undangan sudah sesuai.</DialogActionHint>
                    <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                      <Button onClick={handleCreateInvitation}>Buat Undangan</Button>
                    </div>
                  </DialogFooter>
                </div>
              ) : (
                <div className="py-4 space-y-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                    <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="font-medium text-green-600">Undangan Berhasil Dibuat!</p>
                  </div>
                  
                  <div className="p-4 bg-muted rounded-lg">
                    <Label className="text-xs text-muted-foreground">Kode Undangan</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-2xl font-bold tracking-widest flex-1">{generatedCode}</code>
                      <Button variant="outline" size="icon" onClick={() => copyInviteLink(generatedCode)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Berlaku hingga: {generatedExpiresAt ? format(new Date(generatedExpiresAt), "d MMMM yyyy") : "-"}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {invitationType === "individual" && generatedInvitationId && (
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => void handleSendInvitationEmail()}
                        disabled={isSendingInvitationEmail}
                      >
                        <User className="w-4 h-4 mr-2" />
                        {isSendingInvitationEmail ? "Mengirim Email..." : "Kirim via Email"}
                      </Button>
                    )}
                    {formData.phone && invitationType === "individual" && (
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => sendViaWhatsApp(formData.phone, generatedCode, formData.name)}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Kirim via WA
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => copyInviteLink(generatedCode)}
                    >
                      <LinkIcon className="w-4 h-4 mr-2" />
                      Salin Link
                    </Button>
                  </div>

                  {invitationEmailStatus && invitationType === "individual" && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {invitationEmailStatus}
                    </div>
                  )}

                  <DialogFooter className={dialogActionBarClassName}>
                    <DialogActionHint>Simpan kode/link sebelum menutup dialog.</DialogActionHint>
                    <div className="flex w-full justify-end">
                      <Button onClick={() => { setIsDialogOpen(false); resetForm(); }}>Selesai</Button>
                    </div>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="pt-6 text-sm text-primary/90">
            Alur direkomendasikan: import data pegawai terlebih dahulu, lalu kirim undangan aktivasi.
            Untuk undangan individual, sistem akan memprioritaskan data pegawai yang sudah ada agar tidak membuat duplikasi.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Undangan</CardTitle>
            <CardDescription>{totalInvitations} undangan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm sm:flex-row sm:items-center">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, email, atau kode..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Tabs value={filterStatus} onValueChange={setFilterStatus}>
                  <TabsList className="min-w-max h-auto gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
                    <TabsTrigger value="all" className="whitespace-nowrap">Semua</TabsTrigger>
                    <TabsTrigger value="pending" className="whitespace-nowrap">Menunggu</TabsTrigger>
                    <TabsTrigger value="verified" className="whitespace-nowrap">Terverifikasi</TabsTrigger>
                    <TabsTrigger value="rejected" className="whitespace-nowrap">Ditolak</TabsTrigger>
                  </TabsList>
                </Tabs>
                {canUseOpdInvitation && opdList.length > 0 && (
                  <Select value={filterOpdId} onValueChange={setFilterOpdId}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Filter OPD" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua OPD</SelectItem>
                      <SelectItem value="none">Tanpa OPD</SelectItem>
                      {opdList.map((opd) => (
                        <SelectItem key={opd.id} value={opd.id}>{opd.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama/Target</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Berlaku</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : invitations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Belum ada undangan
                    </TableCell>
                  </TableRow>
                ) : (
                  invitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{inv.name}</p>
                          {inv.invitation_type === "individual" && (
                            <p className="text-xs text-muted-foreground">{inv.email}</p>
                          )}
                          {inv.opd && <p className="text-xs text-muted-foreground">{inv.opd.name}</p>}
                          {inv.office && <p className="text-xs text-muted-foreground">{inv.office.name}</p>}
                        </div>
                      </TableCell>
                      <TableCell>{getTypeBadge(inv.invitation_type || "individual")}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{inv.invitation_code}</code>
                      </TableCell>
                      <TableCell>
                        {isExpired(inv.expires_at) && inv.status === "pending" ? (
                          <Badge variant="destructive">Kedaluwarsa</Badge>
                        ) : (
                          getStatusBadge(inv.status)
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.expires_at ? format(new Date(inv.expires_at), "d MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => copyInviteLink(inv.invitation_code)}>
                            <LinkIcon className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(inv)}>
                            <Pencil className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteInvitation(inv.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                          {inv.status === "pending" && !isExpired(inv.expires_at) && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => handleVerify(inv.id)}>
                                <Check className="h-4 w-4 text-green-500" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleReject(inv.id)}>
                                <X className="h-4 w-4 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {totalInvitations > 0 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages} • Menampilkan {displayRangeFrom} - {displayRangeTo} dari {totalInvitations} data
                </p>
                <div className="flex items-center gap-2">
                  <Select value={String(itemsPerPage)} onValueChange={(value) => setItemsPerPage(Number(value))}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Baris/halaman" />
                    </SelectTrigger>
                    <SelectContent>
                      {INVITATION_PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} / halaman
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {visiblePageNumbers.map((page, idx) => {
                        const prevPage = visiblePageNumbers[idx - 1];
                        const showEllipsis = prevPage && page - prevPage > 1;
                        return (
                          <Fragment key={page}>
                            {showEllipsis && (
                              <PaginationItem>
                                <PaginationEllipsis />
                              </PaginationItem>
                            )}
                            <PaginationItem>
                              <PaginationLink
                                isActive={page === currentPage}
                                onClick={() => setCurrentPage(page)}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          </Fragment>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_invitations" />
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Undangan</DialogTitle>
            <DialogDescription>Perbarui data undangan pegawai.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid gap-2">
              <Label>Nama Lengkap *</Label>
              <Input
                value={editFormData.name}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>No. WhatsApp</Label>
              <Input
                value={editFormData.phone}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>NIK *</Label>
              <Input
                value={editFormData.nik}
                maxLength={16}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, nik: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Tanggal Kedaluwarsa</Label>
                <Input
                  type="date"
                  value={editFormData.expires_at}
                  onChange={(e) => setEditFormData((prev) => ({ ...prev, expires_at: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={editFormData.status}
                  onValueChange={(value) => setEditFormData((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Menunggu</SelectItem>
                    <SelectItem value="verified">Terverifikasi</SelectItem>
                    <SelectItem value="rejected">Ditolak</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className={dialogActionBarClassName}>
            <DialogActionHint>Perubahan undangan akan langsung diterapkan.</DialogActionHint>
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSavingEdit}>
                Batal
              </Button>
              <Button onClick={handleUpdateInvitation} disabled={isSavingEdit}>
                {isSavingEdit ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrganizationLayout>
  );
}
