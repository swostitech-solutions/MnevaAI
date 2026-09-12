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

export default function GoogleTasksScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(null);

  const hasRealStatusRef = useRef(false);
  const hasRealTasksRef = useRef(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/gtasks/status');
      hasRealStatusRef.current = true;
      setConnected(res.connected);
      return res.connected;
    } catch { hasRealStatusRef.current = true; setConnected(false); return false; }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/gtasks/list');
      hasRealTasksRef.current = true;
      setTasks(res.tasks || []);
    } catch { setTasks([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Paint the last known status + tasks immediately from cache — otherwise
  // this screen shows a spinner on every single open even though nothing
  // changed since last time. checkStatus()/loadTasks() below still run right
  // after and silently replace this with fresh data; the ref guards stop a
  // slow cache read from ever clobbering real data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cachedStatus, cachedTasks] = await Promise.all([
        peekCachedResponse('/api/gtasks/status').catch(() => null),
        peekCachedResponse('/api/gtasks/list').catch(() => null),
      ]);
      if (cancelled) return;
      if (!hasRealStatusRef.current && cachedStatus) {
        setConnected(cachedStatus.connected);
      }
      if (!hasRealTasksRef.current && cachedTasks && cachedStatus?.connected !== false) {
        setTasks(cachedTasks.tasks || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    checkStatus().then(ok => { if (ok) loadTasks(); else setLoading(false); });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') checkStatus().then(ok => { if (ok) loadTasks(); });
    });
    return () => sub.remove();
  }, []);

  const handleConnect = async () => {
    try {
      const res = await apiFetch('/api/gtasks/connect?platform=mobile');
      if (res.url) await Linking.openURL(res.url);
    } catch {}
  };

  const handleDisconnect = async () => {
    try {
      await apiFetch('/api/gtasks/disconnect', { method: 'POST' });
      setConnected(false); setTasks([]);
    } catch {}
  };

  // Google's /list only ever returns non-completed tasks (showCompleted:
  // false), so once this succeeds the task won't come back on the next
  // refresh — removing it locally now just avoids the visual lag of waiting
  // for that refresh.
  const handleComplete = async (item) => {
    if (!item.listId) return;
    setTasks(prev => prev.filter(t => t.id !== item.id));
    try {
      await apiFetch(`/api/gtasks/${item.listId}/${item.id}/complete`, { method: 'PATCH' });
    } catch {
      loadTasks();
    }
  };

  if (connected === false) {
    return (
      <SafeAreaView style={styles.safe} edges={['top','left','right']}>
        <View style={styles.connectScreen}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <LinearGradient colors={['#615FF8','#4C3AED']} style={styles.connectIcon}>
            <Feather name="check-square" size={32} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.connectTitle}>Google Tasks</Text>
          <Text style={styles.connectSubtitle}>Connect Google Tasks to sync your to-dos and let Mneva AI manage them for you.</Text>
          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
            <LinearGradient colors={['#615FF8','#4C3AED']} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.connectBtnGrad}>
              <Feather name="check-square" size={18} color="#FFFFFF" />
              <Text style={styles.connectBtnText}>Connect Google Tasks</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.connectNote}>Read & write access · OAuth 2.0 · No passwords stored</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pending = tasks.filter(t => t.status !== 'completed');
  const done    = tasks.filter(t => t.status === 'completed');

  return (
    <SafeAreaView style={styles.safe} edges={['top','left','right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Google Tasks</Text>
          <Text style={styles.headerSub}>{pending.length} pending · {done.length} done</Text>
        </View>
        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.accentAlt} /></View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: tabBarHeight + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTasks(); }} tintColor={theme.accentAlt} colors={[theme.accentAlt]} />}
          ListEmptyComponent={<View style={styles.center}><Feather name="check-square" size={32} color={theme.disabled} /><Text style={styles.emptyText}>No tasks found</Text></View>}
          renderItem={({ item }) => {
            const isDone = item.status === 'completed';
            const due = item.due ? new Date(item.due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;
            return (
              <View style={[styles.taskRow, isDone && styles.taskRowDone]}>
                <TouchableOpacity
                  style={[styles.taskCheck, isDone && styles.taskCheckDone]}
                  onPress={() => !isDone && handleComplete(item)}
                  disabled={isDone}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isDone && <Feather name="check" size={12} color="#FFFFFF" />}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.taskTitle, isDone && styles.taskTitleDone]} numberOfLines={2}>{item.title}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                    {item.listTitle && <Text style={styles.taskMeta}>{item.listTitle}</Text>}
                    {due && <Text style={[styles.taskMeta, { color: theme.danger }]}>Due {due}</Text>}
                  </View>
                </View>
              </View>
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
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSub: { fontSize: 12, color: theme.faint, marginTop: 1 },
  disconnectBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.soft },
  disconnectText: { fontSize: 12, fontWeight: '700', color: theme.muted },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  taskRowDone: { opacity: 0.5 },
  taskCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.accentAlt, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  taskCheckDone: { backgroundColor: theme.accentAlt, borderColor: theme.accentAlt },
  taskTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  taskTitleDone: { textDecorationLine: 'line-through', color: theme.faint },
  taskMeta: { fontSize: 11, color: theme.faint, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, color: theme.faint, fontWeight: '600' },
  connectScreen: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 20 },
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
