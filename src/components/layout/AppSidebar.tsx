import { Home, Building2, BookOpen, FileText, ShoppingCart, Receipt, Banknote, FileBarChart, Settings, Users, Calculator, HelpCircle, Building, ClipboardList, Package, Inbox, LifeBuoy, GraduationCap, UserCog, ChevronDown, Network, ShieldCheck, Boxes, Store } from "lucide-react";
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
  hideIfSuperAdmin?: boolean;
  disabled?: boolean;
  badge?: string;
  description?: string;
  children?: MenuItem[];
}

interface MenuSection {
  title: string;
  description?: string;
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
    ],
  },
  {
    title: "Gestión Tributaria",
    items: [
      { title: "Formularios de Impuestos", url: "/formularios-impuestos", icon: Receipt, requiredPermission: "canManageTaxForms" },
      { title: "Generar Declaración", url: "/generar-declaracion", icon: Calculator, requiredPermission: "canGenerateDeclarations" },
      { title: "Retenciones y Exenciones", url: "/retenciones-exenciones", icon: ShieldCheck, requiredPermission: "canViewAccounts" },
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
    title: "Módulos ERP",
    description: "Próximamente: extensiones del ERP",
    items: [
      { title: "Cuentas por Cobrar", url: "#cxc", icon: Boxes, disabled: true, badge: "Próximamente" },
      { title: "Cuentas por Pagar", url: "#cxp", icon: Boxes, disabled: true, badge: "Próximamente" },
      { title: "Inventario", url: "#inv", icon: Store, disabled: true, badge: "Próximamente" },
      { title: "Gestión Tributaria Avanzada", url: "#tax-mgmt", icon: ShieldCheck, disabled: true, badge: "Próximamente" },
    ],
  },
  {
    title: "Mi Organización",
    description: "Datos maestros de tu oficina, usuarios y empresas",
    items: [
      { title: "Mi Oficina", url: "/tenant-settings", icon: Building, requiredPermission: "isTenantAdmin", hideIfSuperAdmin: true, description: "Identidad, contacto y marca de tu oficina contable" },
      { title: "Tenants", url: "/tenants", icon: Building, requiredPermission: "isSuperAdmin", description: "Administración de todas las oficinas (solo plataforma)" },
      { title: "Empresas", url: "/empresas", icon: Building2, requiredPermission: "canManageEnterprises", description: "Datos maestros de las empresas clientes" },
      { title: "Usuarios", url: "/usuarios", icon: Users, requiredPermission: "canManageUsers", description: "Usuarios y roles de tu oficina" },
      { title: "Bitácora", url: "/bitacora", icon: ClipboardList, requiredPermission: "isTenantAdmin" },
    ],
  },
  {
    title: "Configuración del Sistema",
    description: "Catálogos contables, tributarios y comportamiento del ERP",
    items: [
      { title: "Configuración", url: "/configuracion", icon: Settings, requiredPermission: "canAccessConfiguration", description: "Cuentas, impuestos, prefijos, alertas y más" },
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
      if (item.hideIfSuperAdmin && permissions.isSuperAdmin) return null;
      if (item.requiredPermission && permissions[item.requiredPermission] !== true) return null;
      return filteredChildren ? { ...item, children: filteredChildren } : item;
    };

    return allMenuItems
      .map((item) => {
        if ("items" in item) {
          // Módulos ERP section: keep visible even with only disabled placeholders
          const isPlaceholderSection = item.items.every((i) => i.disabled);
          const filteredItems = isPlaceholderSection
            ? item.items
            : (item.items.map(filterItem).filter(Boolean) as MenuItem[]);
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

  const isRouteActive = useCallback(
    (url: string) => {
      if (!url || url.startsWith("#")) return false;
      const path = location.pathname;
      return path === url || path.startsWith(url + "/");
    },
    [location.pathname]
  );

  const buildNavClass = (active: boolean) =>
    [
      "relative flex items-center gap-2 rounded-lg transition-colors duration-200 w-full",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
      active
        ? "bg-sidebar-accent/50 text-sidebar-accent-foreground font-semibold shadow-sm hover:bg-sidebar-accent/60 [&_svg]:text-sidebar-accent-foreground"
        : "bg-transparent text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/20 [&_svg]:text-sidebar-foreground/55 hover:[&_svg]:text-sidebar-foreground",
    ].join(" ");

  const renderMenuItem = (item: MenuItem) => {
    // Sub-group header (e.g. Organización)
    if (item.children && item.url.startsWith("#")) {
      const childActive = item.children.some((c) => isRouteActive(c.url));
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
                  "transition-colors rounded-lg",
                  childActive
                    ? "text-sidebar-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/20",
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
              <SidebarMenuSub className="ml-1 pl-2">
                {item.children.map((child) => {
                  const childIsActive = isRouteActive(child.url);
                  return (
                    <SidebarMenuSubItem key={child.title}>
                      <SidebarMenuSubButton asChild isActive={childIsActive}>
                        <NavLink
                          to={child.url}
                          end
                          className={buildNavClass(childIsActive)}
                          aria-current={childIsActive ? "page" : undefined}
                        >
                          <child.icon className="h-4 w-4" />
                          {!isCollapsed && <span className="truncate">{child.title}</span>}
                        </NavLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  );
                })}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      );
    }

    const active = isRouteActive(item.url);

    // Disabled placeholder (e.g. upcoming ERP modules)
    if (item.disabled) {
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            disabled
            tooltip={item.description || item.title}
            className="cursor-not-allowed opacity-60"
            title={item.description}
          >
            <item.icon className="h-4 w-4" />
            {!isCollapsed && (
              <>
                <span className="truncate flex-1">{item.title}</span>
                {item.badge && (
                  <span className="ml-auto inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={active} tooltip={item.description || item.title}>
          <NavLink
            to={item.url}
            end
            className={buildNavClass(active)}
            aria-current={active ? "page" : undefined}
            title={item.description}
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
                        title={section.description}
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
                    {!isCollapsed && section.description && (
                      <p className="px-3 pb-2 text-[10px] leading-tight text-sidebar-foreground/40 italic">
                        {section.description}
                      </p>
                    )}
                    <SidebarGroupContent>
                      <SidebarMenu>{section.items.map(renderMenuItem)}</SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            );
          }

          const sectionActive = isRouteActive(section.url);
          return (
            <SidebarGroup key={`${section.title}-${idx}`} className="py-1">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip={section.title} isActive={sectionActive}>
                      <NavLink
                        to={section.url}
                        end
                        className={buildNavClass(sectionActive)}
                        aria-current={sectionActive ? "page" : undefined}
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
