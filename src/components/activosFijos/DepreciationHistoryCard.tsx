import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useDepreciationRuns } from "@/hooks/useDepreciationRuns";
import { History, Loader2 } from "lucide-react";

const MONTHS = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const FREQ: Record<string, string> = {
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
};

const fmt = (n: number) => n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DepreciationHistoryCard({ enterpriseId }: { enterpriseId: number | null }) {
  const { data: runs = [], isLoading } = useDepreciationRuns(enterpriseId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Historial de Depreciaciones
        </CardTitle>
        <CardDescription>
          Contabilizaciones de depreciación ejecutadas para esta empresa.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Cargando historial...
          </div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Aún no se ha contabilizado ninguna depreciación para esta empresa.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Frecuencia</TableHead>
                <TableHead className="text-center"># Activos</TableHead>
                <TableHead className="text-right">Monto total</TableHead>
                <TableHead>Fecha ejecución</TableHead>
                <TableHead className="font-mono text-xs">Run ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.run_id}>
                  <TableCell className="font-medium">
                    {run.month > 0 ? `${MONTHS[run.month]} ${run.year}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{FREQ[run.frequency] ?? run.frequency}</Badge>
                  </TableCell>
                  <TableCell className="text-center">{run.asset_count}</TableCell>
                  <TableCell className="text-right font-mono">
                    Q {fmt(run.total_amount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(run.executed_at).toLocaleString("es-GT")}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                    {run.run_id}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
