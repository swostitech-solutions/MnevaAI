import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, ActivityIndicator, useWindowDimensions, RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { apiFetch } from "../api/client";
import { useSocket } from '../services/socket';
import { onAppDataRefresh } from '../services/dataRefresh';

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

function TaskCard({ task, onCheck }) {
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

function MeetingCard({ m, done, onCheck }) {
  const { date, time, durStr } = fmtMeeting(m.start, m.end);
  const attendees = Array.isArray(m.attendees) ? m.attendees : [];
  const isRealtimeMeeting = isJoinableMeetingLink(m.meetLink);
  const isReminder = !isRealtimeMeeting;
  return (
    <View style={[styles.meetCard, done && styles.cardDone]}>
      <TouchableOpacity
        style={[styles.checkCircle, done && styles.checkCircleActive]}
        onPress={() => onCheck(m)}
        disabled={done}
      >
        {done && <Feather name="check" size={13} color="#FFFFFF" />}
      </TouchableOpacity>
      <View style={styles.meetBody}>
        <View style={styles.meetTopRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, marginRight: 8 }}>
            <Feather name={isReminder ? 'bell' : 'video'} size={13} color={isReminder ? '#F5A623' : '#E0546E'} />
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
          <Feather name="clock" size={11} color="#9AA1AE" />
          <Text style={styles.meetMeta}> {date}  ·  {time}{durStr ? `  ·  ${durStr}` : ""}</Text>
        </View>
        {isRealtimeMeeting && attendees.length > 0 && (
          <View style={styles.meetMetaRow}>
            <Feather name="users" size={11} color="#9AA1AE" />
            <Text style={styles.meetAttendees} numberOfLines={1}> {attendees.join(", ")}</Text>
          </View>
        )}
        {!!m.description && (
          <Text style={styles.meetDesc} numberOfLines={2}>{m.description}</Text>
        )}
      </View>
    </View>
  );
}

export default function Priorities({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState("TODAY");
  const [tasks, setTasks] = useState([]);
  const [allCalendarItems, setAllCalendarItems] = useState([]);
  const [doneMeetingIds, setDoneMeetingIds] = useState(new Set());
  const [urgentEmails, setUrgentEmails] = useState([]);
  const [suggestedMeetings, setSuggestedMeetings] = useState([]);
  const [meetingActed, setMeetingActed] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isMountedRef = useRef(false);

  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const horizontalPad = width < 360 ? 16 : 20;

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
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
      const allTasks = Array.isArray(taskRes) ? taskRes : [];
      setTasks(allTasks.filter(t => !t.title?.startsWith("meeting_done:")));
      setAllCalendarItems(Array.isArray(meetRes) ? meetRes : meetRes.meetings || []);
      setDoneMeetingIds(new Set(doneRes.ids || []));
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
    // Fetch brief data separately — fail silently
    try {
      const brief = await apiFetch("/api/dashboard/brief");
      setUrgentEmails(brief?.urgentEmails || []);
      setSuggestedMeetings(brief?.suggestedMeetings || []);
    } catch {}
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
            tintColor="#1F9A5A"
            colors={['#1F9A5A']}
          />
        }
      >
        <Text style={styles.headerTitle}>Priorities</Text>
        <Text style={styles.headerSubtitle}>
          {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""}{urgentEmails.length > 0 ? ` · ${urgentEmails.length} urgent mail` : ""}{suggestedMeetings.length > 0 ? ` · ${suggestedMeetings.length} meeting request${suggestedMeetings.length !== 1 ? 's' : ''}` : ""} · {meetings.filter(m => !doneMeetingIds.has(m.id)).length} meeting{meetings.filter(m => !doneMeetingIds.has(m.id)).length !== 1 ? "s" : ""}
        </Text>

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
            const badgeCount = tab === "TODAY" ? pendingTasks.length + todayReminders.filter(m => !doneMeetingIds.has(m.id)).length
              : tab === "UPCOMING" ? upcomingItems.filter(m => !doneMeetingIds.has(m.id)).length
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
          <ActivityIndicator size="small" color="#1F9A5A" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* TODAY tab */}
            {activeTab === "TODAY" && (
              <>
                {pendingTasks.length === 0 && todayReminders.length === 0 && urgentEmails.length === 0 && suggestedMeetings.length === 0 && (
                  <View style={styles.emptyWrap}>
                    <Feather name="check-circle" size={28} color="#C7CBD3" />
                    <Text style={styles.emptyText}>All clear for today!</Text>
                  </View>
                )}
                {/* Suggested meetings from urgent emails */}
                {suggestedMeetings.length > 0 && (
                  <>
                    <View style={styles.sectionDivider}>
                      <Feather name="calendar" size={12} color="#615FF8" />
                      <Text style={[styles.sectionDividerText, { color: '#615FF8' }]}>MEETING REQUESTS</Text>
                    </View>
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
                    <View style={styles.sectionDivider}>
                      <Feather name="alert-circle" size={12} color="#E0546E" />
                      <Text style={[styles.sectionDividerText, { color: '#E0546E' }]}>URGENT EMAILS TODAY</Text>
                    </View>
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
                  <TaskCard key={task.id} task={task} onCheck={handleCheckTask} />
                ))}
                {todayReminders.length > 0 && (
                  <>
                    <View style={styles.sectionDivider}>
                      <Feather name="bell" size={12} color="#D88900" />
                      <Text style={[styles.sectionDividerText, { color: '#D88900' }]}>REMINDERS TODAY</Text>
                    </View>
                    {todayReminders.map(m => (
                      <MeetingCard key={m.id} m={m} done={doneMeetingIds.has(m.id)} onCheck={handleCheckMeeting} />
                    ))}
                  </>
                )}
              </>
            )}

            {/* UPCOMING tab */}
            {activeTab === "UPCOMING" && (
              <>
                {upcomingItems.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Feather name="calendar" size={28} color="#C7CBD3" />
                    <Text style={styles.emptyText}>Nothing upcoming yet.</Text>
                  </View>
                ) : (
                  upcomingItems.map(m => (
                    <MeetingCard
                      key={m.id} m={m}
                      done={doneMeetingIds.has(m.id)}
                      onCheck={handleCheckMeeting}
                    />
                  ))
                )}
              </>
            )}

            {/* MEETINGS tab — all */}
            {activeTab === "MEETINGS" && (
              <>
                {meetings.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Feather name="video" size={28} color="#C7CBD3" />
                    <Text style={styles.emptyText}>No live meetings scheduled yet.</Text>
                    <Text style={styles.emptyHint}>Use Ask Mneva → Schedule to create one.</Text>
                  </View>
                ) : (
                  meetings.map(m => (
                    <MeetingCard
                      key={m.id} m={m}
                      done={doneMeetingIds.has(m.id)}
                      onCheck={handleCheckMeeting}
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
          <Ionicons name="home" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Feather name="calendar" size={22} color="#1F7A54" />
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("AskAI")}>
          <Feather name="mic" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Space")}>
          <Feather name="folder" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Profile")}>
          <Feather name="user" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFC" },
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  headerTitle: { fontSize: 32, fontWeight: "800", color: "#14171F", marginBottom: 4 },
  headerSubtitle: { fontSize: 14, color: "#9AA1AE", marginBottom: 16 },

  segmentScroll: { marginBottom: 20 },
  segmentWrap: { flexDirection: "row", backgroundColor: "#EEF0F3", borderRadius: 14, padding: 4, gap: 4 },
  segmentItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 11 },
  segmentItemActive: { backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentItemMeetingActive: { backgroundColor: "#EFFDF6" },
  segmentItemReminderActive: { backgroundColor: "#FFF8EA" },
  segmentText: { fontSize: 12, fontWeight: "700", color: "#9AA1AE", letterSpacing: 0.3 },
  segmentTextActive: { color: "#14171F" },
  meetBadgeDot: { marginLeft: 5, backgroundColor: "#1F9A5A", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  meetBadgeDotActive: { backgroundColor: "#14171F" },
  meetBadgeDotText: { fontSize: 9, fontWeight: "800", color: "#FFFFFF" },

  // Task card
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 18, paddingVertical: 16, paddingHorizontal: 16, marginBottom: 12 },
  cardDone: { opacity: 0.5 },
  checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#E3E5EA", alignItems: "center", justifyContent: "center", marginRight: 14, flexShrink: 0 },
  checkCircleActive: { backgroundColor: "#1F9A5A", borderColor: "#1F9A5A" },
  cardTextWrap: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#14171F", marginBottom: 3 },
  cardTitleChecked: { color: "#9AA1AE", textDecorationLine: "line-through" },
  cardSubtitle: { fontSize: 12, color: "#9AA1AE" },

  // Section divider
  sectionDivider: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, marginTop: 6 },
  sectionDividerText: { fontSize: 12, fontWeight: "700", color: "#6B7280", letterSpacing: 0.5 },

  // Meeting card — same row layout as task card
  meetCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#FFFFFF", borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12 },
  meetBody: { flex: 1 },
  meetTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 },
  meetTitle: { fontSize: 15, fontWeight: "700", color: "#14171F", flex: 1, marginRight: 8 },
  meetMetaRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  meetMeta: { fontSize: 12, color: "#6B7280" },
  meetAttendees: { fontSize: 12, color: "#9AA1AE", flex: 1 },
  meetDesc: { fontSize: 12, color: "#9AA1AE", marginTop: 4, lineHeight: 17 },
  joinBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1F9A5A", borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7 },
  joinBtnText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },

  // Empty
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, color: "#9AA1AE", fontWeight: "600" },
  emptyHint: { fontSize: 12, color: "#C7CBD3", textAlign: "center" },

  // Meeting suggestion card
  meetSuggestCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#F5F3FF", borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: "#615FF8" },
  meetSuggestIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#EEEDFE", alignItems: "center", justifyContent: "center", marginRight: 12, flexShrink: 0 },
  meetSuggestBody: { flex: 1 },
  meetSuggestTitle: { fontSize: 14, fontWeight: "700", color: "#14171F", marginBottom: 2 },
  meetSuggestFrom: { fontSize: 12, color: "#615FF8", marginBottom: 2 },
  meetSuggestSubject: { fontSize: 11, color: "#9AA1AE", marginBottom: 10 },
  meetSuggestBtnRow: { flexDirection: "row", gap: 8 },
  meetSuggestDenyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#FFF0F3" },
  meetSuggestDenyText: { fontSize: 12, fontWeight: "700", color: "#E0546E" },
  meetSuggestApproveBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: "#615FF8", flex: 1, justifyContent: "center" },
  meetSuggestApproveText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  meetSuggestActed: { fontSize: 12, fontWeight: "600", marginTop: 4 },

  // Urgent email card
  urgentEmailCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#FFF5F7", borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: "#E0546E" },
  urgentEmailIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#FCEAED", alignItems: "center", justifyContent: "center", marginRight: 12, flexShrink: 0 },
  urgentEmailBody: { flex: 1 },
  urgentEmailSubject: { fontSize: 14, fontWeight: "700", color: "#14171F", marginBottom: 3 },
  urgentEmailFrom: { fontSize: 12, color: "#6B7280", marginBottom: 2 },
  urgentEmailSnippet: { fontSize: 11, color: "#9AA1AE" },
  urgentBadge: { backgroundColor: "#FCEAED", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8, alignSelf: "flex-start" },
  urgentBadgeText: { fontSize: 10, fontWeight: "800", color: "#E0546E" },

  // Tab bar
  tabBar: { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EEF0F3", paddingTop: 10 },
  tabItem: { flex: 1, alignItems: "center" },
  tabLabel: { fontSize: 10, fontWeight: "700", color: "#9AA1AE", marginTop: 4, letterSpacing: 0.3 },
  tabLabelActive: { color: "#1F7A54" },
});
