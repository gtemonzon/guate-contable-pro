import { Home, Building2, BookOpen, FileText, ShoppingCart, Receipt, Banknote, FileBarChart, Settings, Users, Calculator, HelpCircle, CalendarDays, Building, ClipboardList, Package, Inbox, LifeBuoy } from "lucide-react";
import { useOpenTicketsCount } from "@/hooks/useTickets";
import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useMemo } from "react";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: keyof ReturnType<typeof useUserPermissions>;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

type MenuItemOrSection = MenuItem | MenuSection;

const allMenuItems: MenuItemOrSection[] = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Bandeja", url: "/inbox", icon: Inbox },
  {
    title: "Contabilidad",
    items: [
      { title: "Catálogo de Cuentas", url: "/cuentas", icon: BookOpen, requiredPermission: "canViewAccounts" },
      { title: "Partidas (Libro Diario)", url: "/partidas", icon: FileText, requiredPermission: "canViewAccounts" },
      { title: "Compras y Ventas", url: "/libros-fiscales", icon: ShoppingCart, requiredPermission: "canViewAccounts" },
      { title: "Activos Fijos", url: "/activos-fijos", icon: Package, requiredPermission: "canViewAccounts" },
      { title: "Conciliación Bancaria", url: "/conciliacion", icon: Banknote, requiredPermission: "canBankReconciliation" },
      { title: "Formularios de Impuestos", url: "/formularios-impuestos", icon: Receipt, requiredPermission: "canManageTaxForms" },
      { title: "Generar Declaración", url: "/generar-declaracion", icon: Calculator, requiredPermission: "canGenerateDeclarations" },
    ],
  },
  {
    title: "Consultas",
    items: [
      { title: "Saldos de Cuentas", url: "/saldos", icon: FileBarChart, requiredPermission: "canViewReports" },
      { title: "Saldos Mensuales", url: "/saldos-mensuales", icon: CalendarDays, requiredPermission: "canViewReports" },
      { title: "Mayor General", url: "/mayor", icon: BookOpen, requiredPermission: "canViewReports" },
      { title: "Reportes", url: "/reportes", icon: FileBarChart, requiredPermission: "canViewReports" },
    ],
  },
  {
    title: "Administración",
    items: [
      { title: "Tenants", url: "/tenants", icon: Building, requiredPermission: "isSuperAdmin" },
      { title: "Usuarios", url: "/usuarios", icon: Users, requiredPermission: "canManageUsers" },
      { title: "Empresas", url: "/empresas", icon: Building2, requiredPermission: "canManageEnterprises" },
      { title: "Bitácora", url: "/bitacora", icon: ClipboardList, requiredPermission: "isTenantAdmin" },
      { title: "Configuración", url: "/configuracion", icon: Settings, requiredPermission: "canAccessConfiguration" },
      { title: "Ayuda", url: "/ayuda", icon: HelpCircle },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const permissions = useUserPermissions();

  // Filtrar menú basado en permisos
  const filteredMenuItems = useMemo(() => {
    if (permissions.isLoading) return allMenuItems;

    return allMenuItems
      .map((item) => {
        if ("items" in item) {
          // Es una sección con subitems
          const filteredItems = item.items.filter((subItem) => {
            if (!subItem.requiredPermission) return true;
            return permissions[subItem.requiredPermission] === true;
          });

          if (filteredItems.length === 0) return null;

          return {
            ...item,
            items: filteredItems,
          };
        }

        // Es un item individual
        if (item.requiredPermission && permissions[item.requiredPermission] !== true) {
          return null;
        }

        return item;
      })
      .filter(Boolean) as MenuItemOrSection[];
  }, [permissions]);

  return (
    <Sidebar collapsible="icon" className="border-r [&_*]:text-sidebar-foreground">
      <SidebarContent>
        {filteredMenuItems.map((section, idx) => {
          if ("items" in section) {
            return (
              <SidebarGroup key={idx}>
                <SidebarGroupLabel className="text-sidebar-foreground/80 font-semibold">{section.title}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            className={({ isActive }) =>
                              [
                                "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/30",
                                isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "",
                              ].join(" ")
                            }
                          >
                            <item.icon className="h-4 w-4" />
                            {!isCollapsed && <span className="truncate">{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          return (
            <SidebarGroup key={idx}>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={section.url}
                        className={({ isActive }) =>
                          [
                            "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/30",
                            isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "",
                          ].join(" ")
                        }
                      >
                        <section.icon className="h-4 w-4" />
                        {!isCollapsed && (
                          <span className="truncate">{section.title}</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
