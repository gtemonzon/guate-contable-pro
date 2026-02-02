import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Check, X, AlertCircle, RotateCcw, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  useRolePermissions, 
  PERMISSION_DEFINITIONS, 
  AVAILABLE_ROLES_CONFIG 
} from "@/hooks/useRolePermissions";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function PermissionsMatrix() {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(null);
  const userPerms = useUserPermissions();
  const canEdit = userPerms.isSuperAdmin || userPerms.canManageUsers;

  useEffect(() => {
    const storedId = localStorage.getItem("currentEnterpriseId");
    if (storedId) {
      setEnterpriseId(parseInt(storedId));
    }
  }, []);

  const { 
    isLoading, 
    isSaving,
    updatePermission, 
    getPermissionValue,
    resetToDefaults 
  } = useRolePermissions(enterpriseId);

  // Agrupar permisos por categoría
  const groupedPermissions = PERMISSION_DEFINITIONS.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, typeof PERMISSION_DEFINITIONS>);

  const handleToggle = async (roleName: string, permissionKey: string) => {
    if (!canEdit) return;
    const currentValue = getPermissionValue(roleName, permissionKey);
    await updatePermission(roleName, permissionKey, !currentValue);
  };

  if (!enterpriseId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            Seleccione una empresa para configurar los permisos
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Matriz de Permisos
              {!canEdit && <Lock className="h-4 w-4 text-muted-foreground" />}
            </CardTitle>
            <CardDescription>
              {canEdit 
                ? "Configure los permisos de cada rol para esta empresa" 
                : "Vista de permisos asignados a cada rol (solo lectura)"
              }
            </CardDescription>
          </div>
          {canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isSaving}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restaurar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Restaurar permisos por defecto?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esto eliminará todas las personalizaciones y restaurará los permisos 
                    a sus valores originales. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={resetToDefaults}>
                    Restaurar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Leyenda */}
        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="h-5 w-9 rounded-full bg-primary" />
            <span className="text-sm">Permitido</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-5 w-9 rounded-full bg-muted border" />
            <span className="text-sm">No permitido</span>
          </div>
          {isSaving && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Guardando...</span>
            </div>
          )}
        </div>

        {/* Roles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {AVAILABLE_ROLES_CONFIG.map((role) => (
            <div 
              key={role.value}
              className={cn(
                "p-3 rounded-lg border",
                role.value === 'enterprise_admin' && "bg-primary/5 border-primary/20",
                role.value === 'contador_senior' && "bg-blue-500/5 border-blue-500/20",
                role.value === 'auxiliar_contable' && "bg-amber-500/5 border-amber-500/20",
                role.value === 'cliente' && "bg-slate-500/5 border-slate-500/20"
              )}
            >
              <Badge className={cn("mb-2", role.color)}>{role.label}</Badge>
              <p className="text-xs text-muted-foreground">
                {role.value === 'enterprise_admin' && "Acceso total a la empresa"}
                {role.value === 'contador_senior' && "Contabilizar, aprobar partidas, generar declaraciones"}
                {role.value === 'auxiliar_contable' && "Crear partidas en borrador, importar datos"}
                {role.value === 'cliente' && "Solo lectura de reportes"}
              </p>
            </div>
          ))}
        </div>

        {/* Tabla de permisos */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[250px] bg-muted/50">Permiso</TableHead>
                  {AVAILABLE_ROLES_CONFIG.map((role) => (
                    <TableHead key={role.value} className="text-center w-[120px] bg-muted/50">
                      <Badge className={cn("font-normal", role.color)}>
                        {role.label.split(' ')[0]}
                      </Badge>
                    </TableHead>
                  ))}
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
                        key={`${category}-${permission.key}`}
                        className={cn(idx % 2 === 0 ? "bg-background" : "bg-muted/10")}
                      >
                        <TableCell className="text-sm pl-6">
                          <div>
                            <span>{permission.name}</span>
                            {permission.description && (
                              <p className="text-xs text-muted-foreground">
                                {permission.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        {AVAILABLE_ROLES_CONFIG.map((role) => (
                          <TableCell key={role.value} className="text-center">
                            <div className="flex justify-center">
                              <Switch
                                checked={getPermissionValue(role.value, permission.key)}
                                onCheckedChange={() => handleToggle(role.value, permission.key)}
                                disabled={!canEdit || isSaving}
                                className="data-[state=checked]:bg-primary"
                              />
                            </div>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Nota informativa */}
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

        {!canEdit && (
          <div className="mt-4 p-4 bg-muted/50 border rounded-lg">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Solo los administradores pueden modificar los permisos de roles.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
