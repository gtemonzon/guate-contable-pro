import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { User, Session } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { TenantSelector } from "@/components/tenants/TenantSelector";
import { useTenant } from "@/contexts/TenantContext";

const MainLayout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentEnterprise, setCurrentEnterprise] = useState<string>("");
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (!session) {
          navigate("/login");
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate("/login");
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Activity tracking
  useActivityTracker({ userId: user?.id, enterpriseName: currentEnterprise });

  // Fetch and listen for current enterprise changes
  useEffect(() => {
    const fetchCurrentEnterprise = async () => {
      let enterpriseId = localStorage.getItem("currentEnterpriseId");
      
      // Si no hay empresa en localStorage, buscar última empresa del usuario en BD
      if (!enterpriseId && user) {
        try {
          const { data: userData } = await supabase
            .from('tab_users')
            .select('last_enterprise_id')
            .eq('id', user.id)
            .single();
          
          if (userData?.last_enterprise_id) {
            enterpriseId = userData.last_enterprise_id.toString();
            localStorage.setItem("currentEnterpriseId", enterpriseId);
          }
        } catch (error) {
          console.error("Error fetching last enterprise from DB:", error);
        }
      }
      
      setCurrentEnterpriseId(enterpriseId);
      
      if (enterpriseId) {
        try {
          const { data, error } = await supabase
            .from("tab_enterprises")
            .select("business_name")
            .eq("id", parseInt(enterpriseId))
            .single();
          
          if (error) throw error;
          setCurrentEnterprise(data.business_name);
        } catch (error) {
          console.error("Error fetching enterprise:", error);
          setCurrentEnterprise("");
        }
      } else {
        setCurrentEnterprise("");
      }
    };

    // Only fetch when user is available
    if (user) {
      fetchCurrentEnterprise();
    }

    // Listen for storage events (from other tabs)
    const handleStorageChange = () => {
      fetchCurrentEnterprise();
    };

    // Listen for custom enterprise changed events (from same tab)
    const handleEnterpriseChanged = () => {
      fetchCurrentEnterprise();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("enterpriseChanged", handleEnterpriseChanged);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("enterpriseChanged", handleEnterpriseChanged);
    };
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Sesión cerrada",
      description: "Has cerrado sesión exitosamente",
    });
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const userInitials = user.user_metadata?.full_name
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
            
            <div className="flex items-center gap-2 text-lg font-semibold">
              <img src="/favicon.png" alt="Logo" className="h-6 w-6" />
              <span className="hidden sm:inline truncate max-w-md">
                {currentTenant 
                  ? `${currentTenant.tenant_name}${currentEnterprise ? ` - ${currentEnterprise}` : ""}`
                  : currentEnterprise 
                    ? `Sistema Contable - ${currentEnterprise}`
                    : "Sistema Contable"
                }
              </span>
            </div>

            <div className="ml-auto flex items-center gap-4">
              <TenantSelector />
              <NotificationCenter enterpriseId={currentEnterpriseId ? parseInt(currentEnterpriseId) : null} />

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
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
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
    </SidebarProvider>
  );
};

export default MainLayout;
