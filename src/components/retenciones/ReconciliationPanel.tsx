import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCertificateReconciliation } from "@/hooks/useCertificateReconciliation";
import { useEnterprise } from "@/contexts/EnterpriseContext";

function formatQ(n: number) {
  return new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(n || 0);
}

interface Props {
  month: number | null;
  year: number | null;
}

export function ReconciliationPanel({ month, year }: Props) {
  const { selectedEnterpriseId } = useEnterprise();
  const { data, isLoading } = useCertificateReconciliation(selectedEnterpriseId, month, year);

  if (!month || !year) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Selecciona mes y año para conciliar constancias contra libros.
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">Cargando conciliación...</CardContent>
      </Card>
    );
  }

  const issuedRows = [
    { label: "Base de compras del período", a: data.purchasesNet, b: null as number | null, hint: "Referencia para ISR/IVA emitidos" },
    { label: "ISR retenido a proveedores (emitido)", a: data.isrIssuedToSuppliers, b: null, hint: "" },
    { label: "IVA retenido a proveedores (emitido)", a: data.vatIssuedToSuppliers, b: data.purchasesVat, hint: "vs IVA libro compras" },
    { label: "Exenciones IVA emitidas (base)", a: data.vatExemptionsIssued, b: null, hint: "" },
  ];

  const receivedRows = [
    { label: "Base de ventas del período", a: data.salesNet, b: null as number | null, hint: "Referencia para retenciones recibidas" },
    { label: "ISR retenido por clientes (recibido)", a: data.isrReceivedFromCustomers, b: null, hint: "Crédito en SAT-1311" },
    { label: "IVA retenido por clientes (recibido)", a: data.vatReceivedFromCustomers, b: data.salesVat, hint: "vs IVA libro ventas" },
    { label: "Exenciones IVA recibidas (base)", a: data.vatExemptionsReceived, b: null, hint: "" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Emitidas vs Libro de Compras</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead className="text-right">Constancias</TableHead><TableHead className="text-right">Libro</TableHead></TableRow></TableHeader>
              <TableBody>
                {issuedRows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell>
                      <div>{r.label}</div>
                      {r.hint && <div className="text-xs text-muted-foreground">{r.hint}</div>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatQ(r.a)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.b !== null ? formatQ(r.b) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recibidas vs Libro de Ventas</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead className="text-right">Constancias</TableHead><TableHead className="text-right">Libro</TableHead></TableRow></TableHeader>
              <TableBody>
                {receivedRows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell>
                      <div>{r.label}</div>
                      {r.hint && <div className="text-xs text-muted-foreground">{r.hint}</div>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatQ(r.a)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.b !== null ? formatQ(r.b) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Por proveedor (emitidas)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>NIT</TableHead><TableHead>Nombre</TableHead>
              <TableHead className="text-right">Base compras</TableHead>
              <TableHead className="text-right">IVA libro</TableHead>
              <TableHead className="text-right">ISR cert.</TableHead>
              <TableHead className="text-right">IVA cert.</TableHead>
              <TableHead className="text-right">Exención cert.</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.bySupplier.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin constancias emitidas en el período</TableCell></TableRow>
              ) : data.bySupplier.map((r) => (
                <TableRow key={r.nit}>
                  <TableCell className="font-mono text-xs">{r.nit}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{r.name}</TableCell>
                  <TableCell className="text-right">{formatQ(r.ledgerBase)}</TableCell>
                  <TableCell className="text-right">{formatQ(r.ledgerVat)}</TableCell>
                  <TableCell className="text-right">{formatQ(r.certIsr)}</TableCell>
                  <TableCell className="text-right">{formatQ(r.certVat)}</TableCell>
                  <TableCell className="text-right">{formatQ(r.certExemptBase)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Por cliente (recibidas)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>NIT</TableHead><TableHead>Nombre</TableHead>
              <TableHead className="text-right">Base ventas</TableHead>
              <TableHead className="text-right">IVA libro</TableHead>
              <TableHead className="text-right">ISR cert.</TableHead>
              <TableHead className="text-right">IVA cert.</TableHead>
              <TableHead className="text-right">Exención cert.</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.byCustomer.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin constancias recibidas en el período</TableCell></TableRow>
              ) : data.byCustomer.map((r) => (
                <TableRow key={r.nit}>
                  <TableCell className="font-mono text-xs">{r.nit}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{r.name}</TableCell>
                  <TableCell className="text-right">{formatQ(r.ledgerBase)}</TableCell>
                  <TableCell className="text-right">{formatQ(r.ledgerVat)}</TableCell>
                  <TableCell className="text-right">{formatQ(r.certIsr)}</TableCell>
                  <TableCell className="text-right">{formatQ(r.certVat)}</TableCell>
                  <TableCell className="text-right">{formatQ(r.certExemptBase)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
