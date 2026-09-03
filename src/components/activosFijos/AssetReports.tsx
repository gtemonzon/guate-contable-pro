import { useEnterprise } from "@/contexts/EnterpriseContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, ArrowRightLeft, BookOpen, LayoutGrid } from "lucide-react";
import AssetsAsOfReport from "./reports/AssetsAsOfReport";
import AdditionsDisposalsReport from "./reports/AdditionsDisposalsReport";
import AssetLedgerReport from "./reports/AssetLedgerReport";
import AssetKardexReport from "./reports/AssetKardexReport";

export default function AssetReports() {
  const { selectedEnterprise, selectedEnterpriseId: enterpriseId } = useEnterprise();

  if (!enterpriseId || !selectedEnterprise) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
        Selecciona una empresa para ver reportes.
      </div>
    );
  }

  const commonProps = {
    enterpriseId,
    enterpriseName: selectedEnterprise.business_name,
    enterpriseNit: selectedEnterprise.nit,
  };

  return (
    <Tabs defaultValue="as-of" className="w-full">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="as-of" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Activos a la Fecha
        </TabsTrigger>
        <TabsTrigger value="additions-disposals" className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4" />
          Altas y Bajas
        </TabsTrigger>
        <TabsTrigger value="ledger" className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Mayor de Activos
        </TabsTrigger>
        <TabsTrigger value="kardex" className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4" />
          Kardex
        </TabsTrigger>
      </TabsList>

      <TabsContent value="as-of" className="mt-6">
        <AssetsAsOfReport {...commonProps} />
      </TabsContent>

      <TabsContent value="additions-disposals" className="mt-6">
        <AdditionsDisposalsReport {...commonProps} />
      </TabsContent>

      <TabsContent value="ledger" className="mt-6">
        <AssetLedgerReport {...commonProps} />
      </TabsContent>

      <TabsContent value="kardex" className="mt-6">
        <AssetKardexReport {...commonProps} />
      </TabsContent>
    </Tabs>
  );
}
