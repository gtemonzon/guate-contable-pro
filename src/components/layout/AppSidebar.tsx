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
import { useCallback, useEffect, useMemo, useState } from "react";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: keyof ReturnType<typeof useUserPermissions>;
  children?: MenuItem[];
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

type MenuItemOrSection = MenuItem | MenuSection;

const STORAGE_KEY = "sidebar-active-group";
const STORAGE_SUBGROUP_KEY = "sidebar-active-subgroup";

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
        url: "#organizacion",
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

export function AppSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const permissions = useUserPermissions();
  const { data: openTicketsCount } = useOpenTicketsCount();
  const location = useLocation();

  const filteredMenuItems = useMemo(() => {
    if (permissions.isLoading) return allMenuItems;

    const filterItem = (item: MenuItem): MenuItem | null => {
      let filteredChildren: MenuItem[] | undefined;
      if (item.children) {
        filteredChildren = item.children.map(filterItem).filter(Boolean) as MenuItem[];
        if (filteredChildren.length === 0 && item.url.startsWith("#")) return null;
      }
      if (item.requiredPermission && permissions[item.requiredPermission] !== true) return null;
      return filteredChildren ? { ...item, children: filteredChildren } : item;
    };

    return allMenuItems
      .map((item) => {
        if ("items" in item) {
          const filteredItems = item.items.map(filterItem).filter(Boolean) as MenuItem[];
          if (filteredItems.length === 0) return null;
          return { ...item, items: filteredItems };
        }
        return filterItem(item);
      })
      .filter(Boolean) as MenuItemOrSection[];
  }, [permissions]);

  // Find which group/subgroup contains the current route
  const { activeGroupTitle, activeSubgroupTitle } = useMemo(() => {
    const path = location.pathname;
    for (const section of filteredMenuItems) {
      if (!("items" in section)) continue;
      for (const item of section.items) {
        if (item.url === path) return { activeGroupTitle: section.title, activeSubgroupTitle: null as string | null };
        if (item.children?.some((c) => c.url === path)) {
          return { activeGroupTitle: section.title, activeSubgroupTitle: item.title };
        }
      }
    }
    return { activeGroupTitle: null as string | null, activeSubgroupTitle: null as string | null };
  }, [filteredMenuItems, location.pathname]);

  // Single open main group (accordion). Initialize from storage or active route.
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [openSubgroup, setOpenSubgroup] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_SUBGROUP_KEY);
    } catch {
      return null;
    }
  });

  // Sync open group with active route
  useEffect(() => {
    if (activeGroupTitle && activeGroupTitle !== openGroup) {
      setOpenGroup(activeGroupTitle);
      try { localStorage.setItem(STORAGE_KEY, activeGroupTitle); } catch {}
    }
    if (activeSubgroupTitle && activeSubgroupTitle !== openSubgroup) {
      setOpenSubgroup(activeSubgroupTitle);
      try { localStorage.setItem(STORAGE_SUBGROUP_KEY, activeSubgroupTitle); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupTitle, activeSubgroupTitle]);

  const toggleGroup = useCallback((title: string) => {
    setOpenGroup((prev) => {
      const next = prev === title ? null : title;
      try {
        if (next) localStorage.setItem(STORAGE_KEY, next);
        else localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return next;
    });
  }, []);

  const toggleSubgroup = useCallback((title: string) => {
    setOpenSubgroup((prev) => {
      const next = prev === title ? null : title;
      try {
        if (next) localStorage.setItem(STORAGE_SUBGROUP_KEY, next);
        else localStorage.removeItem(STORAGE_SUBGROUP_KEY);
      } catch {}
      return next;
    });
  }, []);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "relative flex items-center gap-2 rounded-md transition-all duration-200",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
      isActive
        ? "bg-sidebar-primary/15 text-sidebar-primary font-semibold shadow-sm ring-1 ring-sidebar-primary/20 before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary [&_svg]:text-sidebar-primary [&_svg]:scale-110"
        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 [&_svg]:text-sidebar-foreground/60 hover:[&_svg]:text-sidebar-foreground",
    ].join(" ");

  const renderMenuItem = (item: MenuItem) => {
    // Sub-group header (e.g. Organización)
    if (item.children && item.url.startsWith("#")) {
      const childActive = item.children.some((c) => c.url === location.pathname);
      const subOpen = isCollapsed ? true : (openSubgroup === item.title || childActive);
      return (
        <Collapsible
          key={item.title}
          open={subOpen}
          onOpenChange={() => !isCollapsed && toggleSubgroup(item.title)}
        >
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                aria-expanded={subOpen}
                className={[
                  "transition-colors",
                  childActive
                    ? "text-sidebar-foreground font-medium bg-sidebar-accent/25"
                    : "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/30",
                ].join(" ")}
              >
                <item.icon className="h-4 w-4" />
                {!isCollapsed && (
                  <>
                    <span className="truncate flex-1">{item.title}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${subOpen ? "rotate-180" : ""}`}
                    />
                  </>
                )}
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
              <SidebarMenuSub className="ml-1 border-l border-sidebar-border/60 pl-2">
                {item.children.map((child) => (
                  <SidebarMenuSubItem key={child.title}>
                    <SidebarMenuSubButton asChild>
                      <NavLink
                        to={child.url}
                        end
                        className={navLinkClass}
                        aria-current={location.pathname === child.url ? "page" : undefined}
                      >
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
          <NavLink
            to={item.url}
            end
            className={navLinkClass}
            aria-current={location.pathname === item.url ? "page" : undefined}
          >
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
      <SidebarContent className="gap-2 py-3">
        {filteredMenuItems.map((section, idx) => {
          if ("items" in section) {
            const isActiveSection = section.title === activeGroupTitle;
            const open = isCollapsed ? true : openGroup === section.title;
            return (
              <Collapsible
                key={`${section.title}-${idx}`}
                open={open}
                onOpenChange={() => !isCollapsed && toggleGroup(section.title)}
              >
                <SidebarGroup className="py-1">
                  {!isCollapsed && (
                    <CollapsibleTrigger asChild>
                      <SidebarGroupLabel
                        aria-expanded={open}
                        className={[
                          "font-semibold cursor-pointer flex items-center justify-between group transition-colors uppercase tracking-wider text-xs",
                          isActiveSection
                            ? "text-sidebar-primary"
                            : "text-sidebar-foreground/55 hover:text-sidebar-foreground",
                        ].join(" ")}
                      >
                        <span>{section.title}</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                        />
                      </SidebarGroupLabel>
                    </CollapsibleTrigger>
                  )}
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <SidebarGroupContent>
                      <SidebarMenu>{section.items.map(renderMenuItem)}</SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            );
          }

          return (
            <SidebarGroup key={`${section.title}-${idx}`} className="py-1">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip={section.title}>
                      <NavLink
                        to={section.url}
                        end
                        className={navLinkClass}
                        aria-current={location.pathname === section.url ? "page" : undefined}
                      >
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
