import { describe, it, expect } from "vitest";
import { ACCOUNTS_TEMPLATE_CSV } from "./accountsTemplate";

const lines = ACCOUNTS_TEMPLATE_CSV.trim().split("\n");
const rows = lines.slice(1);

describe("ACCOUNTS_TEMPLATE_CSV", () => {
  it("empieza con el encabezado exacto", () => {
    expect(lines[0]).toBe(
      "codigo_cuenta,nombre_cuenta,tipo_cuenta,cuenta_padre,nivel,permite_movimiento,requiere_centro_costo",
    );
  });
  it("tiene 4 filas de 7 columnas", () => {
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r.split(",")).toHaveLength(7);
  });
  it("conserva los códigos de ejemplo", () => {
    expect(rows.map((r) => r.split(",")[0])).toEqual(["1", "1.1", "1.1.1", "1.1.1.01"]);
  });
});
