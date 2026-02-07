import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, FileText } from "lucide-react";

const FONT_OPTIONS = [
  { value: "helvetica", label: "Helvetica", description: "Sans-serif, moderno y limpio" },
  { value: "courier", label: "Courier", description: "Monoespaciado, aspecto técnico" },
  { value: "times", label: "Times", description: "Serif, estilo tradicional/formal" },
];

const FONT_SIZES = [6, 7, 8, 9, 10, 11, 12];

export function PdfTypographyManager() {
  const { currentTenant, isTenantAdmin, isSuperAdmin, refreshTenants } = useTenant();
  const [fontFamily, setFontFamily] = useState<string>("helvetica");
  const [fontSize, setFontSize] = useState<number>(8);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const canEdit = isTenantAdmin || isSuperAdmin;

  useEffect(() => {
    if (currentTenant) {
      setFontFamily(currentTenant.pdf_font_family || "helvetica");
      setFontSize(currentTenant.pdf_font_size || 8);
      setHasChanges(false);
    }
  }, [currentTenant]);

  const handleFontFamilyChange = (value: string) => {
    setFontFamily(value);
    setHasChanges(true);
  };

  const handleFontSizeChange = (value: string) => {
    setFontSize(parseInt(value, 10));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!currentTenant) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("tab_tenants")
        .update({
          pdf_font_family: fontFamily,
          pdf_font_size: fontSize,
        })
        .eq("id", currentTenant.id);

      if (error) throw error;

      toast.success("Configuración de tipografía guardada");
      setHasChanges(false);
      await refreshTenants();
    } catch (error) {
      console.error("Error saving PDF config:", error);
      toast.error("Error al guardar la configuración");
    } finally {
      setIsSaving(false);
    }
  };

  const getFontStyle = (font: string): React.CSSProperties => {
    switch (font) {
      case "courier":
        return { fontFamily: "Courier New, Courier, monospace" };
      case "times":
        return { fontFamily: "Times New Roman, Times, serif" };
      default:
        return { fontFamily: "Helvetica, Arial, sans-serif" };
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Tipografía de PDFs
        </CardTitle>
        <CardDescription>
          Configura el tipo y tamaño de fuente que se utilizará en la generación de reportes PDF
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Font Family Selector */}
          <div className="space-y-2">
            <Label htmlFor="font-family">Tipo de Fuente</Label>
            <Select
              value={fontFamily}
              onValueChange={handleFontFamilyChange}
              disabled={!canEdit}
            >
              <SelectTrigger id="font-family">
                <SelectValue placeholder="Seleccionar fuente" />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    <div className="flex flex-col">
                      <span style={getFontStyle(font.value)}>{font.label}</span>
                      <span className="text-xs text-muted-foreground">{font.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Font Size Selector */}
          <div className="space-y-2">
            <Label htmlFor="font-size">Tamaño de Fuente</Label>
            <Select
              value={fontSize.toString()}
              onValueChange={handleFontSizeChange}
              disabled={!canEdit}
            >
              <SelectTrigger id="font-size">
                <SelectValue placeholder="Seleccionar tamaño" />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size} pt
                    {size === 8 && <span className="ml-2 text-muted-foreground">(predeterminado)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Tamaño base para el contenido de tablas. Los encabezados serán proporcionalmente más grandes.
            </p>
          </div>
        </div>

        {/* Preview Section */}
        <div className="space-y-2">
          <Label>Vista Previa</Label>
          <div className="rounded-lg border bg-white p-4">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    <th
                      className="border p-2 text-left"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize + 2}px` }}
                    >
                      Código
                    </th>
                    <th
                      className="border p-2 text-left"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize + 2}px` }}
                    >
                      Descripción
                    </th>
                    <th
                      className="border p-2 text-right"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize + 2}px` }}
                    >
                      Debe
                    </th>
                    <th
                      className="border p-2 text-right"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize + 2}px` }}
                    >
                      Haber
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-muted/50">
                    <td
                      className="border p-2"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize}px` }}
                    >
                      1.1.01.001
                    </td>
                    <td
                      className="border p-2"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize}px` }}
                    >
                      Caja y Bancos
                    </td>
                    <td
                      className="border p-2 text-right"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize}px` }}
                    >
                      Q 1,500.00
                    </td>
                    <td
                      className="border p-2 text-right"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize}px` }}
                    >
                      Q 0.00
                    </td>
                  </tr>
                  <tr>
                    <td
                      className="border p-2"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize}px` }}
                    >
                      4.1.01.001
                    </td>
                    <td
                      className="border p-2"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize}px` }}
                    >
                      Ventas de Mercaderías
                    </td>
                    <td
                      className="border p-2 text-right"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize}px` }}
                    >
                      Q 0.00
                    </td>
                    <td
                      className="border p-2 text-right"
                      style={{ ...getFontStyle(fontFamily), fontSize: `${fontSize}px` }}
                    >
                      Q 1,500.00
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Save Button */}
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Guardando..." : "Guardar Configuración"}
            </Button>
          </div>
        )}

        {!canEdit && (
          <p className="text-sm text-muted-foreground">
            Solo los administradores de oficina pueden modificar esta configuración.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
