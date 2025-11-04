import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PeriodosContables = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Períodos Contables</h1>
          <p className="text-muted-foreground">
            Gestión de períodos contables por empresa
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gestión de Períodos Contables</CardTitle>
          <CardDescription>
            Los períodos contables ahora se gestionan desde la vista de Empresas.
            Ve a la vista de Empresas, edita una empresa y accede a la pestaña "Períodos Contables"
            para gestionar sus períodos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate('/empresas')}>
            <Building2 className="mr-2 h-4 w-4" />
            Ir a Empresas
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PeriodosContables;
