import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useDepreciationSchedule, useAssetEventLog, type FixedAsset } from "@/hooks/useFixedAssets";
import { Loader2, Calendar, History } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DisposalWizard from "./DisposalWizard";

interface Props {
  asset: FixedAsset;
  open: boolean;
  onClose: () => void;
}

const fmt = (n: number) =>
  n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const STATUS_BADGE: Record<string, string> = {
  PLANNED: "secondary", POSTED: "default", SKIPPED: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planificado", POSTED: "Contabilizado", SKIPPED: "Omitido",
};

export default function AssetDetailDialog({ asset, open, onClose }: Props) {
  const { data: schedule = [], isLoading: schedLoading } = useDepreciationSchedule(asset.id);
  const { data: events = [], isLoading: eventsLoading } = useAssetEventLog(asset.id);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-muted-foreground">{asset.asset_code}</span>
            {asset.asset_name}
            <Badge variant={asset.status === "ACTIVE" ? "default" : "secondary"}>
              {{ DRAFT: "Borrador", ACTIVE: "Activo", DISPOSED: "Baja", SOLD: "Vendido" }[asset.status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="schedule">
              <Calendar className="h-4 w-4 mr-1" />
              Calendario
            </TabsTrigger>
            {asset.status === "ACTIVE" && (
              <TabsTrigger value="disposal">Baja / Venta</TabsTrigger>
            )}
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1" />
              Historial
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: "Costo de adquisición", value: `Q ${fmt(asset.acquisition_cost)}` },
                { label: "Valor residual", value: `Q ${fmt(asset.residual_value)}` },
                { label: "Monto depreciable", value: `Q ${fmt(asset.acquisition_cost - asset.residual_value)}` },
                { label: "Vida útil", value: `${asset.useful_life_months} meses` },
                { label: "Fecha adquisición", value: asset.acquisition_date },
                { label: "Fecha servicio", value: asset.in_service_date ?? "No definida" },
                { label: "Moneda", value: asset.currency },
                { label: "Centro de costo", value: asset.cost_center ?? "—" },
              ].map(({ label, value }) => (
                <Card key={label} className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="font-semibold">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {asset.notes && (
              <Card className="mt-4 bg-muted/20">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Notas</p>
                  <p className="text-sm">{asset.notes}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Schedule */}
          <TabsContent value="schedule" className="mt-4">
            {schedLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground p-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando calendario...
              </div>
            ) : schedule.length === 0 ? (
              <div className="text-center text-muted-foreground py-10 border border-dashed rounded-lg">
                {asset.status === "DRAFT"
                  ? "Activa el activo para generar el calendario de depreciación."
                  : "Sin calendario de depreciación."}
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-right">Depreciación</TableHead>
                      <TableHead className="text-right">Acumulada</TableHead>
                      <TableHead className="text-right">Valor neto</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedule.map((row) => (
                      <TableRow key={row.id} className={row.status === "POSTED" ? "bg-green-50/50 dark:bg-green-950/20" : ""}>
                        <TableCell className="font-mono text-sm">
                          {MONTH_NAMES[row.month]} {row.year}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(row.planned_depreciation_amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(row.accumulated_depreciation)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(row.net_book_value)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[row.status] as any} className="text-xs">
                            {STATUS_LABEL[row.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Disposal */}
          {asset.status === "ACTIVE" && (
            <TabsContent value="disposal" className="mt-4">
              <DisposalWizard asset={asset} onDone={onClose} />
            </TabsContent>
          )}

          {/* History / Event log */}
          <TabsContent value="history" className="mt-4">
            {eventsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground p-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando historial...
              </div>
            ) : events.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">Sin eventos registrados.</div>
            ) : (
              <ol className="relative border-l border-border ml-4 space-y-6">
                {events.map((ev) => (
                  <li key={ev.id} className="ml-6">
                    <span className="absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full bg-primary/20 border border-primary ring-2 ring-background" />
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">{ev.event_type}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(ev.created_at).toLocaleString("es-GT")}
                      </span>
                    </div>
                    {ev.metadata_json && (
                      <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">
                        {JSON.stringify(ev.metadata_json, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
