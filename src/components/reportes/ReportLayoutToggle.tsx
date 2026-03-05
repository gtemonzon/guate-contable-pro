import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { List, Columns3 } from "lucide-react";
import { Label } from "@/components/ui/label";

export type ReportLayout = 'hierarchical' | 'columnar';

interface ReportLayoutToggleProps {
  value: ReportLayout;
  onChange: (v: ReportLayout) => void;
}

export default function ReportLayoutToggle({ value, onChange }: ReportLayoutToggleProps) {
  return (
    <div>
      <Label className="mb-1.5 block">Diseño</Label>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => { if (v) onChange(v as ReportLayout); }}
        className="border rounded-md"
      >
        <ToggleGroupItem value="hierarchical" aria-label="Jerárquico" className="gap-1.5 text-xs px-3">
          <List className="h-3.5 w-3.5" />
          Jerárquico
        </ToggleGroupItem>
        <ToggleGroupItem value="columnar" aria-label="Columnar" className="gap-1.5 text-xs px-3">
          <Columns3 className="h-3.5 w-3.5" />
          Columnar
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
