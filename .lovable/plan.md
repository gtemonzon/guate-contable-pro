# Importación de compras sin cuenta/tipo: causa raíz confirmada

## Lo que muestra la evidencia (no es lo que parecía)

Consulté la bitácora (`tab_audit_log`) de los 22 registros del lote de las 17:01:49 en la empresa 14. Resultado:

| record_id | acción | hora | expense_account_id |
|---|---|---|---|
| 204576 | INSERT | 17:01:49 | NULL |
| 204577 | INSERT | 17:01:49 | NULL |
| 204578 | INSERT | 17:01:49 | NULL |
| 204583 | INSERT | 17:01:49 | NULL |
| 204594 | INSERT | 17:01:49 | NULL |
| 204576 | UPDATE | 17:02:35 | 684 |
| 204577 | UPDATE | 17:02:51 | 709 |
| 204578 | UPDATE | 17:03:10 | 684 |

Es decir: **los 22 registros se insertaron con `expense_account_id` y `operation_type_id` en NULL, sin excepción**. Los tres que hoy tienen valores (204576/77/78, los tres primeros de la lista) fueron editados a mano, uno por uno, entre 40 y 80 segundos después de la importación.

Esto descarta por completo la hipótesis de "solo la primera ocurrencia de cada NIT recibe el mapeo": no hubo mapeo para nadie. No hay closure obsoleta, ni problema de batching de estado en React, ni ruta alternativa que ponga NULL. El `.map(applyMappingToRecord)` sí es uniforme; simplemente no tenía nada que aplicar.

## Por qué la auto-sugerencia no aplicó a nada

La función `get_batch_purchase_mappings` filtra el historial con:

```sql
AND pl.invoice_date >= (CURRENT_DATE - INTERVAL '12 months')
```

Y en esta empresa:

```sql
select max(invoice_date) from tab_purchase_ledger
where enterprise_id = 14 and deleted_at is null
  and (expense_account_id is not null or operation_type_id is not null);
-- 2022-06-30   (389 registros con mapeo, todos de 2022)
```

Hoy es 2026-08-20, así que la ventana solo mira desde 2025-08-20. Las 53 facturas históricas del NIT 92800 existen y tienen cuenta y tipo, pero **todas son de 2022**, fuera de la ventana. La RPC devuelve cero filas.

Cadena completa: RPC devuelve `[]` → `supplierMappings` queda vacío → el `if (map.size > 0) setAutoSuggestMode("auto")` nunca se ejecuta → `autoSuggestMode` sigue en `"none"` → el panel "✨ Auto-sugerir por proveedor" ni siquiera se muestra en pantalla → `applyMappingToRecord` retorna cada registro tal cual. Todo insertado en NULL.

Es exactamente el escenario de esta empresa: importación de datos históricos (2022) sobre un sistema cuyo "hoy" está en 2026. La ventana de 12 meses, pensada para no arrastrar clasificaciones viejas, deja el feature completamente muerto en cualquier importación retroactiva.

## Fix propuesto

**1. Anclar la ventana a la fecha de las facturas importadas, no a `CURRENT_DATE`** (cambio principal, en la RPC `get_batch_purchase_mappings`):

- Agregar un parámetro opcional `p_reference_date date default null`.
- Cuando venga, filtrar `pl.invoice_date >= (p_reference_date - INTERVAL '12 months') AND pl.invoice_date <= p_reference_date` — es decir, "el último uso conocido antes o alrededor de la fecha del documento que estoy importando", que es lo que un contador esperaría.
- Cuando no venga, mantener el comportamiento actual (compatibilidad con cualquier otra llamada).
- `ORDER BY` se mantiene igual (`invoice_date DESC, id DESC`) para seguir tomando el uso más reciente.

**2. Enviar esa fecha desde el cliente** (`ImportPurchasesDialog.tsx`, en `fetchSupplierMappings`): calcular la fecha máxima de `invoice_date` entre los registros del archivo y pasarla como `p_reference_date`.

**3. Fallback cuando aun así no haya nada en la ventana:** si con la fecha de referencia la RPC no devuelve filas, hacer una segunda llamada sin ventana (o con la ventana desactivada) para no dejar al usuario sin sugerencias. Se implementa dentro de la misma RPC: si el filtro con ventana no arroja resultados para un NIT, caer al último uso histórico de ese NIT sin restricción de fecha.

**4. Visibilidad para el usuario:** hoy, cuando no hay sugerencias, la sección entera desaparece sin explicación. Mostrar una línea discreta en el paso de opciones cuando `supplierMappings.size === 0`: "No se encontraron sugerencias históricas para los NIT de este archivo." Así, un caso futuro se diagnostica en la pantalla en vez de en la base de datos.

## Detalle técnico

- Migración: `CREATE OR REPLACE FUNCTION public.get_batch_purchase_mappings(p_enterprise_id bigint, p_supplier_nits text[], p_reference_date date default null)`. Se conserva el chequeo de acceso (`is_super_admin` / `user_is_linked_to_enterprise`) y `SECURITY DEFINER` / `search_path = public` tal como están. Al agregar un parámetro con default no se rompen las llamadas actuales de 2 argumentos.
- Cliente: solo `fetchSupplierMappings` cambia (agrega `p_reference_date`); `applyMappingToRecord` y `handleProceedToSummary` quedan intactos — ya son correctos.
- Sin cambios de esquema ni de datos. Los 19 registros ya importados en NULL se pueden reclasificar a mano o volviendo a importar con sobrescritura, una vez aplicado el fix.
