// Plantilla CSV para importar el catálogo de cuentas.

export const ACCOUNTS_TEMPLATE_CSV =
  "codigo_cuenta,nombre_cuenta,tipo_cuenta,cuenta_padre,nivel,permite_movimiento,requiere_centro_costo\n" +
  "1,ACTIVO,activo,,1,false,false\n" +
  "1.1,ACTIVO CORRIENTE,activo,1,2,false,false\n" +
  "1.1.1,Caja y Bancos,activo,1.1,3,false,false\n" +
  "1.1.1.01,Caja General,activo,1.1.1,4,true,false\n";

/** Descarga la plantilla como "plantilla_cuentas.csv". */
export function downloadAccountsTemplate(): void {
  const blob = new Blob([ACCOUNTS_TEMPLATE_CSV], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_cuentas.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
