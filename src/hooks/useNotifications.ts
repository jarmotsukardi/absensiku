import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  metadata?: Json;
}

export async function createNotification({
  userId,
  title,
  message,
  type = 'info',
  link,
  metadata,
}: CreateNotificationParams) {
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      title,
      message,
      type,
      link,
      metadata,
    });

  if (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

export async function createBulkNotifications(
  notifications: CreateNotificationParams[]
) {
  const notificationsToInsert = notifications.map(n => ({
    user_id: n.userId,
    title: n.title,
    message: n.message,
    type: n.type || 'info',
    link: n.link,
    metadata: n.metadata,
  }));

  const { error } = await supabase
    .from('notifications')
    .insert(notificationsToInsert);

  if (error) {
    console.error('Error creating bulk notifications:', error);
    throw error;
  }
}

export async function markNotificationAsRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

export async function markAllNotificationsAsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}

export async function deleteNotification(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);

  if (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
}
