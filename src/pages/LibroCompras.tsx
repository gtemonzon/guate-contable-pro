import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Edit, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PurchaseBook {
  id: number;
  month: number;
  year: number;
  status: string;
  created_at: string;
}

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
}

export default function LibroCompras() {
  const [books, setBooks] = useState<PurchaseBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<PurchaseBook | null>(null);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [showNewBookDialog, setShowNewBookDialog] = useState(false);
  const [newBookMonth, setNewBookMonth] = useState(new Date().getMonth() + 1);
  const [newBookYear, setNewBookYear] = useState(new Date().getFullYear());

  const { toast } = useToast();

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchBooks(enterpriseId);
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
        fetchBooks(newEnterpriseId);
      } else {
        setBooks([]);
        setSelectedBook(null);
        setPurchases([]);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("enterpriseChanged", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("enterpriseChanged", handleStorageChange);
    };
  }, []);

  const fetchBooks = async (enterpriseId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tab_purchase_books")
        .select("*")
        .eq("enterprise_id", parseInt(enterpriseId))
        .order("year", { ascending: false })
        .order("month", { ascending: false });

      if (error) throw error;
      setBooks(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar libros",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPurchases = async (bookId: number) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tab_purchase_ledger")
        .select("*")
        .eq("purchase_book_id", bookId)
        .order("invoice_date", { ascending: false })
        .order("invoice_number", { ascending: false });

      if (error) throw error;
      setPurchases(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar facturas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createNewBook = async () => {
    if (!currentEnterpriseId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const { data, error } = await supabase
        .from("tab_purchase_books")
        .insert({
          enterprise_id: parseInt(currentEnterpriseId),
          month: newBookMonth,
          year: newBookYear,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Libro creado",
        description: `Libro de ${monthNames[newBookMonth - 1]} ${newBookYear} creado exitosamente`,
      });

      setShowNewBookDialog(false);
      fetchBooks(currentEnterpriseId);
      setSelectedBook(data);
      fetchPurchases(data.id);
    } catch (error: any) {
      toast({
        title: "Error al crear libro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSelectBook = (book: PurchaseBook) => {
    setSelectedBook(book);
    fetchPurchases(book.id);
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
          <p className="text-muted-foreground">Gestiona las facturas de compra mensuales</p>
        </div>
        <Button onClick={() => setShowNewBookDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Libro Mensual
        </Button>
      </div>

      {/* Libros mensuales */}
      <Card>
        <CardHeader>
          <CardTitle>Libros Mensuales</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && books.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Cargando libros...</p>
          ) : books.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay libros de compras. Crea uno nuevo para comenzar.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {books.map((book) => (
                <Card 
                  key={book.id} 
                  className={`cursor-pointer transition-colors ${
                    selectedBook?.id === book.id ? 'border-primary' : 'hover:bg-accent/50'
                  }`}
                  onClick={() => handleSelectBook(book)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-8 w-8 text-primary" />
                      <div className="flex-1">
                        <h3 className="font-semibold">
                          {monthNames[book.month - 1]} {book.year}
                        </h3>
                        <Badge variant={book.status === 'abierto' ? 'default' : 'secondary'}>
                          {book.status === 'abierto' ? 'Abierto' : 'Cerrado'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Facturas del libro seleccionado */}
      {selectedBook && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>
                Facturas de {monthNames[selectedBook.month - 1]} {selectedBook.year}
              </CardTitle>
              {selectedBook.status === 'abierto' && (
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar Factura
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Cargando facturas...</p>
            ) : purchases.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No hay facturas registradas en este libro
              </p>
            ) : (
              <div className="space-y-2">
                {purchases.map((purchase) => (
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
                        {selectedBook.status === 'abierto' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar factura"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog para nuevo libro */}
      <Dialog open={showNewBookDialog} onOpenChange={setShowNewBookDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Nuevo Libro de Compras</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="month">Mes</Label>
              <Select value={String(newBookMonth)} onValueChange={(v) => setNewBookMonth(parseInt(v))}>
                <SelectTrigger id="month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((name, index) => (
                    <SelectItem key={index + 1} value={String(index + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="year">Año</Label>
              <Input
                id="year"
                type="number"
                value={newBookYear}
                onChange={(e) => setNewBookYear(parseInt(e.target.value))}
                min="2020"
                max="2099"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewBookDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={createNewBook}>
                Crear Libro
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
