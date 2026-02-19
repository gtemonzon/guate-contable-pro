import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAssetCategories, useUpsertAssetCategory, useDeleteAssetCategory, useEnterpriseAccounts, type FixedAssetCategory } from "@/hooks/useFixedAssets";
import { AccountCombobox } from "@/components/ui/account-combobox";
import { Plus, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react";

interface Props { enterpriseId: number; }

const EMPTY: Partial<FixedAssetCategory> = {
  code: "", name: "", default_useful_life_months: 60, default_residual_value: 0,
  asset_account_id: null, accumulated_depreciation_account_id: null,
  depreciation_expense_account_id: null, gain_loss_on_disposal_account_id: null,
  is_active: true,
};

export default function AssetCategoriesManager({ enterpriseId }: Props) {
  const { data: categories = [], isLoading } = useAssetCategories(enterpriseId);
  const upsert = useUpsertAssetCategory();
  const del = useDeleteAssetCategory();

  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<FixedAssetCategory>>(EMPTY);

  const openNew = () => { setForm(EMPTY); setOpen(true); };
  const openEdit = (cat: FixedAssetCategory) => { setForm(cat); setOpen(true); };

  const hasAllAccounts = !!(
    form.asset_account_id &&
    form.accumulated_depreciation_account_id &&
    form.depreciation_expense_account_id &&
    form.gain_loss_on_disposal_account_id
  );

  const save = () => {
    upsert.mutate({ ...form, enterprise_id: enterpriseId } as any, {
      onSuccess: () => setOpen(false),
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Categorías de Activos Fijos</CardTitle>
            <CardDescription>
              Define las categorías con su vida útil predeterminada y cuentas contables requeridas.
            </CardDescription>
          </div>
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nueva categoría
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground p-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Vida útil</TableHead>
                  <TableHead>Cuentas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No hay categorías. Crea la primera.
                    </TableCell>
                  </TableRow>
                )}
                {categories.map((cat) => {
                  const complete = !!(cat.asset_account_id && cat.accumulated_depreciation_account_id && cat.depreciation_expense_account_id && cat.gain_loss_on_disposal_account_id);
                  return (
                    <TableRow key={cat.id}>
                      <TableCell className="font-mono font-medium">{cat.code}</TableCell>
                      <TableCell>{cat.name}</TableCell>
                      <TableCell>{cat.default_useful_life_months} meses</TableCell>
                      <TableCell>
                        {complete ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">Completa</Badge>
                        ) : (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <AlertCircle className="h-3 w-3" /> Incompleta
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cat.is_active ? "default" : "secondary"}>
                          {cat.is_active ? "Activa" : "Inactiva"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(cat.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit / Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Código *</Label>
              <Input value={form.code || ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="VEH" />
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Vehículos" />
            </div>
            <div>
              <Label>Vida útil predeterminada (meses) *</Label>
              <Input type="number" min={1} value={form.default_useful_life_months || 60}
                onChange={(e) => setForm((f) => ({ ...f, default_useful_life_months: parseInt(e.target.value) }))} />
            </div>
            <div>
              <Label>Valor residual predeterminado (Q)</Label>
              <Input type="number" min={0} step="0.01" value={form.default_residual_value || 0}
                onChange={(e) => setForm((f) => ({ ...f, default_residual_value: parseFloat(e.target.value) }))} />
            </div>
          </div>

          <div className="space-y-3 mt-2">
            <p className="text-sm font-semibold text-foreground">Cuentas contables requeridas</p>
            <div className="grid grid-cols-1 gap-3">
              {[
                { label: "Cuenta del activo", key: "asset_account_id" as const },
                { label: "Depreciación acumulada", key: "accumulated_depreciation_account_id" as const },
                { label: "Gasto de depreciación", key: "depreciation_expense_account_id" as const },
                { label: "Ganancia / Pérdida en disposición", key: "gain_loss_on_disposal_account_id" as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <AccountCombobox
                    enterpriseId={enterpriseId}
                    value={form[key] ?? null}
                    onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                    placeholder="Seleccionar cuenta..."
                  />
                </div>
              ))}
            </div>
            {!hasAllAccounts && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                La categoría no se puede usar en activos activos hasta completar todas las cuentas.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!form.code || !form.name || upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { del.mutate({ id: deleteId!, enterprise_id: enterpriseId }); setDeleteId(null); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
