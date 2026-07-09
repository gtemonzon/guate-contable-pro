import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { NitAutocomplete } from "@/components/ui/nit-autocomplete";
import { useNitLookup, upsertTaxpayerCache } from "@/hooks/useNitLookup";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import {
  useIsrCategories,
  useSaveCertificate,
  type TaxCertificate,
  type CertificateDirection,
  type CertificateDocumentType,
  type IsrRegime,
  type CertificateInput,
  REGIME_LABELS,
} from "@/hooks/useTaxCertificates";
import { validateNIT, sanitizeNIT } from "@/utils/nitValidation";
import { generateJournalEntryFromCertificate } from "@/services/taxCertificateJournalEntry";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificate: TaxCertificate | null;
}

const emptyForm = (): CertificateInput => ({
  enterprise_id: 0,
  period_id: null,
  direction: "received",
  document_type: "isr_retention",
  counterpart_nit: "",
  counterpart_name: "",
  document_number: "",
  authorization_number: null,
  series: null,
  issue_date: new Date().toISOString().slice(0, 10),
  base_amount: 0,
  vat_amount: 0,
  percentage: 0,
  tax_amount: 0,
  isr_regime: null,
  isr_category_id: null,
  purchase_ledger_id: null,
  sales_ledger_id: null,
  journal_entry_id: null,
  status: "draft",
  notes: null,
});

export function CertificateFormPanel({ open, onOpenChange, certificate }: Props) {
  const { toast } = useToast();
  const { selectedEnterpriseId } = useEnterprise();
  const { data: categories = [] } = useIsrCategories();
  const save = useSaveCertificate();
  const { lookupNit, isLooking } = useNitLookup();
  const nitInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CertificateInput>(emptyForm());
  const [generateJournal, setGenerateJournal] = useState(false);
  const [issuanceFlags, setIssuanceFlags] = useState({ isr: false, vat: false, exemption: false });

  useEffect(() => {
    if (certificate) {
      const { id, created_at, updated_at, created_by, tenant_id, ...rest } = certificate;
      setForm(rest as CertificateInput);
    } else {
      setForm({ ...emptyForm(), enterprise_id: selectedEnterpriseId ?? 0 });
    }
  }, [certificate, selectedEnterpriseId, open]);

  // Fetch enterprise issuance flags
  useEffect(() => {
    if (!selectedEnterpriseId || !open) return;
    (async () => {
      const { data } = await supabase
        .from("tab_enterprise_config" as never)
        .select("issues_isr_retention_certificates, issues_vat_retention_certificates, issues_vat_exemption_certificates")
        .eq("enterprise_id", selectedEnterpriseId)
        .maybeSingle();
      const d = data as { issues_isr_retention_certificates?: boolean; issues_vat_retention_certificates?: boolean; issues_vat_exemption_certificates?: boolean } | null;
      setIssuanceFlags({
        isr: !!d?.issues_isr_retention_certificates,
        vat: !!d?.issues_vat_retention_certificates,
        exemption: !!d?.issues_vat_exemption_certificates,
      });
    })();
  }, [selectedEnterpriseId, open]);

  const update = <K extends keyof CertificateInput>(key: K, value: CertificateInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canIssueSelected = () => {
    if (form.direction !== "issued") return true;
    if (form.document_type === "isr_retention") return issuanceFlags.isr;
    if (form.document_type === "vat_retention") return issuanceFlags.vat;
    if (form.document_type === "vat_exemption") return issuanceFlags.exemption;
    return true;
  };

  const handleCategoryChange = (id: string) => {
    const cat = categories.find((c) => c.id === Number(id));
    if (cat) {
      update("isr_category_id", cat.id);
      update("isr_regime", cat.regime);
      if (!certificate) {
        update("percentage", cat.default_percentage);
      }
    }
  };

  // Auto-compute tax amount when base or percentage change for retentions
  useEffect(() => {
    if (form.document_type === "vat_exemption") return;
    const tax = +(Number(form.base_amount) * (Number(form.percentage) / 100)).toFixed(2);
    setForm((f) => ({ ...f, tax_amount: tax }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.base_amount, form.percentage, form.document_type]);

  const handleSubmit = async () => {
    if (!selectedEnterpriseId) {
      toast({ title: "Selecciona una empresa", variant: "destructive" });
      return;
    }
    if (!form.counterpart_nit || !validateNIT(form.counterpart_nit)) {
      toast({ title: "NIT inválido", description: "Verifica el NIT de la contraparte", variant: "destructive" });
      return;
    }
    if (!form.counterpart_name || !form.document_number) {
      toast({ title: "Faltan datos", description: "Nombre y número de documento son obligatorios", variant: "destructive" });
      return;
    }
    if (!canIssueSelected()) {
      toast({
        title: "Emisión no habilitada",
        description: "Esta empresa no tiene habilitada la emisión de este tipo de constancia. Configúralo en Empresas → Impuestos.",
        variant: "destructive",
      });
      return;
    }

    try {
      const savedId = await save.mutateAsync({
        id: certificate?.id,
        data: { ...form, enterprise_id: selectedEnterpriseId },
      });

      if (generateJournal) {
        try {
          const result = await generateJournalEntryFromCertificate(savedId);
          if (result.skipped) {
            toast({
              title: "Constancia guardada",
              description: "Las exenciones de IVA no requieren partida contable.",
            });
          } else {
            toast({
              title: "Constancia guardada",
              description: `Partida contable creada como borrador (#${result.entryId}). Revísala antes de publicarla.`,
            });
          }
        } catch (je) {
          toast({
            title: "Constancia guardada, pero la partida falló",
            description: je instanceof Error ? je.message : String(je),
            variant: "destructive",
          });
        }
      } else {
        toast({ title: "Constancia guardada" });
      }
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const isExemption = form.document_type === "vat_exemption";
  const isIsr = form.document_type === "isr_retention";
  const readOnly = certificate?.status === "posted";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{certificate ? "Editar Constancia" : "Nueva Constancia"}</SheetTitle>
          <SheetDescription>
            Registra retenciones de ISR/IVA o exenciones de IVA, emitidas o recibidas.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Dirección</Label>
              <Select value={form.direction} onValueChange={(v) => update("direction", v as CertificateDirection)} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Recibida</SelectItem>
                  <SelectItem value="issued">Emitida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.document_type} onValueChange={(v) => update("document_type", v as CertificateDocumentType)} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="isr_retention">Retención ISR</SelectItem>
                  <SelectItem value="vat_retention">Retención IVA</SelectItem>
                  <SelectItem value="vat_exemption">Exención IVA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.direction === "issued" && !canIssueSelected() && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              Esta empresa no tiene habilitada la emisión de este tipo de constancia. Actívalo en Empresas → Impuestos → Perfiles Tributarios.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>NIT contraparte</Label>
              <div className="relative mt-1">
                <NitAutocomplete
                  ref={nitInputRef}
                  value={form.counterpart_nit}
                  onChange={(e) => update("counterpart_nit", sanitizeNIT(e.target.value))}
                  onBlur={async () => {
                    const cleaned = form.counterpart_nit.trim();
                    if (!cleaned || !validateNIT(cleaned)) return;
                    if (!form.counterpart_name.trim()) {
                      const result = await lookupNit(cleaned);
                      if (result?.found && result.name) {
                        update("counterpart_name", result.name);
                      }
                    }
                  }}
                  onSelectTaxpayer={(selectedNit, name) => {
                    update("counterpart_nit", sanitizeNIT(selectedNit));
                    update("counterpart_name", name);
                  }}
                  disabled={readOnly}
                  className={`pr-8 ${form.counterpart_nit && validateNIT(form.counterpart_nit) === false ? 'border-destructive focus-visible:ring-destructive' : form.counterpart_nit && validateNIT(form.counterpart_nit) === true ? 'border-green-500 focus-visible:ring-green-500' : ''}`}
                  placeholder="NIT contraparte"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                  {isLooking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : form.counterpart_nit && validateNIT(form.counterpart_nit) ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : form.counterpart_nit && !validateNIT(form.counterpart_nit) ? (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  ) : null}
                </div>
              </div>
            </div>
            <div>
              <Label>Nombre contraparte</Label>
              <Input value={form.counterpart_name} onChange={(e) => update("counterpart_name", e.target.value)} disabled={readOnly} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>No. Documento</Label>
              <Input value={form.document_number} onChange={(e) => update("document_number", e.target.value)} disabled={readOnly} />
            </div>
            <div>
              <Label>Serie</Label>
              <Input value={form.series ?? ""} onChange={(e) => update("series", e.target.value || null)} disabled={readOnly} />
            </div>
            <div>
              <Label>No. Autorización</Label>
              <Input value={form.authorization_number ?? ""} onChange={(e) => update("authorization_number", e.target.value || null)} disabled={readOnly} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha de emisión</Label>
              <Input type="date" value={form.issue_date} onChange={(e) => update("issue_date", e.target.value)} disabled={readOnly} />
            </div>
            <div>
              <Label>Monto Base (Q)</Label>
              <Input type="number" step="0.01" value={form.base_amount} onChange={(e) => update("base_amount", Number(e.target.value))} disabled={readOnly} />
            </div>
          </div>

          {!isExemption && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>IVA Base (Q)</Label>
                <Input type="number" step="0.01" value={form.vat_amount} onChange={(e) => update("vat_amount", Number(e.target.value))} disabled={readOnly} />
              </div>
              <div>
                <Label>% Retención</Label>
                <Input type="number" step="0.01" value={form.percentage} onChange={(e) => update("percentage", Number(e.target.value))} disabled={readOnly} />
              </div>
              <div>
                <Label>Monto Retenido (Q)</Label>
                <Input type="number" step="0.01" value={form.tax_amount} onChange={(e) => update("tax_amount", Number(e.target.value))} disabled={readOnly} />
              </div>
            </div>
          )}

          {isIsr && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Régimen ISR</Label>
                <Select value={form.isr_regime ?? ""} onValueChange={(v) => update("isr_regime", v as IsrRegime)} disabled={readOnly}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(REGIME_LABELS) as IsrRegime[]).map((r) => (
                      <SelectItem key={r} value={r}>{REGIME_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoría de Renta</Label>
                <Select value={form.isr_category_id ? String(form.isr_category_id) : ""} onValueChange={handleCategoryChange} disabled={readOnly}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter((c) => !form.isr_regime || c.regime === form.isr_regime)
                      .map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name} ({c.default_percentage}%)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div>
            <Label>Notas</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value || null)} disabled={readOnly} />
          </div>

          {!readOnly && (
            <div className="flex items-center gap-2 rounded-md border p-3">
              <Checkbox id="gen-journal" checked={generateJournal} onCheckedChange={(v) => setGenerateJournal(!!v)} />
              <Label htmlFor="gen-journal" className="text-sm cursor-pointer">
                Generar partida contable al guardar (se creará como borrador editable)
              </Label>
            </div>
          )}
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {!readOnly && (
            <Button onClick={handleSubmit} disabled={save.isPending}>
              {save.isPending ? "Guardando..." : "Guardar"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
