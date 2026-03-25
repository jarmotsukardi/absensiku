import type { Json } from "@/integrations/supabase/types";

export type PayrollPeriodLite = {
  id: string;
  period_key: string;
  period_start: string;
  period_end: string;
};

export type PayrollEmployeeLite = {
  id: string;
  name: string;
  nik: string;
  email: string | null;
};

export type PayrollEmployeeCompensation = {
  employee_id: string;
  base_salary: number;
  ter_category: string;
  jkk_risk_level: string | null;
  region_level: string;
  region_code: string | null;
  region_name: string | null;
};

export type PayrollComponent = {
  code: string;
  name: string;
  calculation_mode: string;
  default_amount: number;
  is_taxable: boolean;
  is_active: boolean;
};

export type PayrollVariableInput = {
  employee_id: string | null;
  component_scope: "income" | "deduction";
  component_code: string;
  component_name: string;
  input_type: string;
  amount: number;
};

export type PayrollTerRate = {
  category: string;
  income_from: number;
  income_to: number | null;
  rate_percent: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
};

export type PayrollBpjsRate = {
  program: string;
  risk_level: string | null;
  employer_rate_percent: number;
  employee_rate_percent: number;
  wage_cap: number | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
};

export type PayrollMinimumWage = {
  region_level: string;
  region_code: string;
  region_name: string;
  amount: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
};

export type PayrollComplianceFlags = {
  pph21_ter: boolean;
  bpjs_kesehatan: boolean;
  bpjs_ketenagakerjaan: boolean;
  upah_minimum: boolean;
};

export type PayrollEmployeeResult = {
  employee_id: string;
  gross_income: number;
  taxable_income: number;
  total_deductions: number;
  net_pay: number;
  pph21_amount: number;
  bpjs_employee: number;
  bpjs_employer: number;
  warnings: string[];
  metadata: Json;
};

export type PayrollAutoSummary = {
  totals: {
    employees_processed: number;
    employees_skipped: number;
    gross_income: number;
    total_deductions: number;
    net_pay: number;
    pph21_amount: number;
    bpjs_employee: number;
    bpjs_employer: number;
  };
  issues: {
    missing_compensations: string[];
    missing_ter_rate: string[];
    below_minimum_wage: string[];
    formula_components: string[];
  };
  warnings: string[];
};

const toDate = (value: string) => new Date(value).getTime();

const isEffective = (row: { effective_from: string; effective_to: string | null; is_active: boolean }, dateKey: string) => {
  if (!row.is_active) return false;
  const target = toDate(dateKey);
  if (toDate(row.effective_from) > target) return false;
  if (row.effective_to && toDate(row.effective_to) < target) return false;
  return true;
};

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

const resolveTerRate = (rates: PayrollTerRate[], category: string, income: number) => {
  const applicable = rates.filter((rate) => rate.category === category && income >= rate.income_from && (rate.income_to == null || income <= rate.income_to));
  if (applicable.length === 0) return null;
  return applicable.sort((a, b) => toDate(b.effective_from) - toDate(a.effective_from))[0];
};

const resolveBpjsRates = (rates: PayrollBpjsRate[], program: string, riskLevel?: string | null) => {
  return rates
    .filter((rate) => rate.program === program && (program !== "jkk" || (riskLevel ? rate.risk_level === riskLevel : true)))
    .sort((a, b) => toDate(b.effective_from) - toDate(a.effective_from));
};

const resolveMinimumWage = (wages: PayrollMinimumWage[], regionLevel?: string | null, regionCode?: string | null) => {
  if (!regionLevel || !regionCode) return null;
  const matches = wages.filter((row) => row.region_level === regionLevel && row.region_code === regionCode);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => toDate(b.effective_from) - toDate(a.effective_from))[0];
};

export const calculatePayrollAuto = (input: {
  period: PayrollPeriodLite;
  employees: PayrollEmployeeLite[];
  compensations: PayrollEmployeeCompensation[];
  incomeComponents: PayrollComponent[];
  deductionComponents: PayrollComponent[];
  variableInputs: PayrollVariableInput[];
  terRates: PayrollTerRate[];
  bpjsRates: PayrollBpjsRate[];
  minimumWages: PayrollMinimumWage[];
  complianceFlags: PayrollComplianceFlags;
}): { results: PayrollEmployeeResult[]; summary: PayrollAutoSummary } => {
  const periodKey = input.period.period_end;
  const incomeComponents = input.incomeComponents.filter((item) => item.is_active);
  const deductionComponents = input.deductionComponents.filter((item) => item.is_active);

  const incomeComponentMap = new Map(incomeComponents.map((item) => [item.code, item]));
  const deductionComponentMap = new Map(deductionComponents.map((item) => [item.code, item]));

  const terRates = input.terRates.filter((rate) => isEffective(rate, periodKey));
  const bpjsRates = input.bpjsRates.filter((rate) => isEffective(rate, periodKey));
  const minimumWages = input.minimumWages.filter((row) => isEffective(row, periodKey));

  const compensationByEmployee = new Map(input.compensations.map((row) => [row.employee_id, row]));
  const globalVariableInputs = input.variableInputs.filter((row) => !row.employee_id);
  const variableByEmployee = new Map<string, PayrollVariableInput[]>();
  input.variableInputs.forEach((row) => {
    if (!row.employee_id) return;
    if (!variableByEmployee.has(row.employee_id)) variableByEmployee.set(row.employee_id, []);
    variableByEmployee.get(row.employee_id)?.push(row);
  });

  const summary: PayrollAutoSummary = {
    totals: {
      employees_processed: 0,
      employees_skipped: 0,
      gross_income: 0,
      total_deductions: 0,
      net_pay: 0,
      pph21_amount: 0,
      bpjs_employee: 0,
      bpjs_employer: 0,
    },
    issues: {
      missing_compensations: [],
      missing_ter_rate: [],
      below_minimum_wage: [],
      formula_components: [],
    },
    warnings: [],
  };

  const results: PayrollEmployeeResult[] = [];

  for (const employee of input.employees) {
    const compensation = compensationByEmployee.get(employee.id);
    if (!compensation) {
      summary.issues.missing_compensations.push(employee.id);
      summary.totals.employees_skipped += 1;
      continue;
    }

    const warnings: string[] = [];
    const baseSalary = compensation.base_salary || 0;

    const incomeFixed = incomeComponents.map((component) => {
      if (component.calculation_mode === "formula") {
        summary.issues.formula_components.push(component.code);
        warnings.push(`Komponen ${component.code} memakai formula dan belum dihitung otomatis.`);
        return { code: component.code, amount: 0, is_taxable: component.is_taxable };
      }
      const amount =
        component.calculation_mode === "percentage"
          ? (baseSalary * (component.default_amount || 0)) / 100
          : component.default_amount || 0;
      return { code: component.code, amount, is_taxable: component.is_taxable };
    });

    const deductionFixed = deductionComponents.map((component) => {
      if (component.calculation_mode === "formula") {
        summary.issues.formula_components.push(component.code);
        warnings.push(`Potongan ${component.code} memakai formula dan belum dihitung otomatis.`);
        return { code: component.code, amount: 0 };
      }
      const amount =
        component.calculation_mode === "percentage"
          ? (baseSalary * (component.default_amount || 0)) / 100
          : component.default_amount || 0;
      return { code: component.code, amount };
    });

    const variableInputs = [...globalVariableInputs, ...(variableByEmployee.get(employee.id) || [])];
    const variableIncome = variableInputs.filter((row) => row.component_scope === "income");
    const variableDeduction = variableInputs.filter((row) => row.component_scope === "deduction");

    const variableIncomeDetails = variableIncome.map((row) => {
      const component = incomeComponentMap.get(row.component_code);
      return {
        code: row.component_code,
        name: row.component_name,
        amount: row.amount,
        is_taxable: component?.is_taxable ?? true,
      };
    });

    const variableDeductionDetails = variableDeduction.map((row) => ({
      code: row.component_code,
      name: row.component_name,
      amount: row.amount,
    }));

    const grossIncome = baseSalary + sum(incomeFixed.map((item) => item.amount)) + sum(variableIncomeDetails.map((item) => item.amount));
    const taxableIncome =
      baseSalary +
      sum(incomeFixed.filter((item) => item.is_taxable).map((item) => item.amount)) +
      sum(variableIncomeDetails.filter((item) => item.is_taxable).map((item) => item.amount));

    let pph21Amount = 0;
    let appliedTerRate: PayrollTerRate | null = null;
    if (input.complianceFlags.pph21_ter) {
      appliedTerRate = resolveTerRate(terRates, compensation.ter_category || "A", taxableIncome);
      if (appliedTerRate) {
        pph21Amount = (taxableIncome * appliedTerRate.rate_percent) / 100;
      } else {
        summary.issues.missing_ter_rate.push(employee.id);
        warnings.push("Tarif TER tidak ditemukan untuk kategori pegawai.");
      }
    }

    const bpjsBase = baseSalary;
    let bpjsEmployee = 0;
    let bpjsEmployer = 0;
    const bpjsDetails: Array<{
      program: string;
      employee_rate_percent: number;
      employer_rate_percent: number;
      base: number;
      employee_amount: number;
      employer_amount: number;
    }> = [];

    if (input.complianceFlags.bpjs_kesehatan || input.complianceFlags.bpjs_ketenagakerjaan) {
      const programs = input.complianceFlags.bpjs_ketenagakerjaan
        ? ["jht", "jkk", "jkm", "jp", "jkp"]
        : [];
      if (input.complianceFlags.bpjs_kesehatan) programs.unshift("kesehatan");

      for (const program of programs) {
        const rates = resolveBpjsRates(bpjsRates, program, program === "jkk" ? compensation.jkk_risk_level : null);
        if (rates.length === 0) continue;
        const rate = rates[0];
        const base = rate.wage_cap ? Math.min(bpjsBase, rate.wage_cap) : bpjsBase;
        const employeeAmount = (base * rate.employee_rate_percent) / 100;
        const employerAmount = (base * rate.employer_rate_percent) / 100;
        bpjsEmployee += employeeAmount;
        bpjsEmployer += employerAmount;
        bpjsDetails.push({
          program,
          employee_rate_percent: rate.employee_rate_percent,
          employer_rate_percent: rate.employer_rate_percent,
          base,
          employee_amount: employeeAmount,
          employer_amount: employerAmount,
        });
      }
    }

    const fixedDeductions = sum(deductionFixed.map((item) => item.amount));
    const variableDeductionTotal = sum(variableDeductionDetails.map((item) => item.amount));
    const totalDeductions = fixedDeductions + variableDeductionTotal + bpjsEmployee + pph21Amount;
    const netPay = grossIncome - totalDeductions;

    let minimumWage = null;
    let minimumWageOk = true;
    if (input.complianceFlags.upah_minimum) {
      minimumWage = resolveMinimumWage(minimumWages, compensation.region_level, compensation.region_code);
      if (minimumWage && baseSalary < minimumWage.amount) {
        minimumWageOk = false;
        summary.issues.below_minimum_wage.push(employee.id);
        warnings.push("Gaji pokok di bawah upah minimum wilayah.");
      }
      if (!minimumWage) {
        warnings.push("Data upah minimum untuk wilayah pegawai belum tersedia.");
      }
    }

    const metadata: Json = {
      employee: {
        id: employee.id,
        name: employee.name,
        nik: employee.nik,
        email: employee.email,
      },
      period: {
        id: input.period.id,
        key: input.period.period_key,
        start: input.period.period_start,
        end: input.period.period_end,
      },
      income: {
        base_salary: baseSalary,
        fixed_components: incomeFixed,
        variable_components: variableIncomeDetails,
        gross_income: grossIncome,
        taxable_income: taxableIncome,
      },
      deductions: {
        fixed_components: deductionFixed,
        variable_components: variableDeductionDetails,
        bpjs_employee: bpjsEmployee,
        pph21_amount: pph21Amount,
        total_deductions: totalDeductions,
      },
      bpjs: {
        employee_total: bpjsEmployee,
        employer_total: bpjsEmployer,
        details: bpjsDetails,
      },
      pph21: {
        ter_category: compensation.ter_category,
        rate_percent: appliedTerRate?.rate_percent ?? null,
        amount: pph21Amount,
      },
      minimum_wage: minimumWage
        ? {
            region_level: minimumWage.region_level,
            region_code: minimumWage.region_code,
            region_name: minimumWage.region_name,
            amount: minimumWage.amount,
            is_compliant: minimumWageOk,
          }
        : null,
      net_pay: netPay,
      warnings,
    };

    summary.totals.employees_processed += 1;
    summary.totals.gross_income += grossIncome;
    summary.totals.total_deductions += totalDeductions;
    summary.totals.net_pay += netPay;
    summary.totals.pph21_amount += pph21Amount;
    summary.totals.bpjs_employee += bpjsEmployee;
    summary.totals.bpjs_employer += bpjsEmployer;

    results.push({
      employee_id: employee.id,
      gross_income: grossIncome,
      taxable_income: taxableIncome,
      total_deductions: totalDeductions,
      net_pay: netPay,
      pph21_amount: pph21Amount,
      bpjs_employee: bpjsEmployee,
      bpjs_employer: bpjsEmployer,
      warnings,
      metadata,
    });
  }

  return { results, summary };
};
