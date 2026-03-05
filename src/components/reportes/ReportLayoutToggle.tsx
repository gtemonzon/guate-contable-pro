import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export type ReportLayout = 'hierarchical' | 'columnar' | 'stepped';

interface ReportLayoutToggleProps {
  value: ReportLayout;
  onChange: (v: ReportLayout) => void;
}

export default function ReportLayoutToggle({ value, onChange }: ReportLayoutToggleProps) {
  return (
    <div>
      <Label className="mb-1.5 block">Diseño</Label>
      <Select value={value} onValueChange={(v) => onChange(v as ReportLayout)}>
        <SelectTrigger>
          <SelectValue placeholder="Seleccionar diseño" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="hierarchical">Jerárquico</SelectItem>
          <SelectItem value="columnar">Columnar</SelectItem>
          <SelectItem value="stepped">Escalonado</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
