import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Edit, CheckCircle, XCircle, Clock, AlertCircle, Eye, RotateCcw, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import JournalEntryDialog from "@/components/partidas/JournalEntryDialog";
import JournalEntryViewDialog from "@/components/partidas/JournalEntryViewDialog";
import VoidEntryDialog from "@/components/partidas/VoidEntryDialog";
import YearMonthFilter from "@/components/partidas/YearMonthFilter";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  enterprise_id?: number;
  accounting_period_id?: number | null;
}

interface AccountingPeriod {
  id: number;
  start_date: string;
  end_date: string;
  status: string;
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
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [viewingEntryId, setViewingEntryId] = useState<number | null>(null);
  const [voidingEntry, setVoidingEntry] = useState<JournalEntry | null>(null);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [openPeriods, setOpenPeriods] = useState<AccountingPeriod[]>([]);
  
  // Filtros
  const [filterNumber, setFilterNumber] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [filterMonths, setFilterMonths] = useState<number[]>([]);
  
  // Ordenamiento
  const [sortField, setSortField] = useState<'date' | 'number'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [hoveredEntryId, setHoveredEntryId] = useState<number | null>(null);

  const { toast } = useToast();
  const permissions = useUserPermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  // Open view dialog from URL params (e.g. from global search)
  useEffect(() => {
    const viewEntryParam = searchParams.get("viewEntry");
    if (viewEntryParam) {
      const entryId = parseInt(viewEntryParam);
      if (!isNaN(entryId)) {
        setViewingEntryId(entryId);
        setShowViewDialog(true);
      }
      // Clean up the URL param
      searchParams.delete("viewEntry");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchEntries(enterpriseId);
      fetchOpenPeriods(enterpriseId);
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
        fetchOpenPeriods(newEnterpriseId);
      } else {
        setEntries([]);
        setFilteredEntries([]);
        setOpenPeriods([]);
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
    setCurrentPage(1);
  }, [entries, filterNumber, filterType, filterStatus, filterYear, filterMonths, sortField, sortDir]);

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

  const fetchOpenPeriods = async (enterpriseId: string) => {
    try {
      const { data, error } = await supabase
        .from("tab_accounting_periods")
        .select("id, start_date, end_date, status")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("status", "abierto");

      if (error) throw error;
      setOpenPeriods(data || []);
    } catch (error) {
      console.error("Error fetching open periods:", error);
      setOpenPeriods([]);
    }
  };

  // Helper to check if an entry is in an open period
  const isEntryInOpenPeriod = (entry: JournalEntry): boolean => {
    // If entry has accounting_period_id, check if that period is in openPeriods
    if (entry.accounting_period_id) {
      return openPeriods.some(p => p.id === entry.accounting_period_id);
    }
    // Otherwise check by date range
    const entryDate = new Date(entry.entry_date);
    return openPeriods.some(period => {
      const start = new Date(period.start_date);
      const end = new Date(period.end_date);
      return entryDate >= start && entryDate <= end;
    });
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

    // Filtro por año
    if (filterYear) {
      filtered = filtered.filter(e => e.entry_date.startsWith(filterYear));
    }

    // Filtro por meses (dentro del año seleccionado)
    if (filterYear && filterMonths.length > 0) {
      filtered = filtered.filter(e => {
        const month = parseInt(e.entry_date.substring(5, 7));
        return filterMonths.includes(month);
      });
    }

    // Ordenamiento
    filtered.sort((a, b) => {
      let cmp: number;
      if (sortField === 'date') {
        cmp = a.entry_date.localeCompare(b.entry_date);
        if (cmp === 0) cmp = a.entry_number.localeCompare(b.entry_number);
      } else {
        cmp = a.entry_number.localeCompare(b.entry_number);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    setFilteredEntries(filtered);
  };

  const toggleSort = (field: 'date' | 'number') => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const clearFilters = () => {
    setFilterNumber("");
    setFilterType("all");
    setFilterStatus("all");
    setFilterYear(null);
    setFilterMonths([]);
  };

  // Contador de partidas pendientes de revisión
  const pendingReviewCount = entries.filter(e => e.status === 'pendiente_revision').length;

  // Paginación
  const totalPages = Math.ceil(filteredEntries.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedEntries = filteredEntries.slice(startIndex, endIndex);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.max(1, Math.min(newPage, totalPages)));
  };

  const handlePageSizeChange = (newSize: string) => {
    setPageSize(parseInt(newSize));
    setCurrentPage(1);
  };

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
    <div className="flex flex-col h-full">
      {/* Sticky Header — compact */}
      <div className="sticky top-0 z-20 bg-muted/80 backdrop-blur-sm pt-4 pb-3 px-8 border-b">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1 className="text-2xl font-bold leading-tight">Partidas Contables</h1>
            <p className="text-xs text-muted-foreground">Libro diario de la empresa</p>
          </div>
          <div className="flex items-center gap-3">
            {permissions.canApproveEntries && pendingReviewCount > 0 && (
              <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400 gap-1">
                <AlertCircle className="h-3 w-3" />
                {pendingReviewCount} pendiente{pendingReviewCount > 1 ? 's' : ''}
              </Badge>
            )}
            {permissions.canCreateEntries && (
              <Button size="sm" onClick={() => setShowEditDialog(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Nueva Partida
              </Button>
            )}
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-2">
          <YearMonthFilter
            entries={entries}
            selectedYear={filterYear}
            selectedMonths={filterMonths}
            onYearChange={setFilterYear}
            onMonthsChange={setFilterMonths}
          />
          
          <div className="h-5 w-px bg-border" />
          
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="borrador">Borrador</SelectItem>
              <SelectItem value="pendiente_revision">Pendiente Revisión</SelectItem>
              <SelectItem value="aprobado">Aprobado</SelectItem>
              <SelectItem value="contabilizado">Contabilizado</SelectItem>
              <SelectItem value="rechazado">Rechazado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              <SelectItem value="apertura">Apertura</SelectItem>
              <SelectItem value="diario">Diario</SelectItem>
              <SelectItem value="ajuste">Ajuste</SelectItem>
              <SelectItem value="cierre">Cierre</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Buscar número..."
            value={filterNumber}
            onChange={(e) => setFilterNumber(e.target.value)}
            className="w-[140px] h-8 text-xs"
          />

          {(filterNumber || filterType !== "all" || filterStatus !== "all" || filterYear) && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs px-2">
              Limpiar
            </Button>
          )}

          <div className="flex-1" />

          {/* Sort selector */}
          <div className="flex items-center gap-1">
            <Button
              variant={sortField === 'date' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-xs px-2 gap-1"
              onClick={() => toggleSort('date')}
            >
              Fecha
              {sortField === 'date' && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </Button>
            <Button
              variant={sortField === 'number' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-xs px-2 gap-1"
              onClick={() => toggleSort('number')}
            >
              No.
              {sortField === 'number' && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </Button>
          </div>

          <div className="h-5 w-px bg-border" />

          <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[60px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filteredEntries.length} partida{filteredEntries.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-auto px-8 py-4">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando partidas...</p>
          ) : filteredEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay partidas registradas
            </p>
          ) : (
            <>
              <TooltipProvider delayDuration={100}>
                <div className="space-y-2">
                  {paginatedEntries.map((entry) => {
                    const statusConfig = STATUS_CONFIG[entry.status] || STATUS_CONFIG.borrador;
                    const isHovered = hoveredEntryId === entry.id;
                    
                    return (
                      <Card 
                        key={entry.id} 
                        className="border-l-4 border-l-transparent hover:bg-[hsl(var(--table-row-hover))] hover:border-l-primary transition-colors relative"
                        onMouseEnter={() => setHoveredEntryId(entry.id)}
                        onMouseLeave={() => setHoveredEntryId(null)}
                      >
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
                            
                            {/* Hover Actions Menu */}
                            <div className={cn(
                              "flex items-center gap-2 transition-all duration-150",
                              isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"
                            )}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-3 gap-1.5"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingEntryId(entry.id);
                                      setShowViewDialog(true);
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                    <span className="text-xs">Ver</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>Ver detalles de la partida</p>
                                </TooltipContent>
                              </Tooltip>
                              
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-3 gap-1.5"
                                    disabled={!isEntryInOpenPeriod(entry)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingEntry(entry);
                                      setShowEditDialog(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                    <span className="text-xs">Editar</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{!isEntryInOpenPeriod(entry) ? 'El período contable está cerrado' : 'Editar partida'}</p>
                                </TooltipContent>
                              </Tooltip>
                              
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-3 gap-1.5 text-amber-600 hover:text-amber-700"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setVoidingEntry({
                                        ...entry,
                                        enterprise_id: currentEnterpriseId ? parseInt(currentEnterpriseId) : undefined
                                      });
                                      setShowVoidDialog(true);
                                    }}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                    <span className="text-xs">Anular</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>Crear partida de reversión</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TooltipProvider>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {startIndex + 1} - {Math.min(endIndex, filteredEntries.length)} de {filteredEntries.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => handlePageChange(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
      </div>

      <JournalEntryDialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
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

      <JournalEntryViewDialog
        open={showViewDialog}
        onOpenChange={setShowViewDialog}
        entryId={viewingEntryId}
      />

      <VoidEntryDialog
        open={showVoidDialog}
        onOpenChange={(open) => {
          setShowVoidDialog(open);
          if (!open) setVoidingEntry(null);
        }}
        entry={voidingEntry}
        onSuccess={() => {
          if (currentEnterpriseId) {
            fetchEntries(currentEnterpriseId);
          }
        }}
      />
    </div>
  );
}
