import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const userFormSchema = z.object({
  email: z.string().email("Email inválido"),
  full_name: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres").optional(),
  is_active: z.boolean(),
  is_admin: z.boolean(),
});

type UserFormData = z.infer<typeof userFormSchema>;

interface Enterprise {
  id: number;
  business_name: string;
}

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any | null;
  onClose: () => void;
}

const UserDialog = ({ open, onOpenChange, user, onClose }: UserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [selectedEnterprises, setSelectedEnterprises] = useState<number[]>([]);
  const isEditing = !!user;

  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      is_active: true,
      is_admin: false,
    },
  });

  useEffect(() => {
    if (open) {
      fetchEnterprises();
      if (user) {
        form.reset({
          email: user.email,
          full_name: user.full_name,
          password: "",
          is_active: user.is_active,
          is_admin: user.is_super_admin,
        });
        setSelectedEnterprises(
          user.enterprises?.map((e: any) => e.enterprise_id) || []
        );
      } else {
        form.reset({
          email: "",
          full_name: "",
          password: "",
          is_active: true,
          is_admin: false,
        });
        setSelectedEnterprises([]);
      }
    }
  }, [open, user]);

  const fetchEnterprises = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_enterprises")
        .select("id, business_name")
        .eq("is_active", true)
        .order("business_name");

      if (error) throw error;
      setEnterprises(data || []);
    } catch (error: any) {
      toast.error("Error al cargar empresas", {
        description: error.message,
      });
    }
  };

  const toggleEnterprise = (enterpriseId: number) => {
    setSelectedEnterprises((prev) =>
      prev.includes(enterpriseId)
        ? prev.filter((id) => id !== enterpriseId)
        : [...prev, enterpriseId]
    );
  };

  const onSubmit = async (data: UserFormData) => {
    try {
      setLoading(true);

      if (isEditing) {
        // Update existing user
        const { error: userError } = await supabase
          .from("tab_users")
          .update({
            full_name: data.full_name,
            is_active: data.is_active,
            is_super_admin: data.is_admin,
          })
          .eq("id", user.id);

        if (userError) throw userError;

        // Update enterprise assignments
        await supabase
          .from("tab_user_enterprises")
          .delete()
          .eq("user_id", user.id);

        if (selectedEnterprises.length > 0) {
          const enterpriseRelations = selectedEnterprises.map((enterpriseId) => ({
            user_id: user.id,
            enterprise_id: enterpriseId,
            role: data.is_admin ? "admin" : "usuario",
          }));

          const { error: entError } = await supabase
            .from("tab_user_enterprises")
            .insert(enterpriseRelations);

          if (entError) throw entError;
        }

        toast.success("Usuario actualizado correctamente");
      } else {
        // Create new user via auth
        if (!data.password) {
          toast.error("La contraseña es requerida para nuevos usuarios");
          return;
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            data: {
              full_name: data.full_name,
            },
          },
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("No se pudo crear el usuario");

        // The trigger will create the user in tab_users
        // Wait a bit for the trigger to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Update user info including admin status
        const { error: userError } = await supabase
          .from("tab_users")
          .update({
            is_active: data.is_active,
            is_super_admin: data.is_admin,
          })
          .eq("id", authData.user.id);

        if (userError) throw userError;

        // Add enterprise assignments
        if (selectedEnterprises.length > 0) {
          const enterpriseRelations = selectedEnterprises.map((enterpriseId) => ({
            user_id: authData.user.id,
            enterprise_id: enterpriseId,
            role: data.is_admin ? "admin" : "usuario",
          }));

          const { error: entError } = await supabase
            .from("tab_user_enterprises")
            .insert(enterpriseRelations);

          if (entError) throw entError;
        }

        toast.success("Usuario creado correctamente");
      }

      onClose();
    } catch (error: any) {
      toast.error("Error al guardar usuario", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Usuario" : "Crear Nuevo Usuario"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Actualiza la información del usuario y sus empresas asignadas"
              : "Crea un nuevo usuario y asigna las empresas correspondientes"}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">Información General</TabsTrigger>
            <TabsTrigger value="empresas">Empresas</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          disabled={isEditing}
                          placeholder="usuario@ejemplo.com"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre Completo</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Juan Pérez" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isEditing && (
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Mínimo 6 caracteres"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="is_admin"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Administrador
                        </FormLabel>
                        <FormDescription>
                          Los administradores pueden crear empresas y gestionar otros usuarios
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Usuario Activo</FormLabel>
                        <FormDescription>
                          Los usuarios inactivos no pueden acceder al sistema
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="empresas" className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Selecciona las empresas a las que tendrá acceso este usuario
              </p>
              {enterprises.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay empresas disponibles
                </p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {enterprises.map((enterprise) => (
                    <div
                      key={enterprise.id}
                      className="flex items-center space-x-2 rounded-lg border p-3"
                    >
                      <Checkbox
                        id={`enterprise-${enterprise.id}`}
                        checked={selectedEnterprises.includes(enterprise.id)}
                        onCheckedChange={() => toggleEnterprise(enterprise.id)}
                      />
                      <label
                        htmlFor={`enterprise-${enterprise.id}`}
                        className="flex-1 cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {enterprise.business_name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={form.handleSubmit(onSubmit)}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Actualizar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UserDialog;
