import { useTenant } from "@/contexts/TenantContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

export function TenantSelector() {
  const { currentTenant, allTenants, isSuperAdmin, switchTenant } = useTenant();

  if (!isSuperAdmin || allTenants.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select
        value={currentTenant?.id?.toString() || ""}
        onValueChange={(value) => switchTenant(parseInt(value))}
      >
        <SelectTrigger className="w-[200px] h-8 text-sm">
          <SelectValue placeholder="Seleccionar Tenant" />
        </SelectTrigger>
        <SelectContent>
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
        </SelectContent>
      </Select>
    </div>
  );
}
