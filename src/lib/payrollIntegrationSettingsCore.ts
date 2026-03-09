export type PayrollAttendanceSource = "attendance_records" | "timesheet_summary";
export type PayrollAccountingProvider = "manual_csv" | "jurnal_api";
export type PayrollBankFormat = "generic_csv" | "bca_csv" | "bri_csv";

export interface PayrollIntegrationSettings {
  attendance: {
    enabled: boolean;
    source: PayrollAttendanceSource;
    autoSync: boolean;
    requireEmployeeMapping: boolean;
  };
  accounting: {
    enabled: boolean;
    provider: PayrollAccountingProvider;
    costCenterField: string;
    defaultDebitAccount: string;
    defaultCreditAccount: string;
    journalMappingMode: "summary" | "component";
  };
  payout: {
    enabled: boolean;
    bankFormat: PayrollBankFormat;
    autoMarkPaid: boolean;
  };
  webhook: {
    enabled: boolean;
    endpointUrl: string;
    secretKey: string;
  };
  errorAlert: {
    enabled: boolean;
    webhookUrl: string;
    slackWebhookUrl: string;
    whatsappWebhookUrl: string;
    emailWebhookUrl: string;
  };
}

export const DEFAULT_PAYROLL_INTEGRATION_SETTINGS: PayrollIntegrationSettings = {
  attendance: {
    enabled: true,
    source: "attendance_records",
    autoSync: true,
    requireEmployeeMapping: true,
  },
  accounting: {
    enabled: false,
    provider: "manual_csv",
    costCenterField: "department",
    defaultDebitAccount: "5-1000",
    defaultCreditAccount: "2-1000",
    journalMappingMode: "summary",
  },
  payout: {
    enabled: false,
    bankFormat: "generic_csv",
    autoMarkPaid: false,
  },
  webhook: {
    enabled: false,
    endpointUrl: "",
    secretKey: "",
  },
  errorAlert: {
    enabled: false,
    webhookUrl: "",
    slackWebhookUrl: "",
    whatsappWebhookUrl: "",
    emailWebhookUrl: "",
  },
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return fallback;
};

const normalizeAttendanceSource = (value: unknown): PayrollAttendanceSource =>
  value === "timesheet_summary" ? "timesheet_summary" : "attendance_records";

const normalizeAccountingProvider = (value: unknown): PayrollAccountingProvider =>
  value === "jurnal_api" ? "jurnal_api" : "manual_csv";

const normalizeBankFormat = (value: unknown): PayrollBankFormat => {
  if (value === "bca_csv") return "bca_csv";
  if (value === "bri_csv") return "bri_csv";
  return "generic_csv";
};

const normalizeString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

export const parsePayrollIntegrationSettings = (value: unknown): PayrollIntegrationSettings => {
  const root = isJsonObject(value) ? value : {};
  const source = isJsonObject(root.settings) ? root.settings : root;

  const attendanceRoot = isJsonObject(source.attendance) ? source.attendance : {};
  const accountingRoot = isJsonObject(source.accounting) ? source.accounting : {};
  const payoutRoot = isJsonObject(source.payout) ? source.payout : {};
  const webhookRoot = isJsonObject(source.webhook) ? source.webhook : {};
  const errorAlertRoot = isJsonObject(source.errorAlert) ? source.errorAlert : {};

  return {
    attendance: {
      enabled: normalizeBoolean(attendanceRoot.enabled, DEFAULT_PAYROLL_INTEGRATION_SETTINGS.attendance.enabled),
      source: normalizeAttendanceSource(attendanceRoot.source),
      autoSync: normalizeBoolean(attendanceRoot.autoSync, DEFAULT_PAYROLL_INTEGRATION_SETTINGS.attendance.autoSync),
      requireEmployeeMapping: normalizeBoolean(
        attendanceRoot.requireEmployeeMapping,
        DEFAULT_PAYROLL_INTEGRATION_SETTINGS.attendance.requireEmployeeMapping,
      ),
    },
    accounting: {
      enabled: normalizeBoolean(accountingRoot.enabled, DEFAULT_PAYROLL_INTEGRATION_SETTINGS.accounting.enabled),
      provider: normalizeAccountingProvider(accountingRoot.provider),
      costCenterField: normalizeString(
        accountingRoot.costCenterField,
        DEFAULT_PAYROLL_INTEGRATION_SETTINGS.accounting.costCenterField,
      ),
      defaultDebitAccount: normalizeString(
        accountingRoot.defaultDebitAccount,
        DEFAULT_PAYROLL_INTEGRATION_SETTINGS.accounting.defaultDebitAccount,
      ),
      defaultCreditAccount: normalizeString(
        accountingRoot.defaultCreditAccount,
        DEFAULT_PAYROLL_INTEGRATION_SETTINGS.accounting.defaultCreditAccount,
      ),
      journalMappingMode:
        accountingRoot.journalMappingMode === "component" ? "component" : "summary",
    },
    payout: {
      enabled: normalizeBoolean(payoutRoot.enabled, DEFAULT_PAYROLL_INTEGRATION_SETTINGS.payout.enabled),
      bankFormat: normalizeBankFormat(payoutRoot.bankFormat),
      autoMarkPaid: normalizeBoolean(payoutRoot.autoMarkPaid, DEFAULT_PAYROLL_INTEGRATION_SETTINGS.payout.autoMarkPaid),
    },
    webhook: {
      enabled: normalizeBoolean(webhookRoot.enabled, DEFAULT_PAYROLL_INTEGRATION_SETTINGS.webhook.enabled),
      endpointUrl: normalizeString(webhookRoot.endpointUrl, DEFAULT_PAYROLL_INTEGRATION_SETTINGS.webhook.endpointUrl).trim(),
      secretKey: normalizeString(webhookRoot.secretKey, DEFAULT_PAYROLL_INTEGRATION_SETTINGS.webhook.secretKey).trim(),
    },
    errorAlert: {
      enabled: normalizeBoolean(errorAlertRoot.enabled, DEFAULT_PAYROLL_INTEGRATION_SETTINGS.errorAlert.enabled),
      webhookUrl: normalizeString(
        errorAlertRoot.webhookUrl,
        DEFAULT_PAYROLL_INTEGRATION_SETTINGS.errorAlert.webhookUrl,
      ).trim(),
      slackWebhookUrl: normalizeString(
        errorAlertRoot.slackWebhookUrl,
        DEFAULT_PAYROLL_INTEGRATION_SETTINGS.errorAlert.slackWebhookUrl,
      ).trim(),
      whatsappWebhookUrl: normalizeString(
        errorAlertRoot.whatsappWebhookUrl,
        DEFAULT_PAYROLL_INTEGRATION_SETTINGS.errorAlert.whatsappWebhookUrl,
      ).trim(),
      emailWebhookUrl: normalizeString(
        errorAlertRoot.emailWebhookUrl,
        DEFAULT_PAYROLL_INTEGRATION_SETTINGS.errorAlert.emailWebhookUrl,
      ).trim(),
    },
  };
};
