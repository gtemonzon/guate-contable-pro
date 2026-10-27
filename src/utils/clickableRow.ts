// ============= clickableRow =============
// Utilidades puras para que una fila de tabla abra su editor al hacer clic,
// sin interferir con los controles de la propia fila ni con la selección de texto.

/**
 * Selector de los controles que NO deben abrir el editor cuando se hace clic
 * sobre ellos. Las acciones de fila marcadas con data-row-action quedan fuera
 * del clic de la fila sin necesidad de stopPropagation en cada botón.
 */
const INTERACTIVE_SELECTOR =
  "button, a, input, select, textarea, label, [role='checkbox'], [role='switch'], [role='menuitem'], [data-row-action]";

/** Cualquier nodo que permita buscar ancestros (un Element del DOM). */
export interface ClosestCandidate {
  closest?: (selector: string) => unknown;
}

/**
 * Devuelve true cuando el clic NO debe activar la fila:
 * - hay texto seleccionado (el usuario quiere copiarlo), o
 * - el clic cayó dentro de un control interactivo de la fila.
 */
export function shouldIgnoreRowClick(
  target: ClosestCandidate | null,
  selectedText: string,
): boolean {
  if (selectedText.trim() !== "") return true;
  if (target && typeof target.closest === "function" && target.closest(INTERACTIVE_SELECTOR)) {
    return true;
  }
  return false;
}

/** Texto seleccionado en la página ("" cuando no hay ventana, p. ej. en node). */
function selectedPageText(): string {
  if (typeof window === "undefined") return "";
  return window.getSelection()?.toString() ?? "";
}

export interface ClickableRowProps {
  onClick: (event: { target: EventTarget | null }) => void;
  onKeyDown: (event: {
    key: string;
    target: EventTarget | null;
    preventDefault: () => void;
  }) => void;
  tabIndex: number;
  role: "button";
  "aria-label": string;
  className: string;
}

/** Resalte de fila clicable: cursor, hover y foco visible. */
export const CLICKABLE_ROW_CLASS =
  "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

/**
 * Props para un <TableRow> que abre su editor al hacer clic o al presionar
 * Enter/Espacio con el foco puesto en la fila.
 */
export function getClickableRowProps(
  onActivate: () => void,
  label: string,
): ClickableRowProps {
  return {
    onClick: (event) => {
      if (
        shouldIgnoreRowClick(
          event.target as ClosestCandidate | null,
          selectedPageText(),
        )
      ) {
        return;
      }
      onActivate();
    },
    onKeyDown: (event) => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
      if (shouldIgnoreRowClick(event.target as ClosestCandidate | null, "")) return;
      // Espacio haría scroll de la página: la fila lo usa como "abrir".
      event.preventDefault();
      onActivate();
    },
    tabIndex: 0,
    role: "button",
    "aria-label": label,
    className: CLICKABLE_ROW_CLASS,
  };
}
