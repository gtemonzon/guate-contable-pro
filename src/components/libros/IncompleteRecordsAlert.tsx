import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";

export interface IncompleteItem {
  /** Index in the original array, used to jump to that card */
  index: number;
  date: string;
  docLabel: string;
  partyName: string;
  total: number;
}

export interface IncompleteGroup {
  fieldLabel: string;
  items: IncompleteItem[];
}

interface IncompleteRecordsAlertProps {
  groups: IncompleteGroup[];
  onJumpTo: (index: number) => void;
}

function formatDate(value: string) {
  if (!value) return "-";
  try {
    return new Date(value + "T00:00:00").toLocaleDateString("es-GT");
  } catch {
    return value;
  }
}

function GroupSection({
  group,
  onSelect,
}: {
  group: IncompleteGroup;
  onSelect: (index: number) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50">
        <span className="text-left">
          Se encontraron {group.items.length} factura(s) con {group.fieldLabel} pendiente
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-[40vh] overflow-y-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Proveedor/Cliente</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.items.map((item) => (
                <TableRow
                  key={`${group.fieldLabel}-${item.index}`}
                  className="cursor-pointer"
                  onClick={() => onSelect(item.index)}
                >
                  <TableCell className="whitespace-nowrap">{formatDate(item.date)}</TableCell>
                  <TableCell className="font-mono text-xs">{item.docLabel || "-"}</TableCell>
                  <TableCell>{item.partyName || "-"}</TableCell>
                  <TableCell className="text-right">Q {formatCurrency(item.total || 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function IncompleteRecordsAlert({ groups, onJumpTo }: IncompleteRecordsAlertProps) {
  const [open, setOpen] = useState(false);

  const nonEmpty = groups.filter((g) => g.items.length > 0);
  const uniqueCount = new Set(nonEmpty.flatMap((g) => g.items.map((i) => i.index))).size;

  if (uniqueCount === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-7 gap-1.5 border-destructive/50 bg-destructive/10 px-2 text-xs font-medium text-destructive hover:bg-destructive/20 hover:text-destructive"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Advertencia
        <span className="rounded bg-destructive/20 px-1 tabular-nums">{uniqueCount}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Registros incompletos</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {nonEmpty.map((group) => (
              <GroupSection
                key={group.fieldLabel}
                group={group}
                onSelect={(index) => {
                  setOpen(false);
                  onJumpTo(index);
                }}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
