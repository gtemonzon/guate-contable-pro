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