import { describe, it, expect } from "vitest";
import { getClickableRowProps, shouldIgnoreRowClick } from "./clickableRow";

// Simula un nodo de DOM: `inside` indica si el ancestro buscado existe (p. ej. un botón).
const node = (inside: boolean) =>
  Object.assign(new EventTarget(), {
    closest: () => (inside ? { tagName: "BUTTON" } : null),
  });

// En el entorno node de las pruebas no existe window: se simula la selección de texto.
function withSelection(selection: string, run: () => void) {
  Object.defineProperty(globalThis, "window", {
    value: { getSelection: () => ({ toString: () => selection }) },
    configurable: true,
    writable: true,
  });
  try {
    run();
  } finally {
    delete (globalThis as Record<string, unknown>).window;
  }
}

describe("shouldIgnoreRowClick", () => {
  it("ignora el clic cuando hay texto seleccionado", () => {
    expect(shouldIgnoreRowClick(node(false), "texto seleccionado")).toBe(true);
    // Una selección de solo espacios no cuenta como selección.
    expect(shouldIgnoreRowClick(node(false), "   ")).toBe(false);
  });

  it("ignora el clic dentro de un control interactivo", () => {
    expect(shouldIgnoreRowClick(node(true), "")).toBe(true);
  });

  it("no ignora un clic normal sobre la fila", () => {
    expect(shouldIgnoreRowClick(node(false), "")).toBe(false);
  });

  it("no ignora cuando no hay objetivo", () => {
    expect(shouldIgnoreRowClick(null, "")).toBe(false);
  });

  it("no ignora un objetivo sin closest", () => {
    expect(shouldIgnoreRowClick({}, "")).toBe(false);
  });
});

describe("getClickableRowProps", () => {
  it("abre el editor con un clic normal", () => {
    let opened = 0;
    const props = getClickableRowProps(() => {
      opened += 1;
    }, "Editar bodega");
    props.onClick({ target: node(false) });
    expect(opened).toBe(1);
  });

  it("no abre el editor con texto seleccionado", () => {
    let opened = 0;
    const props = getClickableRowProps(() => {
      opened += 1;
    }, "Editar bodega");
    withSelection("total 65.2884", () => {
      props.onClick({ target: node(false) });
    });
    expect(opened).toBe(0);
  });

  it("no abre el editor al hacer clic en un botón de la fila", () => {
    let opened = 0;
    const props = getClickableRowProps(() => {
      opened += 1;
    }, "Editar bodega");
    props.onClick({ target: node(true) });
    expect(opened).toBe(0);
  });

  it("abre el editor con Enter y con Espacio, y evita el scroll con Espacio", () => {
    let opened = 0;
    let prevented = 0;
    const props = getClickableRowProps(() => {
      opened += 1;
    }, "Editar bodega");
    props.onKeyDown({ key: "Enter", target: node(false), preventDefault: () => { prevented += 1; } });
    expect(opened).toBe(1);
    props.onKeyDown({ key: " ", target: node(false), preventDefault: () => { prevented += 1; } });
    expect(opened).toBe(2);
    expect(prevented).toBe(2);
  });

  it("no abre el editor con otras teclas", () => {
    let opened = 0;
    const props = getClickableRowProps(() => {
      opened += 1;
    }, "Editar bodega");
    props.onKeyDown({ key: "a", target: node(false), preventDefault: () => undefined });
    props.onKeyDown({ key: "Tab", target: node(false), preventDefault: () => undefined });
    props.onKeyDown({ key: "Escape", target: node(false), preventDefault: () => undefined });
    expect(opened).toBe(0);
  });

  it("no abre el editor cuando el foco está en un control de la fila", () => {
    let opened = 0;
    const props = getClickableRowProps(() => {
      opened += 1;
    }, "Editar bodega");
    props.onKeyDown({ key: "Enter", target: node(true), preventDefault: () => undefined });
    expect(opened).toBe(0);
  });

  it("expone la fila como botón accesible con su etiqueta", () => {
    const props = getClickableRowProps(() => undefined, "Editar bodega Central");
    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
    expect(props["aria-label"]).toBe("Editar bodega Central");
    expect(props.className).toContain("cursor-pointer");
    expect(props.className).toContain("focus-visible:ring-2");
  });
});
