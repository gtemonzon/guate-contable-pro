import { useEffect, useRef, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PdfTypographyManager } from "@/components/configuracion/PdfTypographyManager";
import { Building2, Upload, X, ImageIcon, Loader2, Save, Lock, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { normalizeHex } from "@/utils/colorUtils";
import { TenantColorFields } from "@/components/tenants/TenantColorFields";
import { useSaveTenantIdentity } from "@/hooks/useSaveTenantIdentity";
import { mapIdentityError } from "@/utils/tenantIdentity";
import { ALLOWED_LOGO_TYPES, buildLogoPath, validateLogoFile } from "@/utils/logoFile";

export default function TenantSettings() {
  const { currentTenant, isSuperAdmin, isTenantAdmin } = useTenant();
  const { save, saving } = useSaveTenantIdentity();
  const permissions = useUserPermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tenantName, setTenantName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1e40af");
  const [secondaryColor, setSecondaryColor] = useState("#3b82f6");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    if (!currentTenant) return;
    setTenantName(currentTenant.tenant_name);
    setContactEmail(currentTenant.contact_email ?? "");
    setContactPhone(currentTenant.contact_phone ?? "");
    setPrimaryColor(currentTenant.primary_color);
    setSecondaryColor(currentTenant.secondary_color);
    setLogoUrl(currentTenant.logo_url);
    setLogoPreview(currentTenant.logo_url);
    setLogoFile(null);
    setDirty(false);
  }, [currentTenant]);

  const tenantLoaded = !!currentTenant;
  useEffect(() => {
    if (!tenantLoaded || window.location.hash !== "#tipografia") return;
    const t = window.setTimeout(() => {
      document.getElementById("tipografia")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [tenantLoaded]);

  const canAccess = isTenantAdmin || isSuperAdmin;

  if (permissions.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              No tienes permisos para acceder a la configuración de la oficina.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentTenant) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Cargando datos de la oficina...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const invalid = validateLogoFile(file);
    if (invalid) {
      toast.error(invalid);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const previousPreview = logoPreview;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);

    try {
      setUploading(true);
      const filePath = buildLogoPath(currentTenant.tenant_code, file);
      const { error: uploadError } = await supabase.storage
        .from("tenant-logos")
        .upload(filePath, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("tenant-logos").getPublicUrl(filePath);
      setLogoUrl(data.publicUrl);
      setDirty(true);
      toast.success("Logo cargado");
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string } | null;
      toast.error("Error al subir logo", { description: mapIdentityError(e) });
      setLogoPreview(previousPreview);
      setLogoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    setLogoPreview(null);
    setLogoFile(null);
    setDirty(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const colorsValid = normalizeHex(primaryColor) !== null && normalizeHex(secondaryColor) !== null;
  const canSave = dirty && !saving && !uploading && tenantName.trim() !== "" && colorsValid;

  const handleSave = async () => {
    try {
      await save({
        tenant_name: tenantName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        logo_url: logoUrl,
      });
      toast.success("Datos de la oficina actualizados");
      setDirty(false);
    } catch (err: unknown) {
      toast.error("Error al guardar", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Mi Oficina</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Configura la identidad y datos de contacto de tu oficina contable.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Alcance de esta pantalla</AlertTitle>
        <AlertDescription>
          Aquí editas únicamente los datos de <strong>tu propia oficina</strong>. Para administrar
          empresas clientes ve a <em>Empresas</em>; para configuración contable/tributaria ve a{" "}
          <em>Configuración</em>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Identidad de la Oficina</CardTitle>
          <CardDescription>Nombre, logo y colores de marca</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 rounded-lg">
                {logoPreview ? (
                  <AvatarImage src={logoPreview} alt="Logo" className="object-cover" />
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
                  accept={ALLOWED_LOGO_TYPES.join(",")}
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
                <p className="text-xs text-muted-foreground">PNG, JPG, WEBP o SVG. Máximo 2 MB.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant_name">Nombre de la Oficina</Label>
            <Input
              id="tenant_name"
              value={tenantName}
              onChange={(e) => {
                setTenantName(e.target.value);
                setDirty(true);
              }}
            />
          </div>

          <TenantColorFields
            primary={primaryColor}
            secondary={secondaryColor}
            onChange={(p, sc) => {
              setPrimaryColor(p);
              setSecondaryColor(sc);
              setDirty(true);
            }}
            logoSource={{ file: logoFile, url: logoUrl }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos de Contacto</CardTitle>
          <CardDescription>Información visible para tus clientes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact_email">Email de la oficina</Label>
              <Input
                id="contact_email"
                type="email"
                placeholder="contacto@oficina.com"
                value={contactEmail}
                onChange={(e) => {
                  setContactEmail(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Teléfono de la oficina</Label>
              <Input
                id="contact_phone"
                placeholder="2222-2222"
                value={contactPhone}
                onChange={(e) => {
                  setContactPhone(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!canSave}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>

      <Separator />

      <PdfTypographyManager />

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Configuración administrada por Conta-Online
          </CardTitle>
          <CardDescription>
            Estos parámetros solo pueden ser modificados por el administrador de la plataforma.
            Contacta a soporte si necesitas ajustarlos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <Row label="Código de oficina" value={currentTenant.tenant_code} />
            <Row label="Subdominio" value={currentTenant.subdomain ?? "—"} />
            <Row
              label="Estado"
              value={
                <Badge variant={currentTenant.is_active ? "default" : "destructive"}>
                  {currentTenant.is_active ? "Activo" : "Inactivo"}
                </Badge>
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
