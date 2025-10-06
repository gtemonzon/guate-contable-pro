import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PeriodCard from "@/components/periodos/PeriodCard";
import PeriodDialog from "@/components/periodos/PeriodDialog";
import { getSafeErrorMessage } from "@/utils/errorMessages";

const PeriodosContables = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const { toast } = useToast();

  // Get current enterprise from localStorage
  const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");

  const { data: periods = [], isLoading, refetch } = useQuery({
    queryKey: ["accounting-periods", currentEnterpriseId],
    queryFn: async () => {
      if (!currentEnterpriseId) {
        throw new Error("No hay empresa seleccionada");
      }

      const { data, error } = await supabase
        .from("tab_accounting_periods")
        .select("*")
        .eq("enterprise_id", parseInt(currentEnterpriseId))
        .order("start_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentEnterpriseId,
  });

  const handleCreateNew = () => {
    setSelectedPeriod(null);
    setDialogOpen(true);
  };

  const handleEdit = (period: any) => {
    setSelectedPeriod(period);
    setDialogOpen(true);
  };

  const handleClosePeriod = async (periodId: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const { error } = await supabase
        .from("tab_accounting_periods")
        .update({
          status: "cerrado",
          closed_at: new Date().toISOString(),
          closed_by: user.id,
        })
        .eq("id", periodId);

      if (error) throw error;

      toast({
        title: "Período cerrado",
        description: "El período contable ha sido cerrado exitosamente",
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error al cerrar período",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleReopenPeriod = async (periodId: number) => {
    try {
      const { error } = await supabase
        .from("tab_accounting_periods")
        .update({
          status: "abierto",
          closed_at: null,
          closed_by: null,
        })
        .eq("id", periodId);

      if (error) throw error;

      toast({
        title: "Período reabierto",
        description: "El período contable ha sido reabierto para ajustes",
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error al reabrir período",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const filteredPeriods = periods.filter((period) =>
    period.year.toString().includes(searchQuery) ||
    period.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!currentEnterpriseId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-[400px]">
          <p className="text-muted-foreground">
            Por favor selecciona una empresa para ver los períodos contables
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Períodos Contables</h1>
          <p className="text-muted-foreground">
            Gestión de períodos contables anuales y mensuales
          </p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Período
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por año o estado..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-[400px]">
          <p className="text-muted-foreground">Cargando períodos...</p>
        </div>
      ) : filteredPeriods.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
          <p className="text-muted-foreground">
            {searchQuery ? "No se encontraron períodos con ese criterio" : "No hay períodos contables creados"}
          </p>
          {!searchQuery && (
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" />
              Crear Primer Período
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPeriods.map((period) => (
            <PeriodCard
              key={period.id}
              period={period}
              onEdit={() => handleEdit(period)}
              onClose={() => handleClosePeriod(period.id)}
              onReopen={() => handleReopenPeriod(period.id)}
            />
          ))}
        </div>
      )}

      <PeriodDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        period={selectedPeriod}
        onSuccess={() => {
          refetch();
          setDialogOpen(false);
        }}
      />
    </div>
  );
};

export default PeriodosContables;
