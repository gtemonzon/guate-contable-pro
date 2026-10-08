import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EnterpriseTaxForms } from "@/components/empresas/EnterpriseTaxForms";

const readActiveEnterpriseId = (): number | null => {
  const stored = localStorage.getItem("currentEnterpriseId");
  const id = stored ? parseInt(stored, 10) : NaN;
  return Number.isFinite(id) ? id : null;
};

/**
 * Configuración > Tributario > "Formularios de Impuestos": la misma pantalla que Editar
 * Empresa > Impuestos ("Formularios de declaración") para la empresa activa.
 */
export function EnterpriseTaxConfigManager() {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(readActiveEnterpriseId);

  // Cambio de empresa activa. "enterpriseChanged" también llega en eventos de sesión
  // sin cambio de empresa: solo se actualiza si el id cambió.
  useEffect(() => {
    const handler = () => {
      const next = readActiveEnterpriseId();
      setEnterpriseId((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("enterpriseChanged", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("enterpriseChanged", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  if (!enterpriseId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Selecciona una empresa activa para configurar los formularios de impuestos
        </CardContent>
      </Card>
    );
  }

  // key: al cambiar de empresa se monta de nuevo y recarga sus filas.
  return <EnterpriseTaxForms key={enterpriseId} enterpriseId={enterpriseId} />;
}
