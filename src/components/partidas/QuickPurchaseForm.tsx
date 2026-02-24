import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox, type Account } from "@/components/ui/account-combobox";
import { Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface QuickPurchaseFormProps {
  enterpriseId: number;
  journalEntryId: number;
  entryDate: string;
  entryMonth: number;
  entryYear: number;
  accounts: Account[];
  felDocTypes: Array<{ code: string; name: string }>;
  onCreated: () => void;
}

const VAT_RATE = 0.12;

export function QuickPurchaseForm({
  enterpriseId, journalEntryId, entryDate, entryMonth, entryYear,
  accounts, felDocTypes, onCreated,
}: QuickPurchaseFormProps) {
  const [date, setDate] = useState(entryDate);
  const [docType, setDocType] = useState("FACT");
  const [series, setSeries] = useState("");
  const [number, setNumber] = useState("");
  const [nit, setNit] = useState("");
  const [supplier, setSupplier] = useState("");
  const [total, setTotal] = useState<number>(0);
  const [expenseAccountId, setExpenseAccountId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const lookupNit = async () => {
    if (!nit.trim() || supplier.trim()) return;
    try {
      const { data } = await supabase
        .from("tab_purchase_ledger")
        .select("supplier_name")
        .eq("enterprise_id", enterpriseId)
        .eq("supplier_nit", nit.trim())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.supplier_name) setSupplier(data.supplier_name);
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    if (!nit.trim() || !number.trim() || total <= 0) {
      toast({ title: "Campos requeridos", description: "Complete NIT, número y monto", variant: "destructive" });
      return;
    }
    if (!expenseAccountId) {
      toast({ title: "Cuenta requerida", description: "Seleccione una cuenta de gasto", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const base = Number((total / (1 + VAT_RATE)).toFixed(2));
      const vat = Number((total - base).toFixed(2));

      // Resolve purchase_book_id
      let purchaseBookId: number | null = null;
      const { data: existingBook } = await supabase
        .from("tab_purchase_books").select("id")
        .eq("enterprise_id", enterpriseId)
        .eq("month", entryMonth).eq("year", entryYear)
        .maybeSingle();

      if (existingBook) {
        purchaseBookId = existingBook.id;
      } else {
        const { data: newBook } = await supabase
          .from("tab_purchase_books")
          .insert({ enterprise_id: enterpriseId, month: entryMonth, year: entryYear, created_by: user.id })
          .select("id").single();
        if (newBook) purchaseBookId = newBook.id;
      }

      const { data: purchase, error: pErr } = await supabase
        .from("tab_purchase_ledger")
        .insert({
          enterprise_id: enterpriseId,
          invoice_date: date,
          fel_document_type: docType,
          invoice_series: series || null,
          invoice_number: number,
          supplier_nit: nit,
          supplier_name: supplier || nit,
          total_amount: total,
          base_amount: base,
          net_amount: base,
          vat_amount: vat,
          expense_account_id: expenseAccountId,
          journal_entry_id: journalEntryId,
          purchase_book_id: purchaseBookId,
        })
        .select("id").single();

      if (pErr) throw pErr;

      await supabase
        .from("tab_purchase_journal_links" as any)
        .upsert({
          enterprise_id: enterpriseId,
          purchase_id: purchase.id,
          journal_entry_id: journalEntryId,
          link_source: 'FROM_JOURNAL_MODAL',
          linked_by: user.id,
          linked_at: new Date().toISOString(),
        }, { onConflict: "enterprise_id,purchase_id" });

      toast({ title: "Factura creada y vinculada", description: `${supplier || nit} - ${number}` });

      // Reset form fields for next invoice
      setNumber("");
      setNit("");
      setSupplier("");
      setTotal(0);
      setSeries("");

      onCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const effectiveDocTypes = felDocTypes.length > 0 ? felDocTypes : [
    { code: "FACT", name: "Factura" },
    { code: "FCAM", name: "Factura Cambiaria" },
    { code: "FPEQ", name: "Factura Pequeño C." },
    { code: "NCRE", name: "Nota de Crédito" },
    { code: "NDEB", name: "Nota de Débito" },
    { code: "RECE", name: "Recibo" },
  ];

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Fecha</label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Tipo Doc.</label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {effectiveDocTypes.map(dt => (
                <SelectItem key={dt.code} value={dt.code}>{dt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Serie</label>
          <Input value={series} onChange={e => setSeries(e.target.value)} className="h-8 text-xs mt-1" placeholder="Opc." />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Número</label>
          <Input value={number} onChange={e => setNumber(e.target.value)} className="h-8 text-xs mt-1" placeholder="No. factura" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">NIT</label>
          <Input value={nit} onChange={e => setNit(e.target.value)} onBlur={lookupNit} className="h-8 text-xs mt-1" placeholder="NIT proveedor" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Proveedor</label>
          <Input value={supplier} onChange={e => setSupplier(e.target.value)} className="h-8 text-xs mt-1" placeholder="Nombre" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Total Q</label>
        <Input
          type="number" step="0.01" min="0"
          value={total || ""}
          onChange={e => setTotal(Number(e.target.value) || 0)}
          className="h-8 text-xs font-mono mt-1"
          placeholder="0.00"
        />
        {total > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Base: {formatCurrency(Number((total / (1 + VAT_RATE)).toFixed(2)))} · IVA: {formatCurrency(Number((total - total / (1 + VAT_RATE)).toFixed(2)))}
          </p>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Cuenta Gasto</label>
        <div className="mt-1">
          <AccountCombobox
            accounts={accounts}
            value={expenseAccountId}
            onValueChange={setExpenseAccountId}
            placeholder="Seleccionar cuenta..."
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={loading} size="sm" className="w-full">
        <Plus className="h-4 w-4 mr-1" />
        Crear y Vincular
      </Button>
    </div>
  );
}
