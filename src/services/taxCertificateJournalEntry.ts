import { supabase } from "@/integrations/supabase/client";
import type { TaxCertificate } from "@/hooks/useTaxCertificates";

interface EnterpriseAccountsForCert {
  account_vat_retained_receivable_id: number | null;
  account_vat_retained_payable_id: number | null;
  account_vat_exemption_control_id: number | null;
  account_isr_retained_receivable_id: number | null;
  account_isr_retained_payable_id: number | null;
  customers_account_id: number | null;
  suppliers_account_id: number | null;
}

interface BuildResult {
  lines: { account_id: number; description: string; debit_amount: number; credit_amount: number }[];
  warnings: string[];
  skip?: boolean; // exenciones no requieren partida
  prefix: string;
}

function buildLines(cert: TaxCertificate, cfg: EnterpriseAccountsForCert): BuildResult {
  const warnings: string[] = [];
  const lines: BuildResult["lines"] = [];
  const amount = Number(cert.tax_amount);

  const req = (val: number | null, label: string): number | null => {
    if (!val) {
      warnings.push(`Configura cuenta: ${label}`);
      return null;
    }
    return val;
  };

  if (cert.document_type === "vat_exemption") {
    return { lines: [], warnings: [], skip: true, prefix: "EXEN" };
  }

  if (cert.document_type === "isr_retention") {
    if (cert.direction === "received") {
      // Cliente nos retuvo ISR
      const dr = req(cfg.account_isr_retained_receivable_id, "ISR Retenido por Cobrar");
      const cr = req(cfg.customers_account_id, "Clientes");
      if (dr) lines.push({ account_id: dr, description: `ISR retenido por ${cert.counterpart_name}`, debit_amount: amount, credit_amount: 0 });
      if (cr) lines.push({ account_id: cr, description: `Aplica a doc ${cert.document_number}`, debit_amount: 0, credit_amount: amount });
      return { lines, warnings, prefix: "RETI" };
    } else {
      // Emitimos retención a proveedor
      const dr = req(cfg.suppliers_account_id, "Proveedores");
      const cr = req(cfg.account_isr_retained_payable_id, "ISR Retenido por Pagar");
      if (dr) lines.push({ account_id: dr, description: `Retención ISR a ${cert.counterpart_name}`, debit_amount: amount, credit_amount: 0 });
      if (cr) lines.push({ account_id: cr, description: `Const. ${cert.document_number}`, debit_amount: 0, credit_amount: amount });
      return { lines, warnings, prefix: "RETI" };
    }
  }

  if (cert.document_type === "vat_retention") {
    if (cert.direction === "received") {
      const dr = req(cfg.account_vat_retained_receivable_id, "IVA Retenido por Cobrar");
      const cr = req(cfg.customers_account_id, "Clientes");
      if (dr) lines.push({ account_id: dr, description: `IVA retenido por ${cert.counterpart_name}`, debit_amount: amount, credit_amount: 0 });
      if (cr) lines.push({ account_id: cr, description: `Aplica a doc ${cert.document_number}`, debit_amount: 0, credit_amount: amount });
      return { lines, warnings, prefix: "RETV" };
    } else {
      const dr = req(cfg.suppliers_account_id, "Proveedores");
      const cr = req(cfg.account_vat_retained_payable_id, "IVA Retenido por Pagar");
      if (dr) lines.push({ account_id: dr, description: `Retención IVA a ${cert.counterpart_name}`, debit_amount: amount, credit_amount: 0 });
      if (cr) lines.push({ account_id: cr, description: `Const. ${cert.document_number}`, debit_amount: 0, credit_amount: amount });
      return { lines, warnings, prefix: "RETV" };
    }
  }

  return { lines: [], warnings: ["Tipo de documento no soportado"], prefix: "RETE" };
}

/**
 * Genera una partida contable (borrador) a partir de una constancia tributaria.
 * Marca la constancia como 'posted' y la vincula al journal_entry_id.
 * Las exenciones de IVA no requieren partida (se omite y se retorna { skipped: true }).
 */
export async function generateJournalEntryFromCertificate(
  certificateId: number,
): Promise<{ entryId?: number; skipped?: boolean; warnings?: string[] }> {
  // 1. Cargar constancia
  const { data: certData, error: certErr } = await supabase
    .from("tab_tax_certificates" as never)
    .select("*")
    .eq("id", certificateId)
    .maybeSingle();
  if (certErr) throw certErr;
  if (!certData) throw new Error("Constancia no encontrada");
  const cert = certData as unknown as TaxCertificate;

  if (cert.journal_entry_id) {
    return { entryId: cert.journal_entry_id };
  }

  // 2. Cargar configuración de cuentas
  const { data: cfg, error: cfgErr } = await supabase
    .from("tab_enterprise_config")
    .select(
      "account_vat_retained_receivable_id, account_vat_retained_payable_id, account_vat_exemption_control_id, account_isr_retained_receivable_id, account_isr_retained_payable_id, customers_account_id, suppliers_account_id",
    )
    .eq("enterprise_id", cert.enterprise_id)
    .maybeSingle();
  if (cfgErr) throw cfgErr;

  const accounts = (cfg ?? {}) as EnterpriseAccountsForCert;
  const { lines, warnings, skip, prefix } = buildLines(cert, accounts);

  if (skip) {
    return { skipped: true };
  }
  if (warnings.length > 0 || lines.length === 0) {
    throw new Error(warnings.join(" • ") || "No se pudieron construir las líneas de la partida");
  }

  // 3. Auth
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("No autenticado");

  // 4. Período contable que contiene la fecha de emisión
  const { data: periodRow } = await supabase
    .from("tab_accounting_periods")
    .select("id")
    .eq("enterprise_id", cert.enterprise_id)
    .lte("start_date", cert.issue_date)
    .gte("end_date", cert.issue_date)
    .maybeSingle();

  // 5. Reservar número
  const { data: numData, error: numErr } = await supabase.rpc("allocate_journal_entry_number", {
    p_enterprise_id: cert.enterprise_id,
    p_entry_type: "ajuste",
    p_entry_date: cert.issue_date,
  });
  if (numErr) throw numErr;

  const totalDebit = lines.reduce((s, l) => s + l.debit_amount, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit_amount, 0);

  // 6. Header
  const { data: header, error: hErr } = await supabase
    .from("tab_journal_entries")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      enterprise_id: cert.enterprise_id,
      entry_number: numData as string,
      entry_date: cert.issue_date,
      entry_type: "ajuste",
      accounting_period_id: periodRow?.id ?? null,
      description: `[${prefix}] Const. ${cert.document_number} - ${cert.counterpart_name}`,
      total_debit: totalDebit,
      total_credit: totalCredit,
      is_posted: false,
      status: "borrador",
      currency_code: "GTQ",
      exchange_rate: 1,
      created_by: u.user.id,
    } as any)
    .select("id")
    .single();
  if (hErr) throw hErr;

  // 7. Lines
  const lineRows = lines.map((l, i) => ({
    journal_entry_id: header.id,
    line_number: i + 1,
    account_id: l.account_id,
    description: l.description,
    debit_amount: l.debit_amount,
    credit_amount: l.credit_amount,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: lErr } = await supabase.from("tab_journal_entry_details").insert(lineRows as any);
  if (lErr) throw lErr;

  // 8. Vincular constancia y marcarla como posted
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  await sb
    .from("tab_tax_certificates")
    .update({ journal_entry_id: header.id, status: "posted" })
    .eq("id", certificateId);

  return { entryId: header.id as number };
}
