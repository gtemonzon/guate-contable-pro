import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PurchaseEntry {
  id?: number;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
  base_amount: number;
  vat_amount: number;
  batch_reference: string;
  journal_entry_id: number | null;
  isNew?: boolean;
}

interface PurchaseCardProps {
  purchase: PurchaseEntry;
  index: number;
  felDocTypes: { code: string; name: string }[];
  onUpdate: (index: number, field: keyof PurchaseEntry, value: any) => void;
  onSave: (index: number) => void;
  onDelete: (index: number) => void;
}

export function PurchaseCard({ purchase, index, felDocTypes, onUpdate, onSave, onDelete }: PurchaseCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Primera fila: Info documento y proveedor */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Serie</label>
              <Input
                value={purchase.invoice_series}
                onChange={(e) => onUpdate(index, "invoice_series", e.target.value)}
                placeholder="A"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Número</label>
              <Input
                value={purchase.invoice_number}
                onChange={(e) => onUpdate(index, "invoice_number", e.target.value)}
                placeholder="12345"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Fecha</label>
              <Input
                type="date"
                value={purchase.invoice_date}
                onChange={(e) => onUpdate(index, "invoice_date", e.target.value)}
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Tipo Doc</label>
              <Select
                value={purchase.fel_document_type}
                onValueChange={(v) => onUpdate(index, "fel_document_type", v)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {felDocTypes.map((type) => (
                    <SelectItem key={type.code} value={type.code}>
                      {type.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">NIT</label>
              <Input
                value={purchase.supplier_nit}
                onChange={(e) => onUpdate(index, "supplier_nit", e.target.value)}
                placeholder="12345678"
                className="h-8"
              />
            </div>
            <div className="col-span-2 flex items-end gap-1">
              <Button size="sm" variant="outline" onClick={() => onSave(index)} className="h-8">
                <Save className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(index)} className="h-8">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Segunda fila: Proveedor, montos y referencia */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-4">
              <label className="text-xs text-muted-foreground">Proveedor</label>
              <Input
                value={purchase.supplier_name}
                onChange={(e) => onUpdate(index, "supplier_name", e.target.value)}
                placeholder="Nombre del proveedor"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Total c/IVA</label>
              <Input
                type="number"
                step="0.01"
                value={purchase.total_amount}
                onChange={(e) => onUpdate(index, "total_amount", e.target.value)}
                onBlur={() => onSave(index)}
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Base s/IVA</label>
              <Input
                type="number"
                step="0.01"
                value={purchase.base_amount}
                readOnly
                className="h-8 bg-muted"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">IVA</label>
              <Input
                type="number"
                step="0.01"
                value={purchase.vat_amount}
                readOnly
                className="h-8 bg-muted"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Ref. Pago</label>
              <Input
                value={purchase.batch_reference}
                onChange={(e) => onUpdate(index, "batch_reference", e.target.value)}
                placeholder="Cheque/Ref"
                className="h-8"
              />
            </div>
          </div>

          {purchase.journal_entry_id && (
            <div className="pt-2 border-t">
              <Badge variant="secondary">Póliza generada</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
