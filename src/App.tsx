import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster"; // v2
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TenantProvider } from "@/contexts/TenantContext";
import Login from "./pages/Login";
import MainLayout from "./components/layout/MainLayout";

// Lazy load pages for code splitting
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Empresas = lazy(() => import("./pages/Empresas"));
const Cuentas = lazy(() => import("./pages/Cuentas"));
const PeriodosContables = lazy(() => import("./pages/PeriodosContables"));
const Partidas = lazy(() => import("./pages/Partidas"));
const LibrosFiscales = lazy(() => import("./pages/LibrosFiscales"));
const BalanceSaldos = lazy(() => import("./pages/BalanceSaldos"));
const SaldosMensuales = lazy(() => import("./pages/SaldosMensuales"));
const MayorGeneral = lazy(() => import("./pages/MayorGeneral"));
const ConciliacionBancaria = lazy(() => import("./pages/ConciliacionBancaria"));
const FormulariosImpuestos = lazy(() => import("./pages/FormulariosImpuestos"));
const GenerarDeclaracion = lazy(() => import("./pages/GenerarDeclaracion"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Reportes = lazy(() => import("./pages/Reportes"));
const Configuracion = lazy(() => import("./pages/Configuracion"));
const Ayuda = lazy(() => import("./pages/Ayuda"));
const Notificaciones = lazy(() => import("./pages/Notificaciones"));
const Propuesta = lazy(() => import("./pages/Propuesta"));
const Tenants = lazy(() => import("./pages/Tenants"));
const Bitacora = lazy(() => import("./pages/Bitacora"));
const ActivosFijos = lazy(() => import("./pages/ActivosFijos"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TenantProvider>
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
              <Route path="/saldos-mensuales" element={<Suspense fallback={<PageLoader />}><SaldosMensuales /></Suspense>} />
              <Route path="/mayor" element={<Suspense fallback={<PageLoader />}><MayorGeneral /></Suspense>} />
              <Route path="/reportes" element={<Suspense fallback={<PageLoader />}><Reportes /></Suspense>} />
              <Route path="/configuracion" element={<Suspense fallback={<PageLoader />}><Configuracion /></Suspense>} />
              <Route path="/bitacora" element={<Suspense fallback={<PageLoader />}><Bitacora /></Suspense>} />
              <Route path="/activos-fijos" element={<Suspense fallback={<PageLoader />}><ActivosFijos /></Suspense>} />
              <Route path="/importar" element={<div>Importación (próximamente)</div>} />
              <Route path="/notificaciones" element={<Suspense fallback={<PageLoader />}><Notificaciones /></Suspense>} />
              <Route path="/ayuda" element={<Suspense fallback={<PageLoader />}><Ayuda /></Suspense>} />
            </Route>
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </TenantProvider>
  </QueryClientProvider>
);

export default App;
