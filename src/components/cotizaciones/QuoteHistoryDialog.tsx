import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchQuoteHistory, STATUS_LABELS, type QuoteStatusHistoryRow } from "@/hooks/useQuotes";
import { Clock } from "lucide-react";

interface Props {
  quoteId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function QuoteHistoryDialog({ quoteId, open, onOpenChange }: Props) {
  const [rows, setRows] = useState<QuoteStatusHistoryRow[]>([]);

  useEffect(() => {
    if (open && quoteId) fetchQuoteHistory(quoteId).then(setRows);
  }, [open, quoteId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Historial de estados</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Sin registros.</p>}
          {rows.map((r) => (
            <div key={r.id} className="text-sm border-l-2 border-primary pl-3 py-1">
              <span className="font-medium">{STATUS_LABELS[r.status]}:</span>{" "}
              <span>{r.changed_by_name}</span>{" "}
              <span className="text-muted-foreground">
                — {new Date(r.changed_at).toLocaleString("es-GT")}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
