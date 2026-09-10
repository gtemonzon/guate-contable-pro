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

### Purga de `tab_audit_log` — automatizada con pg_cron (retención de 36 meses)

`tab_audit_log` es el log de auditoría convencional (mutable, sin hash encadenado) que registra cambios en `tab_enterprises`, `tab_accounts`, `tab_accounting_periods`, `tab_journal_entries`, `tab_users` y `tab_user_enterprises`. Deliberadamente NO audita `tab_purchase_ledger` ni `tab_sales_ledger` (alto volumen, sin valor de auditoría real — esos libros ya tienen su propio rastro vía las partidas contables y `tab_journal_entry_history`).

Retiene **36 meses** (3 ejercicios fiscales completos) — subido desde 12 meses una vez que `tab_audit_log` quedó en ~110 MB / ~84,000 filas tras la optimización de auditoría y dejó de recibir los eventos de alto volumen de los libros fiscales.

La purga corre **automáticamente vía pg_cron**, ya no requiere ejecución manual:

* Extensión `pg_cron` habilitada en este proyecto (versión 1.6.4, esquema `cron`).
* Job `purge-audit-log-monthly`, corre el día 1 de cada mes a las 3:00 am (hora del servidor): `0 3 1 * *`.
* Llama a `public.run_audit_log_purge()`, que invoca `public.purge_old_audit_log(50000)` en bucle (hasta 50 iteraciones de seguridad) hasta drenar todo lo purgable en esa corrida — así un backlog mayor a 50,000 filas no se queda a medias con una sola ejecución mensual de un solo lote.
* `public.purge_old_audit_log(p_batch_size integer DEFAULT 50000)` sigue disponible para ejecución manual puntual si hace falta (por lotes de `ctid`, retorna `deleted_count` y `remaining_older_than_36mo`):

```sql
SELECT * FROM public.purge_old_audit_log();
-- o para drenar todo lo pendiente de una vez, igual que hace el cron:
SELECT public.run_audit_log_purge();
```

Para revisar que el job esté corriendo bien (columnas reales de `cron.job_run_details` en esta versión: no tiene `jobname`, solo `jobid` — hay que unir contra `cron.job`):

```sql
SELECT jrd.* FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
WHERE j.jobname = 'purge-audit-log-monthly'
ORDER BY jrd.start_time DESC LIMIT 10;
```

Después de una purga grande (backlog acumulado, no la operación mensual normal con volumen bajo), ejecutar `VACUUM FULL tab_audit_log;` para devolver el espacio en disco al sistema operativo (un `DELETE` normal no lo hace) — el cron mensual no lo hace automáticamente.

**Qué se pierde al purgar y qué NO:** al purgar filas de `tab_audit_log` de más de 36 meses se vacía la pestaña "Auditoría" del detalle de partida para esos registros (`EntityAuditLog` con `entityType="tab_journal_entries"`, lee de `tab_audit_log`). NO se pierde la autoría básica (`created_by`/`updated_by`, mostrados en la pestaña "Detalle" y almacenados en la partida misma) ni el historial completo de cambios de partidas (`tab_journal_entry_history`, que nunca se purga y no tiene límite de retención).
