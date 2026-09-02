// src/services/notificationService.js
import { supabase, TABLES } from '../lib/supabase';
import { genId } from '../lib/helpers';

export const notificationService = {
  _channel: null,
  _callbacks: [],

  /**
   * Enviar notificação (versão simplificada sem from_user_id)
   */
  async send(userId, text, link = null) {
    try {
      const notif = {
        id: genId(),
        user_id: String(userId),
        text,
        link,
        read: false,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .insert([notif])
        .select()
        .single();

      if (error) {
        console.warn('[notificationService] Fallback para localStorage:', error.message);
        this.saveLocal(notif);
        return notif;
      }

      return data;
    } catch (error) {
      console.warn('[notificationService] Exception:', error.message);
      const notif = {
        id: genId(),
        userId: String(userId),
        text,
        link,
        read: false,
        timestamp: new Date().toISOString()
      };
      this.saveLocal(notif);
      return notif;
    }
  },

  /**
   * Buscar notificações de um utilizador
   */
  async fetchForUser(userId, limit = 50) {
    try {
      const { data, error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .select('*')
        .eq('user_id', String(userId))
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map(this.formatFromDb);
    } catch (error) {
      return this.getLocalForUser(userId);
    }
  },

  /**
   * Subscrever para notificações em tempo real
   */
  subscribe(userId, onNewNotification) {
    if (this._channel) {
      this.unsubscribe();
    }

    this._callbacks.push(onNewNotification);

    this._channel = supabase
      .channel('fims-notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: TABLES.NOTIFICATIONS,
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          const notif = this.formatFromDb(payload.new);
          this._callbacks.forEach(cb => {
            try { cb(notif); } catch (e) {}
          });
        }
      )
      .subscribe((status) => {
        console.log('[notificationService] Realtime:', status);
      });

    return () => this.unsubscribe();
  },

  unsubscribe() {
    if (this._channel) {
      supabase.removeChannel(this._channel);
      this._channel = null;
      this._callbacks = [];
    }
  },

  formatFromDb(row) {
    return {
      id: row.id,
      userId: row.user_id,
      text: row.text,
      link: row.link,
      read: row.read,
      timestamp: row.created_at
    };
  },

  saveLocal(notif) {
    try {
      const notifs = JSON.parse(localStorage.getItem('fims_notifs') || '[]');
      notifs.unshift(notif);
      localStorage.setItem('fims_notifs', JSON.stringify(notifs.slice(0, 100)));
    } catch (e) {}
  },

  getLocalForUser(userId) {
    try {
      const notifs = JSON.parse(localStorage.getItem('fims_notifs') || '[]');
      return notifs.filter(n => n.user_id === String(userId) || n.userId === String(userId));
    } catch (e) {
      return [];
    }
  },

  async markAsRead(notifId, userId) {
    try {
      await supabase
        .from(TABLES.NOTIFICATIONS)
        .update({ read: true })
        .eq('id', notifId)
        .eq('user_id', String(userId));
    } catch (e) {}
  },

  async markAllAsRead(userId) {
    try {
      await supabase
        .from(TABLES.NOTIFICATIONS)
        .update({ read: true })
        .eq('user_id', String(userId))
        .eq('read', false);
    } catch (e) {}
  }
};
