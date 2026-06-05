import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Eye, FileSpreadsheet, FileText } from "lucide-react";
import {
  useTaxCertificates,
  useDeleteCertificate,
  DOCUMENT_TYPE_LABELS,
  DIRECTION_LABELS,
  type CertificateFilters,
  type TaxCertificate,
  type CertificateDocumentType,
  type CertificateDirection,
} from "@/hooks/useTaxCertificates";
import { CertificateFormPanel } from "@/components/retenciones/CertificateFormPanel";
import { useToast } from "@/hooks/use-toast";
import { exportCertificatesToExcel, exportCertificatesToPdf } from "@/components/retenciones/certificateExport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReconciliationPanel } from "@/components/retenciones/ReconciliationPanel";

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function getDefaultPeriod() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { month: prev.getMonth() + 1, year: prev.getFullYear() };
}

function formatQ(n: number) {
  return new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(n || 0);
}

export default function RetencionesExenciones() {
  const def = getDefaultPeriod();
  const { toast } = useToast();
  const [filters, setFilters] = useState<CertificateFilters>({
    month: def.month,
    year: def.year,
    document_type: "all",
    direction: "all",
  });
  const [editing, setEditing] = useState<TaxCertificate | null>(null);
  const [open, setOpen] = useState(false);

  const { data: certificates = [], isLoading } = useTaxCertificates(filters);
  const del = useDeleteCertificate();

  const summary = useMemo(() => {
    const s = {
      isr_receivable: 0,
      isr_payable: 0,
      vat_receivable: 0,
      vat_payable: 0,
      vat_exempt_purchases: 0,
      vat_exempt_sales: 0,
    };
    for (const c of certificates) {
      if (c.status === "void") continue;
      if (c.document_type === "isr_retention") {
        if (c.direction === "received") s.isr_receivable += Number(c.tax_amount);
        else s.isr_payable += Number(c.tax_amount);
      } else if (c.document_type === "vat_retention") {
        if (c.direction === "received") s.vat_receivable += Number(c.tax_amount);
        else s.vat_payable += Number(c.tax_amount);
      } else if (c.document_type === "vat_exemption") {
        if (c.direction === "received") s.vat_exempt_purchases += Number(c.base_amount);
        else s.vat_exempt_sales += Number(c.base_amount);
      }
    }
    return s;
  }, [certificates]);

  const cards = [
    { label: "ISR Retenido por Cobrar", value: summary.isr_receivable, tone: "text-emerald-600" },
    { label: "ISR Retenido por Pagar", value: summary.isr_payable, tone: "text-amber-600" },
    { label: "IVA Retenido por Cobrar", value: summary.vat_receivable, tone: "text-emerald-600" },
    { label: "IVA Retenido por Pagar", value: summary.vat_payable, tone: "text-amber-600" },
    { label: "Compras Exentas IVA", value: summary.vat_exempt_purchases, tone: "text-blue-600" },
    { label: "Ventas Exentas IVA", value: summary.vat_exempt_sales, tone: "text-blue-600" },
  ];

  const handleEdit = (c: TaxCertificate) => {
    setEditing(c);
    setOpen(true);
  };
  const handleNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const handleDelete = async (c: TaxCertificate) => {
    if (c.status !== "draft") {
      toast({ title: "No permitido", description: "Solo se pueden eliminar borradores.", variant: "destructive" });
      return;
    }
    if (!confirm(`¿Eliminar constancia ${c.document_number}?`)) return;
    try {
      await del.mutateAsync(c.id);
      toast({ title: "Eliminado" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Retenciones y Exenciones</h1>
          <p className="text-muted-foreground">
            Gestión de constancias de retención de ISR/IVA y exenciones de IVA, emitidas y recibidas.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" /> Nuevo</Button>
          <Button variant="outline" onClick={() => exportCertificatesToExcel(certificates)} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={() => exportCertificatesToPdf(certificates)} className="gap-2">
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div>
            <Label className="text-xs">Mes</Label>
            <Select
              value={filters.month ? String(filters.month) : "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, month: v === "all" ? null : Number(v) }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Año</Label>
            <Input
              type="number"
              value={filters.year ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value ? Number(e.target.value) : null }))}
            />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select
              value={filters.document_type ?? "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, document_type: v as CertificateDocumentType | "all" }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="isr_retention">Retención ISR</SelectItem>
                <SelectItem value="vat_retention">Retención IVA</SelectItem>
                <SelectItem value="vat_exemption">Exención IVA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Dirección</Label>
            <Select
              value={filters.direction ?? "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, direction: v as CertificateDirection | "all" }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="issued">Emitidas</SelectItem>
                <SelectItem value="received">Recibidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">NIT</Label>
            <Input value={filters.nit ?? ""} onChange={(e) => setFilters((f) => ({ ...f, nit: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Nombre</Label>
            <Input value={filters.name ?? ""} onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">No. Documento</Label>
            <Input value={filters.document_number ?? ""} onChange={(e) => setFilters((f) => ({ ...f, document_number: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-lg font-semibold ${c.tone}`}>{formatQ(c.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Grid */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>No. Documento</TableHead>
                <TableHead>NIT</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Impuesto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
              ) : certificates.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Sin constancias para los filtros seleccionados</TableCell></TableRow>
              ) : certificates.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.issue_date}</TableCell>
                  <TableCell>{DOCUMENT_TYPE_LABELS[c.document_type]}</TableCell>
                  <TableCell>{DIRECTION_LABELS[c.direction]}</TableCell>
                  <TableCell className="font-mono text-xs">{c.document_number}</TableCell>
                  <TableCell className="font-mono text-xs">{c.counterpart_nit}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{c.counterpart_name}</TableCell>
                  <TableCell className="text-right">{formatQ(Number(c.base_amount))}</TableCell>
                  <TableCell className="text-right font-medium">{formatQ(Number(c.tax_amount))}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "posted" ? "default" : c.status === "void" ? "destructive" : "secondary"}>
                      {c.status === "draft" ? "Borrador" : c.status === "posted" ? "Contabilizada" : "Anulada"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => handleEdit(c)}><Eye className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => handleEdit(c)} disabled={c.status === "posted"}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(c)} disabled={c.status !== "draft"}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CertificateFormPanel
        open={open}
        onOpenChange={setOpen}
        certificate={editing}
      />
    </div>
  );
}
