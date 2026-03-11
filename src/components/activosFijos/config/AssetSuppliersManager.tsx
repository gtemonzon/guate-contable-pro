import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAssetSuppliers, useUpsertAssetSupplier, useDeleteAssetSupplier, type FixedAssetSupplier } from "@/hooks/useFixedAssets";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { NitAutocomplete } from "@/components/ui/nit-autocomplete";

interface Props { enterpriseId: number; }
const EMPTY: Partial<FixedAssetSupplier> = { name: "", tax_id: "", address: "", email: "", phone: "", is_active: true };

export default function AssetSuppliersManager({ enterpriseId }: Props) {
  const { data: items = [], isLoading } = useAssetSuppliers(enterpriseId);
  const upsert = useUpsertAssetSupplier();
  const del = useDeleteAssetSupplier();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<FixedAssetSupplier>>(EMPTY);
  

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Proveedores de Activos</CardTitle>
            <CardDescription>Catálogo de proveedores para la adquisición de activos fijos.</CardDescription>
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
                  <TableHead>NIT</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin proveedores</TableCell></TableRow>}
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="font-mono text-sm">{item.tax_id || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.phone || "—"}</TableCell>
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
          <DialogHeader><DialogTitle>{form.id ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre *</Label><Input value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>NIT</Label><NitAutocomplete value={form.tax_id || ""} onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))} onSelectTaxpayer={(nit, name) => {
              setForm((f) => ({ ...f, tax_id: nit, name }));
            }} /></div>
            <div><Label>Dirección</Label><Input value={form.address || ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input value={form.email || ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Teléfono</Label><Input value={form.phone || ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            </div>
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
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { del.mutate({ id: deleteId!, enterprise_id: enterpriseId }); setDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
