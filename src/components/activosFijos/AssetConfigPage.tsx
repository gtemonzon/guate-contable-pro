import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import DepreciationPolicyForm from "./config/DepreciationPolicyForm";
import AssetCategoriesManager from "./config/AssetCategoriesManager";
import AssetLocationsManager from "./config/AssetLocationsManager";
import AssetCustodiansManager from "./config/AssetCustodiansManager";

export default function AssetConfigPage() {
  const { selectedEnterpriseId: enterpriseId } = useEnterprise();

  if (!enterpriseId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
        Selecciona una empresa para ver la configuración.
      </div>
    );
  }

  return (
    <Tabs defaultValue="policy" className="w-full">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="policy">Política de Depreciación</TabsTrigger>
        <TabsTrigger value="categories">Categorías</TabsTrigger>
        <TabsTrigger value="locations">Ubicaciones</TabsTrigger>
        <TabsTrigger value="custodians">Custodios</TabsTrigger>
      </TabsList>

      <TabsContent value="policy" className="mt-6">
        <DepreciationPolicyForm enterpriseId={enterpriseId} />
      </TabsContent>
      <TabsContent value="categories" className="mt-6">
        <AssetCategoriesManager enterpriseId={enterpriseId} />
      </TabsContent>
      <TabsContent value="locations" className="mt-6">
        <AssetLocationsManager enterpriseId={enterpriseId} />
      </TabsContent>
      <TabsContent value="custodians" className="mt-6">
        <AssetCustodiansManager enterpriseId={enterpriseId} />
      </TabsContent>
    </Tabs>
  );
}
