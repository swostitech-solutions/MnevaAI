import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, ActivityIndicator, useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { apiFetch } from "../api/client";

const TAB_BAR_CONTENT_HEIGHT = 50;
const TABS = ["TODAY", "UPCOMING", "MEETINGS"];

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
  const isReminder = !m.meetLink;
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
          {!isReminder && !done && (
            <TouchableOpacity style={styles.joinBtn} onPress={() => Linking.openURL(m.meetLink)}>
              <Feather name="video" size={12} color="#FFFFFF" />
              <Text style={styles.joinBtnText}>Join</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.meetMetaRow}>
          <Feather name="clock" size={11} color="#9AA1AE" />
          <Text style={styles.meetMeta}> {date}  ·  {time}{durStr ? `  ·  ${durStr}` : ""}</Text>
        </View>
        {!isReminder && attendees.length > 0 && (
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
  const [loading, setLoading] = useState(true);

  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const horizontalPad = width < 360 ? 16 : 20;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [taskRes, meetRes, doneRes] = await Promise.all([
        apiFetch("/api/tasks"),
        apiFetch("/api/calendar/meetings"),
        apiFetch("/api/tasks/meeting-done"),
      ]);
      const allTasks = Array.isArray(taskRes) ? taskRes : [];
      setTasks(allTasks.filter(t => !t.title?.startsWith("meeting_done:")));
      setAllCalendarItems(Array.isArray(meetRes) ? meetRes : meetRes.meetings || []);
      setDoneMeetingIds(new Set(doneRes.ids || []));
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, []);

  // Derived task lists
  const now        = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const pendingTasks   = tasks.filter(t => t.status === "PENDING");
  const completedTasks = tasks.filter(t => t.status === "COMPLETED");

  // TODAY = all meetings that fall on today (any time)
  // UPCOMING = meetings strictly after today AND in the future
  // No overlap — a meeting is in exactly one bucket
  // Only real Google meetings (have meetLink) go to MEETINGS tab
  const meetings = allCalendarItems.filter(m => !!m.meetLink);
  // All calendar items (meetings + reminders) go to TODAY/UPCOMING
  const todayMeetings    = allCalendarItems.filter(m => { const d = new Date(m.start); return d >= todayStart && d <= todayEnd; });
  const upcomingMeetings = allCalendarItems
    .filter(m => new Date(m.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

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



  const totalPending = pendingTasks.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerTitle}>Priorities</Text>
        <Text style={styles.headerSubtitle}>
          {totalPending} pending · {meetings.filter(m => !doneMeetingIds.has(m.id)).length} meeting{meetings.filter(m => !doneMeetingIds.has(m.id)).length !== 1 ? "s" : ""}
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
            const isUpcoming = tab === "UPCOMING";
            const badgeCount = tab === "TODAY" ? pendingTasks.length
              : tab === "UPCOMING" ? upcomingMeetings.filter(m => !doneMeetingIds.has(m.id)).length
              : tab === "MEETINGS" ? meetings.filter(m => !doneMeetingIds.has(m.id)).length
              : 0;
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
                {pendingTasks.length === 0 && todayMeetings.length === 0 && (
                  <View style={styles.emptyWrap}>
                    <Feather name="check-circle" size={28} color="#C7CBD3" />
                    <Text style={styles.emptyText}>All clear for today!</Text>
                  </View>
                )}
                {pendingTasks.map(task => (
                  <TaskCard key={task.id} task={task} onCheck={handleCheckTask} />
                ))}
                {todayMeetings.length > 0 && (
                  <>
                    <View style={styles.sectionDivider}>
                      <Feather name="video" size={12} color="#1F9A5A" />
                      <Text style={styles.sectionDividerText}>TODAY'S MEETINGS</Text>
                    </View>
                    {todayMeetings.map(m => (
                      <MeetingCard
                        key={m.id} m={m}
                        done={doneMeetingIds.has(m.id)}
                        onCheck={handleCheckMeeting}
                      />
                    ))}
                  </>
                )}
              </>
            )}

            {/* UPCOMING tab */}
            {activeTab === "UPCOMING" && (
              <>
                {upcomingMeetings.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Feather name="calendar" size={28} color="#C7CBD3" />
                    <Text style={styles.emptyText}>Nothing upcoming yet.</Text>
                  </View>
                ) : (
                  upcomingMeetings.map(m => (
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
                    <Text style={styles.emptyText}>No meetings scheduled yet.</Text>
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

  // Tab bar
  tabBar: { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EEF0F3", paddingTop: 10 },
  tabItem: { flex: 1, alignItems: "center" },
  tabLabel: { fontSize: 10, fontWeight: "700", color: "#9AA1AE", marginTop: 4, letterSpacing: 0.3 },
  tabLabelActive: { color: "#1F7A54" },
});
