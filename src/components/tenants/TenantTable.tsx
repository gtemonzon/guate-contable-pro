import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import type { Tenant } from "@/pages/Tenants";

interface Props {
  tenants: Tenant[];
  onEdit: (tenant: Tenant) => void;
}

const TenantTable = ({ tenants, onEdit }: Props) => {
  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead className="text-center">Empresas</TableHead>
            <TableHead className="text-center">Usuarios</TableHead>
            <TableHead>Email de contacto</TableHead>
            <TableHead className="text-center">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => (
            <TableRow
              key={tenant.id}
              onClick={() => onEdit(tenant)}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <TableCell>
                {tenant.logo_url ? (
                  <img
                    src={tenant.logo_url}
                    alt={tenant.tenant_name}
                    className="h-10 w-10 rounded-lg object-contain"
                  />
                ) : (
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: tenant.primary_color }}
                  >
                    <Building2 className="h-5 w-5 text-white" />
                  </div>
                )}
              </TableCell>
              <TableCell>
                <div className="font-medium">{tenant.tenant_name}</div>
                <div className="text-xs text-muted-foreground">{tenant.tenant_code}</div>
              </TableCell>
              <TableCell className="text-center">{tenant.enterprise_count ?? 0}</TableCell>
              <TableCell className="text-center">{tenant.user_count ?? 0}</TableCell>
              <TableCell className="text-muted-foreground">
                {tenant.contact_email || "—"}
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="secondary" className="gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      tenant.is_active ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  {tenant.is_active ? "Activo" : "Inactivo"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default TenantTable;