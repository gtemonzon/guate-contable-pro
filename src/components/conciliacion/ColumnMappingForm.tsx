import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ColumnMapping } from "@/utils/bankStatementParsing";

interface ColumnMappingFormProps {
  headers: string[];
  mapping: ColumnMapping;
  onMappingChange: (field: keyof ColumnMapping, value: number | null) => void;
}

const FIELD_CONFIG: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: 'fecha', label: 'Fecha', required: true },
  { key: 'descripcion', label: 'Descripción/Concepto', required: true },
  { key: 'referencia', label: 'Número de Documento', required: false },
  { key: 'debito', label: 'Débito/Cargo', required: true },
  { key: 'credito', label: 'Crédito/Abono', required: true },
  { key: 'saldo', label: 'Saldo', required: false },
];

export function ColumnMappingForm({ headers, mapping, onMappingChange }: ColumnMappingFormProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {FIELD_CONFIG.map(({ key, label, required }) => (
        <div key={key} className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor={`mapping-${key}`}>{label}</Label>
            {required ? (
              <Badge variant="destructive" className="text-[10px] px-1 py-0">
                Requerido
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                Opcional
              </Badge>
            )}
          </div>
          <Select
            value={mapping[key]?.toString() ?? 'none'}
            onValueChange={(value) => 
              onMappingChange(key, value === 'none' ? null : parseInt(value, 10))
            }
          >
            <SelectTrigger id={`mapping-${key}`} className="w-full">
              <SelectValue placeholder="Seleccionar columna" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">-- No mapear --</SelectItem>
              {headers.map((header, index) => (
                <SelectItem key={index} value={index.toString()}>
                  Columna {index + 1}: {header || `(vacía)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
