import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Period } from "./useJournalEntryForm";

interface JournalEntryHeaderProps {
  headerRef: React.RefObject<HTMLDivElement>;
  nextEntryNumber: string;
  entryDate: string;
  setEntryDate: (v: string) => void;
  entryType: string;
  setEntryType: (v: string) => void;
  periodId: number | null;
  setPeriodId: (v: number) => void;
  periods: Period[];
  headerDescription: string;
  setHeaderDescription: (v: string) => void;
  propagateDescriptionToLines: () => void;
}

export function JournalEntryHeader({
  headerRef, nextEntryNumber, entryDate, setEntryDate, entryType, setEntryType,
  periodId, setPeriodId, periods, headerDescription, setHeaderDescription, propagateDescriptionToLines,
}: JournalEntryHeaderProps) {
  return (
    <div ref={headerRef} className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div>
        <Label>Número de Partida</Label>
        <Input value={nextEntryNumber} disabled />
      </div>

      <div>
        <Label htmlFor="entryDate">Fecha</Label>
        <Input id="entryDate" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </div>

      <div>
        <Label htmlFor="entryType">Tipo</Label>
        <Select value={entryType} onValueChange={setEntryType}>
          <SelectTrigger id="entryType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apertura">Apertura</SelectItem>
            <SelectItem value="diario">Diario</SelectItem>
            <SelectItem value="ajuste">Ajuste</SelectItem>
            <SelectItem value="cierre">Cierre</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="period">Período Contable</Label>
        <Select value={periodId?.toString() || ""} onValueChange={(v) => setPeriodId(parseInt(v))}>
          <SelectTrigger id="period">
            <SelectValue placeholder="Seleccionar período" />
          </SelectTrigger>
          <SelectContent>
            {periods.map((period) => {
              const start = new Date(period.start_date + 'T00:00:00');
              const end = new Date(period.end_date + 'T00:00:00');
              return (
                <SelectItem key={period.id} value={period.id.toString()}>
                  {period.year} ({start.toLocaleDateString('es-GT')} - {end.toLocaleDateString('es-GT')})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-2 md:col-span-4">
        <Label htmlFor="headerDesc">Descripción General</Label>
        <Textarea
          id="headerDesc"
          placeholder="Descripción de la partida..."
          value={headerDescription}
          onChange={(e) => setHeaderDescription(e.target.value)}
          onBlur={propagateDescriptionToLines}
          rows={2}
        />
      </div>
    </div>
  );
}
