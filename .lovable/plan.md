## Plan: Corrección de "Pendiente" tras contabilizar + Historial de depreciaciones

### Problema confirmado
Los 20 activos de enero 2026 sí están marcados como `POSTED` en la base de datos. El "Pendiente" es un bug visual causado por:
1. `sumDepreciationForPeriod` filtra solo `PLANNED` → devuelve 0 cuando ya está posteado
2. `DepreciationPostingPage` filtra `amount > 0` → oculta filas posteadas
3. La invalidación de cache no alcanza queries individuales por `assetId`

---

### Cambios a implementar

**1. `src/domain/fixedAssets/calculations.ts`**
Refactorizar `sumDepreciationForPeriod` para devolver:
```ts
{
  amountPlanned: number,   // suma de filas PLANNED
  amountPosted: number,    // suma de filas POSTED
  months: Array<{year, month}>,
  hasPosted: boolean,
  hasPlanned: boolean
}
```
Actualizar el test correspondiente si existe.

**2. `src/components/activosFijos/DepreciationPostingPage.tsx`**
- Mostrar todos los activos con schedule en el período (sin filtro `amount > 0`)
- Badge ✅ "Ya contabilizado" cuando `hasPlanned === false && hasPosted === true`
- Badge ⏳ "Pendiente" cuando `hasPlanned === true`
- Deshabilitar botón "Contabilizar" para activos ya posteados
- Mostrar resumen: "X activos pendientes / Y ya contabilizados"
- Fix invalidación: 
```ts
qc.invalidateQueries({ 
  predicate: (q) => q.queryKey[0] === 'depreciation_schedule' 
})
```

**3. `src/hooks/useDepreciationRuns.ts` (nuevo)**
Hook que consulta `fixed_asset_event_log` filtrando por `event_type = 'POST_DEPRECIATION'`, agrupado por `run_id` o por período (year, month). Devuelve:
- run_id / período
- fecha de ejecución
- cantidad de activos afectados
- monto total contabilizado
- usuario que ejecutó

**4. `src/components/activosFijos/DepreciationHistoryCard.tsx` (nuevo)**
Tarjeta colapsable al final de `DepreciationPostingPage` con tabla:
| Período | Fecha ejecución | # Activos | Monto total | Usuario |

Ordenado descendente por fecha. Sin paginación inicial (limit 50).

---

### Archivos tocados
- ✏️ `src/domain/fixedAssets/calculations.ts`
- ✏️ `src/components/activosFijos/DepreciationPostingPage.tsx`
- 🆕 `src/hooks/useDepreciationRuns.ts`
- 🆕 `src/components/activosFijos/DepreciationHistoryCard.tsx`

### Fuera de alcance (próxima iteración si lo pides)
- Generación automática de la partida contable Debe Gasto / Haber Depreciación Acumulada
- Botón "Reversar contabilización" desde el historial
