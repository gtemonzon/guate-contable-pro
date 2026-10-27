# Project rules
- Private document preview actions reauthorize through a per-request URL resolver; downloads use blobs so cross-origin storage links save correctly without extending signed URL lifetimes.
- Voiding a saved draft without replacement atomically detaches its unusable reference and matching line/purchase references in the existing authorized RPC; the draft, links, voided document and audit trail remain intact.
- Inventory catalog and current-balance sorting share the pure inventorySort utility; historical balances continue to use inventoryBalanceAsOf so UI ordering cannot alter valuation or exports.
- SAT purchase exemption derivation is centralized in finalizeImportedPurchase and gated by the stripped CSV/XLS source marker; EXEMPT uses the existing OTHER account mapping to preserve shared non-VAT accounting behavior.
- Purchase write boundaries normalize EXEMPT through persistedTaxCategory to OTHER while the existing database category constraint excludes EXEMPT; derived amounts remain unchanged and no schema change is implied.

## Convenciones de interfaz
- Toda tabla de registros editables abre su editor al hacer clic en la fila (usar getClickableRowProps de src/utils/clickableRow.ts; las acciones de la fila llevan data-row-action). Si una tabla nueva no tiene una acción por defecto evidente (por ejemplo, registros inmutables como un kardex), proponerla o preguntarle al usuario antes de implementar.
