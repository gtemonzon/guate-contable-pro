import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Permission {
  name: string;
  category: string;
  administrador: boolean;
  contadorSenior: boolean;
  auxiliarContable: boolean | 'partial';
  cliente: boolean;
}

const permissions: Permission[] = [
  // Administración
  { name: "Gestionar Usuarios", category: "Administración", administrador: true, contadorSenior: false, auxiliarContable: false, cliente: false },
  { name: "Gestionar Empresas", category: "Administración", administrador: true, contadorSenior: false, auxiliarContable: false, cliente: false },
  { name: "Configuración del Sistema", category: "Administración", administrador: true, contadorSenior: false, auxiliarContable: false, cliente: false },
  
  // Catálogo de Cuentas
  { name: "Ver Catálogo de Cuentas", category: "Catálogo de Cuentas", administrador: true, contadorSenior: true, auxiliarContable: true, cliente: true },
  { name: "Editar Catálogo de Cuentas", category: "Catálogo de Cuentas", administrador: true, contadorSenior: true, auxiliarContable: false, cliente: false },
  
  // Partidas Contables
  { name: "Crear Partidas", category: "Partidas Contables", administrador: true, contadorSenior: true, auxiliarContable: 'partial', cliente: false },
  { name: "Aprobar Partidas", category: "Partidas Contables", administrador: true, contadorSenior: true, auxiliarContable: false, cliente: false },
  { name: "Contabilizar Partidas", category: "Partidas Contables", administrador: true, contadorSenior: true, auxiliarContable: false, cliente: false },
  
  // Compras y Ventas
  { name: "Importar Compras/Ventas", category: "Compras y Ventas", administrador: true, contadorSenior: true, auxiliarContable: true, cliente: false },
  { name: "Ver Compras/Ventas", category: "Compras y Ventas", administrador: true, contadorSenior: true, auxiliarContable: true, cliente: true },
  
  // Otras Operaciones
  { name: "Conciliación Bancaria", category: "Operaciones", administrador: true, contadorSenior: true, auxiliarContable: false, cliente: false },
  { name: "Formularios de Impuestos", category: "Operaciones", administrador: true, contadorSenior: true, auxiliarContable: false, cliente: false },
  { name: "Generar Declaraciones", category: "Operaciones", administrador: true, contadorSenior: true, auxiliarContable: false, cliente: false },
  
  // Reportes
  { name: "Ver Reportes", category: "Reportes", administrador: true, contadorSenior: true, auxiliarContable: true, cliente: true },
  { name: "Exportar Reportes", category: "Reportes", administrador: true, contadorSenior: true, auxiliarContable: true, cliente: true },
];

const PermissionIcon = ({ value }: { value: boolean | 'partial' }) => {
  if (value === 'partial') {
    return (
      <div className="flex items-center justify-center">
        <AlertCircle className="h-4 w-4 text-amber-500" />
      </div>
    );
  }
  
  return value ? (
    <div className="flex items-center justify-center">
      <Check className="h-4 w-4 text-green-500" />
    </div>
  ) : (
    <div className="flex items-center justify-center">
      <X className="h-4 w-4 text-muted-foreground/50" />
    </div>
  );
};

export function PermissionsMatrix() {
  // Agrupar permisos por categoría
  const groupedPermissions = permissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Matriz de Permisos</CardTitle>
        <CardDescription>
          Vista detallada de los permisos asignados a cada rol del sistema
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Leyenda */}
        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-sm">Permitido</span>
          </div>
          <div className="flex items-center gap-2">
            <X className="h-4 w-4 text-muted-foreground/50" />
            <span className="text-sm">No permitido</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm">Parcial (requiere aprobación)</span>
          </div>
        </div>

        {/* Roles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-3 rounded-lg border bg-primary/5 border-primary/20">
            <Badge variant="default" className="mb-2">Administrador</Badge>
            <p className="text-xs text-muted-foreground">Acceso total al sistema</p>
          </div>
          <div className="p-3 rounded-lg border bg-blue-500/5 border-blue-500/20">
            <Badge className="mb-2 bg-blue-500">Contador Senior</Badge>
            <p className="text-xs text-muted-foreground">Contabilizar, aprobar partidas, generar declaraciones</p>
          </div>
          <div className="p-3 rounded-lg border bg-amber-500/5 border-amber-500/20">
            <Badge className="mb-2 bg-amber-500">Auxiliar Contable</Badge>
            <p className="text-xs text-muted-foreground">Crear partidas en borrador, importar datos</p>
          </div>
          <div className="p-3 rounded-lg border bg-slate-500/5 border-slate-500/20">
            <Badge variant="secondary" className="mb-2">Cliente</Badge>
            <p className="text-xs text-muted-foreground">Solo lectura de reportes</p>
          </div>
        </div>

        {/* Tabla de permisos */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[250px]">Permiso</TableHead>
                <TableHead className="text-center w-[120px]">
                  <Badge variant="default" className="font-normal">Admin</Badge>
                </TableHead>
                <TableHead className="text-center w-[120px]">
                  <Badge className="bg-blue-500 font-normal">Contador</Badge>
                </TableHead>
                <TableHead className="text-center w-[120px]">
                  <Badge className="bg-amber-500 font-normal">Auxiliar</Badge>
                </TableHead>
                <TableHead className="text-center w-[120px]">
                  <Badge variant="secondary" className="font-normal">Cliente</Badge>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(groupedPermissions).map(([category, perms]) => (
                <>
                  <TableRow key={category} className="bg-muted/30">
                    <TableCell colSpan={5} className="font-semibold text-sm py-2">
                      {category}
                    </TableCell>
                  </TableRow>
                  {perms.map((permission, idx) => (
                    <TableRow 
                      key={`${category}-${idx}`}
                      className={cn(idx % 2 === 0 ? "bg-background" : "bg-muted/10")}
                    >
                      <TableCell className="text-sm pl-6">{permission.name}</TableCell>
                      <TableCell className="text-center">
                        <PermissionIcon value={permission.administrador} />
                      </TableCell>
                      <TableCell className="text-center">
                        <PermissionIcon value={permission.contadorSenior} />
                      </TableCell>
                      <TableCell className="text-center">
                        <PermissionIcon value={permission.auxiliarContable} />
                      </TableCell>
                      <TableCell className="text-center">
                        <PermissionIcon value={permission.cliente} />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Notas */}
        <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <h4 className="font-medium text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-4 w-4" />
            Nota sobre Auxiliar Contable
          </h4>
          <p className="text-sm text-muted-foreground mt-2">
            Las partidas creadas por un Auxiliar Contable quedan automáticamente en estado 
            <Badge variant="outline" className="mx-1 text-xs">Pendiente de Revisión</Badge>
            y deben ser aprobadas por un Contador Senior o Administrador antes de poder contabilizarse.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
