En src/components/tenants/TenantSelector.tsx, el <Select> muestra TODOS los tenants (allTenants) sin filtrar por is_active — por eso aparecen tenants inactivos (ej. "Oficina Contable - Ejemplo -") en el selector, visible solo para super-admin.

Cambiar para que la lista de opciones excluya tenants inactivos, PERO sin romper el caso donde el tenant actualmente seleccionado (currentTenant) sea inactivo (por ejemplo, si el superadmin lo desactivó mientras lo tenía seleccionado) — en ese caso debe seguir viéndose como seleccionado en el trigger, aunque no aparezca como opción alternativa para volver a elegirlo desde cero.

Reemplazar:

  {allTenants.map((tenant) => (
    <SelectItem key={tenant.id} value={tenant.id.toString()}>
      <div className="flex items-center gap-2">
        <span 
          className="w-2 h-2 rounded-full" 
          style={{ backgroundColor: tenant.primary_color }}
        />
        {tenant.tenant_name}
      </div>
    </SelectItem>
  ))}

Por:

  {allTenants
    .filter((tenant) => tenant.is_active || tenant.id === currentTenant?.id)
    .map((tenant) => (
      <SelectItem key={tenant.id} value={tenant.id.toString()}>
        <div className="flex items-center gap-2">
          <span 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: tenant.primary_color }}
          />
          {tenant.tenant_name}
          {!tenant.is_active && (
            <span className="text-xs text-muted-foreground">(Inactivo)</span>
          )}
        </div>
      </SelectItem>
    ))}

No toques TenantContext.tsx ni ningún otro archivo — el fetch ya trae is_active en la data, solo falta filtrar en el render de este componente.

## Mantenimiento de Base de Datos

### Purga de `tab_audit_log` — ejecución manual requerida (sin pg_cron)

`tab_audit_log` es el log de auditoría convencional (mutable, sin hash encadenado) que registra cambios en `tab_enterprises`, `tab_accounts`, `tab_accounting_periods`, `tab_journal_entries`, `tab_users` y `tab_user_enterprises`. Deliberadamente NO audita `tab_purchase_ledger` ni `tab_sales_ledger` (alto volumen, sin valor de auditoría real — esos libros ya tienen su propio rastro vía las partidas contables y `tab_journal_entry_history`).

Para evitar que vuelva a crecer sin control, existe la función `public.purge_old_audit_log(p_batch_size integer DEFAULT 50000)`, que borra en un solo lote las filas de `tab_audit_log` con más de 12 meses de antigüedad y devuelve cuántas borró y cuántas quedan pendientes:

```sql
SELECT * FROM public.purge_old_audit_log();
```

**Esta extensión de Postgres `pg_cron` NO está instalada en este proyecto de Supabase** (verificado con `SELECT * FROM pg_extension WHERE extname = 'pg_cron'` — sin resultados), así que esta función NO está programada automáticamente. Debe ejecutarse manualmente cada cierto tiempo (sugerido: una vez al mes) llamando a la función repetidamente hasta que `remaining_older_than_12mo` sea `0`:

```sql
-- Repetir hasta que remaining_older_than_12mo = 0
SELECT * FROM public.purge_old_audit_log();
```

Después de una purga grande, ejecutar `VACUUM FULL tab_audit_log;` para devolver el espacio en disco al sistema operativo (un `DELETE` normal no lo hace).

Si en algún momento se habilita `pg_cron` en este proyecto, se puede programar con:
```sql
SELECT cron.schedule('purge-audit-log-monthly', '0 3 1 * *', $$SELECT public.purge_old_audit_log()$$);
```
