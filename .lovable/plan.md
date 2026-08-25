# Partidas en período cerrado: hallazgos y plan de corrección

## Resumen del bug (confirmado)

El formulario de partidas solo carga períodos **abiertos**. Cuando la fecha no cae en ninguno de ellos, asigna silenciosamente el **primer período abierto de la lista** (el año más reciente). Por eso una partida fechada 2022-12-31 quedó con `accounting_period_id = 513` (período 2023, abierto) y pudo contabilizarse: el trigger de base de datos valida el estado del período referenciado, no la fecha.

## Evidencia

### 1. Dónde se asigna `accounting_period_id`

`src/components/partidas/useJournalEntryForm.ts` — `loadInitialData()`:

- Línea 218: los períodos se consultan con `.eq("status", "abierto")` y `order(year, desc)`.
- Líneas 229-231:

```text
const match = periodsData.find(p => defaultDate >= p.start_date && defaultDate <= p.end_date);
setPeriodId(match ? match.id : periodsData[0].id);   // <-- fallback silencioso
```

El fallback `periodsData[0].id` es el período abierto más reciente (2023 = id 513). Además **no existe ningún efecto que recalcule `periodId` cuando el usuario cambia `entryDate`** (grep de `entryDate` en el hook: solo se usa para tipo de cambio, referencia bancaria y correlativo). El `periodId` inicial se conserva en los payloads de guardado (líneas 967, 1006, 1045).

### 2. Validación al guardar / contabilizar

- `validateDraft()` (líneas ~759): solo exige que `periodId` no sea nulo.
- `validateForPosting()` (líneas ~772): igual — exige `periodId` no nulo. **Ninguna de las dos compara `entryDate` contra el rango del período.**
- Base de datos, trigger `enforce_open_period_on_post` (migración `20260219035623`): al pasar `is_posted = true` consulta `status` de `NEW.accounting_period_id`. Como el período 513 está `abierto`, la validación pasa. No compara la fecha con `start_date`/`end_date`.

Conclusión: **no existe ninguna validación fecha-vs-período** ni en cliente ni en base de datos.

### 3. Alcance en otras empresas

```sql
select je.enterprise_id, count(*), count(*) filter (where je.is_posted)
from tab_journal_entries je
join tab_accounting_periods p on p.id = je.accounting_period_id
where je.deleted_at is null and (je.entry_date < p.start_date or je.entry_date > p.end_date)
group by 1;
```

Resultado: **solo enterprise 14, 2 partidas** (id 30703 `PART-2022-12-0006`, contabilizada; id 30704 `PART-2022-12-0007`, borrador), ambas creadas el 2026-08-25. Además, 0 partidas con `accounting_period_id` nulo en todo el sistema. El problema de datos está acotado; el problema de código es general.

### 4. Comportamiento del selector de fecha

`src/components/partidas/JournalEntryHeader.tsx` línea 85: es un `<input type="date">` sin `min`/`max` ni validación. El selector de período (líneas 105-120) solo lista períodos abiertos y no indica si el período elegido cubre la fecha. El usuario **no recibe advertencia ni bloqueo alguno**.

## Plan de corrección propuesto

### A. Cliente — `useJournalEntryForm.ts`
1. Cargar **todos** los períodos de la empresa (con su `status`), no solo los abiertos, para poder detectar el período real de una fecha.
2. Efecto nuevo: al cambiar `entryDate` (solo en partidas nuevas / borradores editables), recalcular `periodId` al período cuyo rango contiene la fecha. Si ese período está cerrado, dejar el `periodId` correcto pero marcar el estado `periodClosed`.
3. Eliminar el fallback `periodsData[0].id`: si no hay período que cubra la fecha, dejar `periodId` en null y mostrar el error existente "Período requerido".
4. Validación dura en `validateDraft()` y `validateForPosting()`: bloquear guardado/contabilización si la fecha no cae dentro del rango del período seleccionado, o si ese período no está `abierto`.

### B. UI — `JournalEntryHeader.tsx`
5. Mostrar el período detectado junto a la fecha y una alerta en rojo ("El 31/12/2022 pertenece al período 2022, que está cerrado") cuando aplique; el selector de período pasa a mostrar el período derivado de la fecha (períodos cerrados visibles pero no seleccionables como destino válido).

### C. Base de datos — endurecer el trigger
6. Ampliar `enforce_open_period_on_post` (y añadir validación en INSERT) para exigir que `entry_date` esté dentro de `[start_date, end_date]` del `accounting_period_id`, además de que el período esté `abierto`. Esto cierra el hueco para cualquier otro flujo (importaciones, wizards, pólizas de libros).

### D. Datos existentes (enterprise 14)
7. Decidir con el usuario: reasignar ambas partidas al período 2022 (id 512) — lo que las dejaría dentro de un período cerrado y exigiría despublicar/anular la contabilizada — o anularlas y volverlas a registrar en 2023. **No se toca nada sin confirmación explícita.**

## Nota

Los pasos A-C cierran la causa raíz. El paso D es una decisión contable que requiere tu criterio antes de ejecutarse.
