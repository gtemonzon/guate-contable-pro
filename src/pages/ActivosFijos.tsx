import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "react-router-dom";
import AssetList from "@/components/activosFijos/AssetList";
import AssetConfigPage from "@/components/activosFijos/AssetConfigPage";
import DepreciationPostingPage from "@/components/activosFijos/DepreciationPostingPage";
import AssetReports from "@/components/activosFijos/AssetReports";
import { Package, Settings, TrendingDown, FileBarChart } from "lucide-react";

export default function ActivosFijos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "assets";

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Activos Fijos</h1>
        <p className="text-muted-foreground">
          Gestión de activos fijos, depreciación y disposición
        </p>
      </div>

      <Tabs
        defaultValue={defaultTab}
        onValueChange={(v) => setSearchParams({ tab: v })}
        className="w-full"
      >
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="assets" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Activos
          </TabsTrigger>
          <TabsTrigger value="depreciation" className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Contabilizar Depreciación
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileBarChart className="h-4 w-4" />
            Reportes
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configuración
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-6">
          <AssetList />
        </TabsContent>

        <TabsContent value="depreciation" className="mt-6">
          <DepreciationPostingPage />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <AssetReports />
        </TabsContent>

        <TabsContent value="config" className="mt-6">
          <AssetConfigPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
