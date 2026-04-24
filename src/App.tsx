import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster"; // v2
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TenantProvider } from "@/contexts/TenantContext";
import { EnterpriseProvider } from "@/contexts/EnterpriseContext";
import Login from "./pages/Login";
import MainLayout from "./components/layout/MainLayout";
import { isNetworkError } from "@/utils/networkErrors";

// Retry wrapper for dynamic imports (handles transient network failures)
function lazyRetry(factory: () => Promise<{ default: React.ComponentType<any> }>, retries = 2) {
  return lazy(() => {
    const attempt = (remaining: number): Promise<{ default: React.ComponentType<any> }> =>
      factory().catch((err) => {
        if (remaining > 0) {
          return new Promise<{ default: React.ComponentType<any> }>((resolve) =>
            setTimeout(() => resolve(attempt(remaining - 1)), 1000)
          );
        }
        // After retries exhausted, reload to get fresh asset URLs
        window.location.reload();
        return factory(); // won't resolve, page reloads
      });
    return attempt(retries);
  });
}

// Lazy load pages for code splitting (with retry)
const ResetPassword = lazyRetry(() => import("./pages/ResetPassword"));
const Dashboard = lazyRetry(() => import("./pages/Dashboard"));
const Usuarios = lazyRetry(() => import("./pages/Usuarios"));
const Empresas = lazyRetry(() => import("./pages/Empresas"));
const Cuentas = lazyRetry(() => import("./pages/Cuentas"));
const PeriodosContables = lazyRetry(() => import("./pages/PeriodosContables"));
const Partidas = lazyRetry(() => import("./pages/Partidas"));
const LibrosFiscales = lazyRetry(() => import("./pages/LibrosFiscales"));
const BalanceSaldos = lazyRetry(() => import("./pages/BalanceSaldos"));
const SaldosMensuales = lazyRetry(() => import("./pages/SaldosMensuales"));
const MayorGeneral = lazyRetry(() => import("./pages/MayorGeneral"));
const ConciliacionBancaria = lazyRetry(() => import("./pages/ConciliacionBancaria"));
const FormulariosImpuestos = lazyRetry(() => import("./pages/FormulariosImpuestos"));
const GenerarDeclaracion = lazyRetry(() => import("./pages/GenerarDeclaracion"));
const NotFound = lazyRetry(() => import("./pages/NotFound"));
const Reportes = lazyRetry(() => import("./pages/Reportes"));
const Configuracion = lazyRetry(() => import("./pages/Configuracion"));
const Ayuda = lazyRetry(() => import("./pages/Ayuda"));
const Notificaciones = lazyRetry(() => import("./pages/Notificaciones"));
const Propuesta = lazyRetry(() => import("./pages/Propuesta"));
const Tenants = lazyRetry(() => import("./pages/Tenants"));
const Bitacora = lazyRetry(() => import("./pages/Bitacora"));
const ActivosFijos = lazyRetry(() => import("./pages/ActivosFijos"));
const Inbox = lazyRetry(() => import("./pages/Inbox"));
const Soporte = lazyRetry(() => import("./pages/Soporte"));
const Capacitacion = lazyRetry(() => import("./pages/Capacitacion"));
const Nomina = lazyRetry(() => import("./pages/Nomina"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        return isNetworkError(error);
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    },
    mutations: {
      retry: (failureCount, error) => failureCount < 2 && isNetworkError(error),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TenantProvider>
      <EnterpriseProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
            <Route path="/propuesta" element={<Suspense fallback={<PageLoader />}><Propuesta /></Suspense>} />
            
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
              <Route path="/usuarios" element={<Suspense fallback={<PageLoader />}><Usuarios /></Suspense>} />
              <Route path="/empresas" element={<Suspense fallback={<PageLoader />}><Empresas /></Suspense>} />
              <Route path="/tenants" element={<Suspense fallback={<PageLoader />}><Tenants /></Suspense>} />
              <Route path="/cuentas" element={<Suspense fallback={<PageLoader />}><Cuentas /></Suspense>} />
              <Route path="/periodos" element={<Suspense fallback={<PageLoader />}><PeriodosContables /></Suspense>} />
              <Route path="/partidas" element={<Suspense fallback={<PageLoader />}><Partidas /></Suspense>} />
              <Route path="/libros-fiscales" element={<Suspense fallback={<PageLoader />}><LibrosFiscales /></Suspense>} />
              <Route path="/conciliacion" element={<Suspense fallback={<PageLoader />}><ConciliacionBancaria /></Suspense>} />
              <Route path="/formularios-impuestos" element={<Suspense fallback={<PageLoader />}><FormulariosImpuestos /></Suspense>} />
              <Route path="/generar-declaracion" element={<Suspense fallback={<PageLoader />}><GenerarDeclaracion /></Suspense>} />
              <Route path="/saldos" element={<Suspense fallback={<PageLoader />}><BalanceSaldos /></Suspense>} />
              <Route path="/saldos-mensuales" element={<Navigate to="/saldos?tab=mensual" replace />} />
              <Route path="/mayor" element={<Suspense fallback={<PageLoader />}><MayorGeneral /></Suspense>} />
              <Route path="/reportes" element={<Suspense fallback={<PageLoader />}><Reportes /></Suspense>} />
              <Route path="/configuracion" element={<Suspense fallback={<PageLoader />}><Configuracion /></Suspense>} />
              <Route path="/bitacora" element={<Suspense fallback={<PageLoader />}><Bitacora /></Suspense>} />
              <Route path="/activos-fijos" element={<Suspense fallback={<PageLoader />}><ActivosFijos /></Suspense>} />
              <Route path="/inbox" element={<Suspense fallback={<PageLoader />}><Inbox /></Suspense>} />
              <Route path="/soporte" element={<Suspense fallback={<PageLoader />}><Soporte /></Suspense>} />
              <Route path="/importar" element={<div>Importación (próximamente)</div>} />
              <Route path="/notificaciones" element={<Suspense fallback={<PageLoader />}><Notificaciones /></Suspense>} />
              <Route path="/capacitacion" element={<Suspense fallback={<PageLoader />}><Capacitacion /></Suspense>} />
              <Route path="/nomina" element={<Suspense fallback={<PageLoader />}><Nomina /></Suspense>} />
              <Route path="/ayuda" element={<Suspense fallback={<PageLoader />}><Ayuda /></Suspense>} />
            </Route>
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </EnterpriseProvider>
    </TenantProvider>
  </QueryClientProvider>
);

export default App;
