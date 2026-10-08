/**
 * Valores por defecto de "Vencimientos y alertas" (Editar Empresa > Impuestos) cuando
 * la empresa aún no tiene filas en tab_tax_due_date_config. Las claves tax_type las
 * usan tab_alert_config y las alertas: no cambiarlas.
 */
export interface TaxDueDateDefault {
  tax_type: string;
  tax_label: string;
  calculation_type: string;
  days_value: number | null;
  reference_period: string;
  consider_holidays: boolean;
  is_active: boolean;
}

// Default tax configurations for Guatemala
// calculation_type values: 'last_business_day', 'business_days_after', 'fixed_day'
// reference_period values: 'current_month', 'next_month', 'quarter_end_next_month'
export const DEFAULT_TAXES: TaxDueDateDefault[] = [
  {
    tax_type: "iva_mensual",
    tax_label: "IVA Mensual",
    calculation_type: "last_business_day",
    days_value: null,
    reference_period: "current_month",
    consider_holidays: true,
    is_active: true,
  },
  {
    tax_type: "isr_trimestral",
    tax_label: "ISR Trimestral",
    calculation_type: "last_business_day",
    days_value: null,
    reference_period: "quarter_end_next_month",
    consider_holidays: true,
    is_active: true,
  },
  {
    tax_type: "iso_trimestral",
    tax_label: "ISO Trimestral",
    calculation_type: "last_business_day",
    days_value: null,
    reference_period: "quarter_end_next_month",
    consider_holidays: true,
    is_active: false,
  },
  {
    tax_type: "retencion_isr",
    tax_label: "Retención ISR",
    calculation_type: "business_days_after",
    days_value: 10,
    reference_period: "next_month",
    consider_holidays: true,
    is_active: false,
  },
  {
    tax_type: "retencion_iva",
    tax_label: "Retención IVA",
    calculation_type: "business_days_after",
    days_value: 15,
    reference_period: "next_month",
    consider_holidays: true,
    is_active: false,
  },
  {
    tax_type: "isr_anual",
    tax_label: "ISR Anual",
    calculation_type: "fixed_day",
    days_value: 31,
    reference_period: "next_month",
    consider_holidays: true,
    is_active: false,
  },
];
