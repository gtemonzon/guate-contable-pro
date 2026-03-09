import { useState, useEffect, useMemo } from "react";
import { TruncatedText } from "@/components/ui/truncated-text";
import { ReferenceBadges } from "@/components/partidas/ReferenceBadges";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Download, Loader2, ChevronRight, ChevronDown, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/utils";
import { FolioExportDialog, FolioExportOptions } from "./FolioExportDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface JournalEntryData {
  id: number;
  entry_number: string;
  entry_date: string;
  entry_type: string;
  description: string;
  total_debit: number;
  total_credit: number;
  is_posted: boolean;
  document_references?: string[] | null;
}

interface JournalEntryDetail {
  line_number: number;
  account_code: string;
  account_name: string;
  debit_amount: number;
  credit_amount: number;
  description: string | null;
}

// Separate posted entries from draft entries
interface ReportData {
  postedEntries: JournalEntryData[];
  draftCount: number;
}

export default function ReportePartidas() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [entries, setEntries] = useState<JournalEntryData[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [entryDetails, setEntryDetails] = useState<Record<number, JournalEntryDetail[]>>({});
  const [includeDetails, setIncludeDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchEnterpriseName(enterpriseId);
    }

    // Set default dates to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setDateFrom(firstDay.toISOString().split('T')[0]);
    setDateTo(lastDay.toISOString().split('T')[0]);
  }, []);

  const fetchEnterpriseName = async (enterpriseId: string) => {
    try {
      const { data, error } = await supabase
        .from("tab_enterprises")
        .select("business_name")
        .eq("id", parseInt(enterpriseId))
        .single();

      if (error) throw error;
      setEnterpriseName(data?.business_name || "");
    } catch (error: any) {
      console.error("Error fetching enterprise:", error);
    }
  };

  const generateReport = async () => {
    if (!currentEnterpriseId) {
      toast({
        title: "Error",
        description: "Selecciona una empresa primero",
        variant: "destructive",
      });
      return;
    }

    if (!dateFrom || !dateTo) {
      toast({
        title: "Error",
        description: "Debes seleccionar un período de fechas",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const data = await fetchAllRecords<any>(
        supabase
          .from("tab_journal_entries")
          .select("*")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .gte("entry_date", dateFrom)
          .lte("entry_date", dateTo)
          .order("entry_date", { ascending: true })
          .order("entry_number", { ascending: true })
      );
      
      // Separate posted entries and count drafts
      const allEntries = data || [];
      const postedEntries = allEntries.filter((e: JournalEntryData) => e.is_posted);
      const drafts = allEntries.filter((e: JournalEntryData) => !e.is_posted).length;
      
      setEntries(postedEntries);
      setDraftCount(drafts);

      // Fetch details if needed (con paginación automática)
      if (includeDetails && data && data.length > 0) {
        const entryIds = data.map(e => e.id);
        const detailsData = await fetchAllRecords<any>(
          supabase
            .from("tab_journal_entry_details")
            .select(`
              *,
              tab_accounts!inner(account_code, account_name)
            `)
            .in("journal_entry_id", entryIds)
            .order("line_number")
        );

        // Group details by entry id
        const groupedDetails: Record<number, JournalEntryDetail[]> = {};
        (detailsData || []).forEach((detail: any) => {
          if (!groupedDetails[detail.journal_entry_id]) {
            groupedDetails[detail.journal_entry_id] = [];
          }
          groupedDetails[detail.journal_entry_id].push({
            line_number: detail.line_number,
            account_code: detail.tab_accounts.account_code,
            account_name: detail.tab_accounts.account_name,
            debit_amount: detail.debit_amount,
            credit_amount: detail.credit_amount,
            description: detail.description,
          });
        });
        setEntryDetails(groupedDetails);
        // Expand all entries by default when loading with details
        setExpandedEntries(new Set(data.map((e: any) => e.id)));
      } else {
        setEntryDetails({});
        setExpandedEntries(new Set());
      }
      
      if (!data || data.length === 0) {
        toast({
          title: "Sin datos",
          description: "No hay partidas registradas para el período seleccionado",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error al generar reporte",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleEntry = (entryId: number) => {
    setExpandedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  };

  const toggleAllEntries = () => {
    if (expandedEntries.size === entries.length) {
      setExpandedEntries(new Set());
    } else {
      setExpandedEntries(new Set(entries.map(e => e.id)));
    }
  };

  // Filter entries based on search term
  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) return entries;
    
    const term = searchTerm.toLowerCase();
    return entries.filter(entry => 
      entry.entry_number.toLowerCase().includes(term) ||
      entry.description.toLowerCase().includes(term) ||
      entry.entry_type.toLowerCase().includes(term) ||
      // Also search in details if they exist
      (entryDetails[entry.id] && entryDetails[entry.id].some(detail => 
        detail.account_code.toLowerCase().includes(term) ||
        detail.account_name.toLowerCase().includes(term) ||
        (detail.description && detail.description.toLowerCase().includes(term))
      ))
    );
  }, [entries, entryDetails, searchTerm]);

  const handleExport = (options: FolioExportOptions) => {
    let data: any[] = [];
    
    // Export only posted entries (entries state already filtered)
    // New layout: details first, then description and totals at the end of each entry
    if (includeDetails) {
      // Headers for detailed view: Cuenta, Descripción Línea, Debe, Haber
      const headers = ["Cuenta", "Concepto", "Debe", "Haber"];
      
      entries.forEach(e => {
        // First: Entry header row with number, date, type (no totals yet)
        data.push([
          `${e.entry_number} - ${new Date(e.entry_date + 'T00:00:00').toLocaleDateString('es-GT')} - ${e.entry_type}`,
          '',
          '',
          '',
        ]);
        
        // Second: Detail lines
        if (entryDetails[e.id]) {
          entryDetails[e.id].forEach(detail => {
            data.push([
              `${detail.account_code} - ${detail.account_name}`,
              detail.description || '',
              detail.debit_amount > 0 ? (options.format === 'excel' ? detail.debit_amount.toFixed(2) : formatCurrency(detail.debit_amount)) : '',
              detail.credit_amount > 0 ? (options.format === 'excel' ? detail.credit_amount.toFixed(2) : formatCurrency(detail.credit_amount)) : '',
            ]);
          });
        }
        
        // Third: Description and totals at the end of the entry
        data.push([
          e.description,
          'TOTALES:',
          options.format === 'excel' ? e.total_debit.toFixed(2) : formatCurrency(e.total_debit),
          options.format === 'excel' ? e.total_credit.toFixed(2) : formatCurrency(e.total_credit),
        ]);
        
        // Add empty row separator between entries
        data.push(['', '', '', '']);
      });

      const totalDebit = entries.reduce((sum, e) => sum + e.total_debit, 0);
      const totalCredit = entries.reduce((sum, e) => sum + e.total_credit, 0);

      const exportOptions = {
        filename: `Libro_Diario_${dateFrom}_${dateTo}`,
        title: `Libro Diario con Detalle - Del ${new Date(dateFrom + 'T00:00:00').toLocaleDateString('es-GT')} al ${new Date(dateTo + 'T00:00:00').toLocaleDateString('es-GT')}`,
        enterpriseName,
        headers,
        data,
        totals: [
          { label: "Total Debe", value: formatCurrency(totalDebit) },
          { label: "Total Haber", value: formatCurrency(totalCredit) },
          { label: "Cantidad de Partidas", value: entries.length.toString() },
        ],
      };

      if (options.format === 'excel') {
        exportToExcel(exportOptions);
      } else {
        exportToPDF({
          ...exportOptions,
          forcePortrait: true,
          folioOptions: {
            includeFolio: options.includeFolio,
            startingFolio: options.startingFolio,
          },
        });
      }
    } else {
      // Simple view without details
      const headers = ["Número", "Fecha", "Tipo", "Descripción", "Debe", "Haber"];
      data = entries.map(e => [
        e.entry_number,
        new Date(e.entry_date + 'T00:00:00').toLocaleDateString('es-GT'),
        e.entry_type,
        e.description,
        options.format === 'excel' ? e.total_debit.toFixed(2) : formatCurrency(e.total_debit),
        options.format === 'excel' ? e.total_credit.toFixed(2) : formatCurrency(e.total_credit),
      ]);

      const totalDebit = entries.reduce((sum, e) => sum + e.total_debit, 0);
      const totalCredit = entries.reduce((sum, e) => sum + e.total_credit, 0);

      const exportOptions = {
        filename: `Libro_Diario_${dateFrom}_${dateTo}`,
        title: `Libro Diario - Del ${new Date(dateFrom + 'T00:00:00').toLocaleDateString('es-GT')} al ${new Date(dateTo + 'T00:00:00').toLocaleDateString('es-GT')}`,
        enterpriseName,
        headers,
        data,
        totals: [
          { label: "Total Debe", value: formatCurrency(totalDebit) },
          { label: "Total Haber", value: formatCurrency(totalCredit) },
          { label: "Cantidad de Partidas", value: entries.length.toString() },
        ],
      };

      if (options.format === 'excel') {
        exportToExcel(exportOptions);
      } else {
        exportToPDF({
          ...exportOptions,
          forcePortrait: true,
          folioOptions: {
            includeFolio: options.includeFolio,
            startingFolio: options.startingFolio,
          },
        });
      }
    }

    toast({
      title: "Exportado",
      description: `El reporte se ha exportado a ${options.format.toUpperCase()} correctamente`,
    });
  };

  const totalDebit = filteredEntries.reduce((sum, e) => sum + e.total_debit, 0);
  const totalCredit = filteredEntries.reduce((sum, e) => sum + e.total_credit, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <Label htmlFor="dateFrom">Fecha Desde</Label>
          <Input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="dateTo">Fecha Hasta</Label>
          <Input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 justify-end">
          <div className="flex items-center space-x-2">
            <Switch
              id="include-details"
              checked={includeDetails}
              onCheckedChange={setIncludeDetails}
            />
            <Label htmlFor="include-details" className="text-sm">Incluir detalle</Label>
          </div>
        </div>

        <div className="flex items-end">
          <Button onClick={generateReport} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generar Reporte
          </Button>
        </div>

        {entries.length > 0 && (
          <div className="flex items-end">
            <Button variant="outline" onClick={() => setExportDialogOpen(true)} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </div>
        )}
      </div>

      <FolioExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onExport={handleExport}
        title="Exportar Libro Diario"
        warningMessage={draftCount > 0 ? `El reporte se emitirá únicamente con partidas contabilizadas. En el período seleccionado hay ${draftCount} partida${draftCount > 1 ? 's' : ''} en estado borrador o pendiente${draftCount > 1 ? 's' : ''} de contabilizar.` : undefined}
      />

      {entries.length > 0 && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, descripción, cuenta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {includeDetails && (
              <Button variant="outline" size="sm" onClick={toggleAllEntries}>
                {expandedEntries.size === entries.length ? "Contraer todo" : "Expandir todo"}
              </Button>
            )}
          </div>

          <div className="rounded-lg border overflow-auto max-h-[500px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  {includeDetails && <TableHead className="w-8"></TableHead>}
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => (
                  <React.Fragment key={entry.id}>
                    {includeDetails ? (
                      <Collapsible
                        open={expandedEntries.has(entry.id)}
                        onOpenChange={() => toggleEntry(entry.id)}
                        asChild
                      >
                        <>
                          <CollapsibleTrigger asChild>
                            <TableRow className="font-semibold cursor-pointer hover:bg-muted/50">
                              <TableCell className="w-8">
                                {entryDetails[entry.id] && entryDetails[entry.id].length > 0 && (
                                  expandedEntries.has(entry.id) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )
                                )}
                              </TableCell>
                              <TableCell>{entry.entry_number}</TableCell>
                              <TableCell>{new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('es-GT')}</TableCell>
                              <TableCell className="capitalize">{entry.entry_type}</TableCell>
                              <TableCell>
                                <TruncatedText text={entry.description} inline />
                                {entry.document_references?.length > 0 && (
                                  <ReferenceBadges references={entry.document_references} maxVisible={1} compact className="mt-0.5" />
                                )}
                              </TableCell>
                              <TableCell className="text-right">{formatCurrency(entry.total_debit)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(entry.total_credit)}</TableCell>
                            </TableRow>
                          </CollapsibleTrigger>
                          <CollapsibleContent asChild>
                            <>
                              {entryDetails[entry.id]?.map((detail, detailIdx) => (
                                <TableRow key={`${entry.id}-${detailIdx}`} className="bg-muted/30">
                                  <TableCell></TableCell>
                                  <TableCell className="pl-4 text-sm" colSpan={2}>
                                    {detail.account_code} - {detail.account_name}
                                  </TableCell>
                                  <TableCell className="text-sm" colSpan={2}>
                                    <TruncatedText text={detail.description || '-'} inline />
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    {detail.debit_amount > 0 ? formatCurrency(detail.debit_amount) : '-'}
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    {detail.credit_amount > 0 ? formatCurrency(detail.credit_amount) : '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </>
                          </CollapsibleContent>
                        </>
                      </Collapsible>
                    ) : (
                      <TableRow className="font-semibold">
                        <TableCell>{entry.entry_number}</TableCell>
                        <TableCell>{new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('es-GT')}</TableCell>
                        <TableCell className="capitalize">{entry.entry_type}</TableCell>
                        <TableCell><TruncatedText text={entry.description} inline /></TableCell>
                        <TableCell className="text-right">{formatCurrency(entry.total_debit)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(entry.total_credit)}</TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-8 p-4 bg-muted rounded-lg">
            <div>
              <span className="text-muted-foreground">Total Debe: </span>
              <span className="font-semibold">{formatCurrency(totalDebit)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Haber: </span>
              <span className="font-semibold">{formatCurrency(totalCredit)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Partidas: </span>
              <span className="font-semibold">{filteredEntries.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
