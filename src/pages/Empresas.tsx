import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Building2, Users, Calendar } from "lucide-react";
import { EnterpriseDialog } from "@/components/empresas/EnterpriseDialog";
import { EnterpriseCard } from "@/components/empresas/EnterpriseCard";
import type { Database } from "@/integrations/supabase/types";
import { getSafeErrorMessage } from "@/utils/errorMessages";

type Enterprise = Database['public']['Tables']['tab_enterprises']['Row'];

const Empresas = () => {
  const { toast } = useToast();
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEnterprise, setSelectedEnterprise] = useState<Enterprise | null>(null);

  const fetchEnterprises = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tab_enterprises')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEnterprises(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al cargar empresas",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnterprises();
  }, []);

  const handleEdit = (enterprise: Enterprise) => {
    setSelectedEnterprise(enterprise);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedEnterprise(null);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedEnterprise(null);
    fetchEnterprises();
  };

  // Auto-select first enterprise if none is selected
  useEffect(() => {
    const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!currentEnterpriseId && enterprises.length > 0) {
      const firstEnterprise = enterprises[0];
      localStorage.setItem("currentEnterpriseId", firstEnterprise.id.toString());
      toast({
        title: "Empresa seleccionada automáticamente",
        description: `${firstEnterprise.business_name} está ahora activa`,
      });
    }
  }, [enterprises, toast]);

  const filteredEnterprises = enterprises.filter((enterprise) =>
    enterprise.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    enterprise.nit.includes(searchQuery) ||
    (enterprise.trade_name && enterprise.trade_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empresas</h1>
          <p className="text-muted-foreground">
            Gestiona las empresas registradas en el sistema
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Empresa
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buscar Empresas</CardTitle>
          <CardDescription>
            Filtra por nombre, razón social o NIT
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar empresa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {filteredEnterprises.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No hay empresas registradas</p>
            <p className="text-sm text-muted-foreground mb-4">
              Comienza creando tu primera empresa
            </p>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Crear Primera Empresa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEnterprises.map((enterprise) => (
            <EnterpriseCard
              key={enterprise.id}
              enterprise={enterprise}
              onEdit={handleEdit}
              onDelete={fetchEnterprises}
            />
          ))}
        </div>
      )}

      <EnterpriseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        enterprise={selectedEnterprise}
        onSuccess={handleDialogClose}
      />
    </div>
  );
};

export default Empresas;
