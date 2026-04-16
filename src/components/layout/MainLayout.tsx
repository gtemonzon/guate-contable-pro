import { useEffect, useState, useCallback, useMemo } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { User, Session } from "@supabase/supabase-js";
import { LogOut, ChevronDown, Building2, Search, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { TenantSelector } from "@/components/tenants/TenantSelector";
import { useTenant } from "@/contexts/TenantContext";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import { useTenantFavicon } from "@/hooks/useTenantFavicon";
import { GlobalSearchPalette } from "@/components/search/GlobalSearchPalette";
import { KeyboardShortcutsDialog } from "@/components/shortcuts/KeyboardShortcutsDialog";
import { EnterpriseOption } from "@/contexts/EnterpriseContext";
import { ScrollArea } from "@/components/ui/scroll-area";

function EnterpriseSearchSelector({
  enterprises,
  selectedEnterpriseId,
  switchEnterprise,
  selectedEnterprise,
}: {
  enterprises: EnterpriseOption[];
  selectedEnterpriseId: number | null;
  switchEnterprise: (id: number) => void;
  selectedEnterprise: EnterpriseOption | null;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return enterprises;
    const q = search.toLowerCase();
    return enterprises.filter(
      (e) =>
        e.business_name.toLowerCase().includes(q) ||
        e.nit.toLowerCase().includes(q) ||
        (e.trade_name && e.trade_name.toLowerCase().includes(q))
    );
  }, [enterprises, search]);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="hidden md:flex items-center gap-1 max-w-[200px]">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate text-xs">
            {selectedEnterprise?.business_name ?? "Seleccionar empresa"}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="max-h-[280px]">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin resultados</p>
          ) : (
            filtered.map((ent) => (
              <button
                key={ent.id}
                onClick={() => { switchEnterprise(ent.id); setOpen(false); setSearch(""); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors ${
                  selectedEnterpriseId === ent.id ? "bg-accent" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium block truncate">{ent.business_name}</span>
                  <span className="text-xs text-muted-foreground">{ent.nit}</span>
                </div>
                {selectedEnterpriseId === ent.id && (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

const MainLayout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentTenant, isTenantActive, isSuperAdmin } = useTenant();
  const {
    enterprises,
    selectedEnterprise,
    selectedEnterpriseId,
    switchEnterprise,
  } = useEnterprise();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Global "?" shortcut to show keyboard shortcuts help
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (!session) navigate("/login");
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) navigate("/login");
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Activity tracking
  useActivityTracker({ userId: user?.id, enterpriseName: selectedEnterprise?.business_name ?? "" });

  // Dynamic favicon based on tenant logo
  useTenantFavicon(currentTenant?.logo_url);

  // Tenant active check (every 60 s)
  useEffect(() => {
    if (isSuperAdmin || !currentTenant) return;

    const checkTenantStatus = async () => {
      const { data } = await supabase
        .from("tab_tenants")
        .select("is_active")
        .eq("id", currentTenant.id)
        .single();

      if (data && !data.is_active) {
        await supabase.auth.signOut();
        toast({
          variant: "destructive",
          title: "Sesión terminada",
          description: "Tu oficina contable ha sido desactivada. Contacta al administrador del sistema.",
        });
        navigate("/login");
      }
    };

    const interval = setInterval(checkTenantStatus, 60000);
    return () => clearInterval(interval);
  }, [currentTenant, isSuperAdmin, navigate, toast]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Sesión cerrada", description: "Has cerrado sesión exitosamente" });
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  const userInitials =
    user.user_metadata?.full_name
      ?.split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase() || user.email?.substring(0, 2).toUpperCase();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-6">
            <SidebarTrigger />

            <div className="flex items-center gap-2">
              {currentTenant?.logo_url ? (
                <Avatar className="h-10 w-10">
                  <AvatarImage src={currentTenant.logo_url} alt={currentTenant.tenant_name} className="object-contain" />
                  <AvatarFallback className="text-xs">
                    {currentTenant.tenant_name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <img src="/favicon.png" alt="Logo" className="h-8 w-8" />
              )}
              <div className="hidden sm:flex flex-col">
                <span className="text-sm font-semibold leading-tight">
                  {currentTenant?.tenant_name || "Sistema Contable"}
                </span>
                {selectedEnterprise && (
                  <span className="text-xs text-muted-foreground leading-tight">
                    {selectedEnterprise.business_name}
                  </span>
                )}
              </div>
            </div>

            {/* Enterprise switcher — only show if user has >1 enterprise */}
            {enterprises.length > 1 && (
              <EnterpriseSearchSelector
                enterprises={enterprises}
                selectedEnterpriseId={selectedEnterpriseId}
                switchEnterprise={switchEnterprise}
                selectedEnterprise={selectedEnterprise}
              />
            )}

            <div className="ml-auto flex items-center gap-3">
              <GlobalSearchPalette enterpriseId={selectedEnterpriseId ? selectedEnterpriseId.toString() : null} />
              <TenantSelector />
              <NotificationCenter enterpriseId={selectedEnterpriseId} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar>
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user.user_metadata?.full_name || "Usuario"}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Cerrar Sesión</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 p-6 bg-muted/30">
            <Outlet />
          </main>
        </div>
      </div>
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </SidebarProvider>
  );
};

export default MainLayout;
