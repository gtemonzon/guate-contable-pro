import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Mail, Building2, Shield } from "lucide-react";

interface UserCardProps {
  user: {
    id: string;
    email: string;
    full_name: string;
    is_super_admin: boolean;
    is_active: boolean;
    enterprises?: Array<{
      enterprise_id: number;
      role: string;
      enterprise: {
        id: number;
        business_name: string;
      };
    }>;
  };
  onEdit: (user: any) => void;
}

const UserCard = ({ user, onEdit }: UserCardProps) => {
  const isAdmin = user.is_super_admin;
  
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{user.full_name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Mail className="h-3 w-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          {isAdmin && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Admin
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant={user.is_active ? "default" : "destructive"}>
            {user.is_active ? "Activo" : "Inactivo"}
          </Badge>
        </div>

        {user.enterprises && user.enterprises.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4" />
              <span>Empresas Asignadas ({user.enterprises.length})</span>
            </div>
            <div className="space-y-1">
              {user.enterprises.slice(0, 2).map((ent) => (
                <div
                  key={ent.enterprise_id}
                  className="text-xs bg-muted p-2 rounded"
                >
                  {ent.enterprise.business_name}
                </div>
              ))}
              {user.enterprises.length > 2 && (
                <p className="text-xs text-muted-foreground">
                  +{user.enterprises.length - 2} más
                </p>
              )}
            </div>
          </div>
        )}

        {(!user.enterprises || user.enterprises.length === 0) && (
          <p className="text-sm text-muted-foreground">
            Sin empresas asignadas
          </p>
        )}
      </CardContent>

      <CardFooter>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onEdit(user)}
        >
          <Edit className="mr-2 h-4 w-4" />
          Editar
        </Button>
      </CardFooter>
    </Card>
  );
};

export default UserCard;
