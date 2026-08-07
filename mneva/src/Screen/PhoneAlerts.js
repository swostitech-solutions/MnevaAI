import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';
import { useSocket } from '../services/socket';

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function PhoneAlerts({ navigation }) {
  const insets = useSafeAreaInsets();
  const { on } = useSocket();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await apiFetch('/api/notifications');
      setAlerts((data.notifications || []).filter(notification => notification.source === 'android'));
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  useEffect(() => on('notification:created', (alert) => {
    if (alert.source === 'android') setAlerts(previous => [alert, ...previous.filter(item => item.id !== alert.id)]);
  }), [on]);

  const openAlert = async (alert) => {
    setAlerts(previous => previous.map(item => item.id === alert.id ? { ...item, read: true } : item));
    if (!alert.read) apiFetch(`/api/notifications/${alert.id}/read`, { method: 'PATCH' }).catch(() => {});
    navigation?.navigate?.('PhoneAlertDetail', { alert });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={21} color="#14171F" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Phone alerts</Text>
          <Text style={styles.subtitle}>{alerts.length ? `${alerts.length} captured alert${alerts.length === 1 ? '' : 's'}` : 'Your useful phone notifications'}</Text>
        </View>
      </View>
      {loading ? (
        <View style={styles.loadingWrap}>{[1, 2, 3].map(item => <View key={item} style={styles.skeleton} />)}</View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, !alerts.length && styles.emptyList, { paddingBottom: insets.bottom + 28 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAlerts(true); }} tintColor="#1F9A5A" colors={['#1F9A5A']} />}
          ListEmptyComponent={<View style={styles.empty}><View style={styles.emptyIcon}><Feather name="smartphone" size={30} color="#9AA1AE" /></View><Text style={styles.emptyTitle}>No phone alerts yet</Text><Text style={styles.emptyText}>When Mneva captures a useful Android notification, it will appear here with guidance on what to do next.</Text></View>}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.alertCard, item.read && styles.alertCardRead]} onPress={() => openAlert(item)} activeOpacity={0.75}>
              <View style={[styles.alertIcon, item.priority >= 85 && styles.alertIconUrgent]}><Feather name={item.priority >= 85 ? 'alert-circle' : 'bell'} size={19} color={item.priority >= 85 ? '#B42318' : '#9A6700'} /></View>
              <View style={styles.alertCopy}>
                <View style={styles.alertTop}><Text style={styles.appName}>{item.appName || 'Android app'}</Text><Text style={styles.time}>{formatTime(item.ts)}</Text></View>
                <Text style={styles.alertTitle} numberOfLines={2}>{item.title || 'Phone alert'}</Text>
                {!!item.body && <Text style={styles.alertBody} numberOfLines={2}>{item.body}</Text>}
                <View style={styles.metaRow}><View style={[styles.priorityBadge, item.priority >= 85 && styles.priorityBadgeUrgent]}><Text style={[styles.priorityText, item.priority >= 85 && styles.priorityTextUrgent]}>{item.priority >= 85 ? 'Urgent' : item.priority >= 60 ? 'Important' : 'Review'}{item.priority ? ` · ${item.priority}` : ''}</Text></View>{!item.read && <View style={styles.newDot} />}</View>
              </View>
              <Feather name="chevron-right" size={18} color="#9AA1AE" />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', marginRight: 12 },
  headerCopy: { flex: 1 }, title: { fontSize: 22, fontWeight: '800', color: '#14171F' }, subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  list: { paddingHorizontal: 20, paddingTop: 4 }, loadingWrap: { paddingHorizontal: 20, paddingTop: 8 }, skeleton: { height: 116, borderRadius: 16, backgroundColor: '#FFFFFF', marginBottom: 10 },
  alertCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 13, marginBottom: 10, gap: 11 }, alertCardRead: { opacity: 0.68 },
  alertIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', backgroundColor: '#FFF7E6' }, alertIconUrgent: { backgroundColor: '#FEF3F2' }, alertCopy: { flex: 1 },
  alertTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, appName: { color: '#1F7A54', fontSize: 11, fontWeight: '800' }, time: { color: '#9AA1AE', fontSize: 10.5 },
  alertTitle: { color: '#14171F', fontSize: 14, fontWeight: '800', lineHeight: 19, marginTop: 3 }, alertBody: { color: '#6B7280', fontSize: 12, lineHeight: 17, marginTop: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 7 }, priorityBadge: { backgroundColor: '#FFF7E6', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 }, priorityBadgeUrgent: { backgroundColor: '#FEF3F2' }, priorityText: { color: '#9A6700', fontSize: 9.5, fontWeight: '800' }, priorityTextUrgent: { color: '#B42318' }, newDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1F9A5A' },
  emptyList: { flexGrow: 1 }, empty: { alignItems: 'center', paddingHorizontal: 35, paddingTop: 100 }, emptyIcon: { width: 70, height: 70, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: '#14171F', fontSize: 17, fontWeight: '800', marginTop: 16 }, emptyText: { color: '#6B7280', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
});
