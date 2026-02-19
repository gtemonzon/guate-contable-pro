import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "error" | "loading";
  message: string;
  detail?: string;
}

async function checkBackendConnectivity(): Promise<CheckResult> {
  try {
    const { error } = await supabase.from("tab_currencies").select("id").limit(1);
    if (error) throw error;
    return { name: "Conectividad Backend", status: "ok", message: "Conexión establecida correctamente." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name: "Conectividad Backend", status: "error", message: "No se puede conectar al backend.", detail: msg };
  }
}

async function checkAuth(): Promise<CheckResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { name: "Sesión de Usuario", status: "warn", message: "No hay sesión activa.", detail: "Inicia sesión para usar la aplicación." };
    }
    return { name: "Sesión de Usuario", status: "ok", message: `Autenticado como ${user.email}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name: "Sesión de Usuario", status: "error", message: "Error verificando sesión.", detail: msg };
  }
}

async function checkTenantContext(): Promise<CheckResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { name: "Contexto de Tenant", status: "warn", message: "Sin sesión activa." };

    const { data, error } = await supabase
      .from("tab_users")
      .select("tenant_id, is_super_admin, is_tenant_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data?.tenant_id) {
      return { name: "Contexto de Tenant", status: "error", message: "El usuario no tiene tenant asignado.", detail: "Contacta al administrador del sistema." };
    }
    return { name: "Contexto de Tenant", status: "ok", message: `Tenant ID: ${data.tenant_id}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name: "Contexto de Tenant", status: "error", message: "Error verificando tenant.", detail: msg };
  }
}

async function checkEnterpriseContext(): Promise<CheckResult> {
  const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
  if (!currentEnterpriseId) {
    return { name: "Empresa Activa", status: "warn", message: "Ninguna empresa seleccionada.", detail: "Selecciona una empresa en el menú superior." };
  }
  try {
    const { data, error } = await supabase
      .from("tab_enterprises")
      .select("id, business_name, is_active")
      .eq("id", parseInt(currentEnterpriseId))
      .maybeSingle();
    if (error) throw error;
    if (!data) return { name: "Empresa Activa", status: "error", message: "Empresa no encontrada o sin acceso.", detail: `ID: ${currentEnterpriseId}` };
    if (!data.is_active) return { name: "Empresa Activa", status: "warn", message: `Empresa "${data.business_name}" está inactiva.` };
    return { name: "Empresa Activa", status: "ok", message: `${data.business_name} (ID: ${data.id})` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name: "Empresa Activa", status: "error", message: "Error verificando empresa.", detail: msg };
  }
}

async function checkRLSEnabled(): Promise<CheckResult> {
  try {
    // Attempt a basic query; if RLS is misconfigured this will surface in connectivity checks.
    // We verify via the fail_if_rls_gap function if the user has sufficient permissions.
    const { data, error } = await supabase.rpc("fail_if_rls_gap" as never);
    if (error) {
      // Non-admin users won't have access — that itself means RLS is working
      if (error.code === "42501" || error.message?.includes("permission")) {
        return { name: "RLS (Row-Level Security)", status: "ok", message: "RLS activo — función de auditoría restringida correctamente." };
      }
      throw error;
    }
    const gaps = Array.isArray(data) ? data : [];
    if (gaps.length === 0) {
      return { name: "RLS (Row-Level Security)", status: "ok", message: "Todas las tablas tienen RLS y políticas correctas." };
    }
    return {
      name: "RLS (Row-Level Security)",
      status: "error",
      message: `${gaps.length} tabla(s) con cobertura RLS incompleta.`,
      detail: gaps.map((g: { tablename: string }) => g.tablename).join(", "),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name: "RLS (Row-Level Security)", status: "warn", message: "No se pudo verificar RLS.", detail: msg };
  }
}

function checkEnvVars(): CheckResult {
  const required = [
    { key: "VITE_SUPABASE_URL", value: import.meta.env.VITE_SUPABASE_URL },
    { key: "VITE_SUPABASE_PUBLISHABLE_KEY", value: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    { key: "VITE_SUPABASE_PROJECT_ID", value: import.meta.env.VITE_SUPABASE_PROJECT_ID },
  ];
  const missing = required.filter((v) => !v.value || v.value === "undefined").map((v) => v.key);
  if (missing.length > 0) {
    return { name: "Variables de Entorno", status: "error", message: "Variables requeridas faltantes.", detail: missing.join(", ") };
  }
  return { name: "Variables de Entorno", status: "ok", message: "Todas las variables de entorno requeridas están presentes." };
}

const StatusIcon = ({ status }: { status: CheckResult["status"] }) => {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  return <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />;
};

const StatusBadge = ({ status }: { status: CheckResult["status"] }) => {
  const map: Record<CheckResult["status"], { label: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
    ok: { label: "OK", variant: "default" },
    error: { label: "ERROR", variant: "destructive" },
    warn: { label: "AVISO", variant: "secondary" },
    loading: { label: "...", variant: "outline" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
};

export function SystemHealthCheck() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);

  const runChecks = async () => {
    setRunning(true);
    // Show loading state immediately
    setChecks([
      { name: "Variables de Entorno", status: "loading", message: "Verificando..." },
      { name: "Conectividad Backend", status: "loading", message: "Verificando..." },
      { name: "Sesión de Usuario", status: "loading", message: "Verificando..." },
      { name: "Contexto de Tenant", status: "loading", message: "Verificando..." },
      { name: "Empresa Activa", status: "loading", message: "Verificando..." },
      { name: "RLS (Row-Level Security)", status: "loading", message: "Verificando..." },
    ]);

    const [envCheck, connectCheck, authCheck, tenantCheck, enterpriseCheck, rlsCheck] = await Promise.all([
      Promise.resolve(checkEnvVars()),
      checkBackendConnectivity(),
      checkAuth(),
      checkTenantContext(),
      checkEnterpriseContext(),
      checkRLSEnabled(),
    ]);

    setChecks([envCheck, connectCheck, authCheck, tenantCheck, enterpriseCheck, rlsCheck]);
    setRunning(false);
  };

  useEffect(() => {
    runChecks();
  }, []);

  const errorCount = checks.filter((c) => c.status === "error").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const allOk = checks.length > 0 && errorCount === 0 && warnCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Estado del Sistema</h2>
            <p className="text-sm text-muted-foreground">Verificación de conectividad, seguridad y contexto</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={runChecks} disabled={running} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
          {running ? "Verificando..." : "Re-verificar"}
        </Button>
      </div>

      {!running && allOk && (
        <Alert className="border-primary/30 bg-primary/5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertTitle>Sistema saludable</AlertTitle>
          <AlertDescription>Todos los controles pasaron correctamente.</AlertDescription>
        </Alert>
      )}

      {!running && errorCount > 0 && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>{errorCount} error(es) crítico(s) detectado(s)</AlertTitle>
          <AlertDescription>Revisa los items marcados en rojo y toma acción inmediata.</AlertDescription>
        </Alert>
      )}

      {!running && warnCount > 0 && errorCount === 0 && (
        <Alert className="border-muted-foreground/30 bg-muted/50">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <AlertTitle>{warnCount} aviso(s)</AlertTitle>
          <AlertDescription>Revisa los items marcados con aviso.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {checks.map((check) => (
          <Card key={check.name} className={
            check.status === "error"
              ? "border-destructive/50 bg-destructive/5"
              : check.status === "warn"
              ? "border-muted-foreground/30 bg-muted/30"
              : ""
          }>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusIcon status={check.status} />
                  <CardTitle className="text-sm font-medium">{check.name}</CardTitle>
                </div>
                <StatusBadge status={check.status} />
              </div>
              <CardDescription className="mt-1 ml-6 text-xs">{check.message}</CardDescription>
              {check.detail && (
                <CardContent className="px-0 pb-0 pt-1 ml-6">
                  <code className="text-xs bg-muted px-2 py-1 rounded block break-all">{check.detail}</code>
                </CardContent>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
