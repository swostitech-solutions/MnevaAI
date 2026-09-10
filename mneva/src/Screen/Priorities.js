import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, ActivityIndicator, useWindowDimensions, RefreshControl, Animated,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { apiFetch, peekCachedResponse } from "../api/client";
import { useSocket } from '../services/socket';
import { onAppDataRefresh } from '../services/dataRefresh';
import { useTheme } from '../context/ThemeContext';
const TAB_BAR_CONTENT_HEIGHT = 50;
const TABS = ["TODAY", "UPCOMING", "MEETINGS"];

// A calendar entry is only a joinable, real-time meeting when Calendar gave
// us an actual web-conference URL.  A title such as "Lunch" or "Meet up" is
// still a reminder/appointment, not a meeting the user can join in the app.
function isJoinableMeetingLink(link) {
  return typeof link === 'string' && /^https?:\/\/\S+$/i.test(link.trim());
}

// The Today tab is a calendar-day view, not an "up to now" history.  Keeping
// the start boundary prevents yesterday's reminders and tasks from returning
// after midnight.
function isToday(value, todayStart, todayEnd) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= todayStart && date <= todayEnd;
}

function fmtMeeting(start, end) {
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const date = s.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const time = s.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const dur = e ? Math.round((e - s) / 60000) : null;
  const durStr = dur
    ? dur >= 60 ? `${Math.floor(dur / 60)}h${dur % 60 ? ` ${dur % 60}m` : ""}` : `${dur}m`
    : "";
  return { date, time, durStr };
}

function TaskCard({ task, onCheck, styles }) {
  const done = task.status === "COMPLETED";
  return (
    <View style={[styles.card, done && styles.cardDone]}>
      <TouchableOpacity
        style={[styles.checkCircle, done && styles.checkCircleActive]}
        onPress={() => onCheck(task)}
      >
        {done && <Feather name="check" size={13} color="#FFFFFF" />}
      </TouchableOpacity>
      <View style={styles.cardTextWrap}>
        <Text style={[styles.cardTitle, done && styles.cardTitleChecked]} numberOfLines={2}>
          {task.title}
        </Text>
        {!!task.description && (
          <Text style={styles.cardSubtitle} numberOfLines={1}>{task.description}</Text>
        )}
      </View>
    </View>
  );
}

// Flattens the cross-module summary (backend's get_full_summary aggregator)
// into one common shape so bills/medication refills/pet reminders/family
// items/subscriptions/loan-EMIs can all render as the same kind of card
// alongside the priorities the user set manually. Urgent emails and pending
// tasks are deliberately left out here — they already have their own
// sections above, sourced from the same underlying data.
function buildAutoItems(summary) {
  if (!summary?.sections) return [];
  const items = [];
  const push = (id, title, subtitle, date, icon, color, category) => {
    items.push({ id, title, subtitle, date: date || null, icon, color, category });
  };
  const { communications, family, finance } = summary.sections;

  (communications?.unreadAlerts || []).forEach((a, i) =>
    push(`alert-${i}`, a.title, 'Phone alert', null, 'bell', '#E0546E', 'Alert'));
  (family?.tasks || []).forEach((t, i) =>
    push(`famtask-${i}`, t.title, `Family task${t.priority ? ' · ' + t.priority : ''}`, t.dueDate, 'users', '#615FF8', 'Family'));
  (family?.medicationRefills || []).forEach((m, i) =>
    push(`med-${i}`, `${m.medName} refill`, m.parent, m.refillDate, 'plus-square', '#E0546E', 'Medication'));
  (family?.petReminders || []).forEach((p, i) =>
    push(`pet-${i}`, p.title, 'Pet reminder', p.remindAt, 'heart', '#F5A623', 'Pet'));
  (family?.upcoming || []).forEach((f, i) =>
    push(`fam-${i}`, `${f.type} (${f.domain})`, 'Family', f.remindAt, 'home', '#9B72FF', 'Family'));
  (finance?.upcomingBills || []).forEach((b, i) =>
    push(`bill-${i}`, `${b.name} bill due`, `₹${(b.amount || 0).toLocaleString('en-IN')}`, b.dueDate, 'file-text', '#F5A623', 'Finance'));
  (finance?.upcomingPayments || []).forEach((p, i) =>
    push(`pay-${i}`, `${p.name} payment`, `₹${(p.amount || 0).toLocaleString('en-IN')}`, p.dueDate, 'credit-card', '#4FA6E8', 'Finance'));
  (finance?.upcomingSubscriptions || []).forEach((s, i) =>
    push(`sub-${i}`, `${s.name} renewal`, `₹${(s.amount || 0).toLocaleString('en-IN')}`, s.dueDate, 'repeat', '#9B72FF', 'Finance'));
  (finance?.maturingFixedDeposits || []).forEach((f, i) =>
    push(`fd-${i}`, `${f.name} matures`, `₹${(f.amount || 0).toLocaleString('en-IN')}`, f.maturityDate, 'lock', '#06B6D4', 'Finance'));

  return items;
}

function fmtAutoDate(d) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// A small pulsing dot — the same "this agent is live" cue used on the Twin
// Diary screen, so the two feel like one product rather than a to-do list
// bolted onto an AI feature.
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

// Auto-detected items render as a connected timeline (dot + line per row),
// matching the Twin Diary screen's visual language — this is the agent's
// own analysis, not something the user typed in, so it reads differently
// from a plain task card.
function AutoTimelineRow({ item, isLast, styles }) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineLeftCol}>
        <View style={[styles.timelineDot, { backgroundColor: item.color }]} />
        {!isLast && <View style={styles.timelineLine} />}
      </View>
      <View style={[styles.autoItemCard, { borderLeftColor: item.color, flex: 1, marginLeft: 10 }]}>
        <View style={[styles.autoItemIconWrap, { backgroundColor: `${item.color}1A` }]}>
          <Feather name={item.icon} size={16} color={item.color} />
        </View>
        <View style={styles.autoItemBody}>
          <Text style={styles.autoItemTitle} numberOfLines={1}>{item.title}</Text>
          {!!item.subtitle && <Text style={styles.autoItemSubtitle} numberOfLines={1}>{item.subtitle}</Text>}
        </View>
        {!!item.date && <Text style={styles.autoItemDate}>{fmtAutoDate(item.date)}</Text>}
      </View>
    </View>
  );
}

// Section labels render as a soft tinted pill instead of plain uppercase
// text — a small touch that reads as a designed product surface rather than
// a bare list of headings.
function SectionHeader({ icon, label, color, tint, styles }) {
  return (
    <View style={[styles.sectionPill, { backgroundColor: tint }]}>
      <Feather name={icon} size={12} color={color} />
      <Text style={[styles.sectionPillText, { color }]}>{label}</Text>
    </View>
  );
}

function MeetingCard({ m, done, confirmedPending, onCheck, onConfirmPending, styles, theme }) {
  const { date, time, durStr } = fmtMeeting(m.start, m.end);
  const attendees = Array.isArray(m.attendees) ? m.attendees : [];
  const isRealtimeMeeting = isJoinableMeetingLink(m.meetLink);
  const isReminder = !isRealtimeMeeting;
  // Once the scheduled time has passed, a plain checkbox is passive — the
  // agent should proactively ask whether it actually happened, rather than
  // wait for the user to remember to tap it. Once answered "No", it settles
  // into a persistent "still pending" tag instead of re-asking every render.
  const isPast = new Date(m.start).getTime() < Date.now();
  const awaitingConfirmation = isPast && !done && !confirmedPending;

  return (
    <View style={[styles.meetCard, done && styles.cardDone, awaitingConfirmation && styles.meetCardOverdue]}>
      <View style={styles.meetTopSection}>
        {awaitingConfirmation ? (
          <View style={styles.confirmIconWrap}>
            <Feather name="help-circle" size={14} color={theme.warning} />
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.checkCircle, done && styles.checkCircleActive]}
            onPress={() => onCheck(m)}
            disabled={done}
          >
            {done && <Feather name="check" size={13} color="#FFFFFF" />}
          </TouchableOpacity>
        )}
        <View style={styles.meetBody}>
          <View style={styles.meetTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, marginRight: 8 }}>
              <Feather name={isReminder ? 'bell' : 'video'} size={13} color={isReminder ? theme.warning : theme.danger} />
              <Text style={[styles.meetTitle, done && styles.cardTitleChecked]} numberOfLines={1}>
                {m.title}
              </Text>
            </View>
            {isRealtimeMeeting && !done && (
              <TouchableOpacity style={styles.joinBtn} onPress={() => Linking.openURL(m.meetLink.trim())}>
                <Feather name="video" size={12} color="#FFFFFF" />
                <Text style={styles.joinBtnText}>Join</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.meetMetaRow}>
            <Feather name="clock" size={11} color={theme.faint} />
            <Text style={styles.meetMeta}> {date}  ·  {time}{durStr ? `  ·  ${durStr}` : ""}</Text>
          </View>
          {isRealtimeMeeting && attendees.length > 0 && (
            <View style={styles.meetMetaRow}>
              <Feather name="users" size={11} color={theme.faint} />
              <Text style={styles.meetAttendees} numberOfLines={1}> {attendees.join(", ")}</Text>
            </View>
          )}
          {!!m.description && (
            <Text style={styles.meetDesc} numberOfLines={2}>{m.description}</Text>
          )}
        </View>
      </View>

      {awaitingConfirmation && (
        <View style={styles.confirmRow}>
          <Text style={styles.confirmPrompt}>Did you complete this?</Text>
          <View style={styles.confirmBtnRow}>
            <TouchableOpacity style={styles.confirmNoBtn} onPress={() => onConfirmPending(m)} activeOpacity={0.8}>
              <Text style={styles.confirmNoText}>No, pending</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmYesBtn} onPress={() => onCheck(m)} activeOpacity={0.85}>
              <Feather name="check" size={12} color="#FFFFFF" />
              <Text style={styles.confirmYesText}>Yes, done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {!awaitingConfirmation && confirmedPending && !done && (
        <View style={styles.pendingTag}>
          <Feather name="clock" size={10} color={theme.warning} />
          <Text style={styles.pendingTagText}>Still pending · past due</Text>
        </View>
      )}
    </View>
  );
}

export default function Priorities({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [activeTab, setActiveTab] = useState("TODAY");
  const [tasks, setTasks] = useState([]);
  const [allCalendarItems, setAllCalendarItems] = useState([]);
  const [doneMeetingIds, setDoneMeetingIds] = useState(new Set());
  const [confirmedPendingIds, setConfirmedPendingIds] = useState(new Set());
  const [urgentEmails, setUrgentEmails] = useState([]);
  const [suggestedMeetings, setSuggestedMeetings] = useState([]);
  const [meetingActed, setMeetingActed] = useState({});
  const [autoSummary, setAutoSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isMountedRef = useRef(false);

  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const horizontalPad = width < 360 ? 16 : 20;

  // Shared by the real fetch below and by the cache-hydration pass before
  // it, so a returning user sees last known-good tasks/meetings immediately
  // instead of a blank/loading screen for however long the network
  // round-trip takes.
  const hasRealDataRef = useRef(false);
  const hasRealBriefRef = useRef(false);
  const hasRealSummaryRef = useRef(false);

  const applyTasksData = ({ taskRes, meetRes, doneRes }) => {
    const allTasks = Array.isArray(taskRes) ? taskRes : [];
    setTasks(allTasks.filter(t => !t.title?.startsWith("meeting_done:")));
    setAllCalendarItems(Array.isArray(meetRes) ? meetRes : meetRes?.meetings || []);
    setDoneMeetingIds(new Set(doneRes?.ids || []));
  };

  const applyBriefData = (brief) => {
    setUrgentEmails(brief?.urgentEmails || []);
    setSuggestedMeetings(brief?.suggestedMeetings || []);
  };

  // Paint the last known tasks/meetings/brief immediately from cache —
  // otherwise this screen shows a blank/loading state on every single open
  // even though nothing has actually changed since last time. loadData()
  // below still runs right after and silently replaces this with fresh
  // data; the ref guards stop a slow cache read from ever clobbering real
  // data that already arrived.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [taskRes, meetRes, doneRes, brief, summary] = await Promise.all([
        peekCachedResponse("/api/tasks"),
        peekCachedResponse("/api/calendar/meetings"),
        peekCachedResponse("/api/tasks/meeting-done"),
        peekCachedResponse("/api/dashboard/brief"),
        peekCachedResponse("/api/dashboard/full-summary"),
      ]);
      if (cancelled) return;
      if (!hasRealDataRef.current && (taskRes || meetRes || doneRes)) {
        applyTasksData({ taskRes: taskRes || [], meetRes: meetRes || [], doneRes: doneRes || { ids: [] } });
        setLoading(false);
      }
      if (!hasRealBriefRef.current && brief) {
        applyBriefData(brief);
      }
      if (!hasRealSummaryRef.current && summary) {
        setAutoSummary(summary);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    // Started alongside the batch below instead of after it — neither
    // depends on the tasks/meetings result, so waiting for them first only
    // added a full extra serial round-trip to every screen load.
    const briefPromise = apiFetch("/api/dashboard/brief").catch(() => null);
    const summaryPromise = apiFetch("/api/dashboard/full-summary").catch(() => null);
    try {
      // These feeds are supplemental to tasks.  Do not blank the whole
      // Priorities screen when Calendar or the meeting-completion feed is
      // temporarily unavailable.
      const [taskResult, meetingResult, doneResult] = await Promise.allSettled([
        apiFetch("/api/tasks"),
        apiFetch("/api/calendar/meetings"),
        apiFetch("/api/tasks/meeting-done"),
      ]);
      const taskRes = taskResult.status === 'fulfilled' ? taskResult.value : [];
      const meetRes = meetingResult.status === 'fulfilled' ? meetingResult.value : [];
      const doneRes = doneResult.status === 'fulfilled' ? doneResult.value : { ids: [] };
      hasRealDataRef.current = true;
      applyTasksData({ taskRes, meetRes, doneRes });
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
    const brief = await briefPromise;
    if (brief) {
      hasRealBriefRef.current = true;
      applyBriefData(brief);
    }
    const summary = await summaryPromise;
    if (summary) {
      hasRealSummaryRef.current = true;
      setAutoSummary(summary);
    }
  }, []);

  useEffect(() => { loadData(); }, []);
  useEffect(() => onAppDataRefresh(() => loadData(true)), [loadData]);

  const { on } = useSocket();
  useEffect(() => {
    const refresh = () => loadData(true);
    const offTask    = on('task:created',   refresh);
    const offMeeting = on('meeting:created', refresh);
    // ledger:updated fires after every AI tool call — use it as a reliable
    // fallback trigger so reminders show even if task:created was missed
    const offLedger  = on('ledger:updated', () => setTimeout(() => loadData(true), 800));
    return () => { offTask?.(); offMeeting?.(); offLedger?.(); };
  }, [on, loadData]);

  // Polling fallback — re-sync every 30s in case socket events were missed
  useEffect(() => {
    const interval = setInterval(() => loadData(true), 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Re-fetch on screen focus (skip first mount focus)
  useEffect(() => {
    const unsubFocus = navigation?.addListener?.('focus', () => {
      if (!isMountedRef.current) { isMountedRef.current = true; return; }
      loadData(true);
    });
    return () => unsubFocus?.();
  }, [navigation, loadData]);

  // Derived task lists
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  // Keep actual tasks separate, but surface reminders alongside the date they
  // are due instead of making users switch to a dedicated reminders tab.
  // The Meetings tab is intentionally limited to entries that can actually
  // be joined. Calendar appointments without a live-conference URL belong in
  // Today/Upcoming as reminders, regardless of their stored source/kind.
  const meetings = allCalendarItems.filter(m => isJoinableMeetingLink(m.meetLink));
  const reminders = allCalendarItems.filter(m => !isJoinableMeetingLink(m.meetLink));
  const calendarReminderTitles = new Set(reminders.map(m => (m.title || '').trim().toLowerCase()));
  // Reminders are also persisted as pending tasks. Keep their task record as
  // a fallback when the calendar feed is slow or unavailable, but avoid
  // rendering it twice once its dated calendar record has arrived.
  const pendingTasks = tasks.filter(t => {
    if (t.status !== 'PENDING' || !isToday(t.createdAt, todayStart, todayEnd) || /^Meeting · /i.test(t.description || '')) return false;
    const isReminderTask = /^Reminder ·/i.test(t.description || '');
    return !isReminderTask || !calendarReminderTitles.has((t.title || '').trim().toLowerCase());
  });
  const todayReminders = reminders
    .filter(m => isToday(m.start, todayStart, todayEnd))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  // Upcoming means a later calendar date — not a later time today. Include
  // reminders here so they appear on their due date alongside commitments.
  const upcomingItems = allCalendarItems
    .filter(m => new Date(m.start) > todayEnd)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  // Everything the cross-module analysis (get_full_summary) surfaced —
  // bills, EMIs, subscriptions, medication refills, pet reminders, family
  // items — split the same way as calendar items: no date or due today vs.
  // due on a later date.
  const autoItems = buildAutoItems(autoSummary);
  const autoToday = autoItems.filter(it => !it.date || isToday(it.date, todayStart, todayEnd));
  const autoUpcoming = autoItems
    .filter(it => it.date && new Date(it.date) > todayEnd)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

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
    setTimeout(() => {
      setSuggestedMeetings(prev => prev.filter(m => m.emailId !== emailId));
    }, 800);
  };

  const handleCheckTask = async (task) => {
    const newStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    try { await apiFetch(`/api/tasks/${task.id}`, { method: "PATCH", body: { status: newStatus } }); }
    catch { setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t)); }
  };

  const handleCheckMeeting = async (m) => {
    if (doneMeetingIds.has(m.id)) return;
    // Optimistic update immediately
    setDoneMeetingIds(prev => new Set([...prev, m.id]));
    try {
      await apiFetch("/api/tasks/meeting-done", {
        method: "POST",
        body: { meetingId: m.id, meetingTitle: m.title },
      });
    } catch {
      // Rollback on failure
      setDoneMeetingIds(prev => { const s = new Set(prev); s.delete(m.id); return s; });
    }
  };

  // "No, still pending" on the past-due Yes/No prompt — settles the card
  // into a persistent "still pending" tag for this session instead of
  // re-asking on every render, without marking it complete.
  const handleConfirmPending = (m) => {
    setConfirmedPendingIds(prev => new Set([...prev, m.id]));
  };



  const totalPending = pendingTasks.length + urgentEmails.length + suggestedMeetings.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(true); }}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Priorities</Text>
            <Text style={styles.headerSubtitle}>
              {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""}{urgentEmails.length > 0 ? ` · ${urgentEmails.length} urgent mail` : ""}{suggestedMeetings.length > 0 ? ` · ${suggestedMeetings.length} meeting request${suggestedMeetings.length !== 1 ? 's' : ''}` : ""} · {meetings.filter(m => !doneMeetingIds.has(m.id)).length} meeting{meetings.filter(m => !doneMeetingIds.has(m.id)).length !== 1 ? "s" : ""}
            </Text>
          </View>
          <LinearGradient
            colors={[theme.accentAlt, theme.accent]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.headerBadge}
          >
            <Feather name="zap" size={18} color="#FFFFFF" />
          </LinearGradient>
        </View>

        {/* Agent status — the same live cue as Twin Diary, so this reads as
            a background agent watching everything, not a static to-do list. */}
        <LinearGradient
          colors={theme.isDark ? ["rgba(129,128,255,0.20)", "rgba(52,199,123,0.12)"] : ["#F3F2FF", "#EFFDF6"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.agentStatusBar}
        >
          <LiveDot styles={styles} />
          <Text style={styles.agentStatusText}>
            Mneva is analyzing your day
            {(autoToday.length + autoUpcoming.length) > 0
              ? ` · ${autoToday.length + autoUpcoming.length} item${(autoToday.length + autoUpcoming.length) !== 1 ? 's' : ''} detected`
              : ''}
          </Text>
        </LinearGradient>

        {/* Segment tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={false}
          style={[styles.segmentScroll, { marginHorizontal: 0 }]}
          contentContainerStyle={[styles.segmentWrap, { flex: 1 }]}
        >
          {TABS.map((tab) => {
            const active = tab === activeTab;
            const isMeetings = tab === "MEETINGS";
            const badgeCount = tab === "TODAY" ? pendingTasks.length + todayReminders.filter(m => !doneMeetingIds.has(m.id)).length + autoToday.length
              : tab === "UPCOMING" ? upcomingItems.filter(m => !doneMeetingIds.has(m.id)).length + autoUpcoming.length
              : meetings.filter(m => !doneMeetingIds.has(m.id)).length;
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.segmentItem,
                  active && styles.segmentItemActive,
                  isMeetings && active && styles.segmentItemMeetingActive,
                ]}
                onPress={() => setActiveTab(tab)}
              >
                {isMeetings && (
                  <Feather name="video" size={11} color={active ? "#1F9A5A" : "#9AA1AE"} style={{ marginRight: 4 }} />
                )}
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{tab}</Text>
                {badgeCount > 0 && (
                  <View style={[styles.meetBadgeDot, active && styles.meetBadgeDotActive]}>
                    <Text style={styles.meetBadgeDotText}>{badgeCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* TODAY tab */}
            {activeTab === "TODAY" && (
              <>
                {pendingTasks.length === 0 && todayReminders.length === 0 && urgentEmails.length === 0 && suggestedMeetings.length === 0 && autoToday.length === 0 && (
                  <View style={styles.emptyWrap}>
                    <Feather name="check-circle" size={28} color={theme.disabled} />
                    <Text style={styles.emptyText}>All clear for today!</Text>
                  </View>
                )}
                {/* Suggested meetings from urgent emails */}
                {suggestedMeetings.length > 0 && (
                  <>
                    <SectionHeader
                      icon="calendar" label="MEETING REQUESTS"
                      color={theme.accentAlt}
                      tint={theme.isDark ? "rgba(129,128,255,0.16)" : "#EEEDFE"}
                      styles={styles}
                    />
                    {suggestedMeetings.map((mtg) => {
                      const acted = meetingActed[mtg.emailId];
                      return (
                        <View key={mtg.emailId} style={styles.meetSuggestCard}>
                          <View style={styles.meetSuggestIconWrap}>
                            <Feather name="user" size={16} color="#615FF8" />
                          </View>
                          <View style={styles.meetSuggestBody}>
                            <Text style={styles.meetSuggestTitle} numberOfLines={1}>
                              {mtg.senderName} wants to meet
                            </Text>
                            <Text style={styles.meetSuggestFrom} numberOfLines={1}>{mtg.senderEmail}</Text>
                            <Text style={styles.meetSuggestSubject} numberOfLines={1}>{mtg.subject}</Text>
                            {!acted ? (
                              <View style={styles.meetSuggestBtnRow}>
                                <TouchableOpacity
                                  style={styles.meetSuggestDenyBtn}
                                  onPress={() => handleMeetingSuggest(mtg.emailId, 'deny', mtg)}
                                >
                                  <Feather name="x" size={13} color="#E0546E" />
                                  <Text style={styles.meetSuggestDenyText}>Skip</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.meetSuggestApproveBtn}
                                  onPress={() => handleMeetingSuggest(mtg.emailId, 'approve', mtg)}
                                >
                                  <Feather name="calendar" size={13} color="#FFFFFF" />
                                  <Text style={styles.meetSuggestApproveText}>Schedule Meeting</Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <Text style={[styles.meetSuggestActed, { color: acted === 'approve' ? '#1F9A5A' : '#9AA1AE' }]}>
                                {acted === 'approve' ? '✓ Meeting scheduled' : '✗ Skipped'}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
                {/* Urgent emails section */}
                {urgentEmails.length > 0 && (
                  <>
                    <SectionHeader
                      icon="alert-circle" label="URGENT EMAILS TODAY"
                      color={theme.danger}
                      tint={theme.isDark ? "rgba(241,113,134,0.16)" : "#FCEAED"}
                      styles={styles}
                    />
                    {urgentEmails.map((email, i) => (
                      <View key={email.id || i} style={styles.urgentEmailCard}>
                        <View style={styles.urgentEmailIconWrap}>
                          <Feather name="mail" size={16} color="#E0546E" />
                        </View>
                        <View style={styles.urgentEmailBody}>
                          <Text style={styles.urgentEmailSubject} numberOfLines={1}>{email.subject}</Text>
                          <Text style={styles.urgentEmailFrom} numberOfLines={1}>From: {email.from.replace(/<.*>/, '').trim()}</Text>
                          {!!email.snippet && <Text style={styles.urgentEmailSnippet} numberOfLines={1}>{email.snippet}</Text>}
                        </View>
                        <View style={styles.urgentBadge}>
                          <Text style={styles.urgentBadgeText}>URGENT</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}
                {pendingTasks.map(task => (
                  <TaskCard key={task.id} task={task} onCheck={handleCheckTask} styles={styles} />
                ))}
                {todayReminders.length > 0 && (
                  <>
                    <SectionHeader
                      icon="bell" label="REMINDERS TODAY"
                      color={theme.warning}
                      tint={theme.isDark ? "rgba(255,184,77,0.16)" : "#FEF3C7"}
                      styles={styles}
                    />
                    {todayReminders.map(m => (
                      <MeetingCard
                        key={m.id} m={m}
                        done={doneMeetingIds.has(m.id)}
                        confirmedPending={confirmedPendingIds.has(m.id)}
                        onCheck={handleCheckMeeting}
                        onConfirmPending={handleConfirmPending}
                        styles={styles}
                        theme={theme}
                      />
                    ))}
                  </>
                )}
                {autoToday.length > 0 && (
                  <>
                    <SectionHeader
                      icon="cpu" label="AI DETECTED TODAY"
                      color={theme.accentAlt}
                      tint={theme.isDark ? "rgba(129,128,255,0.16)" : "#EEEDFE"}
                      styles={styles}
                    />
                    {autoToday.map((item, i) => (
                      <AutoTimelineRow key={item.id} item={item} isLast={i === autoToday.length - 1} styles={styles} />
                    ))}
                  </>
                )}
              </>
            )}

            {/* UPCOMING tab */}
            {activeTab === "UPCOMING" && (
              <>
                {upcomingItems.length === 0 && autoUpcoming.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Feather name="calendar" size={28} color={theme.disabled} />
                    <Text style={styles.emptyText}>Nothing upcoming yet.</Text>
                  </View>
                ) : (
                  <>
                    {upcomingItems.map(m => (
                      <MeetingCard
                        key={m.id} m={m}
                        done={doneMeetingIds.has(m.id)}
                        confirmedPending={confirmedPendingIds.has(m.id)}
                        onCheck={handleCheckMeeting}
                        onConfirmPending={handleConfirmPending}
                        styles={styles}
                        theme={theme}
                      />
                    ))}
                    {autoUpcoming.length > 0 && (
                      <>
                        <SectionHeader
                          icon="cpu" label="AI DETECTED — COMING UP"
                          color={theme.accentAlt}
                          tint={theme.isDark ? "rgba(129,128,255,0.16)" : "#EEEDFE"}
                          styles={styles}
                        />
                        {autoUpcoming.map((item, i) => (
                          <AutoTimelineRow key={item.id} item={item} isLast={i === autoUpcoming.length - 1} styles={styles} />
                        ))}
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* MEETINGS tab — all */}
            {activeTab === "MEETINGS" && (
              <>
                {meetings.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Feather name="video" size={28} color={theme.disabled} />
                    <Text style={styles.emptyText}>No live meetings scheduled yet.</Text>
                    <Text style={styles.emptyHint}>Use Ask Mneva → Schedule to create one.</Text>
                  </View>
                ) : (
                  meetings.map(m => (
                    <MeetingCard
                      key={m.id} m={m}
                      done={doneMeetingIds.has(m.id)}
                      confirmedPending={confirmedPendingIds.has(m.id)}
                      onCheck={handleCheckMeeting}
                      onConfirmPending={handleConfirmPending}
                      styles={styles}
                      theme={theme}
                    />
                  ))
                )}
              </>
            )}

          </>
        )}
      </ScrollView>

      {/* Bottom tab bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Home")}>
          <Ionicons name="home" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Feather name="calendar" size={22} color={theme.accent} />
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("AskAI")}>
          <Feather name="mic" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Space")}>
          <Feather name="folder" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Profile")}>
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
  headerRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16, gap: 12 },
  headerTitle: { fontSize: 32, fontWeight: "800", color: theme.text, marginBottom: 4, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: theme.faint },
  headerBadge: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", shadowColor: theme.accentAlt, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },

  // Agent status bar
  agentStatusBar: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingVertical: 11, paddingHorizontal: 13, marginBottom: 18, gap: 8 },
  agentStatusText: { fontSize: 12, fontWeight: "600", color: theme.accentAlt },
  liveDotWrap: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  liveDotPulse: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: theme.accent, opacity: 0.35 },
  liveDotCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent },

  // Timeline (used for AI-detected items)
  timelineRow: { flexDirection: "row" },
  timelineLeftCol: { width: 20, alignItems: "center" },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 18 },
  timelineLine: { flex: 1, width: 2, backgroundColor: theme.border, marginTop: 4, marginBottom: 4, minHeight: 16 },

  segmentScroll: { marginBottom: 20 },
  segmentWrap: { flexDirection: "row", backgroundColor: theme.soft, borderRadius: 14, padding: 4, gap: 4 },
  segmentItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 11 },
  segmentItemActive: { backgroundColor: theme.card, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentItemMeetingActive: { backgroundColor: theme.isDark ? "rgba(52,199,123,0.16)" : "#EFFDF6" },
  segmentItemReminderActive: { backgroundColor: theme.isDark ? "rgba(255,184,77,0.16)" : "#FFF8EA" },
  segmentText: { fontSize: 12, fontWeight: "700", color: theme.faint, letterSpacing: 0.3 },
  segmentTextActive: { color: theme.text },
  meetBadgeDot: { marginLeft: 5, backgroundColor: theme.accent, borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  meetBadgeDotActive: { backgroundColor: theme.text },
  meetBadgeDotText: { fontSize: 9, fontWeight: "800", color: "#FFFFFF" },

  // Task card
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderColor: theme.border,
    shadowColor: "#0F1720", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  cardDone: { opacity: 0.5 },
  checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: theme.borderStrong, alignItems: "center", justifyContent: "center", marginRight: 14, flexShrink: 0 },
  checkCircleActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  cardTextWrap: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginBottom: 3 },
  cardTitleChecked: { color: theme.faint, textDecorationLine: "line-through" },
  cardSubtitle: { fontSize: 12, color: theme.faint },

  // Section pill (replaces the old plain-text divider)
  sectionPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 12, marginTop: 6 },
  sectionPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  // Meeting card — same row layout as task card
  meetCard: {
    backgroundColor: theme.card, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderColor: theme.border,
    shadowColor: "#0F1720", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  meetCardOverdue: { borderColor: theme.isDark ? "rgba(255,184,77,0.5)" : "#F5CB7C" },
  meetTopSection: { flexDirection: "row", alignItems: "flex-start" },
  meetBody: { flex: 1 },
  meetTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 },
  meetTitle: { fontSize: 15, fontWeight: "700", color: theme.text, flex: 1, marginRight: 8 },
  meetMetaRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  meetMeta: { fontSize: 12, color: theme.muted },
  meetAttendees: { fontSize: 12, color: theme.faint, flex: 1 },
  meetDesc: { fontSize: 12, color: theme.faint, marginTop: 4, lineHeight: 17 },
  joinBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.accent, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7 },
  joinBtnText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },

  // Past-due Yes/No confirmation — the agent proactively asks whether a
  // reminder/meeting whose time has already passed actually happened,
  // instead of leaving a passive checkbox for the user to remember.
  confirmIconWrap: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.isDark ? "rgba(255,184,77,0.16)" : "#FEF3C7", alignItems: "center", justifyContent: "center", marginRight: 14, flexShrink: 0 },
  confirmRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  confirmPrompt: { fontSize: 12, fontWeight: "700", color: theme.textSecondary, marginBottom: 8 },
  confirmBtnRow: { flexDirection: "row", gap: 8 },
  confirmNoBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: 10, backgroundColor: theme.surfaceAlt },
  confirmNoText: { fontSize: 12, fontWeight: "700", color: theme.textSecondary },
  confirmYesBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.accent },
  confirmYesText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  pendingTag: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: 10, backgroundColor: theme.isDark ? "rgba(255,184,77,0.16)" : "#FEF3C7", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  pendingTagText: { fontSize: 11, fontWeight: "700", color: theme.warning },

  // Empty
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, color: theme.faint, fontWeight: "600" },
  emptyHint: { fontSize: 12, color: theme.disabled, textAlign: "center" },

  // Meeting suggestion card
  meetSuggestCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: theme.isDark ? "rgba(129,128,255,0.10)" : "#F5F3FF", borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: theme.accentAlt },
  meetSuggestIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: theme.isDark ? "rgba(129,128,255,0.18)" : "#EEEDFE", alignItems: "center", justifyContent: "center", marginRight: 12, flexShrink: 0 },
  meetSuggestBody: { flex: 1 },
  meetSuggestTitle: { fontSize: 14, fontWeight: "700", color: theme.text, marginBottom: 2 },
  meetSuggestFrom: { fontSize: 12, color: theme.accentAlt, marginBottom: 2 },
  meetSuggestSubject: { fontSize: 11, color: theme.faint, marginBottom: 10 },
  meetSuggestBtnRow: { flexDirection: "row", gap: 8 },
  meetSuggestDenyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.isDark ? "rgba(241,113,134,0.14)" : "#FFF0F3" },
  meetSuggestDenyText: { fontSize: 12, fontWeight: "700", color: theme.danger },
  meetSuggestApproveBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.accentAlt, flex: 1, justifyContent: "center" },
  meetSuggestApproveText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  meetSuggestActed: { fontSize: 12, fontWeight: "600", marginTop: 4 },

  // Urgent email card
  urgentEmailCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: theme.isDark ? "rgba(241,113,134,0.10)" : "#FFF5F7", borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: theme.danger },
  urgentEmailIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: theme.isDark ? "rgba(241,113,134,0.16)" : "#FCEAED", alignItems: "center", justifyContent: "center", marginRight: 12, flexShrink: 0 },
  urgentEmailBody: { flex: 1 },
  urgentEmailSubject: { fontSize: 14, fontWeight: "700", color: theme.text, marginBottom: 3 },
  urgentEmailFrom: { fontSize: 12, color: theme.muted, marginBottom: 2 },
  urgentEmailSnippet: { fontSize: 11, color: theme.faint },
  urgentBadge: { backgroundColor: theme.isDark ? "rgba(241,113,134,0.16)" : "#FCEAED", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8, alignSelf: "flex-start" },
  urgentBadgeText: { fontSize: 10, fontWeight: "800", color: theme.danger },

  // Auto-detected item card (from the cross-module analysis)
  autoItemCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12, borderLeftWidth: 3,
    shadowColor: "#0F1720", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  autoItemIconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", marginRight: 12, flexShrink: 0 },
  autoItemBody: { flex: 1 },
  autoItemTitle: { fontSize: 14, fontWeight: "700", color: theme.text, marginBottom: 2 },
  autoItemSubtitle: { fontSize: 12, color: theme.faint },
  autoItemDate: { fontSize: 11, fontWeight: "700", color: theme.muted, marginLeft: 8 },

  // Tab bar
  tabBar: { flexDirection: "row", backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: "center" },
  tabLabel: { fontSize: 10, fontWeight: "700", color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
  tabLabelActive: { color: theme.accent },
});
