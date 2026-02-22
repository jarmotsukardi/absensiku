export const BILLING_INVOICE_TEMPLATE_TOKENS = [
  "invoice_number",
  "invoice_status",
  "invoice_status_class",
  "issue_date",
  "due_date",
  "tenant_name",
  "tenant_code",
  "tenant_address",
  "bank_account_name",
  "bank_name",
  "bank_account_number",
  "payment_method",
  "invoice_item_name",
  "invoice_item_meta",
  "subtotal",
  "discount",
  "vat_percentage",
  "vat_amount",
  "service_fee",
  "total",
  "net",
  "transaction_rows",
  "balance",
  "notes",
] as const;

export const DEFAULT_BILLING_INVOICE_TEMPLATE = `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>Invoice {{invoice_number}}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, sans-serif; color: #111827; margin: 0; font-size: 12px; line-height: 1.45; }
      .invoice { border: 1px solid #d1d5db; border-radius: 8px; padding: 20px; }
      .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .brand { font-size: 14px; color: #374151; margin-bottom: 6px; }
      .invoice-title { font-size: 34px; color: #1f2937; margin: 0 0 2px 0; }
      .invoice-no { font-size: 24px; margin: 0; }
      .status { padding: 6px 14px; border-radius: 6px; border: 1px solid; font-size: 13px; font-weight: 700; text-transform: uppercase; }
      .status-paid { color: #166534; background: #dcfce7; border-color: #86efac; }
      .status-unpaid { color: #991b1b; background: #fee2e2; border-color: #fca5a5; }
      .divider { border-top: 1px solid #e5e7eb; margin: 14px 0; }
      .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .label { font-weight: 700; margin-bottom: 4px; }
      .muted { color: #6b7280; }
      .box { border: 1px solid #e5e7eb; border-radius: 6px; margin-top: 14px; overflow: hidden; }
      .box-head { font-weight: 700; background: #f9fafb; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
      th { text-align: left; font-weight: 700; background: #f9fafb; }
      .text-right { text-align: right; }
      .summary td { border-bottom: none; padding: 4px 10px; }
      .summary-total td { border-top: 1px solid #e5e7eb; font-weight: 700; padding-top: 8px; }
      .actions-note { margin-top: 12px; color: #6b7280; font-size: 11px; }
      @media print {
        .actions-note { display: none; }
      }
    </style>
  </head>
  <body>
    <div class="invoice">
      <div class="head">
        <div>
          <p class="brand">AbsensiKu - Invoice</p>
          <h1 class="invoice-title">Invoice</h1>
          <p class="invoice-no">#{{invoice_number}}</p>
        </div>
        <div>
          <div class="status {{invoice_status_class}}">{{invoice_status}}</div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="cols">
        <div>
          <div class="label">Invoiced To</div>
          <div>{{tenant_name}}</div>
          <div class="muted">{{tenant_code}}</div>
          <div class="muted">{{tenant_address}}</div>
        </div>
        <div style="text-align:right">
          <div class="label">Pay To</div>
          <div>{{bank_account_name}}</div>
          <div class="muted">{{bank_name}} {{bank_account_number}}</div>
          <div class="muted">Transfer Bank / Payment Gateway</div>
        </div>
      </div>

      <div class="cols" style="margin-top: 12px;">
        <div>
          <div class="label">Invoice Date</div>
          <div>{{issue_date}}</div>
          <div class="label" style="margin-top:8px">Due Date</div>
          <div>{{due_date}}</div>
        </div>
        <div style="text-align:right">
          <div class="label">Payment Method</div>
          <div>{{payment_method}}</div>
        </div>
      </div>

      <div class="box">
        <div class="box-head">Invoice Items</div>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {{invoice_item_name}}
                <div class="muted">{{invoice_item_meta}}</div>
              </td>
              <td class="text-right">{{subtotal}}</td>
            </tr>
          </tbody>
        </table>
        <table class="summary">
          <tbody>
            <tr><td class="text-right muted">Sub Total</td><td class="text-right">{{subtotal}}</td></tr>
            <tr><td class="text-right muted">Diskon</td><td class="text-right">-{{discount}}</td></tr>
            <tr><td class="text-right muted">Biaya Layanan</td><td class="text-right">{{service_fee}}</td></tr>
            <tr class="summary-total"><td class="text-right">Total</td><td class="text-right">{{total}}</td></tr>
            <tr><td class="text-right">Net</td><td class="text-right">{{net}}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="box">
        <div class="box-head">Riwayat Transaksi</div>
        <table>
          <thead>
            <tr>
              <th>Transaction Date</th>
              <th>Gateway</th>
              <th>Transaction ID</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>{{transaction_rows}}</tbody>
        </table>
        <table class="summary">
          <tbody>
            <tr class="summary-total"><td class="text-right">Balance</td><td class="text-right">{{balance}}</td></tr>
          </tbody>
        </table>
      </div>

      {{notes}}
    </div>
  </body>
</html>`;

export const renderBillingInvoiceTemplate = (
  template: string,
  values: Record<string, string>,
): string => {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) => {
    if (!(key in values)) return full;
    return values[key] ?? "";
  });
};
