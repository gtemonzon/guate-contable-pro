import { useTenant } from "@/contexts/TenantContext";

export interface PdfConfig {
  fontFamily: "helvetica" | "courier" | "times";
  fontSize: number;
}

export function usePdfConfig(): PdfConfig {
  const { currentTenant } = useTenant();

  return {
    fontFamily: (currentTenant?.pdf_font_family as PdfConfig["fontFamily"]) || "helvetica",
    fontSize: currentTenant?.pdf_font_size || 8,
  };
}
