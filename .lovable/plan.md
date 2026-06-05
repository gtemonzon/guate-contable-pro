# Módulo: Retenciones y Exenciones de Impuestos

Módulo independiente para registrar, gestionar, contabilizar y reportar constancias de **Retención de IVA**, **Retención de ISR** y **Exenciones de IVA**, tanto **emitidas** como **recibidas**, alineado a la normativa SAT de Guatemala.

> Regla obligatoria: la **recepción** de retenciones/exenciones siempre está permitida. La configuración de empresa solo controla la **emisión**.

---

## Fase 1 — Modelo de datos (backend / migraciones)

### 1.1 Catálogo global de categorías ISR
Tabla `tab_isr_income_categories` (global, sin tenant):
- `name`, `description`, `default_percentage`, `regime` (actividades_lucrativas | rentas_capital_inmobiliario | rentas_capital_mobiliario), `is_active`
- Seed inicial: Servicios Profesionales, Arrendamientos, Intereses, Dividendos, Transporte, Otros
- RLS: lectura para `authenticated`, escritura solo `super_admin`

### 1.2 Configuración de empresa (extender `tab_enterprise_config`)
Añadir columnas booleanas:
- `issues_isr_retention_certificates` (default false)
- `issues_vat_retention_certificates` (default false)
- `issues_vat_exemption_certificates` (default false)

### 1.3 Cuentas contables especiales (extender `tab_enterprise_config` o tabla de mapeo existente)
Agregar referencias `account_id`:
- `account_vat_retained_receivable_id`
- `account_vat_retained_payable_id`
- `account_vat_exemption_control_id`
- `account_isr_retained_receivable_id`
- `account_isr_retained_payable_id`

### 1.4 Tabla principal `tab_tax_certificates`
Genérica para los tres tipos × dos direcciones:
- `tenant_id`, `enterprise_id`, `period_id`
- `direction` enum: `issued` | `received`
- `document_type` enum: `isr_retention` | `vat_retention` | `vat_exemption`
- Contraparte: `counterpart_nit`, `counterpart_name`
- Documento: `document_number`, `authorization_number`, `series`, `issue_date`
- Montos: `base_amount`, `vat_amount`, `percentage`, `tax_amount` (retención/exención)
- ISR específico: `isr_regime`, `isr_category_id` (FK a catálogo global)
- Vinculación opcional: `purchase_ledger_id`, `sales_ledger_id`, `journal_entry_id`
- `status` enum: `draft` | `posted` | `void`
- `created_by`, `created_at`, `updated_at`
- Restricción de período (mes del `issue_date` debe coincidir con el período seleccionado, regla estándar del proyecto)
- RLS multi-tenant estándar (aislamiento por `tenant_id` + permisos por empresa)
- Trigger de inmutabilidad para registros `posted` (consistente con journal entries)

### 1.5 Tabla de ingesta futura (preparación, sin OCR)
`tab_tax_certificate_ingestion_sources`:
- `certificate_id` (nullable), `source_type` (pdf | xml | image), `storage_path`, `status` (pending | processed | failed), `raw_payload jsonb`
- Solo estructura; no se procesa aún.

GRANTs explícitos en todas las tablas nuevas siguiendo el patrón del proyecto.

---

## Fase 2 — UI: módulo independiente

### 2.1 Sidebar
Añadir grupo **Gestión Tributaria** en `AppSidebar.tsx` (acordeón con persistencia, según el patrón establecido) con item **Retenciones y Exenciones** → ruta `/retenciones-exenciones`.

### 2.2 Página principal `src/pages/RetencionesExenciones.tsx`
- **Filtros** (período por defecto = mes anterior): Mes, Año, Tipo, Dirección, NIT, Nombre, No. Documento, No. Autorización. Búsqueda instantánea (debounced).
- **Tarjetas resumen** (calculadas sobre filtros activos):
  - ISR Retenido por Cobrar / por Pagar
  - IVA Retenido por Cobrar / por Pagar
  - Compras Exentas / Ventas Exentas
- **Grid** con columnas: Fecha, Tipo, Dirección, No. Documento, NIT, Nombre, Base, Impuesto, Estado. Paginación server-side.
- **Acciones**: Ver, Editar, Eliminar (respetando inmutabilidad de `posted`).
- **Botones**: Nuevo, Editar, Eliminar, Exportar Excel, Exportar PDF.

### 2.3 Formulario (panel lateral, no modal pesado)
`src/components/retenciones/CertificateFormPanel.tsx`:
- Selector Dirección + Tipo (controla campos visibles)
- Para emitidas: validar que la empresa tenga habilitada la emisión correspondiente
- Para recibidas: siempre permitido
- Para ISR: muestra régimen + categoría (del catálogo global) y autocalcula % por defecto
- Vinculación opcional a factura de compra/venta (usar `InvoiceSearchDialog` existente)
- Checkbox: **"Generar partida contable"**

### 2.4 Configuración de empresa
- Extender `EnterpriseTaxes.tsx` con sección **Perfiles Tributarios** (3 switches de emisión).
- Nueva tab en `Configuracion.tsx` → **Cuentas Contables Especiales (Retenciones)** para mapear las cuentas de la sección 1.3 (reutilizar patrón de cuentas especiales existente).
- Pantalla admin (super_admin) para mantener el catálogo global de categorías ISR.

---

## Fase 3 — Integraciones

### 3.1 Contabilización automática
Servicio `src/services/taxCertificateJournalEntry.ts`:
- Recibe un certificado y genera detalle de partida usando las cuentas mapeadas y los prefijos existentes (`tab_journal_entry_prefixes`).
- Sigue el flujo estándar: Header → Lines → posted (memoria del proyecto).
- Partida queda **editable** post-generación (se marca como draft hasta que el usuario la confirme).

### 3.2 Compras y Ventas
- En `PurchaseCard` y `SalesCard`: indicador visual si la factura tiene/espera retención/exención vinculada.
- Botón rápido "Agregar retención/exención" que pre-llena el formulario.

### 3.3 Declaración de IVA (`useDeclaracionCalculo.ts`)
Ampliar el cálculo para incluir:
- Ventas exentas y Compras exentas
- IVA retenido por terceros (a favor) e IVA retenido a proveedores (cargo)
- Sección visual nueva en `DeclaracionPreview.tsx`: Período, Retenciones, Exenciones, Posición Neta de IVA.

### 3.4 Conciliación
Nueva pestaña dentro del módulo: **Conciliación de Certificados**.
- Regla básica inicial: factura de compra con monto ≥ umbral configurable y proveedor marcado como "sujeto a retención" sin certificado asociado → estado `Missing Certificate`.
- Estados: `Matched` | `Missing Certificate` | `Pending Review`.
- Arquitectura preparada para reglas adicionales sin reescritura.

---

## Fase 4 — Reportes

`src/components/reportes/ReporteRetenciones.tsx` y `ReporteExenciones.tsx`:
- Agrupados por Mes / Año / Tipo
- Reporte detallado: Fecha, Documento, NIT, Nombre, Base, Impuesto, Monto
- Exportable a Excel y PDF reutilizando `reportExport.ts` y el sistema de folios legales existente
- Excluidos de reportes financieros operativos los registros `void` (consistente con la memoria de integridad)

---

## Detalles técnicos

- **Stack**: React + Vite + Tailwind + shadcn, Supabase (Lovable Cloud), TanStack Query para filtros/búsqueda instantánea con `keepPreviousData` (UI optimista).
- **RLS**: aislamiento estricto por `tenant_id` + `enterprise_id`, recepción siempre permitida independientemente de flags de emisión (la validación de emisión es a nivel de aplicación + check trigger).
- **Inmutabilidad**: certificados `posted` no se pueden UPDATE/DELETE (solo void → crea reverso, igual que journal entries).
- **Auditoría**: registrar `created_by` obligatorio y log en `tab_audit_log` con intent agrupado (`certificate_created`, `certificate_voided`, etc.).
- **Validación período**: fecha del documento debe estar dentro del mes del período seleccionado.
- **i18n / formato**: Quetzales, fechas en es-GT, NIT validado con Módulo 11 (`nitValidation.ts`).
- **Ingesta futura**: interfaces `CertificateIngestionService` con métodos `parsePdf/parseXml/parseImage` que por ahora lanzan `NotImplementedError`; tabla y storage bucket privado preparados.

---

## Entregables por orden de implementación

1. Migraciones (catálogo ISR, config empresa, cuentas especiales, `tab_tax_certificates`, ingesta).
2. Seeds del catálogo ISR + extensión de UI en Configuración de Empresa.
3. Sidebar + página principal con filtros, tarjetas y grid.
4. Formulario de alta/edición (panel lateral) con validaciones de emisión/recepción.
5. Servicio de contabilización automática + checkbox en el formulario.
6. Integración con declaración de IVA.
7. Conciliación básica + reportes + exportaciones.
8. Andamiaje de ingesta PDF/XML/imagen (sin OCR).

¿Procedo con la Fase 1 (migraciones y catálogo) o quieres ajustar el alcance antes?
