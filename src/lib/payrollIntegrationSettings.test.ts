import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAYROLL_INTEGRATION_SETTINGS,
  parsePayrollIntegrationSettings,
} from "@/lib/payrollIntegrationSettingsCore";

describe("parsePayrollIntegrationSettings", () => {
  it("returns defaults for empty input", () => {
    expect(parsePayrollIntegrationSettings(null)).toEqual(DEFAULT_PAYROLL_INTEGRATION_SETTINGS);
  });

  it("supports wrapped payload under settings key", () => {
    expect(
      parsePayrollIntegrationSettings({
        version: 1,
        settings: {
          attendance: {
            enabled: false,
            source: "timesheet_summary",
            autoSync: false,
            requireEmployeeMapping: false,
          },
          accounting: {
            enabled: true,
            provider: "jurnal_api",
            costCenterField: "division",
            defaultDebitAccount: "5-2000",
            defaultCreditAccount: "2-2000",
            journalMappingMode: "component",
          },
          payout: {
            enabled: true,
            bankFormat: "bca_csv",
            autoMarkPaid: true,
          },
          webhook: {
            enabled: true,
            endpointUrl: "https://example.com/hook",
            secretKey: "secret",
          },
          errorAlert: {
            enabled: true,
            webhookUrl: "https://example.com/alert",
            slackWebhookUrl: "https://hooks.slack.com/services/abc",
            whatsappWebhookUrl: "https://wa.example.com/webhook",
            emailWebhookUrl: "https://email.example.com/webhook",
          },
        },
      }),
    ).toEqual({
      attendance: {
        enabled: false,
        source: "timesheet_summary",
        autoSync: false,
        requireEmployeeMapping: false,
      },
      accounting: {
        enabled: true,
        provider: "jurnal_api",
        costCenterField: "division",
        defaultDebitAccount: "5-2000",
        defaultCreditAccount: "2-2000",
        journalMappingMode: "component",
      },
      payout: {
        enabled: true,
        bankFormat: "bca_csv",
        autoMarkPaid: true,
      },
      webhook: {
        enabled: true,
        endpointUrl: "https://example.com/hook",
        secretKey: "secret",
      },
      errorAlert: {
        enabled: true,
        webhookUrl: "https://example.com/alert",
        slackWebhookUrl: "https://hooks.slack.com/services/abc",
        whatsappWebhookUrl: "https://wa.example.com/webhook",
        emailWebhookUrl: "https://email.example.com/webhook",
      },
    });
  });

  it("normalizes unsupported values to safe defaults", () => {
    expect(
      parsePayrollIntegrationSettings({
        attendance: { source: "invalid", autoSync: "true" },
        accounting: { provider: "other", defaultDebitAccount: 10, journalMappingMode: "x" },
        payout: { bankFormat: "unknown" },
        webhook: { endpointUrl: 12, secretKey: ["x"] },
        errorAlert: { enabled: "true", webhookUrl: 88, slackWebhookUrl: null },
      }),
    ).toEqual({
      attendance: {
        enabled: DEFAULT_PAYROLL_INTEGRATION_SETTINGS.attendance.enabled,
        source: "attendance_records",
        autoSync: true,
        requireEmployeeMapping: DEFAULT_PAYROLL_INTEGRATION_SETTINGS.attendance.requireEmployeeMapping,
      },
      accounting: {
        enabled: DEFAULT_PAYROLL_INTEGRATION_SETTINGS.accounting.enabled,
        provider: "manual_csv",
        costCenterField: DEFAULT_PAYROLL_INTEGRATION_SETTINGS.accounting.costCenterField,
        defaultDebitAccount: DEFAULT_PAYROLL_INTEGRATION_SETTINGS.accounting.defaultDebitAccount,
        defaultCreditAccount: DEFAULT_PAYROLL_INTEGRATION_SETTINGS.accounting.defaultCreditAccount,
        journalMappingMode: DEFAULT_PAYROLL_INTEGRATION_SETTINGS.accounting.journalMappingMode,
      },
      payout: {
        enabled: DEFAULT_PAYROLL_INTEGRATION_SETTINGS.payout.enabled,
        bankFormat: "generic_csv",
        autoMarkPaid: DEFAULT_PAYROLL_INTEGRATION_SETTINGS.payout.autoMarkPaid,
      },
      webhook: {
        enabled: DEFAULT_PAYROLL_INTEGRATION_SETTINGS.webhook.enabled,
        endpointUrl: "",
        secretKey: "",
      },
      errorAlert: {
        enabled: true,
        webhookUrl: "",
        slackWebhookUrl: "",
        whatsappWebhookUrl: "",
        emailWebhookUrl: "",
      },
    });
  });
});
