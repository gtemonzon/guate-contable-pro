# Descripciones detalladas en pólizas de Libro de Compras / Ventas

## Hallazgo importante antes de tocar datos (Tarea A)

Verifiqué el mecanismo de vínculo de las 36 partidas de la empresa 14:

- Las 36 partidas existen y tienen 149 líneas con descripción genérica (12 COMP- de 2022, 24 VENT- de 2021-2022).
- `tab_purchase_journal_links` tiene 324 filas para la empresa 14, pero **0** de ellas apunta a estas partidas COMP- de 2022. Las facturas de estas partidas están vinculadas **solo por el campo legado `journal_entry_id`** en `tab_purchase_ledger` (ej. partida 30574 = 12 facturas, 30657 = 9 facturas).
- Para ventas **no existe** tabla de vínculos (no hay `tab_sales_journal_links`); el único mecanismo es `tab_sales_ledger.journal_entry_id` (232 filas con vínculo en la empresa 14).

Conclusión: la fuente para reconstruir es el campo legado `journal_entry_id` en ambos libros. No se usará `tab_purchase_journal_links` para estas partidas históricas.

Segundo hallazgo: **no existe** un motor equivalente a `buildPurchaseLines` para ventas (`buildSalesLines` no existe en el proyecto). Para ventas no voy a improvisar un motor: solo replicaré el **formato de descripciones** (`cliente - DOC serie-numero`), manteniendo intacta la lógica de montos/cuentas que ya existe.

## Tarea A — Corrección de datos (solo `description`)

Enfoque: por cada partida, agrupar las facturas vinculadas por su cuenta (`expense_account_id` / `income_account_id`) y reescribir el texto de la línea de detalle **cuya `account_id` coincide**. No se recalcula ningún monto ni se cambia ninguna cuenta.

- Líneas de gasto/ingreso: `proveedor - DOC serie-numero` unidas con `'; '` (mismo formato que `regenerateLinesFromLinkedPurchases`).
- Línea de IVA (cuenta 588 crédito / 644 débito según `tab_enterprise_config`): `IVA Crédito Fiscal - N factura(s)` / `IVA Débito Fiscal - N factura(s)`.
- Línea de contrapartida (proveedores/clientes o banco/caja, según la cuenta que ya tenga la línea): `Proveedores - N factura(s)` / `Clientes - N factura(s)`.
- Se rellenará también `source_type` (`PURCHASE`/`SALE`) y `source_ref` (lista de referencias), hoy vacíos.
- Alcance estricto: `enterprise_id = 14`, solo las 149 líneas cuya `description` empieza con `Libro de Compras`/`Libro de Ventas`.

Verificación: consulta antes/después comparando `sum(debit_amount)` y `sum(credit_amount)` por partida (deben ser idénticos) y volcado completo de 2 partidas de ejemplo (una COMP-, una VENT-) para tu confirmación visual.

Se ejecuta como migración (UPDATE de datos), en un solo paso reversible en cuanto al texto.

## Tarea B — Unificar el motor de "Generar Póliza"

Nueva utilidad compartida `src/utils/consolidatedJournalLines.ts`:

- `buildConsolidatedPurchaseLines(purchases, docTypeMap, config, enterpriseAppliesVat, bankAccountId)`: extrae tal cual la lógica de agregación de `regenerateLinesFromLinkedPurchases` (agrupación por cuenta con `buildPurchaseLines`, acumulación de `descriptions`/`refs`, línea de IVA, línea de contrapartida) y devuelve líneas con `description` y `source_ref`.
- `buildConsolidatedSalesLines(sales, docTypeMap, config, ...)`: mantiene **exactamente** el cálculo de montos que hoy tiene `LibrosFiscales.tsx` para ventas (multiplicador por tipo FEL, `net_amount`/`vat_amount` reales, exclusión de anuladas), y solo añade el desglose de descripciones y `source_ref`.

Luego `src/components/partidas/useJournalEntryForm.ts` (`regenerateLinesFromLinkedPurchases`) pasa a consumir la utilidad compartida, y `src/pages/LibrosFiscales.tsx` reemplaza los `Map<number, number>` de la póliza consolidada (compras y ventas) por llamadas a la misma utilidad. Los flujos "por Banco" y "por Documento" quedan igual (ya tienen detalle).

Invariantes que respeto: régimen fiscal de la empresa (`appliesVat`), IDP / impuestos no acreditables vía `resolveNonVatAccount`, multiplicadores NCRE, y redondeos a 2 decimales. El cambio es estrictamente de texto y trazabilidad.

## Detalles técnicos

- Tarea A: migración SQL con CTEs que agregan desde `tab_purchase_ledger`/`tab_sales_ledger` (`deleted_at is null`), construyen el texto con `string_agg(... , '; ' order by invoice_date, id)` y hacen `UPDATE tab_journal_entry_details` por `journal_entry_id` + `account_id`.
- Nota: las líneas de IVA y contrapartida se identifican por `account_id` comparado con `tab_enterprise_config` y por signo debe/haber, no por texto.
- Tarea B: sin cambios de esquema; typecheck con `tsgo` al terminar.
