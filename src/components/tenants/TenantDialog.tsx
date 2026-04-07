import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload, X, ImageIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Tenant {
  id: number;
  tenant_code: string;
  tenant_name: string;
  subdomain: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  max_enterprises: number;
  max_users: number;
  plan_type: string;
}

const formSchema = z.object({
  tenant_code: z.string().min(1, "Código es requerido").max(20, "Máximo 20 caracteres"),
  tenant_name: z.string().min(1, "Nombre es requerido"),
  subdomain: z.string().optional(),
  contact_email: z.string().email("Email inválido").optional().or(z.literal("")),
  contact_phone: z.string().optional(),
  primary_color: z.string().default("#1e40af"),
  secondary_color: z.string().default("#3b82f6"),
  max_enterprises: z.number().min(1).default(10),
  max_users: z.number().min(1).default(5),
  plan_type: z.enum(["basic", "professional", "enterprise"]).default("basic"),
  is_active: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface TenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: Tenant | null;
  onClose: () => void;
}

export function TenantDialog({
  open,
  onOpenChange,
  tenant,
  onClose,
}: TenantDialogProps) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = !!tenant;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tenant_code: "",
      tenant_name: "",
      subdomain: "",
      contact_email: "",
      contact_phone: "",
      primary_color: "#1e40af",
      secondary_color: "#3b82f6",
      max_enterprises: 10,
      max_users: 5,
      plan_type: "basic",
      is_active: true,
    },
  });

  useEffect(() => {
    if (tenant) {
      form.reset({
        tenant_code: tenant.tenant_code,
        tenant_name: tenant.tenant_name,
        subdomain: tenant.subdomain || "",
        contact_email: tenant.contact_email || "",
        contact_phone: tenant.contact_phone || "",
        primary_color: tenant.primary_color,
        secondary_color: tenant.secondary_color,
        max_enterprises: tenant.max_enterprises,
        max_users: tenant.max_users,
        plan_type: tenant.plan_type as "basic" | "professional" | "enterprise",
        is_active: tenant.is_active,
      });
      setLogoUrl(tenant.logo_url);
      setLogoPreview(tenant.logo_url);
    } else {
      form.reset({
        tenant_code: "",
        tenant_name: "",
        subdomain: "",
        contact_email: "",
        contact_phone: "",
        primary_color: "#1e40af",
        secondary_color: "#3b82f6",
        max_enterprises: 10,
        max_users: 5,
        plan_type: "basic",
        is_active: true,
      });
      setLogoUrl(null);
      setLogoPreview(null);
    }
  }, [tenant, form]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Solo se permiten archivos de imagen");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El archivo es muy grande", {
        description: "El tamaño máximo es 2MB",
      });
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload file
    try {
      setUploading(true);
      const tenantCode = form.getValues("tenant_code") || "new";
      const fileExt = file.name.split('.').pop();
      const fileName = `${tenantCode.toLowerCase()}-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('tenant-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('tenant-logos')
        .getPublicUrl(filePath);

      setLogoUrl(data.publicUrl);
      toast.success("Logo subido correctamente");
    } catch (error: unknown) {
      toast.error("Error al subir el logo", {
        description: error instanceof Error ? error.message : String(error),
      });
      setLogoPreview(logoUrl); // Revert preview
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    setLogoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      setLoading(true);

      const dataToSave = {
        tenant_code: values.tenant_code.toUpperCase(),
        tenant_name: values.tenant_name,
        subdomain: values.subdomain || null,
        contact_email: values.contact_email || null,
        contact_phone: values.contact_phone || null,
        primary_color: values.primary_color,
        secondary_color: values.secondary_color,
        max_enterprises: values.max_enterprises,
        max_users: values.max_users,
        plan_type: values.plan_type,
        is_active: values.is_active,
        logo_url: logoUrl,
      };

      if (isEditing) {
        const { error } = await supabase
          .from("tab_tenants")
          .update(dataToSave)
          .eq("id", tenant.id);

        if (error) throw error;

        toast.success("Tenant actualizado correctamente");
      } else {
        const { error } = await supabase
          .from("tab_tenants")
          .insert(dataToSave);

        if (error) throw error;

        toast.success("Tenant creado correctamente");
      }

      onClose();
    } catch (error: unknown) {
      toast.error("Error al guardar", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Tenant" : "Nuevo Tenant"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica los datos de la oficina contable"
              : "Registra una nueva oficina contable"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tenant_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="ASC" 
                        {...field} 
                        className="uppercase"
                        disabled={isEditing}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="plan_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan</FormLabel>
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
                        <SelectItem value="basic">Básico</SelectItem>
                        <SelectItem value="professional">Profesional</SelectItem>
                        <SelectItem value="enterprise">Empresarial</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tenant_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Oficina</FormLabel>
                  <FormControl>
                    <Input placeholder="Oficina Contable ASC" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Logo Upload Section */}
            <div className="space-y-2">
              <FormLabel>Logo</FormLabel>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 rounded-lg">
                  {logoPreview ? (
                    <AvatarImage src={logoPreview} alt="Logo preview" className="object-cover" />
                  ) : (
                    <AvatarFallback className="rounded-lg bg-muted">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {logoPreview ? "Cambiar" : "Subir"}
                    </Button>
                    {logoPreview && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveLogo}
                        disabled={uploading}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Quitar
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG o SVG. Máximo 2MB.
                  </p>
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="subdomain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subdominio</FormLabel>
                  <FormControl>
                    <Input placeholder="asc" {...field} />
                  </FormControl>
                  <FormDescription>
                    Se usará como asc.tudominio.com
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contact_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email de contacto</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="contacto@asc.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input placeholder="2222-2222" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="primary_color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color primario</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input type="color" {...field} className="w-12 h-10 p-1" />
                        <Input {...field} className="flex-1" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="secondary_color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color secundario</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input type="color" {...field} className="w-12 h-10 p-1" />
                        <Input {...field} className="flex-1" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="max_enterprises"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Máx. Empresas</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={1}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="max_users"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Máx. Usuarios</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={1}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Tenant Activo</FormLabel>
                    <FormDescription>
                      Desactiva para bloquear acceso
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Guardar Cambios" : "Crear Tenant"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
