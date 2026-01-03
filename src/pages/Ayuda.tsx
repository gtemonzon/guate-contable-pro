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
  AlertCircle
} from "lucide-react";
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
        description: "Ingrese su correo electrónico y contraseña en la pantalla de inicio de sesión. Si olvidó su contraseña, use el enlace 'Olvidé mi contraseña' para recuperarla."
      },
      {
        title: "Seleccionar Empresa",
        description: "Al ingresar, vaya a Administración → Empresas y haga clic en 'Seleccionar' en la tarjeta de la empresa con la que desea trabajar. La empresa activa se muestra en la barra superior."
      },
      {
        title: "Navegar el Sistema",
        description: "Use el menú lateral izquierdo para acceder a las diferentes secciones. El menú se puede colapsar haciendo clic en el ícono de hamburguesa."
      }
    ],
    tips: [
      "La empresa activa se guarda automáticamente y persistirá entre sesiones.",
      "El Dashboard muestra un resumen financiero de la empresa seleccionada."
    ]
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
        description: "Visualice Total Activos, Total Pasivos, Utilidad del Mes y Liquidez. Cada tarjeta muestra el porcentaje de cambio respecto al mes anterior."
      },
      {
        title: "Gráficas Anuales",
        description: "Dos gráficas de líneas muestran las tendencias de Ventas y Compras mensuales del año en curso."
      },
      {
        title: "Resumen Mensual",
        description: "Tarjetas con el total de compras y ventas del mes actual, incluyendo el número de documentos procesados."
      },
      {
        title: "Últimas Partidas",
        description: "Lista de las partidas contables más recientes registradas en el sistema."
      }
    ],
    tips: [
      "Los datos del Dashboard se actualizan automáticamente al seleccionar una empresa diferente.",
      "Haga clic en las gráficas para ver el detalle de cada mes."
    ]
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
            description: "La lista muestra todos los usuarios registrados con su nombre, correo y estado (activo/inactivo)."
          },
          {
            title: "Crear Usuario",
            description: "Haga clic en 'Nuevo Usuario', complete el formulario con nombre, correo y contraseña, y asigne los permisos correspondientes."
          },
          {
            title: "Editar Usuario",
            description: "Haga clic en el ícono de editar en la tarjeta del usuario para modificar sus datos o permisos."
          }
        ],
        tips: [
          "Los usuarios inactivos no pueden iniciar sesión en el sistema."
        ]
      },
      {
        id: "empresas",
        title: "Empresas",
        description: "Registre y administre las empresas contables.",
        route: "/empresas",
        steps: [
          {
            title: "Ver Empresas",
            description: "Se muestran todas las empresas en formato de tarjetas con información clave: NIT, régimen fiscal, períodos activos y documentos."
          },
          {
            title: "Crear Nueva Empresa",
            description: "Haga clic en 'Nueva Empresa' y complete: NIT, Razón Social, Nombre Comercial, Régimen Fiscal (General/Pequeño Contribuyente), dirección, teléfono y correo."
          },
          {
            title: "Seleccionar Empresa Activa",
            description: "Haga clic en 'Seleccionar' en la tarjeta de la empresa. Esta será la empresa con la que trabajará en todas las demás secciones."
          },
          {
            title: "Períodos Contables",
            description: "Dentro de cada empresa, en la pestaña 'Períodos Contables', puede crear y gestionar los períodos fiscales (usualmente anuales)."
          },
          {
            title: "Documentos de Empresa",
            description: "En la pestaña 'Documentos', suba archivos importantes como patentes, RTU, escrituras, etc."
          }
        ],
        tips: [
          "El régimen fiscal afecta el cálculo de impuestos en las declaraciones.",
          "Mantenga los períodos contables actualizados para el correcto registro de transacciones."
        ]
      },
      {
        id: "configuracion",
        title: "Configuración",
        description: "Configure parámetros especiales del sistema contable.",
        route: "/configuracion",
        steps: [
          {
            title: "Cuentas Contables Especiales",
            description: "Defina las cuentas de IVA (Débito/Crédito), Compras, Ventas, Clientes, Proveedores, etc. Estas se usan para generar partidas automáticas."
          },
          {
            title: "Estados Financieros",
            description: "Diseñe el formato del Balance General y Estado de Resultados. Cree secciones (grupos, subtotales, totales) y asigne las cuentas correspondientes."
          },
          {
            title: "Formularios de Impuestos",
            description: "Configure qué tipos de formularios SAT aplican a la empresa (IVA General, IVA Pequeño Contribuyente, ISR Trimestral)."
          },
          {
            title: "Tipos de Operaciones",
            description: "Defina los tipos de operación para clasificar compras y ventas (Local, Importación, Exportación, etc.)."
          },
          {
            title: "Documentos FEL",
            description: "Configure los tipos de documento electrónico: Factura, Nota de Crédito, Nota de Débito, etc., con su comportamiento (si suma o resta)."
          },
          {
            title: "Prefijos de Partidas",
            description: "Configure los prefijos para numerar partidas según su tipo (PD para Diario, PA para Apertura, etc.)."
          }
        ],
        tips: [
          "Configure las cuentas especiales antes de importar compras/ventas para que las partidas automáticas funcionen correctamente.",
          "El diseño de estados financieros permite personalizar la presentación según las necesidades de cada empresa."
        ]
      }
    ]
  },
  {
    id: "contabilidad",
    title: "Contabilidad",
    icon: BookOpen,
    description: "Registro de operaciones contables, libros fiscales y declaraciones.",
    subsections: [
      {
        id: "cuentas",
        title: "Catálogo de Cuentas",
        description: "Administre el plan de cuentas contables de la empresa.",
        route: "/cuentas",
        steps: [
          {
            title: "Ver Catálogo",
            description: "El catálogo se muestra en formato de árbol jerárquico. Use la barra de búsqueda para filtrar por código o nombre de cuenta."
          },
          {
            title: "Crear Cuenta Manual",
            description: "Haga clic en 'Nueva Cuenta' e ingrese: Código, Nombre, Tipo (Activo/Pasivo/Capital/Ingreso/Gasto), Tipo de Saldo (Deudor/Acreedor/Indiferente), y si permite movimientos."
          },
          {
            title: "Crear Cuenta Rápida (Atajo)",
            description: "Junto a cada cuenta hay íconos '+' para crear una cuenta hermana (mismo nivel) o cuenta hija (subnivel). El código se calcula automáticamente."
          },
          {
            title: "Importar desde CSV",
            description: "Haga clic en 'Importar' y suba un archivo CSV con las columnas: código, nombre, tipo, nivel. Puede descargar una plantilla de ejemplo."
          },
          {
            title: "Copiar de Otra Empresa",
            description: "Use 'Copiar Catálogo' para duplicar todo el plan de cuentas de otra empresa existente."
          },
          {
            title: "Eliminar Cuenta",
            description: "Solo puede eliminar cuentas que no tengan movimientos registrados. Al eliminar una cuenta padre, se eliminarán también sus subcuentas."
          }
        ],
        tips: [
          "Las cuentas con 'Permite Movimiento = No' son cuentas de título (agrupación) y no pueden recibir asientos directos.",
          "El Tipo de Saldo 'Indiferente' permite que la cuenta tenga saldo deudor o acreedor sin validación de sobregiro."
        ]
      },
      {
        id: "partidas",
        title: "Partidas (Libro Diario)",
        description: "Registre asientos contables manuales y automáticos.",
        route: "/partidas",
        steps: [
          {
            title: "Ver Partidas",
            description: "Lista todas las partidas con número, fecha, descripción, totales y estado. Use los filtros para buscar por número, fecha o descripción."
          },
          {
            title: "Crear Partida",
            description: "Haga clic en 'Nueva Partida'. Complete: Fecha, Tipo (Apertura/Diario/Ajuste/Cierre), Descripción. El número se genera automáticamente."
          },
          {
            title: "Agregar Líneas de Detalle",
            description: "Para cada línea: seleccione una Cuenta, ingrese Descripción (opcional), monto al Debe o al Haber. Los totales se calculan automáticamente."
          },
          {
            title: "Validación de Cuadre",
            description: "La partida debe estar cuadrada (Total Debe = Total Haber) para poder guardarse."
          },
          {
            title: "Validación de Sobregiro",
            description: "El sistema valida que las cuentas no queden con saldo contrario a su naturaleza (ej: una cuenta de Activo no puede quedar con saldo acreedor)."
          },
          {
            title: "Contabilizar Partida",
            description: "Las partidas inician en estado 'Borrador'. Haga clic en 'Contabilizar' para confirmarla. Una vez contabilizada, no se puede editar."
          }
        ],
        tips: [
          "Puede crear partidas placeholder (vacías) para reservar números correlativos.",
          "Las cuentas con tipo de saldo 'Indiferente' no generan alertas de sobregiro."
        ]
      },
      {
        id: "libros-fiscales",
        title: "Compras y Ventas (Libros Fiscales)",
        description: "Registre e importe las compras y ventas para los libros de IVA.",
        route: "/libros-fiscales",
        steps: [
          {
            title: "Seleccionar Mes",
            description: "Use los selectores de Mes y Año para ver el libro del período deseado. El sistema crea automáticamente el libro si no existe."
          },
          {
            title: "Pestaña Compras",
            description: "Muestra todas las facturas de compra del mes. Puede ver: fecha, proveedor, NIT, serie/número, tipo documento, montos (neto, IVA, total)."
          },
          {
            title: "Pestaña Ventas",
            description: "Muestra todas las facturas de venta del mes con: fecha, cliente, NIT, autorización FEL, serie/número, tipo documento, montos."
          },
          {
            title: "Importar desde SAT",
            description: "Haga clic en 'Importar'. Suba el archivo CSV descargado del portal SAT. El sistema detecta automáticamente si es libro de compras o ventas."
          },
          {
            title: "Manejo de Duplicados",
            description: "Al importar, el sistema detecta facturas duplicadas (mismo proveedor/cliente y número). Puede elegir: Omitir, Reemplazar o Agregar como nuevo."
          },
          {
            title: "Generar Partida Automática",
            description: "Haga clic en 'Generar Partida' para crear automáticamente el asiento contable del mes. Requiere tener configuradas las cuentas especiales."
          },
          {
            title: "Notas de Crédito",
            description: "Las Notas de Crédito (NCRE) restan automáticamente de los totales. El sistema usa el campo 'affects_total' del tipo de documento."
          }
        ],
        tips: [
          "Los archivos CSV del SAT tienen un formato específico. No modifique el archivo antes de importar.",
          "La partida automática agrupa todas las facturas del mes en un solo asiento.",
          "Puede regenerar la partida si agrega más facturas después."
        ]
      },
      {
        id: "formularios",
        title: "Formularios de Impuestos",
        description: "Registre los formularios SAT pagados.",
        route: "/formularios-impuestos",
        steps: [
          {
            title: "Ver Formularios",
            description: "Lista todos los formularios registrados con: número, tipo, período, fecha de pago y monto."
          },
          {
            title: "Agregar Formulario",
            description: "Haga clic en 'Agregar Formulario'. Ingrese: Número de formulario, Código de acceso, Fecha de pago, Monto pagado, Tipo de impuesto y Período."
          },
          {
            title: "Subir PDF",
            description: "Opcionalmente, suba el PDF de la constancia de pago para tenerlo archivado en el sistema."
          },
          {
            title: "Descargar PDF",
            description: "Haga clic en el ícono de descarga para obtener el PDF guardado de cualquier formulario."
          }
        ],
        tips: [
          "El código de acceso es el que aparece en la constancia de pago del formulario SAT.",
          "Use la búsqueda para encontrar formularios por número o fecha."
        ]
      },
      {
        id: "declaracion",
        title: "Generar Declaración",
        description: "Calcule automáticamente los impuestos del período.",
        route: "/generar-declaracion",
        isNew: true,
        steps: [
          {
            title: "Seleccionar Período",
            description: "Elija el Mes y Año para el cual desea generar la declaración."
          },
          {
            title: "Seleccionar Tipo de Formulario",
            description: "Elija entre: IVA Régimen General (SAT-2237), IVA Pequeño Contribuyente (SAT-2046), ISR Trimestral (SAT-1311)."
          },
          {
            title: "Generar Cálculo",
            description: "El sistema calcula automáticamente: Débito Fiscal (ventas), Crédito Fiscal (compras), IVA a Pagar o Crédito Remanente."
          },
          {
            title: "Crédito Remanente",
            description: "Si hay crédito fiscal a favor, puede ingresarlo manualmente para que se aplique en el siguiente período."
          },
          {
            title: "Exportar Anexos",
            description: "Descargue los anexos de compras y ventas en formato Excel para adjuntar a la declaración."
          }
        ],
        tips: [
          "El cálculo usa los datos del libro de compras y ventas del período seleccionado.",
          "Verifique que todas las facturas estén importadas antes de generar la declaración.",
          "El crédito remanente se arrastra automáticamente si lo ingresa."
        ]
      }
    ]
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
            title: "Seleccionar Fecha",
            description: "Elija la fecha de corte para el balance. Se mostrarán los saldos acumulados hasta esa fecha."
          },
          {
            title: "Ver Balance de Comprobación",
            description: "Se muestra cada cuenta con: Saldo Anterior, Débitos del período, Créditos del período, y Saldo Final."
          },
          {
            title: "Verificar Cuadre",
            description: "Los totales de Débitos y Créditos deben coincidir. El sistema muestra la diferencia si existe descuadre."
          }
        ],
        tips: [
          "Use esta consulta para verificar que la contabilidad está cuadrada antes de generar estados financieros."
        ]
      },
      {
        id: "mayor",
        title: "Mayor General",
        description: "Detalle de movimientos por cuenta.",
        route: "/mayor",
        steps: [
          {
            title: "Seleccionar Cuenta",
            description: "Use el buscador para encontrar y seleccionar la cuenta que desea consultar."
          },
          {
            title: "Seleccionar Rango de Fechas",
            description: "Defina la fecha inicial y final del período a consultar."
          },
          {
            title: "Ver Movimientos",
            description: "Se muestran todos los asientos que afectaron la cuenta: fecha, partida, descripción, débito, crédito y saldo acumulado."
          }
        ],
        tips: [
          "El saldo anterior muestra el acumulado antes de la fecha inicial seleccionada.",
          "Puede hacer clic en el número de partida para ver el detalle completo del asiento."
        ]
      }
    ]
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
        description: "Exporte el libro de compras de un mes específico a Excel o PDF. Incluye totales y desglose de IVA."
      },
      {
        title: "Reporte de Ventas",
        description: "Exporte el libro de ventas de un mes específico a Excel o PDF con todos los detalles fiscales."
      },
      {
        title: "Reporte de Partidas",
        description: "Liste las partidas contables de un período. Puede filtrar por tipo de partida y estado."
      },
      {
        title: "Libro Mayor",
        description: "Exporte el mayor general de una cuenta en formato detallado."
      },
      {
        title: "Balance General",
        description: "Genera el Estado de Situación Financiera a una fecha de corte. Usa el formato configurado en Configuración → Estados Financieros."
      },
      {
        title: "Estado de Resultados",
        description: "Genera el Estado de Pérdidas y Ganancias para un período. Muestra Ingresos, Gastos y Utilidad/Pérdida Neta."
      }
    ],
    tips: [
      "Los reportes de Balance General y Estado de Resultados usan el formato personalizado si está configurado.",
      "Puede exportar a Excel para análisis adicional o a PDF para presentación.",
      "El Balance General calcula automáticamente el Resultado del Período sumando ingresos menos gastos."
    ]
  }
];

const faqItems = [
  {
    question: "¿Cómo cambio la empresa activa?",
    answer: "Vaya a Administración → Empresas y haga clic en el botón 'Seleccionar' de la empresa deseada. La empresa activa se muestra en la parte superior de la pantalla."
  },
  {
    question: "¿Por qué no puedo eliminar una cuenta?",
    answer: "Las cuentas que tienen movimientos (partidas registradas) no pueden eliminarse para mantener la integridad contable. Puede desactivarlas si ya no las necesita."
  },
  {
    question: "¿Cómo corrijo una partida contabilizada?",
    answer: "Las partidas contabilizadas no se pueden editar directamente. Debe crear una partida de ajuste o contrapartida para corregir el error."
  },
  {
    question: "¿Por qué aparece 'Sobregiro detectado' al guardar una partida?",
    answer: "Esto ocurre cuando el movimiento dejaría una cuenta con saldo contrario a su naturaleza (ej: cuenta de Activo con saldo acreedor). Verifique los montos o use una cuenta con tipo de saldo 'Indiferente'."
  },
  {
    question: "¿Cómo importo facturas del SAT?",
    answer: "Vaya a Contabilidad → Compras y Ventas, seleccione el mes, y haga clic en 'Importar'. Suba el archivo CSV descargado del portal del SAT sin modificarlo."
  },
  {
    question: "¿Dónde configuro las cuentas para partidas automáticas?",
    answer: "En Administración → Configuración → Cuentas Contables. Defina las cuentas de IVA, Compras, Ventas, Clientes y Proveedores que se usarán al generar partidas automáticas."
  },
  {
    question: "¿Cómo personalizo el formato del Balance General?",
    answer: "Vaya a Administración → Configuración → Estados Financieros. Seleccione 'Balance General', cree las secciones (Activo, Pasivo, Capital) y asigne las cuentas correspondientes a cada sección."
  },
  {
    question: "¿Por qué el Balance General no cuadra?",
    answer: "Verifique que el Resultado del Período (Ingresos - Gastos) esté correctamente calculado. Revise que todas las cuentas estén asignadas en el diseñador de estados financieros y que no haya partidas descuadradas."
  }
];

const Ayuda = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return helpSections;
    
    const query = searchQuery.toLowerCase();
    return helpSections.filter(section => {
      const matchesMain = 
        section.title.toLowerCase().includes(query) ||
        section.description.toLowerCase().includes(query) ||
        section.steps?.some(s => s.title.toLowerCase().includes(query) || s.description.toLowerCase().includes(query));
      
      const matchesSub = section.subsections?.some(sub =>
        sub.title.toLowerCase().includes(query) ||
        sub.description.toLowerCase().includes(query) ||
        sub.steps?.some(s => s.title.toLowerCase().includes(query) || s.description.toLowerCase().includes(query))
      );
      
      return matchesMain || matchesSub;
    });
  }, [searchQuery]);

  const filteredFaq = useMemo(() => {
    if (!searchQuery.trim()) return faqItems;
    const query = searchQuery.toLowerCase();
    return faqItems.filter(item =>
      item.question.toLowerCase().includes(query) ||
      item.answer.toLowerCase().includes(query)
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

  return (
    <div className="container mx-auto py-6 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <HelpCircle className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Centro de Ayuda</h1>
        </div>
        <p className="text-muted-foreground">
          Manual de usuario interactivo. Encuentre instrucciones detalladas sobre cómo utilizar cada función del sistema.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar en el manual... (ej: partidas, importar, balance)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {helpSections.slice(0, 4).map((section) => (
          <button
            key={section.id}
            onClick={() => {
              setExpandedSection(section.id);
              document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
          >
            <section.icon className="h-5 w-5 text-primary mb-2" />
            <p className="font-medium text-sm">{section.title}</p>
          </button>
        ))}
      </div>

      <Separator className="mb-8" />

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
              <AccordionTrigger className="hover:no-underline text-left">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {item.answer}
              </AccordionContent>
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
