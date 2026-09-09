import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking, AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch, peekCachedResponse } from '../api/client';
import { useTheme } from '../context/ThemeContext';

const TAB_BAR_CONTENT_HEIGHT = 50;
const ACCENT = '#0F9D58';

export default function SheetsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [files, setFiles]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected]   = useState(null);

  const hasRealDataRef = useRef(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/gdrive/status');
      setConnected(res.connected);
      return res.connected;
    } catch { setConnected(false); return false; }
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/gdrive/files?type=sheets');
      hasRealDataRef.current = true;
      setFiles(res.files || []);
    } catch { setFiles([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Paint the last known connection status + file list immediately from
  // cache — otherwise this screen shows a spinner on every single open even
  // though nothing has actually changed since last time. checkStatus/
  // loadFiles below still run right after and silently replace this with
  // fresh data; the ref guard stops a slow cache read from ever clobbering
  // real data that already arrived.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [statusRes, filesRes] = await Promise.all([
        peekCachedResponse('/api/gdrive/status'),
        peekCachedResponse('/api/gdrive/files?type=sheets'),
      ]);
      if (cancelled || hasRealDataRef.current) return;
      if (statusRes) setConnected(statusRes.connected);
      if (statusRes?.connected && filesRes) {
        setFiles(filesRes.files || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    checkStatus().then(ok => { if (ok) loadFiles(); else setLoading(false); });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') checkStatus().then(ok => { if (ok) loadFiles(); });
    });
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url && url.includes('drive=connected')) checkStatus().then(ok => { if (ok) loadFiles(); });
    });
    return () => { sub.remove(); linkSub.remove(); };
  }, []);

  const handleConnect = async () => {
    try {
      const res = await apiFetch('/api/gdrive/connect?platform=mobile&from=Sheets');
      if (res.url) await Linking.openURL(res.url);
    } catch {}
  };

  const handleDisconnect = async () => {
    try {
      await apiFetch('/api/gdrive/disconnect', { method: 'POST' });
      setConnected(false); setFiles([]);
    } catch {}
  };

  if (connected === false) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Sheets</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.connectScreen}>
          <LinearGradient colors={[ACCENT, '#0B7A44']} style={styles.connectIcon}>
            <Feather name="grid" size={32} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.connectTitle}>Google Sheets</Text>
          <Text style={styles.connectSubtitle}>Connect Google Drive to browse and open your Google Sheets.</Text>
          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
            <LinearGradient colors={[ACCENT, '#0B7A44']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.connectBtnGrad}>
              <Feather name="grid" size={18} color="#FFFFFF" />
              <Text style={styles.connectBtnText}>Connect Google Drive</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.connectNote}>Read-only · OAuth 2.0 · No passwords stored</Text>
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
          <Text style={styles.topBarTitle}>Sheets</Text>
          <Text style={styles.topBarSub}>{files.length} spreadsheets</Text>
        </View>
        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ACCENT} /></View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: tabBarHeight + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFiles(); }} tintColor={ACCENT} colors={[ACCENT]} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="grid" size={32} color={theme.disabled} />
              <Text style={styles.emptyText}>No spreadsheets found</Text>
            </View>
          }
          renderItem={({ item }) => {
            const date = item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            return (
              <TouchableOpacity style={styles.fileRow} onPress={() => item.webViewLink && Linking.openURL(item.webViewLink)} activeOpacity={0.7}>
                <View style={[styles.fileIcon, { backgroundColor: theme.isDark ? `${ACCENT}30` : `${ACCENT}18` }]}>
                  <Feather name="grid" size={20} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.fileMeta}>Sheet · {date}</Text>
                </View>
                <Feather name="external-link" size={14} color={theme.disabled} />
              </TouchableOpacity>
            );
          }}
        />
      )}

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
  fileRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  fileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 3 },
  fileMeta: { fontSize: 12, color: theme.faint },
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
  tabBar: { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
});
