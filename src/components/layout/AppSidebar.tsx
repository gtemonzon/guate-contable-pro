import { Home, Building2, BookOpen, FileText, ShoppingCart, Receipt, Banknote, FileBarChart, Upload, Settings } from "lucide-react";
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
    title: "Empresa",
    items: [
      { title: "Información", url: "/empresas", icon: Building2 },
    ],
  },
  {
    title: "Contabilidad",
    items: [
      { title: "Catálogo de Cuentas", url: "/cuentas", icon: BookOpen },
      { title: "Períodos Contables", url: "/periodos", icon: FileText },
      { title: "Partidas (Libro Diario)", url: "/partidas", icon: FileText },
      { title: "Libro de Compras", url: "/compras", icon: ShoppingCart },
      { title: "Libro de Ventas", url: "/ventas", icon: Receipt },
      { title: "Conciliación Bancaria", url: "/conciliacion", icon: Banknote },
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
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        {menuItems.map((section, idx) => {
          if ("items" in section) {
            return (
              <SidebarGroup key={idx}>
                <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            className={({ isActive }) =>
                              isActive ? "bg-accent text-accent-foreground" : ""
                            }
                          >
                            <item.icon className="h-4 w-4" />
                            {!isCollapsed && <span>{item.title}</span>}
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
                          isActive ? "bg-accent text-accent-foreground" : ""
                        }
                      >
                        <section.icon className="h-4 w-4" />
                        {!isCollapsed && <span>{section.title}</span>}
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
