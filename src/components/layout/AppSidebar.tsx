import { Home, Building2, BookOpen, FileText, ShoppingCart, Receipt, Banknote, FileBarChart, Settings, Users, Calculator, HelpCircle, Building, ClipboardList, Package, Inbox, LifeBuoy, GraduationCap, UserCog, ChevronDown, Network } from "lucide-react";
import { useOpenTicketsCount } from "@/hooks/useTickets";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useEffect, useMemo, useState } from "react";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: keyof ReturnType<typeof useUserPermissions>;
  children?: MenuItem[]; // sub-items (single nesting level)
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

type MenuItemOrSection = MenuItem | MenuSection;

const STORAGE_KEY = "sidebar-groups-open";

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
      { title: "Nómina", url: "/nomina", icon: UserCog, requiredPermission: "canViewAccounts" },
      { title: "Conciliación Bancaria", url: "/conciliacion", icon: Banknote, requiredPermission: "canBankReconciliation" },
      { title: "Formularios de Impuestos", url: "/formularios-impuestos", icon: Receipt, requiredPermission: "canManageTaxForms" },
      { title: "Generar Declaración", url: "/generar-declaracion", icon: Calculator, requiredPermission: "canGenerateDeclarations" },
    ],
  },
  {
    title: "Consultas",
    items: [
      { title: "Saldos de Cuentas", url: "/saldos", icon: FileBarChart, requiredPermission: "canViewReports" },
      { title: "Mayor General", url: "/mayor", icon: BookOpen, requiredPermission: "canViewReports" },
      { title: "Reportes", url: "/reportes", icon: FileBarChart, requiredPermission: "canViewReports" },
    ],
  },
  {
    title: "Administración",
    items: [
      { title: "Configuración", url: "/configuracion", icon: Settings, requiredPermission: "canAccessConfiguration" },
      {
        title: "Organización",
        url: "#organizacion", // group header, not navigable
        icon: Network,
        children: [
          { title: "Tenants", url: "/tenants", icon: Building, requiredPermission: "isSuperAdmin" },
          { title: "Usuarios", url: "/usuarios", icon: Users, requiredPermission: "canManageUsers" },
          { title: "Empresas", url: "/empresas", icon: Building2, requiredPermission: "canManageEnterprises" },
          { title: "Bitácora", url: "/bitacora", icon: ClipboardList, requiredPermission: "isTenantAdmin" },
        ],
      },
    ],
  },
  {
    title: "Recursos",
    items: [
      { title: "Soporte", url: "/soporte", icon: LifeBuoy },
      { title: "Capacitación", url: "/capacitacion", icon: GraduationCap },
      { title: "Ayuda", url: "/ayuda", icon: HelpCircle },
    ],
  },
];

function loadOpenState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOpenState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function AppSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const permissions = useUserPermissions();
  const { data: openTicketsCount } = useOpenTicketsCount();
  const location = useLocation();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => loadOpenState());

  // Filtrar menú basado en permisos
  const filteredMenuItems = useMemo(() => {
    if (permissions.isLoading) return allMenuItems;

    const filterItem = (item: MenuItem): MenuItem | null => {
      // Filter children first
      let filteredChildren: MenuItem[] | undefined;
      if (item.children) {
        filteredChildren = item.children
          .map(filterItem)
          .filter(Boolean) as MenuItem[];
        if (filteredChildren.length === 0 && item.url.startsWith("#")) {
          // Group header without visible children → hide
          return null;
        }
      }

      if (item.requiredPermission && permissions[item.requiredPermission] !== true) {
        return null;
      }

      return filteredChildren ? { ...item, children: filteredChildren } : item;
    };

    return allMenuItems
      .map((item) => {
        if ("items" in item) {
          const filteredItems = item.items
            .map(filterItem)
            .filter(Boolean) as MenuItem[];
          if (filteredItems.length === 0) return null;
          return { ...item, items: filteredItems };
        }
        return filterItem(item);
      })
      .filter(Boolean) as MenuItemOrSection[];
  }, [permissions]);

  // Determine which group contains the active route
  const activeGroupTitle = useMemo(() => {
    const path = location.pathname;
    for (const section of filteredMenuItems) {
      if ("items" in section) {
        const match = section.items.some((item) => {
          if (item.url === path) return true;
          if (item.children?.some((c) => c.url === path)) return true;
          return false;
        });
        if (match) return section.title;
      }
    }
    return null;
  }, [filteredMenuItems, location.pathname]);

  // Force-open the active group when route changes (without closing user-opened ones)
  useEffect(() => {
    if (!activeGroupTitle) return;
    setOpenGroups((prev) => {
      if (prev[activeGroupTitle]) return prev;
      const next = { ...prev, [activeGroupTitle]: true };
      saveOpenState(next);
      return next;
    });
  }, [activeGroupTitle]);

  const isGroupOpen = (title: string): boolean => {
    if (title in openGroups) return openGroups[title];
    // Default: open the active group, close the rest
    return title === activeGroupTitle;
  };

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [title]: !isGroupOpen(title) };
      saveOpenState(next);
      return next;
    });
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/30",
      isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "",
    ].join(" ");

  const renderMenuItem = (item: MenuItem) => {
    // Sub-group header (Organización): collapsible inside the section
    if (item.children && item.url.startsWith("#")) {
      const subOpen = isGroupOpen(item.title);
      const childActive = item.children.some((c) => c.url === location.pathname);
      const effectiveOpen = subOpen || childActive;
      return (
        <Collapsible
          key={item.title}
          open={isCollapsed ? true : effectiveOpen}
          onOpenChange={() => !isCollapsed && toggleGroup(item.title)}
        >
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton className="text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/30">
                <item.icon className="h-4 w-4" />
                {!isCollapsed && (
                  <>
                    <span className="truncate flex-1">{item.title}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${effectiveOpen ? "rotate-180" : ""}`}
                    />
                  </>
                )}
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {item.children.map((child) => (
                  <SidebarMenuSubItem key={child.title}>
                    <SidebarMenuSubButton asChild>
                      <NavLink to={child.url} className={navLinkClass}>
                        <child.icon className="h-4 w-4" />
                        {!isCollapsed && <span className="truncate">{child.title}</span>}
                      </NavLink>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      );
    }

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild>
          <NavLink to={item.url} className={navLinkClass}>
            <item.icon className="h-4 w-4" />
            {!isCollapsed && <span className="truncate flex-1">{item.title}</span>}
            {!isCollapsed && item.url === "/soporte" && !!openTicketsCount && openTicketsCount > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                {openTicketsCount}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r [&_*]:text-sidebar-foreground">
      <SidebarContent>
        {filteredMenuItems.map((section, idx) => {
          if ("items" in section) {
            const open = isCollapsed ? true : isGroupOpen(section.title);
            return (
              <Collapsible
                key={`${section.title}-${idx}`}
                open={open}
                onOpenChange={() => !isCollapsed && toggleGroup(section.title)}
              >
                <SidebarGroup>
                  {!isCollapsed && (
                    <CollapsibleTrigger asChild>
                      <SidebarGroupLabel className="text-sidebar-foreground/80 font-semibold cursor-pointer hover:text-sidebar-foreground flex items-center justify-between group">
                        <span>{section.title}</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                        />
                      </SidebarGroupLabel>
                    </CollapsibleTrigger>
                  )}
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {section.items.map(renderMenuItem)}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            );
          }

          return (
            <SidebarGroup key={`${section.title}-${idx}`}>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to={section.url} className={navLinkClass}>
                        <section.icon className="h-4 w-4" />
                        {!isCollapsed && <span className="truncate">{section.title}</span>}
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
