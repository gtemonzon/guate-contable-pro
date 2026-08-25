# Investigación: régimen Pequeño Contribuyente + alertas duplicadas/obsoletas

## 1. `pequeño_contribuyente` con `appliesVat: true`

Búsqueda de referencias literales al régimen fuera de `fiscalBookStrategy.ts`:

- `src/components/empresas/EnterpriseDialog.tsx:57,391,619` — solo opciones del selector.
- `src/components/empresas/EnterpriseCard.tsx:48`, `EnterprisesTable.tsx:284` — solo etiquetas de texto.
- `supabase/migrations/20251003194436_*.sql:23,194` — valores del enum/seed.

No existe ninguna rama de lógica de negocio que compare el régimen directamente. Todo el comportamiento pasa por `getFiscalBookStrategy()`, y los consumidores de `appliesVat` son:

- `src/pages/LibrosFiscales.tsx:278` (totales de IVA/base, `applyMixedTaxToRow`, generación de póliza).
- `src/components/partidas/QuickPurchaseForm.tsx:354`, `useJournalEntryForm.ts:701` (cálculo de IVA en captura/partidas).
- `PurchaseCard.tsx` / `PurchaseInvoiceList.tsx` (mostrar u ocultar columnas IVA/Exento).
- `ReporteCompras`, `ReporteVentas`, `ReporteComprasVentas` (usan `strategy`, principalmente `combinedBook`).

Ningún generador de declaración depende de la estrategia: `useDeclaracionCalculo.ts` y el formulario SAT-2046 no importan `fiscalBookStrategy` ni `useEnterpriseTaxRegime` (grep sin resultados). Es decir, cambiar `appliesVat` a `false` para `pequeño_contribuyente` **no rompe SAT-2046 ni ningún otro formulario**; solo dejaría de calcular/mostrar IVA acreditable en libros y partidas, que es el comportamiento correcto (las facturas FPEQ ya llegan con `vat_amount = 0`).

Riesgo residual a considerar antes del cambio: empresas con régimen `pequeño_contribuyente` que hoy tengan compras con `vat_amount > 0` almacenado — habría que revisar si existen y decidir si se recalculan.

## 2. Alertas duplicadas y período 2022 "pendiente" ya cerrado

Componente responsable: `src/hooks/useAlertGenerator.ts` (consumido por `DashboardAlerts.tsx`, `NotificationCenter.tsx` y `Notificaciones.tsx`); la lectura la hace `src/hooks/useNotifications.ts`.

### a) Duplicación: son dos filas reales en la base, por carrera entre dos generadores

Filas de la empresa 14 (Mario Rolando Aguilar Santizo):

```text
id 600  periodo_pendiente  2023  creada 2026-08-22 00:52:24.234
id 599  periodo_pendiente  2023  creada 2026-08-22 00:52:24.128   <- 106 ms de diferencia
id 478  periodo_pendiente  2022  creada 2026-07-30 20:35:00.816
id 477  periodo_pendiente  2022  creada 2026-07-30 20:35:00.645   <- 171 ms
id 157/156  vencimiento_iva_mensual  creadas con 245 ms de diferencia
```

No es un render doble ni un query con duplicados: `useNotifications` hace un `select` plano por `enterprise_id`. La causa es que **dos componentes ejecutan `generateAlerts()` al mismo tiempo** en el Dashboard:

- `MainLayout.tsx:260` monta `NotificationCenter`, cuyo `useEffect` (`NotificationCenter.tsx:29-33`) llama `generateAlerts(enterpriseId)`.
- `Dashboard.tsx:475` monta `DashboardAlerts`, cuyo `useEffect` (`DashboardAlerts.tsx:21-28`) también llama `generateAlerts(enterpriseId)`.

El guard `notificationExists()` (`useAlertGenerator.ts`) es un `SELECT` seguido de `INSERT` sin atomicidad: ambas ejecuciones consultan antes de que la otra inserte, ambas ven "no existe" y ambas insertan. No hay índice único en `tab_notifications (enterprise_id, notification_type, event_date)` que lo impida.

### b) Período 2022: la condición sí excluye cerrados; las filas son basura histórica

Condición exacta (`useAlertGenerator.ts`, bloque 2):

```ts
.from('tab_accounting_periods')
.select('id, year, end_date')
.eq('enterprise_id', enterpriseId)
.eq('status', 'abierto')
.lt('end_date', today)
```

El filtro `status = 'abierto'` es correcto. Estado real de la empresa 14:

```text
2021  cerrado   closed_at 2026-07-30 20:21
2022  cerrado   closed_at 2026-08-21 20:49
2023  abierto
```

Las alertas de 2022 (ids 477/478) se crearon el 2026-07-30 20:35, cuando 2022 todavía estaba abierto; el cierre ocurrió tres semanas después. Lo mismo con la alerta de 2021 (id 62, del 2026-02-02).

El defecto real: `generateAlerts` **solo crea** notificaciones de tipo `periodo_pendiente` y nunca las retira. Existe un helper `clearUnread(type)` que sí se usa para `partida_borrador`, pero no para `periodo_pendiente`, así que al cerrar un período su alerta queda viva para siempre.

## Fixes propuestos (pendientes de aprobación)

1. `fiscalBookStrategy.ts`: `pequeño_contribuyente` → `appliesVat: false` (previa verificación de compras con IVA guardado en empresas de ese régimen).
2. Duplicados: un solo punto de generación por sesión — dejar que solo `NotificationCenter` (global) dispare `generateAlerts`, y que `DashboardAlerts` solo lea/refresque; además serializar la generación con un guard en memoria por `enterpriseId` dentro de `useAlertGenerator`, y opcionalmente un índice único parcial en `tab_notifications (enterprise_id, notification_type, event_date)`.
3. Obsoletas: antes de generar `periodo_pendiente`, borrar las no leídas de ese tipo cuyo `event_date` corresponda a períodos ya cerrados (o simplemente `clearUnread('periodo_pendiente')` y regenerar solo las vigentes), más una limpieza puntual de las filas 62, 477 y 478.
