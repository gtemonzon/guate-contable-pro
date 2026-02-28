import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus } from "lucide-react";
import { StatusActionButton, StatusBadge } from "@/components/ui/status-action-button";
import { toast } from "sonner";

interface FelDocumentType {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  applies_vat: boolean;
  affects_total: number;
  created_at: string;
}

export function FelDocumentTypesManager() {
  const [documentTypes, setDocumentTypes] = useState<FelDocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<FelDocumentType | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    applies_vat: true,
    affects_total: 1 as 1 | -1,
  });

  useEffect(() => {
    checkSuperAdmin();
    fetchDocumentTypes();
  }, []);

  const checkSuperAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsSuperAdmin(false);
      return;
    }

    const { data, error } = await supabase
      .from("tab_users")
      .select("is_super_admin")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Error checking super admin status:", error);
      setIsSuperAdmin(false);
      return;
    }

    setIsSuperAdmin(data?.is_super_admin || false);
  };

  const fetchDocumentTypes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tab_fel_document_types")
      .select("*")
      .order("code", { ascending: true });

    if (error) {
      console.error("Error fetching document types:", error);
      toast.error("Error al cargar tipos de documentos");
    } else {
      setDocumentTypes(data || []);
    }
    setLoading(false);
  };

  const handleOpenDialog = (type?: FelDocumentType) => {
    if (!isSuperAdmin) {
      toast.error("Solo los super administradores pueden gestionar tipos de documentos FEL");
      return;
    }

    if (type) {
      setEditingType(type);
      setFormData({
        code: type.code,
        name: type.name,
        applies_vat: type.applies_vat,
        affects_total: type.affects_total as 1 | -1,
      });
    } else {
      setEditingType(null);
      setFormData({
        code: "",
        name: "",
        applies_vat: true,
        affects_total: 1,
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error("Código y nombre son obligatorios");
      return;
    }

    const codeUpper = formData.code.trim().toUpperCase();

    // Verificar código duplicado
    const existingType = documentTypes.find(
      (dt) => dt.code === codeUpper && dt.id !== editingType?.id
    );
    if (existingType) {
      toast.error("Ya existe un tipo de documento con este código");
      return;
    }

    try {
      if (editingType) {
        // Actualizar
        const { error } = await supabase
          .from("tab_fel_document_types")
          .update({
            name: formData.name.trim(),
            applies_vat: formData.applies_vat,
            affects_total: formData.affects_total,
          })
          .eq("id", editingType.id);

        if (error) throw error;
        toast.success("Tipo de documento actualizado correctamente");
      } else {
        // Crear nuevo
        const { error } = await supabase
          .from("tab_fel_document_types")
          .insert({
            code: codeUpper,
            name: formData.name.trim(),
            applies_vat: formData.applies_vat,
            affects_total: formData.affects_total,
            is_active: true,
          });

        if (error) throw error;
        toast.success("Tipo de documento creado correctamente");
      }

      setDialogOpen(false);
      fetchDocumentTypes();
    } catch (error) {
      console.error("Error saving document type:", error);
      toast.error("Error al guardar tipo de documento");
    }
  };

  const handleToggleActive = async (type: FelDocumentType) => {
    if (!isSuperAdmin) {
      toast.error("Solo los super administradores pueden modificar tipos de documentos");
      return;
    }

    const { error } = await supabase
      .from("tab_fel_document_types")
      .update({ is_active: !type.is_active })
      .eq("id", type.id);

    if (error) {
      console.error("Error toggling active status:", error);
      toast.error("Error al cambiar estado");
    } else {
      toast.success(`Tipo de documento ${!type.is_active ? "activado" : "desactivado"}`);
      fetchDocumentTypes();
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando tipos de documentos...</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Solo los super administradores pueden gestionar tipos de documentos FEL
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {documentTypes.length} tipo{documentTypes.length !== 1 ? "s" : ""} de documento{documentTypes.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Agregar Tipo
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>IVA</TableHead>
              <TableHead>Efecto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documentTypes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No hay tipos de documentos registrados
                </TableCell>
              </TableRow>
            ) : (
              documentTypes.map((type) => (
                <TableRow key={type.id}>
                  <TableCell className="font-mono font-semibold">{type.code}</TableCell>
                  <TableCell>{type.name}</TableCell>
                  <TableCell>
                    <Badge variant={type.applies_vat ? "default" : "secondary"}>
                      {type.applies_vat ? "Aplica IVA" : "Sin IVA"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={type.affects_total === 1 ? "default" : "destructive"}>
                      {type.affects_total === 1 ? "Suma (+)" : "Resta (-)"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge isActive={type.is_active} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(type)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <StatusActionButton
                        isActive={type.is_active}
                        onToggle={() => handleToggleActive(type)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingType ? "Editar" : "Agregar"} Tipo de Documento FEL
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? "Modifica los datos del tipo de documento"
                : "Completa los datos del nuevo tipo de documento FEL"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="code">Código *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) =>
                  setFormData({ ...formData, code: e.target.value.toUpperCase() })
                }
                placeholder="FACT, FCAM, NCRE..."
                maxLength={10}
                disabled={!!editingType}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Código único del documento (máx. 10 caracteres)
              </p>
            </div>

            <div>
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Factura, Nota de Crédito..."
                maxLength={100}
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="applies_vat">Aplica IVA</Label>
                <p className="text-xs text-muted-foreground">
                  Indica si este tipo de documento debe incluir cálculo de IVA
                </p>
              </div>
              <Switch
                id="applies_vat"
                checked={formData.applies_vat}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, applies_vat: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="affects_total">Efecto en totales</Label>
                <p className="text-xs text-muted-foreground">
                  {formData.affects_total === 1 
                    ? "Este documento SUMA a los totales (Ej: Facturas)" 
                    : "Este documento RESTA a los totales (Ej: Notas de Crédito)"}
                </p>
              </div>
              <Switch
                id="affects_total"
                checked={formData.affects_total === 1}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, affects_total: checked ? 1 : -1 })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingType ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
