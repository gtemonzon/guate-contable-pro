import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Lock, LockOpen, Edit, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface PeriodCardProps {
  period: any;
  onEdit: () => void;
  onClose: () => void;
  onReopen: () => void;
}

const PeriodCard = ({ period, onEdit, onClose, onReopen }: PeriodCardProps) => {
  const isClosed = period.status === "cerrado";
  const startDate = new Date(period.start_date);
  const endDate = new Date(period.end_date);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "abierto":
        return "bg-success/10 text-success border-success/20";
      case "cerrado":
        return "bg-muted text-muted-foreground border-muted";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "abierto":
        return <LockOpen className="h-3 w-3" />;
      case "cerrado":
        return <Lock className="h-3 w-3" />;
      default:
        return <Calendar className="h-3 w-3" />;
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold">Año {period.year}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {format(startDate, "dd 'de' MMMM 'de' yyyy", { locale: es })} - {format(endDate, "dd 'de' MMMM 'de' yyyy", { locale: es })}
            </p>
          </div>
          <Badge variant="outline" className={getStatusColor(period.status)}>
            {getStatusIcon(period.status)}
            <span className="ml-1 capitalize">{period.status}</span>
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {period.notes && (
          <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
            <p className="font-medium mb-1">Notas:</p>
            <p>{period.notes}</p>
          </div>
        )}

        {isClosed && period.closed_at && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded-md">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Cerrado el:</p>
              <p>{format(new Date(period.closed_at), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}</p>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 pt-3 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="flex-1"
        >
          <Edit className="mr-2 h-4 w-4" />
          Editar
        </Button>

        {isClosed ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onReopen}
            className="flex-1"
          >
            <LockOpen className="mr-2 h-4 w-4" />
            Reabrir
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="flex-1"
          >
            <Lock className="mr-2 h-4 w-4" />
            Cerrar
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default PeriodCard;
