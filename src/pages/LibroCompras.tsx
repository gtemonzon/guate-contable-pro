import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PurchaseEntry {
  id: number;
  invoice_series: string | null;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
  base_amount: number;
  vat_amount: number;
  batch_reference: string | null;
  journal_entry_id: number | null;
  created_at: string;
}

export default function LibroCompras() {
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [filteredPurchases, setFilteredPurchases] = useState<PurchaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  
  // Filtros
  const [filterInvoiceNumber, setFilterInvoiceNumber] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterDocType, setFilterDocType] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const { toast } = useToast();

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchPurchases(enterpriseId);
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
        fetchPurchases(newEnterpriseId);
      } else {
        setPurchases([]);
        setFilteredPurchases([]);
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
  }, [purchases, filterInvoiceNumber, filterSupplier, filterDocType, filterDateFrom, filterDateTo]);

  const fetchPurchases = async (enterpriseId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tab_purchase_ledger")
        .select("*")
        .eq("enterprise_id", parseInt(enterpriseId))
        .order("invoice_date", { ascending: false })
        .order("invoice_number", { ascending: false });

      if (error) throw error;
      setPurchases(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar compras",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...purchases];

    if (filterInvoiceNumber) {
      filtered = filtered.filter(p => 
        p.invoice_number.toLowerCase().includes(filterInvoiceNumber.toLowerCase())
      );
    }

    if (filterSupplier) {
      filtered = filtered.filter(p => 
        p.supplier_name.toLowerCase().includes(filterSupplier.toLowerCase()) ||
        p.supplier_nit.toLowerCase().includes(filterSupplier.toLowerCase())
      );
    }

    if (filterDocType !== "all") {
      filtered = filtered.filter(p => p.fel_document_type === filterDocType);
    }

    if (filterDateFrom) {
      filtered = filtered.filter(p => p.invoice_date >= filterDateFrom);
    }

    if (filterDateTo) {
      filtered = filtered.filter(p => p.invoice_date <= filterDateTo);
    }

    setFilteredPurchases(filtered);
  };

  const clearFilters = () => {
    setFilterInvoiceNumber("");
    setFilterSupplier("");
    setFilterDocType("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  if (!currentEnterpriseId) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Selecciona una empresa para ver el libro de compras
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
          <h1 className="text-3xl font-bold">Libro de Compras</h1>
          <p className="text-muted-foreground">Gestiona las facturas de compra de la empresa</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Compra
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="filterInvoiceNumber">Número de Factura</Label>
              <Input
                id="filterInvoiceNumber"
                placeholder="Buscar por número..."
                value={filterInvoiceNumber}
                onChange={(e) => setFilterInvoiceNumber(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="filterSupplier">Proveedor</Label>
              <Input
                id="filterSupplier"
                placeholder="Nombre o NIT..."
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="filterDocType">Tipo de Documento</Label>
              <Select value={filterDocType} onValueChange={setFilterDocType}>
                <SelectTrigger id="filterDocType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="FACT">Factura</SelectItem>
                  <SelectItem value="FCAM">Factura Cambiaria</SelectItem>
                  <SelectItem value="FPEQ">Factura Pequeño Contribuyente</SelectItem>
                  <SelectItem value="NCRE">Nota de Crédito</SelectItem>
                  <SelectItem value="NDEB">Nota de Débito</SelectItem>
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

      {/* Lista de Compras */}
      <Card>
        <CardHeader>
          <CardTitle>Facturas Registradas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando facturas...</p>
          ) : filteredPurchases.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay facturas registradas
            </p>
          ) : (
            <div className="space-y-2">
              {filteredPurchases.map((purchase) => (
                <Card key={purchase.id} className="hover:bg-accent/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">
                              {purchase.invoice_series ? `${purchase.invoice_series}-` : ''}{purchase.invoice_number}
                            </h3>
                            <Badge variant="outline">{purchase.fel_document_type}</Badge>
                            {purchase.journal_entry_id && (
                              <Badge variant="default">Contabilizado</Badge>
                            )}
                            {purchase.batch_reference && (
                              <Badge variant="secondary">{purchase.batch_reference}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {purchase.supplier_name} (NIT: {purchase.supplier_nit})
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Fecha: {new Date(purchase.invoice_date + 'T00:00:00').toLocaleDateString('es-GT')} • 
                            Base: Q{purchase.base_amount.toFixed(2)} • 
                            IVA: Q{purchase.vat_amount.toFixed(2)} • 
                            Total: Q{purchase.total_amount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar factura"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
