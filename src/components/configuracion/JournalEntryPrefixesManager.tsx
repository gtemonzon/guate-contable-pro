import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Plus, ToggleLeft, ToggleRight } from "lucide-react";

interface JournalEntryPrefix {
  id: number;
  code: string;
  name: string;
  prefix: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export function JournalEntryPrefixesManager() {
  const [prefixes, setPrefixes] = useState<JournalEntryPrefix[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrefix, setEditingPrefix] = useState<JournalEntryPrefix | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    prefix: "",
    description: ""
  });

  useEffect(() => {
    checkSuperAdmin();
    fetchPrefixes();
  }, []);

  const checkSuperAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("tab_users")
      .select("is_super_admin")
      .eq("id", user.id)
      .single();

    setIsSuperAdmin(data?.is_super_admin || false);
  };

  const fetchPrefixes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tab_journal_entry_prefixes")
      .select("*")
      .order("code");

    if (error) {
      toast.error("Error al cargar los prefijos");
    } else {
      setPrefixes(data || []);
    }
    setLoading(false);
  };

  const handleOpenDialog = (prefix?: JournalEntryPrefix) => {
    if (!isSuperAdmin) {
      toast.error("Solo los super administradores pueden modificar prefijos");
      return;
    }

    if (prefix) {
      setEditingPrefix(prefix);
      setFormData({
        code: prefix.code,
        name: prefix.name,
        prefix: prefix.prefix,
        description: prefix.description || ""
      });
    } else {
      setEditingPrefix(null);
      setFormData({ code: "", name: "", prefix: "", description: "" });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name || !formData.prefix) {
      toast.error("Por favor complete todos los campos requeridos");
      return;
    }

    if (formData.prefix.length > 10) {
      toast.error("El prefijo no puede tener más de 10 caracteres");
      return;
    }

    try {
      if (editingPrefix) {
        const { error } = await supabase
          .from("tab_journal_entry_prefixes")
          .update({
            name: formData.name,
            prefix: formData.prefix.toUpperCase(),
            description: formData.description || null
          })
          .eq("id", editingPrefix.id);

        if (error) throw error;
        toast.success("Prefijo actualizado correctamente");
      } else {
        // Check for duplicate code
        const existingCode = prefixes.find(p => p.code === formData.code.toUpperCase());
        if (existingCode) {
          toast.error("Ya existe un prefijo con ese código");
          return;
        }

        const { error } = await supabase
          .from("tab_journal_entry_prefixes")
          .insert({
            code: formData.code.toUpperCase(),
            name: formData.name,
            prefix: formData.prefix.toUpperCase(),
            description: formData.description || null
          });

        if (error) throw error;
        toast.success("Prefijo creado correctamente");
      }

      setDialogOpen(false);
      fetchPrefixes();
    } catch (error: any) {
      toast.error(error.message || "Error al guardar el prefijo");
    }
  };

  const handleToggleActive = async (prefix: JournalEntryPrefix) => {
    if (!isSuperAdmin) {
      toast.error("Solo los super administradores pueden modificar prefijos");
      return;
    }

    const { error } = await supabase
      .from("tab_journal_entry_prefixes")
      .update({ is_active: !prefix.is_active })
      .eq("id", prefix.id);

    if (error) {
      toast.error("Error al cambiar el estado");
    } else {
      toast.success(`Prefijo ${!prefix.is_active ? "activado" : "desactivado"}`);
      fetchPrefixes();
    }
  };

  if (loading) {
    return <div className="text-center py-4">Cargando...</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        Solo los super administradores pueden gestionar los prefijos de partidas.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Prefijo
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Prefijo</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prefixes.map((prefix) => (
            <TableRow key={prefix.id}>
              <TableCell className="font-medium">{prefix.code}</TableCell>
              <TableCell>{prefix.name}</TableCell>
              <TableCell className="font-mono font-bold">{prefix.prefix}</TableCell>
              <TableCell className="text-muted-foreground">{prefix.description}</TableCell>
              <TableCell>
                <span className={`px-2 py-1 rounded-full text-xs ${prefix.is_active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"}`}>
                  {prefix.is_active ? "Activo" : "Inactivo"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(prefix)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleToggleActive(prefix)}>
                    {prefix.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPrefix ? "Editar Prefijo" : "Nuevo Prefijo"}</DialogTitle>
            <DialogDescription>
              Configure el prefijo para identificar las partidas contables
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="Ej: SALES, PURCHASES"
                disabled={!!editingPrefix}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Ventas, Compras"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prefix">Prefijo *</Label>
              <Input
                id="prefix"
                value={formData.prefix}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value.toUpperCase() })}
                placeholder="Ej: VENT, COMP"
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground">
                Máximo 10 caracteres. El número de partida se generará como: {formData.prefix || "PREF"}-2025-001
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción del tipo de partida"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingPrefix ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
