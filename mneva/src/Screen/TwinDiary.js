import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, useWindowDimensions, Animated, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch, peekCachedResponse } from '../api/client';
import { useSocket } from '../services/socket';
import { onAppDataRefresh } from '../services/dataRefresh';
import { useTheme } from '../context/ThemeContext';
const TAB_BAR_CONTENT_HEIGHT = 50;

// Human-readable labels for the failure reasons /api/twin/verify can return —
// each one points at a specific, real check (chain linkage, hash content,
// or the Ed25519 signature) rather than a generic "verification failed".
const VERIFY_FAIL_LABELS = {
  unchained_entry: 'an entry is missing from the chain',
  chain_broken: 'the chain link between two entries doesn’t match',
  content_tampered: 'an entry’s content doesn’t match its hash',
  signature_invalid: 'an entry’s signature doesn’t match',
  network_error: 'could not reach the server',
};

const TOKEN_MAP = {
  '#4FA6E8': 'info',
  '#F5A623': 'warning',
  '#1F9A5A': 'accent',
  '#615FF8': 'accentAlt',
  '#9B72FF': 'accentAlt',
  '#E0546E': 'danger',
  '#D97706': 'warning',
};
const TINT_RGB = {
  '#EAF3FD': [107, 184, 240],
  '#FEF3C7': [255, 184, 77],
  '#EFFDF6': [52, 199, 123],
  '#EEEDFE': [129, 128, 255],
  '#F3EFFE': [129, 128, 255],
  '#FCEAED': [241, 113, 134],
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

const TOOL_ICONS = {
  schedule_event: 'calendar',
  set_reminder: 'bell',
  initiate_payment: 'credit-card',
  send_email: 'mail',
  draft_reply: 'edit-2',
  book_cab: 'navigation',
  order_food: 'shopping-bag',
  get_daily_brief: 'sun',
  get_full_summary: 'cpu',
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
  get_full_summary: '#615FF8',
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
  get_full_summary: '#EEEDFE',
  get_portfolio: '#EFFDF6',
  get_spending_summary: '#EFFDF6',
  get_health_data: '#FCEAED',
  query_bills: '#EAF3FD',
  personal_search: '#EEEDFE',
};

function actionKey(entry) {
  const input = entry?.input || {};
  if (entry?.tool === 'set_reminder') return `reminder:${String(input.message || '').trim().toLowerCase()}:${input.time || ''}`;
  if (entry?.tool === 'schedule_event') return `meeting:${String(input.title || '').trim().toLowerCase()}:${input.start || ''}`;
  return `entry:${entry?.id || ''}`;
}

function uniqueEntries(entries) {
  const seen = new Set();
  return (entries || []).filter(entry => {
    // Failed attempts are deliberately absent from the diary. The backend
    // applies the same rule, and this also prevents a real-time failed event
    // from flashing on screen before the next refresh.
    if (entry?.status === 'failed') return false;
    const key = actionKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function statusColor(status, theme) {
  if (status === 'completed') return theme.accent;
  if (status === 'pending_approval') return theme.warning;
  if (status === 'failed') return theme.danger;
  return theme.faint;
}

function statusBg(status, theme) {
  if (status === 'completed') return mBg('#EFFDF6', theme);
  if (status === 'pending_approval') return mBg('#FEF3C7', theme);
  if (status === 'failed') return mBg('#FCEAED', theme);
  return theme.isDark ? theme.surfaceAlt : '#F3F4F6';
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function formatScheduledTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// A reminder/meeting set today for tomorrow is a commitment the twin is
// still watching, not history — so it belongs under FUTURE regardless of
// when it was logged. Everything else buckets by when it actually happened:
// today is PRESENT, anything earlier is PAST.
function classifyEntry(entry, now) {
  let inputData = {};
  try { inputData = JSON.parse(entry.action || '{}').input || {}; } catch { /* malformed action blob */ }
  let targetTime = null;
  if (entry.tool === 'set_reminder' && inputData.time) targetTime = new Date(inputData.time);
  else if (entry.tool === 'schedule_event' && inputData.start) targetTime = new Date(inputData.start);
  if (targetTime && !Number.isNaN(targetTime.getTime()) && targetTime.getTime() > now.getTime()) {
    return { bucket: 'future', targetTime };
  }
  const ts = new Date(entry.ts);
  const isPresent = !Number.isNaN(ts.getTime()) && ts.toDateString() === now.toDateString();
  return { bucket: isPresent ? 'present' : 'past', targetTime: null };
}

// A small pulsing dot — the only cue on screen that says "this twin is
// live right now", next to the PRESENT section header.
function LiveDot({ styles }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.8, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <View style={styles.liveDotWrap}>
      <Animated.View style={[styles.liveDotPulse, { transform: [{ scale }] }]} />
      <View style={styles.liveDotCore} />
    </View>
  );
}

function TimelineEntry({ entry, isLast, dotColor, isExpanded, onToggle, theme, styles }) {
  const icon = TOOL_ICONS[entry.tool] || 'zap';
  const color = mColor(TOOL_COLORS[entry.tool] || '#615FF8', theme);
  const bg = mBg(TOOL_BG[entry.tool] || '#EEEDFE', theme);

  let inputData = {};
  let resultData = {};
  try { const p = JSON.parse(entry.action || '{}'); inputData = p.input || {}; resultData = p.result || {}; } catch { /* malformed action blob */ }

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineLeftCol}>
        <View style={[styles.timelineDot, { backgroundColor: dotColor || color }]} />
        {!isLast && <View style={styles.timelineLine} />}
      </View>

      <TouchableOpacity
        style={[styles.entryCard, { flex: 1, marginLeft: 10 }]}
        onPress={onToggle}
        activeOpacity={0.8}
      >
        <View style={styles.entryTop}>
          <View style={[styles.entryIconWrap, { backgroundColor: bg }]}>
            <Feather name={icon} size={18} color={color} />
          </View>
          <View style={styles.entryTextWrap}>
            <Text style={styles.entryTool}>{(entry.tool || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
            {entry.targetTime ? (
              <Text style={[styles.entryTime, { color: theme.accentAlt, fontWeight: '700' }]}>Scheduled · {formatScheduledTime(entry.targetTime)}</Text>
            ) : (
              <Text style={styles.entryTime}>{formatTime(entry.ts)}</Text>
            )}
          </View>
          <View style={[styles.entryStatusBadge, { backgroundColor: statusBg(entry.status, theme) }]}>
            <Text style={[styles.entryStatusText, { color: statusColor(entry.status, theme) }]}>
              {(entry.status || '').replace(/_/g, ' ')}
            </Text>
          </View>
          <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.disabled} style={{ marginLeft: 8 }} />
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
                <Feather name="shield" size={11} color={theme.faint} />
                <Text style={styles.hashText} numberOfLines={1}>  SHA-256: {entry.hash}</Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

function TimelineSection({ title, subtitle, icon, color, entries, expanded, onToggleEntry, emptyText, extraHeader, theme, styles }) {
  return (
    <View style={styles.timelineSection}>
      <View style={styles.timelineSectionHeader}>
        <View style={[styles.timelineSectionIconWrap, { backgroundColor: `${color}1A` }]}>
          <Feather name={icon} size={14} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.timelineSectionTitle, { color }]}>{title}</Text>
            {extraHeader}
          </View>
          <Text style={styles.timelineSectionSubtitle}>{subtitle}</Text>
        </View>
        <View style={[styles.timelineSectionCount, { backgroundColor: `${color}1A` }]}>
          <Text style={[styles.timelineSectionCountText, { color }]}>{entries.length}</Text>
        </View>
      </View>

      {entries.length === 0 ? (
        <Text style={styles.timelineEmptyText}>{emptyText}</Text>
      ) : (
        entries.map((entry, i) => (
          <TimelineEntry
            key={entry.id || i}
            entry={entry}
            isLast={i === entries.length - 1}
            dotColor={color}
            isExpanded={expanded === entry.id}
            onToggle={() => onToggleEntry(entry.id)}
            theme={theme}
            styles={styles}
          />
        ))
      )}
    </View>
  );
}

export default function TwinDiary({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [verifyState, setVerifyState] = useState(null); // null | 'checking' | { valid, checked, total, reason }
  const isMountedRef = useRef(false);

  const hasRealDataRef = useRef(false);

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await apiFetch('/api/twin/diary');
      hasRealDataRef.current = true;
      setEntries(uniqueEntries(data.entries));
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  // Re-walks the whole hash chain server-side and recomputes every hash and
  // signature from scratch — this is what actually backs the "tamper-proof"
  // claim below, rather than the claim just being static copy.
  const handleVerify = async () => {
    if (verifyState === 'checking') return;
    setVerifyState('checking');
    try {
      const result = await apiFetch('/api/twin/verify');
      setVerifyState(result);
    } catch (err) {
      setVerifyState({ valid: false, reason: 'network_error', checked: 0, total: 0 });
    }
  };

  // Paint last known diary entries immediately from cache — otherwise this
  // screen shows a blank/loading state on every open even for data that
  // hasn't changed. loadData() below still runs right after and silently
  // replaces this with fresh data; the ref guard stops a slow cache read
  // from ever clobbering real data that already arrived.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await peekCachedResponse('/api/twin/diary').catch(() => null);
      if (!cancelled && !hasRealDataRef.current && data) {
        setEntries(uniqueEntries(data.entries));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);
  useEffect(() => onAppDataRefresh(() => loadData(true)), []);

  // Re-fetch when navigating back from AskAI
  useEffect(() => {
    const unsub = navigation?.addListener?.('focus', () => {
      if (!isMountedRef.current) { isMountedRef.current = true; return; }
      loadData(true);
    });
    return () => unsub?.();
  }, [navigation]);

  const { on } = useSocket();

  // Real-time: when AI executes any action, refresh ledger immediately
  useEffect(() => {
    const off = on('ledger:updated', (entry) => {
      if (!entry?.id || entry.status === 'failed') return;
      setEntries(prev => {
        if (prev.find(e => e.id === entry.id || actionKey(e) === actionKey(entry))) return prev;
        return uniqueEntries([entry, ...prev]);
      });
    });
    return () => off?.();
  }, [on]);

  const now = new Date();
  const classified = entries.map(e => ({ ...e, ...classifyEntry(e, now) }));
  const futureEntries = classified.filter(e => e.bucket === 'future').sort((a, b) => a.targetTime - b.targetTime);
  const presentEntries = classified.filter(e => e.bucket === 'present');
  const pastEntries = classified.filter(e => e.bucket === 'past');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor={theme.accentAlt} colors={[theme.accentAlt]} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Twin Diary</Text>
            <Text style={styles.headerSubtitle}>Signed AI action ledger</Text>
          </View>
          <View style={styles.headerBadge}>
            <Feather name="shield" size={18} color={theme.accentAlt} />
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: theme.accentAlt }]}>{loading ? '—' : futureEntries.length}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.border }]}>
            <Text style={[styles.statValue, { color: theme.accent }]}>{loading ? '—' : presentEntries.length}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: theme.muted }]}>{loading ? '—' : pastEntries.length}</Text>
            <Text style={styles.statLabel}>History</Text>
          </View>
        </View>

        {/* Security note — tappable. This isn't decorative copy: it calls
            the server to recompute every entry's hash, its link to the
            previous entry, and its Ed25519 signature from scratch. */}
        <TouchableOpacity style={styles.securityNote} onPress={handleVerify} activeOpacity={0.75} disabled={verifyState === 'checking'}>
          <Feather name="lock" size={13} color={theme.accentAlt} />
          <Text style={styles.securityNoteText}>  Every action is SHA-256 hash-chained &amp; Ed25519-signed</Text>
          {verifyState === 'checking' ? (
            <ActivityIndicator size="small" color={theme.accentAlt} />
          ) : (
            <Text style={styles.securityNoteAction}>Verify</Text>
          )}
        </TouchableOpacity>

        {verifyState && verifyState !== 'checking' && (
          <View style={[styles.verifyResult, verifyState.valid ? styles.verifyResultOk : styles.verifyResultFail]}>
            <Feather name={verifyState.valid ? 'check-circle' : 'alert-triangle'} size={14} color={verifyState.valid ? theme.accent : theme.danger} />
            <Text style={[styles.verifyResultText, { color: verifyState.valid ? theme.accent : theme.danger }]}>
              {verifyState.valid
                ? `Chain intact — ${verifyState.checked} action${verifyState.checked === 1 ? '' : 's'} verified against the server's public key`
                : `Verification failed (${VERIFY_FAIL_LABELS[verifyState.reason] || verifyState.reason}) — checked ${verifyState.checked}/${verifyState.total}`}
            </Text>
          </View>
        )}

        {/* Timeline — Future → Present → Past, exactly how an agent thinks
            about its own work: what it's watching for you, what it's doing
            right now, and everything it has already done. */}
        {loading ? (
          [1, 2, 3, 4].map(i => <View key={i} style={styles.entrySkeleton} />)
        ) : entries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="activity" size={32} color={theme.disabled} />
            <Text style={styles.emptyTitle}>No AI actions yet</Text>
            <Text style={styles.emptySubtitle}>Actions taken by your AI twin will appear here</Text>
          </View>
        ) : (
          <>
            <TimelineSection
              title="UPCOMING"
              subtitle="What your twin is watching for you"
              icon="compass"
              color={theme.accentAlt}
              entries={futureEntries}
              expanded={expanded}
              onToggleEntry={(id) => setExpanded(expanded === id ? null : id)}
              emptyText="Nothing scheduled yet."
              theme={theme}
              styles={styles}
            />
            <TimelineSection
              title="TODAY"
              subtitle="Happening today"
              icon="radio"
              color={theme.accent}
              entries={presentEntries}
              expanded={expanded}
              onToggleEntry={(id) => setExpanded(expanded === id ? null : id)}
              emptyText="No activity yet today."
              extraHeader={presentEntries.length > 0 ? <LiveDot styles={styles} /> : null}
              theme={theme}
              styles={styles}
            />
            <TimelineSection
              title="HISTORY"
              subtitle="Everything your twin has already done"
              icon="archive"
              color={theme.muted}
              entries={pastEntries}
              expanded={expanded}
              onToggleEntry={(id) => setExpanded(expanded === id ? null : id)}
              emptyText="No history yet."
              theme={theme}
              styles={styles}
            />
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 13, color: theme.faint, marginTop: 2 },
  headerBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : '#EEEDFE', alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', backgroundColor: theme.card, borderRadius: 20, marginBottom: 14 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statValue: { fontSize: 24, fontWeight: '800', color: theme.text, marginBottom: 4 },
  statLabel: { fontSize: 11, fontWeight: '600', color: theme.faint },
  securityNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : '#EEEDFE', borderRadius: 12, padding: 12, marginBottom: 10 },
  securityNoteText: { flex: 1, fontSize: 12, color: theme.accentAlt, fontWeight: '600' },
  securityNoteAction: { fontSize: 12, fontWeight: '800', color: theme.accentAlt, textDecorationLine: 'underline' },
  verifyResult: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, marginBottom: 20 },
  verifyResultOk: { backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6' },
  verifyResultFail: { backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED' },
  verifyResultText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  entrySkeleton: { height: 68, backgroundColor: theme.card, borderRadius: 16, marginBottom: 10 },
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.textSecondary },
  emptySubtitle: { fontSize: 13, color: theme.faint, textAlign: 'center' },
  // Timeline sections (Future / Present / Past)
  timelineSection: { marginBottom: 24 },
  timelineSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  timelineSectionIconWrap: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  timelineSectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  timelineSectionSubtitle: { fontSize: 11, color: theme.faint, marginTop: 1 },
  timelineSectionCount: { minWidth: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  timelineSectionCountText: { fontSize: 12, fontWeight: '800' },
  timelineEmptyText: { fontSize: 12, color: theme.disabled, fontStyle: 'italic', marginLeft: 40, marginBottom: 4 },

  timelineRow: { flexDirection: 'row' },
  timelineLeftCol: { width: 20, alignItems: 'center' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 18 },
  timelineLine: { flex: 1, width: 2, backgroundColor: theme.border, marginTop: 4, marginBottom: 4, minHeight: 16 },

  liveDotWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  liveDotPulse: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: theme.accent, opacity: 0.35 },
  liveDotCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent },

  entryCard: { backgroundColor: theme.card, borderRadius: 18, padding: 14, marginBottom: 10 },
  entryTop: { flexDirection: 'row', alignItems: 'center' },
  entryIconWrap: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  entryTextWrap: { flex: 1 },
  entryTool: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  entryTime: { fontSize: 11, color: theme.faint },
  entryStatusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  entryStatusText: { fontSize: 10, fontWeight: '800' },
  entryDetail: { marginTop: 4 },
  entryDetailDivider: { height: 1, backgroundColor: theme.border, marginVertical: 12 },
  entryDetailSection: { marginBottom: 10 },
  entryDetailSectionTitle: { fontSize: 10, fontWeight: '700', color: theme.faint, letterSpacing: 0.5, marginBottom: 8 },
  entryDetailRow: { flexDirection: 'row', marginBottom: 6 },
  entryDetailKey: { fontSize: 12, color: theme.faint, width: 90, fontWeight: '600' },
  entryDetailVal: { fontSize: 12, color: theme.textSecondary, flex: 1 },
  hashRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  hashText: { fontSize: 10, color: theme.disabled, flex: 1 },
  tabBar: { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
});
