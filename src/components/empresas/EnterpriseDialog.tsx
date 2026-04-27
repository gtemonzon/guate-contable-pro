/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, lazy, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { validateNIT } from "@/utils/nitValidation";
import { useToast } from "@/hooks/use-toast";
import { NitAutocomplete } from "@/components/ui/nit-autocomplete";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { EnterpriseDocuments } from "./EnterpriseDocuments";
import { EnterprisePeriods } from "./EnterprisePeriods";
import { EnterpriseTaxes } from "./EnterpriseTaxes";
import { EnterpriseBookAuthorizations } from "./EnterpriseBookAuthorizations";
import { EnterpriseCurrencies } from "./EnterpriseCurrencies";
const LegacyImportWizard = lazy(() => import("./legacyImport/LegacyImportWizard").then(m => ({ default: m.LegacyImportWizard })));
import { DatabaseBackup } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Enterprise = Database['public']['Tables']['tab_enterprises']['Row'];

const formSchema = z.object({
  nit: z.string().min(1, "NIT es requerido").refine(
    (val) => validateNIT(val),
    { message: "NIT inválido" }
  ),
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
  defaultTenantId?: number;
  defaultTab?: string;
}

export function EnterpriseDialog({
  open,
  onOpenChange,
  enterprise,
  onSuccess,
  defaultTenantId,
  defaultTab,
}: EnterpriseDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(defaultTab || "general");
  const [legacyImportOpen, setLegacyImportOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserEmail(data.user?.email ?? null));
  }, []);
  
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

  // Update active tab when defaultTab changes
  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

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
      // Verify session is valid
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        toast({
          variant: "destructive",
          title: "Sesión expirada",
          description: "Por favor, cierra sesión e inicia sesión nuevamente",
        });
        return;
      }

      // Get user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        toast({
          variant: "destructive",
          title: "Error de autenticación",
          description: "No se pudo verificar el usuario. Por favor, inicia sesión nuevamente",
        });
        return;
      }

      // For updates, we need to include tenant_id from the existing enterprise
      const dataToSave: Partial<Database['public']['Tables']['tab_enterprises']['Insert']> = {
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
        // Use database function to create enterprise and link user atomically
        // Build RPC parameters - only include tenant_id if provided (for super admins)
        const rpcParams: any = {
          _nit: values.nit,
          _business_name: values.business_name,
          _tax_regime: values.tax_regime,
          _base_currency_code: values.base_currency_code,
          _is_active: values.is_active,
          _trade_name: values.trade_name || null,
          _address: values.address || null,
          _phone: values.phone || null,
          _email: values.email || null,
        };

        // Add tenant_id if defaultTenantId is provided (super admin creating for specific tenant)
        if (defaultTenantId) {
          rpcParams._tenant_id = defaultTenantId;
        }

        const { data: enterpriseData, error: enterpriseError } = await supabase
          .rpc('create_enterprise_with_user_link', rpcParams);

        if (enterpriseError) {
          console.error("Enterprise creation error:", enterpriseError);
          throw enterpriseError;
        }

        const newEnterprise = enterpriseData as unknown as Enterprise;

        // Auto-select the new enterprise
        localStorage.setItem("currentEnterpriseId", newEnterprise.id.toString());
        
        // Trigger events for other components to react
        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new CustomEvent("enterpriseChanged", {
          detail: { enterpriseId: newEnterprise.id }
        }));

        toast({
          title: "Empresa creada",
          description: "La empresa se registró exitosamente y está ahora seleccionada",
        });
      }

      onSuccess();
      form.reset();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle>
                {enterprise ? "Editar Empresa" : "Nueva Empresa"}
              </DialogTitle>
              <DialogDescription>
                {enterprise
                  ? "Modifica los datos de la empresa"
                  : "Registra una nueva empresa en el sistema"}
              </DialogDescription>
            </div>
            {enterprise && currentUserEmail === "gtemonzon@gmail.com" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLegacyImportOpen(true)}
              >
                <DatabaseBackup className="h-4 w-4 mr-2" />
                Importar datos legado
              </Button>
            )}
          </div>
        </DialogHeader>
        {enterprise && legacyImportOpen && (
          <Suspense fallback={null}>
            <LegacyImportWizard
              open={legacyImportOpen}
              onOpenChange={setLegacyImportOpen}
              enterpriseId={enterprise.id}
              enterpriseName={enterprise.business_name}
            />
          </Suspense>
        )}

        {enterprise ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="currencies">Monedas</TabsTrigger>
              <TabsTrigger value="taxes">Impuestos</TabsTrigger>
              <TabsTrigger value="documents">Documentos</TabsTrigger>
              <TabsTrigger value="periods">Períodos</TabsTrigger>
              <TabsTrigger value="books">Libros SAT</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-4">
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
                      <NitAutocomplete
                        placeholder="12345678-9"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        onSelectTaxpayer={(nit, name) => {
                          form.setValue("nit", nit);
                          form.setValue("business_name", name);
                        }}
                      />
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
                      Guardar Cambios
                    </Button>
                  </div>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="currencies" className="mt-4">
              <EnterpriseCurrencies
                enterpriseId={enterprise.id}
                baseCurrencyCode={enterprise.base_currency_code || "GTQ"}
              />
            </TabsContent>

            <TabsContent value="taxes" className="mt-4">
              <EnterpriseTaxes enterpriseId={enterprise.id} />
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <EnterpriseDocuments enterpriseId={enterprise.id} />
            </TabsContent>

            <TabsContent value="periods" className="mt-4">
              <EnterprisePeriods enterpriseId={enterprise.id} />
            </TabsContent>

            <TabsContent value="books" className="mt-4">
              <EnterpriseBookAuthorizations enterpriseId={enterprise.id} />
            </TabsContent>
          </Tabs>
        ) : (
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
                        <NitAutocomplete
                          placeholder="12345678-9"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          onSelectTaxpayer={(nit, name) => {
                            form.setValue("nit", nit);
                            form.setValue("business_name", name);
                          }}
                        />
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
                  Crear Empresa
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
