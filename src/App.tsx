import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Empresas from "./pages/Empresas";
import Cuentas from "./pages/Cuentas";
import PeriodosContables from "./pages/PeriodosContables";
import Partidas from "./pages/Partidas";
import LibroCompras from "./pages/LibroCompras";
import LibroVentas from "./pages/LibroVentas";
import BalanceSaldos from "./pages/BalanceSaldos";
import MayorGeneral from "./pages/MayorGeneral";
import ConciliacionBancaria from "./pages/ConciliacionBancaria";
import MainLayout from "./components/layout/MainLayout";
import NotFound from "./pages/NotFound";
import Reportes from "./pages/Reportes";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/empresas" element={<Empresas />} />
            <Route path="/cuentas" element={<Cuentas />} />
            <Route path="/periodos" element={<PeriodosContables />} />
            <Route path="/partidas" element={<Partidas />} />
            <Route path="/compras" element={<LibroCompras />} />
            <Route path="/ventas" element={<LibroVentas />} />
            <Route path="/conciliacion" element={<ConciliacionBancaria />} />
            <Route path="/saldos" element={<BalanceSaldos />} />
            <Route path="/mayor" element={<MayorGeneral />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/importar" element={<div>Importación (próximamente)</div>} />
          </Route>
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
