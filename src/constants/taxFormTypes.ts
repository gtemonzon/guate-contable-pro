/**
 * Formularios de declaración configurables por empresa (tab_enterprise_tax_config),
 * con su etiqueta descriptiva y la tasa por defecto. Única lista para Editar Empresa >
 * Impuestos y Configuración > Tributario.
 */
export const TAX_FORM_TYPE_OPTIONS = [
  { type: "IVA_GENERAL", label: "IVA Régimen General (SAT-2237)", defaultRate: 12 },
  { type: "IVA_PEQUENO", label: "IVA Pequeño Contribuyente (SAT-2046)", defaultRate: 5 },
  { type: "ISR_MENSUAL", label: "ISR Opción Mensual (SAT-1311)", defaultRate: 5 },
  { type: "ISR_TRIMESTRAL", label: "ISR Trimestral (SAT-1341)", defaultRate: 25 },
  { type: "ISO_TRIMESTRAL", label: "ISO Trimestral", defaultRate: 1 },
] as const;

export type TaxFormTypeOption = (typeof TAX_FORM_TYPE_OPTIONS)[number];
