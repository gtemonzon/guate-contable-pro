import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, FileText, Download, Trash2, Edit, ArrowUpDown, Building2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import TaxFormDialog from "@/components/impuestos/TaxFormDialog";
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface TaxForm {
  id: number;
  enterprise_id: number;
  form_number: string;
  access_code: string;
  tax_type: string | null;
  period_type: string | null;
  period_month: number | null;
  period_year: number | null;
  payment_date: string;
  amount_paid: number;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  notes: string | null;
  created_at: string;
  is_active: boolean;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const formatPeriod = (form: TaxForm): string => {
  if (!form.period_type || !form.period_year) return "";
  
  if (form.period_type === "mensual" && form.period_month) {
    return `${MONTHS[form.period_month - 1]} ${form.period_year}`;
  } else if (form.period_type === "trimestral" && form.period_month) {
    const startMonth = form.period_month;
    const endMonth = Math.min(startMonth + 2, 12);
    return `${MONTHS[startMonth - 1]} - ${MONTHS[endMonth - 1]} ${form.period_year}`;
  } else if (form.period_type === "anual") {
    return `Enero - Diciembre ${form.period_year}`;
  }
  return "";
};

export default function FormulariosImpuestos() {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [taxForms, setTaxForms] = useState<TaxForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<TaxForm | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formToDelete, setFormToDelete] = useState<TaxForm | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { toast } = useToast();

  useEffect(() => {
    loadActiveEnterprise();
    
    // Listen for enterprise changes
    const handleEnterpriseChange = () => loadActiveEnterprise();
    window.addEventListener("storage", handleEnterpriseChange);
    window.addEventListener("enterpriseChanged", handleEnterpriseChange);
    
    return () => {
      window.removeEventListener("storage", handleEnterpriseChange);
      window.removeEventListener("enterpriseChanged", handleEnterpriseChange);
    };
  }, []);

  useEffect(() => {
    if (enterpriseId) {
      fetchTaxForms();
    }
  }, [enterpriseId, sortOrder]);

  const loadActiveEnterprise = async () => {
    const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
    
    if (!currentEnterpriseId) {
      setEnterpriseId(null);
      setEnterpriseName("");
      setTaxForms([]);
      setLoading(false);
      return;
    }

    const id = parseInt(currentEnterpriseId);
    setEnterpriseId(id);

    try {
      const { data, error } = await supabase
        .from("tab_enterprises")
        .select("business_name")
        .eq("id", id)
        .single();

      if (error) throw error;
      setEnterpriseName(data.business_name);
    } catch (error) {
      console.error("Error fetching enterprise:", error);
      setEnterpriseName("");
    } finally {
      setLoading(false);
    }
  };

  const fetchTaxForms = async () => {
    if (!enterpriseId) return;

    try {
      const { data, error } = await supabase
        .from("tab_tax_forms")
        .select("*")
        .eq("enterprise_id", enterpriseId)
        .eq("is_active", true)
        .order("payment_date", { ascending: sortOrder === "asc" });

      if (error) throw error;

      setTaxForms(data || []);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los formularios",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (form: TaxForm) => {
    setEditingForm(form);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!formToDelete) return;

    try {
      const { error } = await supabase
        .from("tab_tax_forms")
        .update({ is_active: false })
        .eq("id", formToDelete.id);

      if (error) throw error;

      toast({
        title: "Formulario eliminado",
        description: "El formulario fue eliminado correctamente",
      });

      fetchTaxForms();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "No se pudo eliminar el formulario",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setFormToDelete(null);
    }
  };

  const handleDownloadPdf = async (form: TaxForm) => {
    if (!form.file_path) return;

    try {
      const { data, error } = await supabase.storage
        .from("tax-forms")
        .download(form.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = form.file_name || "formulario.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "No se pudo descargar el archivo",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
    }).format(amount);
  };

  const filteredForms = taxForms.filter((form) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const periodText = formatPeriod(form).toLowerCase();
    return (
      form.form_number.toLowerCase().includes(query) ||
      form.payment_date.includes(query) ||
      format(new Date(form.payment_date), "dd/MM/yyyy").includes(query) ||
      (form.tax_type && form.tax_type.toLowerCase().includes(query)) ||
      periodText.includes(query)
    );
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredForms.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedForms = filteredForms.slice(startIndex, startIndex + itemsPerPage);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleDialogClose = (success?: boolean) => {
    setDialogOpen(false);
    setEditingForm(null);
    if (success) {
      fetchTaxForms();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!enterpriseId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Formularios de Impuestos</h1>
          <p className="text-muted-foreground">
            Gestiona los formularios de impuestos de tu empresa
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No hay empresa activa. Selecciona una empresa en el módulo de Empresas.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Formularios de Impuestos</h1>
        <p className="text-muted-foreground">
          Empresa: <span className="font-medium text-foreground">{enterpriseName}</span>
        </p>
      </div>

      {/* Barra de búsqueda y acciones */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número, fecha, tipo o período..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "desc" | "asc")}>
            <SelectTrigger className="w-full md:w-48">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Más reciente primero</SelectItem>
              <SelectItem value="asc">Más antiguo primero</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Formulario
        </Button>
      </div>

      {/* Lista de formularios */}
      {filteredForms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {searchQuery
                ? "No se encontraron formularios con ese criterio de búsqueda"
                : "No hay formularios registrados. Haz clic en 'Nuevo Formulario' para agregar uno."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4">
            {paginatedForms.map((form) => (
              <Card key={form.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="h-5 w-5 text-primary" />
                        <span className="font-semibold text-lg">
                          Formulario: {form.form_number}
                        </span>
                        {form.tax_type && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            {form.tax_type}
                          </span>
                        )}
                        {form.period_type && (
                          <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                            {formatPeriod(form)}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>Código de acceso: {form.access_code}</p>
                        <p>
                          Fecha de pago:{" "}
                          {format(new Date(form.payment_date), "dd 'de' MMMM 'de' yyyy", {
                            locale: es,
                          })}
                        </p>
                        {form.notes && (
                          <p className="text-xs italic">Notas: {form.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary">
                          {formatCurrency(form.amount_paid)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {form.file_path && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadPdf(form)}
                            title="Descargar PDF"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(form)}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setFormToDelete(form);
                            setDeleteDialogOpen(true);
                          }}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredForms.length)} de {filteredForms.length} formularios
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((page) => {
                      // Show first, last, current, and adjacent pages
                      return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                    })
                    .map((page, idx, arr) => (
                      <PaginationItem key={page}>
                        {idx > 0 && arr[idx - 1] !== page - 1 && (
                          <span className="px-2 text-muted-foreground">...</span>
                        )}
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      )}

      {/* Dialog para agregar/editar */}
      <TaxFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        enterpriseId={enterpriseId}
        editingForm={editingForm}
      />

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar formulario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el formulario {formToDelete?.form_number}. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}