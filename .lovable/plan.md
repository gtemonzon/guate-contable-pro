# Investigación: etiqueta "Activo" del período y su impacto real

## 1. De dónde sale la etiqueta "Activo" (Editar Empresa → Períodos)

`src/components/empresas/EnterprisePeriods.tsx` — no consulta la base de datos para esto. Lee **localStorage**:

```ts
const loadActivePeriod = () => {
  const saved = localStorage.getItem(`currentPeriodId_${enterpriseId}`);
  if (saved) setActivePeriodId(parseInt(saved));
};
```

y luego pinta:

```tsx
{activePeriodId === period.id && (
  <Badge variant="outline" className="bg-primary/10">... Activo</Badge>
)}
```

O sea: la clave `currentPeriodId_26` en el navegador de este usuario apunta al período 2023. No tiene nada que ver con `is_default_period` ni con `status`.

Cómo se escribió ese valor: en `EnterpriseCard.tsx` (`fetchActivePeriod` y `handleSelectEnterprise`), la primera vez que se seleccionó la empresa se guardó el período abierto más reciente de ese momento; y en `EnterprisePeriods.handleSetActivePeriod` cuando se pulsa "Activar".

Por qué quedó apuntando a un período **cerrado**: el valor nunca se revalida. Solo se limpia en dos casos:
- `EnterprisePeriods.handleClosePeriod` (cierre manual desde esa pantalla) borra la clave si el cerrado era el activo — pero hoy el cierre real se hace con el asistente.
- `PeriodClosingWizard.tsx:1148` limpia **otra clave distinta**: `localStorage.removeItem('activePeriodId')` / `'activePeriodData'`, que no es `currentPeriodId_${enterpriseId}`. Por eso, al cerrar 2023 con el asistente, la marca de "activo" quedó pegada en 2023.

## 2. El Dashboard usa el MISMO criterio — y sí está ocultando datos

`src/pages/Dashboard.tsx:256` → `useActivePeriod(currentEntId)`, y `src/hooks/dashboard/useActivePeriod.ts:30` arranca por la misma clave:

```ts
const savedPeriodId = localStorage.getItem(`currentPeriodId_${enterpriseId}`);
if (savedPeriodId) {
  const { data } = await supabase.from('tab_accounting_periods')
    .select('id, year, start_date, end_date, status')
    .eq('id', parseInt(savedPeriodId)).single();
  if (data) { setActivePeriod(data); return; }   // <- acepta el período aunque esté CERRADO
}
```

El fallback a "período abierto más reciente" solo corre si no hay valor guardado. Con valor guardado = 2023, el dashboard trabaja sobre 2023.

**"Última partida registrada"** — `src/hooks/dashboard/useKpis.ts:81-93`:

```ts
const { startDate, endDate, prevStartDate, prevEndDate } = buildDateRange(activePeriod);
...
const { data: lastRow } = await supabase
  .from('tab_journal_entries')
  .select('entry_date')
  .eq('enterprise_id', enterpriseId)
  .eq('is_posted', true)
  .is('deleted_at', null)
  .lte('entry_date', endDate)          // <- endDate = 2023-12-31
  .order('entry_date', { ascending: false })
  .limit(1).maybeSingle();
if (lastRow?.entry_date) effectiveEnd = lastRow.entry_date;
```

Confirmada tu sospecha: el `.lte('entry_date', endDate)` topa la búsqueda al fin del período "activo" (2023), así que la fecha mostrada como "última partida registrada" y **todos los KPIs** (Balance General y P&L se piden con `p_as_of_date = effectiveEnd`) están calculados al 2023, ignorando 2024 y 2026.

La tarjeta "Saldos Bancarios" (`DashboardBankBalances.tsx:58-61`) también acota `entry_date` al rango del período activo.

## 3. Qué más depende de esa misma clave

Sí afecta a más pantallas, todas leyendo `currentPeriodId_${enterpriseId}` directo de localStorage:

- `src/pages/MayorGeneral.tsx:151` — fechas por defecto del Mayor = rango del período activo (2023).
- `src/components/reportes/ReporteLibroMayor.tsx:131` — igual.
- `src/components/reportes/ReporteFacturasPorCuenta.tsx:70` — igual.
- `src/components/empresas/EnterpriseCard.tsx:206/251` — muestra "Año Activo" en la tarjeta de empresa (y `EnterprisesTable` la columna de período).

En estas tres de reportes el impacto es de **fechas por defecto**: el usuario puede cambiarlas manualmente, pero al abrir el reporte ve 2023 y puede concluir que "no hay datos".

Lo que **no** depende de esta clave (buena noticia):
- Creación/validación de partidas: `src/components/partidas/useJournalEntryForm.ts:214-231` carga todos los períodos de la empresa y asigna `periodId` buscando el que contiene la `entry_date` (`defaultDate >= p.start_date && <= p.end_date`). No usa localStorage.
- El listado de `/partidas` y los reportes financieros principales (Balance, Resultados) usan sus propios selectores de fecha.

## Resumen del impacto

- Visual/informativo: etiqueta "Activo" en Editar Empresa, "Año Activo" en tarjeta y tabla de empresas.
- **Funcional y engañoso**: Dashboard completo (KPIs, fecha de última partida, saldos bancarios) calculado al 2023; y fechas por defecto de Mayor General, Libro Mayor y Facturas por Cuenta.
- La causa raíz es doble: (a) el asistente de cierre limpia una clave distinta a la que usa el resto del sistema, y (b) `useActivePeriod` acepta sin validar un período cerrado.

## Opciones de corrección (pendientes de tu aprobación, aún sin tocar código)

1. **Mínimo y seguro**: en `useActivePeriod` y en `EnterprisePeriods`/`EnterpriseCard`, ignorar (y limpiar) el `currentPeriodId_X` guardado cuando el período referido está `cerrado` o ya no existe, cayendo al fallback de "abierto más reciente".
2. **Cerrar la fuga del asistente**: que `PeriodClosingWizard` limpie `currentPeriodId_${enterpriseId}` (la clave real) al cerrar un período, y emita `periodChanged`.
3. **Opcional**: que el KPI de "última partida registrada" busque la última partida de TODA la empresa cuando la del período activo sea más antigua, o al menos etiquetar claramente que los KPIs son del período activo.

Dime cuáles quieres y lo implemento.
