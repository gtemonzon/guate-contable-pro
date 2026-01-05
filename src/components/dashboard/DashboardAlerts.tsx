import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, AlertCircle, Info, ArrowRight, RefreshCw, Bell } from 'lucide-react';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { useAlertGenerator } from '@/hooks/useAlertGenerator';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface DashboardAlertsProps {
  enterpriseId?: number | null;
}

export function DashboardAlerts({ enterpriseId }: DashboardAlertsProps) {
  const navigate = useNavigate();
  const { notifications, loading, refetch } = useNotifications(enterpriseId);
  const { generateAlerts, generating } = useAlertGenerator();
  const [hasGenerated, setHasGenerated] = useState(false);

  // Generate alerts on first load
  useEffect(() => {
    if (enterpriseId && !hasGenerated) {
      generateAlerts(enterpriseId).then(() => {
        refetch();
        setHasGenerated(true);
      });
    }
  }, [enterpriseId, hasGenerated]);

  const handleRefresh = async () => {
    if (enterpriseId) {
      await generateAlerts(enterpriseId);
      await refetch();
    }
  };

  // Group and limit notifications
  const urgentAlerts = notifications.filter(n => n.priority === 'urgente' && !n.is_read).slice(0, 3);
  const importantAlerts = notifications.filter(n => n.priority === 'importante' && !n.is_read).slice(0, 3);
  const infoAlerts = notifications.filter(n => n.priority === 'informativa' && !n.is_read).slice(0, 2);

  const allDisplayed = [...urgentAlerts, ...importantAlerts, ...infoAlerts].slice(0, 5);
  const totalUnread = notifications.filter(n => !n.is_read).length;

  const getPriorityConfig = (priority: string) => {
    switch (priority) {
      case 'urgente':
        return {
          icon: AlertTriangle,
          bg: 'bg-destructive/10',
          border: 'border-destructive/30',
          text: 'text-destructive',
        };
      case 'importante':
        return {
          icon: AlertCircle,
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/30',
          text: 'text-yellow-700 dark:text-yellow-400',
        };
      default:
        return {
          icon: Info,
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          text: 'text-blue-700 dark:text-blue-400',
        };
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alertas y Recordatorios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alertas y Recordatorios
            {totalUnread > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-destructive text-destructive-foreground">
                {totalUnread}
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={generating}
          >
            <RefreshCw className={cn('h-4 w-4', generating && 'animate-spin')} />
          </Button>
        </div>
        <CardDescription>
          Próximos vencimientos y tareas pendientes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {allDisplayed.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No hay alertas pendientes</p>
            <p className="text-sm mt-1">¡Todo al día!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {allDisplayed.map((notification) => {
              const config = getPriorityConfig(notification.priority);
              const Icon = config.icon;

              return (
                <div
                  key={notification.id}
                  className={cn(
                    'p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                    config.bg,
                    config.border
                  )}
                  onClick={() => notification.action_url && navigate(notification.action_url)}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', config.text)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{notification.title}</p>
                      {notification.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {notification.description}
                        </p>
                      )}
                    </div>
                    {notification.action_url && (
                      <Button variant="ghost" size="sm" className="shrink-0 h-8 px-2">
                        Ver
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {totalUnread > allDisplayed.length && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate('/notificaciones')}
              >
                Ver todas las notificaciones ({totalUnread})
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
