import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Edit, Mail, Phone, MapPin, CheckCircle2, Trash2, FileText, Calendar } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getSafeErrorMessage } from "@/utils/errorMessages";

type Enterprise = Database['public']['Tables']['tab_enterprises']['Row'];

interface EnterpriseCardProps {
  enterprise: Enterprise;
  onEdit: (enterprise: Enterprise) => void;
  onDelete?: () => void;
}

const TAX_REGIME_LABELS: Record<string, string> = {
  pequeño_contribuyente: "Pequeño Contribuyente",
  contribuyente_general: "Contribuyente General",
  profesional_liberal: "Profesional Liberal",
  exenta_ong: "Exenta ONG",
};

export function EnterpriseCard({ enterprise, onEdit, onDelete }: EnterpriseCardProps) {
  const { toast } = useToast();
  const [isSelected, setIsSelected] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [documentsCount, setDocumentsCount] = useState(0);
  const [activePeriod, setActivePeriod] = useState<any>(null);

  useEffect(() => {
    const checkSelection = () => {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setIsSelected(currentEnterpriseId === enterprise.id.toString());
    };

    // Check on mount
    checkSelection();

    // Listen for enterprise selection changes
    const handleEnterpriseChange = () => {
      checkSelection();
    };

    // Listen for period changes
    const handlePeriodChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.enterpriseId === enterprise.id) {
        fetchActivePeriod();
      }
    };

    // Listen for document changes
    const handleDocumentsChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.enterpriseId === enterprise.id) {
        fetchDocumentsCount();
      }
    };

    window.addEventListener("storage", handleEnterpriseChange);
    window.addEventListener("enterpriseChanged", handleEnterpriseChange);
    window.addEventListener("periodChanged", handlePeriodChange);
    window.addEventListener("documentsChanged", handleDocumentsChange);

    return () => {
      window.removeEventListener("storage", handleEnterpriseChange);
      window.removeEventListener("enterpriseChanged", handleEnterpriseChange);
      window.removeEventListener("periodChanged", handlePeriodChange);
      window.removeEventListener("documentsChanged", handleDocumentsChange);
    };
  }, [enterprise.id]);

  const fetchDocumentsCount = async () => {
    try {
      const { count, error } = await supabase
        .from('tab_enterprise_documents')
        .select('*', { count: 'exact', head: true })
        .eq('enterprise_id', enterprise.id)
        .eq('is_active', true);

      if (error) throw error;
      setDocumentsCount(count || 0);
    } catch (error) {
      console.error('Error fetching documents count:', error);
    }
  };

  useEffect(() => {
    fetchDocumentsCount();
  }, [enterprise.id]);

  const fetchActivePeriod = async () => {
    try {
      const savedPeriodId = localStorage.getItem(`currentPeriodId_${enterprise.id}`);
      
      let query = supabase
        .from('tab_accounting_periods')
        .select('*')
        .eq('enterprise_id', enterprise.id)
        .eq('status', 'abierto')
        .order('start_date', { ascending: false })
        .limit(1);
      
      if (savedPeriodId) {
        query = query.eq('id', parseInt(savedPeriodId));
      }
      
      const { data } = await query.maybeSingle();
      
      if (data) {
        setActivePeriod(data);
        if (!savedPeriodId) {
          localStorage.setItem(`currentPeriodId_${enterprise.id}`, data.id.toString());
        }
      } else {
        setActivePeriod(null);
      }
    } catch (error) {
      console.error('Error fetching active period:', error);
    }
  };

  useEffect(() => {
    fetchActivePeriod();
  }, [enterprise.id]);

  const handleSelectEnterprise = async () => {
    localStorage.setItem("currentEnterpriseId", enterprise.id.toString());
    setIsSelected(true);
    
    // Guardar última empresa seleccionada en la base de datos
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('tab_users')
        .update({ last_enterprise_id: enterprise.id })
        .eq('id', user.id);
    }
    
    // Cargar período activo de la empresa (si existe)
    const savedPeriodId = localStorage.getItem(`currentPeriodId_${enterprise.id}`);
    
    if (!savedPeriodId) {
      // Buscar período abierto más reciente
      const { data } = await supabase
        .from('tab_accounting_periods')
        .select('*')
        .eq('enterprise_id', enterprise.id)
        .eq('status', 'abierto')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        localStorage.setItem(`currentPeriodId_${enterprise.id}`, data.id.toString());
        setActivePeriod(data);
        toast({
          title: "Empresa y período seleccionados",
          description: `${enterprise.business_name} con período ${data.year}`,
        });
      } else {
        toast({
          title: "Empresa seleccionada",
          description: `${enterprise.business_name} - No hay períodos abiertos`,
        });
      }
    } else {
      toast({
        title: "Empresa seleccionada",
        description: `${enterprise.business_name} está ahora activa`,
      });
    }
    
    // Trigger events for other components to react
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("enterpriseChanged", {
      detail: { enterpriseId: enterprise.id }
    }));
  };

  const handleDeleteEnterprise = async () => {
    try {
      const { error } = await supabase
        .from("tab_enterprises")
        .delete()
        .eq("id", enterprise.id);

      if (error) throw error;

      // If the deleted enterprise was selected, clear the selection
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      if (currentEnterpriseId === enterprise.id.toString()) {
        localStorage.removeItem("currentEnterpriseId");
        window.dispatchEvent(new Event("storage"));
      }

      toast({
        title: "Empresa eliminada",
        description: `${enterprise.business_name} ha sido eliminada exitosamente`,
      });

      onDelete?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al eliminar",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setShowDeleteDialog(false);
    }
  };

  return (
    <Card className={`hover:shadow-lg transition-shadow ${isSelected ? "ring-2 ring-primary" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{enterprise.business_name}</CardTitle>
              {enterprise.trade_name && (
                <p className="text-sm text-muted-foreground">{enterprise.trade_name}</p>
              )}
            </div>
          </div>
          {(documentsCount > 0 || activePeriod) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col gap-1 cursor-default">
                    {documentsCount > 0 && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {documentsCount}
                      </Badge>
                    )}
                    {activePeriod && (
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="h-3 w-3 mr-1" />
                        {activePeriod.year}
                      </Badge>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <div className="text-sm">
                    {documentsCount > 0 && <p>Documentos Cargados: {documentsCount}</p>}
                    {activePeriod && <p>Año Activo: {activePeriod.year}</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">NIT:</span>
            <span className="font-medium">{enterprise.nit}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Régimen:</span>
            <Badge variant="secondary" className="text-xs">
              {TAX_REGIME_LABELS[enterprise.tax_regime]}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Moneda:</span>
            <span className="font-medium">{enterprise.base_currency_code}</span>
          </div>
        </div>

        {(enterprise.email || enterprise.phone || enterprise.address) && (
          <div className="space-y-2 pt-2 border-t">
            {enterprise.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground truncate">{enterprise.email}</span>
              </div>
            )}
            {enterprise.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{enterprise.phone}</span>
              </div>
            )}
            {enterprise.address && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground truncate">{enterprise.address}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {!isSelected ? (
            <Button 
              className="flex-1"
              onClick={handleSelectEnterprise}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Seleccionar
            </Button>
          ) : (
            <Button 
              variant="outline" 
              className="flex-1"
              disabled
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Empresa Seleccionada
            </Button>
          )}
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => onEdit(enterprise)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-center">
          <Badge variant={enterprise.is_active ? "default" : "secondary"}>
            {enterprise.is_active ? "Activa" : "Inactiva"}
          </Badge>
        </div>
      </CardContent>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la empresa{" "}
              <strong>{enterprise.business_name}</strong> y todos sus datos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEnterprise}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
