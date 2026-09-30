# Eliminar el titileo de encabezados

## Alcance
- Dejar fijo el encabezado compacto de Libros Fiscales y ubicarlo debajo de la barra superior.
- Dejar fijo el encabezado compacto de Partidas, conservando filtros y acciones.
- Convertir el chip compacto de período en un selector emergente completo que permanezca abierto durante la selección.
- Elevar la barra superior sobre los encabezados de página.

## Cambios técnicos
- Eliminar exclusivamente los listeners y estados de compactación por desplazamiento en `LibrosFiscales.tsx` y `Partidas.tsx`.
- Reutilizar una sola definición del selector completo dentro de `YearMonthFilter.tsx`; quitar `onExpandRequest` y mantener intacto el modo normal.
- Modificar únicamente los cuatro archivos indicados y verificar todos los usos de `YearMonthFilter`.
- Comprobar tipos, compilación y ausencia de referencias residuales a la compactación eliminada.
