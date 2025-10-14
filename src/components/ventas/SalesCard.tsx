import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SaleEntry {
  id?: number;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  customer_nit: string;
  customer_name: string;
  total_amount: number;
  vat_amount: number;
  net_amount: number;
  journal_entry_id: number | null;
  isNew?: boolean;
}

interface SalesCardProps {
  sale: SaleEntry;
  index: number;
  felDocTypes: { code: string; name: string }[];
  onUpdate: (index: number, field: keyof SaleEntry, value: any) => void;
  onSave: (index: number) => void;
  onDelete: (index: number) => void;
}

export function SalesCard({ sale, index, felDocTypes, onUpdate, onSave, onDelete }: SalesCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Primera fila */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Serie</label>
              <Input
                value={sale.invoice_series}
                onChange={(e) => onUpdate(index, "invoice_series", e.target.value)}
                placeholder="A"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Número</label>
              <Input
                value={sale.invoice_number}
                onChange={(e) => onUpdate(index, "invoice_number", e.target.value)}
                placeholder="12345"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Fecha</label>
              <Input
                type="date"
                value={sale.invoice_date}
                onChange={(e) => onUpdate(index, "invoice_date", e.target.value)}
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Tipo Doc</label>
              <Select
                value={sale.fel_document_type}
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
                value={sale.customer_nit}
                onChange={(e) => onUpdate(index, "customer_nit", e.target.value)}
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

          {/* Segunda fila */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-6">
              <label className="text-xs text-muted-foreground">Cliente</label>
              <Input
                value={sale.customer_name}
                onChange={(e) => onUpdate(index, "customer_name", e.target.value)}
                placeholder="Nombre del cliente"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Total c/IVA</label>
              <Input
                type="number"
                step="0.01"
                value={sale.total_amount}
                onChange={(e) => onUpdate(index, "total_amount", e.target.value)}
                onBlur={() => onSave(index)}
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Neto</label>
              <Input
                type="number"
                step="0.01"
                value={sale.net_amount}
                readOnly
                className="h-8 bg-muted"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">IVA</label>
              <Input
                type="number"
                step="0.01"
                value={sale.vat_amount}
                readOnly
                className="h-8 bg-muted"
              />
            </div>
          </div>

          {sale.journal_entry_id && (
            <div className="pt-2 border-t">
              <Badge variant="secondary">Póliza generada</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
