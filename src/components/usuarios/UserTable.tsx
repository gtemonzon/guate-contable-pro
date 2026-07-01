import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, ArrowUp, ArrowDown, Edit, Shield } from "lucide-react";
import ActivityIndicator from "./ActivityIndicator";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  is_super_admin: boolean;
  is_active: boolean;
  last_activity_at?: string | null;
  current_enterprise_name?: string | null;
  tenant?: { tenant_name: string } | null;
  enterprises?: Array<{ enterprise_id: number }>;
}

interface Props {
  users: UserRow[];
  onEdit: (user: any) => void;
}

type SortKey = "full_name" | "email" | "tenant" | "enterprises" | "is_active" | "last_activity_at";
type SortDir = "asc" | "desc";

const UserTable = ({ users, onEdit }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("full_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    const getVal = (u: UserRow): string | number => {
      switch (sortKey) {
        case "full_name": return u.full_name?.toLowerCase() || "";
        case "email": return u.email?.toLowerCase() || "";
        case "tenant": return u.tenant?.tenant_name?.toLowerCase() || "";
        case "enterprises": return u.enterprises?.length || 0;
        case "is_active": return u.is_active ? 1 : 0;
        case "last_activity_at": return u.last_activity_at ? new Date(u.last_activity_at).getTime() : 0;
      }
    };
    const arr = [...users];
    arr.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [users, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 inline h-3 w-3" />
      : <ArrowDown className="ml-1 inline h-3 w-3" />;
  };

  const Th = ({ col, children, className }: { col: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className="inline-flex items-center font-medium hover:text-foreground"
      >
        {children}
        <SortIcon col={col} />
      </button>
    </TableHead>
  );

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <Th col="full_name">Nombre</Th>
            <Th col="email">Email</Th>
            <Th col="tenant">Oficina</Th>
            <Th col="enterprises" className="text-center">Empresas</Th>
            <Th col="is_active" className="text-center">Estado</Th>
            <Th col="last_activity_at">Última actividad</Th>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <ActivityIndicator
                  lastActivityAt={user.last_activity_at ?? null}
                  currentEnterpriseName={user.current_enterprise_name ?? null}
                />
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {user.full_name}
                  {user.is_super_admin && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Admin
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{user.email}</TableCell>
              <TableCell>{user.tenant?.tenant_name || <span className="text-destructive text-xs">Sin oficina</span>}</TableCell>
              <TableCell className="text-center">{user.enterprises?.length || 0}</TableCell>
              <TableCell className="text-center">
                <Badge variant={user.is_active ? "default" : "destructive"}>
                  {user.is_active ? "Activo" : "Inactivo"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {user.current_enterprise_name || "—"}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onEdit(user)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default UserTable;
