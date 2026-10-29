import { normalizeHex } from "@/utils/colorUtils";

export type TenantIdentity = {
  tenant_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  pdf_font_family: string;
  pdf_font_size: number;
};

export type TenantIdentityArgs = {
  p_tenant_id: number;
  p_tenant_name: string;
  p_contact_email: string | null;
  p_contact_phone: string | null;
  p_primary_color: string;
  p_secondary_color: string;
  p_logo_url: string | null;
  p_pdf_font_family: string;
  p_pdf_font_size: number;
};

const blankToNull = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export function buildIdentityArgs(
  tenantId: number,
  current: TenantIdentity,
  patch: Partial<TenantIdentity>
): TenantIdentityArgs {
  const merged: TenantIdentity = { ...current, ...patch };
  const primary = normalizeHex(merged.primary_color ?? "");
  const secondary = normalizeHex(merged.secondary_color ?? "");
  if (!primary || !secondary) throw new Error("Color inválido (ejemplo: #1e40af)");
  return {
    p_tenant_id: tenantId,
    p_tenant_name: (merged.tenant_name ?? "").trim(),
    p_contact_email: blankToNull(merged.contact_email),
    p_contact_phone: blankToNull(merged.contact_phone),
    p_primary_color: primary,
    p_secondary_color: secondary,
    p_logo_url: blankToNull(merged.logo_url),
    p_pdf_font_family: merged.pdf_font_family,
    p_pdf_font_size: merged.pdf_font_size,
  };
}

export function mapIdentityError(
  error: { code?: string; message?: string } | null | undefined
): string {
  if (error?.code === "42501") return "No tienes permisos para modificar los datos de esta oficina.";
  if (error?.code === "22023" && error.message) return error.message;
  if (error?.code === "P0002") return "Oficina no encontrada.";
  if (error?.message?.includes("row-level security")) return "No tienes permisos para realizar esta acción.";
  return error?.message || "No se pudieron guardar los cambios.";
}
