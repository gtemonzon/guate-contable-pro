import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Edit, CheckCircle, XCircle, Clock, AlertCircle, Eye, RotateCcw, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, PanelRightOpen, PanelRightClose, FileEdit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import JournalEntryDialog from "@/components/partidas/JournalEntryDialog";
import JournalEntryViewDialog from "@/components/partidas/JournalEntryViewDialog";
import VoidEntryDialog from "@/components/partidas/VoidEntryDialog";
import { MetadataEditDialog } from "@/components/partidas/MetadataEditDialog";
import YearMonthFilter from "@/components/partidas/YearMonthFilter";
import EntryDetailPanel from "@/components/partidas/EntryDetailPanel";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

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
  beneficiary_name?: string | null;
  bank_reference?: string | null;
  document_reference?: string | null;
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
    label: "Pendiente", 
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
  const [metadataEntry, setMetadataEntry] = useState<JournalEntry | null>(null);
  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [openPeriods, setOpenPeriods] = useState<AccountingPeriod[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [splitViewOpen, setSplitViewOpen] = useState(true);
  
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

  const { toast } = useToast();
  const permissions = useUserPermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  // Listen for quick-action from command palette
  useEffect(() => {
    const handler = () => {
      if (permissions.canCreateEntries) {
        setShowEditDialog(true);
      }
    };
    window.addEventListener("quick-action:new-entry", handler);
    return () => window.removeEventListener("quick-action:new-entry", handler);
  }, [permissions.canCreateEntries]);

  // Alt+N shortcut — new journal entry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'n' && !showEditDialog && permissions.canCreateEntries) {
        e.preventDefault();
        setShowEditDialog(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showEditDialog, permissions.canCreateEntries]);

  // Open view dialog from URL params (e.g. from global search)
  useEffect(() => {
    const viewEntryParam = searchParams.get("viewEntry");
    if (viewEntryParam) {
      const entryId = parseInt(viewEntryParam);
      if (!isNaN(entryId)) {
        setSelectedEntryId(entryId);
        setSplitViewOpen(true);
      }
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
        .is("deleted_at", null)
        .order("entry_date", { ascending: false })
        .order("entry_number", { ascending: false });

      if (error) throw error;
      
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

  const isEntryInOpenPeriod = (entry: JournalEntry): boolean => {
    if (entry.accounting_period_id) {
      return openPeriods.some(p => p.id === entry.accounting_period_id);
    }
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
    if (filterYear) {
      filtered = filtered.filter(e => e.entry_date.startsWith(filterYear));
    }
    if (filterYear && filterMonths.length > 0) {
      filtered = filtered.filter(e => {
        const month = parseInt(e.entry_date.substring(5, 7));
        return filterMonths.includes(month);
      });
    }

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

  const pendingReviewCount = entries.filter(e => e.status === 'pendiente_revision').length;
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

  const handleEntryClick = (entry: JournalEntry) => {
    setSelectedEntryId(entry.id);
    setSplitViewOpen(true);
  };

  const handleEditFromPanel = (entryId: number) => {
    const entry = entries.find(e => e.id === entryId);
    if (entry) {
      if (entry.status === 'contabilizado') {
        setMetadataEntry(entry);
        setShowMetadataDialog(true);
      } else {
        setEditingEntry(entry);
        setShowEditDialog(true);
      }
    }
  };

  const handleVoidFromPanel = (entryId: number) => {
    const entry = entries.find(e => e.id === entryId);
    if (entry) {
      setVoidingEntry({
        ...entry,
        enterprise_id: currentEnterpriseId ? parseInt(currentEnterpriseId) : undefined,
      });
      setShowVoidDialog(true);
    }
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

  const entryList = (
    <div className="flex flex-col h-full">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-muted/80 backdrop-blur-sm pt-4 pb-3 px-4 border-b">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1 className="text-2xl font-bold leading-tight">Partidas Contables</h1>
            <p className="text-xs text-muted-foreground">Libro diario de la empresa</p>
          </div>
          <div className="flex items-center gap-2">
            {permissions.canApproveEntries && pendingReviewCount > 0 && (
              <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400 gap-1">
                <AlertCircle className="h-3 w-3" />
                {pendingReviewCount}
              </Badge>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setSplitViewOpen(!splitViewOpen)}
                >
                  {splitViewOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{splitViewOpen ? "Cerrar panel" : "Abrir panel de detalle"}</TooltipContent>
            </Tooltip>
            {permissions.canCreateEntries && (
              <Button size="sm" onClick={() => setShowEditDialog(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Nueva
                <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-primary-foreground/20 rounded border border-primary-foreground/30 font-mono">
                  Alt+N
                </kbd>
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
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="borrador">Borrador</SelectItem>
              <SelectItem value="pendiente_revision">Pendiente</SelectItem>
              <SelectItem value="aprobado">Aprobado</SelectItem>
              <SelectItem value="contabilizado">Contabilizado</SelectItem>
              <SelectItem value="rechazado">Rechazado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[110px] h-8 text-xs">
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
            placeholder="Buscar #..."
            value={filterNumber}
            onChange={(e) => setFilterNumber(e.target.value)}
            className="w-[120px] h-8 text-xs"
          />

          {(filterNumber || filterType !== "all" || filterStatus !== "all" || filterYear) && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs px-2">
              Limpiar
            </Button>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            <Button
              variant={sortField === 'date' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-2 gap-1"
              onClick={() => toggleSort('date')}
            >
              Fecha
              {sortField === 'date' && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </Button>
            <Button
              variant={sortField === 'number' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-2 gap-1"
              onClick={() => toggleSort('number')}
            >
              No.
              {sortField === 'number' && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </Button>
          </div>

          <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[55px] h-7 text-xs">
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
            {filteredEntries.length}
          </span>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Cargando partidas...</p>
        ) : filteredEntries.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay partidas registradas</p>
        ) : (
          <TooltipProvider delayDuration={100}>
            <div className="space-y-1">
              {paginatedEntries.map((entry) => {
                const statusConfig = STATUS_CONFIG[entry.status] || STATUS_CONFIG.borrador;
                const isSelected = selectedEntryId === entry.id;

                return (
                  <div
                    key={entry.id}
                    onClick={() => handleEntryClick(entry)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md border cursor-pointer transition-colors group",
                      isSelected
                        ? "bg-accent border-primary/30 ring-1 ring-primary/20"
                        : "hover:bg-accent/50 border-transparent"
                    )}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{entry.entry_number}</span>
                        <Badge
                          variant={statusConfig.variant}
                          className={cn("text-[10px] h-5 px-1.5", statusConfig.className)}
                        >
                          {statusConfig.icon}
                          <span className="ml-1">{statusConfig.label}</span>
                        </Badge>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5">{entry.entry_type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{entry.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono font-medium">Q{entry.total_debit.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('es-GT')}
                      </p>
                    </div>
                    {/* Quick actions on hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingEntryId(entry.id);
                              setShowViewDialog(true);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top"><p>Vista completa</p></TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={!isEntryInOpenPeriod(entry)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (entry.status === 'contabilizado') {
                                setMetadataEntry(entry);
                                setShowMetadataDialog(true);
                              } else {
                                setEditingEntry(entry);
                                setShowEditDialog(true);
                              }
                            }}
                          >
                            {entry.status === 'contabilizado' ? (
                              <FileEdit className="h-3.5 w-3.5" />
                            ) : (
                              <Edit className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{!isEntryInOpenPeriod(entry) ? 'Período cerrado' : entry.status === 'contabilizado' ? 'Editar datos no contables' : 'Editar'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </TooltipProvider>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t mt-3">
            <p className="text-xs text-muted-foreground">
              {startIndex + 1}-{Math.min(endIndex, filteredEntries.length)} de {filteredEntries.length}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    className="w-7 h-7 p-0 text-xs"
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button variant="outline" size="sm" className="h-7" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-theme(spacing.16)-theme(spacing.12))]">
      <TooltipProvider delayDuration={100}>
        {splitViewOpen && selectedEntryId ? (
          <ResizablePanelGroup direction="horizontal" className="h-full rounded-lg border">
            <ResizablePanel defaultSize={55} minSize={35}>
              {entryList}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={45} minSize={30}>
              <EntryDetailPanel
                entryId={selectedEntryId}
                onClose={() => {
                  setSelectedEntryId(null);
                  setSplitViewOpen(false);
                }}
                onEdit={handleEditFromPanel}
                onVoid={handleVoidFromPanel}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="h-full rounded-lg border">
            {entryList}
          </div>
        )}
      </TooltipProvider>

      <JournalEntryDialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) setEditingEntry(null);
        }}
        onSuccess={(savedEntryId?: number) => {
          if (currentEnterpriseId) fetchEntries(currentEnterpriseId);
          if (savedEntryId) {
            setSelectedEntryId(savedEntryId);
            setSplitViewOpen(true);
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
          if (currentEnterpriseId) fetchEntries(currentEnterpriseId);
        }}
      />

      {metadataEntry && (
        <MetadataEditDialog
          open={showMetadataDialog}
          onOpenChange={(open) => {
            setShowMetadataDialog(open);
            if (!open) setMetadataEntry(null);
          }}
          entryId={metadataEntry.id}
          entryNumber={metadataEntry.entry_number}
          currentValues={{
            description: metadataEntry.description,
            beneficiary_name: metadataEntry.beneficiary_name || null,
            bank_reference: metadataEntry.bank_reference || null,
            document_reference: metadataEntry.document_reference || null,
          }}
          onSuccess={() => {
            if (currentEnterpriseId) fetchEntries(currentEnterpriseId);
            setSelectedEntryId(metadataEntry.id);
          }}
        />
      )}
    </div>
  );
}
