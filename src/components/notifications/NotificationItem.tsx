import { AlertTriangle, AlertCircle, Info, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface NotificationItemProps {
  notification: {
    id: number;
    title: string;
    description: string | null;
    priority: 'urgente' | 'importante' | 'informativa';
    is_read: boolean;
    action_url: string | null;
    created_at: string;
    event_date: string | null;
  };
  onMarkAsRead?: (id: number) => void;
  compact?: boolean;
}

export function NotificationItem({ notification, onMarkAsRead, compact = false }: NotificationItemProps) {
  const navigate = useNavigate();

  const priorityConfig = {
    urgente: {
      icon: AlertTriangle,
      bgColor: 'bg-destructive/10',
      borderColor: 'border-destructive/30',
      textColor: 'text-destructive',
      iconColor: 'text-destructive',
      label: 'Urgente',
    },
    importante: {
      icon: AlertCircle,
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/30',
      textColor: 'text-yellow-700 dark:text-yellow-400',
      iconColor: 'text-yellow-600 dark:text-yellow-400',
      label: 'Importante',
    },
    informativa: {
      icon: Info,
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      textColor: 'text-blue-700 dark:text-blue-400',
      iconColor: 'text-blue-600 dark:text-blue-400',
      label: 'Informativa',
    },
  };

  const config = priorityConfig[notification.priority];
  const Icon = config.icon;

  const handleClick = () => {
    if (!notification.is_read && onMarkAsRead) {
      onMarkAsRead(notification.id);
    }
    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  const timeAgo = () => {
    const date = new Date(notification.created_at);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
    return format(date, 'dd MMM', { locale: es });
  };

  if (compact) {
    return (
      <div
        onClick={handleClick}
        className={cn(
          'p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
          config.bgColor,
          config.borderColor,
          !notification.is_read && 'ring-1 ring-primary/20'
        )}
      >
        <div className="flex items-start gap-3">
          <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', config.iconColor)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('text-xs font-medium uppercase', config.textColor)}>
                {config.label}
              </span>
              {!notification.is_read && (
                <span className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <p className="font-medium text-sm mt-0.5 truncate">{notification.title}</p>
            {notification.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {notification.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{timeAgo()}</p>
          </div>
          {notification.action_url && (
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'p-4 rounded-lg border transition-all',
        config.bgColor,
        config.borderColor,
        !notification.is_read && 'ring-1 ring-primary/20'
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cn('p-2 rounded-full', config.bgColor)}>
          <Icon className={cn('h-5 w-5', config.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-xs font-medium uppercase', config.textColor)}>
              {config.label}
            </span>
            {!notification.is_read && (
              <span className="h-2 w-2 rounded-full bg-primary" />
            )}
            <span className="text-xs text-muted-foreground ml-auto">{timeAgo()}</span>
          </div>
          <h4 className="font-semibold">{notification.title}</h4>
          {notification.description && (
            <p className="text-sm text-muted-foreground mt-1">{notification.description}</p>
          )}
          {notification.event_date && (
            <p className="text-xs text-muted-foreground mt-2">
              Fecha evento: {format(new Date(notification.event_date), "dd 'de' MMMM yyyy", { locale: es })}
            </p>
          )}
          <div className="flex gap-2 mt-3">
            {notification.action_url && (
              <Button size="sm" variant="outline" onClick={handleClick}>
                Ver detalle
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            )}
            {!notification.is_read && onMarkAsRead && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkAsRead(notification.id);
                }}
              >
                <Check className="h-3 w-3 mr-1" />
                Marcar como leída
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
