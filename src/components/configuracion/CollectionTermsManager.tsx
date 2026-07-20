import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";


interface Term {
  id: number;
  enterprise_id: number;
  days: number;
  is_default: boolean;
  sort_order: number;
}

export function CollectionTermsManager() {
  const enterpriseIdStr = typeof window !== "undefined" ? localStorage.getItem("currentEnterpriseId") : null;
  const enterpriseId = enterpriseIdStr ? parseInt(enterpriseIdStr) : null;
  const [items, setItems] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDays, setNewDays] = useState<string>("");

  const load = async () => {
    if (!enterpriseId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tab_collection_terms")
      .select("*")
      .eq("enterprise_id", enterpriseId)
      .order("days", { ascending: true });
    setItems((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [enterpriseId]);

  const addTerm = async (days: number) => {
    if (!enterpriseId || !days || days <= 0) return;
    const isFirst = items.length === 0;
    const { error } = await supabase.from("tab_collection_terms").insert({
      enterprise_id: enterpriseId,
      days,
      is_default: isFirst,
      sort_order: days,
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setNewDays("");
    await load();
  };

  const removeTerm = async (id: number) => {
    const { error } = await supabase.from("tab_collection_terms").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await load();
  };

  const markDefault = async (id: number) => {
    if (!enterpriseId) return;
    await supabase.from("tab_collection_terms").update({ is_default: false } as any).eq("enterprise_id", enterpriseId);
    await supabase.from("tab_collection_terms").update({ is_default: true } as any).eq("id", id);
    await load();
  };

  const createCommon = async () => {
    if (!enterpriseId) return;
    await supabase.from("tab_collection_terms").insert([
      { enterprise_id: enterpriseId, days: 30, is_default: true, sort_order: 30 },
      { enterprise_id: enterpriseId, days: 60, is_default: false, sort_order: 60 },
      { enterprise_id: enterpriseId, days: 90, is_default: false, sort_order: 90 },
    ] as any);
    await load();
  };

  if (!enterpriseId) {
    return <Card><CardContent className="p-6 text-center text-muted-foreground">Selecciona una empresa.</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plazos de Pago</CardTitle>
        <CardDescription>Configura los plazos disponibles (en días) y marca el plazo por defecto.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="rounded border border-dashed p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No hay plazos configurados.</p>
            <Button onClick={createCommon} variant="outline">Crear plazos comunes (30/60/90)</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Días</TableHead>
                <TableHead className="w-32 text-center">Por defecto</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.days} días</TableCell>
                  <TableCell className="text-center">
                    {t.is_default ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                        <Star className="h-3 w-3 fill-current" /> Por defecto
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => markDefault(t.id)}>Marcar</Button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => removeTerm(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex items-end gap-2 pt-2 border-t">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Agregar plazo (días)</label>
            <Input
              type="number"
              min={1}
              value={newDays}
              onChange={(e) => setNewDays(e.target.value)}
              placeholder="Ej. 45"
            />
          </div>
          <Button onClick={() => addTerm(Number(newDays))} disabled={!newDays || Number(newDays) <= 0}>
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
