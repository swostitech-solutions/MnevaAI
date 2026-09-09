import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { apiFetch, peekCachedResponse } from '../api/client';
import { useSocket } from '../services/socket';
import { onAppDataRefresh } from '../services/dataRefresh';
import { useTheme } from '../context/ThemeContext';

const TAB_BAR_CONTENT_HEIGHT = 50;

const TOKEN_MAP = {
  '#615FF8': 'accentAlt',
  '#1F9A5A': 'accent',
  '#E0546E': 'danger',
  '#4FA6E8': 'info',
  '#F5A623': 'warning',
  '#9B72FF': 'accentAlt',
};
const TINT_RGB = {
  '#EEEDFE': [129, 128, 255],
  '#EFFDF6': [52, 199, 123],
  '#FCEAED': [241, 113, 134],
  '#EAF3FD': [107, 184, 240],
  '#FEF3C7': [255, 184, 77],
  '#F3EFFE': [129, 128, 255],
  '#FFF0F3': [241, 113, 134],
};
function mColor(hex, theme) {
  const key = TOKEN_MAP[hex];
  return key ? theme[key] : hex;
}
function mBg(hex, theme) {
  if (!hex || !theme.isDark) return hex;
  const rgb = TINT_RGB[hex];
  return rgb ? `rgba(${rgb.join(',')},0.16)` : theme.surfaceAlt;
}

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

function StatCard({ icon, color, bg, label, value, theme, styles }) {
  const c = mColor(color, theme);
  const b = mBg(bg, theme);
  return (
    <View style={[styles.statCard, { backgroundColor: b }]}>
      <View style={[styles.statIconWrap, { backgroundColor: c + '22' }]}>
        <Feather name={icon} size={16} color={c} />
      </View>
      <Text style={[styles.statValue, { color: c }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, styles }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function ActionRow({ item, index, total, type, theme, styles }) {
  const rawMeta = type === 'auto'
    ? (TOOL_META[item.tool] || { icon: 'zap', color: '#9B72FF', label: 'Action' })
    : (DOMAIN_META[item.domain] || DOMAIN_META.default);
  const color = mColor(rawMeta.color, theme);
  const bg = rawMeta.bg ? mBg(rawMeta.bg, theme) : color + '18';

  return (
    <View style={[styles.actionRow, index !== total - 1 && styles.actionRowDivider]}>
      <View style={[styles.actionIconWrap, { backgroundColor: bg }]}>
        <Feather name={rawMeta.icon} size={16} color={color} />
      </View>
      <View style={styles.actionTextWrap}>
        <Text style={styles.actionTitle} numberOfLines={2}>{item.title}</Text>
        {!!item.detail && <Text style={styles.actionDetail} numberOfLines={1}>{item.detail}</Text>}
        {!!item.time && <Text style={styles.actionTime}>{item.time}</Text>}
      </View>
      <View style={[styles.actionBadge, { backgroundColor: bg }]}>
        <Text style={[styles.actionBadgeText, { color }]}>{rawMeta.label}</Text>
      </View>
    </View>
  );
}

function PendingTaskRow({ task, index, total, theme, styles }) {
  const bg = mBg('#EEEDFE', theme);
  const color = theme.accentAlt;
  return (
    <View style={[styles.actionRow, index !== total - 1 && styles.actionRowDivider]}>
      <View style={[styles.actionIconWrap, { backgroundColor: bg }]}>
        <Feather name="check-square" size={16} color={color} />
      </View>
      <View style={styles.actionTextWrap}>
        <Text style={styles.actionTitle} numberOfLines={2}>{task.title}</Text>
        {!!task.description && <Text style={styles.actionDetail} numberOfLines={1}>{task.description}</Text>}
      </View>
      <View style={[styles.actionBadge, { backgroundColor: bg }]}>
        <Text style={[styles.actionBadgeText, { color }]}>Pending</Text>
      </View>
    </View>
  );
}

export default function MorningBriefing({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  // Accept brief passed via route params (instant load) or fetch fresh
  const [brief, setBrief] = useState(route?.params?.brief || null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const hasRealBriefRef = useRef(!!route?.params?.brief);

  const loadBrief = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await apiFetch('/api/dashboard/brief');
      hasRealBriefRef.current = true;
      setBrief(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  // Paint the last known briefing immediately from cache when this screen is
  // opened without route params (e.g. via the tab bar) — otherwise it shows
  // a loading spinner on every single open even though nothing changed since
  // last time. loadBrief() below still runs right after and silently
  // replaces this with fresh data; the ref guard stops a slow cache read
  // from ever clobbering real data (including the brief passed via params).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await peekCachedResponse('/api/dashboard/brief').catch(() => null);
      if (!cancelled && !hasRealBriefRef.current && cached) {
        setBrief(cached);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Always fetch fresh data on mount — route.params may be stale
  useEffect(() => { loadBrief(); }, []);
  useEffect(() => onAppDataRefresh(() => loadBrief(true)), []);

  // A briefing screen stays mounted in the stack. Refresh whenever the user
  // returns from Ask AI so a newly created reminder or meeting is visible.
  useEffect(() => {
    const unsub = navigation?.addListener?.('focus', () => loadBrief(true));
    return () => unsub?.();
  }, [navigation]);

  const { on } = useSocket();
  useEffect(() => {
    // Delay refresh slightly so DB write has time to commit before we query
    const refresh = () => setTimeout(() => loadBrief(true), 800);
    const offTask   = on('task:created',   refresh);
    const offLedger = on('ledger:updated', refresh);
    return () => { offTask?.(); offLedger?.(); };
  }, [on]);

  // Polling fallback — re-sync every 30s in case socket events were missed
  useEffect(() => {
    const interval = setInterval(() => loadBrief(true), 30000);
    return () => clearInterval(interval);
  }, []);

  const autoCompleted = brief?.autoCompleted || [];
  const pendingActions = brief?.pendingActions || [];
  const pendingTasks   = brief?.pendingTasks   || [];
  const urgentEmails   = brief?.urgentEmails   || [];
  const suggestedMeetings = brief?.suggestedMeetings || [];
  const [meetingActed, setMeetingActed] = useState({});
  const totalItems = autoCompleted.length + pendingActions.length + pendingTasks.length + urgentEmails.length + suggestedMeetings.length;

  const handleMeetingSuggest = async (emailId, action, suggestion) => {
    setMeetingActed(prev => ({ ...prev, [emailId]: action }));
    if (action === 'approve') {
      try {
        const now = new Date();
        now.setMinutes(0, 0, 0);
        now.setHours(now.getHours() + 1);
        await apiFetch('/api/meetings/suggest-approve', {
          method: 'POST',
          body: {
            emailId: suggestion.emailId,
            senderName: suggestion.senderName,
            senderEmail: suggestion.senderEmail,
            subject: suggestion.subject,
            start: now.toISOString(),
          },
        });
      } catch {}
    }
  };

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
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Today’s Priorities</Text>
            <Text style={styles.headerSubtitle}>{getDateString()}</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => { setRefreshing(true); loadBrief(true); }}
          >
            <Feather name="refresh-cw" size={18} color={theme.accent} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={theme.accent} />
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
                <Text style={styles.heroLabel}>  TODAY’S PRIORITIES</Text>
              </View>
              <Text style={styles.heroTitle}>
                {brief?.summary || 'Your AI twin has reviewed everything for you.'}
              </Text>
              <Text style={styles.heroDate}>{getDateString()}</Text>
            </LinearGradient>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <StatCard icon="alert-circle" color="#E0546E" bg="#FCEAED" label="Urgent Mail"    value={urgentEmails.length} theme={theme} styles={styles} />
              <StatCard icon="calendar"     color="#615FF8" bg="#EEEDFE" label="Meet Requests" value={suggestedMeetings.length} theme={theme} styles={styles} />
              <StatCard icon="zap"          color="#1F9A5A" bg="#EFFDF6" label="AI Done"       value={autoCompleted.length} theme={theme} styles={styles} />
            </View>

            {/* Suggested meetings from urgent emails */}
            {suggestedMeetings.length > 0 && (
              <>
                <SectionHeader title="📅  MEETING REQUESTS" styles={styles} />
                <View style={styles.card}>
                  {suggestedMeetings.map((mtg, i) => {
                    const acted = meetingActed[mtg.emailId];
                    return (
                      <View key={mtg.emailId} style={[styles.actionRow, i !== suggestedMeetings.length - 1 && styles.actionRowDivider, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={[styles.actionIconWrap, { backgroundColor: mBg('#EEEDFE', theme) }]}>
                            <Feather name="user" size={16} color={theme.accentAlt} />
                          </View>
                          <View style={styles.actionTextWrap}>
                            <Text style={styles.actionTitle} numberOfLines={1}>{mtg.senderName} wants to meet</Text>
                            <Text style={styles.actionDetail} numberOfLines={1}>{mtg.senderEmail}</Text>
                            <Text style={styles.actionTime} numberOfLines={1}>{mtg.subject}</Text>
                          </View>
                          <View style={[styles.actionBadge, { backgroundColor: mBg('#EEEDFE', theme) }]}>
                            <Text style={[styles.actionBadgeText, { color: theme.accentAlt }]}>REQUEST</Text>
                          </View>
                        </View>
                        {!acted ? (
                          <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 50 }}>
                            <TouchableOpacity
                              style={styles.mtgDenyBtn}
                              onPress={() => handleMeetingSuggest(mtg.emailId, 'deny', mtg)}
                            >
                              <Feather name="x" size={13} color={theme.danger} />
                              <Text style={styles.mtgDenyText}>Skip</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.mtgApproveBtn}
                              onPress={() => handleMeetingSuggest(mtg.emailId, 'approve', mtg)}
                            >
                              <Feather name="calendar" size={13} color="#FFFFFF" />
                              <Text style={styles.mtgApproveText}>Schedule Meeting</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <Text style={[styles.mtgActedText, { color: acted === 'approve' ? theme.accent : theme.faint, paddingLeft: 50 }]}>
                            {acted === 'approve' ? '✓ Meeting scheduled' : '✗ Skipped'}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* Urgent emails */}
            {urgentEmails.length > 0 && (
              <>
                <SectionHeader title="🚨  URGENT EMAILS TODAY" styles={styles} />
                <View style={styles.card}>
                  {urgentEmails.map((email, i) => (
                    <View key={email.id || i} style={[styles.actionRow, i !== urgentEmails.length - 1 && styles.actionRowDivider]}>
                      <View style={[styles.actionIconWrap, { backgroundColor: mBg('#FCEAED', theme) }]}>
                        <Feather name="mail" size={16} color={theme.danger} />
                      </View>
                      <View style={styles.actionTextWrap}>
                        <Text style={styles.actionTitle} numberOfLines={1}>{email.subject}</Text>
                        <Text style={styles.actionDetail} numberOfLines={1}>From: {email.from.replace(/<.*>/, '').trim()}</Text>
                        {!!email.snippet && <Text style={styles.actionTime} numberOfLines={1}>{email.snippet}</Text>}
                      </View>
                      <View style={[styles.actionBadge, { backgroundColor: mBg('#FCEAED', theme) }]}>
                        <Text style={[styles.actionBadgeText, { color: theme.danger }]}>URGENT</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Auto-completed actions */}
            {autoCompleted.length > 0 && (
              <>
                <SectionHeader title="✅  AUTO-COMPLETED BY AI TWIN" styles={styles} />
                <View style={styles.card}>
                  {autoCompleted.map((item, i) => (
                    <ActionRow key={i} item={item} index={i} total={autoCompleted.length} type="auto" theme={theme} styles={styles} />
                  ))}
                </View>
              </>
            )}

            {/* Pending actions (notifications) */}
            {pendingActions.length > 0 && (
              <>
                <SectionHeader title="🔔  NEEDS YOUR ATTENTION" styles={styles} />
                <View style={styles.card}>
                  {pendingActions.map((item, i) => (
                    <ActionRow key={i} item={item} index={i} total={pendingActions.length} type="pending" theme={theme} styles={styles} />
                  ))}
                </View>
              </>
            )}

            {/* Pending tasks */}
            {pendingTasks.length > 0 && (
              <>
                <SectionHeader title="📋  TODAY'S PRIORITIES" styles={styles} />
                <View style={styles.card}>
                  {pendingTasks.map((task, i) => (
                    <PendingTaskRow key={task.id || i} task={task} index={i} total={pendingTasks.length} theme={theme} styles={styles} />
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
              <Feather name="info" size={14} color={theme.faint} />
              <Text style={styles.tipText}>  Pull down to refresh your briefing with the latest data from all connected sources.</Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Home')}>
          <Ionicons name="home" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Priorities')}>
          <Feather name="calendar" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('AskAI')}>
          <Feather name="mic" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Space')}>
          <Feather name="folder" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Profile')}>
          <Feather name="user" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
  refreshBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 13, color: theme.faint, marginTop: 2 },

  loadingWrap: { alignItems: 'center', paddingTop: 80, gap: 16 },
  loadingText: { fontSize: 14, color: theme.faint, fontWeight: '600' },

  heroCard: { borderRadius: 22, padding: 22, marginBottom: 16 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  heroLabel: { fontSize: 11, fontWeight: '700', color: '#E9FFF4', letterSpacing: 0.5 },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', lineHeight: 26, marginBottom: 10 },
  heroDate: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 16, padding: 14, alignItems: 'center' },
  statIconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, textAlign: 'center' },

  sectionHeader: { fontSize: 11, fontWeight: '800', color: theme.muted, letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },

  card: { backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 16, marginBottom: 16 },

  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  actionRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },
  actionIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  actionTextWrap: { flex: 1 },
  actionTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  actionDetail: { fontSize: 12, color: theme.muted, marginBottom: 2 },
  actionTime: { fontSize: 11, color: theme.faint },
  actionBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  actionBadgeText: { fontSize: 10, fontWeight: '800' },

  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 14 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: theme.text },
  emptySubtitle: { fontSize: 14, color: theme.faint, textAlign: 'center', lineHeight: 21, paddingHorizontal: 20 },

  tipCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: theme.card, borderRadius: 14, padding: 14, marginTop: 4 },
  tipText: { fontSize: 12, color: theme.faint, flex: 1, lineHeight: 18 },

  // Meeting suggestion buttons
  mtgDenyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FFF0F3' },
  mtgDenyText: { fontSize: 12, fontWeight: '700', color: theme.danger },
  mtgApproveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.accentAlt, flex: 1, justifyContent: 'center' },
  mtgApproveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  mtgActedText: { fontSize: 12, fontWeight: '600' },

  tabBar: { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
});
