import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit } from "lucide-react";
import { StatusActionButton, StatusBadge } from "@/components/ui/status-action-button";
import { getSafeErrorMessage } from "@/utils/errorMessages";

interface OperationType {
  id: number;
  enterprise_id: number | null;
  code: string;
  name: string;
  description: string | null;
  applies_to: "purchases" | "sales" | "both";
  is_active: boolean;
  is_system: boolean;
}

export function OperationTypesManager() {
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<OperationType | null>(null);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    applies_to: "both" as "purchases" | "sales" | "both",
  });

  const { toast } = useToast();

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchOperationTypes();
    } else {
      setLoading(false);
      toast({
        title: "Selecciona una empresa",
        description: "Debes seleccionar una empresa primero",
        variant: "destructive",
      });
    }

    const handleStorageChange = () => {
      const newEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setCurrentEnterpriseId(newEnterpriseId);
      if (newEnterpriseId) {
        fetchOperationTypes();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("enterpriseChanged", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("enterpriseChanged", handleStorageChange);
    };
  }, []);

  const fetchOperationTypes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tab_operation_types")
        .select("*")
        .order("is_system", { ascending: false })
        .order("code");

      if (error) throw error;
      setOperationTypes((data || []) as OperationType[]);
    } catch (error: any) {
      toast({
        title: "Error al cargar tipos de operación",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (type?: OperationType) => {
    if (type) {
      setEditingType(type);
      setFormData({
        code: type.code,
        name: type.name,
        description: type.description || "",
        applies_to: type.applies_to,
      });
    } else {
      setEditingType(null);
      setFormData({
        code: "",
        name: "",
        description: "",
        applies_to: "both",
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!currentEnterpriseId) {
      toast({
        title: "Error",
        description: "No hay empresa seleccionada",
        variant: "destructive",
      });
      return;
    }

    if (!formData.code || !formData.name) {
      toast({
        title: "Error",
        description: "El código y nombre son requeridos",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingType) {
        // Actualizar
        const { error } = await supabase
          .from("tab_operation_types")
          .update({
            name: formData.name,
            description: formData.description || null,
            applies_to: formData.applies_to,
          })
          .eq("id", editingType.id);

        if (error) throw error;

        toast({
          title: "Tipo actualizado",
          description: "El tipo de operación se actualizó correctamente",
        });
      } else {
        // Crear
        const { error } = await supabase
          .from("tab_operation_types")
          .insert({
            enterprise_id: parseInt(currentEnterpriseId),
            code: formData.code,
            name: formData.name,
            description: formData.description || null,
            applies_to: formData.applies_to,
            is_system: false,
          });

        if (error) throw error;

        toast({
          title: "Tipo creado",
          description: "El tipo de operación se creó correctamente",
        });
      }

      setDialogOpen(false);
      fetchOperationTypes();
    } catch (error: any) {
      toast({
        title: "Error al guardar",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (type: OperationType) => {
    try {
      const { error } = await supabase
        .from("tab_operation_types")
        .update({ is_active: !type.is_active })
        .eq("id", type.id);

      if (error) throw error;

      toast({
        title: type.is_active ? "Tipo desactivado" : "Tipo activado",
        description: `El tipo ${type.code} se ${type.is_active ? "desactivó" : "activó"} correctamente`,
      });

      fetchOperationTypes();
    } catch (error: any) {
      toast({
        title: "Error",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const getAppliesLabel = (applies: string) => {
    switch (applies) {
      case "purchases":
        return "Compras";
      case "sales":
        return "Ventas";
      case "both":
        return "Ambos";
      default:
        return applies;
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  if (!currentEnterpriseId) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Selecciona una empresa para gestionar tipos de operación
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Los tipos del sistema no pueden ser editados ni eliminados
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar Tipo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingType ? "Editar" : "Agregar"} Tipo de Operación
              </DialogTitle>
              <DialogDescription>
                {editingType
                  ? "Modifica los datos del tipo de operación"
                  : "Crea un nuevo tipo de operación personalizado"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  disabled={!!editingType}
                  placeholder="CODIGO"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Nombre descriptivo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Descripción opcional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="applies_to">Aplica a</Label>
                <Select
                  value={formData.applies_to}
                  onValueChange={(value: "purchases" | "sales" | "both") =>
                    setFormData({ ...formData, applies_to: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Ambos</SelectItem>
                    <SelectItem value="purchases">Compras</SelectItem>
                    <SelectItem value="sales">Ventas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Aplica a</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {operationTypes.map((type) => (
            <TableRow key={type.id}>
              <TableCell className="font-mono">{type.code}</TableCell>
              <TableCell>{type.name}</TableCell>
              <TableCell>{getAppliesLabel(type.applies_to)}</TableCell>
              <TableCell>
                <StatusBadge isActive={type.is_active} />
              </TableCell>
              <TableCell>
                {type.is_system ? (
                  <Badge variant="outline">Sistema</Badge>
                ) : (
                  <Badge variant="secondary">Personalizado</Badge>
                )}
              </TableCell>
              <TableCell className="text-right space-x-2">
                {!type.is_system && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenDialog(type)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
                <StatusActionButton
                  isActive={type.is_active}
                  onToggle={() => handleToggleActive(type)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
