# Hallazgos: doble conteo de saldo inicial (Inventario 1.1.4.1.01, empresa 14)

Hipótesis del usuario: **confirmada**. Nada fue modificado.

## 1. Evidencia SQL

Cuenta id 591 (`1.1.4.1.01`), enterprise_id 14, movimientos contabilizados:

```text
APER-2021-01-0001  2021-01-01  apertura  Debe  19,242.17
CDV-2021-0001      2021-12-31  diario    Haber 19,242.17
CDV-2021-0001      2021-12-31  diario    Debe  15,357.16
APER-2022-0001     2022-01-01  apertura  Debe  15,357.16
```

Suma de todo lo anterior a 2022-01-01 = **Q15,357.16** (3 líneas).
La partida APER-2022-0001 vuelve a declarar **Q15,357.16**.
15,357.16 (openingBalance calculado) + 15,357.16 (fila mostrada) = **Q30,714.32** = el doble reportado.

## 2. Mecanismo exacto del doble conteo en `AccountLedgerDrawer.tsx`

- Línea 128: se obtiene `fiscalFloor = getFiscalFloorDate(enterpriseId, startRef)` → devuelve `2022-01-01` (la apertura vigente).
- Línea 130: `const lowerBound = effectiveStartDate || fiscalFloor || null;` — cuando el llamador pasa `startDate` (caso "Período completo" 2022), **el piso fiscal se descarta**; solo se usa como respaldo cuando no hay `startDate`.
- Líneas 134-159: la consulta de saldo de apertura filtra únicamente `.lt(entry_date, lowerBound)` **sin `.gte(fiscalFloor)`**, así que arrastra todo 2021 (incluida la apertura de 2021) → Q15,357.16.
- Líneas 162-210: la consulta del período incluye la propia APER-2022-0001 y el saldo corrido arranca en `openingBalance`, sumando el mismo dinero dos veces.

El patrón correcto ya existe en el proyecto: `src/pages/MayorGeneral.tsx:409-429` y `src/pages/ConciliacionBancaria.tsx:439-463` sí aplican `.gte(entry_date, fiscalFloor)` al saldo previo. `AccountLedgerDrawer` omitió ese guardarraíl.

## 3. Asistente de Cierre — cálculo independiente, mismo bug (pre-existente)

`src/hooks/useCostOfSalesCalculation.ts` → `calculateInitialInventory` (líneas ~47-97):

- Consulta A: todas las partidas contabilizadas con `entry_date < period.start_date` (sin piso fiscal).
- Consulta B: partidas `entry_type='apertura'` **con `entry_date = period.start_date`**.
- Suma A + B sobre `inventory_account_id`.

Para 2022 eso da 15,357.16 + 15,357.16 = **Q30,714.32**. Es código propio, **no** usa `AccountLedgerDrawer` ni `getFiscalFloorDate`, y **no** cambió hoy (último cambio del archivo: 2026-04-26). Por lo tanto el bug del Asistente es anterior al cambio de hoy; la coincidencia de cifras es porque ambos cometen el mismo error conceptual.

Alcance real de cierres ya contabilizados (`tab_period_inventory_closing`): solo **2 registros** en toda la base:

```text
id 5  empresa 14  período 9  inicial 19,242.17  compras 63,181.45  final 15,357.16  costo 67,066.46  contabilizado 2026-07-30
id 1  empresa 26  período 4  inicial 10,800.00  compras 182,504.33 final 5,000.00   costo 188,304.33 contabilizado 2026-03-14
```

Ambos con inventario inicial correcto (no duplicado), porque corresponden a períodos cuya apertura no coexistía con historia previa duplicada. **Ningún cierre contabilizado quedó mal**; el riesgo es sobre cierres futuros (ej. el de 2022 de la empresa 14, que hoy propondría 30,714.32).

## 4. Otros reportes

Sin afectación (usan RPC con piso fiscal en Postgres):

- `get_trial_balance` — tiene CTE `_fiscal_floor` y filtra `entry_date >= floor_date AND < p_start_date`. Lo usan `ReporteSaldos.tsx`, `BalanceSaldos.tsx`, `ReporteFlujoEfectivo.tsx`.
- `get_balance_sheet` — mismo CTE `_fiscal_floor`. Lo usan `ReporteBalanceGeneral.tsx`, `ReporteVariaciones.tsx`, `useKpis.ts`.
- `get_account_ledger_as_of` — detecta apertura del año y omite el arrastre previo para evitar doble conteo. Lo usa `AccountBalanceInspector.tsx`.
- `ReporteLibroMayor.tsx` — usa el `opening_balance` del RPC servidor.

Con el mismo patrón riesgoso (cliente, sin piso fiscal):

- `src/components/reportes/ReporteLibroBancos.tsx:116-132` — saldo inicial sugerido = todo lo anterior a `dateFrom` sin `.gte(fiscalFloor)`. Si la cuenta bancaria tiene línea en la partida de apertura, duplica igual.

## Resumen de impacto

| Lugar | ¿Duplica? | ¿Cambió hoy? |
|---|---|---|
| `AccountLedgerDrawer.tsx` | Sí | Sí |
| `useCostOfSalesCalculation.ts` (Asistente de Cierre) | Sí | No (pre-existente) |
| `ReporteLibroBancos.tsx` (saldo inicial) | Sí, mismo patrón | No |
| RPCs (`get_trial_balance`, `get_balance_sheet`, `get_account_ledger_as_of`) y reportes que los usan | No | No |
| Cierres ya contabilizados en la base (2) | No | — |

## Fix propuesto (pendiente de tu aprobación, aún sin tocar código)

1. `AccountLedgerDrawer.tsx`: acotar la consulta de saldo previo con `.gte(entry_date, fiscalFloor)` cuando exista piso fiscal, replicando `MayorGeneral.tsx`. Si `fiscalFloor === lowerBound`, el saldo previo queda en 0 y la fila de apertura pasa a ser el arranque correcto.
2. `useCostOfSalesCalculation.ts`: reemplazar "todo lo anterior + apertura del día de inicio" por "movimientos desde el piso fiscal (inclusive) hasta la fecha de inicio (inclusive para la apertura)" — es decir, si existe apertura en `start_date`, usar únicamente esa apertura y descartar la historia previa.
3. `ReporteLibroBancos.tsx`: aplicar el mismo piso fiscal al saldo inicial sugerido.
4. Extraer el criterio a un helper compartido en `src/utils/fiscalFloor.ts` para evitar reincidencias.
