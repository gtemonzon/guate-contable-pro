

## Plan: Migrar numeración de partidas a formato PREFIX-YYYY-MM-####

### Resumen

Agregar el componente de mes a la numeración de partidas. El formato cambia de `PART-2021-004` a `PART-2021-01-0004`. Se renumerarán todas las partidas existentes según su `entry_date` y se modificarán las funciones RPC y utilidades del cliente.

### Datos actuales

| Enterprise | Prefijos usados | Meses con datos |
|---|---|---|
| 7 | VENT | dic |
| 14 | APER, PART, VENT, REV-* | ene, feb, mar |
| 26 | PD, COMP, VENT | ene-dic |
| 29 | PD | oct-dic |

Las partidas con prefijo `REV-*` tienen formato especial (REV-YYYYMMDD-###) y no se tocarán.

### Paso 1 — Migración de esquema (SQL)

1. **Agregar columna `month`** a `journal_entry_counters`
2. **Cambiar PK** de `(enterprise_id, prefix, year)` a `(enterprise_id, prefix, year, month)`
3. **Renumerar partidas existentes**: Para cada combinación `(enterprise_id, prefix, year, month)`, asignar números secuenciales `PREFIX-YYYY-MM-####` ordenados por `entry_date, id`. Solo afecta entries cuyo `entry_number` tenga formato `PREFIX-YYYY-###` (no toca `REV-*`, `PD-YYYYNN`, etc. con formato legacy).
4. **Poblar counters**: Insertar filas en `journal_entry_counters` con el `last_number` correcto para cada `(enterprise_id, prefix, year, month)`.
5. **Eliminar counters viejos** que ya no aplican.

Ejemplo de resultado para enterprise 14, enero 2021:
- `APER-2021-001` → `APER-2021-01-0001`
- `PART-2021-003` → `PART-2021-01-0001` (primera PART de enero por fecha/id)
- `PART-2021-004` → `PART-2021-01-0002`
- ...y así sucesivamente

### Paso 2 — Actualizar RPCs

**`allocate_journal_entry_number`**: Extraer mes de `p_entry_date`, upsert en PK `(enterprise_id, prefix, year, month)`, formatear como `PREFIX-YYYY-MM-####` (mes 2 dígitos, secuencia 4 dígitos).

**`preview_next_entry_number`**: Misma lógica de lectura con mes.

### Paso 3 — Actualizar utilidades cliente

**`src/utils/journalEntryNumbering.ts`**:
- `parseEntryNumber`: Nuevo regex `^([A-Z]+)-(\d{4})-(\d{2})-(\d+)$` retornando `{ prefix, year, month, sequence }`. Mantener backward-compat con formato viejo.
- `formatEntryNumber`: Producir `PREFIX-YYYY-MM-####`.

### Notas importantes

- Las partidas `REV-*` (reversiones) no se renumeran, mantienen su formato especial.
- Las partidas `PD-YYYYNN` de enterprise 26 (formato legacy sin guiones) se intentarán migrar también al nuevo formato si su prefijo aparece en `tab_journal_entry_prefixes`.
- El campo `entry_number` en la UI es de solo lectura, por lo que no hay cambios de UI necesarios.

