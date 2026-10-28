import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking, AppState, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch, peekCachedResponse } from '../api/client';
import { useTheme } from '../context/ThemeContext';

const TAB_BAR_CONTENT_HEIGHT = 50;
const ACCENT = '#0078D4';

export default function OutlookMailScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [emails, setEmails]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected]   = useState(null);
  const [filter, setFilter]         = useState('all');
  const [openEmail, setOpenEmail]   = useState(null);
  const [openLoading, setOpenLoading] = useState(false);

  const hasRealDataRef = useRef(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/outlook/status');
      setConnected(res.connected);
      return res.connected;
    } catch { setConnected(false); return false; }
  }, []);

  const loadEmails = useCallback(async (f = filter) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/outlook/emails?filter=${f}`);
      hasRealDataRef.current = true;
      setEmails(res.emails || []);
    } catch { setEmails([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [statusRes, emailsRes] = await Promise.all([
        peekCachedResponse('/api/outlook/status').catch(() => null),
        peekCachedResponse('/api/outlook/emails?filter=all').catch(() => null),
      ]);
      if (cancelled || hasRealDataRef.current) return;
      if (statusRes) setConnected(statusRes.connected);
      if (statusRes?.connected && emailsRes) {
        setEmails(emailsRes.emails || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    checkStatus().then(ok => { if (ok) loadEmails(); else setLoading(false); });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') checkStatus().then(ok => { if (ok) loadEmails(); });
    });
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url && url.includes('outlook=connected')) checkStatus().then(ok => { if (ok) loadEmails(); });
    });
    return () => { sub.remove(); linkSub.remove(); };
  }, [filter]);

  const handleConnect = async () => {
    try {
      const res = await apiFetch('/api/outlook/connect?platform=mobile&from=OutlookMail');
      if (res.url) await Linking.openURL(res.url);
    } catch {}
  };

  const handleDisconnect = async () => {
    try {
      await apiFetch('/api/outlook/disconnect', { method: 'POST' });
      setConnected(false); setEmails([]);
    } catch {}
  };

  const openEmailDetail = async (item) => {
    setOpenLoading(true);
    setOpenEmail({ ...item, body: null });
    try {
      const full = await apiFetch(`/api/outlook/emails/${item.id}`);
      setOpenEmail({ ...item, ...full });
    } catch {
      setOpenEmail({ ...item, body: 'Could not load this email.' });
    } finally { setOpenLoading(false); }
  };

  if (connected === false) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Outlook Mail</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.connectScreen}>
          <LinearGradient colors={[ACCENT, '#005A9E']} style={styles.connectIcon}>
            <Feather name="mail" size={32} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.connectTitle}>Outlook Mail</Text>
          <Text style={styles.connectSubtitle}>Connect your Microsoft account to read and manage your Outlook inbox.</Text>
          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
            <LinearGradient colors={[ACCENT, '#005A9E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.connectBtnGrad}>
              <Feather name="mail" size={18} color="#FFFFFF" />
              <Text style={styles.connectBtnText}>Connect Outlook</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.connectNote}>One sign-in also unlocks Calendar, OneDrive, Word, Excel, PowerPoint & To Do · OAuth 2.0</Text>
        </View>
      </SafeAreaView>
    );
  }

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>Outlook Mail</Text>
          <Text style={styles.topBarSub}>{emails.length} in inbox</Text>
        </View>
        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => { setFilter(f.key); loadEmails(f.key); }}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ACCENT} /></View>
      ) : (
        <FlatList
          data={emails}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: tabBarHeight + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadEmails(); }} tintColor={ACCENT} colors={[ACCENT]} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="mail" size={32} color={theme.disabled} />
              <Text style={styles.emptyText}>No emails found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.emailRow} onPress={() => openEmailDetail(item)} activeOpacity={0.7}>
              {item.unread && <View style={styles.unreadDot} />}
              <View style={{ flex: 1 }}>
                <View style={styles.emailTopLine}>
                  <Text style={[styles.emailFrom, item.unread && styles.emailFromUnread]} numberOfLines={1}>{item.from}</Text>
                  <Text style={styles.emailTime}>{item.time}</Text>
                </View>
                <Text style={[styles.emailSubject, item.unread && styles.emailSubjectUnread]} numberOfLines={1}>{item.subject}</Text>
                <Text style={styles.emailPreview} numberOfLines={1}>{item.preview}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!openEmail} animationType="slide" onRequestClose={() => setOpenEmail(null)}>
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setOpenEmail(null)}>
              <Feather name="x" size={20} color={theme.text} />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>Email</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.detailSubject}>{openEmail?.subject}</Text>
            <Text style={styles.detailFrom}>{openEmail?.from}</Text>
            {openLoading ? (
              <ActivityIndicator size="small" color={ACCENT} style={{ marginTop: 24 }} />
            ) : (
              <Text style={styles.detailBody}>{openEmail?.body || 'No preview available.'}</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Home')}><Ionicons name="home" size={22} color={theme.faint} /><Text style={styles.tabLabel}>HOME</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Priorities')}><Feather name="calendar" size={22} color={theme.faint} /><Text style={styles.tabLabel}>PRIORITIES</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('AskAI')}><Feather name="mic" size={22} color={theme.faint} /><Text style={styles.tabLabel}>ASK AI</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Space')}><Feather name="folder" size={22} color={theme.faint} /><Text style={styles.tabLabel}>SPACE</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Profile')}><Feather name="user" size={22} color={theme.faint} /><Text style={styles.tabLabel}>PROFILE</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  topBarSub: { fontSize: 12, color: theme.faint, marginTop: 1 },
  disconnectBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.soft },
  disconnectText: { fontSize: 12, fontWeight: '700', color: theme.muted },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.borderStrong },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.muted },
  chipTextActive: { color: '#FFFFFF' },
  emailRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 8, gap: 10 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT, marginTop: 6 },
  emailTopLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  emailFrom: { fontSize: 12, fontWeight: '600', color: theme.faint, flex: 1, marginRight: 8 },
  emailFromUnread: { color: theme.text, fontWeight: '800' },
  emailTime: { fontSize: 11, color: theme.faint },
  emailSubject: { fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 2 },
  emailSubjectUnread: { fontWeight: '800' },
  emailPreview: { fontSize: 12, color: theme.faint },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, color: theme.faint, fontWeight: '600' },
  connectScreen: { flex: 1, alignItems: 'center', paddingHorizontal: 28 },
  connectIcon: { width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 32, marginBottom: 20 },
  connectTitle: { fontSize: 26, fontWeight: '800', color: theme.text, marginBottom: 10 },
  connectSubtitle: { fontSize: 14, color: theme.muted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  connectBtn: { width: '100%', borderRadius: 18, overflow: 'hidden', marginBottom: 14 },
  connectBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 17, gap: 10 },
  connectBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  connectNote: { fontSize: 12, color: theme.faint, textAlign: 'center' },
  detailSubject: { fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: 6 },
  detailFrom: { fontSize: 13, color: theme.faint, marginBottom: 20 },
  detailBody: { fontSize: 14, color: theme.text, lineHeight: 22 },
  tabBar: { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
});
