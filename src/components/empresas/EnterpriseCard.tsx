import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Edit, Mail, Phone, MapPin, Pin, Trash2, FileText, Calendar, Receipt, ClipboardList, Wand2, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useEnterpriseBackup } from "@/hooks/useEnterpriseBackup";
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
  onOpenWizard?: (enterprise: Enterprise) => void;
}

interface LastTaxFormInfo {
  tax_type: string | null;
  period_month: number | null;
  period_year: number | null;
  created_at: string | null;
  uploaded_by_name: string | null;
}

const TAX_REGIME_LABELS: Record<string, string> = {
  pequeño_contribuyente: "Pequeño Contribuyente",
  contribuyente_general: "Contribuyente General",
  profesional_liberal: "Profesional Liberal",
  exenta_ong: "Exenta ONG",
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export function EnterpriseCard({ enterprise, onEdit, onDelete, onOpenWizard }: EnterpriseCardProps) {
  const { toast } = useToast();
  const { exportEnterpriseData, isExporting } = useEnterpriseBackup();
  const [isSelected, setIsSelected] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [documentsCount, setDocumentsCount] = useState(0);
  const [activePeriod, setActivePeriod] = useState<any>(null);
  const [activeTaxes, setActiveTaxes] = useState<string[]>([]);
  const [lastTaxForm, setLastTaxForm] = useState<LastTaxFormInfo | null>(null);

  useEffect(() => {
    const checkSelection = () => {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setIsSelected(currentEnterpriseId === enterprise.id.toString());
    };

    checkSelection();

    const handleEnterpriseChange = () => {
      checkSelection();
    };

    const handlePeriodChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.enterpriseId === enterprise.id) {
        fetchActivePeriod();
      }
    };

    const handleDocumentsChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.enterpriseId === enterprise.id) {
        fetchDocumentsCount();
      }
    };

    const handleTaxesChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.enterpriseId === enterprise.id) {
        fetchActiveTaxes();
      }
    };

    const handleTaxFormsChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.enterpriseId === enterprise.id) {
        fetchLastTaxForm();
      }
    };

    window.addEventListener("storage", handleEnterpriseChange);
    window.addEventListener("enterpriseChanged", handleEnterpriseChange);
    window.addEventListener("periodChanged", handlePeriodChange);
    window.addEventListener("documentsChanged", handleDocumentsChange);
    window.addEventListener("taxesChanged", handleTaxesChange);
    window.addEventListener("taxFormsChanged", handleTaxFormsChange);

    return () => {
      window.removeEventListener("storage", handleEnterpriseChange);
      window.removeEventListener("enterpriseChanged", handleEnterpriseChange);
      window.removeEventListener("periodChanged", handlePeriodChange);
      window.removeEventListener("documentsChanged", handleDocumentsChange);
      window.removeEventListener("taxesChanged", handleTaxesChange);
      window.removeEventListener("taxFormsChanged", handleTaxFormsChange);
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

  const fetchActiveTaxes = async () => {
    try {
      const { data, error } = await supabase
        .from('tab_tax_due_date_config')
        .select('tax_label')
        .eq('enterprise_id', enterprise.id)
        .eq('is_active', true);

      if (error) throw error;
      setActiveTaxes(data?.map(t => t.tax_label) || []);
    } catch (error) {
      console.error('Error fetching active taxes:', error);
    }
  };

  const fetchLastTaxForm = async () => {
    try {
      const { data: taxForm, error } = await supabase
        .from('tab_tax_forms')
        .select('tax_type, period_month, period_year, created_at, created_by')
        .eq('enterprise_id', enterprise.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (taxForm) {
        let uploadedByName = "Usuario desconocido";
        if (taxForm.created_by) {
          const { data: userData } = await supabase
            .from('tab_users')
            .select('full_name')
            .eq('id', taxForm.created_by)
            .maybeSingle();
          
          if (userData?.full_name) {
            uploadedByName = userData.full_name;
          }
        }

        setLastTaxForm({
          tax_type: taxForm.tax_type,
          period_month: taxForm.period_month,
          period_year: taxForm.period_year,
          created_at: taxForm.created_at,
          uploaded_by_name: uploadedByName,
        });
      } else {
        setLastTaxForm(null);
      }
    } catch (error) {
      console.error('Error fetching last tax form:', error);
    }
  };

  useEffect(() => {
    fetchDocumentsCount();
    fetchActiveTaxes();
    fetchLastTaxForm();
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
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('tab_users')
        .update({ last_enterprise_id: enterprise.id })
        .eq('id', user.id);
    }
    
    const savedPeriodId = localStorage.getItem(`currentPeriodId_${enterprise.id}`);
    
    if (!savedPeriodId) {
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
    
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("enterpriseChanged", {
      detail: { enterpriseId: enterprise.id }
    }));
  };

  const handleDeleteEnterprise = async () => {
    try {
      // Soft-delete: marcar como inactivo en lugar de eliminar
      const { error } = await supabase
        .from("tab_enterprises")
        .update({ is_active: false })
        .eq("id", enterprise.id);

      if (error) throw error;

      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      if (currentEnterpriseId === enterprise.id.toString()) {
        localStorage.removeItem("currentEnterpriseId");
        window.dispatchEvent(new Event("storage"));
      }

      toast({
        title: "Empresa desactivada",
        description: `${enterprise.business_name} ha sido desactivada exitosamente`,
      });

      onDelete?.();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al desactivar",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setShowDeleteDialog(false);
    }
  };

  const formatLastTaxFormDate = (dateString: string | null) => {
    if (!dateString) return "";
    try {
      return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: es });
    } catch {
      return "";
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
          {activeTaxes.length > 0 && (
            <div className="flex items-start gap-2 text-sm pt-2">
              <Receipt className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {activeTaxes.slice(0, 3).map((tax) => (
                  <Badge key={tax} variant="outline" className="text-xs">
                    {tax.replace(' Mensual', '').replace(' Trimestral', '').replace(' Anual', '')}
                  </Badge>
                ))}
                {activeTaxes.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{activeTaxes.length - 3}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        {lastTaxForm && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 text-sm pt-2 border-t cursor-default">
                  <ClipboardList className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Último formulario:</span>
                  <Badge variant="outline" className="text-xs">
                    {lastTaxForm.tax_type || 'N/A'}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="text-sm space-y-1">
                  <p><strong>Impuesto:</strong> {lastTaxForm.tax_type || 'N/A'}</p>
                  <p><strong>Período:</strong> {lastTaxForm.period_month ? MONTH_NAMES[lastTaxForm.period_month - 1] : 'N/A'} {lastTaxForm.period_year || ''}</p>
                  <p><strong>Subido:</strong> {formatLastTaxFormDate(lastTaxForm.created_at)}</p>
                  <p><strong>Por:</strong> {lastTaxForm.uploaded_by_name}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

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
              <Pin className="mr-2 h-4 w-4" />
              Seleccionar
            </Button>
          ) : (
            <Button 
              variant="outline" 
              className="flex-1 border-primary/30 text-primary"
              disabled
            >
              <Pin className="mr-2 h-4 w-4" />
              Empresa Actual
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => onEdit(enterprise)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar empresa</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {onOpenWizard && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => onOpenWizard(enterprise)}
                  >
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Asistente de configuración</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => exportEnterpriseData({
                    enterpriseId: enterprise.id,
                    enterpriseName: enterprise.business_name,
                  })}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Descargar respaldo (Excel)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Desactivar empresa</TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
            <AlertDialogTitle>¿Desactivar empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción desactivará la empresa{" "}
              <strong>{enterprise.business_name}</strong>. Los datos no se eliminarán 
              y podrán ser reactivados por un administrador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEnterprise}>
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
