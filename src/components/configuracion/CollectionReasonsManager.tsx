import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";


interface Reason {
  id: number;
  enterprise_id: number;
  reason_text: string;
  direction: "cxc" | "cxp" | "both";
  is_active: boolean;
}

const DIR_LABEL: Record<string, string> = { cxc: "Solo CxC", cxp: "Solo CxP", both: "Ambos" };

export function CollectionReasonsManager() {
  const enterpriseIdStr = typeof window !== "undefined" ? localStorage.getItem("currentEnterpriseId") : null;
  const enterpriseId = enterpriseIdStr ? parseInt(enterpriseIdStr) : null;
  const [items, setItems] = useState<Reason[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [newDir, setNewDir] = useState<"cxc" | "cxp" | "both">("both");

  const load = async () => {
    if (!enterpriseId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tab_collection_reasons")
      .select("*")
      .eq("enterprise_id", enterpriseId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    setItems((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [enterpriseId]);

  const add = async () => {
    if (!enterpriseId || !newText.trim()) return;
    const { error } = await supabase.from("tab_collection_reasons").insert({
      enterprise_id: enterpriseId,
      reason_text: newText.trim(),
      direction: newDir,
      is_active: true,
      sort_order: items.length,
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setNewText("");
    setNewDir("both");
    await load();
  };

  const toggle = async (id: number, next: boolean) => {
    await supabase.from("tab_collection_reasons").update({ is_active: next } as any).eq("id", id);
    await load();
  };

  const remove = async (id: number) => {
    await supabase.from("tab_collection_reasons").delete().eq("id", id);
    await load();
  };

  if (!enterpriseId) {
    return <Card><CardContent className="p-6 text-center text-muted-foreground">Selecciona una empresa.</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Motivos de Cambio de Estatus</CardTitle>
        <CardDescription>Motivos predefinidos que aparecen al cambiar el estatus de una factura manualmente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin motivos configurados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motivo</TableHead>
                <TableHead className="w-28">Aplica a</TableHead>
                <TableHead className="w-24 text-center">Activo</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.reason_text}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{DIR_LABEL[r.direction]}</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.is_active} onCheckedChange={(v) => toggle(r.id, v)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
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
            <label className="text-xs text-muted-foreground">Motivo</label>
            <Input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Ej. Reclamo del cliente" />
          </div>
          <div className="w-40">
            <label className="text-xs text-muted-foreground">Aplica a</label>
            <Select value={newDir} onValueChange={(v) => setNewDir(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Ambos</SelectItem>
                <SelectItem value="cxc">Solo CxC</SelectItem>
                <SelectItem value="cxp">Solo CxP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={!newText.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
