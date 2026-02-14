import {
  DollarSign,
  Scale,
  TrendingUp,
  Wallet,
  FileText,
  Building2,
  Receipt,
  CalendarClock,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type TaxFormType = 'IVA_PEQUENO' | 'IVA_GENERAL' | 'ISR_MENSUAL' | 'ISR_TRIMESTRAL';

export interface DashboardCardDefinition {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: 'financiero' | 'operativo' | 'impuestos';
  requiresTaxConfig?: TaxFormType;
  isDefault: boolean;
}

export const CARD_REGISTRY: DashboardCardDefinition[] = [
  // Financial KPIs
  { id: 'total_activos', label: 'Total Activos', description: 'Saldo total de activos del período',
    icon: DollarSign, category: 'financiero', isDefault: true },
  { id: 'total_pasivos', label: 'Total Pasivos', description: 'Saldo total de pasivos del período',
    icon: Scale, category: 'financiero', isDefault: true },
  { id: 'utilidad_periodo', label: 'Utilidad del Período', description: 'Ingresos menos gastos del período',
    icon: TrendingUp, category: 'financiero', isDefault: true },
  { id: 'liquidez', label: 'Liquidez', description: 'Razón de activo corriente / pasivo corriente',
    icon: Wallet, category: 'financiero', isDefault: true },

  // Operational
  { id: 'partidas_pendientes', label: 'Partidas Pendientes', description: 'Partidas en borrador o pendientes de revisión',
    icon: FileText, category: 'operativo', isDefault: true },
  { id: 'saldos_bancarios', label: 'Saldos Bancarios', description: 'Saldos de cuentas bancarias registradas',
    icon: Building2, category: 'operativo', isDefault: true },

  // Tax cards
  { id: 'resumen_iva', label: 'Resumen IVA del Mes', description: 'IVA por pagar del mes anterior',
    icon: Receipt, category: 'impuestos', isDefault: true },
  { id: 'proximos_vencimientos', label: 'Próximos Vencimientos', description: 'Fechas límite de declaraciones',
    icon: CalendarClock, category: 'impuestos', isDefault: true },
  { id: 'resumen_isr_mensual', label: 'Resumen ISR Mensual', description: 'ISR del mes anterior (régimen 5%/7%)',
    icon: Receipt, category: 'impuestos', requiresTaxConfig: 'ISR_MENSUAL', isDefault: false },
  { id: 'proyeccion_isr_trimestral', label: 'Proyección ISR Trimestral',
    description: 'Proyección de ISR del trimestre actual',
    icon: TrendingUp, category: 'impuestos', requiresTaxConfig: 'ISR_TRIMESTRAL', isDefault: false },
  { id: 'resumen_impuestos', label: 'Resumen de Impuestos', description: 'Vista consolidada de todos los impuestos pendientes',
    icon: Receipt, category: 'impuestos', isDefault: false },
  { id: 'integridad_contable', label: 'Integridad Contable', description: 'Puntaje de salud de la integridad de datos',
    icon: ShieldCheck, category: 'operativo', isDefault: false },
];

export const DEFAULT_VISIBLE_CARDS = CARD_REGISTRY
  .filter(c => c.isDefault)
  .map(c => c.id);

/**
 * Get previous completed month info relative to today.
 * E.g. today = Feb 14 → returns { month: 1, year: 2026, monthName: "enero" }
 */
export function getPreviousCompletedMonth() {
  const now = new Date();
  const refMonth = now.getMonth(); // 0-indexed
  const refYear = now.getFullYear();
  const displayMonth = refMonth === 0 ? 12 : refMonth; // 1-indexed previous month
  const displayYear = refMonth === 0 ? refYear - 1 : refYear;
  const monthName = new Date(displayYear, displayMonth - 1, 1)
    .toLocaleString("es-GT", { month: "long" });
  return { month: displayMonth, year: displayYear, monthName };
}

export const QUARTER_MONTH_RANGES: Record<number, string> = {
  1: "Ene - Mar",
  2: "Abr - Jun",
  3: "Jul - Sep",
  4: "Oct - Dic",
};
