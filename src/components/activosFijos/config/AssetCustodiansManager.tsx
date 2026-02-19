import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAssetCustodians, useUpsertAssetCustodian, useDeleteAssetCustodian, type FixedAssetCustodian } from "@/hooks/useFixedAssets";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface Props { enterpriseId: number; }
const EMPTY: Partial<FixedAssetCustodian> = { name: "", identifier: "", contact: "", notes: "", is_active: true };

export default function AssetCustodiansManager({ enterpriseId }: Props) {
  const { data: items = [], isLoading } = useAssetCustodians(enterpriseId);
  const upsert = useUpsertAssetCustodian();
  const del = useDeleteAssetCustodian();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<FixedAssetCustodian>>(EMPTY);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Custodios</CardTitle>
            <CardDescription>Personas o departamentos responsables de los activos.</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setForm(EMPTY); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Identificador</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin custodios</TableCell></TableRow>}
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.identifier || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.contact || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setForm(item); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle>{form.id ? "Editar custodio" : "Nuevo custodio"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre *</Label><Input value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Identificador (opcional)</Label><Input value={form.identifier || ""} onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))} placeholder="Cédula, código empleado..." /></div>
            <div><Label>Contacto (opcional)</Label><Input value={form.contact || ""} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} placeholder="Email o teléfono" /></div>
            <div><Label>Notas</Label><Textarea value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => upsert.mutate({ ...form, enterprise_id: enterpriseId } as any, { onSuccess: () => setOpen(false) })} disabled={!form.name || upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar custodio?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { del.mutate({ id: deleteId!, enterprise_id: enterpriseId }); setDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
