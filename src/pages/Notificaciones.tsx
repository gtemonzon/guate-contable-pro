import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bell, Search, CheckCheck, RefreshCw, Plus, Calendar } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { useAlertGenerator } from '@/hooks/useAlertGenerator';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { CustomReminderDialog } from '@/components/notifications/CustomReminderDialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface CustomReminder {
  id: number;
  title: string;
  description: string | null;
  reminder_date: string;
  priority: 'urgente' | 'importante' | 'informativa';
  is_completed: boolean;
}

export default function Notificaciones() {
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [reminders, setReminders] = useState<CustomReminder[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(true);
  const { toast } = useToast();

  const enterpriseId = localStorage.getItem('currentEnterpriseId');
  const parsedEnterpriseId = enterpriseId ? parseInt(enterpriseId) : null;

  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, refetch } = useNotifications(parsedEnterpriseId);
  const { generateAlerts, generating } = useAlertGenerator();

  const fetchReminders = async () => {
    try {
      const { data } = await supabase
        .from('tab_custom_reminders')
        .select('*')
        .order('reminder_date', { ascending: true });

      setReminders((data || []) as CustomReminder[]);
    } catch (error) {
      console.error('Error fetching reminders:', error);
    } finally {
      setLoadingReminders(false);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, []);

  const handleRefresh = async () => {
    if (parsedEnterpriseId) {
      await generateAlerts(parsedEnterpriseId);
      await refetch();
    }
  };

  const handleCompleteReminder = async (id: number) => {
    try {
      const { error } = await supabase
        .from('tab_custom_reminders')
        .update({ is_completed: true })
        .eq('id', id);

      if (error) throw error;

      setReminders(prev => prev.map(r => r.id === id ? { ...r, is_completed: true } : r));
      toast({ title: 'Recordatorio completado' });
    } catch (error) {
      console.error('Error completing reminder:', error);
    }
  };

  const handleDeleteReminder = async (id: number) => {
    try {
      const { error } = await supabase
        .from('tab_custom_reminders')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setReminders(prev => prev.filter(r => r.id !== id));
      toast({ title: 'Recordatorio eliminado' });
    } catch (error) {
      console.error('Error deleting reminder:', error);
    }
  };

  // Filter notifications
  const filteredNotifications = notifications.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || n.priority === priorityFilter;
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'unread' && !n.is_read) ||
      (statusFilter === 'read' && n.is_read);

    return matchesSearch && matchesPriority && matchesStatus;
  });

  // Filter reminders
  const pendingReminders = reminders.filter(r => !r.is_completed);
  const completedReminders = reminders.filter(r => r.is_completed);

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Bell className="h-8 w-8" />
            Notificaciones
          </h1>
          <p className="text-muted-foreground">
            Gestiona tus alertas, notificaciones y recordatorios
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={generating}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', generating && 'animate-spin')} />
            Verificar Alertas
          </Button>
          <CustomReminderDialog
            enterpriseId={parsedEnterpriseId}
            onSuccess={fetchReminders}
          />
        </div>
      </div>

      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList>
          <TabsTrigger value="notifications" className="relative">
            Notificaciones
            {unreadCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-destructive text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reminders">
            Recordatorios
            {pendingReminders.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                {pendingReminders.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Todas las Notificaciones</CardTitle>
                  <CardDescription>
                    {unreadCount} no leída{unreadCount !== 1 ? 's' : ''} de {notifications.length} total
                  </CardDescription>
                </div>
                {unreadCount > 0 && (
                  <Button variant="outline" size="sm" onClick={markAllAsRead}>
                    <CheckCheck className="h-4 w-4 mr-2" />
                    Marcar todas como leídas
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-wrap gap-4 mb-6">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar notificaciones..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="urgente">Urgentes</SelectItem>
                    <SelectItem value="importante">Importantes</SelectItem>
                    <SelectItem value="informativa">Informativas</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="unread">No leídas</SelectItem>
                    <SelectItem value="read">Leídas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notifications list */}
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="h-16 w-16 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">No hay notificaciones</p>
                  <p className="text-sm">Las alertas del sistema aparecerán aquí</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredNotifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={markAsRead}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reminders">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Pending reminders */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Pendientes
                </CardTitle>
                <CardDescription>
                  {pendingReminders.length} recordatorio{pendingReminders.length !== 1 ? 's' : ''} pendiente{pendingReminders.length !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingReminders ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => (
                      <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : pendingReminders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No hay recordatorios pendientes</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingReminders.map((reminder) => (
                      <div
                        key={reminder.id}
                        className={cn(
                          'p-3 rounded-lg border',
                          reminder.priority === 'urgente' && 'bg-destructive/10 border-destructive/30',
                          reminder.priority === 'importante' && 'bg-yellow-500/10 border-yellow-500/30',
                          reminder.priority === 'informativa' && 'bg-blue-500/10 border-blue-500/30'
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{reminder.title}</p>
                            {reminder.description && (
                              <p className="text-sm text-muted-foreground">{reminder.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(reminder.reminder_date).toLocaleDateString('es-GT', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCompleteReminder(reminder.id)}
                            >
                              Completar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Completed reminders */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-muted-foreground">
                  <CheckCheck className="h-5 w-5" />
                  Completados
                </CardTitle>
                <CardDescription>
                  {completedReminders.length} recordatorio{completedReminders.length !== 1 ? 's' : ''} completado{completedReminders.length !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {completedReminders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No hay recordatorios completados</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {completedReminders.slice(0, 5).map((reminder) => (
                      <div
                        key={reminder.id}
                        className="p-3 rounded-lg border bg-muted/50 opacity-60"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium line-through">{reminder.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(reminder.reminder_date).toLocaleDateString('es-GT')}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteReminder(reminder.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
