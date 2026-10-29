import { describe, it, expect } from "vitest";
import { buildIdentityArgs, mapIdentityError, type TenantIdentity } from "./tenantIdentity";

const current: TenantIdentity = {
  tenant_name: "Oficina",
  contact_email: "a@b.com",
  contact_phone: "2222-2222",
  primary_color: "#1e40af",
  secondary_color: "#3b82f6",
  logo_url: "https://x/logo.png",
  pdf_font_family: "helvetica",
  pdf_font_size: 8,
};

describe("buildIdentityArgs", () => {
  it("aplica solo el patch y conserva el resto", () => {
    const a = buildIdentityArgs(5, current, { pdf_font_size: 10 });
    expect(a).toEqual({
      p_tenant_id: 5,
      p_tenant_name: "Oficina",
      p_contact_email: "a@b.com",
      p_contact_phone: "2222-2222",
      p_primary_color: "#1e40af",
      p_secondary_color: "#3b82f6",
      p_logo_url: "https://x/logo.png",
      p_pdf_font_family: "helvetica",
      p_pdf_font_size: 10,
    });
  });
  it("normaliza colores", () => {
    expect(buildIdentityArgs(1, current, { primary_color: "#33721D" }).p_primary_color).toBe("#33721d");
    expect(buildIdentityArgs(1, current, { secondary_color: "#abc" }).p_secondary_color).toBe("#aabbcc");
  });
  it("color inválido lanza error", () => {
    expect(() => buildIdentityArgs(1, current, { primary_color: "verde" })).toThrow("Color inválido (ejemplo: #1e40af)");
  });
  it("email, teléfono y logo en blanco => null; nombre con trim", () => {
    const a = buildIdentityArgs(1, current, { contact_email: "  ", contact_phone: "", logo_url: "", tenant_name: "  X  " });
    expect(a.p_contact_email).toBeNull();
    expect(a.p_contact_phone).toBeNull();
    expect(a.p_logo_url).toBeNull();
    expect(a.p_tenant_name).toBe("X");
  });
});

describe("mapIdentityError", () => {
  it("mapea códigos", () => {
    expect(mapIdentityError({ code: "42501", message: "x" })).toBe("No tienes permisos para modificar los datos de esta oficina.");
    expect(mapIdentityError({ code: "22023", message: "El nombre es obligatorio" })).toBe("El nombre es obligatorio");
    expect(mapIdentityError({ code: "P0002", message: "x" })).toBe("Oficina no encontrada.");
    expect(mapIdentityError({ message: "new row violates row-level security policy" })).toBe("No tienes permisos para realizar esta acción.");
    expect(mapIdentityError({ message: "otro" })).toBe("otro");
    expect(mapIdentityError(null)).toBe("No se pudieron guardar los cambios.");
  });
});
