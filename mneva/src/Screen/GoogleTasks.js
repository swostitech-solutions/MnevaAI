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

export default function GoogleTasksScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(null);

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

  if (connected === false) {
    return (
      <SafeAreaView style={styles.safe} edges={['top','left','right']}>
        <View style={styles.connectScreen}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color="#14171F" />
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
          <Feather name="arrow-left" size={20} color="#14171F" />
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
        <View style={styles.center}><ActivityIndicator size="large" color="#615FF8" /></View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: tabBarHeight + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTasks(); }} tintColor="#615FF8" colors={['#615FF8']} />}
          ListEmptyComponent={<View style={styles.center}><Feather name="check-square" size={32} color="#C7CBD3" /><Text style={styles.emptyText}>No tasks found</Text></View>}
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
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#14171F' },
  headerSub: { fontSize: 12, color: '#9AA1AE', marginTop: 1 },
  disconnectBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: '#F3F4F6' },
  disconnectText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  taskRowDone: { opacity: 0.5 },
  taskCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#615FF8', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  taskCheckDone: { backgroundColor: '#615FF8', borderColor: '#615FF8' },
  taskTitle: { fontSize: 14, fontWeight: '700', color: '#14171F' },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#9AA1AE' },
  taskMeta: { fontSize: 11, color: '#9AA1AE', fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, color: '#9AA1AE', fontWeight: '600' },
  connectScreen: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 20 },
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
