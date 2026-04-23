# Contabilidad Multi-Moneda — Fases 1 y 2

## Resumen

Habilitar contabilidad en monedas distintas a la moneda funcional (GTQ por defecto) por empresa. Fase 1 establece los cimientos (catálogo, monedas habilitadas por empresa, tipos de cambio mensuales). Fase 2 incorpora la captura multi-moneda en partidas, compras, ventas, activos fijos y cuentas bancarias usando el patrón "captura inline + override por transacción".

## Principios

- **Moneda funcional inmutable**: la columna existente `tab_enterprises.base_currency_code` define la moneda en la que se llevan los libros oficiales. Todos los reportes legales SAT siguen en moneda funcional.
- **Cada transacción guarda 3 datos**: `currency_code`, `exchange_rate` y los montos ya convertidos a moneda funcional. Las transacciones son inmutables después de posteadas.
- **Compatibilidad total**: empresas con una sola moneda no ven ningún cambio en UI.
- **No re-cálculo retroactivo**: cambiar una tasa solo afecta nuevas transacciones; los ajustes históricos se hacen con el wizard de Diferencial Cambiario (Fase 4).

## Fase 1 — Cimientos

### Base de datos

**Catálogo `tab_currencies`** (ya existe, normalizar):
- Sembrar: GTQ, USD, EUR, MXN, CRC, HNL, COP con código ISO 4217, nombre, símbolo, decimales.

**Nueva `tab_enterprise_currencies`**:
- `(enterprise_id, currency_code)` único.
- Marca qué monedas adicionales tiene habilitadas la empresa (la base se asume siempre).
- RLS por enterprise.

**Nueva/normalizar `tab_exchange_rates`**:
- `(enterprise_id, currency_code, year, month)` único.
- Campos: `rate` (1 unidad de moneda extranjera = X moneda funcional), `source`, `notes`, `created_by`, timestamps.
- RLS por enterprise; trigger valida que la moneda esté habilitada.

**Cuatro nuevas cuentas en `tab_enterprise_config`** (registradas ahora, usadas en Fase 4):
- `realized_fx_gain_account_id`, `realized_fx_loss_account_id` (afectan ISR)
- `unrealized_fx_gain_account_id`, `unrealized_fx_loss_account_id` (no afectan ISR)

**Funciones SQL helper**:
- `get_exchange_rate(_enterprise_id, _currency_code, _date)` → tasa del mes correspondiente o NULL.
- `get_enterprise_functional_currency(_enterprise_id)` → código de moneda base.

### Frontend

**Hooks nuevos**:
- `useCurrencies()` — catálogo global.
- `useEnterpriseCurrencies(enterpriseId)` — CRUD de monedas habilitadas.
- `useExchangeRates(enterpriseId)` — CRUD mensual + lookup `getRate(currencyCode, date)`.

**Pestaña "Monedas" en `EnterpriseDialog`**:
- Muestra moneda base (lectura).
- Lista de monedas habilitadas con agregar/quitar (selector con USD, EUR, MXN, CRC, HNL, COP).
- Bloqueo de quitar moneda si tiene transacciones registradas.

**Vista nueva en Configuración → "Tipos de Cambio"**:
- Tabla por empresa: Año | Mes | Moneda | Tipo de cambio | Fuente | Notas | Acciones.
- Filtros por año y moneda.
- Botones: "Agregar tasa", "Copiar mes anterior".
- Advertencia al editar una tasa con transacciones ya registradas: "Hay N transacciones de {mes} en {moneda} con tasa {X}. Cambiar la tasa solo afecta nuevas transacciones; las anteriores conservarán su tasa original. Para revaluar saldos use el wizard de Diferencial Cambiario."

**Utilities**:
- `formatCurrency(amount, code)` — reemplaza el `Q` hardcoded; resuelve símbolo desde catálogo.
- `convertToFunctional(originalAmount, rate)` y `convertFromFunctional(functionalAmount, rate)`.

## Fase 2 — Captura multi-moneda

### Columnas añadidas a tablas transaccionales

Todas nullable con defaults seguros (moneda base, rate = 1):

- `tab_journal_entries`: `currency_code`, `exchange_rate`
- `tab_journal_entry_details`: `original_debit`, `original_credit`, `currency_code`, `exchange_rate` — los campos `debit_amount`/`credit_amount` siguen en moneda funcional
- `tab_purchase_ledger`: `currency_code`, `exchange_rate`, `original_total`, `original_subtotal`, `original_vat`
- `tab_sales_ledger`: `currency_code`, `exchange_rate`, `original_total`, `original_subtotal`, `original_vat`
- `fixed_assets`: `currency_code`, `exchange_rate_at_acquisition`, `original_acquisition_cost`, `original_residual_value`
- `tab_bank_accounts`: `currency_code` (cada cuenta bancaria pertenece a UNA sola moneda)

### Componente reutilizable `CurrencyAmountInput`

- Inputs: monto en moneda original + selector de moneda + campo de tipo de cambio.
- Auto-llena el rate desde `getRate(currency, date)` al cambiar moneda o fecha.
- Si no hay rate del mes: abre mini-diálogo inline "Registrar tipo de cambio de {mes/año} para {moneda}: [____]" → guarda en `tab_exchange_rates` y continúa.
- Rate siempre editable por transacción (override).
- Muestra equivalente en moneda funcional debajo.

### Integración por módulo

**Partidas (`JournalEntryDialog` / `useJournalEntryForm`)**:
- Si la empresa tiene >1 moneda habilitada: aparece selector de moneda y campo de tipo de cambio en el header.
- Tabla de líneas: dos columnas extra (Debe original / Haber original) visibles solo en modo multi-moneda.
- Validación de balance se hace sobre montos en moneda funcional.
- Totales mostrados en ambas monedas.

**Compras (`PurchaseInvoiceWizard`, `QuickPurchaseForm`, `ImportPurchasesDialog`)**:
- Selector de moneda en formulario; monto e IVA capturados en moneda original.
- Conversión automática al guardar.
- Importación SAT: detecta moneda en columna correspondiente; si no, usa moneda funcional.

**Ventas (`ImportSalesDialog`, formulario manual)**: igual que compras.

**Activos fijos (`AssetDetailDialog`)**:
- Selector de moneda + rate al crear; queda fijo después.
- Costo histórico inmutable; depreciación siempre en moneda funcional.

**Cuentas bancarias (`tab_bank_accounts`)**:
- Selector de moneda al crear cuenta. No editable después si tiene movimientos.
- Movimientos bancarios y conciliación operan en la moneda de la cuenta; la partida contable refleja la conversión a funcional.

### Validaciones de negocio

- No se puede registrar transacción en moneda que no esté habilitada para la empresa.
- Cuenta bancaria en USD solo acepta líneas en USD (la línea bancaria de la partida hereda la moneda de la cuenta).
- Compras/ventas en moneda extranjera para reportes SAT siempre se reportan convertidas a moneda funcional.

## Detalles técnicos

- Migraciones SQL: nuevas tablas, columnas, triggers de validación, función `get_exchange_rate`, seed del catálogo.
- Defaults seguros para no romper datos existentes: `currency_code = base_currency_code`, `exchange_rate = 1`, `original_* = *`.
- Flag derivado en hooks: `enterpriseHasMultipleCurrencies` controla la visibilidad de selectores en UI.
- Reportes existentes intactos: como suman columnas en moneda funcional, los totales no cambian para empresas mono-moneda.
- Memoria a guardar: regla "captura inline + override por transacción" y patrón de 3 campos (`currency_code`, `exchange_rate`, monto funcional).

## Notas para fases posteriores (registradas, no implementadas aún)

- **Fase 3 (reportes duales)**: selector "Mostrar en" con opciones Solo funcional / Solo extranjera / Comparativo. Reportes oficiales SAT siempre en funcional.
- **Fase 4 (wizard de revaluación cambiaria)**:
  - Genera partidas DIFC mensuales sobre saldos vivos en moneda extranjera (cuentas monetarias: bancos, cuentas por cobrar/pagar).
  - Distingue diferencial **realizado** (al liquidar operación) vs **no realizado** (revaluación de saldos al cierre).
  - Usa las cuatro cuentas configuradas en `tab_enterprise_config` (definidas en Fase 1).
  - Las partidas DIFC viven solo en moneda funcional; en reportes futuros con vista "solo USD" se ocultarán para no distorsionar.
  - Conciliación fiscal ISR (Decreto 10-2012 Art. 21): cuentas no realizadas se excluyen automáticamente del cálculo SAT-1311.
  - Cuentas no monetarias (activos fijos, inventario, capital) NO se revalúan.

## Lo que NO incluye

- APIs externas de tipos de cambio (Banguat, fixer.io) — captura manual.
- Re-expresión por inflación.
- Reportes oficiales SAT en otra moneda.
- Wizard de revaluación cambiaria (Fase 4).
- Selector multi-moneda en reportes (Fase 3).
