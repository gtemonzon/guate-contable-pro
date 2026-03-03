import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, Check, ChevronsUpDown, BarChart2, Landmark, FileText } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { Account, DetailLine } from "./useJournalEntryForm";

interface JournalEntryLinesTableProps {
  detailLines: DetailLine[];
  accounts: Account[];
  activeLineId: string | null;
  setActiveLineId: (id: string) => void;
  accountSearch: Record<string, string>;
  setAccountSearch: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  accountPopoverOpen: Record<string, boolean>;
  setAccountPopoverOpen: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  isReadOnly: boolean;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  onAddLine: () => void;
  onRemoveLine: (id: string) => void;
  onUpdateLine: (id: string, field: keyof DetailLine, value: any) => void;
  onOpenBalanceInspector: () => void;
  entryDate: string;
}

export function JournalEntryLinesTable({
  detailLines, accounts, activeLineId, setActiveLineId, accountSearch, setAccountSearch,
  accountPopoverOpen, setAccountPopoverOpen, isReadOnly, totalDebit, totalCredit, isBalanced,
  onAddLine, onRemoveLine, onUpdateLine, onOpenBalanceInspector, entryDate,
}: JournalEntryLinesTableProps) {
  const activeLine = activeLineId ? detailLines.find(l => l.id === activeLineId) : null;
  const activeLineHasAccount = !!activeLine?.account_id;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Líneas de Detalle</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="sm"
                className="h-7 px-2 gap-1 text-xs text-muted-foreground"
                disabled={!activeLineHasAccount}
                onClick={onOpenBalanceInspector}
              >
                <BarChart2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Inspector</span>
                <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-muted rounded border text-muted-foreground font-mono">F2</kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Ver saldo e historial de la cuenta activa</p>
              <p className="text-xs text-muted-foreground">F2 · Alt+B</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex gap-2">
          <Button onClick={onAddLine} variant="outline" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Agregar Línea
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[25%]">Cuenta</TableHead>
              <TableHead className="w-[35%]">Descripción</TableHead>
              <TableHead className="w-[12%]">Centro Costo</TableHead>
              <TableHead className="w-[12%] text-right">Debe</TableHead>
              <TableHead className="w-[12%] text-right">Haber</TableHead>
              <TableHead className="w-[4%]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detailLines.map((line) => {
              const account = accounts.find(a => a.id === line.account_id);
              const isActive = activeLineId === line.id;
              const isBankLine = line.is_bank_line === true;

              return (
                <TableRow
                  key={line.id}
                  className={cn(
                    "cursor-pointer transition-colors",
                    isBankLine && "bg-primary/5 border-l-4 border-l-primary/40",
                    !isBankLine && isActive && "bg-primary/5 border-l-4 border-l-primary",
                    !isBankLine && !isActive && "hover:bg-[hsl(var(--table-row-hover))] border-l-4 border-l-transparent",
                  )}
                  onClick={() => setActiveLineId(line.id)}
                >
                  <TableCell className="py-1">
                    {isBankLine ? (
                      <div className="flex items-center gap-2 px-1">
                        <Landmark className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm truncate max-w-[200px]" title={account ? `${account.account_code} - ${account.account_name}` : ''}>
                          {account ? `${account.account_code} - ${account.account_name}` : "—"}
                        </span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Banco (auto)</Badge>
                      </div>
                    ) : isActive ? (
                      <Popover
                        open={accountPopoverOpen[line.id] || false}
                        onOpenChange={(open) => {
                          setAccountPopoverOpen(prev => ({ ...prev, [line.id]: open }));
                          if (!open) setAccountSearch(prev => ({ ...prev, [line.id]: "" }));
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9 max-w-[280px]">
                            <span className="truncate">
                              {line.account_id ? (() => { const a = accounts.find(x => x.id === line.account_id); return a ? `${a.account_code} - ${a.account_name}` : "Seleccionar"; })() : "Seleccionar"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput placeholder="Buscar cuenta..." value={accountSearch[line.id] || ""} onValueChange={(v) => setAccountSearch(prev => ({ ...prev, [line.id]: v }))} />
                            <CommandList>
                              <CommandEmpty>No se encontró la cuenta.</CommandEmpty>
                              <CommandGroup>
                                <ScrollArea className="h-[300px]">
                                  {accounts.filter(acc => { const s = (accountSearch[line.id] || "").toLowerCase(); return !s || `${acc.account_code} ${acc.account_name}`.toLowerCase().includes(s); })
                                    .map((acc) => (
                                      <CommandItem key={acc.id} value={`${acc.account_code} ${acc.account_name}`} onSelect={() => { onUpdateLine(line.id, "account_id" as keyof DetailLine, acc.id as any); setAccountSearch(prev => ({ ...prev, [line.id]: "" })); setAccountPopoverOpen(prev => ({ ...prev, [line.id]: false })); }}>
                                        <Check className={cn("mr-2 h-4 w-4", line.account_id === acc.id ? "opacity-100" : "opacity-0")} />
                                        {acc.account_code} - {acc.account_name}
                                      </CommandItem>
                                    ))}
                                </ScrollArea>
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className="text-sm px-1 truncate block max-w-[280px]" title={account ? `${account.account_code} - ${account.account_name}` : ''}>
                        {account ? `${account.account_code} - ${account.account_name}` : <span className="text-muted-foreground">Seleccionar</span>}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="py-1">
                    {isBankLine ? (
                      <span className="text-sm px-1 text-muted-foreground italic">{line.description || "Banco (auto)"}</span>
                    ) : isActive ? (
                      <div className="space-y-1">
                        <Input value={line.description} onChange={(e) => onUpdateLine(line.id, "description", e.target.value)} placeholder="Descripción" className="h-9" />
                        {line.source_type === 'PURCHASE' && line.source_ref && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 font-normal">
                            <FileText className="h-3 w-3" />
                            {line.source_ref}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm px-1 truncate block min-w-0" title={line.description}>{line.description || <span className="text-muted-foreground">-</span>}</span>
                        {line.source_type === 'PURCHASE' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 shrink-0 cursor-default">
                                <FileText className="h-3 w-3" />
                                Compra
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[260px] text-xs">
                              <p>Línea generada desde facturas vinculadas.</p>
                              <p className="text-muted-foreground mt-0.5">Use "Vincular Facturas" y luego "Aplicar a póliza" para actualizar.</p>
                              {line.source_ref && <p className="mt-1 font-mono text-[10px]">{line.source_ref}</p>}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="py-1">
                    {isBankLine ? (
                      <span className="text-sm px-1 text-muted-foreground">-</span>
                    ) : isActive ? (
                      <Input value={line.cost_center} onChange={(e) => onUpdateLine(line.id, "cost_center", e.target.value)} placeholder={account?.requires_cost_center ? "Requerido" : "Opcional"} className={cn("h-9", account?.requires_cost_center ? "border-warning" : "")} />
                    ) : (
                      <span className={cn("text-sm px-1", account?.requires_cost_center && !line.cost_center ? "text-warning" : "")}>{line.cost_center || <span className="text-muted-foreground">-</span>}</span>
                    )}
                  </TableCell>

                  <TableCell className="py-1">
                    {isBankLine ? (
                      <span className={cn("text-sm font-mono text-right block px-1", line.debit_amount > 0 ? "font-medium" : "text-muted-foreground")}>
                        {line.debit_amount > 0 ? formatCurrency(line.debit_amount) : "-"}
                      </span>
                    ) : isActive ? (
                      <Input type="number" step="0.01" min="0" value={line.debit_amount || ""} onChange={(e) => onUpdateLine(line.id, "debit_amount" as keyof DetailLine, (parseFloat(e.target.value) || 0) as any)} disabled={line.credit_amount > 0} className="h-9 text-right font-mono" />
                    ) : (
                      <span className={cn("text-sm font-mono text-right block px-1", line.debit_amount > 0 ? "font-medium" : "text-muted-foreground")}>{line.debit_amount > 0 ? formatCurrency(line.debit_amount) : "-"}</span>
                    )}
                  </TableCell>

                  <TableCell className="py-1">
                    {isBankLine ? (
                      <span className={cn("text-sm font-mono text-right block px-1", line.credit_amount > 0 ? "font-medium" : "text-muted-foreground")}>
                        {line.credit_amount > 0 ? formatCurrency(line.credit_amount) : "-"}
                      </span>
                    ) : isActive ? (
                      <Input type="number" step="0.01" min="0" value={line.credit_amount || ""} onChange={(e) => onUpdateLine(line.id, "credit_amount" as keyof DetailLine, (parseFloat(e.target.value) || 0) as any)} disabled={line.debit_amount > 0} className="h-9 text-right font-mono"
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !e.shiftKey) {
                            const nonBankLines = detailLines.filter(l => !l.is_bank_line);
                            const idx = nonBankLines.findIndex(l => l.id === line.id);
                            const next = nonBankLines[idx + 1];
                            if (next) {
                              e.preventDefault();
                              setActiveLineId(next.id);
                              setTimeout(() => setAccountPopoverOpen(prev => ({ ...prev, [next.id]: true })), 50);
                            } else {
                              // Last line — auto-add a new line and focus it
                              e.preventDefault();
                              onAddLine();
                            }
                          }
                        }}
                      />
                    ) : (
                      <span className={cn("text-sm font-mono text-right block px-1", line.credit_amount > 0 ? "font-medium" : "text-muted-foreground")}>{line.credit_amount > 0 ? formatCurrency(line.credit_amount) : "-"}</span>
                    )}
                  </TableCell>

                  <TableCell className="py-1">
                    {isBankLine ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex h-8 w-8 items-center justify-center">
                            <Landmark className="h-4 w-4 text-muted-foreground/50" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Línea bancaria automática. Para eliminarla, quite la cuenta bancaria del encabezado.</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button variant="ghost" size="sm" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onRemoveLine(line.id); }} disabled={detailLines.filter(l => !l.is_bank_line).length <= 1} className="h-8 w-8 p-0">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}

            <TableRow>
              <TableCell colSpan={3} className="text-right font-semibold">Totales:</TableCell>
              <TableCell className="font-semibold text-right font-mono">{formatCurrency(totalDebit)}</TableCell>
              <TableCell className="font-semibold text-right font-mono">{formatCurrency(totalCredit)}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {!isBalanced && totalDebit > 0 && (
        <p className="text-sm text-destructive mt-2">⚠️ La partida no está balanceada. Diferencia: {formatCurrency(Math.abs(totalDebit - totalCredit))}</p>
      )}
      {isBalanced && totalDebit > 0 && (
        <p className="text-sm text-success mt-2">✓ Partida balanceada correctamente</p>
      )}
    </div>
  );
}
