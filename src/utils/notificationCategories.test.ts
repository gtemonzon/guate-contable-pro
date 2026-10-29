import { describe, it, expect } from "vitest";
import { notificationCategory } from "./notificationCategories";

describe("notificationCategory", () => {
  it.each(["vencimiento_iva", "vencimiento_isr_trimestral", "vencimiento_iva_mensual", "vencimiento_retenciones_iva"])(
    "%s => vencimientos",
    (type) => expect(notificationCategory(type)).toBe("vencimientos")
  );
  it("vencimiento_cxc y vencimiento_cxp => cobros", () => {
    expect(notificationCategory("vencimiento_cxc")).toBe("cobros");
    expect(notificationCategory("vencimiento_cxp")).toBe("cobros");
  });
  it("partida_borrador => partidas", () => expect(notificationCategory("partida_borrador")).toBe("partidas"));
  it("conciliacion_pendiente => banco", () => expect(notificationCategory("conciliacion_pendiente")).toBe("banco"));
  it("periodo_pendiente => periodos", () => expect(notificationCategory("periodo_pendiente")).toBe("periodos"));
  it("recordatorio_custom => recordatorios", () => expect(notificationCategory("recordatorio_custom")).toBe("recordatorios"));
  it("tipo desconocido => otros", () => expect(notificationCategory("algo_nuevo")).toBe("otros"));
});
