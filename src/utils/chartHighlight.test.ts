/**
 * Run with: bunx vitest run src/utils/chartHighlight.test.ts
 */
import { describe, it, expect } from "vitest";
import { lineStyleFor, sortYearsDesc, MUTED_LINE_COLOR } from "./chartHighlight";

const RED = "#e11d48";

describe("lineStyleFor", () => {
  it("sin hover: color base, grosor 2, opacidad 1, puntos como hoy", () => {
    expect(lineStyleFor(2026, null, RED)).toEqual({
      stroke: RED, strokeWidth: 2, strokeOpacity: 1,
      dot: { fill: RED, strokeWidth: 2, r: 3, fillOpacity: 1, strokeOpacity: 1 },
      activeDot: { r: 5 }, dimmed: false,
    });
  });
  it("año resaltado: grosor 3 y puntos r 4", () => {
    const s = lineStyleFor(2026, 2026, RED);
    expect(s).toMatchObject({ stroke: RED, strokeWidth: 3, strokeOpacity: 1, dimmed: false });
    expect(s.dot.r).toBe(4);
  });
  it("demás años: gris, grosor 1, opacidad 0.25", () => {
    const s = lineStyleFor(2025, 2026, RED);
    expect(s).toMatchObject({ stroke: MUTED_LINE_COLOR, strokeWidth: 1, strokeOpacity: 0.25, dimmed: true });
    expect(s.dot).toMatchObject({ fill: MUTED_LINE_COLOR, fillOpacity: 0.25, strokeOpacity: 0.25 });
  });
  it("al cambiar el año resaltado cambian los papeles", () => {
    expect(lineStyleFor(2025, 2026, RED).dimmed).toBe(true);
    expect(lineStyleFor(2025, 2025, RED).dimmed).toBe(false);
    expect(lineStyleFor(2026, 2025, RED).dimmed).toBe(true);
    expect(lineStyleFor(2026, null, RED).strokeWidth).toBe(2);
  });
});

describe("sortYearsDesc", () => {
  it("ordena sin mutar", () => {
    const years = [2024, 2026, 2025];
    expect(sortYearsDesc(years)).toEqual([2026, 2025, 2024]);
    expect(years).toEqual([2024, 2026, 2025]);
  });
});
