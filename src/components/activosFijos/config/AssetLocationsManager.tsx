import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAssetLocations, useUpsertAssetLocation, useDeleteAssetLocation, type FixedAssetLocation } from "@/hooks/useFixedAssets";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface Props { enterpriseId: number; }
const EMPTY: Partial<FixedAssetLocation> = { code: "", name: "", description: "", is_active: true };

export default function AssetLocationsManager({ enterpriseId }: Props) {
  const { data: locations = [], isLoading } = useAssetLocations(enterpriseId);
  const upsert = useUpsertAssetLocation();
  const del = useDeleteAssetLocation();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<FixedAssetLocation>>(EMPTY);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Ubicaciones</CardTitle>
            <CardDescription>Catálogo de ubicaciones físicas donde se encuentran los activos.</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setForm(EMPTY); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nueva
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin ubicaciones</TableCell></TableRow>}
                {locations.map((loc) => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-mono">{loc.code}</TableCell>
                    <TableCell>{loc.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{loc.description}</TableCell>
                    <TableCell><Badge variant={loc.is_active ? "default" : "secondary"}>{loc.is_active ? "Activa" : "Inactiva"}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setForm(loc); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(loc.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Editar ubicación" : "Nueva ubicación"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código *</Label><Input value={form.code || ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>
              <div><Label>Nombre *</Label><Input value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            </div>
            <div><Label>Descripción</Label><Textarea value={form.description || ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => upsert.mutate({ ...form, enterprise_id: enterpriseId } as any, { onSuccess: () => setOpen(false) })} disabled={!form.code || !form.name || upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar ubicación?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { del.mutate({ id: deleteId!, enterprise_id: enterpriseId }); setDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
