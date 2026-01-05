import { addDays, subDays, endOfMonth, startOfMonth, isWeekend, isSameDay, format, getMonth, getYear, addMonths } from 'date-fns';

export interface TaxDueDateConfig {
  tax_type: string;
  tax_label: string;
  calculation_type: 'last_business_day' | 'business_days_after' | 'fixed_day';
  days_value: number;
  reference_period: 'current_month' | 'next_month' | 'quarter_end_next_month';
  consider_holidays: boolean;
  is_active: boolean;
}

export interface Holiday {
  holiday_date: string;
  description: string;
  is_recurring: boolean;
}

/**
 * Check if a date is a holiday
 */
export function isHoliday(date: Date, holidays: Date[]): boolean {
  return holidays.some(holiday => isSameDay(date, holiday));
}

/**
 * Check if a date is a business day (not weekend, not holiday)
 */
export function isBusinessDay(date: Date, holidays: Date[]): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

/**
 * Get the last business day of a given month
 */
export function getLastBusinessDay(date: Date, holidays: Date[]): Date {
  let lastDay = endOfMonth(date);
  while (!isBusinessDay(lastDay, holidays)) {
    lastDay = subDays(lastDay, 1);
  }
  return lastDay;
}

/**
 * Add X business days to the start of a month
 */
export function addBusinessDays(date: Date, businessDays: number, holidays: Date[]): Date {
  let current = startOfMonth(date);
  let count = 0;
  
  while (count < businessDays) {
    current = addDays(current, 1);
    if (isBusinessDay(current, holidays)) {
      count++;
    }
  }
  return current;
}

/**
 * Get the reference date based on the period type
 */
export function getReferenceDate(periodDate: Date, referencePeriod: string): Date {
  switch (referencePeriod) {
    case 'next_month':
      return addMonths(periodDate, 1);
    case 'quarter_end_next_month':
      const month = getMonth(periodDate);
      const quarterEndMonth = Math.floor(month / 3) * 3 + 2; // 2, 5, 8, 11
      const quarterEnd = new Date(getYear(periodDate), quarterEndMonth, 1);
      return addMonths(quarterEnd, 1);
    case 'current_month':
    default:
      return periodDate;
  }
}

/**
 * Calculate due date based on configuration
 */
export function calculateDueDate(
  periodDate: Date,
  config: TaxDueDateConfig,
  holidays: Date[]
): Date {
  const referenceDate = getReferenceDate(periodDate, config.reference_period);
  const holidaysToConsider = config.consider_holidays ? holidays : [];
  
  switch (config.calculation_type) {
    case 'last_business_day':
      return getLastBusinessDay(referenceDate, holidaysToConsider);
    case 'business_days_after':
      return addBusinessDays(referenceDate, config.days_value, holidaysToConsider);
    case 'fixed_day':
      const year = getYear(referenceDate);
      const month = getMonth(referenceDate);
      let dueDate = new Date(year, month, config.days_value);
      // If the fixed day doesn't exist in this month, use last day
      if (dueDate.getMonth() !== month) {
        dueDate = endOfMonth(referenceDate);
      }
      return dueDate;
    default:
      return endOfMonth(referenceDate);
  }
}

/**
 * Convert holiday records to Date array for calculations
 */
export function parseHolidays(holidays: Holiday[], year?: number): Date[] {
  const targetYear = year || new Date().getFullYear();
  
  return holidays.map(h => {
    const date = new Date(h.holiday_date);
    if (h.is_recurring) {
      // For recurring holidays, use the target year
      return new Date(targetYear, date.getMonth(), date.getDate());
    }
    return date;
  }).filter(d => !isNaN(d.getTime()));
}

/**
 * Get days until a due date
 */
export function getDaysUntil(dueDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  
  const diffTime = due.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Determine priority based on days until due date
 */
export function getPriorityFromDays(daysUntil: number): 'urgente' | 'importante' | 'informativa' {
  if (daysUntil <= 2) return 'urgente';
  if (daysUntil <= 7) return 'importante';
  return 'informativa';
}

/**
 * Format due date for display
 */
export function formatDueDate(date: Date): string {
  return format(date, 'dd/MM/yyyy');
}

/**
 * Get default tax due date configurations for Guatemala
 */
export function getDefaultTaxConfigs(): Omit<TaxDueDateConfig, 'is_active'>[] {
  return [
    {
      tax_type: 'iva',
      tax_label: 'IVA Mensual',
      calculation_type: 'last_business_day',
      days_value: 0,
      reference_period: 'current_month',
      consider_holidays: true,
    },
    {
      tax_type: 'isr_trimestral',
      tax_label: 'ISR Trimestral',
      calculation_type: 'last_business_day',
      days_value: 0,
      reference_period: 'quarter_end_next_month',
      consider_holidays: true,
    },
    {
      tax_type: 'iso',
      tax_label: 'ISO Trimestral',
      calculation_type: 'last_business_day',
      days_value: 0,
      reference_period: 'current_month',
      consider_holidays: true,
    },
    {
      tax_type: 'isr_mensual',
      tax_label: 'ISR Mensual (Retenciones)',
      calculation_type: 'business_days_after',
      days_value: 10,
      reference_period: 'next_month',
      consider_holidays: true,
    },
    {
      tax_type: 'retenciones_iva',
      tax_label: 'Retención IVA',
      calculation_type: 'business_days_after',
      days_value: 10,
      reference_period: 'next_month',
      consider_holidays: true,
    },
    {
      tax_type: 'retenciones_isr',
      tax_label: 'Retención ISR',
      calculation_type: 'business_days_after',
      days_value: 10,
      reference_period: 'next_month',
      consider_holidays: true,
    },
  ];
}
