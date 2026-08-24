# Doble conteo en la Partida de Apertura del Asistente de Cierre — hallazgos

## 1. Hipótesis confirmada (cuenta 2.1.2.1.01, empresa Mario Rolando Aguilar Santizo, enterprise_id 14)

| Criterio | Saldo 2.1.2.1.01 al 31/12/2022 |
|---|---|
| Con piso fiscal (igual que `AccountLedgerDrawer.tsx`, piso = apertura 2022-01-01) | Q1.00 crédito |
| Sin piso fiscal (cálculo actual de `generateOpeningEntry`) | Q272.00 crédito |
| Lo que quedó contabilizado en `APER-2023-0001` | Q272.00 crédito |

Diferencia Q271.00 = monto de la propia apertura 2022 de esa cuenta, contado dos veces. Confirmado también a nivel global: en las 22 cuentas de `APER-2023-0001`, el monto contabilizado coincide **exactamente** con el cálculo sin piso fiscal (0 excepciones), lo que prueba que la partida se construyó con la consulta defectuosa.

## 2. Alcance en `APER-2023-0001` (id 30684) — 22 de 22 cuentas afectadas, Q1,103,105.78 de error absoluto acumulado

Todas las cuentas de balance de la partida están mal. `diferencia = contabilizado − correcto` (positivo = debe inflado, negativo = haber inflado):

| Cuenta | Nombre | Contabilizado | Correcto (con piso) | Diferencia |
|---|---|---|---|---|
| 1.1.1.1.01 | Efectivo | 8,824.30 D | 1,678.00 D | +7,146.30 |
| 1.1.1.2.02 | Banco Agromercantil 30-3014450-0 | 2,207.98 D | 0.00 | +2,207.98 |
| 1.1.2.1.01 | Clientes Locales | 34,166.51 D | 0.00 | +34,166.51 |
| 1.1.3.1.03 | ISO Pagado trimestral | 15,699.67 D | 4,597.23 D | +11,102.44 |
| 1.1.4.1.01 | Inventario de Mercaderías | 16,602.16 D | 1,245.00 D | +15,357.16 |
| 1.2.1.1.01 | Mobiliario y Equipo | 55,192.12 D | 27,596.06 D | +27,596.06 |
| 1.2.1.1.02 | Equipo de Cómputo y Programas | 153,600.06 D | 76,800.03 D | +76,800.03 |
| 1.2.1.1.03 | Vehículos | 473,130.38 D | 236,565.19 D | +236,565.19 |
| 1.2.1.1.99 | Otros Activos Fijos | 13,193.02 D | 6,596.51 D | +6,596.51 |
| 1.2.1.2.01 | Deprec. Ac. Mobiliario y Equipo | 44,771.84 H | 22,385.92 H | −22,385.92 |
| 1.2.1.2.02 | Deprec. Ac. Equipo de Cómputo | 150,410.04 H | 75,205.02 H | −75,205.02 |
| 1.2.1.2.03 | Deprec. Ac. Vehículos | 351,278.42 H | 175,639.21 H | −175,639.21 |
| 1.2.1.2.05 | Deprec. Ac. Planta Telefónica | 2,638.08 H | 1,319.04 H | −1,319.04 |
| 1.2.1.2.99 | Deprec. Ac. Otros Activos Fijos | 3,267.22 H | 1,633.61 H | −1,633.61 |
| 2.1.1.1.01 | Proveedores Locales | 11,137.71 H | 0.00 | −11,137.71 |
| 2.1.1.1.05 | Bonificación Anual (Bono 14) | 6,000.00 H | 3,000.00 H | −3,000.00 |
| 2.1.1.1.16 | Cuota Patronal IGSS/IRTRA/INTECAP | 760.20 H | 0.00 | −760.20 |
| 2.1.1.1.17 | Retención Cuota Laboral IGSS | 289.80 H | 0.00 | −289.80 |
| 2.1.1.2.02 | Provisión para Indemnizaciones | 188,245.88 H | 94,122.94 H | −94,122.94 |
| 2.1.2.1.01 | IVA por Pagar | 272.00 H | 1.00 H | −271.00 |
| 3.1.1.1.01 | Rolando Cuenta Capital | 303,110.86 H | 137,322.42 H | −165,788.44 |
| 3.2.1.1.03 | Resultados Acumulados | 289,565.85 D | 155,551.14 D | +134,014.71 |

Patrón dominante: casi todo está exactamente al doble (los saldos de 2021 quedaron duplicados). Cuentas con movimiento sólo en 2021 (Clientes, Proveedores, Banco Agromercantil, IGSS) aparecen con saldo cuando su saldo real al 31/12/2022 es cero.

## 3. Otras empresas / otras aperturas del wizard

Sólo 4 partidas en toda la base tienen la descripción generada por el wizard (`Partida de apertura del ejercicio …`):

| Partida | Empresa | Fecha | Estado | Resultado de la verificación |
|---|---|---|---|---|
| `APER-2023-0001` (30684) | 14 | 2023-01-01 | contabilizado | **Corrupta** — 22/22 cuentas con diferencia |
| `APER-2022-0001` (30572) | 14 | 2022-01-01 | contabilizado | Correcta: no hay movimientos anteriores al piso, con y sin piso da lo mismo (0/22 diferencias) |
| `APER-2026-0001` (244) | 26 | 2026-01-01 | contabilizado | Correcta por la misma razón (0/13 diferencias) |
| `PD-2025-10-0001` (115) | 29 | 2025-10-01 | contabilizado | Apertura semilla de datos demo (es la primera partida de la empresa, sin historia previa); no es salida de un cierre. No aplica |

Conclusión: **una sola partida contabilizada dañada en toda la base** (`APER-2023-0001`, enterprise 14). Las otras se salvaron sólo porque su piso fiscal coincidía con el inicio de la historia contable.

## 4. Segundo foco del mismo bug dentro del mismo archivo

`loadBalanceVerification()` (líneas 974-989 de `PeriodClosingWizard.tsx`) usa **la misma consulta sin piso fiscal**, por lo que el paso "Verificar" del asistente muestra Activo/Pasivo/Capital también inflados y puede dar por "cuadrado" un balance construido con doble conteo. Además, ninguna de las dos consultas excluye las cadenas de reversión (`reversal_entry_id` / `reversed_by_entry_id`), a diferencia del criterio ya estandarizado en `fiscalFloor.ts` + `AccountLedgerDrawer.tsx`.

## 5. Corrección propuesta (pendiente de tu aprobación, no aplicada)

**Código** (`src/components/periodos/PeriodClosingWizard.tsx`):
1. En `generateOpeningEntry()`: resolver el piso con `getFiscalFloorDate(enterpriseId, period.end_date)` **excluyendo la propia apertura que se está generando**, aplicar `applyFiscalFloor` y añadir los filtros de reversión. Sin tocar la lógica de armado de líneas.
2. Lo mismo en `loadBalanceVerification()`.

**Datos** (`APER-2023-0001`, enterprise 14) — requiere tu decisión entre:
- **Opción A (recomendada):** reabrir/corregir en sitio las 22 líneas de la partida 30684 con los montos correctos de la tabla del punto 2 (la partida queda cuadrada: los débitos y créditos corregidos suman igual), dejando registro en bitácora.
- **Opción B:** anular `APER-2023-0001` con su partida de reverso y regenerar la apertura desde el asistente ya corregido.

Antes de aplicar cualquiera de las dos hay que revisar si el ejercicio 2023 de esa empresa ya tiene movimientos/cierre que dependan de esos saldos.
