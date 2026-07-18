import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';

const TAB_BAR_CONTENT_HEIGHT = 50;

const TOOL_ICONS = {
  schedule_event: 'calendar',
  set_reminder: 'bell',
  initiate_payment: 'credit-card',
  send_email: 'mail',
  draft_reply: 'edit-2',
  book_cab: 'navigation',
  order_food: 'shopping-bag',
  get_daily_brief: 'sun',
  get_portfolio: 'trending-up',
  get_spending_summary: 'dollar-sign',
  get_health_data: 'heart',
  query_bills: 'file-text',
  personal_search: 'search',
};

const TOOL_COLORS = {
  schedule_event: '#4FA6E8',
  set_reminder: '#F5A623',
  initiate_payment: '#1F9A5A',
  send_email: '#615FF8',
  draft_reply: '#9B72FF',
  book_cab: '#1F9A5A',
  order_food: '#F5A623',
  get_daily_brief: '#F5A623',
  get_portfolio: '#1F9A5A',
  get_spending_summary: '#1F9A5A',
  get_health_data: '#E0546E',
  query_bills: '#4FA6E8',
  personal_search: '#615FF8',
};

const TOOL_BG = {
  schedule_event: '#EAF3FD',
  set_reminder: '#FEF3C7',
  initiate_payment: '#EFFDF6',
  send_email: '#EEEDFE',
  draft_reply: '#F3EFFE',
  book_cab: '#EFFDF6',
  order_food: '#FEF3C7',
  get_daily_brief: '#FEF3C7',
  get_portfolio: '#EFFDF6',
  get_spending_summary: '#EFFDF6',
  get_health_data: '#FCEAED',
  query_bills: '#EAF3FD',
  personal_search: '#EEEDFE',
};

function statusColor(status) {
  if (status === 'completed') return '#1F9A5A';
  if (status === 'pending_approval') return '#D97706';
  if (status === 'failed') return '#E0546E';
  return '#9AA1AE';
}

function statusBg(status) {
  if (status === 'completed') return '#EFFDF6';
  if (status === 'pending_approval') return '#FEF3C7';
  if (status === 'failed') return '#FCEAED';
  return '#F3F4F6';
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function TwinDiary({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await apiFetch('/api/twin/diary');
      setEntries(data.entries || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, []);

  const completedCount = entries.filter(e => e.status === 'completed').length;
  const pendingCount = entries.filter(e => e.status === 'pending_approval').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor="#615FF8" colors={['#615FF8']} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Twin Diary</Text>
            <Text style={styles.headerSubtitle}>Signed AI action ledger</Text>
          </View>
          <View style={styles.headerBadge}>
            <Feather name="shield" size={18} color="#615FF8" />
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{loading ? '—' : entries.length}</Text>
            <Text style={styles.statLabel}>Total Actions</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#F0F1F4' }]}>
            <Text style={[styles.statValue, { color: '#1F9A5A' }]}>{loading ? '—' : completedCount}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#D97706' }]}>{loading ? '—' : pendingCount}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </View>

        {/* Security note */}
        <View style={styles.securityNote}>
          <Feather name="lock" size={13} color="#615FF8" />
          <Text style={styles.securityNoteText}>  All actions are SHA-256 signed and tamper-proof</Text>
        </View>

        {/* Entries */}
        <Text style={styles.sectionHeader}>ACTION LOG</Text>

        {loading ? (
          [1, 2, 3, 4].map(i => <View key={i} style={styles.entrySkeleton} />)
        ) : entries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="activity" size={32} color="#C7CBD3" />
            <Text style={styles.emptyTitle}>No AI actions yet</Text>
            <Text style={styles.emptySubtitle}>Actions taken by your AI twin will appear here</Text>
          </View>
        ) : (
          entries.map((entry, i) => {
            const icon = TOOL_ICONS[entry.tool] || 'zap';
            const color = TOOL_COLORS[entry.tool] || '#615FF8';
            const bg = TOOL_BG[entry.tool] || '#EEEDFE';
            const isExpanded = expanded === entry.id;

            let inputData = {};
            let resultData = {};
            try { const p = JSON.parse(entry.action || '{}'); inputData = p.input || {}; resultData = p.result || {}; } catch {}

            return (
              <TouchableOpacity
                key={entry.id || i}
                style={styles.entryCard}
                onPress={() => setExpanded(isExpanded ? null : entry.id)}
                activeOpacity={0.8}
              >
                <View style={styles.entryTop}>
                  <View style={[styles.entryIconWrap, { backgroundColor: bg }]}>
                    <Feather name={icon} size={18} color={color} />
                  </View>
                  <View style={styles.entryTextWrap}>
                    <Text style={styles.entryTool}>{(entry.tool || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
                    <Text style={styles.entryTime}>{formatTime(entry.createdAt)}</Text>
                  </View>
                  <View style={[styles.entryStatusBadge, { backgroundColor: statusBg(entry.status) }]}>
                    <Text style={[styles.entryStatusText, { color: statusColor(entry.status) }]}>
                      {(entry.status || '').replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#C7CBD3" style={{ marginLeft: 8 }} />
                </View>

                {isExpanded && (
                  <View style={styles.entryDetail}>
                    <View style={styles.entryDetailDivider} />
                    {Object.keys(inputData).length > 0 && (
                      <View style={styles.entryDetailSection}>
                        <Text style={styles.entryDetailSectionTitle}>INPUT</Text>
                        {Object.entries(inputData).map(([k, v]) => (
                          <View key={k} style={styles.entryDetailRow}>
                            <Text style={styles.entryDetailKey}>{k}</Text>
                            <Text style={styles.entryDetailVal} numberOfLines={2}>{String(v)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {Object.keys(resultData).length > 0 && (
                      <View style={styles.entryDetailSection}>
                        <Text style={styles.entryDetailSectionTitle}>RESULT</Text>
                        {Object.entries(resultData).map(([k, v]) => (
                          <View key={k} style={styles.entryDetailRow}>
                            <Text style={styles.entryDetailKey}>{k}</Text>
                            <Text style={styles.entryDetailVal} numberOfLines={2}>{String(v)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {entry.hash && (
                      <View style={styles.hashRow}>
                        <Feather name="shield" size={11} color="#9AA1AE" />
                        <Text style={styles.hashText} numberOfLines={1}>  SHA-256: {entry.hash}</Text>
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Home')}>
          <Ionicons name="home" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Priorities')}>
          <Feather name="calendar" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('AskAI')}>
          <Feather name="mic" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Space')}>
          <Feather name="folder" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Profile')}>
          <Feather name="user" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#14171F' },
  headerSubtitle: { fontSize: 13, color: '#9AA1AE', marginTop: 2 },
  headerBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EEEDFE', alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 20, marginBottom: 14 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statValue: { fontSize: 24, fontWeight: '800', color: '#14171F', marginBottom: 4 },
  statLabel: { fontSize: 11, fontWeight: '600', color: '#9AA1AE' },
  securityNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEEDFE', borderRadius: 12, padding: 12, marginBottom: 20 },
  securityNoteText: { fontSize: 12, color: '#615FF8', fontWeight: '600' },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: 12 },
  entrySkeleton: { height: 68, backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 10 },
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySubtitle: { fontSize: 13, color: '#9AA1AE', textAlign: 'center' },
  entryCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 10 },
  entryTop: { flexDirection: 'row', alignItems: 'center' },
  entryIconWrap: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  entryTextWrap: { flex: 1 },
  entryTool: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  entryTime: { fontSize: 11, color: '#9AA1AE' },
  entryStatusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  entryStatusText: { fontSize: 10, fontWeight: '800' },
  entryDetail: { marginTop: 4 },
  entryDetailDivider: { height: 1, backgroundColor: '#F0F1F4', marginVertical: 12 },
  entryDetailSection: { marginBottom: 10 },
  entryDetailSectionTitle: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5, marginBottom: 8 },
  entryDetailRow: { flexDirection: 'row', marginBottom: 6 },
  entryDetailKey: { fontSize: 12, color: '#9AA1AE', width: 90, fontWeight: '600' },
  entryDetailVal: { fontSize: 12, color: '#374151', flex: 1 },
  hashRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  hashText: { fontSize: 10, color: '#C7CBD3', flex: 1 },
  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },
});
