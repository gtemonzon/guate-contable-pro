
# Autorización de Libros SAT por Empresa (revisado)

## Qué se construye

Sistema para gestionar las autorizaciones de libros emitidas por SAT por empresa, controlar el consumo de folios al exportar reportes en PDF, **imprimir la leyenda de autorización en cada página del PDF**, y **alertar automáticamente** en el centro de notificaciones cuando los folios se agotan.

## Cambios

### Base de datos (migración)

**Nueva tabla `tab_book_authorizations`:**
- `id` bigint PK
- `enterprise_id` bigint NOT NULL
- `book_type` text NOT NULL — uno de: `libro_compras`, `libro_ventas`, `libro_diario`, `libro_mayor`, `libro_estados_financieros`
- `authorization_number` text NOT NULL (max 25 caracteres)
- `authorization_date` date NOT NULL
- `authorized_folios` integer NOT NULL CHECK > 0
- `manual_adjustment` integer NOT NULL DEFAULT 0
- `notes` text NULL
- `is_active` boolean DEFAULT true
- `low_folios_notified_at` timestamptz NULL — para no spamear notificaciones
- `depleted_notified_at` timestamptz NULL
- `created_by` uuid DEFAULT auth.uid()
- `created_at`, `updated_at` timestamps
- RLS por enterprise vía `user_is_linked_to_enterprise`
- Índice único parcial: `(enterprise_id, authorization_number)` donde `is_active = true`

**Nueva tabla `tab_book_folio_consumption`:**
- `id` bigint PK
- `authorization_id` bigint NOT NULL → `tab_book_authorizations`
- `enterprise_id` bigint NOT NULL
- `book_type` text NOT NULL
- `pages_used` integer NOT NULL CHECK > 0
- `report_period` text NULL
- `report_date_from` date NULL
- `report_date_to` date NULL
- `notes` text NULL
- `created_by` uuid DEFAULT auth.uid()
- `created_at` timestamp
- RLS por enterprise. Inmutable (sin UPDATE/DELETE).

**Función `get_authorization_folio_status(_authorization_id bigint)`:**
- Devuelve `{ authorized, used, adjustment, available, is_low, is_overdrawn }`.

### Frontend

**1. Hook `src/hooks/useBookAuthorizations.ts`**
- CRUD de autorizaciones por `enterprise_id` y `book_type`.
- `getActiveAuthorizationForBook(enterpriseId, bookType)` → autorización activa más antigua con folios disponibles (FIFO).
- `consumePages(authorizationId, pagesUsed, metadata)`.
- `getFolioStatus(authorizationId)`.
- Tras `consumePages`: evalúa si quedan ≤ 10 o < 0 y dispara notificación (ver punto 9).

**2. `src/components/empresas/EnterpriseBookAuthorizations.tsx`**
- Tabla: Libro, # Autorización, Fecha, Folios Autorizados, Usados, **Disponibles** (link a modal de ajuste), Estado (badge OK / Pocos folios / Sobregirado), Acciones.
- Buscador por número o tipo.
- Botón "Nueva Autorización" → `BookAuthorizationDialog`.
- Modal de ajuste: input numérico + nota obligatoria → recalcula `manual_adjustment`.
- Historial de consumo desplegable por autorización.

**3. `src/components/empresas/BookAuthorizationDialog.tsx`**
- Form: select libro, número (max 25), fecha, folios autorizados, notas. Validación zod.

**4. `EnterpriseDialog.tsx`**
- Nueva pestaña "Libros SAT" → `<EnterpriseBookAuthorizations />`.

**5. `FolioExportDialog.tsx`**
- Nueva prop `bookType?: BookType` y `enterpriseId`.
- Carga autorización activa: muestra "Autorización SAT: {número} — Disponibles: {n}".
- Pre-llena `startingFolio` con `(authorized − available + 1)`.
- Input "Páginas estimadas" (refinado con conteo real tras render).
- Advertencias antes de exportar:
  - Normal: "Se consumirán {n} folios. Quedarán {m}."
  - ≤ 10: alerta amarilla "Pocos folios disponibles. Se recomienda autorizar más."
  - < 0: alerta roja "ATENCIÓN: quedarán {n} folios sobregirados."
  - Sin autorización: alerta roja con link a Empresas → Libros SAT.
- Tras exportar: registra consumo real.

**6. `reportExport.ts` — leyenda + conteo real**
- Nueva opción `authorizationLegend?: { number: string; date: string }`.
- En cada página del PDF: imprime al pie izquierdo la leyenda **"Autorización: {número} — Fecha: {fecha}"** en fuente pequeña (baseFontSize - 1).
- Se imprime junto al folio (folio arriba derecha, leyenda abajo izquierda).
- Devuelve `{ pageCount }` tras `doc.save()` para registro preciso del consumo.

**7. Integración en reportes**
- `ReporteCompras.tsx` → `bookType="libro_compras"`.
- `ReporteVentas.tsx` → `bookType="libro_ventas"`.
- `ReportePartidas.tsx` (Libro Diario) → `bookType="libro_diario"`.
- `ReporteLibroMayor.tsx` → `bookType="libro_mayor"`.
- `ReporteBalanceGeneral.tsx`, `ReporteEstadoResultados.tsx` → `bookType="libro_estados_financieros"`.
- `ReporteLibroBancos.tsx` → no aplica.

**8. Documentación en `/ayuda`**
- Nueva subsección "Autorización de Libros SAT" en Novedades Recientes: configuración, control de folios, leyenda automática en PDF, alertas y notificaciones.

**9. Notificaciones automáticas en centro de notificaciones**
- En `useBookAuthorizations.consumePages`, tras registrar el consumo:
  - Si `available <= 10 AND available > 0` y `low_folios_notified_at` es NULL o > 7 días atrás:
    - Insertar notificación tipo `folios_bajos_{book_type}` en `tab_notifications`:
      - Título: "Folios por agotarse — {Libro}"
      - Mensaje: "Quedan {n} folios disponibles de la autorización {número}. Solicita una nueva autorización a SAT."
      - Severidad: `warning`
      - Link a `/empresas` → editar empresa → Libros SAT.
    - Actualizar `low_folios_notified_at = now()`.
  - Si `available <= 0` y `depleted_notified_at` es NULL o > 7 días:
    - Insertar notificación tipo `folios_agotados_{book_type}`:
      - Título: "Folios agotados / sobregirados — {Libro}"
      - Mensaje: "La autorización {número} está sobregirada en {abs(available)} folios. Se recomienda no continuar emitiendo libros hasta autorizar nuevos folios."
      - Severidad: `error`.
    - Actualizar `depleted_notified_at = now()`.
- Integración con `useAlertGenerator`: agregar categoría "Libros SAT" para que estas notificaciones se reflejen en `DashboardAlerts` con su ícono propio (BookOpen).
- Cuando se cree una nueva autorización activa para el mismo libro/empresa: limpiar notificaciones `folios_bajos_*` y `folios_agotados_*` previas de ese libro (ya no aplica).

## Detalles técnicos

- **FIFO por fecha** para selección de autorización activa con folios > 0.
- **Ajuste manual** se guarda como delta en `manual_adjustment` + un registro en `tab_book_folio_consumption` con nota explicativa, preservando trazabilidad.
- **Inmutabilidad de consumo** (sin UPDATE/DELETE excepto super admin).
- **Permisos**: gestión requiere `enterprise_admin` o `super_admin`.
- **Folio inicial sugerido**: `(authorized_folios − available_folios + 1)`, editable con advertencia.
- **Anti-spam de notificaciones**: campos `low_folios_notified_at` / `depleted_notified_at` evitan duplicar avisos en cada exportación; sólo se re-notifica si han pasado más de 7 días.
- **Leyenda en PDF**: se renderiza en el callback `didDrawPage` de `autoTable` y también manualmente en páginas extra (totales/estadísticas) para garantizar que aparezca en TODAS las hojas.
- Sin cambios en edge functions.

## Lo que NO incluye

- No bloquea exportación cuando se sobregira (solo advierte y notifica).
- No envía notificaciones por email — sólo al centro de notificaciones in-app.
- No imprime leyenda de autorización en reportes que no requieren autorización SAT (Libro de Bancos, dashboards).
