import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { getSafeAuthError } from "@/utils/errorMessages";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Verificar si el usuario está activo y obtener última empresa y tenant
      const { data: userData, error: userError } = await supabase
        .from("tab_users")
        .select("is_active, last_enterprise_id, tenant_id")
        .eq("id", data.user.id)
        .single();

      if (userError) throw userError;

      if (!userData.is_active) {
        await supabase.auth.signOut();
        throw new Error("Tu cuenta está inactiva. Contacta al administrador.");
      }

      // Verificar si el Tenant está activo
      if (userData.tenant_id) {
        const { data: tenantData, error: tenantError } = await supabase
          .from("tab_tenants")
          .select("is_active, tenant_name")
          .eq("id", userData.tenant_id)
          .single();

        if (tenantError) throw tenantError;

        if (!tenantData.is_active) {
          await supabase.auth.signOut();
          throw new Error(
            `La oficina contable "${tenantData.tenant_name}" está inactiva. Contacta al administrador del sistema.`
          );
        }
      }

      // Obtener empresas asignadas al usuario
      const { data: userEnterprises, error: enterprisesError } = await supabase
        .from("tab_user_enterprises")
        .select("enterprise_id, tab_enterprises(id, business_name, is_active)")
        .eq("user_id", data.user.id);

      if (enterprisesError) throw enterprisesError;

      // Filtrar solo empresas activas
      const activeEnterprises = userEnterprises?.filter(
        (ue) => ue.tab_enterprises && (ue.tab_enterprises as any).is_active
      ) || [];

      if (activeEnterprises.length === 0) {
        await supabase.auth.signOut();
        toast({
          variant: "destructive",
          title: "Sin acceso a empresas",
          description: "No tienes empresas asignadas. Contacta a tu administrador para que te asigne acceso a una empresa.",
        });
        setLoading(false);
        return;
      }

      let enterpriseIdToUse: number | null = null;

      // Prioridad 1: Usar última empresa si existe y está en las asignadas
      if (userData.last_enterprise_id) {
        const lastEnterpriseValid = activeEnterprises.find(
          (ue) => ue.enterprise_id === userData.last_enterprise_id
        );
        if (lastEnterpriseValid) {
          enterpriseIdToUse = userData.last_enterprise_id;
        }
      }

      // Prioridad 2: Si no hay última empresa válida, usar la primera asignada
      if (!enterpriseIdToUse && activeEnterprises.length > 0) {
        enterpriseIdToUse = activeEnterprises[0].enterprise_id;
        
        // Actualizar en BD la última empresa para futuras sesiones
        await supabase
          .from("tab_users")
          .update({ last_enterprise_id: enterpriseIdToUse })
          .eq("id", data.user.id);
      }

      // Guardar en localStorage
      if (enterpriseIdToUse) {
        localStorage.setItem("currentEnterpriseId", enterpriseIdToUse.toString());
        window.dispatchEvent(new Event("enterpriseChanged"));
      }

      toast({
        title: "Bienvenido",
        description: "Sesión iniciada exitosamente",
      });

      navigate("/dashboard");
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al iniciar sesión",
        description: getSafeAuthError(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast({
        title: "Correo enviado",
        description: "Revisa tu bandeja de entrada para restablecer tu contraseña",
      });
      
      setShowForgotPassword(false);
      setResetEmail("");
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getSafeAuthError(error),
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/20 to-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
            <img src="/favicon.png" alt="Conta-Online" className="w-16 h-16" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Conta-Online</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Iniciar Sesión</CardTitle>
            <CardDescription>
              Ingresa tus credenciales para acceder al sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  "Iniciar Sesión"
                )}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Contacta a tu administrador para obtener acceso al sistema.
            </div>
            <div className="mt-2 text-center text-sm">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-primary hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Recuperar Contraseña</DialogTitle>
              <DialogDescription>
                Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Correo Electrónico</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  disabled={resetLoading}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForgotPassword(false)}
                  disabled={resetLoading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={resetLoading}>
                  {resetLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    "Enviar enlace"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Login;
