import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Home,
  Building2,
  Users,
  Settings,
  BookOpen,
  FileText,
  ShoppingCart,
  Receipt,
  Calculator,
  FileBarChart,
  HelpCircle,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  AlertCircle,
  FileDown,
  Bell,
  Banknote,
  CalendarDays,
  ClipboardList,
  Building,
  Keyboard,
  Download,
  MessageCircle,
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
  steps?: {
    title: string;
    description: string;
  }[];
  tips?: string[];
  subsections?: {
    id: string;
    title: string;
    description: string;
    route?: string;
    isNew?: boolean;
    steps?: {
      title: string;
      description: string;
    }[];
    tips?: string[];
  }[];
}

const helpSections: HelpSection[] = [
  {
    id: "inicio",
    title: "Inicio Rápido",
    icon: Home,
    description: "Primeros pasos para comenzar a usar el sistema contable.",
    steps: [
      {
        title: "Iniciar Sesión",
        description:
          "Ingrese su correo electrónico y contraseña en la pantalla de inicio de sesión. Si olvidó su contraseña, use el enlace 'Olvidé mi contraseña' para recuperarla.",
      },
      {
        title: "Seleccionar Empresa",
        description:
          "Al ingresar, vaya a Administración → Empresas y haga clic en 'Seleccionar' en la tarjeta de la empresa con la que desea trabajar. La empresa activa se muestra en la barra superior.",
      },
      {
        title: "Navegar el Sistema",
        description:
          "Use el menú lateral izquierdo para acceder a las diferentes secciones. El menú se puede colapsar haciendo clic en el ícono de hamburguesa.",
      },
      {
        title: "Centro de Notificaciones",
        description:
          "En la barra superior encontrará el ícono de campana que muestra las notificaciones y alertas pendientes del sistema.",
      },
    ],
    tips: [
      "La empresa activa se guarda automáticamente y persistirá entre sesiones.",
      "El Dashboard muestra un resumen financiero de la empresa seleccionada.",
      "Las notificaciones incluyen alertas de vencimientos de impuestos, tareas pendientes y recordatorios personalizados.",
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    icon: Home,
    description: "Panel principal con indicadores clave de la empresa seleccionada.",
    route: "/dashboard",
    steps: [
      {
        title: "Indicadores Financieros (KPIs)",
        description:
          "Visualice Total Activos, Total Pasivos, Utilidad del Mes y Liquidez. Cada tarjeta muestra el porcentaje de cambio respecto al mes anterior.",
      },
      {
        title: "Gráficas Anuales",
        description: "Dos gráficas de líneas muestran las tendencias de Ventas y Compras mensuales del año en curso.",
      },
      {
        title: "Resumen Mensual",
        description:
          "Tarjetas con el total de compras y ventas del mes actual, incluyendo el número de documentos procesados.",
      },
      {
        title: "Últimas Partidas",
        description: "Lista de las partidas contables más recientes registradas en el sistema.",
      },
      {
        title: "Alertas del Dashboard",
        description:
          "Se muestran alertas importantes como vencimientos próximos de impuestos, períodos sin cerrar y tareas pendientes.",
      },
    ],
    tips: [
      "Los datos del Dashboard se actualizan automáticamente al seleccionar una empresa diferente.",
      "Haga clic en las gráficas para ver el detalle de cada mes.",
      "Las alertas en rojo indican vencimientos inmediatos que requieren atención urgente.",
    ],
  },
  {
    id: "atajos",
    title: "Atajos de Teclado",
    icon: Keyboard,
    description: "Acelere su trabajo con los atajos de teclado disponibles en el sistema.",
    isNew: true,
    steps: [
      {
        title: "Nuevo Registro en Libros Fiscales",
        description:
          "Presione Ctrl+Alt++ (tecla más del teclado numérico) para crear rápidamente un nuevo registro de compra o venta sin usar el mouse.",
      },
      {
        title: "Guardado Automático",
        description:
          "Los cambios en los libros fiscales se guardan automáticamente cada 3 segundos. No es necesario presionar un botón de guardar.",
      },
      {
        title: "Navegación Rápida",
        description:
          "Use Tab para moverse entre campos y Enter para confirmar selecciones en los selectores desplegables.",
      },
      {
        title: "Búsqueda Global",
        description:
          "En cualquier lista o catálogo, use Ctrl+F o el campo de búsqueda para filtrar rápidamente los registros.",
      },
    ],
    tips: [
      "Al usar Ctrl+Alt++ el sistema guarda automáticamente el registro actual antes de crear uno nuevo.",
      "Los campos se validan en tiempo real para evitar errores de captura.",
      "En el selector de cuentas, escriba el código o nombre para filtrar rápidamente.",
    ],
  },
  {
    id: "administracion",
    title: "Administración",
    icon: Building2,
    description: "Gestión de usuarios, empresas y configuración del sistema.",
    subsections: [
      {
        id: "usuarios",
        title: "Usuarios",
        description: "Gestione los usuarios que tienen acceso al sistema.",
        route: "/usuarios",
        steps: [
          {
            title: "Ver Usuarios",
            description:
              "La lista muestra todos los usuarios registrados con su nombre, correo, rol, última actividad y estado (activo/inactivo).",
          },
          {
            title: "Indicador de Actividad",
            description:
              "Cada usuario muestra un indicador de actividad: verde (activo recientemente), amarillo (inactivo por horas) o gris (inactivo por días).",
          },
          {
            title: "Crear Usuario",
            description:
              "Haga clic en 'Nuevo Usuario', complete el formulario con nombre, correo y contraseña, y asigne el rol correspondiente.",
          },
          {
            title: "Roles de Usuario",
            description:
              "Asigne roles: Super Admin, Admin Tenant, Admin Empresa, Contador Senior, Contador Junior o Auxiliar. Cada rol tiene permisos específicos.",
          },
          {
            title: "Asignar Empresas",
            description:
              "Vincule al usuario con las empresas a las que tendrá acceso. Un usuario puede tener acceso a múltiples empresas.",
          },
        ],
        tips: [
          "Los usuarios inactivos no pueden iniciar sesión en el sistema.",
          "El rol determina qué secciones y acciones puede realizar el usuario.",
          "Use la matriz de permisos en Configuración para personalizar los accesos por rol.",
        ],
      },
      {
        id: "empresas",
        title: "Empresas",
        description: "Registre y administre las empresas contables.",
        route: "/empresas",
        steps: [
          {
            title: "Ver Empresas",
            description:
              "Se muestran todas las empresas en formato de tarjetas o tabla con información clave: NIT, régimen fiscal, períodos activos y documentos.",
          },
          {
            title: "Crear Nueva Empresa",
            description:
              "Haga clic en 'Nueva Empresa' y complete: NIT, Razón Social, Nombre Comercial, Régimen Fiscal (General/Pequeño Contribuyente), dirección, teléfono y correo.",
          },
          {
            title: "Asistente de Configuración",
            description:
              "El sistema incluye un asistente que guía paso a paso la configuración inicial: catálogo de cuentas, cuentas especiales, formularios de impuestos y más.",
          },
          {
            title: "Seleccionar Empresa Activa",
            description:
              "Haga clic en 'Seleccionar' en la tarjeta de la empresa. Esta será la empresa con la que trabajará en todas las demás secciones.",
          },
          {
            title: "Períodos Contables",
            description:
              "Dentro de cada empresa, en la pestaña 'Períodos Contables', puede crear y gestionar los períodos fiscales (usualmente anuales).",
          },
          {
            title: "Impuestos Configurados",
            description: "La pestaña 'Impuestos' muestra qué formularios SAT están habilitados para esta empresa.",
          },
          {
            title: "Documentos de Empresa",
            description: "En la pestaña 'Documentos', suba archivos importantes como patentes, RTU, escrituras, etc.",
          },
          {
            title: "Descargar Backup",
            description:
              "Use el botón de descarga para exportar toda la información de la empresa en un archivo Excel con múltiples hojas (una por tabla).",
          },
        ],
        tips: [
          "El régimen fiscal afecta el cálculo de impuestos en las declaraciones.",
          "Mantenga los períodos contables actualizados para el correcto registro de transacciones.",
          "El backup incluye: cuentas, partidas, compras, ventas, formularios, configuración y más.",
          "Use el asistente de configuración para empresas nuevas - ahorra tiempo y evita errores.",
        ],
      },
      {
        id: "bitacora",
        title: "Bitácora de Auditoría",
        description: "Registro de todas las acciones realizadas en el sistema.",
        route: "/bitacora",
        isNew: true,
        steps: [
          {
            title: "Ver Registro de Acciones",
            description:
              "La bitácora muestra todas las operaciones: quién, qué, cuándo y desde dónde se realizó cada acción.",
          },
          {
            title: "Filtrar por Tabla",
            description: "Filtre por la tabla afectada: Partidas, Compras, Ventas, Cuentas, Usuarios, etc.",
          },
          {
            title: "Filtrar por Acción",
            description: "Busque por tipo de acción: INSERT (creación), UPDATE (modificación) o DELETE (eliminación).",
          },
          {
            title: "Filtrar por Usuario",
            description: "Vea las acciones de un usuario específico para auditoría de actividad.",
          },
          {
            title: "Ver Detalle de Cambios",
            description:
              "Haga clic en 'Ver detalles' para ver los valores anteriores y nuevos de cada campo modificado.",
          },
        ],
        tips: [
          "La bitácora es de solo lectura - los registros no pueden ser modificados ni eliminados.",
          "Use los filtros de fecha para acotar la búsqueda a un período específico.",
          "Los cambios sensibles como modificaciones de permisos quedan registrados automáticamente.",
        ],
      },
      {
        id: "configuracion",
        title: "Configuración",
        description: "Configure parámetros especiales del sistema contable.",
        route: "/configuracion",
        steps: [
          {
            title: "Cuentas Contables Especiales",
            description:
              "Defina las cuentas de IVA (Débito/Crédito), Compras, Ventas, Clientes, Proveedores, Inventario Inicial/Final, Resultado del Período. Estas se usan para generar partidas automáticas.",
          },
          {
            title: "Estados Financieros",
            description:
              "Diseñe el formato del Balance General y Estado de Resultados. Cree secciones (grupos, subtotales, totales) y asigne las cuentas correspondientes.",
          },
          {
            title: "Formularios de Impuestos",
            description:
              "Configure qué tipos de formularios SAT aplican a la empresa (IVA General, IVA Pequeño Contribuyente, ISR Trimestral, ISO, etc.).",
          },
          {
            title: "Vencimientos de Impuestos",
            description:
              "Configure las fechas de vencimiento de cada impuesto: día fijo del mes, día hábil, con o sin considerar feriados.",
          },
          {
            title: "Tipos de Operaciones",
            description:
              "Defina los tipos de operación para clasificar compras y ventas (Local, Importación, Exportación, Servicios, etc.).",
          },
          {
            title: "Documentos FEL",
            description:
              "Configure los tipos de documento electrónico: Factura, Nota de Crédito, Nota de Débito, etc., con su comportamiento (si suma o resta).",
          },
          {
            title: "Prefijos de Partidas",
            description:
              "Configure los prefijos para numerar partidas según su tipo (PD para Diario, PA para Apertura, PC para Cierre, etc.).",
          },
          {
            title: "Configuración de Alertas",
            description:
              "Defina con cuántos días de anticipación se generan alertas de vencimiento y si se envían por correo electrónico.",
          },
          {
            title: "Feriados",
            description:
              "Registre los días feriados del país para el cálculo correcto de fechas de vencimiento cuando se consideran días hábiles.",
          },
          {
            title: "Matriz de Permisos",
            description:
              "Configure qué acciones puede realizar cada rol en el sistema: ver, crear, editar, eliminar, aprobar, etc.",
          },
          {
            title: "Respaldo y Restauración",
            description:
              "Exporte toda la información de la empresa en formato JSON para respaldo completo. Restaure o clone datos desde un archivo de respaldo previamente generado.",
          },
          {
            title: "Validación de Integridad Contable",
            description:
              "Ejecute una auditoría automática de los datos contables. El sistema verifica 25+ reglas en 7 categorías: partidas, cuentas, períodos, fiscal, bancos, balance y costo de ventas. Muestra un puntaje de salud y detalle de errores, advertencias e informativos.",
          },
          {
            title: "Tipografía de PDFs",
            description:
              "Personalice la fuente, tamaño y estilo de los documentos PDF generados por el sistema (reportes, folios, etc.).",
          },
        ],
        tips: [
          "Configure las cuentas especiales antes de importar compras/ventas para que las partidas automáticas funcionen correctamente.",
          "El diseño de estados financieros permite personalizar la presentación según las necesidades de cada empresa.",
          "Los feriados afectan el cálculo de vencimientos cuando está habilitada la opción 'Considerar días hábiles'.",
          "Ejecute la validación de integridad periódicamente para detectar inconsistencias en los datos contables.",
          "La validación de integridad es obligatoria antes de cerrar un período contable.",
        ],
      },
      {
        id: "notificaciones",
        title: "Notificaciones y Recordatorios",
        description: "Gestione las alertas y recordatorios del sistema.",
        route: "/notificaciones",
        isNew: true,
        steps: [
          {
            title: "Centro de Notificaciones",
            description:
              "Acceda desde el ícono de campana en la barra superior. Muestra todas las alertas pendientes con su prioridad.",
          },
          {
            title: "Tipos de Notificaciones",
            description:
              "Vencimientos de impuestos, recordatorios personalizados, alertas del sistema y avisos de tareas pendientes.",
          },
          {
            title: "Crear Recordatorio",
            description:
              "Haga clic en 'Nuevo Recordatorio' para crear una alerta personalizada con fecha, título, descripción y prioridad.",
          },
          {
            title: "Marcar como Leída",
            description: "Las notificaciones se pueden marcar como leídas individualmente o todas a la vez.",
          },
          {
            title: "Prioridades",
            description:
              "Las notificaciones tienen prioridad: Urgente (rojo), Importante (amarillo) o Informativa (azul).",
          },
        ],
        tips: [
          "Las notificaciones urgentes aparecen destacadas en el Dashboard.",
          "Los recordatorios completados se archivan automáticamente.",
          "Configure en Configuración → Alertas cuántos días antes se generan los avisos.",
        ],
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
          {
            title: "Ver Catálogo",
            description:
              "El catálogo se muestra en formato de árbol jerárquico. Use la barra de búsqueda para filtrar por código o nombre de cuenta.",
          },
          {
            title: "Crear Cuenta Manual",
            description:
              "Haga clic en 'Nueva Cuenta' e ingrese: Código, Nombre, Tipo (Activo/Pasivo/Capital/Ingreso/Gasto), Tipo de Saldo (Deudor/Acreedor/Indiferente), y si permite movimientos.",
          },
          {
            title: "Crear Cuenta Rápida (Atajo)",
            description:
              "Junto a cada cuenta hay íconos '+' para crear una cuenta hermana (mismo nivel) o cuenta hija (subnivel). El código se calcula automáticamente.",
          },
          {
            title: "Cuenta Bancaria",
            description:
              "Marque la casilla 'Es cuenta bancaria' para cuentas de bancos. Estas aparecerán en el módulo de Conciliación Bancaria.",
          },
          {
            title: "Importar desde CSV",
            description:
              "Haga clic en 'Importar' y suba un archivo CSV con las columnas: código, nombre, tipo, nivel. Puede descargar una plantilla de ejemplo.",
          },
          {
            title: "Copiar de Otra Empresa",
            description: "Use 'Copiar Catálogo' para duplicar todo el plan de cuentas de otra empresa existente.",
          },
          {
            title: "Eliminar Cuenta",
            description:
              "Solo puede eliminar cuentas que no tengan movimientos registrados. Al eliminar una cuenta padre, se eliminarán también sus subcuentas.",
          },
        ],
        tips: [
          "Las cuentas con 'Permite Movimiento = No' son cuentas de título (agrupación) y no pueden recibir asientos directos.",
          "El Tipo de Saldo 'Indiferente' permite que la cuenta tenga saldo deudor o acreedor sin validación de sobregiro.",
          "Use el buscador de facturas (ícono de lupa en la barra superior) para encontrar facturas por número o proveedor/cliente.",
        ],
      },
      {
        id: "partidas",
        title: "Partidas (Libro Diario)",
        description: "Registre asientos contables manuales y automáticos.",
        route: "/partidas",
        steps: [
          {
            title: "Ver Partidas",
            description:
              "Lista todas las partidas con número, fecha, descripción, totales y estado. Use los filtros de mes/año para buscar.",
          },
          {
            title: "Filtrar por Tipo y Estado",
            description:
              "Filtre por tipo de partida (Apertura, Diario, Ajuste, Cierre) y por estado (Borrador, Contabilizada, Anulada).",
          },
          {
            title: "Crear Partida",
            description:
              "Haga clic en 'Nueva Partida'. Complete: Fecha, Tipo, Descripción. El número se genera automáticamente según el prefijo configurado.",
          },
          {
            title: "Agregar Líneas de Detalle",
            description:
              "Para cada línea: seleccione una Cuenta (use el buscador con código o nombre), ingrese Descripción (opcional), monto al Debe o al Haber.",
          },
          {
            title: "Partidas Bancarias",
            description:
              "Para partidas de tipo Cheque o Depósito, seleccione la cuenta bancaria, número de referencia y beneficiario.",
          },
          {
            title: "Validación de Cuadre",
            description:
              "La partida debe estar cuadrada (Total Debe = Total Haber) para poder guardarse. El sistema valida en tiempo real.",
          },
          {
            title: "Validación de Sobregiro",
            description:
              "El sistema valida que las cuentas no queden con saldo contrario a su naturaleza (ej: una cuenta de Activo no puede quedar con saldo acreedor).",
          },
          {
            title: "Contabilizar Partida",
            description:
              "Las partidas inician en estado 'Borrador'. Haga clic en 'Contabilizar' para confirmarla. Una vez contabilizada, no se puede editar.",
          },
          {
            title: "Anular Partida",
            description:
              "Las partidas contabilizadas pueden anularse. Se solicita un motivo de anulación que queda registrado en la bitácora.",
          },
          {
            title: "Ver Compras Vinculadas",
            description:
              "Las partidas generadas automáticamente desde los libros fiscales muestran un enlace para ver las facturas incluidas.",
          },
        ],
        tips: [
          "Puede crear partidas placeholder (vacías) para reservar números correlativos.",
          "Las cuentas con tipo de saldo 'Indiferente' no generan alertas de sobregiro.",
          "Use Ctrl+F en el buscador de cuentas para filtrar rápidamente.",
        ],
      },
      {
        id: "libros-fiscales",
        title: "Compras y Ventas (Libros Fiscales)",
        description: "Registre e importe las compras y ventas para los libros de IVA.",
        route: "/libros-fiscales",
        steps: [
          {
            title: "Seleccionar Mes",
            description:
              "Use los selectores de Mes y Año para ver el libro del período deseado. El sistema crea automáticamente el libro si no existe.",
          },
          {
            title: "Pestaña Compras",
            description:
              "Muestra todas las facturas de compra del mes. Puede ver: fecha, proveedor, NIT, serie/número, tipo documento, tipo operación, montos (neto, IVA, total).",
          },
          {
            title: "Pestaña Ventas",
            description:
              "Muestra todas las facturas de venta del mes con: fecha, cliente, NIT, autorización FEL, serie/número, tipo documento, tipo operación, montos.",
          },
          {
            title: "Ingreso Rápido con Atajo",
            description:
              "Presione Ctrl+Alt++ para crear un nuevo registro rápidamente. El sistema guarda automáticamente el registro actual antes de crear el nuevo.",
          },
          {
            title: "Autoguardado Inteligente",
            description:
              "Los cambios se guardan automáticamente cada 3 segundos. El indicador de guardado muestra el estado (Guardando.../Guardado).",
          },
          {
            title: "Importar desde SAT",
            description:
              "Haga clic en 'Importar'. Suba el archivo CSV descargado del portal SAT. El sistema detecta automáticamente si es libro de compras o ventas.",
          },
          {
            title: "Importar desde PDF de Compras",
            description:
              "También puede importar el PDF de consulta de compras del SAT. El sistema extrae automáticamente los datos de las facturas.",
          },
          {
            title: "Manejo de Duplicados",
            description:
              "Al importar, el sistema detecta facturas duplicadas (mismo proveedor/cliente y número). Puede elegir: Omitir, Reemplazar o Agregar como nuevo.",
          },
          {
            title: "Tipo de Operación",
            description:
              "Asigne el tipo de operación a cada factura (Local, Importación, Exportación, Servicios) para clasificar correctamente en los reportes.",
          },
          {
            title: "Generar Partida Automática",
            description:
              "Haga clic en 'Generar Partida' para crear automáticamente el asiento contable del mes. Requiere tener configuradas las cuentas especiales.",
          },
          {
            title: "Notas de Crédito",
            description:
              "Las Notas de Crédito (NCRE) restan automáticamente de los totales. El sistema usa el campo 'affects_total' del tipo de documento.",
          },
          {
            title: "Eliminar Registros",
            description:
              "Puede eliminar facturas individuales haciendo clic en el ícono de papelera. Los registros eliminados quedan en la bitácora.",
          },
        ],
        tips: [
          "Los archivos CSV del SAT tienen un formato específico. No modifique el archivo antes de importar.",
          "La partida automática agrupa todas las facturas del mes en un solo asiento.",
          "Puede regenerar la partida si agrega más facturas después.",
          "Use el atajo Ctrl+Alt++ para ingresar registros más rápidamente - es la forma más eficiente de captura.",
        ],
      },
      {
        id: "conciliacion",
        title: "Conciliación Bancaria",
        description: "Concilie los movimientos bancarios con los registros contables.",
        route: "/conciliacion",
        isNew: true,
        steps: [
          {
            title: "Seleccionar Cuenta Bancaria",
            description:
              "Elija la cuenta de banco a conciliar del listado de cuentas marcadas como 'cuenta bancaria' en el catálogo.",
          },
          {
            title: "Importar Estado de Cuenta",
            description:
              "Suba el archivo Excel/CSV del estado de cuenta bancario. Configure el mapeo de columnas (fecha, descripción, débito, crédito, referencia).",
          },
          {
            title: "Guardar Plantilla de Mapeo",
            description: "Guarde el mapeo de columnas como plantilla para futuras importaciones del mismo banco.",
          },
          {
            title: "Ver Movimientos",
            description:
              "Los movimientos importados se muestran en una tabla. Cada movimiento puede estar: No conciliado, En proceso o Conciliado.",
          },
          {
            title: "Vincular con Partidas",
            description:
              "Asocie cada movimiento bancario con la partida contable correspondiente. El sistema sugiere partidas por monto y fecha.",
          },
          {
            title: "Marcar como Conciliado",
            description:
              "Una vez vinculado correctamente, marque el movimiento como conciliado. Esto actualiza automáticamente el estado en la partida.",
          },
          {
            title: "Diferencias de Conciliación",
            description:
              "El sistema calcula automáticamente las diferencias entre el saldo bancario y el saldo contable.",
          },
        ],
        tips: [
          "Importe el estado de cuenta completo - el sistema detecta duplicados automáticamente.",
          "Use las plantillas de mapeo para ahorrar tiempo en importaciones recurrentes.",
          "Los movimientos conciliados no pueden ser modificados.",
        ],
      },
      {
        id: "formularios",
        title: "Formularios de Impuestos",
        description: "Registre los formularios SAT pagados.",
        route: "/formularios-impuestos",
        steps: [
          {
            title: "Ver Formularios",
            description: "Lista todos los formularios registrados con: número, tipo, período, fecha de pago y monto.",
          },
          {
            title: "Filtrar por Tipo y Período",
            description: "Use los filtros para buscar por tipo de impuesto (IVA, ISR, ISO) o por año/mes del período.",
          },
          {
            title: "Agregar Formulario Manual",
            description:
              "Haga clic en 'Agregar Formulario'. Ingrese: Número de formulario, Código de acceso, Fecha de pago, Monto pagado, Tipo de impuesto y Período.",
          },
          {
            title: "Importar desde PDF",
            description:
              "Suba el PDF de la constancia de pago del SAT. El sistema extrae automáticamente el número, código de acceso, fecha y monto.",
          },
          {
            title: "Subir PDF Respaldo",
            description: "Adjunte el PDF de la constancia de pago para tenerlo archivado en el sistema.",
          },
          {
            title: "Descargar PDF",
            description: "Haga clic en el ícono de descarga para obtener el PDF guardado de cualquier formulario.",
          },
        ],
        tips: [
          "El código de acceso es el que aparece en la constancia de pago del formulario SAT.",
          "Use la búsqueda para encontrar formularios por número o fecha.",
          "Los formularios pagados generan notificaciones cuando se acerca el siguiente vencimiento.",
        ],
      },
      {
        id: "declaracion",
        title: "Generar Declaración",
        description: "Calcule automáticamente los impuestos del período.",
        route: "/generar-declaracion",
        steps: [
          {
            title: "Seleccionar Período",
            description: "Elija el Mes y Año para el cual desea generar la declaración.",
          },
          {
            title: "Seleccionar Tipo de Formulario",
            description:
              "Elija entre: IVA Régimen General (SAT-2237), IVA Pequeño Contribuyente (SAT-2046), ISR Trimestral (SAT-1311), ISO, etc.",
          },
          {
            title: "Generar Cálculo",
            description:
              "El sistema calcula automáticamente: Débito Fiscal (ventas), Crédito Fiscal (compras), IVA a Pagar o Crédito Remanente.",
          },
          {
            title: "Crédito Remanente",
            description:
              "Si hay crédito fiscal a favor, el sistema lo arrastra automáticamente al siguiente período. Puede ajustarlo manualmente si es necesario.",
          },
          {
            title: "Vista Previa",
            description:
              "Vea un resumen del cálculo con el desglose de ventas por tipo de documento, compras con y sin derecho a crédito, y el impuesto resultante.",
          },
          {
            title: "Exportar Anexos",
            description:
              "Descargue los anexos de compras y ventas en formato Excel para adjuntar a la declaración o revisar antes de presentar.",
          },
        ],
        tips: [
          "El cálculo usa los datos del libro de compras y ventas del período seleccionado.",
          "Verifique que todas las facturas estén importadas antes de generar la declaración.",
          "El crédito remanente se arrastra automáticamente si lo ingresa.",
          "Puede generar múltiples veces la declaración si agrega más facturas - el sistema recalcula.",
        ],
      },
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
          {
            title: "Seleccionar Fecha de Corte",
            description: "Elija la fecha de corte para el balance. Se mostrarán los saldos acumulados hasta esa fecha.",
          },
          {
            title: "Seleccionar Período",
            description: "Opcionalmente, seleccione un período contable para ver solo los movimientos de ese período.",
          },
          {
            title: "Ver Balance de Comprobación",
            description:
              "Se muestra cada cuenta en formato de árbol con: Saldo Anterior, Débitos del período, Créditos del período, y Saldo Final.",
          },
          {
            title: "Expandir/Contraer Cuentas",
            description:
              "Haga clic en las flechas para expandir o contraer las subcuentas. Los totales se calculan automáticamente.",
          },
          {
            title: "Verificar Cuadre",
            description:
              "Los totales de Débitos y Créditos deben coincidir. El sistema muestra la diferencia si existe descuadre.",
          },
          {
            title: "Exportar a Excel",
            description: "Descargue el balance de comprobación en formato Excel para análisis o archivo.",
          },
        ],
        tips: [
          "Use esta consulta para verificar que la contabilidad está cuadrada antes de generar estados financieros.",
          "Las cuentas sin movimientos en el período seleccionado se muestran en gris.",
        ],
      },
      {
        id: "saldos-mensuales",
        title: "Saldos Mensuales",
        description: "Evolución de saldos mes a mes.",
        route: "/saldos-mensuales",
        isNew: true,
        steps: [
          {
            title: "Seleccionar Año",
            description: "Elija el año fiscal para ver la evolución mensual de saldos.",
          },
          {
            title: "Ver Tabla de Saldos",
            description:
              "Cada fila muestra una cuenta con su saldo al final de cada mes del año (12 columnas de meses).",
          },
          {
            title: "Formato de Árbol",
            description:
              "Las cuentas se muestran en formato jerárquico. Los totales de cuentas padre incluyen todas las subcuentas.",
          },
          {
            title: "Análisis de Variaciones",
            description: "Compare visualmente cómo han cambiado los saldos de mes a mes para identificar tendencias.",
          },
        ],
        tips: [
          "Esta vista es ideal para análisis de tendencias y proyecciones.",
          "Las celdas vacías indican que la cuenta no tuvo movimientos ese mes.",
        ],
      },
      {
        id: "mayor",
        title: "Mayor General",
        description: "Detalle de movimientos por cuenta.",
        route: "/mayor",
        steps: [
          {
            title: "Seleccionar Cuenta",
            description:
              "Use el buscador para encontrar y seleccionar la cuenta que desea consultar. Escriba código o nombre.",
          },
          {
            title: "Seleccionar Rango de Fechas",
            description: "Defina la fecha inicial y final del período a consultar.",
          },
          {
            title: "Ver Movimientos",
            description:
              "Se muestran todos los asientos que afectaron la cuenta: fecha, número de partida, descripción, débito, crédito y saldo acumulado.",
          },
          {
            title: "Saldo Anterior",
            description: "La primera línea muestra el saldo acumulado antes de la fecha inicial seleccionada.",
          },
          {
            title: "Ver Partida Completa",
            description: "Haga clic en el número de partida para ver el detalle completo del asiento contable.",
          },
          {
            title: "Exportar",
            description: "Descargue el mayor de la cuenta en formato Excel o PDF.",
          },
        ],
        tips: [
          "El saldo anterior muestra el acumulado antes de la fecha inicial seleccionada.",
          "Puede hacer clic en el número de partida para ver el detalle completo del asiento.",
          "Use esta consulta para auditar los movimientos de una cuenta específica.",
        ],
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
      {
        title: "Reporte de Compras",
        description:
          "Exporte el libro de compras de un mes específico a Excel o PDF. Incluye totales y desglose de IVA por tipo de documento.",
      },
      {
        title: "Reporte de Ventas",
        description:
          "Exporte el libro de ventas de un mes específico a Excel o PDF con todos los detalles fiscales requeridos por la SAT.",
      },
      {
        title: "Reporte de Partidas",
        description:
          "Liste las partidas contables de un período. Puede filtrar por tipo de partida, estado y rango de fechas.",
      },
      {
        title: "Libro Mayor",
        description: "Exporte el mayor general de una o varias cuentas en formato detallado.",
      },
      {
        title: "Balance General",
        description:
          "Genera el Estado de Situación Financiera a una fecha de corte. Usa el formato configurado en Configuración → Estados Financieros.",
      },
      {
        title: "Estado de Resultados",
        description:
          "Genera el Estado de Pérdidas y Ganancias para un período. Muestra Ingresos, Costos, Gastos y Utilidad/Pérdida Neta.",
      },
      {
        title: "Exportar Folios",
        description:
          "Exporte los folios de compras o ventas en el formato requerido por la SAT para libros autorizados.",
      },
    ],
    tips: [
      "Los reportes de Balance General y Estado de Resultados usan el formato personalizado si está configurado.",
      "Puede exportar a Excel para análisis adicional o a PDF para presentación.",
      "El Balance General calcula automáticamente el Resultado del Período sumando ingresos menos gastos.",
      "Los reportes fiscales incluyen el número de folio correlativo cuando está configurado.",
    ],
  },
  {
    id: "backup",
    title: "Respaldo y Restauración de Datos",
    icon: Download,
    description: "Exporte, restaure y clone la información completa de cada empresa.",
    isNew: true,
    steps: [
      {
        title: "Backup Excel (por Empresa)",
        description:
          "En la sección Empresas, cada tarjeta tiene un botón de descarga (ícono de nube con flecha) para generar un backup rápido en formato Excel (.xlsx) con hojas separadas por tabla.",
      },
      {
        title: "Backup JSON Completo",
        description:
          "En Configuración → Respaldo, haga clic en 'Exportar Respaldo Completo (JSON)'. Este formato incluye 28+ tablas en orden topológico y preserva todas las relaciones entre registros para restauración perfecta.",
      },
      {
        title: "Contenido del Backup JSON",
        description:
          "Incluye: Cuentas, Períodos, Partidas y Detalles, Compras, Ventas, Cuentas Bancarias, Movimientos Bancarios, Conciliaciones, Formularios, Configuración de Empresa, Estados Financieros, Notificaciones, Alertas, Feriados, Bitácora y más.",
      },
      {
        title: "Restaurar Datos",
        description:
          "En Configuración → Respaldo, suba un archivo JSON de backup. Elija el modo 'Restaurar en esta empresa' para reemplazar los datos existentes. Se muestra una vista previa con los conteos de registros antes de confirmar.",
      },
      {
        title: "Clonar a Otra Empresa",
        description:
          "Elija el modo 'Clonar a esta empresa' para importar los datos del backup sin borrar los existentes. El sistema genera nuevos IDs y reasigna automáticamente todas las relaciones (FK remapping).",
      },
      {
        title: "Progreso y Resultados",
        description:
          "Durante la restauración se muestra el progreso por tabla. Al finalizar, se presenta un resumen detallado con registros exitosos, fallidos y porcentaje de éxito. Puede descargar un log de errores si hubo fallos.",
      },
      {
        title: "Historial de Respaldos",
        description:
          "El sistema registra cada operación de respaldo (exportación, restauración, clonación) con fecha, usuario y conteo de registros. Consulte el historial en Configuración → Respaldo.",
      },
    ],
    tips: [
      "Genere backups periódicos (mensual o trimestral) como buena práctica de respaldo.",
      "El backup JSON es el formato recomendado para restauraciones y migraciones completas.",
      "El backup Excel es útil para análisis en hojas de cálculo y auditorías externas.",
      "La restauración elimina los datos existentes - se requiere confirmación explícita.",
      "La clonación es ideal para crear empresas de prueba o migrar datos entre empresas.",
      "Para empresas con muchos registros, la generación puede tomar algunos segundos.",
      "Solo los roles Super Admin y Admin Empresa pueden realizar respaldos y restauraciones.",
    ],
  },
];

const faqItems = [
  {
    question: "¿Cómo cambio la empresa activa?",
    answer:
      "Vaya a Administración → Empresas y haga clic en el botón 'Seleccionar' de la empresa deseada. La empresa activa se muestra en la parte superior de la pantalla.",
  },
  {
    question: "¿Por qué no puedo eliminar una cuenta?",
    answer:
      "Las cuentas que tienen movimientos (partidas registradas) no pueden eliminarse para mantener la integridad contable. Puede desactivarlas si ya no las necesita.",
  },
  {
    question: "¿Cómo corrijo una partida contabilizada?",
    answer:
      "Las partidas contabilizadas no se pueden editar directamente. Puede anularla (registrando el motivo) y crear una nueva partida correcta, o crear una partida de ajuste.",
  },
  {
    question: "¿Por qué aparece 'Sobregiro detectado' al guardar una partida?",
    answer:
      "Esto ocurre cuando el movimiento dejaría una cuenta con saldo contrario a su naturaleza (ej: cuenta de Activo con saldo acreedor). Verifique los montos o use una cuenta con tipo de saldo 'Indiferente'.",
  },
  {
    question: "¿Cómo importo facturas del SAT?",
    answer:
      "Vaya a Contabilidad → Compras y Ventas, seleccione el mes, y haga clic en 'Importar'. Suba el archivo CSV o PDF descargado del portal del SAT sin modificarlo.",
  },
  {
    question: "¿Dónde configuro las cuentas para partidas automáticas?",
    answer:
      "En Administración → Configuración → Cuentas Contables. Defina las cuentas de IVA, Compras, Ventas, Clientes y Proveedores que se usarán al generar partidas automáticas.",
  },
  {
    question: "¿Cómo personalizo el formato del Balance General?",
    answer:
      "Vaya a Administración → Configuración → Estados Financieros. Seleccione 'Balance General', cree las secciones (Activo, Pasivo, Capital) y asigne las cuentas correspondientes a cada sección.",
  },
  {
    question: "¿Por qué el Balance General no cuadra?",
    answer:
      "Verifique que el Resultado del Período (Ingresos - Gastos) esté correctamente calculado. Revise que todas las cuentas estén asignadas en el diseñador de estados financieros y que no haya partidas descuadradas.",
  },
  {
    question: "¿Cómo uso el atajo Ctrl+Alt++ para ingreso rápido?",
    answer:
      "En la pantalla de Compras y Ventas, presione Ctrl+Alt y la tecla + del teclado numérico. El sistema guarda automáticamente el registro actual y crea uno nuevo. Es la forma más rápida de capturar múltiples facturas.",
  },
  {
    question: "¿Por qué algunos datos no se guardan al usar el atajo rápido?",
    answer:
      "Asegúrese de esperar al menos 1-2 segundos después de ingresar el último dato antes de presionar Ctrl+Alt++. El sistema ahora guarda automáticamente antes de crear el nuevo registro, pero los campos deben estar completos.",
  },
  {
    question: "¿Cómo genero un backup de la empresa?",
    answer:
      "En la sección Empresas, haga clic en el ícono de descarga (nube con flecha) en la tarjeta de la empresa. Se descargará un archivo Excel con toda la información organizada en hojas.",
  },
  {
    question: "¿Cómo configuro las alertas de vencimiento de impuestos?",
    answer:
      "Vaya a Configuración → Alertas. Defina con cuántos días de anticipación desea recibir notificaciones de vencimiento para cada tipo de impuesto.",
  },
  {
    question: "¿Qué roles de usuario existen?",
    answer:
      "Super Admin (acceso total), Admin Tenant (gestiona su firma contable), Admin Empresa (gestiona una empresa), Contador Senior (operaciones completas), Contador Junior (operaciones limitadas) y Auxiliar (solo consulta).",
  },
  {
    question: "¿Cómo busco una factura específica?",
    answer:
      "Use el ícono de lupa en la barra superior para abrir el buscador global de facturas. Puede buscar por número de factura, NIT o nombre del proveedor/cliente.",
  },
  {
    question: "¿Puedo importar estados de cuenta bancarios?",
    answer:
      "Sí, en el módulo de Conciliación Bancaria puede importar archivos Excel o CSV de estados de cuenta. Configure el mapeo de columnas y guárdelo como plantilla para futuras importaciones.",
  },
  {
    question: "¿Cómo hago un respaldo completo de la empresa?",
    answer:
      "Vaya a Configuración → Respaldo y haga clic en 'Exportar Respaldo Completo (JSON)'. Este formato incluye todas las tablas y preserva las relaciones entre registros. También puede usar el botón de descarga Excel en la tarjeta de la empresa para un respaldo rápido.",
  },
  {
    question: "¿Puedo restaurar un respaldo en otra empresa?",
    answer:
      "Sí, use el modo 'Clonar a esta empresa' en Configuración → Respaldo. El sistema genera nuevos identificadores y reasigna automáticamente todas las relaciones entre registros. Esto es ideal para crear empresas de prueba o migrar datos.",
  },
  {
    question: "¿Qué es la Validación de Integridad Contable?",
    answer:
      "Es una auditoría automática que verifica 25+ reglas en 7 categorías: integridad de partidas, cuentas, períodos, fiscal, bancos, balance y costo de ventas. Genera un puntaje de salud y detalla los errores encontrados. Acceda desde Configuración → Integridad.",
  },
  {
    question: "¿Qué significan los colores del puntaje de integridad?",
    answer:
      "Verde (95-100%): excelente, la contabilidad está consistente. Amarillo (80-95%): hay advertencias que revisar. Rojo (menos de 80%): existen errores críticos que deben corregirse antes de generar reportes o cerrar períodos.",
  },
];

const Ayuda = () => {
  const { currentTenant } = useTenant();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;
    let y = 20;
    const lineHeight = 6;
    const maxWidth = pageWidth - margin * 2;

    const addText = (text: string, fontSize: number, isBold: boolean = false, indent: number = 0) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      const lines = doc.splitTextToSize(text, maxWidth - indent);
      doc.text(lines, margin + indent, y);
      y += lines.length * lineHeight;
    };

    // Title
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Centro de Ayuda - Manual de Usuario", margin, y);
    y += 15;

    // Sections
    helpSections.forEach((section) => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }

      // Section title
      addText(`■ ${section.title}`, 14, true);
      addText(section.description, 10, false, 4);
      y += 3;

      // Steps
      if (section.steps) {
        section.steps.forEach((step, idx) => {
          addText(`${idx + 1}. ${step.title}`, 10, true, 6);
          addText(step.description, 9, false, 10);
        });
      }

      // Tips
      if (section.tips) {
        addText("Tips:", 10, true, 6);
        section.tips.forEach((tip) => {
          addText(`• ${tip}`, 9, false, 10);
        });
      }

      // Subsections
      if (section.subsections) {
        section.subsections.forEach((sub) => {
          if (y > 250) {
            doc.addPage();
            y = 20;
          }
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
            sub.tips.forEach((tip) => {
              addText(`• ${tip}`, 8, false, 16);
            });
          }
          y += 2;
        });
      }
      y += 5;
    });

    // FAQ
    if (y > 230) {
      doc.addPage();
      y = 20;
    }
    y += 5;
    addText("PREGUNTAS FRECUENTES", 14, true);
    y += 3;

    faqItems.forEach((item, idx) => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
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
        section.steps?.some(
          (s) => s.title.toLowerCase().includes(query) || s.description.toLowerCase().includes(query),
        );

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
                {section.isNew && (
                  <Badge variant="secondary" className="text-xs">
                    Nuevo
                  </Badge>
                )}
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
                    {sub.isNew && (
                      <Badge variant="secondary" className="text-xs">
                        Nuevo
                      </Badge>
                    )}
                    {sub.route && (
                      <Badge variant="outline" className="text-xs font-normal">
                        {sub.route}
                      </Badge>
                    )}
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
    <div className="container mx-auto py-6 max-w-5xl">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background pb-4 -mx-6 px-6 pt-0 border-b mb-6">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <HelpCircle className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Centro de Ayuda</h1>
            </div>
            <Button onClick={handleExportPDF} variant="outline">
              <FileDown className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
          </div>
          <p className="text-muted-foreground mt-2">
            Manual de usuario interactivo. Encuentre instrucciones detalladas sobre cómo utilizar cada función del
            sistema.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en el manual... (ej: partidas, importar, balance, atajo)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Quick Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
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
              {section.isNew && (
                <Badge variant="secondary" className="text-xs mt-1">
                  Nuevo
                </Badge>
              )}
            </button>
          ))}
          {/* WhatsApp Support Card */}
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

      {/* Main Content */}
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-foreground">Guía por Módulos</h2>

        {filteredSections.length === 0 ? (
          <Card className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No se encontraron resultados para "{searchQuery}"</p>
            <Button variant="link" onClick={() => setSearchQuery("")}>
              Limpiar búsqueda
            </Button>
          </Card>
        ) : (
          filteredSections.map((section) => (
            <div key={section.id} id={section.id}>
              {renderSection(section)}
            </div>
          ))
        )}
      </div>

      {/* FAQ Section */}
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

      {/* Footer */}
      <div className="mt-12 p-6 bg-muted/30 rounded-lg text-center">
        <p className="text-muted-foreground">
          ¿No encontró lo que buscaba? Contacte a soporte técnico para asistencia adicional.
        </p>
      </div>
    </div>
  );
};

export default Ayuda;
