# Parpadeo al abrir el Select de "Mes" en Libros Fiscales — investigación

## Causa confirmada

El "salto" no lo produce el header sticky ni el refetch de datos: lo produce una regla global de CSS que **anima** la compensación de scrollbar de Radix.

1. Radix Select bloquea el scroll con `react-remove-scroll` / `react-remove-scroll-bar` (ambos presentes en `node_modules`). Al abrir, aplica sobre `<body>`: `overflow: hidden` + `margin-right: <ancho del scrollbar>px !important` (gapMode por defecto = `margin`), y lo quita al cerrar. Normalmente es instantáneo e imperceptible.
2. En `src/index.css` (líneas 164-167) existe:
   ```css
   * { transition: var(--transition-base); }   /* all 0.2s cubic-bezier(...) */
   ```
   Esto aplica `transition: all 0.2s` a **todos** los elementos, incluidos `<html>` y `<body>`.
3. Verificación en el navegador (localhost, Playwright): `getComputedStyle(document.body).transitionProperty === "all"`, `duration === "0.2s"`. Al aplicar `body.style.marginRight = "15px"` (exactamente lo que hace Radix), el valor computado avanza frame a frame: `0 → 0.26 → 1.28 → 3.54 → 6.85 → 9.69 → 11.6 → 12.9px`. Es decir, la compensación de scrollbar **se anima 200 ms** en vez de aplicarse de golpe, y el mismo efecto ocurre al cerrar el dropdown. Eso es el parpadeo/desplazamiento visible que reporta el usuario.
4. El header sticky de `LibrosFiscales.tsx` (línea 1684 y elementos internos con `transition-all duration-200`) **amplifica** la percepción — al cambiar el ancho disponible, sus anchos/paddings también se animan — pero no es la causa raíz: el mismo problema existe en cualquier página, solo que aquí hay contenido ancho y encabezado fijo que lo hacen evidente.

## Descartado

- **Refetch por cambio de `selectedMonth`**: el render de la lista usa `loading && purchases.length === 0` / `loading && sales.length === 0` (líneas 2103 y 2142), por lo que la lista existente no se vacía durante la recarga; además el refetch silencioso (línea 699) no activa `setLoading(true)`. No hay flash de estado de carga. Ese camino no explica el shift, que ocurre también con solo abrir y cerrar el desplegable sin cambiar de mes.
- **Histéresis del header**: ya está corregida (compactar >60px, expandir <20px) y no se dispara al abrir el Select, porque el scroll queda bloqueado y `window.scrollY` no cambia.

Nota: no fue posible abrir `/libros` autenticado desde el sandbox (sesión de preview desconectada), por lo que la verificación se hizo sobre la app cargada en localhost midiendo directamente el comportamiento de `body` y del paquete de scroll-lock, no sobre el dropdown renderizado.

## Fix propuesto (pendiente de tu aprobación)

Cambio mínimo, de una sola línea en `src/index.css`: dejar de aplicar transiciones al selector universal y limitarlas a lo que realmente las necesita.

- Excluir `html, body` (y `:root`) de la regla `* { transition: ... }`, o mejor, reemplazar el selector universal por transiciones explícitas en los componentes que las requieren.
- Opción conservadora y de menor riesgo visual: mantener la regla `*` pero añadir `html, body { transition: none; }` después, de modo que la compensación de scrollbar sea instantánea y el resto de la UI conserve su animación actual.

Con eso, abrir/cerrar el Select (y cualquier diálogo, popover o sheet de Radix) deja de producir el desplazamiento animado.
