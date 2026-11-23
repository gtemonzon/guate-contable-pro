import { Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { PERMISSION_TEXTS, type PermissionKind } from "./permissionTexts";

/** Aviso de permiso insuficiente en activos fijos (la base de datos es la que decide). */
export function PermissionNotice({ kind, className }: { kind: PermissionKind; className?: string }) {
  return (
    <Alert className={cn("border-border bg-muted/40", className)}>
      <Lock className="h-4 w-4" />
      <AlertDescription className="text-sm">{PERMISSION_TEXTS[kind]}</AlertDescription>
    </Alert>
  );
}
