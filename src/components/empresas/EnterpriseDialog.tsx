import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { Database } from "@/integrations/supabase/types";

type Enterprise = Database['public']['Tables']['tab_enterprises']['Row'];

const formSchema = z.object({
  nit: z.string().min(1, "NIT es requerido"),
  business_name: z.string().min(1, "Razón social es requerida"),
  trade_name: z.string().optional(),
  tax_regime: z.enum([
    "pequeño_contribuyente",
    "contribuyente_general",
    "profesional_liberal",
    "exenta_ong",
  ]),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  base_currency_code: z.string().default("GTQ"),
  is_active: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface EnterpriseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterprise: Enterprise | null;
  onSuccess: () => void;
}

export function EnterpriseDialog({
  open,
  onOpenChange,
  enterprise,
  onSuccess,
}: EnterpriseDialogProps) {
  const { toast } = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nit: "",
      business_name: "",
      trade_name: "",
      tax_regime: "contribuyente_general",
      address: "",
      phone: "",
      email: "",
      base_currency_code: "GTQ",
      is_active: true,
    },
  });

  useEffect(() => {
    if (enterprise) {
      form.reset({
        nit: enterprise.nit,
        business_name: enterprise.business_name,
        trade_name: enterprise.trade_name || "",
        tax_regime: enterprise.tax_regime as any,
        address: enterprise.address || "",
        phone: enterprise.phone || "",
        email: enterprise.email || "",
        base_currency_code: enterprise.base_currency_code || "GTQ",
        is_active: enterprise.is_active ?? true,
      });
    } else {
      form.reset({
        nit: "",
        business_name: "",
        trade_name: "",
        tax_regime: "contribuyente_general",
        address: "",
        phone: "",
        email: "",
        base_currency_code: "GTQ",
        is_active: true,
      });
    }
  }, [enterprise, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      // Verify session and user
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log("=== AUTH DEBUG ===");
      console.log("Session:", session);
      console.log("User:", session?.user);
      console.log("Access token exists:", !!session?.access_token);
      console.log("User ID:", session?.user?.id);
      console.log("User email:", session?.user?.email);
      console.log("=================");
      
      if (sessionError) {
        console.error("Session error:", sessionError);
        throw new Error("Error de sesión: " + sessionError.message);
      }
      
      if (!session || !session.user) {
        throw new Error("Usuario no autenticado. Por favor, inicia sesión nuevamente.");
      }

      const dataToSave: Database['public']['Tables']['tab_enterprises']['Insert'] = {
        nit: values.nit,
        business_name: values.business_name,
        tax_regime: values.tax_regime,
        base_currency_code: values.base_currency_code,
        is_active: values.is_active,
        trade_name: values.trade_name || null,
        address: values.address || null,
        phone: values.phone || null,
        email: values.email || null,
      };

      console.log("Attempting to insert enterprise:", dataToSave);

      if (enterprise) {
        const { error } = await supabase
          .from("tab_enterprises")
          .update(dataToSave)
          .eq("id", enterprise.id);

        if (error) throw error;

        toast({
          title: "Empresa actualizada",
          description: "Los datos se guardaron correctamente",
        });
      } else {
        // Insert the enterprise and get the id
        const { data: newEnterprise, error: enterpriseError } = await supabase
          .from("tab_enterprises")
          .insert([dataToSave])
          .select()
          .single();

        if (enterpriseError) throw enterpriseError;

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) throw new Error("Usuario no autenticado");

        // Link user to enterprise as admin
        const { error: linkError } = await supabase
          .from("tab_user_enterprises")
          .insert([{
            user_id: user.id,
            enterprise_id: newEnterprise.id,
            role: "admin_empresa"
          }]);

        if (linkError) throw linkError;

        toast({
          title: "Empresa creada",
          description: "La empresa se registró exitosamente",
        });
      }

      onSuccess();
      form.reset();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {enterprise ? "Editar Empresa" : "Nueva Empresa"}
          </DialogTitle>
          <DialogDescription>
            {enterprise
              ? "Modifica los datos de la empresa"
              : "Registra una nueva empresa en el sistema"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NIT</FormLabel>
                    <FormControl>
                      <Input placeholder="12345678-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tax_regime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Régimen Fiscal</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pequeño_contribuyente">
                          Pequeño Contribuyente
                        </SelectItem>
                        <SelectItem value="contribuyente_general">
                          Contribuyente General
                        </SelectItem>
                        <SelectItem value="profesional_liberal">
                          Profesional Liberal
                        </SelectItem>
                        <SelectItem value="exenta_ong">Exenta ONG</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="business_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Razón Social</FormLabel>
                  <FormControl>
                    <Input placeholder="EMPRESA EJEMPLO, S.A." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="trade_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre Comercial</FormLabel>
                  <FormControl>
                    <Input placeholder="Ejemplo (opcional)" {...field} />
                  </FormControl>
                  <FormDescription>
                    Nombre con el que opera comercialmente
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Dirección fiscal (opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input placeholder="2222-2222 (opcional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="contacto@ejemplo.com (opcional)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="base_currency_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Moneda Base</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="GTQ">GTQ - Quetzal</SelectItem>
                      <SelectItem value="USD">USD - Dólar</SelectItem>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                      <SelectItem value="CAD">CAD - Dólar Canadiense</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Empresa Activa</FormLabel>
                    <FormDescription>
                      Desactiva para ocultar de operaciones
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

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">
                {enterprise ? "Guardar Cambios" : "Crear Empresa"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
