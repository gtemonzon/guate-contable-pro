export type NotificationCategory =
  | "vencimientos"
  | "partidas"
  | "banco"
  | "periodos"
  | "cobros"
  | "recordatorios"
  | "otros";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "vencimientos",
  "partidas",
  "banco",
  "periodos",
  "cobros",
  "recordatorios",
  "otros",
];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  vencimientos: "Vencimientos fiscales",
  partidas: "Partidas en borrador",
  banco: "Conciliación bancaria",
  periodos: "Períodos contables",
  cobros: "Cobros y pagos",
  recordatorios: "Recordatorios",
  otros: "Otros",
};

/** Agrupa un notification_type en la categoría del filtro "Tipo". */
export function notificationCategory(type: string): NotificationCategory {
  // Cobros/pagos se evalúan antes que el prefijo genérico "vencimiento_".
  if (type === "vencimiento_cxc" || type === "vencimiento_cxp") return "cobros";
  if (type.startsWith("vencimiento_")) return "vencimientos";
  if (type === "partida_borrador") return "partidas";
  if (type === "conciliacion_pendiente") return "banco";
  if (type === "periodo_pendiente") return "periodos";
  if (type === "recordatorio_custom") return "recordatorios";
  return "otros";
}
