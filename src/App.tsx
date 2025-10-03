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
import MainLayout from "./components/layout/MainLayout";
import NotFound from "./pages/NotFound";

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
            <Route path="/periodos" element={<div>Períodos Contables (próximamente)</div>} />
            <Route path="/partidas" element={<div>Partidas (próximamente)</div>} />
            <Route path="/compras" element={<div>Libro de Compras (próximamente)</div>} />
            <Route path="/ventas" element={<div>Libro de Ventas (próximamente)</div>} />
            <Route path="/conciliacion" element={<div>Conciliación Bancaria (próximamente)</div>} />
            <Route path="/saldos" element={<div>Saldos de Cuentas (próximamente)</div>} />
            <Route path="/mayor" element={<div>Mayor General (próximamente)</div>} />
            <Route path="/reportes" element={<div>Reportes (próximamente)</div>} />
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
