import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { ParsedBankRow, formatDateForDisplay, formatAmountForDisplay } from "@/utils/bankStatementParsing";

interface BankStatementPreviewTableProps {
  rows: ParsedBankRow[];
  onToggleRow: (rowNumber: number) => void;
  onToggleAll: (selected: boolean) => void;
  showCheckboxes?: boolean;
}

export function BankStatementPreviewTable({
  rows,
  onToggleRow,
  onToggleAll,
  showCheckboxes = true,
}: BankStatementPreviewTableProps) {
  const [errorsOpen, setErrorsOpen] = useState(true);
  
  const errorRows = rows.filter((r) => !r.isValid);
  const allSelected = rows.filter((r) => r.isValid).every((r) => r.selected);
  const someSelected = rows.some((r) => r.selected);

  return (
    <div className="space-y-4">
      {/* Tabla de datos */}
      <ScrollArea className="h-[350px] border rounded-lg">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              {showCheckboxes && (
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => onToggleAll(checked as boolean)}
                    aria-label="Seleccionar todos"
                  />
                </TableHead>
              )}
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead className="text-right">Débito</TableHead>
              <TableHead className="text-right">Crédito</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.rowNumber}
                className={!row.isValid ? "bg-destructive/10" : row.selected ? "bg-primary/5" : ""}
              >
                {showCheckboxes && (
                  <TableCell>
                    <Checkbox
                      checked={row.selected}
                      onCheckedChange={() => onToggleRow(row.rowNumber)}
                      disabled={!row.isValid}
                      aria-label={`Seleccionar fila ${row.rowNumber}`}
                    />
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.rowNumber}
                </TableCell>
                <TableCell>
                  {row.isValid ? (
                    <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700 border-green-300">
                      <CheckCircle2 className="h-3 w-3" />
                      Válido
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Error
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDateForDisplay(row.fecha)}
                </TableCell>
                <TableCell className="max-w-[250px]">
                  <TruncatedText text={row.descripcion || '-'} inline />
                </TableCell>
                <TableCell>{row.referencia || '-'}</TableCell>
                <TableCell className="text-right font-mono">
                  {row.debito > 0 ? formatAmountForDisplay(row.debito) : '-'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {row.credito > 0 ? formatAmountForDisplay(row.credito) : '-'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {row.saldo !== null ? formatAmountForDisplay(row.saldo) : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Sección de errores colapsable */}
      {errorRows.length > 0 && (
        <Collapsible open={errorsOpen} onOpenChange={setErrorsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between text-destructive hover:text-destructive">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {errorRows.length} fila(s) con errores
              </span>
              {errorsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 p-4 bg-destructive/5 rounded-lg border border-destructive/20">
              {errorRows.map((row) => (
                <div key={row.rowNumber} className="text-sm">
                  <span className="font-medium">Fila {row.rowNumber}:</span>{' '}
                  <span className="text-muted-foreground">{row.errors.join(', ')}</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
