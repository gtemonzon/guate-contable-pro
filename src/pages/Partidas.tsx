import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Edit, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import JournalEntryDialog from "@/components/partidas/JournalEntryDialog";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { cn } from "@/lib/utils";

type EntryStatus = 'borrador' | 'pendiente_revision' | 'aprobado' | 'contabilizado' | 'rechazado';

interface JournalEntry {
  id: number;
  entry_number: string;
  entry_date: string;
  entry_type: string;
  description: string;
  total_debit: number;
  total_credit: number;
  is_posted: boolean;
  status: EntryStatus;
  rejection_reason: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<EntryStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; className?: string }> = {
  borrador: { 
    label: "Borrador", 
    variant: "secondary", 
    icon: <FileText className="h-3 w-3" />,
  },
  pendiente_revision: { 
    label: "Pendiente Revisión", 
    variant: "outline", 
    icon: <Clock className="h-3 w-3" />,
    className: "border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/20"
  },
  aprobado: { 
    label: "Aprobado", 
    variant: "outline", 
    icon: <CheckCircle className="h-3 w-3" />,
    className: "border-green-500 text-green-600 bg-green-50 dark:bg-green-950/20"
  },
  contabilizado: { 
    label: "Contabilizado", 
    variant: "default", 
    icon: <CheckCircle className="h-3 w-3" />,
  },
  rechazado: { 
    label: "Rechazado", 
    variant: "destructive", 
    icon: <XCircle className="h-3 w-3" />,
  },
};

export default function Partidas() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  
  // Filtros
  const [filterNumber, setFilterNumber] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const { toast } = useToast();
  const permissions = useUserPermissions();

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchEntries(enterpriseId);
    } else {
      setLoading(false);
      toast({
        title: "Selecciona una empresa",
        description: "Debes seleccionar una empresa primero",
        variant: "destructive",
      });
    }

    const handleStorageChange = () => {
      const newEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setCurrentEnterpriseId(newEnterpriseId);
      if (newEnterpriseId) {
        fetchEntries(newEnterpriseId);
      } else {
        setEntries([]);
        setFilteredEntries([]);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("enterpriseChanged", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("enterpriseChanged", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    applyFilters();
  }, [entries, filterNumber, filterType, filterStatus, filterDateFrom, filterDateTo]);

  const fetchEntries = async (enterpriseId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tab_journal_entries")
        .select("*")
        .eq("enterprise_id", parseInt(enterpriseId))
        .order("entry_date", { ascending: false })
        .order("entry_number", { ascending: false });

      if (error) throw error;
      
      // Mapear datos con status por defecto para partidas sin status
      const mappedData = (data || []).map(entry => ({
        ...entry,
        status: (entry.status || (entry.is_posted ? 'contabilizado' : 'borrador')) as EntryStatus,
      }));
      
      setEntries(mappedData);
    } catch (error: any) {
      toast({
        title: "Error al cargar partidas",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...entries];

    if (filterNumber) {
      filtered = filtered.filter(e => 
        e.entry_number.toLowerCase().includes(filterNumber.toLowerCase())
      );
    }

    if (filterType !== "all") {
      filtered = filtered.filter(e => e.entry_type === filterType);
    }

    if (filterStatus !== "all") {
      filtered = filtered.filter(e => e.status === filterStatus);
    }

    if (filterDateFrom) {
      filtered = filtered.filter(e => e.entry_date >= filterDateFrom);
    }

    if (filterDateTo) {
      filtered = filtered.filter(e => e.entry_date <= filterDateTo);
    }

    setFilteredEntries(filtered);
  };

  const clearFilters = () => {
    setFilterNumber("");
    setFilterType("all");
    setFilterStatus("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  // Contador de partidas pendientes de revisión
  const pendingReviewCount = entries.filter(e => e.status === 'pendiente_revision').length;

  if (!currentEnterpriseId) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Selecciona una empresa para ver las partidas contables
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Partidas Contables</h1>
          <p className="text-muted-foreground">Gestiona el libro diario de la empresa</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Indicador de partidas pendientes */}
          {permissions.canApproveEntries && pendingReviewCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {pendingReviewCount} partida{pendingReviewCount > 1 ? 's' : ''} pendiente{pendingReviewCount > 1 ? 's' : ''} de revisión
              </span>
            </div>
          )}
          
          {permissions.canCreateEntries && (
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Partida
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="filterNumber">Número</Label>
              <Input
                id="filterNumber"
                placeholder="Buscar por número..."
                value={filterNumber}
                onChange={(e) => setFilterNumber(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="filterType">Tipo</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger id="filterType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="apertura">Apertura</SelectItem>
                  <SelectItem value="diario">Diario</SelectItem>
                  <SelectItem value="ajuste">Ajuste</SelectItem>
                  <SelectItem value="cierre">Cierre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="filterStatus">Estado</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger id="filterStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="borrador">Borrador</SelectItem>
                  <SelectItem value="pendiente_revision">Pendiente Revisión</SelectItem>
                  <SelectItem value="aprobado">Aprobado</SelectItem>
                  <SelectItem value="contabilizado">Contabilizado</SelectItem>
                  <SelectItem value="rechazado">Rechazado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="filterDateFrom">Desde</Label>
              <Input
                id="filterDateFrom"
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="filterDateTo">Hasta</Label>
              <Input
                id="filterDateTo"
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>
          </div>
          
          <div className="mt-4">
            <Button variant="outline" onClick={clearFilters}>
              Limpiar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Partidas */}
      <Card>
        <CardHeader>
          <CardTitle>Partidas Registradas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando partidas...</p>
          ) : filteredEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay partidas registradas
            </p>
          ) : (
            <div className="space-y-2">
              {filteredEntries.map((entry) => {
                const statusConfig = STATUS_CONFIG[entry.status] || STATUS_CONFIG.borrador;
                
                return (
                  <Card key={entry.id} className="hover:bg-[hsl(var(--table-row-hover))] transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <FileText className="h-8 w-8 text-muted-foreground" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold">{entry.entry_number}</h3>
                              <Badge 
                                variant={statusConfig.variant}
                                className={cn("flex items-center gap-1", statusConfig.className)}
                              >
                                {statusConfig.icon}
                                {statusConfig.label}
                              </Badge>
                              <Badge variant="outline">{entry.entry_type}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {entry.description}
                            </p>
                            {entry.status === 'rechazado' && entry.rejection_reason && (
                              <p className="text-sm text-destructive mt-1">
                                <span className="font-medium">Motivo de rechazo:</span> {entry.rejection_reason}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              Fecha: {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('es-GT')} • 
                              Debe: Q{entry.total_debit.toFixed(2)} • 
                              Haber: Q{entry.total_credit.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingEntry(entry);
                            setShowDialog(true);
                          }}
                          title={entry.status === 'contabilizado' ? "Ver partida contabilizada" : "Editar partida"}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <JournalEntryDialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) setEditingEntry(null);
        }}
        onSuccess={() => {
          if (currentEnterpriseId) {
            fetchEntries(currentEnterpriseId);
          }
          setEditingEntry(null);
        }}
        entryToEdit={editingEntry}
      />
    </div>
  );
}
