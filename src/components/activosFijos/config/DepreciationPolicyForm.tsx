import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAssetPolicy, useUpsertAssetPolicy, type FixedAssetPolicy } from "@/hooks/useFixedAssets";
import { Loader2, Save } from "lucide-react";

export default function DepreciationPolicyForm({ enterpriseId }: { enterpriseId: number }) {
  const { data: policy, isLoading } = useAssetPolicy(enterpriseId);
  const upsert = useUpsertAssetPolicy();

  const form = useForm<FixedAssetPolicy>({
    defaultValues: {
      enterprise_id: enterpriseId,
      accounting_standard_mode: "FISCAL",
      depreciation_method: "STRAIGHT_LINE",
      depreciation_start_rule: "IN_SERVICE_DATE",
      posting_frequency: "MONTHLY",
      rounding_decimals: 2,
      allow_mid_month_disposal_proration: false,
    },
  });

  useEffect(() => {
    if (policy) form.reset({ ...policy, enterprise_id: enterpriseId });
  }, [policy]);

  const onSubmit = (values: FixedAssetPolicy) => {
    upsert.mutate({ ...values, enterprise_id: enterpriseId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando política...
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Política de Depreciación</CardTitle>
        <CardDescription>
          Configuración global para el cálculo y contabilización de la depreciación.
          Estos valores aplican a todos los activos de esta empresa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="accounting_standard_mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Norma contable</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="FISCAL">FISCAL (SAT Guatemala)</SelectItem>
                        <SelectItem value="IFRS_POLICY">NIIF / IFRS (política)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>FISCAL es la norma predeterminada para Guatemala.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="depreciation_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de depreciación</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="STRAIGHT_LINE">Línea recta</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="depreciation_start_rule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inicio de depreciación</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="IN_SERVICE_DATE">Fecha de puesta en servicio</SelectItem>
                        <SelectItem value="ACQUISITION_DATE">Fecha de adquisición</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>Si la fecha de servicio es nula, se usa la fecha de adquisición.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="posting_frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frecuencia de contabilización</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MONTHLY">Mensual</SelectItem>
                        <SelectItem value="QUARTERLY">Trimestral</SelectItem>
                        <SelectItem value="SEMIANNUAL">Semestral</SelectItem>
                        <SelectItem value="ANNUAL">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      El NBV se calcula mensualmente. La contabilización agrupa según esta frecuencia.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="allow_mid_month_disposal_proration"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 rounded-lg border border-border p-4">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div>
                    <FormLabel className="cursor-pointer">Prorratear disposición a mitad de mes</FormLabel>
                    <FormDescription>
                      Si está desactivado, se usa la convención de mes completo (predeterminado fiscal).
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar política
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
