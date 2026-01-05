import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AVAILABLE_ROLES } from "@/hooks/useUserPermissions";
import { cn } from "@/lib/utils";

interface RoleSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

const ROLE_COLORS: Record<string, string> = {
  enterprise_admin: 'bg-primary text-primary-foreground',
  contador_senior: 'bg-blue-500 text-white',
  auxiliar_contable: 'bg-amber-500 text-white',
  cliente: 'bg-slate-500 text-white',
};

export function RoleSelector({ value, onChange, disabled, className }: RoleSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder="Seleccionar rol">
          {value && (
            <div className="flex items-center gap-2">
              <Badge className={cn("text-xs", ROLE_COLORS[value] || 'bg-muted')}>
                {AVAILABLE_ROLES.find(r => r.value === value)?.label || value}
              </Badge>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {AVAILABLE_ROLES.map((role) => (
          <SelectItem key={role.value} value={role.value}>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Badge className={cn("text-xs", ROLE_COLORS[role.value])}>
                  {role.label}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">{role.description}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RoleBadge({ role }: { role: string | null }) {
  if (!role) {
    return <Badge variant="outline" className="text-xs">Sin rol</Badge>;
  }

  const roleInfo = AVAILABLE_ROLES.find(r => r.value === role);
  
  return (
    <Badge className={cn("text-xs", ROLE_COLORS[role] || 'bg-muted')}>
      {roleInfo?.label || role}
    </Badge>
  );
}
