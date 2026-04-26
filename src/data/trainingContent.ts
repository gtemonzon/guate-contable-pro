import { Building2, BookOpen, FileText, Receipt, Calculator, Banknote, Package, ShoppingCart, FileBarChart, Settings, Users, ClipboardList, Inbox, CalendarDays, LucideIcon } from "lucide-react";

export interface Lesson {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  route?: string;
  content: string[];
  tips?: string[];
}

export interface Phase {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  description: string;
  lessons: Lesson[];
}

export const TRAINING_PHASES: Phase[] = [
  {
    id: "phase-1",
    number: 1,
    title: "Fundamentos y Configuración Inicial",
    subtitle: "Prepara tu empresa antes de operar",
    description: "Aprende a configurar tu organización: empresas, catálogo de cuentas, períodos contables y parámetros básicos. Sin esta base, los módulos siguientes no funcionarán correctamente.",
    lessons: [
      {
        id: "1.2-empresas",
        title: "Empresas",
        description: "Crear y configurar las empresas que llevarás contablemente.",
        icon: Building2,
        route: "/empresas",
        content: [
          "Cada empresa requiere: NIT válido (algoritmo Módulo 11 de Guatemala), razón social, régimen fiscal y moneda base.",
          "Desde el diálogo de empresa configuras: monedas adicionales, períodos contables, impuestos a los que está sujeta, autorizaciones de libros (SAT) y documentos legales.",
          "El asistente de configuración inicial (Setup Wizard) te guía paso a paso al crear una empresa nueva.",
        ],
        tips: ["Activa solo los impuestos que la empresa realmente declara (IVA, ISR Trimestral, ISR Mensual, etc.)."],
      },
      {
        id: "1.3-cuentas",
        title: "Catálogo de Cuentas",
        description: "Diseña tu plan contable jerárquico.",
        icon: BookOpen,
        route: "/cuentas",
        content: [
          "El catálogo es jerárquico: el nivel se deriva automáticamente de la cantidad de segmentos del código (1, 1.1, 1.1.01...).",
          "Marca las cuentas que permiten movimiento (hojas) y las que son de título (totalizadoras).",
          "Define cuentas como bancarias, monetarias en moneda extranjera o de tipo indiferente según sea necesario.",
          "Puedes copiar el catálogo de otra empresa para acelerar la configuración.",
        ],
        tips: ["Importa tu catálogo desde Excel/CSV si ya lo tienes preparado."],
      },
      {
        id: "1.4-periodos",
        title: "Períodos Contables",
        description: "Define los períodos en los que se registrarán partidas.",
        icon: CalendarDays,
        route: "/empresas",
        content: [
          "Los períodos se gestionan dentro del diálogo de la empresa, en la pestaña 'Períodos Contables'.",
          "Cada período tiene fechas de inicio/fin y un estado: abierto o cerrado.",
          "Solo se pueden registrar o editar partidas en períodos abiertos.",
          "El cierre de período se hace mediante el Asistente de Cierre, que valida y genera partidas automáticas (CDV, CIER, traslado a capital).",
        ],
      },
      {
        id: "1.5-configuracion",
        title: "Cuentas Especiales y Configuración",
        description: "Vincula cuentas para procesos automatizados.",
        icon: Settings,
        route: "/configuracion",
        content: [
          "En Configuración debes asignar las cuentas especiales: IVA débito/crédito, Clientes, Proveedores, Ventas, Compras, Inventario, Costo de Ventas, Resultado del Período, Utilidades Retenidas, Diferencial cambiario, etc.",
          "Estas cuentas son utilizadas por los módulos automatizados (libros fiscales, cierre, revaluación cambiaria).",
          "También configuras: prefijos de partidas, tipos de operación, días feriados, tipos de cambio, alertas y la matriz de permisos.",
        ],
        tips: ["Sin estas cuentas vinculadas, los módulos de Compras, Ventas y Cierre no podrán generar partidas."],
      },
      {
        id: "1.6-usuarios",
        title: "Usuarios y Permisos",
        description: "Crea usuarios y asigna roles por empresa.",
        icon: Users,
        route: "/usuarios",
        content: [
          "Los usuarios pueden tener acceso a una o varias empresas.",
          "Roles disponibles: super_admin, enterprise_admin, contador_senior, contador_junior, auxiliar y solo_lectura.",
          "Los permisos por rol son personalizables desde la matriz en Configuración > Roles y Permisos.",
        ],
      },
    ],
  },
  {
    id: "phase-2",
    number: 2,
    title: "Operación Contable Diaria",
    subtitle: "Registra transacciones y libros fiscales",
    description: "Domina el día a día: partidas del libro diario, libros de compras y ventas, conciliación bancaria y activos fijos.",
    lessons: [
      {
        id: "2.1-partidas",
        title: "Partidas (Libro Diario)",
        description: "Registro manual de transacciones contables.",
        icon: FileText,
        route: "/partidas",
        content: [
          "Las partidas siguen el modelo 'Borrador como Sandbox': puedes guardar en estado borrador con totales descuadrados y completarlas después.",
          "El sistema asigna numeración secuencial atómica con formato PREFIX-YYYY-MM-#### al contabilizar.",
          "Soporta múltiples monedas, vínculo con facturas, automatización de líneas bancarias y gestión de cheques.",
          "Las partidas anuladas generan una contrapartida automática (REV-) vinculada bidireccionalmente.",
        ],
        tips: ["Usa atajos de teclado: Ctrl+S guardar, Ctrl+Enter contabilizar, Ctrl+N nueva línea."],
      },
      {
        id: "2.2-libros-fiscales",
        title: "Libros de Compras y Ventas",
        description: "Importa y gestiona facturas fiscales.",
        icon: ShoppingCart,
        route: "/libros-fiscales",
        content: [
          "Importa ventas desde el archivo SAT (CSV/Excel). El sistema detecta duplicados con clave compuesta: tipo FEL + serie + número + NIT emisor.",
          "Importa compras desde PDF (FEL Recibidos/Emitidos) usando edge functions de IA.",
          "Cada factura genera automáticamente la partida contable usando las cuentas configuradas y el tipo de operación (Bienes, Servicios, Activos Fijos, Combustible, etc.).",
          "Las facturas anuladas se manejan con un toggle manual; las anuladas no afectan el libro fiscal.",
        ],
      },
      {
        id: "2.3-conciliacion",
        title: "Conciliación Bancaria",
        description: "Cuadra tus saldos contables con los del banco.",
        icon: Banknote,
        route: "/conciliacion",
        content: [
          "Importa el estado de cuenta bancario desde Excel/CSV. La primera vez, mapea las columnas (fecha, descripción, débito, crédito) y guarda la plantilla.",
          "El sistema sugiere conciliaciones automáticas comparando montos y fechas con tus partidas.",
          "Marca movimientos como conciliados manualmente cuando sea necesario.",
        ],
      },
      {
        id: "2.4-activos-fijos",
        title: "Activos Fijos y Depreciación",
        description: "Gestiona tu patrimonio y depreciaciones mensuales.",
        icon: Package,
        route: "/activos-fijos",
        content: [
          "Catálogos: categorías (con cuentas contables predefinidas), ubicaciones, custodios y proveedores.",
          "Al activar un activo, el sistema genera el cronograma de depreciación según la política configurada.",
          "Contabilización mensual: ejecuta la depreciación del período. El sistema marca cada activo como Pendiente o Ya Contabilizado.",
          "Disposición: usa el asistente para baja de activos (venta, robo, descarte) que genera la partida con ganancia/pérdida automáticamente.",
        ],
      },
    ],
  },
  {
    id: "phase-3",
    number: 3,
    title: "Reportes, Consultas y Análisis",
    subtitle: "Obtén información contable y financiera",
    description: "Consulta saldos, mayor general, balance, estado de resultados y reportes fiscales con exportación a Excel/PDF.",
    lessons: [
      {
        id: "3.1-saldos",
        title: "Saldos y Mayor General",
        description: "Consulta saldos y movimientos por cuenta.",
        icon: FileBarChart,
        route: "/saldos",
        content: [
          "Saldos de Cuentas: balance jerárquico con agregación recursiva (las cuentas título suman a sus hijas).",
          "Saldos Mensuales: vista de 12 meses para análisis de tendencias.",
          "Mayor General: detalle de movimientos de cualquier cuenta en un rango de fechas.",
          "Drawer interactivo: haz clic en cualquier cuenta para ver su mayor sin salir del reporte.",
        ],
      },
      {
        id: "3.2-reportes",
        title: "Reportes Financieros",
        description: "Balance General, Estado de Resultados y más.",
        icon: FileBarChart,
        route: "/reportes",
        content: [
          "Balance General: el 'Resultado del Período' se calcula en paralelo desde el Estado de Resultados.",
          "Estado de Resultados: usa el formato configurable desde el Diseñador de Estados Financieros.",
          "Libro Diario, Mayor, Compras, Ventas y Bancos: con exportación a Excel y PDF, con manejo de folios para libros autorizados.",
          "Análisis de Variaciones: compara saldos entre dos períodos con filtro de actividad.",
        ],
        tips: ["Configura el formato de tus estados financieros en Configuración > Diseñador de Estados Financieros."],
      },
      {
        id: "3.3-impuestos",
        title: "Formularios e Impuestos",
        description: "Genera declaraciones fiscales SAT.",
        icon: Receipt,
        route: "/formularios-impuestos",
        content: [
          "Soporta formularios SAT de Guatemala: IVA mensual e ISR (mensual y trimestral).",
          "El sistema aplica reglas de precisión: IVA con 2 decimales, ISR redondeado al entero (piso fiscal).",
          "Genera anexos exportables para presentar en la SAT.",
        ],
      },
      {
        id: "3.4-generar-declaracion",
        title: "Generar Declaración",
        description: "Cálculo automático de la declaración del período.",
        icon: Calculator,
        route: "/generar-declaracion",
        content: [
          "Selecciona el formulario y el período; el sistema calcula automáticamente con base en libros fiscales y partidas.",
          "Muestra desglose línea por línea con vista previa antes de exportar.",
        ],
      },
    ],
  },
  {
    id: "phase-4",
    number: 4,
    title: "Cierres, Auditoría y Gobernanza",
    subtitle: "Procesos avanzados de fin de período",
    description: "Aprende cierres mensuales/anuales, revaluación cambiaria, bitácora de auditoría, soporte y mantenimiento.",
    lessons: [
      {
        id: "4.1-revaluacion",
        title: "Revaluación Cambiaria",
        description: "Diferencial cambiario realizado y no realizado.",
        icon: Calculator,
        route: "/partidas",
        content: [
          "Diferencial NO realizado (DIFC-NR): se ejecuta al cierre de mes sobre cuentas monetarias en moneda extranjera. Genera partida que se reversa automáticamente al inicio del siguiente período.",
          "Diferencial realizado: se calcula al liquidar facturas en moneda extranjera (parcial o total) usando el tipo de cambio del pago vs el de registro.",
          "Asistente de revaluación: en la página de Partidas, lanza el wizard que muestra el cálculo antes de contabilizar.",
        ],
      },
      {
        id: "4.2-cierre-periodo",
        title: "Cierre de Período",
        description: "Asistente guiado para cerrar el mes/año.",
        icon: CalendarDays,
        route: "/empresas",
        content: [
          "El asistente de cierre valida: revaluación cambiaria ejecutada, partidas balanceadas, sin borradores pendientes.",
          "Cierre mensual: bloquea edición de partidas en el período cerrado.",
          "Cierre anual: genera CDV (Cierre de Variaciones), CIER (Cierre de Resultados) y partida de Apertura del nuevo ejercicio.",
          "Las partidas generadas son idempotentes: puedes regenerarlas sin duplicar.",
        ],
      },
      {
        id: "4.3-bitacora",
        title: "Bitácora de Auditoría",
        description: "Trazabilidad completa de cambios.",
        icon: ClipboardList,
        route: "/bitacora",
        content: [
          "Registra todas las acciones del usuario agrupadas por intención (un guardado con varios cambios = un solo evento).",
          "Hash encadenado entre eventos para garantizar integridad (no se pueden borrar registros sin romper la cadena).",
          "Filtros por usuario, entidad, acción y rango de fechas.",
        ],
      },
      {
        id: "4.4-inbox-notif",
        title: "Bandeja y Notificaciones",
        description: "Tareas pendientes y alertas.",
        icon: Inbox,
        route: "/inbox",
        content: [
          "Bandeja: muestra partidas en borrador, conciliaciones pendientes, declaraciones por presentar y recordatorios personales.",
          "Notificaciones: alertas configurables (vencimientos fiscales, folios bajos en libros autorizados, etc.).",
        ],
      },
      {
        id: "4.5-soporte",
        title: "Soporte Técnico",
        description: "Tickets de soporte integrados.",
        icon: ClipboardList,
        route: "/soporte",
        content: [
          "Crea tickets con adjuntos (imágenes comprimidas automáticamente).",
          "Conversación en tiempo real con el equipo de soporte.",
          "El badge en el sidebar muestra la cantidad de tickets abiertos.",
        ],
      },
    ],
  },
];

export const ALL_LESSONS: Lesson[] = TRAINING_PHASES.flatMap((p) => p.lessons);
export const TOTAL_LESSONS = ALL_LESSONS.length;
