# Plan de implementación: Conciliación Cuadrática SAT + Nómina

## 🟦 SPRINT A — Conciliación Bancaria Cuadrática (formato SAT Guatemala)

### Migración de base de datos
1. **Tabla `tab_bank_reconciliation_quadratic`** (1:1 con `tab_bank_reconciliations`):
   - `reconciliation_id` (FK), `enterprise_id`, `bank_account_id`
   - Saldos: `initial_balance_bank`, `initial_balance_books`, `final_balance_bank`, `final_balance_books`
   - Movimientos: `total_income_bank`, `total_income_books`, `total_expenses_bank`, `total_expenses_books`
   - Auditor: `auditor_name`, `auditor_colegiado_number`, `auditor_signature_date`
   - `created_at`, `created_by`, `updated_at`
   - RLS: select/insert/update vía `user_is_linked_to_enterprise`; delete denegado (inmutabilidad).

2. **Tabla `tab_bank_reconciliation_adjustments`** (ajustes/diferencias):
   - `reconciliation_id`, `adjustment_type` (cheque_no_cobrado | deposito_en_transito | nota_debito_banco | nota_credito_banco | error_banco | error_libros | otro)
   - `description`, `amount`, `document_reference`, `affects_side` (banco | libros), `adjustment_date`
   - RLS análoga.

3. **Columnas nuevas en `tab_enterprise_config`**:
   - `default_auditor_name TEXT`, `default_auditor_colegiado TEXT` (para pre-llenar reportes).

### Hooks
- `src/hooks/useBankReconciliationQuadratic.ts`: CRUD de cuadrática y ajustes, cálculo automático de totales desde `tab_bank_movements` conciliados.

### Componentes UI
- `QuadraticReconciliationView.tsx`: vista principal con 4 cuadrantes editables + validación de cuadre (Saldo final banco ± ajustes = Saldo final libros).
- `AdjustmentsManager.tsx`: tabla CRUD para ajustes con tipo, descripción y monto.
- `QuadraticReconciliationPDF.tsx`: PDF formato SAT (cabecera empresa+banco+NIT, 4 cuadrantes, ajustes, firma CPA, folio) usando `usePdfConfig` + `jsPDF`.
- Nueva pestaña "Cuadrática SAT" en `src/pages/ConciliacionBancaria.tsx`.

## 🟦 SPRINT B — Matching asistido banco ↔ libros

### Edge function
- `supabase/functions/auto-match-bank-movements/index.ts`:
  - Input: `{ bank_account_id, period_start, period_end }`
  - Carga `tab_bank_movements` (no conciliados) y `tab_journal_entry_details` (publicadas, cuenta bancaria del período).
  - Score por par: monto exacto (40) + fecha ±3 días (30) + referencia/cheque coincide (30).
  - Output: array de sugerencias `[{ movement_id, journal_detail_id, score, confidence: 'high'|'medium'|'low' }]`.
  - `verify_jwt = false` con validación JWT en código (patrón establecido en proyecto).

### Componente UI
- `AutoMatchPanel.tsx`: panel lateral en `ConciliacionBancaria.tsx`, agrupa sugerencias por confianza, botón "Aceptar todas las de alta confianza" que marca movimientos como reconciliados en lote.

## 🟩 SPRINT C — Módulo de Nómina (importación Excel + póliza)

### Migración de base de datos
1. **Tabla `tab_payroll_periods`** (cabecera mensual):
   - `id`, `enterprise_id`, `period_year`, `period_month`, `payment_date`
   - `status` (draft | imported | posted | reversed)
   - `journal_entry_id` (cuando se contabiliza), `total_gross`, `total_deductions`, `total_net`
   - `notes`, `created_at`, `created_by`, `updated_at`
   - Constraint: `UNIQUE(enterprise_id, period_year, period_month)`
   - RLS por `user_is_linked_to_enterprise`; delete solo en estado draft.

2. **Tabla `tab_payroll_entries`** (detalle por empleado):
   - `id`, `payroll_period_id`, `employee_dpi`, `employee_name`, `employee_position`
   - Ingresos: `base_salary`, `bonificacion_decreto`, `overtime`, `commissions`, `other_income`
   - Descuentos: `igss_laboral`, `isr_retained`, `loans_deduction`, `other_deductions`
   - `net_pay`, `created_at`
   - RLS heredada del período.

3. **12 columnas nuevas en `tab_enterprise_config`** (set ampliado):
   - `payroll_salaries_expense_account_id`
   - `payroll_bonificacion_expense_account_id`
   - `payroll_igss_patronal_expense_account_id`
   - `payroll_indemnizacion_expense_account_id`
   - `payroll_aguinaldo_expense_account_id`
   - `payroll_bono14_expense_account_id`
   - `payroll_vacaciones_expense_account_id`
   - `payroll_igss_payable_account_id`
   - `payroll_isr_payable_account_id`
   - `payroll_salaries_payable_account_id`
   - `payroll_indemnizacion_provision_account_id`
   - `payroll_aguinaldo_bono14_provision_account_id`

4. **Prefijo NOM-** en `tab_journal_entry_prefixes` para las pólizas de nómina.

### Plantilla Excel
- `public/templates/payroll-template.xlsx` con columnas: `DPI | Nombre | Puesto | Sueldo Base | Bonificación | Horas Extra | Comisiones | Otros Ingresos | IGSS Laboral | ISR | Préstamos | Otros Descuentos | Líquido`
- Generada vía script con `xlsx` package (ya instalado).

### Hooks
- `src/hooks/usePayrollPeriods.ts`: CRUD de períodos y entries, cálculo de totales agregados.
- `src/hooks/usePayrollPosting.ts`: genera póliza contable con tasas estándar Guatemala:
  - IGSS patronal: 12.67% del sueldo base
  - Indemnización: 9.72% (1/12 + 1/12 indemnización Guatemala)
  - Aguinaldo: 8.33% (1/12)
  - Bono 14: 8.33% (1/12)
  - Vacaciones: 4.17% (15 días/360)
  - Sigue protocolo header→lines→posted documentado en memoria.

### Componentes UI
- `src/pages/Nomina.tsx` con tabs "Períodos" | "Configuración".
- `PayrollPeriodCard.tsx`: tarjeta mensual con totales y acciones (Ver detalle | Contabilizar | Reversar).
- `PayrollDetailDialog.tsx`: tabla editable de empleados + botón "Importar Excel" + descargar plantilla.
- `ImportPayrollDialog.tsx`: lee `.xlsx`, valida con Zod, preview, detección de duplicados por (DPI + período).
- `PayrollPostingPreview.tsx`: muestra débitos/créditos calculados antes de confirmar el asiento.
- Sidebar: nueva entrada "Nómina" en grupo Contabilidad (ícono `Users`).

### Configuración
- Extender `EnterpriseAccountsManager.tsx` con sección "Cuentas de Nómina" (12 selectores) + "Datos del Auditor CPA" (nombre + colegiado).
- Extender `useEnterpriseConfig.ts` con los 14 campos nuevos.

### Permisos
- Solo `super_admin`, `enterprise_admin`, `contador_senior` pueden importar/contabilizar nómina (datos sensibles).

### Capacitación
- Agregar lecciones a `src/data/trainingContent.ts`:
  - Fase 2: "Conciliación Bancaria Cuadrática SAT" + "Módulo de Nómina"
  - Links directos a `/conciliacion` y `/nomina`.

## 📦 Resumen de entregables

| Tipo | Archivo |
|------|---------|
| Migración 1 | Tablas cuadráticas + columnas auditor |
| Migración 2 | Tablas nómina + 12 cuentas + prefijo NOM |
| Edge function | `auto-match-bank-movements/index.ts` |
| Hooks | `useBankReconciliationQuadratic`, `usePayrollPeriods`, `usePayrollPosting` |
| Componentes conciliación | `QuadraticReconciliationView`, `AdjustmentsManager`, `QuadraticReconciliationPDF`, `AutoMatchPanel` |
| Componentes nómina | `PayrollPeriodCard`, `PayrollDetailDialog`, `ImportPayrollDialog`, `PayrollPostingPreview` |
| Página | `src/pages/Nomina.tsx` |
| Plantilla | `public/templates/payroll-template.xlsx` |
| Ediciones | `ConciliacionBancaria.tsx`, `EnterpriseAccountsManager.tsx`, `useEnterpriseConfig.ts`, `AppSidebar.tsx`, `App.tsx`, `trainingContent.ts` |
| Memoria | Nuevos memos: `quadratic-reconciliation-sat`, `payroll-module-architecture` |

## ⚠️ Fuera de alcance
- Catálogo maestro de empleados (alcance "solo importación + póliza" confirmado).
- Cálculo automático de ISR planilla anual (se importa ya calculado).
- Reverso de nóminas posteado (queda como mejora futura, similar al patrón FX).

Aprobar este plan cambia a modo de implementación y procedo con los 3 sprints en orden A → B → C.
