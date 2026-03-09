import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Search, Home, Building2, Users, Settings, BookOpen, FileText, ShoppingCart, Receipt,
  Calculator, FileBarChart, HelpCircle, ChevronRight, ExternalLink, Lightbulb, AlertCircle,
  FileDown, Bell, Banknote, CalendarDays, ClipboardList, Building, Keyboard, Download,
  MessageCircle, Package, Inbox, Wand2, Key, Wrench,
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import jsPDF from "jspdf";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface HelpSection {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  route?: string;
  isNew?: boolean;
  steps?: { title: string; description: string; }[];
  tips?: string[];
  subsections?: {
    id: string;
    title: string;
    description: string;
    route?: string;
    isNew?: boolean;
    steps?: { title: string; description: string; }[];
    tips?: string[];
  }[];
}

const helpSections: HelpSection[] = [
  {
    id: "inicio",
    title: "Inicio Rápido",
    icon: Key,
    description: "Primeros pasos para comenzar a usar el sistema contable.",
    steps: [
      { title: "Iniciar Sesión", description: "Ingrese su correo electrónico y contraseña. Si olvidó su contraseña, use el enlace 'Olvidé mi contraseña' para recuperarla." },
      { title: "Seleccionar Empresa", description: "La empresa activa se muestra en el selector de la barra superior. Haga clic para cambiar entre empresas." },
      { title: "Navegar el Sistema", description: "Use el menú lateral izquierdo para acceder a las diferentes secciones. El menú se puede colapsar con el ícono de hamburguesa." },
      { title: "Bandeja de Tareas Pendientes", description: "Acceda a /bandeja para ver una cola unificada de acciones pendientes: partidas en borrador, movimientos bancarios sin conciliar, vencimientos próximos y más." },
      { title: "Centro de Notificaciones", description: "El ícono de campana en la barra superior muestra las notificaciones y alertas pendientes del sistema." },
    ],
    tips: [
      "La empresa activa se guarda automáticamente y persistirá entre sesiones y dispositivos.",
      "Use la Bandeja (/bandeja) como punto de partida diario: agrupa todo lo que necesita atención.",
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    icon: Home,
    description: "Panel principal con indicadores clave de la empresa seleccionada.",
    route: "/dashboard",
    steps: [
      { title: "Indicadores Financieros (KPIs)", description: "Visualice Total Activos, Total Pasivos, Utilidad del Mes y Liquidez con variación respecto al mes anterior." },
      { title: "Gráficas Anuales", description: "Gráficas de líneas con las tendencias de Ventas y Compras mensuales del año en curso." },
      { title: "Alerta de Bandeja", description: "Si hay tareas pendientes, el Dashboard muestra un banner de acceso rápido a la Bandeja de Acciones." },
      { title: "Alertas del Dashboard", description: "Alertas de vencimientos próximos de impuestos, períodos sin cerrar y tareas pendientes." },
    ],
    tips: [
      "Los datos se actualizan automáticamente al seleccionar una empresa diferente.",
      "Las alertas en rojo indican vencimientos inmediatos.",
    ],
  },
  {
    id: "bandeja",
    title: "Bandeja de Acciones",
    icon: Inbox,
    description: "Cola unificada de tareas contables pendientes que requieren atención.",
    route: "/bandeja",
    isNew: true,
    steps: [
      { title: "Qué muestra la Bandeja", description: "Agrupa automáticamente: partidas en borrador, movimientos bancarios sin conciliar y vencimientos de impuestos próximos." },
      { title: "Prioridad Visual", description: "Cada elemento muestra su prioridad: Urgente (rojo), Importante (amarillo) o Informativa (azul), con ícono del tipo de tarea." },
      { title: "Botón de Acción Rápida", description: "Cada ítem tiene un botón 'Acción' que lleva directamente a la pantalla correspondiente para resolver la tarea." },
      { title: "Panel de Vista Previa", description: "Al hacer clic en un ítem, el panel derecho muestra un resumen: montos, fechas, número de partida, o descripción." },
      { title: "Filtros por Tipo", description: "Filtre por tipo de tarea: Todos, Partidas, Banca, Vencimientos. Los contadores muestran cuántos hay en cada categoría." },
      { title: "Asistente de Compras desde Bandeja", description: "Desde la Bandeja puede acceder al Asistente de Registro de Facturas de Compra con un flujo guiado de 4 pasos." },
    ],
    tips: [
      "La bandeja se recarga automáticamente cuando cambia la empresa activa.",
      "Las partidas en borrador deben revisarse antes de cerrar el período.",
      "Un vencimiento 'urgente' es aquel que vence en menos de 3 días.",
    ],
  },
  {
    id: "atajos",
    title: "Atajos de Teclado",
    icon: Keyboard,
    description: "Atajos de teclado seguros para navegadores disponibles en todo el sistema.",
    isNew: true,
    steps: [
      { title: "Guardar / Contabilizar — Ctrl+Enter (⌘+Enter en Mac)", description: "En el diálogo de Partida Contable, presione Ctrl+Enter para contabilizar la partida. Sin conflictos con el navegador." },
      { title: "Guardar Borrador — Ctrl+Shift+Enter (⌘+Shift+Enter en Mac)", description: "Guarda el formulario como borrador sin contabilizarlo. Útil para pausar el ingreso y continuar después." },
      { title: "Nuevo Registro — Alt+N", description: "En Libros Fiscales (Compras / Ventas), modal de compras vinculadas y formularios compatibles, Alt+N crea un nuevo registro guardando el actual primero." },
      { title: "Cancelar / Cerrar — Esc", description: "Cierra el diálogo activo cuando no hay cambios pendientes. Si hay cambios, se muestra una confirmación." },
      { title: "Búsqueda Global — Ctrl+K (⌘+K en Mac)", description: "Abre la paleta de búsqueda global para buscar partidas, cuentas, libros fiscales y movimientos bancarios." },
      { title: "Inspector de Saldo — F2 / Alt+B", description: "Dentro de la partida contable, muestra el saldo actual de la cuenta seleccionada en la línea activa." },
      { title: "Ayuda de Atajos — ?", description: "Presione ? en cualquier pantalla (fuera de campos de texto) para ver un resumen de todos los atajos disponibles." },
      { title: "Indicadores de Atajo en Botones", description: "Los botones de acción principal muestran los atajos disponibles junto a las etiquetas (ej: Ctrl+↵, ⌘+Shift+↵)." },
    ],
    tips: [
      "Ctrl+Enter contabiliza si la partida está balanceada; si no, muestra el error de cuadre.",
      "Alt+N reemplaza al antiguo Ctrl+Alt++, eliminado por conflictos con el zoom del navegador.",
      "Los atajos se suprimen cuando el foco está en un campo de texto multilínea o cuando un selector está abierto.",
      "Presione ? para ver un resumen rápido de todos los atajos en cualquier momento.",
    ],
  },
  {
    id: "administracion",
    title: "Administración",
    icon: Wrench,
    description: "Gestión de usuarios, empresas y configuración del sistema.",
    subsections: [
      {
        id: "usuarios",
        title: "Usuarios",
        description: "Gestione los usuarios que tienen acceso al sistema.",
        route: "/usuarios",
        steps: [
          { title: "Ver Usuarios", description: "La lista muestra todos los usuarios con nombre, correo, rol, última actividad y estado (activo/inactivo)." },
          { title: "Indicador de Actividad", description: "Verde (activo recientemente), amarillo (inactivo por horas) o gris (inactivo por días)." },
          { title: "Crear Usuario y Asignar Rol", description: "Haga clic en 'Nuevo Usuario'. Asigne roles: Super Admin, Admin Tenant, Admin Empresa, Contador Senior, Junior o Auxiliar." },
          { title: "Asignar Empresas", description: "Vincule al usuario con las empresas a las que tendrá acceso. Un usuario puede acceder a múltiples empresas." },
        ],
        tips: ["Los usuarios inactivos no pueden iniciar sesión.", "Use la matriz de permisos en Configuración para personalizar los accesos por rol."],
      },
      {
        id: "empresas",
        title: "Empresas",
        description: "Registre y administre las empresas contables.",
        route: "/empresas",
        steps: [
          { title: "Ver y Crear Empresas", description: "Se muestran todas las empresas con NIT, régimen fiscal, períodos activos y documentos. Haga clic en 'Nueva Empresa' para crear una." },
          { title: "Asistente de Configuración", description: "El asistente guía paso a paso la configuración inicial: catálogo de cuentas, cuentas especiales, formularios y más." },
          { title: "Cambiar Empresa Activa", description: "Haga clic en el selector de empresa en la barra superior. El sistema valida que tenga acceso y persiste la selección." },
          { title: "Documentos y Backup", description: "En la pestaña 'Documentos', suba archivos importantes. Use el botón de descarga para exportar la empresa a Excel." },
        ],
        tips: ["El selector de empresa persiste la selección entre sesiones y dispositivos.", "Use el asistente de configuración para empresas nuevas."],
      },
      {
        id: "bitacora",
        title: "Bitácora de Auditoría",
        description: "Registro de todas las acciones realizadas en el sistema.",
        route: "/bitacora",
        isNew: true,
        steps: [
          { title: "Ver Registro de Acciones", description: "La bitácora muestra todas las operaciones: quién, qué, cuándo y desde dónde se realizó cada acción." },
          { title: "Filtrar por Tabla, Acción o Usuario", description: "Filtre por tabla afectada, tipo de acción (INSERT, UPDATE, DELETE) o usuario específico." },
          { title: "Ver Detalle de Cambios", description: "Haga clic en 'Ver detalles' para ver los valores anteriores y nuevos de cada campo modificado." },
        ],
        tips: ["La bitácora es de solo lectura.", "Use los filtros de fecha para acotar la búsqueda a un período específico."],
      },
      {
        id: "configuracion",
        title: "Configuración",
        description: "Configure parámetros especiales del sistema contable.",
        route: "/configuracion",
        steps: [
          { title: "Cuentas Contables Especiales", description: "Defina cuentas de IVA, Compras, Ventas, Clientes, Proveedores, Inventario y Resultado del Período para partidas automáticas." },
          { title: "Estados Financieros", description: "Diseñe el formato del Balance General y Estado de Resultados. Cree secciones y asigne las cuentas correspondientes." },
          { title: "Formularios, Vencimientos y Alertas", description: "Configure formularios SAT, fechas de vencimiento de impuestos y días de anticipación para alertas." },
          { title: "Tipos de Operaciones y Documentos FEL", description: "Defina tipos de operación para clasificar compras/ventas y los tipos de documento FEL con su comportamiento." },
          { title: "Prefijos de Partidas y Matriz de Permisos", description: "Configure prefijos para numerar partidas (PD, PA, PC) y permisos por rol (ver, crear, editar, aprobar)." },
          { title: "Validación de Integridad Contable", description: "Auditoría automática con 25+ reglas en 7 categorías. Genera puntaje de salud contable con detalle de errores." },
          { title: "Respaldo y Restauración", description: "Exporte toda la información en formato JSON. Restaure o clone datos desde un archivo de respaldo." },
        ],
        tips: ["Configure cuentas especiales antes de importar compras/ventas.", "Ejecute la validación de integridad antes de cerrar períodos."],
      },
      {
        id: "notificaciones",
        title: "Notificaciones y Recordatorios",
        description: "Gestione las alertas y recordatorios del sistema.",
        route: "/notificaciones",
        isNew: true,
        steps: [
          { title: "Centro de Notificaciones", description: "Acceda desde el ícono de campana. Muestra todas las alertas con su prioridad." },
          { title: "Tipos de Notificaciones", description: "Vencimientos de impuestos, recordatorios personalizados, alertas del sistema y avisos de tareas pendientes." },
          { title: "Crear Recordatorio Personalizado", description: "Haga clic en 'Nuevo Recordatorio' para crear una alerta con fecha, título, descripción y prioridad (Urgente, Importante, Informativa)." },
        ],
        tips: ["Las notificaciones urgentes aparecen destacadas en el Dashboard.", "Configure en Configuración → Alertas cuántos días antes se generan los avisos."],
      },
    ],
  },
  {
    id: "contabilidad",
    title: "Contabilidad",
    icon: BookOpen,
    description: "Registro de operaciones contables, libros fiscales, conciliación y declaraciones.",
    subsections: [
      {
        id: "cuentas",
        title: "Catálogo de Cuentas",
        description: "Administre el plan de cuentas contables de la empresa.",
        route: "/cuentas",
        steps: [
          { title: "Ver Catálogo en Árbol Jerárquico", description: "Formato de árbol. Use la búsqueda para filtrar por código o nombre de cuenta." },
          { title: "Crear Cuenta Manual", description: "Haga clic en 'Nueva Cuenta' e ingrese: Código, Nombre, Tipo, Tipo de Saldo y si permite movimientos." },
          { title: "Cuenta Bancaria", description: "Marque 'Es cuenta bancaria' para cuentas de bancos. Aparecerán en Conciliación Bancaria." },
          { title: "Importar CSV o Copiar de Otra Empresa", description: "Suba un archivo CSV con el catálogo o use 'Copiar Catálogo' para duplicar el de otra empresa." },
        ],
        tips: ["Las cuentas con 'Permite Movimiento = No' son de título y no reciben asientos directos.", "Tipo de Saldo 'Indiferente': permite saldo deudor o acreedor sin validación de sobregiro."],
      },
      {
        id: "partidas",
        title: "Partidas (Libro Diario)",
        description: "Registre asientos contables manuales y automáticos.",
        route: "/partidas",
        steps: [
          { title: "Ver y Filtrar Partidas", description: "Lista todas las partidas con número, fecha, descripción, totales y estado. Filtre por mes/año, tipo y estado." },
          { title: "Crear Partida con Atajos de Teclado", description: "Haga clic en 'Nueva Partida'. Use Ctrl+Enter para contabilizar o Ctrl+Shift+Enter para guardar borrador." },
          { title: "Numeración Automática (PREFIX-YYYY-MM-####)", description: "Cada partida recibe un correlativo automático con formato PREFIX-YYYY-MM-#### (ej: PD-2021-03-0001). El número se asigna al contabilizar, no al crear el borrador. Las reversiones usan REV-YYYY-MM-####." },
          { title: "Agregar Líneas de Detalle", description: "Para cada línea: seleccione una cuenta (busque por código o nombre), ingrese descripción y monto al Debe o al Haber." },
          { title: "Validación en Tiempo Real", description: "La barra de totales muestra en verde cuando Debe = Haber. Solo se puede contabilizar si está cuadrada y sin sobregiro." },
          { title: "Anular Partida", description: "Las partidas contabilizadas pueden anularse registrando el motivo. Se genera automáticamente una partida de reversión con correlativo REV-YYYY-MM-####. Queda registrado en la bitácora." },
        ],
        tips: [
          "Use Ctrl+Enter en el diálogo para contabilizar sin hacer clic en el botón.",
          "Los borradores aparecen en la Bandeja de Acciones para facilitar su seguimiento.",
          "El correlativo se reinicia mensualmente por empresa y prefijo (PD, PA, PC, REV, VENT, COMP, DEP, BAJA).",
        ],
      },
      {
        id: "libros-fiscales",
        title: "Compras y Ventas (Libros Fiscales)",
        description: "Registre e importe las compras y ventas para los libros de IVA.",
        route: "/libros-fiscales",
        steps: [
          { title: "Seleccionar Mes y Pestaña", description: "Use los selectores de Mes y Año. Cambie entre pestaña Compras y Ventas. El libro se crea automáticamente si no existe." },
          { title: "Ingreso Rápido con Alt+N", description: "Presione Alt+N para crear un nuevo registro. El sistema guarda el actual antes de crear el nuevo." },
          { title: "Autoguardado Inteligente", description: "Los cambios se guardan automáticamente. El indicador muestra el estado (Guardando… / Guardado)." },
          { title: "Importar desde SAT (CSV o PDF)", description: "Haga clic en 'Importar'. Suba el CSV del portal SAT o el PDF de consulta de compras. El sistema extrae los datos automáticamente." },
          { title: "Generar Partida Automática del Mes", description: "Haga clic en 'Generar Partida' para crear el asiento contable del mes. Requiere cuentas especiales configuradas." },
        ],
        tips: ["Alt+N es la forma más rápida de capturar múltiples facturas en secuencia.", "Los archivos CSV del SAT no deben modificarse antes de importar."],
      },
      {
        id: "asistente-compras",
        title: "Asistente de Registro de Compras",
        description: "Flujo guiado de 4 pasos para registrar facturas de compra con vista previa del asiento contable.",
        route: "/bandeja",
        isNew: true,
        steps: [
          { title: "Acceder al Asistente", description: "Desde la Bandeja de Acciones, haga clic en 'Nueva Compra' para abrir el asistente de 4 pasos." },
          { title: "Paso 1 — Datos del Proveedor", description: "Ingrese NIT, nombre del proveedor, serie y número de factura, y fecha de emisión." },
          { title: "Paso 2 — Montos e IVA", description: "Ingrese el monto total. El sistema calcula automáticamente la base imponible y el IVA (12%). Ajuste si aplica IDP u otro régimen." },
          { title: "Paso 3 — Cuenta Contable", description: "Seleccione la cuenta de gasto o costo. El sistema sugiere la cuenta usada previamente." },
          { title: "Paso 4 — Confirmación con Vista Previa", description: "Vea el asiento contable resultante (Debe/Haber) en tiempo real antes de guardar. Puede volver a cualquier paso." },
        ],
        tips: ["La vista previa del asiento se actualiza en tiempo real conforme ingresa los datos.", "El asistente valida cada paso antes de avanzar al siguiente."],
      },
      {
        id: "conciliacion",
        title: "Conciliación Bancaria",
        description: "Concilie los movimientos bancarios con los registros contables.",
        route: "/conciliacion",
        isNew: true,
        steps: [
          { title: "Seleccionar Cuenta e Importar Estado", description: "Elija la cuenta bancaria y suba el Excel/CSV del estado de cuenta. Configure el mapeo de columnas." },
          { title: "Guardar Plantilla de Mapeo", description: "Guarde el mapeo de columnas como plantilla para futuras importaciones del mismo banco." },
          { title: "Vincular con Partidas y Conciliar", description: "Asocie cada movimiento bancario con la partida correspondiente y márquelo como conciliado." },
        ],
        tips: ["Los movimientos sin conciliar aparecen en la Bandeja de Acciones.", "Los movimientos conciliados no pueden ser modificados."],
      },
      {
        id: "formularios",
        title: "Formularios de Impuestos",
        description: "Registre los formularios SAT pagados.",
        route: "/formularios-impuestos",
        steps: [
          { title: "Ver y Agregar Formularios", description: "Lista todos los formularios. Ingrese manualmente o suba el PDF de la constancia del SAT para extracción automática." },
          { title: "Subir PDF Respaldo", description: "Adjunte el PDF de la constancia de pago para tenerlo archivado en el sistema." },
        ],
        tips: ["El código de acceso es el que aparece en la constancia de pago del SAT.", "Los formularios pagados generan notificaciones al acercarse el siguiente vencimiento."],
      },
      {
        id: "declaracion",
        title: "Generar Declaración",
        description: "Calcule automáticamente los impuestos del período.",
        route: "/generar-declaracion",
        steps: [
          { title: "Seleccionar Período y Tipo", description: "Elija el Mes, Año y tipo de formulario: IVA General, Pequeño Contribuyente, ISR Trimestral, ISO, etc." },
          { title: "Generar Cálculo y Exportar Anexos", description: "El sistema calcula Débito Fiscal, Crédito Fiscal e IVA a Pagar. Descargue los anexos de compras y ventas en Excel." },
        ],
        tips: ["Verifique que todas las facturas estén importadas antes de generar la declaración.", "Puede generar múltiples veces si agrega más facturas."],
      },
    ],
  },
  {
    id: "activos-fijos",
    title: "Activos Fijos",
    icon: Package,
    description: "Gestión completa del ciclo de vida de activos fijos: registro, depreciación y baja.",
    route: "/activos-fijos",
    isNew: true,
    steps: [
      { title: "Ver Inventario de Activos", description: "Lista todos los activos con código, nombre, categoría, costo de adquisición, vida útil, valor en libros y estado (Activo / Depreciado / Dado de Baja)." },
      { title: "Registrar Nuevo Activo", description: "Haga clic en 'Nuevo Activo'. Complete: Código, Nombre, Categoría, Fecha de adquisición, Costo, Vida útil (meses), Valor residual, Proveedor, Custodio y Ubicación." },
      { title: "Activar y Generar Calendario de Depreciación", description: "Al activar un activo, el sistema genera automáticamente el calendario completo de depreciaciones mes a mes hasta el final de su vida útil." },
      { title: "Categorías con Cuentas Contables", description: "Las categorías agrupan activos similares (Equipo de Cómputo, Mobiliario, Vehículos) y definen las cuentas de activo, depreciación acumulada y gasto." },
      { title: "Política de Depreciación", description: "Configure el método (Línea Recta), regla de inicio (primer día del mes o mes siguiente), frecuencia de contabilización y decimales de redondeo." },
      { title: "Contabilizar Depreciaciones del Mes", description: "En 'Contabilizar Depreciaciones', seleccione el mes y haga clic en 'Contabilizar'. El sistema crea una partida por activo automáticamente." },
      { title: "Dar de Baja un Activo", description: "Use el asistente de Baja: ingrese motivo, fecha y monto de venta (si aplica). El sistema genera la partida contable de baja automáticamente." },
      { title: "Reportes y Configuración del Módulo", description: "Genere reportes de inventario y calendario de depreciaciones. En 'Configuración' registre custodios, ubicaciones y proveedores." },
    ],
    tips: [
      "Configure las categorías con cuentas contables correctas antes de registrar activos.",
      "Valor en libros = Costo de adquisición − Depreciación acumulada − Valor residual.",
      "Los activos completamente depreciados pasan a estado 'Depreciado' pero pueden seguir en uso.",
      "Use el módulo de reportes para auditorías de activos y control de inventario físico.",
    ],
  },
  {
    id: "consultas",
    title: "Consultas",
    icon: FileBarChart,
    description: "Consulte saldos y movimientos de cuentas.",
    subsections: [
      {
        id: "saldos",
        title: "Saldos de Cuentas",
        description: "Balance de comprobación con todas las cuentas.",
        route: "/saldos",
        steps: [
          { title: "Seleccionar Fecha de Corte", description: "Elija la fecha. Se mostrarán los saldos acumulados hasta esa fecha en formato árbol." },
          { title: "Exportar a Excel", description: "Descargue el balance de comprobación en formato Excel." },
        ],
        tips: ["Use esta consulta para verificar que la contabilidad está cuadrada antes de generar estados financieros."],
      },
      {
        id: "saldos-mensuales",
        title: "Saldos Mensuales",
        description: "Evolución de saldos mes a mes.",
        route: "/saldos-mensuales",
        isNew: true,
        steps: [
          { title: "Seleccionar Año", description: "Elija el año fiscal para ver la evolución mensual (12 columnas de meses)." },
          { title: "Análisis de Variaciones", description: "Compare cómo han cambiado los saldos de mes a mes para identificar tendencias y proyecciones." },
        ],
        tips: ["Las celdas vacías indican que la cuenta no tuvo movimientos ese mes."],
      },
      {
        id: "mayor",
        title: "Mayor General",
        description: "Detalle de movimientos por cuenta.",
        route: "/mayor",
        steps: [
          { title: "Seleccionar Cuenta y Rango de Fechas", description: "Use el buscador para seleccionar la cuenta y defina el período a consultar." },
          { title: "Ver Movimientos y Exportar", description: "Se muestran todos los asientos que afectaron la cuenta con saldo acumulado. Exporte a Excel o PDF." },
        ],
        tips: ["Haga clic en el número de partida para ver el detalle completo del asiento."],
      },
    ],
  },
  {
    id: "reportes",
    title: "Reportes",
    icon: FileText,
    description: "Genere y exporte reportes contables y fiscales.",
    route: "/reportes",
    steps: [
      { title: "Reporte de Compras y Ventas", description: "Exporte el libro de compras o ventas de un mes específico a Excel o PDF con todos los detalles fiscales." },
      { title: "Reporte de Partidas y Libro Mayor", description: "Liste partidas de un período o el mayor general de cuentas. Filtre por tipo, estado y rango de fechas." },
      { title: "Balance General", description: "Genera el Estado de Situación Financiera a una fecha de corte usando el formato personalizado configurado." },
      { title: "Estado de Resultados", description: "Genera el Estado de Pérdidas y Ganancias para un período. Muestra Ingresos, Costos, Gastos y Utilidad/Pérdida Neta." },
      { title: "Exportar Folios", description: "Exporte los folios de compras o ventas en el formato requerido por la SAT para libros autorizados." },
    ],
    tips: [
      "Los reportes de Balance y Estado de Resultados usan el formato personalizado si está configurado.",
      "Puede exportar a Excel para análisis adicional o a PDF para presentación.",
    ],
  },
  {
    id: "backup",
    title: "Respaldo y Restauración",
    icon: Download,
    description: "Exporte, restaure y clone la información completa de cada empresa.",
    isNew: true,
    steps: [
      { title: "Backup Excel (por Empresa)", description: "En la sección Empresas, cada tarjeta tiene un botón de descarga para generar un backup en Excel con hojas separadas por tabla." },
      { title: "Backup JSON Completo", description: "En Configuración → Respaldo, exporte el backup JSON que incluye 28+ tablas y preserva todas las relaciones entre registros." },
      { title: "Restaurar o Clonar Datos", description: "Suba un archivo JSON. Elija 'Restaurar en esta empresa' para reemplazar datos o 'Clonar' para importar sin borrar los existentes." },
      { title: "Historial de Respaldos", description: "El sistema registra cada operación de respaldo con fecha, usuario y conteo de registros." },
    ],
    tips: [
      "El backup JSON es el formato recomendado para restauraciones y migraciones completas.",
      "Solo roles Super Admin y Admin Empresa pueden realizar respaldos y restauraciones.",
    ],
  },
];

const faqItems = [
  {
    question: "¿Cómo cambio la empresa activa?",
    answer: "Haga clic en el selector de empresa en la barra superior. El sistema valida automáticamente que tenga acceso y persiste la selección entre sesiones y dispositivos.",
  },
  {
    question: "¿Qué es la Bandeja de Acciones?",
    answer: "Es una cola unificada en /bandeja que agrupa todo lo que necesita atención: partidas en borrador, movimientos bancarios sin conciliar y vencimientos de impuestos próximos. Es el punto de partida diario recomendado.",
  },
  {
    question: "¿Cómo uso el atajo Alt+N para ingreso rápido?",
    answer: "En la pantalla de Compras, Ventas o Libros Fiscales, presione Alt+N para crear un nuevo registro. El sistema guarda automáticamente el registro actual antes. Alt+N reemplaza al antiguo Ctrl+Alt++ que fue eliminado.",
  },
  {
    question: "¿Cómo contabilizo una partida rápidamente?",
    answer: "Con el diálogo de partida abierto, presione Ctrl+Enter (⌘+Enter en Mac) para contabilizar, o Ctrl+Shift+Enter para guardar como borrador. Los atajos se muestran junto a los botones de acción.",
  },
  {
    question: "¿Por qué no puedo eliminar una cuenta?",
    answer: "Las cuentas con movimientos registrados no pueden eliminarse para mantener la integridad contable. Puede desactivarlas si ya no las necesita.",
  },
  {
    question: "¿Cómo corrijo una partida contabilizada?",
    answer: "Las partidas contabilizadas no se pueden editar directamente. Puede anularla (registrando el motivo) y crear una nueva partida correcta, o crear una partida de ajuste.",
  },
  {
    question: "¿Por qué aparece 'Sobregiro detectado' al guardar una partida?",
    answer: "Ocurre cuando el movimiento dejaría una cuenta con saldo contrario a su naturaleza. Verifique los montos o use una cuenta con tipo de saldo 'Indiferente'.",
  },
  {
    question: "¿Cómo importo facturas del SAT?",
    answer: "Vaya a Contabilidad → Compras y Ventas, seleccione el mes, y haga clic en 'Importar'. Suba el archivo CSV o PDF descargado del portal SAT sin modificarlo.",
  },
  {
    question: "¿Qué es el Asistente de Registro de Compras?",
    answer: "Es un flujo guiado de 4 pasos accesible desde la Bandeja de Acciones para registrar facturas de compra. Incluye vista previa del asiento contable en tiempo real antes de confirmar.",
  },
  {
    question: "¿Cómo registro y deprecio un Activo Fijo?",
    answer: "Vaya a Activos Fijos, haga clic en 'Nuevo Activo' y complete los datos. Al activarlo, el sistema genera el calendario de depreciaciones automáticamente. En 'Contabilizar Depreciaciones' seleccione el mes para crear las partidas.",
  },
  {
    question: "¿Cómo configuro las categorías de Activos Fijos?",
    answer: "En Activos Fijos → Configuración → Categorías. Defina el nombre, código y las cuentas contables de activo, depreciación acumulada y gasto de depreciación para cada categoría.",
  },
  {
    question: "¿Cómo doy de baja un activo?",
    answer: "En el listado de Activos Fijos, haga clic en el activo y use el botón 'Dar de Baja'. El asistente solicita motivo, fecha y monto de venta (si aplica). El sistema genera la partida contable automáticamente.",
  },
  {
    question: "¿Dónde configuro las cuentas para partidas automáticas?",
    answer: "En Configuración → Cuentas Contables Especiales. Defina las cuentas de IVA, Compras, Ventas, Clientes y Proveedores que se usarán al generar partidas automáticas.",
  },
  {
    question: "¿Cómo personalizo el formato del Balance General?",
    answer: "Vaya a Configuración → Estados Financieros. Seleccione 'Balance General', cree las secciones (Activo, Pasivo, Capital) y asigne las cuentas correspondientes.",
  },
  {
    question: "¿Qué es la Validación de Integridad Contable?",
    answer: "Es una auditoría automática que verifica 25+ reglas en 7 categorías: integridad de partidas, cuentas, períodos, fiscal, bancos, balance y costo de ventas. Genera un puntaje de salud y detalla los errores. Acceda desde Configuración → Integridad.",
  },
  {
    question: "¿Qué significan los colores del puntaje de integridad?",
    answer: "Verde (95-100%): excelente. Amarillo (80-95%): hay advertencias que revisar. Rojo (menos del 80%): existen errores críticos que deben corregirse antes de generar reportes o cerrar períodos.",
  },
  {
    question: "¿Puedo importar estados de cuenta bancarios?",
    answer: "Sí, en el módulo de Conciliación Bancaria puede importar archivos Excel o CSV de estados de cuenta. Configure el mapeo de columnas y guárdelo como plantilla para futuras importaciones.",
  },
  {
    question: "¿Cómo hago un respaldo completo de la empresa?",
    answer: "Vaya a Configuración → Respaldo y haga clic en 'Exportar Respaldo Completo (JSON)'. Este formato incluye todas las tablas y preserva las relaciones. También puede usar el botón de descarga Excel en la tarjeta de la empresa.",
  },
  {
    question: "¿Puedo restaurar un respaldo en otra empresa?",
    answer: "Sí, use el modo 'Clonar a esta empresa' en Configuración → Respaldo. El sistema genera nuevos identificadores y reasigna todas las relaciones automáticamente. Ideal para crear empresas de prueba.",
  },
];

const Ayuda = () => {
  const { currentTenant } = useTenant();
  const [searchQuery, setSearchQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Listen on the nearest scrollable parent (MainLayout's scroll area)
    const el = scrollContainerRef.current?.closest("[data-radix-scroll-area-viewport]") as HTMLElement | null
      ?? scrollContainerRef.current?.closest(".overflow-y-auto") as HTMLElement | null
      ?? window as unknown as HTMLElement;

    const onScroll = () => {
      const scrollTop = el === (window as unknown as HTMLElement)
        ? window.scrollY
        : (el as HTMLElement).scrollTop;
      setScrolled(scrollTop > 60);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;
    let y = 20;
    const lineHeight = 6;
    const maxWidth = pageWidth - margin * 2;

    const addText = (text: string, fontSize: number, isBold: boolean = false, indent: number = 0) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      const lines = doc.splitTextToSize(text, maxWidth - indent);
      doc.text(lines, margin + indent, y);
      y += lines.length * lineHeight;
    };

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Centro de Ayuda - Manual de Usuario", margin, y);
    y += 15;

    helpSections.forEach((section) => {
      if (y > 250) { doc.addPage(); y = 20; }
      addText(`■ ${section.title}`, 14, true);
      addText(section.description, 10, false, 4);
      y += 3;
      if (section.steps) {
        section.steps.forEach((step, idx) => {
          addText(`${idx + 1}. ${step.title}`, 10, true, 6);
          addText(step.description, 9, false, 10);
        });
      }
      if (section.tips) {
        addText("Tips:", 10, true, 6);
        section.tips.forEach((tip) => { addText(`• ${tip}`, 9, false, 10); });
      }
      if (section.subsections) {
        section.subsections.forEach((sub) => {
          if (y > 250) { doc.addPage(); y = 20; }
          addText(`► ${sub.title}`, 11, true, 6);
          addText(sub.description, 9, false, 10);
          if (sub.steps) {
            sub.steps.forEach((step, idx) => {
              addText(`${idx + 1}. ${step.title}`, 9, true, 12);
              addText(step.description, 8, false, 16);
            });
          }
          if (sub.tips) {
            addText("Tips:", 9, true, 12);
            sub.tips.forEach((tip) => { addText(`• ${tip}`, 8, false, 16); });
          }
          y += 2;
        });
      }
      y += 5;
    });

    if (y > 230) { doc.addPage(); y = 20; }
    y += 5;
    addText("PREGUNTAS FRECUENTES", 14, true);
    y += 3;
    faqItems.forEach((item, idx) => {
      if (y > 250) { doc.addPage(); y = 20; }
      addText(`${idx + 1}. ${item.question}`, 10, true, 4);
      addText(item.answer, 9, false, 8);
      y += 3;
    });

    doc.save("Manual_de_Ayuda.pdf");
  };

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return helpSections;
    const query = searchQuery.toLowerCase();
    return helpSections.filter((section) => {
      const matchesMain =
        section.title.toLowerCase().includes(query) ||
        section.description.toLowerCase().includes(query) ||
        section.steps?.some((s) => s.title.toLowerCase().includes(query) || s.description.toLowerCase().includes(query));
      const matchesSub = section.subsections?.some(
        (sub) =>
          sub.title.toLowerCase().includes(query) ||
          sub.description.toLowerCase().includes(query) ||
          sub.steps?.some((s) => s.title.toLowerCase().includes(query) || s.description.toLowerCase().includes(query)),
      );
      return matchesMain || matchesSub;
    });
  }, [searchQuery]);

  const filteredFaq = useMemo(() => {
    if (!searchQuery.trim()) return faqItems;
    const query = searchQuery.toLowerCase();
    return faqItems.filter(
      (item) => item.question.toLowerCase().includes(query) || item.answer.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  const renderSteps = (steps: { title: string; description: string }[]) => (
    <div className="space-y-3 mt-4">
      {steps.map((step, idx) => (
        <div key={idx} className="flex gap-3">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
            {idx + 1}
          </div>
          <div>
            <p className="font-medium text-foreground">{step.title}</p>
            <p className="text-sm text-muted-foreground">{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  );

  const renderTips = (tips: string[]) => (
    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
        <Lightbulb className="h-4 w-4" />
        <span className="font-medium text-sm">Tips</span>
      </div>
      <ul className="space-y-1">
        {tips.map((tip, idx) => (
          <li key={idx} className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <ChevronRight className="h-3 w-3 mt-1 flex-shrink-0" />
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );

  const renderSection = (section: HelpSection) => (
    <Card key={section.id} className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <section.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {section.title}
                {section.isNew && <Badge variant="secondary" className="text-xs">Nuevo</Badge>}
              </CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </div>
          </div>
          {section.route && (
            <Button variant="outline" size="sm" asChild>
              <Link to={section.route}>
                Ir a sección <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {section.steps && renderSteps(section.steps)}
        {section.tips && renderTips(section.tips)}
        {section.subsections && (
          <Accordion type="single" collapsible className="mt-4">
            {section.subsections.map((sub) => (
              <AccordionItem key={sub.id} value={sub.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2 text-left">
                    <span className="font-medium">{sub.title}</span>
                    {sub.isNew && <Badge variant="secondary" className="text-xs">Nuevo</Badge>}
                    {sub.route && <Badge variant="outline" className="text-xs font-normal">{sub.route}</Badge>}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <p className="text-muted-foreground mb-4">{sub.description}</p>
                  {sub.steps && renderSteps(sub.steps)}
                  {sub.tips && renderTips(sub.tips)}
                  {sub.route && (
                    <Button variant="outline" size="sm" className="mt-4" asChild>
                      <Link to={sub.route}>
                        Ir a {sub.title} <ExternalLink className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );

  const whatsappNumber = "50254135354";
  const whatsappMessage = encodeURIComponent(
    `Hola!, necesito apoyo con Sistema contable en ${currentTenant?.tenant_name || "mi empresa"}`,
  );
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${whatsappMessage}`;

  return (
    <div ref={scrollContainerRef} className="container mx-auto py-6 max-w-5xl">
      <div className="sticky top-0 z-10 bg-background -mx-6 px-6 pt-0 border-b mb-6 transition-all duration-300">

        {/* Title row — always visible, shrinks on scroll */}
        <div className={`flex items-center justify-between transition-all duration-300 ${scrolled ? "py-2" : "pt-0 pb-3"}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`rounded-lg bg-primary/10 transition-all duration-300 flex-shrink-0 ${scrolled ? "p-1.5" : "p-2"}`}>
              <HelpCircle className={`text-primary transition-all duration-300 ${scrolled ? "h-4 w-4" : "h-6 w-6"}`} />
            </div>
            <h1 className={`font-bold text-foreground transition-all duration-300 flex-shrink-0 ${scrolled ? "text-lg" : "text-3xl"}`}>
              Centro de Ayuda
            </h1>

            {/* Mini section icons — appear only when scrolled/collapsed */}
            <div
              className="flex items-center gap-1 overflow-hidden transition-all duration-300"
              style={{ maxWidth: scrolled ? "400px" : "0px", opacity: scrolled ? 1 : 0 }}
            >
              <div className="w-px h-4 bg-border mx-1 flex-shrink-0" />
              {helpSections.slice(0, 5).map((section) => (
                <button
                  key={section.id}
                  title={section.title}
                  onClick={() => {
                    setExpandedSection(section.id);
                    document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="p-1.5 rounded-md hover:bg-accent transition-colors flex-shrink-0 group relative"
                >
                  <section.icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              ))}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Servicio Técnico WhatsApp"
                className="p-1.5 rounded-md hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors flex-shrink-0"
              >
                <MessageCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              </a>
            </div>
          </div>

          <Button onClick={handleExportPDF} variant="outline" size={scrolled ? "sm" : "default"} className="flex-shrink-0">
            <FileDown className="h-4 w-4 mr-2" />
            {scrolled ? "PDF" : "Exportar PDF"}
          </Button>
        </div>

        {/* Subtitle — hidden when scrolled */}
        <div
          className="overflow-hidden transition-all duration-300"
          style={{ maxHeight: scrolled ? "0px" : "40px", opacity: scrolled ? 0 : 1 }}
        >
          <p className="text-muted-foreground pb-3">
            Manual de usuario interactivo. Encuentre instrucciones detalladas sobre cómo utilizar cada función del sistema.
          </p>
        </div>

        {/* Search bar — always visible */}
        <div className={`relative transition-all duration-300 ${scrolled ? "mb-2" : "mb-4"}`}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en el manual... (ej: activos fijos, bandeja, alt+n, partidas)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category cards — collapse when scrolled */}
        <div
          className="overflow-hidden transition-all duration-300"
          style={{
            maxHeight: scrolled ? "0px" : "200px",
            opacity: scrolled ? 0 : 1,
            marginBottom: scrolled ? "0px" : "16px",
            pointerEvents: scrolled ? "none" : "auto",
          }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pb-4">
            {helpSections.slice(0, 5).map((section) => (
              <button
                key={section.id}
                onClick={() => {
                  setExpandedSection(section.id);
                  document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" });
                }}
                className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
              >
                <section.icon className="h-5 w-5 text-primary mb-2" />
                <p className="font-medium text-sm">{section.title}</p>
                {section.isNew && <Badge variant="secondary" className="text-xs mt-1">Nuevo</Badge>}
              </button>
            ))}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-lg border bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors text-left"
            >
              <MessageCircle className="h-5 w-5 text-green-600 dark:text-green-400 mb-2" />
              <p className="font-medium text-sm text-green-700 dark:text-green-300">Servicio Técnico</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">WhatsApp</p>
            </a>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-foreground">Guía por Módulos</h2>
        {filteredSections.length === 0 ? (
          <Card className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No se encontraron resultados para "{searchQuery}"</p>
            <Button variant="link" onClick={() => setSearchQuery("")}>Limpiar búsqueda</Button>
          </Card>
        ) : (
          filteredSections.map((section) => (
            <div key={section.id} id={section.id}>
              {renderSection(section)}
            </div>
          ))
        )}
      </div>

      <Separator className="my-8" />

      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-primary" />
          Preguntas Frecuentes
        </h2>
        <Accordion type="single" collapsible className="space-y-2">
          {filteredFaq.map((item, idx) => (
            <AccordionItem key={idx} value={`faq-${idx}`} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline text-left">{item.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="mt-12 p-6 bg-muted/30 rounded-lg text-center">
        <p className="text-muted-foreground">
          ¿No encontró lo que buscaba? Contacte a soporte técnico para asistencia adicional.
        </p>
      </div>
    </div>
  );
};

export default Ayuda;
