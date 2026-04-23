import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useBookAuthorizations,
  BOOK_TYPE_LABELS,
  BookAuthorization,
  FolioStatus,
} from "@/hooks/useBookAuthorizations";
import { BookAuthorizationDialog } from "./BookAuthorizationDialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  enterpriseId: number;
}

export function EnterpriseBookAuthorizations({ enterpriseId }: Props) {
  const { toast } = useToast();
  const {
    authorizations,
    loading,
    create,
    update,
    remove,
    getFolioStatus,
    adjustAvailable,
  } = useBookAuthorizations(enterpriseId);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BookAuthorization | null>(null);
  const [toDelete, setToDelete] = useState<BookAuthorization | null>(null);
  const [statuses, setStatuses] = useState<Record<number, FolioStatus>>({});
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<BookAuthorization | null>(null);
  const [adjustValue, setAdjustValue] = useState<number>(0);
  const [adjustNote, setAdjustNote] = useState("");

  useEffect(() => {
    (async () => {
      const next: Record<number, FolioStatus> = {};
      for (const a of authorizations) {
        const s = await getFolioStatus(a.id);
        if (s) next[a.id] = s;
      }
      setStatuses(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorizations]);

  const filtered = authorizations.filter((a) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      a.authorization_number.toLowerCase().includes(term) ||
      BOOK_TYPE_LABELS[a.book_type].toLowerCase().includes(term)
    );
  });

  const openAdjust = (a: BookAuthorization) => {
    setAdjustTarget(a);
    setAdjustValue(statuses[a.id]?.available ?? 0);
    setAdjustNote("");
    setAdjustOpen(true);
  };

  const submitAdjust = async () => {
    if (!adjustTarget) return;
    if (!adjustNote.trim()) {
      toast({ title: "La nota es obligatoria", variant: "destructive" });
      return;
    }
    try {
      await adjustAvailable(adjustTarget.id, adjustValue, adjustNote.trim());
      const s = await getFolioStatus(adjustTarget.id);
      if (s) setStatuses((p) => ({ ...p, [adjustTarget.id]: s }));
      toast({ title: "Folios ajustados" });
      setAdjustOpen(false);
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleSave = async (
    values: Omit<BookAuthorization, "id" | "created_at" | "updated_at" | "manual_adjustment" | "low_folios_notified_at" | "depleted_notified_at">
  ) => {
    if (editing) {
      await update(editing.id, values);
    } else {
      await create(values);
    }
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await remove(toDelete.id);
      toast({ title: "Autorización eliminada" });
      setToDelete(null);
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const renderStatus = (s?: FolioStatus) => {
    if (!s) return <Badge variant="outline">—</Badge>;
    if (s.is_overdrawn) return <Badge variant="destructive">Sobregirado</Badge>;
    if (s.is_low) return <Badge className="bg-amber-500 hover:bg-amber-600">Pocos folios</Badge>;
    return <Badge className="bg-emerald-500 hover:bg-emerald-600">OK</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar autorización o libro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nueva Autorización
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Libro</TableHead>
              <TableHead># Autorización</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Autorizados</TableHead>
              <TableHead className="text-right">Usados</TableHead>
              <TableHead className="text-right">Disponibles</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Sin autorizaciones registradas
              </TableCell></TableRow>
            ) : (
              filtered.map((a) => {
                const s = statuses[a.id];
                return (
                  <TableRow key={a.id}>
                    <TableCell>{BOOK_TYPE_LABELS[a.book_type]}</TableCell>
                    <TableCell className="font-mono text-xs">{a.authorization_number}</TableCell>
                    <TableCell>{new Date(a.authorization_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">{a.authorized_folios}</TableCell>
                    <TableCell className="text-right">{s?.used ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => openAdjust(a)}
                        className="text-primary underline-offset-2 hover:underline font-medium"
                      >
                        {s?.available ?? "—"}
                      </button>
                    </TableCell>
                    <TableCell>{renderStatus(s)}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(a); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setToDelete(a)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <BookAuthorizationDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
        enterpriseId={enterpriseId}
        authorization={editing}
        onSubmit={handleSave}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar autorización?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la autorización y su historial de consumo. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar folios disponibles</DialogTitle>
            <DialogDescription>
              Define la cantidad real de folios disponibles. Se registrará un ajuste de trazabilidad.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Folios disponibles reales</Label>
              <Input
                type="number"
                value={adjustValue}
                onChange={(e) => setAdjustValue(parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Motivo del ajuste *</Label>
              <Textarea
                rows={2}
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="Ej. Ajuste por folios físicos dañados"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
            <Button onClick={submitAdjust}>Guardar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
