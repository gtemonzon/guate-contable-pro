import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, CheckCircle2, Calendar, Lock, LockOpen, PlayCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import PeriodDialog from "@/components/periodos/PeriodDialog";
import { PeriodClosingWizard } from "@/components/periodos/PeriodClosingWizard";
import { getSafeErrorMessage } from "@/utils/errorMessages";

interface EnterprisePeriodsProps {
  enterpriseId: number;
}

export function EnterprisePeriods({ enterpriseId }: EnterprisePeriodsProps) {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<any[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [closingWizardPeriod, setClosingWizardPeriod] = useState<any>(null);

  useEffect(() => {
    fetchPeriods();
    loadActivePeriod();
  }, [enterpriseId]);

  const fetchPeriods = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tab_accounting_periods")
        .select("*")
        .eq("enterprise_id", enterpriseId)
        .order("start_date", { ascending: false });

      if (error) throw error;
      setPeriods(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al cargar períodos",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const loadActivePeriod = () => {
    const saved = localStorage.getItem(`currentPeriodId_${enterpriseId}`);
    if (saved) setActivePeriodId(parseInt(saved));
  };

  const handleSetActivePeriod = async (periodId: number, period: any) => {
    if (period.status !== "abierto") {
      toast({
        variant: "destructive",
        title: "Período cerrado",
        description: "No puedes activar un período que está cerrado",
      });
      return;
    }

    localStorage.setItem(`currentPeriodId_${enterpriseId}`, periodId.toString());
    setActivePeriodId(periodId);

    // Disparar evento para actualizar EnterpriseCard
    window.dispatchEvent(
      new CustomEvent("periodChanged", {
        detail: { enterpriseId, periodId },
      })
    );

    toast({
      title: "Período activado",
      description: `Período ${period.year} es ahora el activo para esta empresa`,
    });
  };

  const handleEdit = (period: any) => {
    setSelectedPeriod(period);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedPeriod(null);
    setDialogOpen(true);
  };

  const handleClosePeriod = async (periodId: number, period: any) => {
    try {
      const { error } = await supabase
        .from("tab_accounting_periods")
        .update({
          status: "cerrado",
          closed_at: new Date().toISOString(),
          closed_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq("id", periodId);

      if (error) throw error;

      toast({
        title: "Período cerrado",
        description: `El período ${period.year} ha sido cerrado exitosamente`,
      });

      // Si era el período activo, desactivarlo
      if (activePeriodId === periodId) {
        localStorage.removeItem(`currentPeriodId_${enterpriseId}`);
        setActivePeriodId(null);
        window.dispatchEvent(
          new CustomEvent("periodChanged", {
            detail: { enterpriseId, periodId: null },
          })
        );
      }

      fetchPeriods();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al cerrar período",
        description: getSafeErrorMessage(error),
      });
    }
  };

  const handleReopenPeriod = async (periodId: number, period: any) => {
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
        description: `El período ${period.year} ha sido reabierto exitosamente`,
      });

      fetchPeriods();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al reabrir período",
        description: getSafeErrorMessage(error),
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Períodos Contables</h3>
          <p className="text-sm text-muted-foreground">
            Gestiona los períodos contables de esta empresa
          </p>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Período
        </Button>
      </div>

      {periods.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No hay períodos contables</p>
            <p className="text-sm text-muted-foreground mb-4">
              Crea el primer período contable para esta empresa
            </p>
            <Button onClick={handleCreate} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Crear Primer Período
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {periods.map((period) => (
            <Card
              key={period.id}
              className={
                activePeriodId === period.id
                  ? "ring-2 ring-primary shadow-md"
                  : ""
              }
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">Año {period.year}</p>
                      <Badge
                        variant={
                          period.status === "abierto" ? "default" : "secondary"
                        }
                      >
                        {period.status === "abierto" ? (
                          <LockOpen className="h-3 w-3 mr-1" />
                        ) : (
                          <Lock className="h-3 w-3 mr-1" />
                        )}
                        {period.status}
                      </Badge>
                      {activePeriodId === period.id && (
                        <Badge variant="outline" className="bg-primary/10">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Activo
                        </Badge>
                      )}
                    </div>
                <p className="text-sm text-muted-foreground">
                  {format(parseISO(period.start_date), "dd 'de' MMMM yyyy", {
                    locale: es,
                  })}{" "}
                  -{" "}
                  {format(parseISO(period.end_date), "dd 'de' MMMM yyyy", {
                    locale: es,
                  })}
                </p>
                    {period.notes && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {period.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {activePeriodId === period.id ? (
                      <Button size="sm" variant="outline" disabled>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetActivePeriod(period.id, period)}
                        disabled={period.status !== "abierto"}
                        title={
                          period.status !== "abierto"
                            ? "Solo puedes activar períodos abiertos"
                            : "Activar este período"
                        }
                      >
                        Activar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(period)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {period.status === "abierto" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setClosingWizardPeriod(period)}
                        title="Iniciar asistente de cierre"
                      >
                        <PlayCircle className="h-4 w-4 mr-1" />
                        Cerrar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReopenPeriod(period.id, period)}
                      >
                        <LockOpen className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PeriodDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        period={selectedPeriod}
        onSuccess={() => {
          fetchPeriods();
          setDialogOpen(false);
          setSelectedPeriod(null);
        }}
      />

      <PeriodClosingWizard
        open={!!closingWizardPeriod}
        period={closingWizardPeriod}
        enterpriseId={enterpriseId}
        onOpenChange={(open) => {
          if (!open) setClosingWizardPeriod(null);
        }}
        onSuccess={() => {
          fetchPeriods();
          setClosingWizardPeriod(null);
        }}
      />
    </div>
  );
}
