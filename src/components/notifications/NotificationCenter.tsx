import { useState, useEffect } from 'react';
import { Bell, CheckCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useNotifications } from '@/hooks/useNotifications';
import { useAlertGenerator } from '@/hooks/useAlertGenerator';
import { NotificationItem } from './NotificationItem';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NotificationCenterProps {
  enterpriseId?: number | null;
}

export function NotificationCenter({ enterpriseId }: NotificationCenterProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, refetch } = useNotifications(enterpriseId);
  const { generateAlerts, generating } = useAlertGenerator();

  // Generate alerts when enterprise changes or on initial load
  useEffect(() => {
    if (enterpriseId) {
      generateAlerts(enterpriseId).then(() => refetch());
    }
  }, [enterpriseId]);

  const handleRefresh = async () => {
    if (enterpriseId) {
      await generateAlerts(enterpriseId);
      await refetch();
    }
  };

  const recentNotifications = notifications.slice(0, 10);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notificaciones</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={generating}
              className="h-8 px-2"
            >
              <RefreshCw className={cn('h-4 w-4', generating && 'animate-spin')} />
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-8 px-2 text-xs"
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Marcar todas
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              Cargando...
            </div>
          ) : recentNotifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No hay notificaciones</p>
              <p className="text-xs mt-1">Las alertas aparecerán aquí</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {recentNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                  compact
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator />
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-center text-sm"
            onClick={() => {
              setOpen(false);
              navigate('/notificaciones');
            }}
          >
            Ver todas las notificaciones
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
