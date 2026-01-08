import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface ActivityIndicatorProps {
  lastActivityAt: string | null;
  currentEnterpriseName: string | null;
}

type ActivityStatus = "active" | "idle" | "offline";

const getActivityStatus = (lastActivityAt: string | null): ActivityStatus => {
  if (!lastActivityAt) return "offline";
  
  const lastActivity = new Date(lastActivityAt);
  const now = new Date();
  const diffInMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
  
  if (diffInMinutes < 5) return "active";
  if (diffInMinutes < 5 * 60) return "idle"; // Menos de 5 horas
  return "offline";
};

const statusConfig = {
  active: {
    color: "bg-green-500",
    pulse: true,
    label: "Activo",
  },
  idle: {
    color: "bg-yellow-500",
    pulse: false,
    label: "Inactivo",
  },
  offline: {
    color: "bg-red-500",
    pulse: false,
    label: "Desconectado",
  },
};

const ActivityIndicator = ({ lastActivityAt, currentEnterpriseName }: ActivityIndicatorProps) => {
  const status = getActivityStatus(lastActivityAt);
  const config = statusConfig[status];
  
  const getTimeAgo = () => {
    if (!lastActivityAt) return "Sin actividad registrada";
    return `Última actividad: ${formatDistanceToNow(new Date(lastActivityAt), { 
      addSuffix: true, 
      locale: es 
    })}`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative flex items-center">
            <span
              className={`h-3 w-3 rounded-full ${config.color} ${
                config.pulse ? "animate-pulse" : ""
              }`}
            />
            {config.pulse && (
              <span
                className={`absolute h-3 w-3 rounded-full ${config.color} animate-ping opacity-75`}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">{getTimeAgo()}</p>
            {status === "active" && currentEnterpriseName && (
              <p className="text-xs">
                Trabajando en: <span className="font-medium">{currentEnterpriseName}</span>
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ActivityIndicator;
