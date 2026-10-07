/**
 * Estilo de una línea de las gráficas anuales del Dashboard según el año bajo el mouse:
 * sin año resaltado, todas como siempre; con uno, ese se engrosa y los demás se atenúan
 * en gris.
 */
export const MUTED_LINE_COLOR = "hsl(var(--muted-foreground))";

export interface LineStyle {
  stroke: string;
  strokeWidth: number;
  strokeOpacity: number;
  dot: { fill: string; strokeWidth: number; r: number; fillOpacity: number; strokeOpacity: number };
  activeDot: { r: number };
  /** Hay un año resaltado y no es este. */
  dimmed: boolean;
}

export function lineStyleFor(year: number, hoveredYear: number | null, baseColor: string): LineStyle {
  if (hoveredYear === null) {
    return {
      stroke: baseColor,
      strokeWidth: 2,
      strokeOpacity: 1,
      dot: { fill: baseColor, strokeWidth: 2, r: 3, fillOpacity: 1, strokeOpacity: 1 },
      activeDot: { r: 5 },
      dimmed: false,
    };
  }
  if (year === hoveredYear) {
    return {
      stroke: baseColor,
      strokeWidth: 3,
      strokeOpacity: 1,
      dot: { fill: baseColor, strokeWidth: 2, r: 4, fillOpacity: 1, strokeOpacity: 1 },
      activeDot: { r: 5 },
      dimmed: false,
    };
  }
  return {
    stroke: MUTED_LINE_COLOR,
    strokeWidth: 1,
    strokeOpacity: 0.25,
    dot: { fill: MUTED_LINE_COLOR, strokeWidth: 2, r: 3, fillOpacity: 0.25, strokeOpacity: 0.25 },
    activeDot: { r: 5 },
    dimmed: true,
  };
}

/** Años de la gráfica de más reciente a más antiguo (sin mutar el arreglo de estado). */
export function sortYearsDesc(years: readonly number[]): number[] {
  return [...years].sort((a, b) => b - a);
}
