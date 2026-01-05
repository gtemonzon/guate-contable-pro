import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Notification {
  id: number;
  enterprise_id: number | null;
  user_id: string | null;
  notification_type: string;
  title: string;
  description: string | null;
  event_date: string | null;
  priority: 'urgente' | 'importante' | 'informativa';
  is_read: boolean;
  action_url: string | null;
  created_at: string;
  read_at: string | null;
}

export function useNotifications(enterpriseId?: number | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!enterpriseId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('tab_notifications')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const typedData = (data || []) as Notification[];
      setNotifications(typedData);
      setUnreadCount(typedData.filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (notificationId: number) => {
    try {
      const { error } = await supabase
        .from('tab_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!enterpriseId) return;

    try {
      const { error } = await supabase
        .from('tab_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('enterprise_id', enterpriseId)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId: number) => {
    try {
      const { error } = await supabase
        .from('tab_notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      const notification = notifications.find(n => n.id === notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (notification && !notification.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const createNotification = async (notification: {
    enterprise_id: number;
    notification_type: string;
    title: string;
    description?: string;
    event_date?: string;
    priority?: 'urgente' | 'importante' | 'informativa';
    action_url?: string;
  }) => {
    try {
      const { data, error } = await supabase
        .from('tab_notifications')
        .insert({
          ...notification,
          priority: notification.priority || 'informativa',
          is_read: false,
        })
        .select()
        .single();

      if (error) throw error;

      setNotifications(prev => [data as Notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      return data;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    createNotification,
    refetch: fetchNotifications,
  };
}
