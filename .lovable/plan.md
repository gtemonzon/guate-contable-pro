
# Plan: Vincular Partidas Contables con Libro de Compras

## Resumen del Flujo
Se implementara una integracion entre el dialogo de partidas contables y el libro de compras, donde:
1. El usuario crea el encabezado de una partida (fecha, tipo, referencia, descripcion)
2. Desde el dialogo de partida, puede abrir un modal para agregar facturas al libro de compras
3. Las facturas se pre-filtran por el mes/ano de la fecha de la partida
4. El campo "Ref.Pago" de las facturas se pre-llena con la "Referencia de Documento" de la partida
5. Un boton "Contabilizar" en el modal genera las lineas de detalle automaticamente en la partida origen

## Arquitectura de la Solucion

```text
+----------------------------------+
| JournalEntryDialog               |
| +------------------------------+ |
| | Encabezado partida           | |
| | - Fecha (ej: 02/02/2026)     | |
| | - Ref. Documento (ej: 100)   | |
| | - Descripcion general        | |
| +------------------------------+ |
|                                  |
| [+ Agregar desde Compras]        |  <-- Nuevo boton
|                                  |
| +------------------------------+ |
| | Lineas de Detalle            | |
| +------------------------------+ |
+----------------------------------+
             |
             v (abre modal)
+----------------------------------+
| LinkedPurchasesModal             |  <-- Nuevo componente
| +------------------------------+ |
| | Mes: Febrero 2026 (fijo)     | |
| | Ref.Pago: 100 (pre-llenado)  | |
| +------------------------------+ |
| | [Contabilizar] (sticky)      | |  <-- Boton principal
| +------------------------------+ |
| | Lista de facturas a agregar  | |
| | (similar a PurchaseCard)     | |
| +------------------------------+ |
+----------------------------------+
```

## Cambios Requeridos

### 1. Nuevo Componente: LinkedPurchasesModal
**Archivo**: `src/components/partidas/LinkedPurchasesModal.tsx`

Proposito: Modal que permite agregar facturas al libro de compras, vinculadas a una partida contable especifica.

Funcionalidades:
- Recibe como props: fecha de partida, referencia de documento, ID de partida (si existe), callback para agregar lineas
- Muestra mes/ano basado en la fecha de la partida (no editable)
- Pre-llena "Ref.Pago" con la referencia de documento
- Lista facturas asociadas solo a esta referencia (no todas las del mes)
- Permite agregar multiples facturas de compra
- Boton sticky "Contabilizar" que:
  - Guarda las facturas en tab_purchase_ledger con journal_entry_id vinculado
  - Calcula automaticamente las lineas de detalle (gastos al Debe, IVA al Debe, Proveedores al Haber)
  - Retorna las lineas al JournalEntryDialog para agregarlas

### 2. Modificar JournalEntryDialog
**Archivo**: `src/components/partidas/JournalEntryDialog.tsx`

Cambios:
- Agregar estado para controlar apertura del LinkedPurchasesModal
- Agregar boton "Agregar desde Compras" junto a "Agregar Linea"
- Implementar callback que recibe las lineas generadas desde el modal y las agrega a detailLines
- El boton solo se muestra cuando:
  - La partida NO esta contabilizada
  - El usuario tiene permisos de crear partidas
  - El periodo no esta cerrado

### 3. Logica de Contabilizacion
Cuando el usuario presione "Contabilizar" en el modal:

1. Guardar todas las facturas en tab_purchase_ledger:
   - Con batch_reference = referencia de documento de la partida
   - Con journal_entry_id vinculado a la partida (si ya existe)

2. Obtener cuentas de configuracion (tab_enterprise_config):
   - vat_credit_account_id (IVA Credito Fiscal)
   - suppliers_account_id (Proveedores)

3. Generar lineas de detalle:
   - DEBE: Cuenta de gasto (por factura) con el monto base
   - DEBE: IVA Credito Fiscal con el total de IVA
   - HABER: Cuenta de Proveedores con el total de facturas

4. Retornar las lineas al dialogo padre para agregarlas

## Consideraciones Tecnicas

### Estructura de Datos
- tab_purchase_ledger ya tiene campo `journal_entry_id` para vincular facturas con partidas
- tab_purchase_ledger ya tiene campo `batch_reference` para agrupar facturas
- tab_enterprise_config contiene las cuentas de IVA y proveedores

### Flujo de Usuario
1. Usuario abre "Nueva Partida"
2. Ingresa fecha (02/02/2026), tipo, referencia (100), descripcion
3. Click en "Agregar desde Compras"
4. Se abre modal mostrando Febrero 2026, Ref.Pago = 100
5. Agrega facturas (proveedor, NIT, total, cuenta de gasto, etc.)
6. Click en "Contabilizar" en el modal
7. Las lineas de detalle se agregan automaticamente a la partida
8. Usuario puede guardar/contabilizar la partida completa

### Beneficios
- Flujo mas intuitivo: primero el cheque, luego las facturas
- Las facturas se filtran solo por la referencia, no muestra todas del mes
- Contabilizacion automatica con cuentas correctas de IVA
- Vinculacion directa entre partida y facturas

---

## Seccion Tecnica

### Interfaces

```typescript
// Props para el nuevo modal
interface LinkedPurchasesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryDate: string;
  documentReference: string;
  journalEntryId?: number;
  onPurchasesPosted: (lines: DetailLine[]) => void;
}

// Estructura de factura en el modal
interface LinkedPurchaseEntry {
  id?: number;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
  base_amount: number;
  vat_amount: number;
  operation_type_id: number | null;
  expense_account_id: number | null;
}
```

### Archivos a Crear
1. `src/components/partidas/LinkedPurchasesModal.tsx` - Modal principal

### Archivos a Modificar
1. `src/components/partidas/JournalEntryDialog.tsx` - Agregar boton y estado para el modal

### Dependencias
No se requieren nuevas dependencias. Se reutilizan componentes existentes:
- Dialog, Button, Input, Select de UI
- AccountCombobox para seleccion de cuentas
- Logica de calculo de IVA existente en LibroCompras

### Validaciones
- Verificar que todas las facturas tengan cuenta de gasto asignada antes de contabilizar
- Verificar que el periodo contable este abierto
- Calcular automaticamente base e IVA (12%) del total
