import { useState, useMemo, useEffect } from "react";
import { Check, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { getSafeErrorMessage } from "@/utils/errorMessages";

type Enterprise = Database['public']['Tables']['tab_enterprises']['Row'];

type SortField = "nit" | "business_name" | "tax_regime" | "active_period";
type SortDirection = "asc" | "desc";

interface EnterprisesTableProps {
  enterprises: Enterprise[];
  onEdit: (enterprise: Enterprise) => void;
  onDelete: () => void;
  onOpenWizard?: (enterprise: Enterprise) => void;
}

export const EnterprisesTable = ({ enterprises, onEdit, onDelete, onOpenWizard }: EnterprisesTableProps) => {
  const { toast } = useToast();
  const [sortField, setSortField] = useState<SortField>("business_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [activeEnterpriseId, setActiveEnterpriseId] = useState<number | null>(null);
  const [activePeriods, setActivePeriods] = useState<Record<number, string>>({});

  useEffect(() => {
    const storedId = localStorage.getItem("currentEnterpriseId");
    if (storedId) {
      setActiveEnterpriseId(parseInt(storedId));
    }
  }, []);

  useEffect(() => {
    const fetchActivePeriods = async () => {
      const enterpriseIds = enterprises.map(e => e.id);
      if (enterpriseIds.length === 0) return;

      const { data } = await supabase
        .from('tab_accounting_periods')
        .select('enterprise_id, year')
        .in('enterprise_id', enterpriseIds)
        .eq('is_default_period', true);

      if (data) {
        const periodsMap: Record<number, string> = {};
        data.forEach(p => {
          if (p.enterprise_id) {
            periodsMap[p.enterprise_id] = p.year.toString();
          }
        });
        setActivePeriods(periodsMap);
      }
    };

    fetchActivePeriods();
  }, [enterprises]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="h-4 w-4 ml-1" /> 
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const sortedEnterprises = useMemo(() => {
    return [...enterprises].sort((a, b) => {
      let valueA: string;
      let valueB: string;

      switch (sortField) {
        case "nit":
          valueA = a.nit;
          valueB = b.nit;
          break;
        case "business_name":
          valueA = a.business_name.toLowerCase();
          valueB = b.business_name.toLowerCase();
          break;
        case "tax_regime":
          valueA = a.tax_regime;
          valueB = b.tax_regime;
          break;
        case "active_period":
          valueA = activePeriods[a.id] || "";
          valueB = activePeriods[b.id] || "";
          break;
        default:
          return 0;
      }

      if (sortDirection === "asc") {
        return valueA.localeCompare(valueB);
      }
      return valueB.localeCompare(valueA);
    });
  }, [enterprises, sortField, sortDirection, activePeriods]);

  const handleSelect = async (enterprise: Enterprise) => {
    localStorage.setItem("currentEnterpriseId", enterprise.id.toString());
    setActiveEnterpriseId(enterprise.id);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('tab_users')
        .update({ 
          last_enterprise_id: enterprise.id,
          current_enterprise_name: enterprise.business_name 
        })
        .eq('id', user.id);
    }

    toast({
      title: "Empresa seleccionada",
      description: `${enterprise.business_name} está ahora activa`,
    });

    window.dispatchEvent(new CustomEvent('enterpriseChanged'));
  };

  const handleDeactivate = async (enterprise: Enterprise) => {
    try {
      // Soft-delete: marcar como inactivo
      const { error } = await supabase
        .from('tab_enterprises')
        .update({ is_active: false })
        .eq('id', enterprise.id);

      if (error) throw error;

      if (activeEnterpriseId === enterprise.id) {
        localStorage.removeItem("currentEnterpriseId");
        setActiveEnterpriseId(null);
      }

      toast({
        title: "Empresa desactivada",
        description: `${enterprise.business_name} ha sido desactivada`,
      });

      onDelete();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al desactivar",
        description: getSafeErrorMessage(error),
      });
    }
  };

  const handlePermanentDelete = async (enterprise: Enterprise) => {
    try {
      const { error } = await supabase
        .from('tab_enterprises')
        .delete()
        .eq('id', enterprise.id);

      if (error) throw error;

      if (activeEnterpriseId === enterprise.id) {
        localStorage.removeItem("currentEnterpriseId");
        setActiveEnterpriseId(null);
      }

      toast({
        title: "Empresa eliminada permanentemente",
        description: `${enterprise.business_name} ha sido eliminada`,
      });

      onDelete();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al eliminar",
        description: getSafeErrorMessage(error),
      });
    }
  };

  const handleReactivate = async (enterprise: Enterprise) => {
    try {
      const { error } = await supabase
        .from('tab_enterprises')
        .update({ is_active: true })
        .eq('id', enterprise.id);

      if (error) throw error;

      toast({
        title: "Empresa reactivada",
        description: `${enterprise.business_name} está activa nuevamente`,
      });

      onDelete(); // Refresh list
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al reactivar",
        description: getSafeErrorMessage(error),
      });
    }
  };

  const getRegimeLabel = (regime: string) => {
    switch (regime) {
      case "general": return "General";
      case "pequeño_contribuyente": return "Pequeño Contrib.";
      case "opcional_simplificado": return "Opcional Simpl.";
      default: return regime;
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead 
              className="cursor-pointer select-none"
              onClick={() => handleSort("nit")}
            >
              <div className="flex items-center">
                NIT
                {getSortIcon("nit")}
              </div>
            </TableHead>
            <TableHead 
              className="cursor-pointer select-none"
              onClick={() => handleSort("business_name")}
            >
              <div className="flex items-center">
                Nombre
                {getSortIcon("business_name")}
              </div>
            </TableHead>
            <TableHead 
              className="cursor-pointer select-none"
              onClick={() => handleSort("tax_regime")}
            >
              <div className="flex items-center">
                Régimen
                {getSortIcon("tax_regime")}
              </div>
            </TableHead>
            <TableHead 
              className="cursor-pointer select-none"
              onClick={() => handleSort("active_period")}
            >
              <div className="flex items-center">
                Periodo Activo
                {getSortIcon("active_period")}
              </div>
            </TableHead>
            <TableHead className="text-right w-[120px]">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEnterprises.map((enterprise) => {
            const isSelected = activeEnterpriseId === enterprise.id;
            const isInactive = !enterprise.is_active;
            return (
              <TableRow 
                key={enterprise.id}
                className={`${isSelected ? "bg-primary/10 border-l-primary" : ""} ${isInactive ? "opacity-60" : ""}`}
              >
                <TableCell className="font-mono">{enterprise.nit}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{enterprise.business_name}</span>
                    {isSelected && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                        Seleccionada
                      </span>
                    )}
                    {isInactive && (
                      <Badge variant="secondary" className="text-xs bg-destructive/10 text-destructive">
                        Inactiva
                      </Badge>
                    )}
                  </div>
                  {enterprise.trade_name && (
                    <span className="text-sm text-muted-foreground">{enterprise.trade_name}</span>
                  )}
                </TableCell>
                <TableCell>{getRegimeLabel(enterprise.tax_regime)}</TableCell>
                <TableCell>{activePeriods[enterprise.id] || "-"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* Botón Seleccionar */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isSelected ? "default" : "ghost"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleSelect(enterprise)}
                          disabled={isSelected || isInactive}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isSelected ? "Empresa seleccionada" : isInactive ? "Empresa inactiva" : "Seleccionar"}
                      </TooltipContent>
                    </Tooltip>

                    {/* Botón Editar */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onEdit(enterprise)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Editar</TooltipContent>
                    </Tooltip>

                    {/* Botón Configuración Wizard */}
                    {onOpenWizard && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onOpenWizard(enterprise)}
                          >
                            <Wand2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Asistente de configuración</TooltipContent>
                      </Tooltip>
                    )}

                    {/* Botón Reactivar (solo si está inactiva) */}
                    {isInactive && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600 hover:text-green-700"
                            onClick={() => handleReactivate(enterprise)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Reactivar empresa</TooltipContent>
                      </Tooltip>
                    )}

                    {/* Botón Desactivar/Eliminar */}
                    <AlertDialog>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent>{isInactive ? "Eliminar permanentemente" : "Desactivar"}</TooltipContent>
                      </Tooltip>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {isInactive ? "¿Eliminar empresa permanentemente?" : "¿Desactivar empresa?"}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {isInactive 
                              ? `Esta acción eliminará permanentemente "${enterprise.business_name}" y todos sus datos. Esta acción NO se puede deshacer.`
                              : `La empresa "${enterprise.business_name}" será marcada como inactiva. Podrás reactivarla después si lo necesitas.`
                            }
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => isInactive ? handlePermanentDelete(enterprise) : handleDeactivate(enterprise)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {isInactive ? "Eliminar permanentemente" : "Desactivar"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
