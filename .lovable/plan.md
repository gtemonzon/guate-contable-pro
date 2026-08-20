# Atajo "+" en el campo NIT: causa confirmada

## Qué encontré (con evidencia)

El handler `onKeyDown` **sí se dispara** y `repeatLastNit()` **sí se ejecuta**. El código de `PurchaseCard.tsx`, `SalesCard.tsx` y `nit-autocomplete.tsx` está correcto, y `enterpriseId` sí llega (se pasa desde `LibrosFiscales.tsx` línea 2117).

El problema está en el **dato que devuelve la consulta**, no en el evento.

`repeatLastNit()` busca el último NIT así:

```
.not("supplier_nit", "is", null)
.order("created_at", { ascending: false })
.limit(1)
...
if (!data?.supplier_nit) return;   // <-- salida silenciosa
```

El filtro excluye `NULL`, pero **no excluye la cadena vacía `''`**. Consulté la base de datos y el registro más reciente de la empresa donde se reportó el fallo (enterprise_id 14) es:

| id | created_at | supplier_nit |
|---|---|---|
| 204556 | 2026-08-20 15:57 | `''` (vacío) |
| 204555 | 2026-08-20 15:56 | `92800` |

Es decir: existe una factura guardada **sin NIT** (permitido desde que se agregó el sistema de "registros incompletos"), y es la última creada. La consulta la trae, `data.supplier_nit` es `''`, y el `if (!data?.supplier_nit) return;` sale sin hacer nada y sin error. Por eso "no pasa nada" y la consola queda limpia: **no hay ninguna excepción, el `try/catch` vacío no está ocultando nada**.

Mientras esa factura sin NIT siga siendo la más reciente, el atajo queda muerto de forma permanente en esa empresa.

Libro de Ventas tiene exactamente el mismo filtro incompleto en `tab_sales_ledger` (`.not("customer_nit","is",null)` sin excluir `''`), aunque hoy en esa empresa el último registro sí tiene NIT, por eso ahí todavía funciona. Es el mismo bug latente.

Diferencias secundarias detectadas en Ventas (no son la causa, pero conviene alinear):
- lee `enterpriseId` de `localStorage` en vez de recibirlo como prop;
- no filtra `deleted_at is null`, así que puede repetir el NIT de un registro borrado.

## Fix propuesto

En `src/components/compras/PurchaseCard.tsx` y `src/components/ventas/SalesCard.tsx`, dentro de `repeatLastNit`:

1. Excluir también los vacíos: agregar `.neq("supplier_nit", "")` / `.neq("customer_nit", "")` al filtro.
2. Traer varias filas en vez de una (`.limit(5)` sin `.maybeSingle()`) y quedarse con la primera cuyo NIT tenga contenido real tras `trim()`, como red de seguridad ante valores como `" "`.
3. En Ventas: usar la prop `enterpriseId` (igual que Compras) en lugar de `localStorage`, y agregar `.is("deleted_at", null)`.
4. Reemplazar el `catch {}` vacío por un `console.warn` con el error, para que un fallo futuro sea visible en consola.

Sin cambios de UI ni de esquema de base de datos.
