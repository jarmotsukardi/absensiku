import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabasePublicTestClient,
  pickSupabaseTestEnv,
  readSupabaseTestEnvMap,
} from "./supabaseTestEnv";
import { getRoleCreds } from "./testAccounts";

const INVOICE_NUMBER_REGEX = /\bINV-[A-Z0-9-]+\b/gi;

type CleanupSummary = {
  attempted: boolean;
  skipped: boolean;
  reason?: string;
  cleanedInvoices: string[];
  errors: string[];
};

const normalizeInvoiceNumber = (value: string): string =>
  value.trim().toUpperCase();

export const extractInvoiceNumbers = (text: string): string[] => {
  const matches = text.match(INVOICE_NUMBER_REGEX) || [];
  return Array.from(new Set(matches.map(normalizeInvoiceNumber)));
};

export const getNewInvoiceNumbers = (before: Iterable<string>, after: Iterable<string>): string[] => {
  const beforeSet = new Set(Array.from(before, normalizeInvoiceNumber));
  const created = new Set<string>();
  for (const invoice of after) {
    const normalized = normalizeInvoiceNumber(invoice);
    if (!beforeSet.has(normalized)) {
      created.add(normalized);
    }
  }
  return Array.from(created);
};

const createCleanupClient = async (): Promise<
  { client: SupabaseClient; mode: "service_role" | "session" } | { client: null; reason: string }
> => {
  const envMap = await readSupabaseTestEnvMap();
  const supabaseUrl = pickSupabaseTestEnv(envMap, ["VITE_SUPABASE_URL", "SUPABASE_URL"]);
  if (!supabaseUrl) {
    return { client: null, reason: "SUPABASE_URL belum tersedia di env/.env.local." };
  }

  const serviceRoleKey = pickSupabaseTestEnv(envMap, ["SUPABASE_SERVICE_ROLE_KEY"]);
  if (serviceRoleKey) {
    return {
      client: createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      mode: "service_role",
    };
  }

  const publicClient = await createSupabasePublicTestClient();
  if (!publicClient) {
    return { client: null, reason: "Anon/publishable key Supabase belum tersedia." };
  }

  const superadminCreds = await getRoleCreds("superadmin");
  if (!superadminCreds) {
    return { client: null, reason: "Kredensial superadmin belum tersedia di test-accounts.local.json." };
  }

  const client = publicClient;
  const { error } = await client.auth.signInWithPassword({
    email: superadminCreds.email,
    password: superadminCreds.password,
  });
  if (error) {
    return { client: null, reason: `Login superadmin untuk cleanup gagal: ${error.message}` };
  }

  return { client, mode: "session" };
};

export const cleanupInvoicesBestEffort = async (
  invoiceNumbersRaw: Iterable<string>,
  contextLabel: string,
): Promise<CleanupSummary> => {
  const requestedInvoiceNumbers = Array.from(
    new Set(Array.from(invoiceNumbersRaw, normalizeInvoiceNumber).filter((value) => value.startsWith("INV-"))),
  );
  if (requestedInvoiceNumbers.length === 0) {
    return { attempted: false, skipped: true, reason: "Tidak ada invoice test baru.", cleanedInvoices: [], errors: [] };
  }

  const clientResult = await createCleanupClient();
  if (!clientResult.client) {
    console.warn(`[E2E cleanup][${contextLabel}] dilewati: ${clientResult.reason}`);
    return {
      attempted: true,
      skipped: true,
      reason: clientResult.reason,
      cleanedInvoices: [],
      errors: [],
    };
  }

  const { client, mode } = clientResult;
  const errors: string[] = [];
  const cleanedInvoices: string[] = [];

  const runDelete = async (
    label: string,
    runner: () => Promise<{ error: { message?: string } | null }>,
  ) => {
    const { error } = await runner();
    if (error) {
      errors.push(`${label}: ${error.message || "unknown error"}`);
    }
  };

  try {
    const { data: invoiceRows, error: invoiceFetchError } = await client
      .from("invoices")
      .select("id, invoice_number")
      .in("invoice_number", requestedInvoiceNumbers);

    if (invoiceFetchError) {
      errors.push(`fetch invoices: ${invoiceFetchError.message}`);
      return { attempted: true, skipped: false, cleanedInvoices, errors };
    }

    if (!invoiceRows || invoiceRows.length === 0) {
      return { attempted: true, skipped: false, cleanedInvoices, errors };
    }

    const invoiceIds = invoiceRows.map((row) => row.id);
    const invoiceNumbers = invoiceRows
      .map((row) => normalizeInvoiceNumber(row.invoice_number || ""))
      .filter(Boolean);

    await runDelete("subscriptions.last_invoice_id", () =>
      client.from("subscriptions").update({ last_invoice_id: null }).in("last_invoice_id", invoiceIds),
    );
    await runDelete("billing_notification_logs", () =>
      client.from("billing_notification_logs").delete().in("invoice_id", invoiceIds),
    );
    await runDelete("payment_logs", () =>
      client.from("payment_logs").delete().in("invoice_id", invoiceIds),
    );
    await runDelete("financial_ledger", () =>
      client.from("financial_ledger").delete().in("invoice_id", invoiceIds),
    );
    await runDelete("manual_payments", () =>
      client.from("manual_payments").delete().in("invoice_number", invoiceNumbers),
    );
    await runDelete("invoices", () =>
      client.from("invoices").delete().in("id", invoiceIds),
    );

    cleanedInvoices.push(...invoiceNumbers);

    if (errors.length > 0) {
      console.warn(`[E2E cleanup][${contextLabel}] partial gagal:\n- ${errors.join("\n- ")}`);
    } else {
      console.info(
        `[E2E cleanup][${contextLabel}] sukses hapus invoice: ${cleanedInvoices.join(", ")}`,
      );
    }
  } finally {
    if (mode === "session") {
      await client.auth.signOut();
    }
  }

  return {
    attempted: true,
    skipped: false,
    cleanedInvoices,
    errors,
  };
};
