// src/context/CommsContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { genId } from "../lib/helpers";
import { notificationService } from "../services/notificationService";

const CommsContext = createContext();

// Chaves para localStorage
const STORAGE_KEYS = {
  MESSAGES: "fims_messages",
  NOTIFICATIONS: "fims_notifs",
  DRAFT: "fims_messages_draft",
  ANNOUNCEMENTS: "fims_announcements",
  DISMISSED: "fims_dismissed"
};

export function CommsProvider({ children, currentUser }) {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    return saved ? JSON.parse(saved) : [];
  });

  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    return saved ? JSON.parse(saved) : [];
  });

  const [announcements, setAnnouncements] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ANNOUNCEMENTS);
    return saved ? JSON.parse(saved) : [];
  });

  const [dismissed, setDismissed] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DISMISSED);
    return saved ? JSON.parse(saved) : [];
  });

  const [draft, setDraft] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DRAFT);
    return saved || "";
  });

  // ============================================
  // NOTIFICAÇÕES COM SUPABASE REALTIME
  // ============================================
  
  // Carregar notificações do Supabase quando utilizador loga
  useEffect(() => {
    if (!currentUser?.id) return;

    async function loadNotifications() {
      const supabaseNotifs = await notificationService.fetchForUser(currentUser.id);
      if (supabaseNotifs.length > 0) {
        // Mesclar com locais, removendo duplicados
        setNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const newNotifs = supabaseNotifs.filter(n => !existingIds.has(n.id));
          const merged = [...newNotifs, ...prev];
          localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(merged));
          return merged;
        });
      }
    }

    loadNotifications();

    // Subscrever para notificações em tempo real
    const unsubscribe = notificationService.subscribe(
      currentUser.id,
      (newNotif) => {
        console.log('[CommsContext] Nova notificação recebida via Realtime:', newNotif);
        setNotifications(prev => {
          const updated = [newNotif, ...prev].slice(0, 100);
          localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
          return updated;
        });
        
        // Mostrar notificação do browser se permitido
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('FIMS - Nova Notificação', {
            body: newNotif.text,
            icon: '/favicon.ico'
          });
        }
      }
    );

    // Pedir permissão para notificações do browser
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      unsubscribe();
    };
  }, [currentUser?.id]);

  // Persistir dados
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(announcements));
  }, [announcements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DISMISSED, JSON.stringify(dismissed));
  }, [dismissed]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DRAFT, draft);
  }, [draft]);

  // Enviar mensagem (privada)
  const sendMessage = (fromId, toId, text) => {
    const msg = {
      id: genId(),
      fromId,
      toId,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      read: false
    };
    setMessages(prev => [...prev, msg]);
    
    const fromUser = JSON.parse(localStorage.getItem('fims_current_user') || '{}');
    notify(toId, `${fromUser.name || 'Usuário'}: ${text}`, "messages");
    
    return msg;
  };

  // Enviar mensagem broadcast
  const sendBroadcast = (fromId, text, roleFilter = null) => {
    const msg = {
      id: genId(),
      fromId,
      toId: 'broadcast',
      text: text.trim(),
      timestamp: new Date().toISOString(),
      read: false,
      isBroadcast: true,
      roleFilter: roleFilter
    };
    setMessages(prev => [...prev, msg]);
    
    const fromUser = JSON.parse(localStorage.getItem('fims_current_user') || '{}');
    const users = JSON.parse(localStorage.getItem('fims_users') || '[]');
    
    users.forEach(user => {
      if (user.id === fromId) return;
      if (roleFilter && user.role !== roleFilter) return;
      notify(user.id, `📢 ${fromUser.name || 'Admin'}: ${text}`, "messages");
    });
    
    return msg;
  };

  // Obter mensagens de uma conversa
  const getConversation = (userId1, userId2) => {
    return messages.filter(m => 
      (m.fromId === userId1 && m.toId === userId2) ||
      (m.fromId === userId2 && m.toId === userId1) ||
      (m.isBroadcast && (m.toId === 'broadcast' || m.toId === userId1 || m.toId === userId2))
    ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  };

  // Obter mensagens broadcast
  const getBroadcastMessages = () => {
    return messages.filter(m => m.isBroadcast || m.toId === 'broadcast')
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  };

  // Marcar mensagem como lida
  const markAsRead = (messageId) => {
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, read: true } : m
    ));
  };

  // Marcar todas as mensagens de uma conversa como lidas
  const markAllAsRead = (userId) => {
    setMessages(prev => prev.map(m => 
      (m.fromId === userId || m.toId === userId) ? { ...m, read: true } : m
    ));
  };

  // Obter contagem de não lidas
  const getUnreadCount = (userId) => {
    return messages.filter(m => 
      (m.toId === userId || m.toId === 'broadcast') && !m.read && m.fromId !== userId
    ).length;
  };

  // Obter contatos recentes
  const getRecentContacts = (userId) => {
    const contacts = {};
    messages.forEach(m => {
      if (m.fromId === userId || m.toId === userId) {
        const contactId = m.fromId === userId ? m.toId : m.fromId;
        if (contactId && contactId !== 'broadcast') {
          if (!contacts[contactId] || new Date(m.timestamp) > new Date(contacts[contactId].timestamp)) {
            contacts[contactId] = { ...m, contactId };
          }
        }
      }
    });
    return Object.values(contacts).sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
  };

  // ============================================
  // NOTIFICAR - VERSÃO SIMPLIFICADA
  // ============================================
  const notify = useCallback(async (userId, text, link = null) => {
    const notif = {
      id: genId(),
      userId: String(userId),
      text,
      timestamp: new Date().toISOString(),
      read: false,
      link
    };

    // Adicionar localmente imediatamente
    setNotifications(prev => {
      const updated = [notif, ...prev].slice(0, 100);
      try {
        localStorage.setItem('fims_notifs', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // Enviar para Supabase (sem fromUserId)
    notificationService.send(userId, text, link).catch(err => {
      console.warn('[CommsContext] Notificação não enviada ao Supabase:', err.message);
    });

    return notif;
  }, []);

  // Marcar notificação como lida
  const markNotificationRead = async (notifId) => {
    setNotifications(prev => prev.map(n => 
      n.id === notifId ? { ...n, read: true } : n
    ));
    
    // Atualizar no Supabase
    if (currentUser?.id) {
      await notificationService.markAsRead(notifId, currentUser.id);
    }
  };

  // Marcar todas as notificações como lidas
  const markAllNotificationsRead = async (userId) => {
    setNotifications(prev => prev.map(n => 
      n.userId === userId ? { ...n, read: true } : n
    ));
    
    // Atualizar no Supabase
    await notificationService.markAllAsRead(userId);
  };

  // Limpar rascunho
  const clearDraft = () => {
    setDraft("");
    localStorage.removeItem(STORAGE_KEYS.DRAFT);
  };

  // ============================================
  // ANÚNCIOS
  // ============================================
  const createAnnouncement = (fromId, title, text, targetRole = null) => {
    const announcement = {
      id: genId(),
      fromId,
      title,
      text,
      timestamp: new Date().toISOString(),
      targetRole,
      dismissedBy: []
    };
    setAnnouncements(prev => [announcement, ...prev]);
    
    const fromUser = JSON.parse(localStorage.getItem('fims_current_user') || '{}');
    const users = JSON.parse(localStorage.getItem('fims_users') || '[]');
    
    users.forEach(user => {
      if (user.id === fromId) return;
      if (targetRole && user.role !== targetRole) return;
      notify(user.id, `📢 ${fromUser.name || 'Admin'}: ${title}`, "messages");
    });
    
    return announcement;
  };

  const dismissAnnouncement = (announcementId, userId) => {
    setAnnouncements(prev => {
      const updated = prev.map(a => {
        if (a.id === announcementId) {
          const dismissedBy = a.dismissedBy || [];
          if (!dismissedBy.includes(userId)) {
            return { ...a, dismissedBy: [...dismissedBy, userId] };
          }
          return a;
        }
        return a;
      });
      localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(updated));
      return updated;
    });
  };

  const getUnseenAnnouncements = (userId) => {
    return announcements.filter(a => {
      const dismissedBy = a.dismissedBy || [];
      return !dismissedBy.includes(userId);
    });
  };

  const confirmAnnouncement = (announcementId, userId) => {
    dismissAnnouncement(announcementId, userId);
    
    const announcement = announcements.find(a => a.id === announcementId);
    if (announcement) {
      const fromUser = JSON.parse(localStorage.getItem('fims_current_user') || '{}');
      const confirmMsg = {
        id: genId(),
        fromId: userId,
        toId: announcement.fromId,
        text: `✅ OK Recebido: "${announcement.title}"`,
        timestamp: new Date().toISOString(),
        read: false,
        isConfirmation: true,
        announcementId: announcementId
      };
      setMessages(prev => {
        const updated = [...prev, confirmMsg];
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
        return updated;
      });
      
      notify(announcement.fromId, `${fromUser.name || 'Usuário'} confirmou recebimento: ${announcement.title}`, "messages");
    }
  };

  const replyToAnnouncement = (announcementId, fromId, text) => {
    const announcement = announcements.find(a => a.id === announcementId);
    if (!announcement) return null;
    
    const replyMsg = {
      id: genId(),
      fromId,
      toId: announcement.fromId,
      text: `📩 Resposta ao anúncio "${announcement.title}": ${text}`,
      timestamp: new Date().toISOString(),
      read: false,
      isReply: true,
      announcementId: announcementId
    };
    setMessages(prev => {
      const updated = [...prev, replyMsg];
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
      return updated;
    });
    
    const fromUser = JSON.parse(localStorage.getItem('fims_current_user') || '{}');
    notify(announcement.fromId, `${fromUser.name || 'Usuário'} respondeu ao anúncio: ${announcement.title}`, "messages");
    
    return replyMsg;
  };

  const broadcastMessage = (fromId, text) => {
    return sendBroadcast(fromId, text);
  };

  const value = {
    messages,
    notifications,
    announcements,
    draft,
    setDraft,
    sendMessage,
    sendBroadcast,
    getConversation,
    getBroadcastMessages,
    getUnreadCount,
    getRecentContacts,
    markAsRead,
    markAllAsRead,
    markNotificationRead,
    markAllNotificationsRead,
    markAllRead: markAllNotificationsRead,
    notify,
    clearDraft,
    createAnnouncement,
    dismissAnnouncement,
    getUnseenAnnouncements,
    confirmAnnouncement,
    replyToAnnouncement,
    broadcastMessage,
    setAnnouncements
  };

  return (
    <CommsContext.Provider value={value}>
      {children}
    </CommsContext.Provider>
  );
}

// Hook personalizado
export function useComms() {
  const context = useContext(CommsContext);
  if (!context) {
    throw new Error("useComms must be used within a CommsProvider");
  }
  return context;
}

export { CommsContext };
