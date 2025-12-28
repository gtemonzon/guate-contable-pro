import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, ShoppingCart, DollarSign, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";

interface InvoiceResult {
  id: number;
  type: "compra" | "venta";
  invoice_series: string | null;
  invoice_number: string;
  invoice_date: string;
  nit: string;
  name: string;
  total_amount: number;
  month: number;
  year: number;
}

interface InvoiceSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectInvoice: (month: number, year: number, tab: "compras" | "ventas", invoiceId: number) => void;
  enterpriseId: string;
}

export function InvoiceSearchDialog({ 
  isOpen, 
  onClose, 
  onSelectInvoice, 
  enterpriseId 
}: InvoiceSearchDialogProps) {
  const [searchNit, setSearchNit] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [searchInvoiceNumber, setSearchInvoiceNumber] = useState("");
  const [results, setResults] = useState<InvoiceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const monthNames = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
  ];

  useEffect(() => {
    if (!isOpen) {
      // Reset state when dialog closes
      setSearchNit("");
      setSearchName("");
      setSearchDate("");
      setSearchInvoiceNumber("");
      setResults([]);
      setHasSearched(false);
    }
  }, [isOpen]);

  const handleSearch = async () => {
    if (!searchNit && !searchName && !searchDate && !searchInvoiceNumber) {
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const purchaseResults: InvoiceResult[] = [];
      const salesResults: InvoiceResult[] = [];

      // Search in purchases
      let purchaseQuery = supabase
        .from("tab_purchase_ledger")
        .select("id, invoice_series, invoice_number, invoice_date, supplier_nit, supplier_name, total_amount")
        .eq("enterprise_id", parseInt(enterpriseId));

      if (searchNit) {
        purchaseQuery = purchaseQuery.ilike("supplier_nit", `%${searchNit}%`);
      }
      if (searchName) {
        purchaseQuery = purchaseQuery.ilike("supplier_name", `%${searchName}%`);
      }
      if (searchDate) {
        purchaseQuery = purchaseQuery.eq("invoice_date", searchDate);
      }
      if (searchInvoiceNumber) {
        purchaseQuery = purchaseQuery.ilike("invoice_number", `%${searchInvoiceNumber}%`);
      }

      const { data: purchases, error: purchaseError } = await purchaseQuery
        .order("invoice_date", { ascending: false })
        .limit(50);

      if (purchaseError) throw purchaseError;

      purchases?.forEach(p => {
        const date = parseISO(p.invoice_date);
        purchaseResults.push({
          id: p.id,
          type: "compra",
          invoice_series: p.invoice_series,
          invoice_number: p.invoice_number,
          invoice_date: p.invoice_date,
          nit: p.supplier_nit,
          name: p.supplier_name,
          total_amount: p.total_amount,
          month: date.getMonth() + 1,
          year: date.getFullYear(),
        });
      });

      // Search in sales
      let salesQuery = supabase
        .from("tab_sales_ledger")
        .select("id, invoice_series, invoice_number, invoice_date, customer_nit, customer_name, total_amount")
        .eq("enterprise_id", parseInt(enterpriseId));

      if (searchNit) {
        salesQuery = salesQuery.ilike("customer_nit", `%${searchNit}%`);
      }
      if (searchName) {
        salesQuery = salesQuery.ilike("customer_name", `%${searchName}%`);
      }
      if (searchDate) {
        salesQuery = salesQuery.eq("invoice_date", searchDate);
      }
      if (searchInvoiceNumber) {
        salesQuery = salesQuery.ilike("invoice_number", `%${searchInvoiceNumber}%`);
      }

      const { data: sales, error: salesError } = await salesQuery
        .order("invoice_date", { ascending: false })
        .limit(50);

      if (salesError) throw salesError;

      sales?.forEach(s => {
        const date = parseISO(s.invoice_date);
        salesResults.push({
          id: s.id,
          type: "venta",
          invoice_series: s.invoice_series,
          invoice_number: s.invoice_number,
          invoice_date: s.invoice_date,
          nit: s.customer_nit,
          name: s.customer_name,
          total_amount: s.total_amount,
          month: date.getMonth() + 1,
          year: date.getFullYear(),
        });
      });

      // Combine and sort by date
      const allResults = [...purchaseResults, ...salesResults].sort(
        (a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()
      );

      setResults(allResults);
    } catch (error) {
      console.error("Error searching invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleSelectInvoice = (invoice: InvoiceResult) => {
    onSelectInvoice(
      invoice.month, 
      invoice.year, 
      invoice.type === "compra" ? "compras" : "ventas",
      invoice.id
    );
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar Factura
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Fields */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label htmlFor="search-nit">NIT</Label>
              <Input
                id="search-nit"
                placeholder="NIT..."
                value={searchNit}
                onChange={(e) => setSearchNit(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div>
              <Label htmlFor="search-name">Nombre</Label>
              <Input
                id="search-name"
                placeholder="Nombre..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div>
              <Label htmlFor="search-date">Fecha</Label>
              <Input
                id="search-date"
                type="date"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div>
              <Label htmlFor="search-invoice">No. Factura</Label>
              <Input
                id="search-invoice"
                placeholder="Número..."
                value={searchInvoiceNumber}
                onChange={(e) => setSearchInvoiceNumber(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>

          <div className="flex justify-between items-center">
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Buscar
            </Button>
            {hasSearched && (
              <span className="text-sm text-muted-foreground">
                {results.length} resultado(s) encontrado(s)
              </span>
            )}
          </div>

          {/* Results Table */}
          <div className="border rounded-md overflow-auto max-h-[400px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-[80px]">Tipo</TableHead>
                  <TableHead>Serie-No.</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>NIT</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.length === 0 && hasSearched && !loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No se encontraron facturas
                    </TableCell>
                  </TableRow>
                )}
                {!hasSearched && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Ingrese criterios de búsqueda y presione Buscar
                    </TableCell>
                  </TableRow>
                )}
                {results.map((invoice) => (
                  <TableRow key={`${invoice.type}-${invoice.id}`} className="hover:bg-muted/50">
                    <TableCell>
                      <Badge 
                        variant={invoice.type === "compra" ? "secondary" : "default"}
                        className="flex items-center gap-1 w-fit"
                      >
                        {invoice.type === "compra" ? (
                          <ShoppingCart className="h-3 w-3" />
                        ) : (
                          <DollarSign className="h-3 w-3" />
                        )}
                        {invoice.type === "compra" ? "Compra" : "Venta"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {invoice.invoice_series ? `${invoice.invoice_series}-` : ""}{invoice.invoice_number}
                    </TableCell>
                    <TableCell>
                      {format(parseISO(invoice.invoice_date), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="font-mono">{invoice.nit}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={invoice.name}>
                      {invoice.name}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      Q {formatCurrency(invoice.total_amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {monthNames[invoice.month - 1]} {invoice.year}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSelectInvoice(invoice)}
                        title="Ir al registro"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
