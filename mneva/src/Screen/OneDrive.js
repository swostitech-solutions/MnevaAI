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
const ACCENT = '#1490DF';

const EXT_META = {
  word: { icon: 'file-text', color: '#2B579A', label: 'Word' },
  excel: { icon: 'grid', color: '#217346', label: 'Excel' },
  powerpoint: { icon: 'monitor', color: '#C43E1C', label: 'PowerPoint' },
};

function metaForFile(name, theme) {
  const n = (name || '').toLowerCase();
  if (n.endsWith('.doc') || n.endsWith('.docx')) return EXT_META.word;
  if (n.endsWith('.xls') || n.endsWith('.xlsx')) return EXT_META.excel;
  if (n.endsWith('.ppt') || n.endsWith('.pptx')) return EXT_META.powerpoint;
  return { icon: 'file', color: theme.faint, label: 'File' };
}

export default function OneDriveScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [files, setFiles]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected]   = useState(null);
  const [filter, setFilter]         = useState('all');

  const hasRealDataRef = useRef(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/outlook/status');
      setConnected(res.connected);
      return res.connected;
    } catch { setConnected(false); return false; }
  }, []);

  const loadFiles = useCallback(async (type = filter) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/outlook/files?type=${type}`);
      hasRealDataRef.current = true;
      setFiles(res.files || []);
    } catch { setFiles([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [statusRes, filesRes] = await Promise.all([
        peekCachedResponse('/api/outlook/status').catch(() => null),
        peekCachedResponse('/api/outlook/files?type=all').catch(() => null),
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
      if (url && url.includes('outlook=connected')) checkStatus().then(ok => { if (ok) loadFiles(); });
    });
    return () => { sub.remove(); linkSub.remove(); };
  }, [filter]);

  const handleConnect = async () => {
    try {
      const res = await apiFetch('/api/outlook/connect?platform=mobile&from=OneDrive');
      if (res.url) await Linking.openURL(res.url);
    } catch {}
  };

  const handleDisconnect = async () => {
    try {
      await apiFetch('/api/outlook/disconnect', { method: 'POST' });
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
          <Text style={styles.topBarTitle}>OneDrive</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.connectScreen}>
          <LinearGradient colors={[ACCENT, '#0D47A1']} style={styles.connectIcon}>
            <Feather name="hard-drive" size={32} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.connectTitle}>OneDrive</Text>
          <Text style={styles.connectSubtitle}>Connect OneDrive to browse Word, Excel, PowerPoint and all your files.</Text>
          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
            <LinearGradient colors={[ACCENT, '#0D47A1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.connectBtnGrad}>
              <Feather name="hard-drive" size={18} color="#FFFFFF" />
              <Text style={styles.connectBtnText}>Connect OneDrive</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.connectNote}>Read-only · OAuth 2.0 · No passwords stored</Text>
        </View>
      </SafeAreaView>
    );
  }

  const FILTERS = [
    { key: 'all', label: 'All', icon: 'hard-drive' },
    { key: 'word', label: 'Word', icon: 'file-text' },
    { key: 'excel', label: 'Excel', icon: 'grid' },
    { key: 'powerpoint', label: 'PowerPoint', icon: 'monitor' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>OneDrive</Text>
          <Text style={styles.topBarSub}>{files.length} files</Text>
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
            onPress={() => { setFilter(f.key); loadFiles(f.key); }}
          >
            <Feather name={f.icon} size={13} color={filter === f.key ? '#FFFFFF' : theme.muted} />
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
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
              <Feather name="hard-drive" size={32} color={theme.disabled} />
              <Text style={styles.emptyText}>No files found</Text>
            </View>
          }
          renderItem={({ item }) => {
            const date = item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            const meta = metaForFile(item.name, theme);
            return (
              <TouchableOpacity style={styles.fileRow} onPress={() => item.url && Linking.openURL(item.url)} activeOpacity={0.7}>
                <View style={[styles.fileIcon, { backgroundColor: theme.isDark ? `${meta.color}30` : `${meta.color}18` }]}>
                  <Feather name={meta.icon} size={20} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.fileMeta}>{meta.label} · {date}</Text>
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
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.borderStrong },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.muted },
  chipTextActive: { color: '#FFFFFF' },
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
