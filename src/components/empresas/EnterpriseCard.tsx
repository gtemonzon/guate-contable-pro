import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Edit, Mail, Phone, MapPin } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Enterprise = Database['public']['Tables']['tab_enterprises']['Row'];

interface EnterpriseCardProps {
  enterprise: Enterprise;
  onEdit: (enterprise: Enterprise) => void;
}

const TAX_REGIME_LABELS: Record<string, string> = {
  pequeño_contribuyente: "Pequeño Contribuyente",
  contribuyente_general: "Contribuyente General",
  profesional_liberal: "Profesional Liberal",
  exenta_ong: "Exenta ONG",
};

export function EnterpriseCard({ enterprise, onEdit }: EnterpriseCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{enterprise.business_name}</CardTitle>
              {enterprise.trade_name && (
                <p className="text-sm text-muted-foreground">{enterprise.trade_name}</p>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">NIT:</span>
            <span className="font-medium">{enterprise.nit}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Régimen:</span>
            <Badge variant="secondary" className="text-xs">
              {TAX_REGIME_LABELS[enterprise.tax_regime]}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Moneda:</span>
            <span className="font-medium">{enterprise.base_currency_code}</span>
          </div>
        </div>

        {(enterprise.email || enterprise.phone || enterprise.address) && (
          <div className="space-y-2 pt-2 border-t">
            {enterprise.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground truncate">{enterprise.email}</span>
              </div>
            )}
            {enterprise.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{enterprise.phone}</span>
              </div>
            )}
            {enterprise.address && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground truncate">{enterprise.address}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => onEdit(enterprise)}
          >
            <Edit className="mr-2 h-4 w-4" />
            Editar
          </Button>
        </div>

        <div className="flex items-center justify-center">
          <Badge variant={enterprise.is_active ? "default" : "secondary"}>
            {enterprise.is_active ? "Activa" : "Inactiva"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
