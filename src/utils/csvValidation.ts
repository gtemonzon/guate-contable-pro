import { z } from "zod";

// Validation schema for sales CSV import
export const salesSchema = z.object({
  serie: z.string().trim().max(10, "Serie debe tener máximo 10 caracteres"),
  numero: z.string().trim().min(1, "Número es requerido").max(50, "Número debe tener máximo 50 caracteres"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe estar en formato YYYY-MM-DD"),
  tipo_documento_fel: z.string().trim().max(20, "Tipo de documento debe tener máximo 20 caracteres"),
  numero_autorizacion: z.string().trim().max(100, "Número de autorización debe tener máximo 100 caracteres"),
  nit_cliente: z.string().trim().max(20, "NIT debe tener máximo 20 caracteres"),
  nombre_cliente: z.string().trim().min(1, "Nombre del cliente es requerido").max(255, "Nombre debe tener máximo 255 caracteres"),
  monto_neto: z.number().nonnegative("Monto neto debe ser positivo o cero"),
  iva: z.number().nonnegative("IVA debe ser positivo o cero"),
  total: z.number().positive("Total debe ser mayor a cero")
});

// Validation schema for purchases CSV import
export const purchasesSchema = z.object({
  serie: z.string().trim().max(10, "Serie debe tener máximo 10 caracteres"),
  numero: z.string().trim().min(1, "Número es requerido").max(50, "Número debe tener máximo 50 caracteres"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe estar en formato YYYY-MM-DD"),
  tipo_documento_fel: z.string().trim().max(20, "Tipo de documento debe tener máximo 20 caracteres"),
  nit_proveedor: z.string().trim().max(20, "NIT debe tener máximo 20 caracteres"),
  nombre_proveedor: z.string().trim().min(1, "Nombre del proveedor es requerido").max(255, "Nombre debe tener máximo 255 caracteres"),
  monto_base: z.number().nonnegative("Monto base debe ser positivo o cero"),
  iva: z.number().nonnegative("IVA debe ser positivo o cero"),
  total: z.number().positive("Total debe ser mayor a cero")
});

export type SalesRow = z.infer<typeof salesSchema>;
export type PurchasesRow = z.infer<typeof purchasesSchema>;
