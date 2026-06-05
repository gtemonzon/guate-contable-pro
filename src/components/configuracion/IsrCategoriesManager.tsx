import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { REGIME_LABELS, type IsrRegime, type IsrCategory } from "@/hooks/useTaxCertificates";

const empty = (): Omit<IsrCategory, "id"> => ({
  name: "",
  description: null,
  regime: "actividades_lucrativas",
  default_percentage: 0,
  is_active: true,
  display_order: 0,
});

export function IsrCategoriesManager() {
  const { toast } = useToast();
  const { isSuperAdmin } = useTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IsrCategory | null>(null);
  const [form, setForm] = useState<Omit<IsrCategory, "id">>(empty());

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["isr_categories_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tab_isr_income_categories" as never)
        .select("*")
        .order("regime")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as IsrCategory[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      if (editing) {
        const { error } = await sb.from("tab_isr_income_categories").update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("tab_isr_income_categories").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["isr_categories_admin"] });
      qc.invalidateQueries({ queryKey: ["isr_income_categories"] });
      toast({ title: "Categoría guardada" });
      setOpen(false);
    },
    onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("tab_isr_income_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["isr_categories_admin"] });
      qc.invalidateQueries({ queryKey: ["isr_income_categories"] });
      toast({ title: "Categoría eliminada" });
    },
    onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
  });

  const handleNew = () => {
    setEditing(null);
    setForm(empty());
    setOpen(true);
  };
  const handleEdit = (c: IsrCategory) => {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description,
      regime: c.regime,
      default_percentage: c.default_percentage,
      is_active: c.is_active,
      display_order: c.display_order,
    });
    setOpen(true);
  };

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            Solo super administradores pueden gestionar el catálogo global de categorías ISR.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Categorías de Renta ISR (Global)</CardTitle>
          <CardDescription>
            Catálogo global usado para clasificar las constancias de retención de ISR según el régimen tributario.
          </CardDescription>
        </div>
        <Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" /> Nueva</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Régimen</TableHead>
              <TableHead className="text-right">% Default</TableHead>
              <TableHead className="text-center">Orden</TableHead>
              <TableHead className="text-center">Activa</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : categories.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin categorías</TableCell></TableRow>
            ) : categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{REGIME_LABELS[c.regime]}</TableCell>
                <TableCell className="text-right">{Number(c.default_percentage).toFixed(2)}%</TableCell>
                <TableCell className="text-center">{c.display_order}</TableCell>
                <TableCell className="text-center">{c.is_active ? "Sí" : "No"}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => {
                    if (confirm(`¿Eliminar categoría "${c.name}"?`)) del.mutate(c.id);
                  }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Categoría" : "Nueva Categoría"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Régimen</Label>
                <Select value={form.regime} onValueChange={(v) => setForm((f) => ({ ...f, regime: v as IsrRegime }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(REGIME_LABELS) as IsrRegime[]).map((r) => (
                      <SelectItem key={r} value={r}>{REGIME_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>% Default</Label>
                <Input type="number" step="0.01" value={form.default_percentage}
                  onChange={(e) => setForm((f) => ({ ...f, default_percentage: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Orden de visualización</Label>
                <Input type="number" value={form.display_order}
                  onChange={(e) => setForm((f) => ({ ...f, display_order: Number(e.target.value) }))} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                <Label>Activa</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name}>
              {save.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
