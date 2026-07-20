import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, ShieldAlert } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface TrackingRow {
  id: number;
  issue_date: string;
  due_date: string;
  amount_total: number;
  amount_paid: number;
  status: "pendiente" | "parcial" | "pagada";
}

const STATUS_STYLES: Record<TrackingRow["status"], string> = {
  pendiente: "bg-amber-100 text-amber-800 border-amber-200",
  parcial: "bg-blue-100 text-blue-800 border-blue-200",
  pagada: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const STATUS_LABEL: Record<TrackingRow["status"], string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagada: "Pagada",
};

interface Props {
  direction: "cxc" | "cxp";
  title: string;
}

export default function CollectionTrackingPage({ direction, title }: Props) {
  const { selectedEnterprise } = useEnterprise();
  const { hasModule, isLoading: tenantLoading } = useTenant();
  const [rows, setRows] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(false);

  const moduleEnabled = hasModule(direction);

  useEffect(() => {
    if (!currentEnterprise || !moduleEnabled) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tab_collection_tracking")
        .select("id,issue_date,due_date,amount_total,amount_paid,status")
        .eq("enterprise_id", currentEnterprise.id)
        .eq("direction", direction)
        .order("due_date", { ascending: true });
      if (cancelled) return;
      if (!error) setRows((data || []) as TrackingRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentEnterprise, direction, moduleEnabled]);

  const totals = useMemo(() => {
    const pending = rows.reduce((s, r) => s + (Number(r.amount_total) - Number(r.amount_paid)), 0);
    return { count: rows.length, pending };
  }, [rows]);

  if (tenantLoading) return null;

  if (!moduleEnabled) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Módulo no habilitado</AlertTitle>
          <AlertDescription>
            El módulo de {title} no está activo para esta oficina. Contacta a tu administrador.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground text-sm">
          {currentEnterprise?.enterprise_name}
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Módulo en construcción</AlertTitle>
        <AlertDescription>
          La infraestructura de seguimiento automático ya está activa. Cada factura nueva
          registrada en el libro de {direction === "cxc" ? "ventas" : "compras"} generará
          automáticamente su seguimiento. El registro de abonos y la configuración avanzada
          llegarán en la próxima fase.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Facturas en seguimiento ({totals.count}) · Saldo pendiente {formatCurrency(totals.pending)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Monto total</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Aún no hay facturas en seguimiento para esta empresa.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => {
                    const balance = Number(r.amount_total) - Number(r.amount_paid);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.issue_date}</TableCell>
                        <TableCell>{r.due_date}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(r.amount_total))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(balance)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLES[r.status]}>
                            {STATUS_LABEL[r.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
