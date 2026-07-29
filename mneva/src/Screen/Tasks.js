import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking, AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch } from '../api/client';

const TAB_BAR_CONTENT_HEIGHT = 50;
const ACCENT = '#1A73E8';

export default function TasksScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected]   = useState(null);
  const [filter, setFilter]         = useState('all');

  const checkStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/gtasks/status');
      setConnected(res.connected);
      return res.connected;
    } catch { setConnected(false); return false; }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/gtasks/list');
      setTasks(res.tasks || []);
    } catch { setTasks([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    checkStatus().then(ok => { if (ok) loadTasks(); else setLoading(false); });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') checkStatus().then(ok => { if (ok) loadTasks(); });
    });
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url && url.includes('tasks=connected')) checkStatus().then(ok => { if (ok) loadTasks(); });
    });
    return () => { sub.remove(); linkSub.remove(); };
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

  if (connected === false) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color="#14171F" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Tasks</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.connectScreen}>
          <LinearGradient colors={[ACCENT, '#1557B0']} style={styles.connectIcon}>
            <Feather name="check-square" size={32} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.connectTitle}>Google Tasks</Text>
          <Text style={styles.connectSubtitle}>Connect Google Tasks to sync your to-dos and let Mneva AI manage them for you.</Text>
          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
            <LinearGradient colors={[ACCENT, '#1557B0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.connectBtnGrad}>
              <Feather name="check-square" size={18} color="#FFFFFF" />
              <Text style={styles.connectBtnText}>Connect Google Tasks</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.connectNote}>Read & write access · OAuth 2.0 · No passwords stored</Text>
        </View>
      </SafeAreaView>
    );
  }

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'completed', label: 'Done' },
  ];

  const filtered = filter === 'pending'
    ? tasks.filter(t => t.status !== 'completed')
    : filter === 'completed'
    ? tasks.filter(t => t.status === 'completed')
    : tasks;

  const pending = tasks.filter(t => t.status !== 'completed').length;
  const done    = tasks.filter(t => t.status === 'completed').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
          <Feather name="arrow-left" size={20} color="#14171F" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>Tasks</Text>
          <Text style={styles.topBarSub}>{pending} pending · {done} done</Text>
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
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ACCENT} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: tabBarHeight + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTasks(); }} tintColor={ACCENT} colors={[ACCENT]} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="check-square" size={32} color="#C7CBD3" />
              <Text style={styles.emptyText}>No tasks found</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isDone = item.status === 'completed';
            const due = item.due ? new Date(item.due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;
            return (
              <View style={[styles.taskRow, isDone && styles.taskRowDone]}>
                <View style={[styles.taskCheck, isDone && styles.taskCheckDone]}>
                  {isDone && <Feather name="check" size={12} color="#FFFFFF" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.taskTitle, isDone && styles.taskTitleDone]} numberOfLines={2}>{item.title}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                    {item.listTitle && <Text style={styles.taskMeta}>{item.listTitle}</Text>}
                    {due && <Text style={[styles.taskMeta, { color: '#E0546E' }]}>Due {due}</Text>}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Home')}><Ionicons name="home" size={22} color="#9AA1AE" /><Text style={styles.tabLabel}>HOME</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Priorities')}><Feather name="calendar" size={22} color="#9AA1AE" /><Text style={styles.tabLabel}>PRIORITIES</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('AskAI')}><Feather name="mic" size={22} color="#9AA1AE" /><Text style={styles.tabLabel}>ASK AI</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Space')}><Feather name="folder" size={22} color="#9AA1AE" /><Text style={styles.tabLabel}>SPACE</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Profile')}><Feather name="user" size={22} color="#9AA1AE" /><Text style={styles.tabLabel}>PROFILE</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  topBarSub: { fontSize: 12, color: '#9AA1AE', marginTop: 1 },
  disconnectBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: '#F3F4F6' },
  disconnectText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E5EA' },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#FFFFFF' },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  taskRowDone: { opacity: 0.5 },
  taskCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  taskCheckDone: { backgroundColor: ACCENT, borderColor: ACCENT },
  taskTitle: { fontSize: 14, fontWeight: '700', color: '#14171F' },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#9AA1AE' },
  taskMeta: { fontSize: 11, color: '#9AA1AE', fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, color: '#9AA1AE', fontWeight: '600' },
  connectScreen: { flex: 1, alignItems: 'center', paddingHorizontal: 28 },
  connectIcon: { width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 32, marginBottom: 20 },
  connectTitle: { fontSize: 26, fontWeight: '800', color: '#14171F', marginBottom: 10 },
  connectSubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  connectBtn: { width: '100%', borderRadius: 18, overflow: 'hidden', marginBottom: 14 },
  connectBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 17, gap: 10 },
  connectBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  connectNote: { fontSize: 12, color: '#9AA1AE', textAlign: 'center' },
  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },
});
