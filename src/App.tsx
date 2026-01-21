import { Toaster } from "@/components/ui/toaster"; // v2
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TenantProvider } from "@/contexts/TenantContext";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Usuarios from "./pages/Usuarios";
import Empresas from "./pages/Empresas";
import Cuentas from "./pages/Cuentas";
import PeriodosContables from "./pages/PeriodosContables";
import Partidas from "./pages/Partidas";
import LibrosFiscales from "./pages/LibrosFiscales";
import BalanceSaldos from "./pages/BalanceSaldos";
import SaldosMensuales from "./pages/SaldosMensuales";
import MayorGeneral from "./pages/MayorGeneral";
import ConciliacionBancaria from "./pages/ConciliacionBancaria";
import FormulariosImpuestos from "./pages/FormulariosImpuestos";
import GenerarDeclaracion from "./pages/GenerarDeclaracion";
import MainLayout from "./components/layout/MainLayout";
import NotFound from "./pages/NotFound";
import Reportes from "./pages/Reportes";
import Configuracion from "./pages/Configuracion";
import Ayuda from "./pages/Ayuda";
import Notificaciones from "./pages/Notificaciones";
import Propuesta from "./pages/Propuesta";
import Tenants from "./pages/Tenants";

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
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/propuesta" element={<Propuesta />} />
            
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/empresas" element={<Empresas />} />
              <Route path="/tenants" element={<Tenants />} />
              <Route path="/cuentas" element={<Cuentas />} />
              <Route path="/periodos" element={<PeriodosContables />} />
              <Route path="/partidas" element={<Partidas />} />
              <Route path="/libros-fiscales" element={<LibrosFiscales />} />
              <Route path="/conciliacion" element={<ConciliacionBancaria />} />
              <Route path="/formularios-impuestos" element={<FormulariosImpuestos />} />
              <Route path="/generar-declaracion" element={<GenerarDeclaracion />} />
              <Route path="/saldos" element={<BalanceSaldos />} />
              <Route path="/saldos-mensuales" element={<SaldosMensuales />} />
              <Route path="/mayor" element={<MayorGeneral />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/importar" element={<div>Importación (próximamente)</div>} />
              <Route path="/notificaciones" element={<Notificaciones />} />
              <Route path="/ayuda" element={<Ayuda />} />
            </Route>
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </TenantProvider>
  </QueryClientProvider>
);

export default App;
