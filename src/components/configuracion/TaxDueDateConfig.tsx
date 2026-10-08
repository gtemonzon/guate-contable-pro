import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { EnterpriseDueDateConfig } from '@/components/empresas/EnterpriseDueDateConfig';

const readActiveEnterpriseId = (): number | null => {
  const stored = localStorage.getItem('currentEnterpriseId');
  const id = stored ? parseInt(stored, 10) : NaN;
  return Number.isFinite(id) ? id : null;
};

/**
 * Configuración > Tributario > "Fechas de Vencimiento": la misma pantalla que Editar
 * Empresa > Impuestos ("Vencimientos y alertas") para la empresa activa.
 */
export function TaxDueDateConfig() {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(readActiveEnterpriseId);

  // Cambio de empresa activa. "enterpriseChanged" también llega en eventos de sesión
  // sin cambio de empresa: solo se actualiza si el id cambió.
  useEffect(() => {
    const handler = () => {
      const next = readActiveEnterpriseId();
      setEnterpriseId((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('enterpriseChanged', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('enterpriseChanged', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  if (!enterpriseId) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Selecciona una empresa para configurar las fechas de vencimiento.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* key: al cambiar de empresa se monta de nuevo y recarga sus filas. */}
      <EnterpriseDueDateConfig key={enterpriseId} enterpriseId={enterpriseId} />

      <div className="p-4 bg-muted rounded-lg space-y-2">
        <p className="text-sm font-medium">Guía de configuración:</p>
        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
          <li><strong>IVA:</strong> vence el último día hábil del mes</li>
          <li><strong>ISR Trimestral e ISO:</strong> vencen el último día hábil del mes siguiente al trimestre</li>
          <li><strong>Retenciones ISR/IVA:</strong> 10 días hábiles del mes siguiente</li>
          <li><strong>Día fijo:</strong> para impuestos con fecha específica</li>
        </ul>
      </div>
    </div>
  );
}
