import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../api/client';

const TAB_BAR_CONTENT_HEIGHT = 50;

const DOMAIN_META = {
  notifications: { icon: 'bell',        color: '#615FF8', bg: '#EEEDFE', label: 'Notification' },
  finance:       { icon: 'credit-card', color: '#1F9A5A', bg: '#EFFDF6', label: 'Finance' },
  health:        { icon: 'heart',       color: '#E0546E', bg: '#FCEAED', label: 'Health' },
  comms:         { icon: 'mail',        color: '#4FA6E8', bg: '#EAF3FD', label: 'Comms' },
  calendar:      { icon: 'calendar',    color: '#F5A623', bg: '#FEF3C7', label: 'Calendar' },
  reminder:      { icon: 'clock',       color: '#F5A623', bg: '#FEF3C7', label: 'Reminder' },
  default:       { icon: 'zap',         color: '#9B72FF', bg: '#F3EFFE', label: 'Action' },
};

const TOOL_META = {
  initiate_payment:  { icon: 'credit-card', color: '#1F9A5A', label: 'Payment' },
  book_cab:          { icon: 'navigation',  color: '#4FA6E8', label: 'Cab Booking' },
  order_food:        { icon: 'shopping-bag',color: '#F5A623', label: 'Food Order' },
  send_email:        { icon: 'mail',        color: '#615FF8', label: 'Email Sent' },
  draft_reply:       { icon: 'edit-2',      color: '#615FF8', label: 'Draft Reply' },
  schedule_event:    { icon: 'calendar',    color: '#E0546E', label: 'Event Scheduled' },
  set_reminder:      { icon: 'bell',        color: '#F5A623', label: 'Reminder Set' },
  get_daily_brief:   { icon: 'sun',         color: '#F5A623', label: 'Daily Brief' },
  get_portfolio:     { icon: 'trending-up', color: '#1F9A5A', label: 'Portfolio' },
  get_spending_summary: { icon: 'dollar-sign', color: '#1F9A5A', label: 'Spending' },
  get_health_data:   { icon: 'heart',       color: '#E0546E', label: 'Health Sync' },
  query_bills:       { icon: 'file-text',   color: '#9B72FF', label: 'Bills' },
  personal_search:   { icon: 'search',      color: '#4FA6E8', label: 'Search' },
};

function StatCard({ icon, color, bg, label, value }) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '22' }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function ActionRow({ item, index, total, type }) {
  const meta = type === 'auto'
    ? (TOOL_META[item.tool] || { icon: 'zap', color: '#9B72FF', label: 'Action' })
    : (DOMAIN_META[item.domain] || DOMAIN_META.default);

  return (
    <View style={[styles.actionRow, index !== total - 1 && styles.actionRowDivider]}>
      <View style={[styles.actionIconWrap, { backgroundColor: meta.bg || meta.color + '18' }]}>
        <Feather name={meta.icon} size={16} color={meta.color} />
      </View>
      <View style={styles.actionTextWrap}>
        <Text style={styles.actionTitle} numberOfLines={2}>{item.title}</Text>
        {!!item.detail && <Text style={styles.actionDetail} numberOfLines={1}>{item.detail}</Text>}
        {!!item.time && <Text style={styles.actionTime}>{item.time}</Text>}
      </View>
      <View style={[styles.actionBadge, { backgroundColor: meta.bg || meta.color + '18' }]}>
        <Text style={[styles.actionBadgeText, { color: meta.color }]}>{meta.label}</Text>
      </View>
    </View>
  );
}

function PendingTaskRow({ task, index, total }) {
  return (
    <View style={[styles.actionRow, index !== total - 1 && styles.actionRowDivider]}>
      <View style={[styles.actionIconWrap, { backgroundColor: '#EEEDFE' }]}>
        <Feather name="check-square" size={16} color="#615FF8" />
      </View>
      <View style={styles.actionTextWrap}>
        <Text style={styles.actionTitle} numberOfLines={2}>{task.title}</Text>
        {!!task.description && <Text style={styles.actionDetail} numberOfLines={1}>{task.description}</Text>}
      </View>
      <View style={[styles.actionBadge, { backgroundColor: '#EEEDFE' }]}>
        <Text style={[styles.actionBadgeText, { color: '#615FF8' }]}>Pending</Text>
      </View>
    </View>
  );
}

export default function MorningBriefing({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  // Accept brief passed via route params (instant load) or fetch fresh
  const [brief, setBrief] = useState(route?.params?.brief || null);
  const [loading, setLoading] = useState(!route?.params?.brief);
  const [refreshing, setRefreshing] = useState(false);

  const loadBrief = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await apiFetch('/api/dashboard/brief');
      setBrief(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { if (!brief) loadBrief(); }, []);

  const autoCompleted = brief?.autoCompleted || [];
  const pendingActions = brief?.pendingActions || [];
  const pendingTasks   = brief?.pendingTasks   || [];
  const totalItems = autoCompleted.length + pendingActions.length + pendingTasks.length;

  const getDateString = () => new Date().toLocaleDateString('en-IN', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadBrief(true); }}
            tintColor="#1F9A5A"
            colors={['#1F9A5A']}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color="#14171F" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Morning Briefing</Text>
            <Text style={styles.headerSubtitle}>{getDateString()}</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => { setRefreshing(true); loadBrief(true); }}
          >
            <Feather name="refresh-cw" size={18} color="#1F9A5A" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#1F9A5A" />
            <Text style={styles.loadingText}>Loading your briefing…</Text>
          </View>
        ) : (
          <>
            {/* Hero gradient card */}
            <LinearGradient
              colors={['#27AE6A', '#1F7A54']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroLabelRow}>
                <Feather name="sun" size={13} color="#E9FFF4" />
                <Text style={styles.heroLabel}>  AI TWIN SUMMARY</Text>
              </View>
              <Text style={styles.heroTitle}>
                {brief?.summary || 'Your AI twin has reviewed everything for you.'}
              </Text>
              <Text style={styles.heroDate}>{getDateString()}</Text>
            </LinearGradient>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <StatCard icon="zap"         color="#1F9A5A" bg="#EFFDF6" label="Auto Done"  value={autoCompleted.length} />
              <StatCard icon="clock"       color="#F5A623" bg="#FEF3C7" label="Pending"    value={pendingActions.length + pendingTasks.length} />
              <StatCard icon="list"        color="#615FF8" bg="#EEEDFE" label="Total Items" value={totalItems} />
            </View>

            {/* Auto-completed actions */}
            {autoCompleted.length > 0 && (
              <>
                <SectionHeader title="✅  AUTO-COMPLETED BY AI TWIN" />
                <View style={styles.card}>
                  {autoCompleted.map((item, i) => (
                    <ActionRow key={i} item={item} index={i} total={autoCompleted.length} type="auto" />
                  ))}
                </View>
              </>
            )}

            {/* Pending actions (notifications) */}
            {pendingActions.length > 0 && (
              <>
                <SectionHeader title="🔔  NEEDS YOUR ATTENTION" />
                <View style={styles.card}>
                  {pendingActions.map((item, i) => (
                    <ActionRow key={i} item={item} index={i} total={pendingActions.length} type="pending" />
                  ))}
                </View>
              </>
            )}

            {/* Pending tasks */}
            {pendingTasks.length > 0 && (
              <>
                <SectionHeader title="📋  TODAY'S PENDING TASKS" />
                <View style={styles.card}>
                  {pendingTasks.map((task, i) => (
                    <PendingTaskRow key={task.id || i} task={task} index={i} total={pendingTasks.length} />
                  ))}
                </View>
              </>
            )}

            {/* Empty state */}
            {totalItems === 0 && (
              <View style={styles.emptyWrap}>
                <LinearGradient colors={['#27AE6A', '#1F7A54']} style={styles.emptyIconWrap}>
                  <Feather name="check-circle" size={32} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.emptyTitle}>All clear!</Text>
                <Text style={styles.emptySubtitle}>Your AI twin has nothing pending for you right now. Enjoy your day.</Text>
              </View>
            )}

            {/* Footer tip */}
            <View style={styles.tipCard}>
              <Feather name="info" size={14} color="#9AA1AE" />
              <Text style={styles.tipText}>  Pull down to refresh your briefing with the latest data from all connected sources.</Text>
            </View>
          </>
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

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  refreshBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#EFFDF6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#14171F' },
  headerSubtitle: { fontSize: 13, color: '#9AA1AE', marginTop: 2 },

  loadingWrap: { alignItems: 'center', paddingTop: 80, gap: 16 },
  loadingText: { fontSize: 14, color: '#9AA1AE', fontWeight: '600' },

  heroCard: { borderRadius: 22, padding: 22, marginBottom: 16 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  heroLabel: { fontSize: 11, fontWeight: '700', color: '#E9FFF4', letterSpacing: 0.5 },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', lineHeight: 26, marginBottom: 10 },
  heroDate: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 16, padding: 14, alignItems: 'center' },
  statIconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', textAlign: 'center' },

  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#6B7280', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },

  card: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, marginBottom: 16 },

  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  actionRowDivider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  actionIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  actionTextWrap: { flex: 1 },
  actionTitle: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  actionDetail: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  actionTime: { fontSize: 11, color: '#9AA1AE' },
  actionBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  actionBadgeText: { fontSize: 10, fontWeight: '800' },

  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 14 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#14171F' },
  emptySubtitle: { fontSize: 14, color: '#9AA1AE', textAlign: 'center', lineHeight: 21, paddingHorizontal: 20 },

  tipCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginTop: 4 },
  tipText: { fontSize: 12, color: '#9AA1AE', flex: 1, lineHeight: 18 },

  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },
});
