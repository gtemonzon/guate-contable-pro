import { Home, Building2, BookOpen, FileText, ShoppingCart, Receipt, Banknote, FileBarChart, Upload, Settings, Users } from "lucide-react";
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

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  {
    title: "Administración",
    items: [
      { title: "Usuarios", url: "/usuarios", icon: Users },
      { title: "Empresas", url: "/empresas", icon: Building2 },
      { title: "Configuración", url: "/configuracion", icon: Settings },
    ],
  },
  {
    title: "Contabilidad",
    items: [
      { title: "Catálogo de Cuentas", url: "/cuentas", icon: BookOpen },
      { title: "Partidas (Libro Diario)", url: "/partidas", icon: FileText },
      { title: "Compras y Ventas", url: "/libros-fiscales", icon: ShoppingCart },
      { title: "Conciliación Bancaria", url: "/conciliacion", icon: Banknote },
      { title: "Formularios de Impuestos", url: "/formularios-impuestos", icon: Receipt },
    ],
  },
  {
    title: "Consultas",
    items: [
      { title: "Saldos de Cuentas", url: "/saldos", icon: FileBarChart },
      { title: "Mayor General", url: "/mayor", icon: BookOpen },
    ],
  },
  {
    title: "Reportes",
    url: "/reportes",
    icon: FileBarChart,
  },
  {
    title: "Importación",
    url: "/importar",
    icon: Upload,
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r [&_*]:text-sidebar-foreground">
      <SidebarContent>
        {menuItems.map((section, idx) => {
          if ("items" in section) {
            return (
              <SidebarGroup key={idx}>
                <SidebarGroupLabel className="text-sidebar-foreground/60">{section.title}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            className={({ isActive }) =>
                              [
                                "text-sidebar-foreground/70 hover:text-sidebar-foreground",
                                isActive ? "bg-accent text-accent-foreground" : "",
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
                            "text-sidebar-foreground/70 hover:text-sidebar-foreground",
                            isActive ? "bg-accent text-accent-foreground" : "",
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
