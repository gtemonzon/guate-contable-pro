import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");
const mod = isMac ? "⌘" : "Ctrl";

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: [`${mod}+K`], description: "Búsqueda global" },
      { keys: ["?"], description: "Mostrar esta ayuda" },
    ],
  },
  {
    title: "Formularios",
    shortcuts: [
      { keys: [`${mod}+Enter`], description: "Guardar / Contabilizar" },
      { keys: [`${mod}+Shift+Enter`], description: "Guardar borrador" },
      { keys: ["Alt+N"], description: "Nuevo registro" },
      { keys: ["Esc"], description: "Cerrar / Cancelar" },
    ],
  },
  {
    title: "Partidas Contables",
    shortcuts: [
      { keys: ["F2", "Alt+B"], description: "Inspector de saldo de cuenta" },
    ],
  },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Atajos de Teclado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {shortcutGroups.map((group, gi) => (
            <div key={group.title}>
              {gi > 0 && <Separator className="mb-3" />}
              <h4 className="text-sm font-medium text-muted-foreground mb-2">{group.title}</h4>
              <div className="space-y-2">
                {group.shortcuts.map((s) => (
                  <div key={s.description} className="flex items-center justify-between">
                    <span className="text-sm">{s.description}</span>
                    <div className="flex gap-1">
                      {s.keys.map((k) => (
                        <Badge key={k} variant="outline" className="font-mono text-xs px-1.5 py-0.5">
                          {k}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
