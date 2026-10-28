import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Linking, AppState, Alert, Modal, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch, peekCachedResponse } from '../api/client';
import { useTheme } from '../context/ThemeContext';

const TAB_BAR_CONTENT_HEIGHT = 50;
const ACCENT = '#9B72FF';

export default function SlackScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [connected, setConnected] = useState(null);
  const [team, setTeam] = useState(null);
  const [sending, setSending] = useState(false);
  const [channels, setChannels] = useState([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openChannel, setOpenChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const hasRealStatusRef = useRef(false);

  const loadChannels = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setChannelsLoading(true);
    try {
      const res = await apiFetch('/api/slack/channels');
      setChannels(res.channels || []);
    } catch { setChannels([]); }
    finally { setChannelsLoading(false); setRefreshing(false); }
  }, []);

  const openChannelMessages = async (channel) => {
    setOpenChannel(channel);
    setMessagesLoading(true);
    try {
      const res = await apiFetch(`/api/slack/channels/${channel.id}/messages`);
      setMessages(res.messages || []);
    } catch { setMessages([]); }
    finally { setMessagesLoading(false); }
  };

  const checkStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/slack/status');
      hasRealStatusRef.current = true;
      setConnected(res.connected);
      setTeam(res.team || null);
      return res.connected;
    } catch { hasRealStatusRef.current = true; setConnected(false); return false; }
  }, []);

  // Paint the last known status immediately from cache — otherwise this
  // screen shows a spinner on every single open even though nothing
  // changed since last time. checkStatus() below still runs right after
  // and silently replaces this with fresh data; the ref guard stops a
  // slow cache read from ever clobbering real data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await peekCachedResponse('/api/slack/status').catch(() => null);
      if (!cancelled && !hasRealStatusRef.current && cached) {
        setConnected(cached.connected);
        setTeam(cached.team || null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { checkStatus().then(ok => { if (ok) loadChannels(); }); }, [checkStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') checkStatus().then(ok => { if (ok) loadChannels(); });
    });
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url && url.includes('slack=connected')) checkStatus().then(ok => { if (ok) loadChannels(); });
    });
    return () => { sub.remove(); linkSub.remove(); };
  }, [checkStatus]);

  const handleConnect = async () => {
    try {
      const res = await apiFetch('/api/slack/connect?platform=mobile');
      if (res.url) await Linking.openURL(res.url);
    } catch {}
  };

  const handleDisconnect = async () => {
    try {
      await apiFetch('/api/slack/disconnect', { method: 'POST' });
      setConnected(false); setTeam(null);
    } catch {}
  };

  const handleSendTest = async () => {
    setSending(true);
    try {
      await apiFetch('/api/slack/send-test', { method: 'POST' });
      Alert.alert('Sent', 'Check Slack — Mneva AI just DM\'d you.');
    } catch (err) {
      Alert.alert('Could not send', err.message || 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  if (connected === false) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Slack</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.connectScreen}>
          <LinearGradient colors={[ACCENT, '#7C5CE8']} style={styles.connectIcon}>
            <Feather name="hash" size={32} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.connectTitle}>Slack</Text>
          <Text style={styles.connectSubtitle}>Connect Slack so Mneva can send you alerts and reminders there.</Text>
          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
            <LinearGradient colors={[ACCENT, '#7C5CE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.connectBtnGrad}>
              <Feather name="hash" size={18} color="#FFFFFF" />
              <Text style={styles.connectBtnText}>Connect Slack</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.connectNote}>OAuth 2.0 · No passwords stored</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>Slack</Text>
          <Text style={styles.topBarSub}>{connected === null ? 'Checking…' : team || 'Connected'}</Text>
        </View>
        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {connected === null ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ACCENT} /></View>
      ) : (
        <FlatList
          data={channels}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: tabBarHeight + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadChannels(true); }} tintColor={ACCENT} colors={[ACCENT]} />}
          ListHeaderComponent={
            <View>
              <View style={styles.statusCard}>
                <View style={[styles.statusIcon, { backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE' }]}>
                  <Feather name="check-circle" size={20} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitle}>Connected to {team || 'your workspace'}</Text>
                  <Text style={styles.statusSub}>Mneva AI can DM you alerts & reminders here.</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.testBtn} disabled={sending} onPress={handleSendTest}>
                <LinearGradient colors={[ACCENT, '#7C5CE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.testBtnGrad}>
                  {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="send" size={16} color="#FFFFFF" />}
                  <Text style={styles.testBtnText}>{sending ? 'Sending…' : 'Send a test message'}</Text>
                </LinearGradient>
              </TouchableOpacity>

              <Text style={styles.sectionLabel}>CHANNELS</Text>
            </View>
          }
          ListEmptyComponent={
            channelsLoading ? (
              <ActivityIndicator size="small" color={ACCENT} style={{ marginTop: 20 }} />
            ) : (
              <View style={styles.center}>
                <Feather name="hash" size={28} color={theme.disabled} />
                <Text style={styles.emptyText}>No public channels found</Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.channelRow} onPress={() => openChannelMessages(item)} activeOpacity={0.7}>
              <View style={[styles.channelIcon, { backgroundColor: theme.isDark ? 'rgba(155,114,255,0.16)' : '#F3EFFE' }]}>
                <Feather name="hash" size={16} color={ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.channelName}>{item.name}</Text>
                <Text style={styles.channelMeta}>{item.memberCount} members{item.isMember ? '' : ' · tap to join & read'}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={theme.disabled} />
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!openChannel} animationType="slide" onRequestClose={() => setOpenChannel(null)}>
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setOpenChannel(null)}>
              <Feather name="x" size={20} color={theme.text} />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>#{openChannel?.name}</Text>
            <View style={{ width: 40 }} />
          </View>
          {messagesLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={ACCENT} /></View>
          ) : (
            <FlatList
              data={messages}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Feather name="message-circle" size={28} color={theme.disabled} />
                  <Text style={styles.emptyText}>No recent messages</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.messageRow}>
                  <View style={styles.messageTopLine}>
                    <Text style={styles.messageUser}>{item.user}</Text>
                    <Text style={styles.messageTime}>{item.time}</Text>
                  </View>
                  <Text style={styles.messageText}>{item.text}</Text>
                </View>
              )}
            />
          )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.card, borderRadius: 16, padding: 16, marginBottom: 16 },
  statusIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  statusSub: { fontSize: 12, color: theme.faint },
  testBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  testBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  testBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  footNote: { fontSize: 12, color: theme.faint, textAlign: 'center' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: theme.faint, letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  emptyText: { fontSize: 14, color: theme.faint, fontWeight: '600' },
  channelRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  channelIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  channelName: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  channelMeta: { fontSize: 12, color: theme.faint },
  messageRow: { backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 8 },
  messageTopLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  messageUser: { fontSize: 13, fontWeight: '700', color: ACCENT },
  messageTime: { fontSize: 11, color: theme.faint },
  messageText: { fontSize: 14, color: theme.text, lineHeight: 20 },
  connectScreen: { flex: 1, alignItems: 'center', paddingHorizontal: 28 },
  connectIcon: { width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 32, marginBottom: 20 },
  connectTitle: { fontSize: 26, fontWeight: '800', color: theme.text, marginBottom: 10 },
  connectSubtitle: { fontSize: 14, color: theme.muted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  connectBtn: { width: '100%', borderRadius: 18, overflow: 'hidden', marginBottom: 14 },
  connectBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 17, gap: 10 },
  connectBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  connectNote: { fontSize: 12, color: theme.faint, textAlign: 'center' },
  tabBar: { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
});
