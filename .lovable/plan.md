
# Plan Integral: Soft Delete, Auditoría y Control de Acceso por Tenant

## Resumen Ejecutivo

Este plan aborda tres áreas críticas identificadas en el sistema:
1. **Estandarización de eliminaciones** - Implementar soft-delete consistente
2. **Sistema de auditoría completo** - Triggers automáticos + interfaz de bitácora
3. **Control de acceso por Tenant** - Bloquear usuarios cuando su Tenant está inactivo

---

## FASE 1: Estandarización de Soft-Delete

### Problema Actual
El sistema usa un enfoque mixto:
- **Eliminación física (DELETE)**: `tab_enterprises`, `tab_sales_ledger`, `tab_purchase_ledger`, `tab_journal_entries`, `tab_accounts`
- **Soft-delete (is_active=false)**: `tab_users`, `tab_enterprise_documents`, `tab_tax_forms`

### Solución Propuesta

#### 1.1 Agregar columnas de soft-delete a tablas críticas

| Tabla | Agregar columna | Notas |
|-------|----------------|-------|
| `tab_enterprises` | Ya tiene `is_active` | Solo modificar lógica de eliminación |
| `tab_accounts` | Ya tiene `is_active` | Solo modificar lógica de eliminación |
| `tab_sales_ledger` | `deleted_at` + `deleted_by` | Nueva columna |
| `tab_purchase_ledger` | `deleted_at` + `deleted_by` | Nueva columna |
| `tab_journal_entries` | `deleted_at` + `deleted_by` | Nueva columna |
| `tab_journal_entry_details` | `deleted_at` | Nueva columna |
| `tab_user_enterprises` | `deleted_at` | Nueva columna |

#### 1.2 Crear función reutilizable para soft-delete

```sql
CREATE OR REPLACE FUNCTION soft_delete_record()
RETURNS TRIGGER AS $$
BEGIN
  NEW.deleted_at = NOW();
  NEW.deleted_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### 1.3 Modificar el código frontend

Actualizar los siguientes archivos para usar `UPDATE ... SET deleted_at = NOW()` en lugar de `DELETE`:
- `src/components/empresas/EnterpriseCard.tsx`
- `src/components/empresas/EnterprisesTable.tsx`
- `src/pages/LibroCompras.tsx`
- `src/pages/LibroVentas.tsx`
- `src/pages/Cuentas.tsx`
- `src/pages/Partidas.tsx` (si aplica)

#### 1.4 Actualizar queries para filtrar registros eliminados

Agregar `.is('deleted_at', null)` o `.eq('is_active', true)` en todas las consultas SELECT relevantes.

---

## FASE 2: Sistema de Auditoría Automática

### Problema Actual
- La tabla `tab_audit_log` existe pero está **vacía**
- No hay triggers que la pueblen automáticamente
- No hay interfaz para visualizar los logs

### Solución Propuesta

#### 2.1 Crear función genérica de auditoría

```sql
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enterprise_id bigint;
  v_old_data jsonb;
  v_new_data jsonb;
BEGIN
  -- Intentar obtener enterprise_id del registro
  IF TG_OP = 'DELETE' THEN
    v_enterprise_id := OLD.enterprise_id;
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_enterprise_id := NEW.enterprise_id;
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
  ELSE
    v_enterprise_id := NEW.enterprise_id;
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  END IF;

  INSERT INTO tab_audit_log (
    enterprise_id,
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    v_enterprise_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_old_data,
    v_new_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
```

#### 2.2 Crear triggers en tablas críticas

Aplicar a las siguientes tablas:
- `tab_enterprises` (INSERT, UPDATE, DELETE)
- `tab_users` (INSERT, UPDATE)
- `tab_accounts` (INSERT, UPDATE, DELETE)
- `tab_journal_entries` (INSERT, UPDATE, DELETE)
- `tab_sales_ledger` (INSERT, UPDATE, DELETE)
- `tab_purchase_ledger` (INSERT, UPDATE, DELETE)
- `tab_accounting_periods` (INSERT, UPDATE, DELETE)
- `tab_user_enterprises` (INSERT, UPDATE, DELETE)

#### 2.3 Actualizar RLS de tab_audit_log

Permitir acceso a Tenant Admins además de Super Admins:

```sql
-- Eliminar política actual
DROP POLICY IF EXISTS "Super admins view audit logs" ON tab_audit_log;

-- Nueva política que incluye Tenant Admins
CREATE POLICY "Admins can view audit logs"
ON tab_audit_log FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR (
    enterprise_id IN (
      SELECT e.id FROM tab_enterprises e
      WHERE is_tenant_admin_for(auth.uid(), e.tenant_id)
    )
  )
);
```

#### 2.4 Crear página de Bitácora (`/bitacora`)

Nueva página con las siguientes características:

**Filtros disponibles:**
- Rango de fechas (desde - hasta)
- Usuario específico
- Acción (INSERT, UPDATE, DELETE)
- Tabla afectada
- Búsqueda en descripción

**Columnas de la tabla:**
| Fecha/Hora | Usuario | Acción | Tabla | Descripción | Detalles |
|------------|---------|--------|-------|-------------|----------|

**Vista de detalles (modal):**
- Valores anteriores (old_values)
- Valores nuevos (new_values)
- Campos modificados resaltados

**Archivos a crear:**
- `src/pages/Bitacora.tsx` - Página principal
- `src/components/bitacora/AuditLogTable.tsx` - Tabla de logs
- `src/components/bitacora/AuditLogFilters.tsx` - Filtros
- `src/components/bitacora/AuditLogDetailDialog.tsx` - Modal de detalles

#### 2.5 Agregar ruta y menú

- Agregar ruta `/bitacora` en `App.tsx`
- Agregar opción en `AppSidebar.tsx` (solo visible para admins)

---

## FASE 3: Bloqueo de Acceso por Tenant Inactivo

### Problema Actual
El login solo verifica si el **usuario** está activo, no si su **Tenant** está activo.

### Solución Propuesta

#### 3.1 Modificar Login.tsx

Agregar verificación del estado del Tenant:

```typescript
// Después de verificar usuario activo, verificar tenant
const { data: tenantData, error: tenantError } = await supabase
  .from("tab_tenants")
  .select("is_active, tenant_name")
  .eq("id", userData.tenant_id)
  .single();

if (tenantError) throw tenantError;

if (!tenantData.is_active) {
  await supabase.auth.signOut();
  throw new Error(
    `La oficina contable "${tenantData.tenant_name}" está inactiva. ` +
    "Contacta al administrador del sistema."
  );
}
```

#### 3.2 Modificar MainLayout.tsx

Agregar verificación periódica del estado del Tenant para cerrar sesión automáticamente si se desactiva:

```typescript
// En useEffect para verificar sesión
useEffect(() => {
  const checkTenantStatus = async () => {
    if (!currentTenant) return;
    
    const { data } = await supabase
      .from("tab_tenants")
      .select("is_active")
      .eq("id", currentTenant.id)
      .single();
    
    if (data && !data.is_active) {
      await supabase.auth.signOut();
      toast({
        variant: "destructive",
        title: "Sesión terminada",
        description: "Tu oficina contable ha sido desactivada",
      });
      navigate("/login");
    }
  };

  const interval = setInterval(checkTenantStatus, 60000); // Cada minuto
  return () => clearInterval(interval);
}, [currentTenant]);
```

#### 3.3 Actualizar TenantContext.tsx

Agregar flag `isTenantActive` al contexto para uso en componentes.

---

## Diagrama de Flujo de Login Actualizado

```text
+------------------+
|   Usuario ingresa|
|   credenciales   |
+--------+---------+
         |
         v
+--------+---------+
| Autenticar con   |
| Supabase Auth    |
+--------+---------+
         |
    +----+----+
    | Exito?  |
    +----+----+
    No   |   Si
     |   v
     |   +------------------+
     |   | Verificar usuario|
     |   | is_active = true |
     |   +--------+---------+
     |            |
     |       +----+----+
     |       | Activo? |
     |       +----+----+
     |       No   |   Si
     |        |   v
     |        |   +------------------+
     |        |   | Verificar tenant |
     |        |   | is_active = true |
     |        |   +--------+---------+
     |        |            |
     |        |       +----+----+
     |        |       | Activo? |
     |        |       +----+----+
     |        |       No   |   Si
     |        |        |   v
     |        |        |   +------------------+
     |        |        |   | Verificar        |
     |        |        |   | empresas activas |
     |        |        |   +--------+---------+
     |        |        |            |
     v        v        v            v
+----+--------+--------+----+  +----+----+
|   Mostrar error y         |  | Redirigir|
|   cerrar sesión           |  | Dashboard|
+---------------------------+  +----------+
```

---

## Resumen de Archivos a Modificar

### Nuevos archivos
- `src/pages/Bitacora.tsx`
- `src/components/bitacora/AuditLogTable.tsx`
- `src/components/bitacora/AuditLogFilters.tsx`
- `src/components/bitacora/AuditLogDetailDialog.tsx`

### Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `src/pages/Login.tsx` | Agregar verificación de Tenant activo |
| `src/components/layout/MainLayout.tsx` | Verificación periódica de Tenant |
| `src/contexts/TenantContext.tsx` | Agregar `isTenantActive` |
| `src/App.tsx` | Agregar ruta `/bitacora` |
| `src/components/layout/AppSidebar.tsx` | Agregar menú Bitácora |
| `src/components/empresas/EnterpriseCard.tsx` | Cambiar DELETE a soft-delete |
| `src/components/empresas/EnterprisesTable.tsx` | Cambiar DELETE a soft-delete |
| `src/pages/LibroCompras.tsx` | Soft-delete + filtrar eliminados |
| `src/pages/LibroVentas.tsx` | Soft-delete + filtrar eliminados |
| `src/pages/Cuentas.tsx` | Soft-delete + filtrar eliminados |
| `src/pages/LibrosFiscales.tsx` | Soft-delete + filtrar eliminados |

### Migraciones de base de datos
1. Agregar columnas `deleted_at`, `deleted_by` a tablas críticas
2. Crear función `audit_trigger_function()`
3. Crear triggers de auditoría en tablas críticas
4. Actualizar RLS de `tab_audit_log`

---

## Orden de Implementación Sugerido

1. **Fase 3** (Control de Tenant) - Más crítico para seguridad
2. **Fase 2** (Auditoría) - Permite rastrear cambios
3. **Fase 1** (Soft-Delete) - Requiere más cambios de código

## Secciones Técnicas Detalladas

### Esquema de columnas para soft-delete

```sql
ALTER TABLE tab_sales_ledger 
  ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN deleted_by UUID DEFAULT NULL;

ALTER TABLE tab_purchase_ledger 
  ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN deleted_by UUID DEFAULT NULL;

ALTER TABLE tab_journal_entries 
  ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN deleted_by UUID DEFAULT NULL;
```

### Estructura de la página Bitácora

La página mostrará una tabla con paginación (50 registros por página) con los siguientes filtros:
- Selector de fechas con preset (Hoy, Última semana, Último mes)
- Dropdown de usuarios (solo los del tenant actual)
- Dropdown de acciones (Creación, Modificación, Eliminación)
- Dropdown de tablas afectadas
- Campo de búsqueda libre

El modal de detalles mostrará:
- Información completa del registro antes del cambio
- Información completa del registro después del cambio
- Diferencias resaltadas con colores (rojo = eliminado, verde = agregado)
