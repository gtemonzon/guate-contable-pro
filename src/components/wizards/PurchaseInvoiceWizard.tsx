import { useState } from "react";
import { useForm } from "react-hook-form";
import { NitAutocomplete } from "@/components/ui/nit-autocomplete";
import { validateNIT } from "@/utils/nitValidation";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  FileText,
  User,
  DollarSign,
  BookOpen,
  Save,
  Loader2,
} from "lucide-react";
import { ValidationAlert } from "@/components/ui/status-badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Schema ──────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  supplier_nit: z.string().min(1, "El NIT del proveedor es requerido"),
  supplier_name: z.string().min(2, "El nombre del proveedor es requerido"),
  invoice_number: z.string().min(1, "El número de factura es requerido"),
  invoice_date: z.string().min(1, "La fecha es requerida"),
  invoice_series: z.string().optional(),
  fel_document_type: z.string().default("FACT"),
});

const step2Schema = z.object({
  net_amount: z.number({ invalid_type_error: "Ingrese un monto válido" }).positive("El monto debe ser mayor a 0"),
  vat_amount: z.number({ invalid_type_error: "Ingrese un monto válido" }).min(0),
  total_amount: z.number({ invalid_type_error: "Ingrese un monto válido" }).positive(),
  purchase_type: z.string().min(1, "Seleccione el tipo de compra"),
});

const step3Schema = z.object({
  expense_account_id: z.number({ invalid_type_error: "Seleccione una cuenta" }).positive("Seleccione una cuenta de gasto"),
  notes: z.string().optional(),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;

// ── Wizard steps config ─────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Proveedor & Factura", icon: User, schema: step1Schema },
  { id: 2, label: "Montos & Tipo", icon: DollarSign, schema: step2Schema },
  { id: 3, label: "Cuenta Contable", icon: BookOpen, schema: step3Schema },
  { id: 4, label: "Confirmación", icon: CheckCircle2, schema: null },
];

const FEL_DOC_TYPES = [
  { code: "FACT", name: "Factura" },
  { code: "FCAM", name: "Factura Cambiaria" },
  { code: "FPEQ", name: "Factura Pequeño Contribuyente" },
  { code: "FESP", name: "Factura Especial" },
  { code: "NCRE", name: "Nota de Crédito" },
  { code: "NDEB", name: "Nota de Débito" },
  { code: "RECI", name: "Recibo" },
];

const PURCHASE_TYPES = [
  { value: "bienes", label: "Bienes" },
  { value: "servicios", label: "Servicios" },
  { value: "activo_fijo", label: "Activo Fijo" },
  { value: "importaciones", label: "Importaciones" },
];

// ── Props ───────────────────────────────────────────────────────────────────

interface PurchaseInvoiceWizardProps {
  open: boolean;
  onClose: () => void;
  enterpriseId: number;
  periodId?: number | null;
}

// ── Component ───────────────────────────────────────────────────────────────

export function PurchaseInvoiceWizard({
  open,
  onClose,
  enterpriseId,
  periodId,
}: PurchaseInvoiceWizardProps) {
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);
  const [step3Data, setStep3Data] = useState<Step3Data | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Accounts query ───────────────────────────────────────────────────────
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["expense-accounts", enterpriseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name")
        .eq("enterprise_id", enterpriseId)
        .in("account_type", ["gasto"])
        .eq("allows_movement", true)
        .eq("is_active", true)
        .order("account_code");
      return data ?? [];
    },
    enabled: !!enterpriseId,
  });

  // ── Forms per step ───────────────────────────────────────────────────────
  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3Data>({ resolver: zodResolver(step3Schema) });

  // ── Auto-calc VAT on net_amount change ───────────────────────────────────
  const watchedNet = form2.watch("net_amount");
  const autoVat = watchedNet ? Math.round(watchedNet * 0.12 * 100) / 100 : 0;
  const autoTotal = watchedNet ? Math.round((watchedNet + autoVat) * 100) / 100 : 0;

  const handleAutoCalc = () => {
    form2.setValue("vat_amount", autoVat);
    form2.setValue("total_amount", autoTotal);
  };

  // ── Navigation ───────────────────────────────────────────────────────────
  const goNext = async () => {
    if (currentStep === 1) {
      const valid = await form1.trigger();
      if (!valid) return;
      setStep1Data(form1.getValues());
    } else if (currentStep === 2) {
      const valid = await form2.trigger();
      if (!valid) return;
      setStep2Data(form2.getValues());
    } else if (currentStep === 3) {
      const valid = await form3.trigger();
      if (!valid) return;
      setStep3Data(form3.getValues());
    }
    setCurrentStep((s) => Math.min(s + 1, 4));
  };

  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (asDraft = false) => {
    if (!step1Data || !step2Data || !step3Data) return;
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("tab_purchase_ledger").insert({
        enterprise_id: enterpriseId,
        accounting_period_id: periodId ?? null,
        supplier_nit: step1Data.supplier_nit,
        supplier_name: step1Data.supplier_name,
        invoice_number: step1Data.invoice_number,
        invoice_date: step1Data.invoice_date,
        invoice_series: step1Data.invoice_series ?? null,
        fel_document_type: step1Data.fel_document_type,
        net_amount: step2Data.net_amount,
        vat_amount: step2Data.vat_amount,
        total_amount: step2Data.total_amount,
        purchase_type: step2Data.purchase_type,
        expense_account_id: step3Data.expense_account_id,
        base_amount: step2Data.net_amount,
      });

      if (error) throw error;

      toast({
        title: asDraft ? "Compra guardada como borrador" : "Compra registrada exitosamente",
        description: `Factura ${step1Data.invoice_number} de ${step1Data.supplier_name} — Q ${step2Data.total_amount.toFixed(2)}`,
      });
      onClose();
      resetWizard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({ title: "Error al guardar", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetWizard = () => {
    setCurrentStep(1);
    setStep1Data(null);
    setStep2Data(null);
    setStep3Data(null);
    form1.reset();
    form2.reset();
    form3.reset();
  };

  // ── Ledger preview ───────────────────────────────────────────────────────
  const previewLines = () => {
    const net = step2Data?.net_amount ?? form2.watch("net_amount") ?? 0;
    const vat = step2Data?.vat_amount ?? form2.watch("vat_amount") ?? 0;
    const total = net + vat;
    const accountName = step3Data?.expense_account_id
      ? (accounts.find((a) => a.id === step3Data.expense_account_id)?.account_name ?? "Cuenta gasto")
      : "Cuenta gasto";

    if (total === 0) return null;

    return [
      { account: accountName, debit: net, credit: 0 },
      { account: "IVA Crédito Fiscal", debit: vat, credit: 0 },
      { account: "Cuentas por Pagar / Banco", debit: 0, credit: total },
    ];
  };

  const lines = previewLines();

  const progressPct = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Registrar Factura de Compra
          </DialogTitle>
        </DialogHeader>

        {/* Step progress */}
        <div className="space-y-2 px-1">
          <Progress value={progressPct} className="h-1.5" />
          <div className="flex justify-between">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isDone = currentStep > step.id;
              return (
                <div key={step.id} className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      "rounded-full p-1.5 transition-colors",
                      isDone
                        ? "bg-success text-success-foreground"
                        : isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span
                    className={cn(
                      "text-[10px] hidden sm:block",
                      isActive ? "text-primary font-semibold" : "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main body — form + preview side-by-side */}
        <div className="flex gap-4 flex-1 overflow-hidden">
          {/* Form panel */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {/* STEP 1 */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Proveedor e Información de Factura
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">NIT del Proveedor *</Label>
                    <NitAutocomplete
                      {...form1.register("supplier_nit")}
                      value={form1.watch("supplier_nit") || ""}
                      placeholder="CF o número de NIT"
                      className="h-9"
                      onSelectTaxpayer={(nit, name) => {
                        form1.setValue("supplier_nit", nit);
                        form1.setValue("supplier_name", name);
                      }}
                    />
                    {form1.formState.errors.supplier_nit && (
                      <ValidationAlert type="error" message={form1.formState.errors.supplier_nit.message!} />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Nombre del Proveedor *</Label>
                    <Input {...form1.register("supplier_name")} placeholder="Razón social" className="h-9" />
                    {form1.formState.errors.supplier_name && (
                      <ValidationAlert type="error" message={form1.formState.errors.supplier_name.message!} />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Serie</Label>
                    <Input {...form1.register("invoice_series")} placeholder="A" className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Número de Factura *</Label>
                    <Input {...form1.register("invoice_number")} placeholder="00001" className="h-9" />
                    {form1.formState.errors.invoice_number && (
                      <ValidationAlert type="error" message={form1.formState.errors.invoice_number.message!} />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha de Factura *</Label>
                    <Input type="date" {...form1.register("invoice_date")} className="h-9" />
                    {form1.formState.errors.invoice_date && (
                      <ValidationAlert type="error" message={form1.formState.errors.invoice_date.message!} />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de Documento</Label>
                    <Select
                      defaultValue="FACT"
                      onValueChange={(v) => form1.setValue("fel_document_type", v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FEL_DOC_TYPES.map((d) => (
                          <SelectItem key={d.code} value={d.code}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Montos y Tipo de Compra
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Monto Neto (sin IVA) *</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        {...form2.register("net_amount", { valueAsNumber: true })}
                        placeholder="0.00"
                        className="h-9"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAutoCalc}
                        className="h-9 whitespace-nowrap text-xs"
                      >
                        Auto-calcular IVA 12%
                      </Button>
                    </div>
                    {form2.formState.errors.net_amount && (
                      <ValidationAlert type="error" message={form2.formState.errors.net_amount.message!} />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">IVA *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      {...form2.register("vat_amount", { valueAsNumber: true })}
                      placeholder="0.00"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Total *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      {...form2.register("total_amount", { valueAsNumber: true })}
                      placeholder="0.00"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Tipo de Compra *</Label>
                    <Select onValueChange={(v) => form2.setValue("purchase_type", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Seleccionar tipo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {PURCHASE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form2.formState.errors.purchase_type && (
                      <ValidationAlert type="error" message={form2.formState.errors.purchase_type.message!} />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Clasificación Contable
                </h3>
                <div className="space-y-1">
                  <Label className="text-xs">Cuenta de Gasto *</Label>
                  {accountsLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select
                      onValueChange={(v) => form3.setValue("expense_account_id", parseInt(v))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Seleccionar cuenta..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id.toString()}>
                            <span className="font-mono text-xs mr-2 text-muted-foreground">
                              {a.account_code}
                            </span>
                            {a.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {form3.formState.errors.expense_account_id && (
                    <ValidationAlert
                      type="error"
                      message={form3.formState.errors.expense_account_id.message!}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notas (opcional)</Label>
                  <Input {...form3.register("notes")} placeholder="Notas adicionales..." className="h-9" />
                </div>
              </div>
            )}

            {/* STEP 4 — Confirmation */}
            {currentStep === 4 && step1Data && step2Data && step3Data && (
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Resumen para confirmar
                </h3>
                <div className="rounded-lg border divide-y text-sm">
                  {[
                    ["NIT Proveedor", step1Data.supplier_nit],
                    ["Proveedor", step1Data.supplier_name],
                    ["Factura", `${step1Data.invoice_series ?? ""} ${step1Data.invoice_number}`],
                    ["Fecha", step1Data.invoice_date],
                    ["Tipo Documento", step1Data.fel_document_type],
                    ["Monto Neto", `Q ${step2Data.net_amount.toFixed(2)}`],
                    ["IVA", `Q ${step2Data.vat_amount.toFixed(2)}`],
                    ["Total", `Q ${step2Data.total_amount.toFixed(2)}`],
                    ["Tipo Compra", step2Data.purchase_type],
                    ["Cuenta Gasto", accounts.find((a) => a.id === step3Data.expense_account_id)?.account_name ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Ledger preview side panel */}
          {currentStep >= 2 && (
            <div className="w-56 shrink-0 rounded-lg border bg-muted/30 p-3 hidden md:block">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Vista del asiento
              </p>
              {lines ? (
                <div className="space-y-2">
                  {lines.map((line, i) => (
                    <div key={i} className="text-xs">
                      <p className="font-medium truncate text-foreground">{line.account}</p>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-muted-foreground">
                          {line.debit > 0 ? `D: Q ${line.debit.toFixed(2)}` : ""}
                        </span>
                        <span className="text-muted-foreground">
                          {line.credit > 0 ? `C: Q ${line.credit.toFixed(2)}` : ""}
                        </span>
                      </div>
                      {i < lines.length - 1 && <Separator className="mt-2" />}
                    </div>
                  ))}
                  <Separator />
                  <div className="flex justify-between text-xs font-bold text-success">
                    <span>Balanceado ✓</span>
                    <span>Q {(lines[0].debit + lines[1].debit).toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Ingresa los montos para ver el asiento
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between pt-4 border-t mt-2">
          <div className="flex gap-2">
            {currentStep > 1 && (
              <Button variant="outline" size="sm" onClick={goBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Atrás
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSubmit(true)}
              disabled={isSubmitting || currentStep < 4}
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              Guardar borrador
            </Button>
            {currentStep < 4 ? (
              <Button size="sm" onClick={goNext} className="gap-1.5">
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSubmitting ? "Registrando..." : "Registrar Compra"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
