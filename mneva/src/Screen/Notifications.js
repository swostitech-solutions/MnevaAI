import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, useWindowDimensions, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';
import { useSocket } from '../services/socket';
import SmartReplyCard from '../components/SmartReplyCard';
import ReminderAlert from '../components/ReminderAlert';

const TYPE_META = {
  email:    { icon: 'mail',           color: '#615FF8', bg: '#EEEDFE', emoji: '📧' },
  sms:      { icon: 'message-square', color: '#4FA6E8', bg: '#EAF3FD', emoji: '📱' },
  calendar: { icon: 'calendar',       color: '#1F9A5A', bg: '#EFFDF6', emoji: '📅' },
  whatsapp: { icon: 'message-circle', color: '#25D366', bg: '#E8FDF0', emoji: '💬' },
  payment:  { icon: 'credit-card',    color: '#1F9A5A', bg: '#EFFDF6', emoji: '💸' },
  booking:  { icon: 'navigation',     color: '#4FA6E8', bg: '#EAF3FD', emoji: '🚗' },
  food:     { icon: 'shopping-bag',   color: '#F5A623', bg: '#FEF3C7', emoji: '🍛' },
  shopping: { icon: 'shopping-cart',  color: '#F5A623', bg: '#FEF3C7', emoji: '🛍️' },
  reminder: { icon: 'bell',           color: '#F5A623', bg: '#FEF3C7', emoji: '🔔' },
  info:     { icon: 'bell',           color: '#9AA1AE', bg: '#F3F4F6', emoji: '🔔' },
};

const getMeta = (type) => TYPE_META[type] || TYPE_META.info;

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function NotifRow({ item, onMarkRead }) {
  const meta = getMeta(item.type);
  const fadeAnim = React.useRef(new Animated.Value(item.read ? 1 : 0)).current;

  const handlePress = () => {
    if (item.read) return;
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start();
    onMarkRead(item.id);
  };

  return (
    <TouchableOpacity
      style={[styles.notifRow, item.read && styles.notifRowRead]}
      onPress={handlePress}
      activeOpacity={0.75}
    >
      {/* Unread indicator */}
      <View style={[styles.unreadDot, item.read && styles.unreadDotHidden]} />

      {/* Icon */}
      <View style={[styles.notifIcon, { backgroundColor: meta.bg }]}>
        <Feather name={meta.icon} size={18} color={meta.color} />
      </View>

      {/* Content */}
      <View style={styles.notifContent}>
        <View style={styles.notifTopRow}>
          <Text style={[styles.notifTitle, item.read && styles.notifTitleRead]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notifTime}>{formatTime(item.ts)}</Text>
        </View>
        {!!item.body && (
          <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
        )}
        <View style={[styles.typePill, { backgroundColor: meta.bg }]}>
          <Text style={[styles.typePillText, { color: meta.color }]}>{item.type}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function Notifications({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = width < 360 ? 16 : 20;
  const { on, emit } = useSocket();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeReply, setActiveReply] = useState(null);   // email notif for inline reply
  const [replyCards, setReplyCards] = useState([]);        // auto-popup cards

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await apiFetch('/api/notifications');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, []);

  // ── Live socket events ────────────────────────────────────────────────────────────
  useEffect(() => {
    const push = (notif) => {
      setNotifications(prev => [notif, ...prev.filter(n => n.id !== notif.id)]);
      setUnreadCount(prev => prev + 1);
    };

    const offEmail = on('gmail:notification', (data) => {
      const notif = { id: data.id, title: data.title, body: data.body, type: 'email', read: false, ts: data.ts, emailId: data.emailId, from: data.from, subject: data.subject, suggestedReply: data.suggestedReply };
      push(notif);
      if (data.suggestedReply) setReplyCards(prev => [...prev, notif]);
    });

    const offSms = on('sms:notification', (data) => {
      push({ id: data.id, title: data.title, body: data.body, type: 'sms', read: false, ts: data.ts, from: data.from });
    });

    const offCal = on('calendar:notification', (data) => {
      push({ id: data.id, title: data.title, body: data.body, type: 'calendar', read: false, ts: data.ts });
    });

    const offApp = on('app:notification', (data) => {
      push({ id: data.id, title: data.title, body: data.body, type: data.type || 'info', read: false, ts: data.ts });
    });

    const offGeneric = on('notification:created', (data) => {
      push({ id: data.id, title: data.title, body: data.body, type: data.type || 'info', read: false, ts: data.ts });
    });

    const offSent = on('gmail:reply_sent', ({ notifId }) => {
      setReplyCards(prev => prev.filter(c => c.id !== notifId));
      setActiveReply(null);
    });

    return () => { offEmail(); offSms(); offCal(); offApp(); offGeneric(); offSent(); };
  }, [on]);

  const markRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try { await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }); } catch {}
  };

  const handleNotifPress = (item) => {
    if (!item.read) markRead(item.id);
    if (item.type === 'email') {
      setReplyCards(prev => prev.filter(c => c.id !== item.id));
      setActiveReply(prev => prev?.id === item.id ? null : item);
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
    finally { setMarkingAll(false); }
  };

  const unread = notifications.filter(n => !n.read);
  const read = notifications.filter(n => n.read);

  const sections = [
    ...(unread.length > 0 ? [{ type: 'header', label: `NEW · ${unread.length}`, key: 'h1' }] : []),
    ...unread.map(n => ({ type: 'item', ...n })),
    ...(read.length > 0 ? [{ type: 'header', label: 'EARLIER', key: 'h2' }] : []),
    ...read.map(n => ({ type: 'item', ...n })),
  ];

  const renderItem = ({ item }) => {
    if (item.type === 'header') {
      return <Text style={styles.sectionHeader}>{item.label}</Text>;
    }
    return (
      <>
        <NotifRow item={item} onMarkRead={() => handleNotifPress(item)} />
        {item.type === 'email' && activeReply?.id === item.id && (
          <View style={styles.inlineReply}>
            <SmartReplyCard
              inline
              notif={activeReply}
              emit={emit}
              on={on}
              onSend={() => {}}
              onSkip={() => setActiveReply(null)}
            />
          </View>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ReminderAlert />

      {/* Auto-popup smart reply cards — Modal bottom-sheet */}
      {replyCards.filter(c => c.id !== activeReply?.id).map(card => (
        <SmartReplyCard
          key={card.id}
          notif={card}
          emit={emit}
          on={on}
          onSend={() => {}}
          onSkip={() => setReplyCards(prev => prev.filter(c => c.id !== card.id))}
        />
      ))}

      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: hPad }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
          <Feather name="arrow-left" size={22} color="#14171F" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSub}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={[styles.markAllBtn, markingAll && { opacity: 0.5 }]}
            onPress={markAllRead}
            disabled={markingAll}
          >
            <Feather name="check-circle" size={14} color="#7B5FE8" />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: hPad, paddingTop: 12 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <View key={i} style={styles.skeleton} />
          ))}
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Feather name="bell" size={32} color="#C7CBD3" />
          </View>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptySub}>No notifications yet</Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item, i) => item.key || item.id || String(i)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: hPad, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadData(true); }}
              tintColor="#7B5FE8"
              colors={['#7B5FE8']}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#14171F' },
  headerSub: { fontSize: 12, color: '#7B5FE8', fontWeight: '600', marginTop: 1 },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(123,95,232,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(123,95,232,0.2)',
  },
  markAllText: { fontSize: 12, fontWeight: '700', color: '#7B5FE8' },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9AA1AE',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  notifRowRead: { opacity: 0.7 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#7B5FE8',
    marginTop: 5,
    flexShrink: 0,
  },
  unreadDotHidden: { backgroundColor: 'transparent' },
  notifIcon: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  notifContent: { flex: 1 },
  notifTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
    gap: 8,
  },
  notifTitle: {
    fontSize: 14, fontWeight: '700', color: '#14171F', flex: 1,
  },
  notifTitleRead: { fontWeight: '500', color: '#6B7280' },
  notifTime: { fontSize: 11, color: '#C7CBD3', flexShrink: 0 },
  notifBody: { fontSize: 12.5, color: '#6B7280', lineHeight: 18, marginBottom: 8 },
  typePill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typePillText: { fontSize: 10, fontWeight: '800' },
  skeleton: {
    height: 76,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 8,
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#14171F' },
  emptySub: { fontSize: 13, color: '#9AA1AE' },
  inlineReply: { marginBottom: 8 },
});
