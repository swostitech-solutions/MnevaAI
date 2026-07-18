import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, useWindowDimensions, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';

const TAB_BAR_H = 50;
const INBOX_TABS = ['All', 'Unread', 'Flagged'];
const PALETTE = ['#1F9A5A', '#9B72FF', '#F5A623', '#E0546E', '#4FA6E8'];
const avatarColor = (str = '') => PALETTE[(str.charCodeAt(0) || 0) % PALETTE.length];
const initials = (str = '') => str.trim().slice(0, 2).toUpperCase();

// ─── Skeleton row ───────────────────────────────────────────────────────────
function SkeletonRow() {
  const op = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.skeletonRow, { opacity: op }]}>
      <View style={styles.skeletonAvatar} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: '60%', opacity: 0.5 }]} />
      </View>
    </Animated.View>
  );
}

// ─── Inbox row ───────────────────────────────────────────────────────────────
function EmailRow({ email, unread, onPress }) {
  const color = avatarColor(email.from);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {/* Unread bar */}
      <View style={[styles.unreadBar, { backgroundColor: unread ? '#1F9A5A' : 'transparent' }]} />

      {/* Avatar */}
      <View style={[styles.rowAvatar, { backgroundColor: color + '20' }]}>
        <Text style={[styles.rowAvatarText, { color }]}>{initials(email.from)}</Text>
      </View>

      {/* Text */}
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowFrom, unread && styles.bold]} numberOfLines={1}>{email.from}</Text>
          <Text style={styles.rowTime}>{email.time || email.date || ''}</Text>
        </View>
        <Text style={[styles.rowSubject, unread && styles.bold]} numberOfLines={1}>{email.subject}</Text>
        <Text style={styles.rowPreview} numberOfLines={1}>{email.preview}</Text>
      </View>

      <Feather name="chevron-right" size={15} color="#D1D5DB" />
    </TouchableOpacity>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Communications({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_H + insets.bottom;

  const [emails, setEmails] = useState([]);
  const [filter, setFilter] = useState('all');
  const [inboxTab, setInboxTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [gmailError, setGmailError] = useState(null);
  const [readIds, setReadIds] = useState(new Set());

  // Thread view
  const [thread, setThread] = useState(null);
  const [threadBody, setThreadBody] = useState('');
  const [threadLoading, setThreadLoading] = useState(false);

  // Draft
  const [draft, setDraft] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);

  const loadEmails = async (f = filter, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setGmailError(null);
    try {
      const data = await apiFetch(`/api/comms/emails?filter=${f}&limit=40`);
      setEmails(data.emails || []);
    } catch (err) {
      setGmailError(err.message || 'Could not load emails');
      setEmails([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadEmails(); }, []);

  const openThread = async (email) => {
    setThread(email);
    setThreadBody('');
    setDraft('');
    setDraftReady(false);
    setEditing(false);
    setReadIds(s => new Set([...s, email.id]));
    setThreadLoading(true);
    try {
      const full = await apiFetch(`/api/comms/emails/${email.id}`);
      setThreadBody(full.body || '');
    } catch { setThreadBody(''); }
    finally { setThreadLoading(false); }
  };

  const generateDraft = async () => {
    if (!thread) return;
    setDraftLoading(true);
    setDraft('');
    setDraftReady(false);
    try {
      const res = await apiFetch('/api/agent/draft', {
        method: 'POST',
        body: { subject: thread.subject || '', from: thread.from || '', preview: threadBody || thread.preview || '' },
      });
      setDraft(res.draft || '');
      setDraftReady(true);
    } catch { setDraft(''); setDraftReady(false); }
    finally { setDraftLoading(false); }
  };

  const sendReply = async () => {
    if (!draft.trim() || !thread) return;
    setSending(true);
    try {
      await apiFetch(`/api/comms/emails/${thread.id}/send`, {
        method: 'POST',
        body: { recipient: thread.email || thread.from || '', subject: thread.subject || '', draft },
      });
      setDraft('');
      setDraftReady(false);
      setThread(null);
    } catch {}
    finally { setSending(false); }
  };

  const unreadCount = emails.filter(e => e.unread && !readIds.has(e.id)).length;

  const visibleEmails = emails.filter(e => {
    if (inboxTab === 1) return e.unread && !readIds.has(e.id);
    if (inboxTab === 2) return e.flagged;
    return true;
  });

  // ── THREAD VIEW ────────────────────────────────────────────────────────────
  if (thread) {
    const color = avatarColor(thread.from);
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          {/* Thread header */}
          <View style={[styles.threadHeader, { paddingHorizontal: hPad }]}>
            <TouchableOpacity
              style={styles.threadBack}
              onPress={() => { setThread(null); setDraftReady(false); setDraft(''); }}
            >
              <Feather name="arrow-left" size={20} color="#14171F" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.threadHeaderFrom} numberOfLines={1}>{thread.from}</Text>
              <Text style={styles.threadHeaderTime}>{thread.date} {thread.time}</Text>
            </View>
            <TouchableOpacity style={styles.threadMoreBtn}>
              <Feather name="more-horizontal" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <FlatList
              data={[{ key: 'content' }]}
              keyExtractor={i => i.key}
              contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
              renderItem={() => (
                <>
                  {/* Subject */}
                  <Text style={styles.threadSubject}>{thread.subject}</Text>

                  {/* Sender row */}
                  <View style={styles.threadSenderRow}>
                    <View style={[styles.threadAvatar, { backgroundColor: color + '20' }]}>
                      <Text style={[styles.threadAvatarText, { color }]}>{initials(thread.from)}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.threadSenderName}>{thread.from}</Text>
                      <Text style={styles.threadSenderSub}>to me</Text>
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={styles.threadDivider} />

                  {/* Body */}
                  {threadLoading ? (
                    <View style={styles.threadBodyLoading}>
                      <ActivityIndicator color="#1F9A5A" size="small" />
                      <Text style={styles.threadBodyLoadingText}>Loading…</Text>
                    </View>
                  ) : (
                    <Text style={styles.threadBody}>{threadBody || thread.preview}</Text>
                  )}

                  {/* ── AI Reply composer ── */}
                  <View style={styles.replyBox}>
                    {/* Top row */}
                    <View style={styles.replyBoxTop}>
                      <View style={styles.replyAIBadge}>
                        <Feather name="zap" size={11} color="#1F9A5A" />
                        <Text style={styles.replyAIBadgeText}>Mneva AI</Text>
                      </View>
                      {!draftReady && !draftLoading && (
                        <TouchableOpacity style={styles.generateBtn} onPress={generateDraft}>
                          <Text style={styles.generateBtnText}>Draft reply</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Draft area */}
                    {draftLoading ? (
                      <View style={styles.draftLoadingRow}>
                        <View style={styles.dotRow}>
                          {[1, 0.5, 0.25].map((op, i) => (
                            <View key={i} style={[styles.bounceDot, { opacity: op }]} />
                          ))}
                        </View>
                        <Text style={styles.draftLoadingText}>Writing reply…</Text>
                      </View>
                    ) : draftReady ? (
                      <>
                        <TextInput
                          style={styles.draftInput}
                          value={draft}
                          onChangeText={setDraft}
                          multiline
                          editable={editing}
                          placeholder="Your reply…"
                          placeholderTextColor="#C7CBD3"
                        />
                        <View style={styles.replyActions}>
                          <TouchableOpacity
                            style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.4 }]}
                            onPress={sendReply}
                            disabled={!draft.trim() || sending}
                          >
                            <Feather name="send" size={14} color="#FFFFFF" />
                            <Text style={styles.sendBtnText}>{sending ? 'Sending…' : 'Send'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.editToggleBtn}
                            onPress={() => setEditing(e => !e)}
                          >
                            <Feather name={editing ? 'check' : 'edit-2'} size={14} color="#1F9A5A" />
                            <Text style={styles.editToggleText}>{editing ? 'Lock' : 'Edit'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.discardBtn}
                            onPress={() => { setDraftReady(false); setDraft(''); }}
                          >
                            <Text style={styles.discardText}>Discard</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.replyPlaceholder}>Tap "Draft reply" to let Mneva AI write for you</Text>
                    )}
                  </View>
                </>
              )}
            />
          </KeyboardAvoidingView>
        </KeyboardAvoidingView>

        <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
          {NAV_TABS.map(({ name, icon, lib }) => (
            <TouchableOpacity key={name} style={styles.navTabItem} onPress={() => navigation?.navigate?.(name)}>
              {lib === 'Ionicons'
                ? <Ionicons name={icon} size={22} color="#9AA1AE" />
                : <Feather name={icon} size={22} color="#9AA1AE" />}
              <Text style={styles.navTabLabel}>{name.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // ── INBOX VIEW ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>

      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: hPad }]}>
        <View>
          <Text style={styles.headerTitle}>Mail</Text>
          {unreadCount > 0
            ? <Text style={styles.headerSub}><Text style={styles.headerUnread}>{unreadCount} unread</Text> · Gmail</Text>
            : <Text style={styles.headerSub}>All caught up · Gmail</Text>}
        </View>
        <TouchableOpacity style={styles.composeBtn}>
          <Feather name="edit" size={17} color="#1F9A5A" />
        </TouchableOpacity>
      </View>

      {/* Inbox tabs */}
      <View style={[styles.inboxTabRow, { paddingHorizontal: hPad }]}>
        {INBOX_TABS.map((t, i) => (
          <TouchableOpacity
            key={t}
            style={[styles.inboxTab, inboxTab === i && styles.inboxTabActive]}
            onPress={() => setInboxTab(i)}
          >
            <Text style={[styles.inboxTabText, inboxTab === i && styles.inboxTabTextActive]}>{t}</Text>
            {i === 1 && unreadCount > 0 && (
              <View style={styles.inboxTabBadge}>
                <Text style={styles.inboxTabBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter pills */}
      <View style={[styles.filterRow, { paddingHorizontal: hPad }]}>
        {['all', 'primary', 'social', 'promotions'].map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterPill, filter === f && styles.filterPillActive]}
            onPress={() => { setFilter(f); loadEmails(f); }}
          >
            <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error */}
      {gmailError && (
        <View style={[styles.errorBanner, { marginHorizontal: hPad }]}>
          <Feather name="alert-circle" size={14} color="#D97706" />
          <Text style={styles.errorText}>
            {gmailError.includes('not connected') ? 'Connect Gmail in Settings → Integrations' : gmailError}
          </Text>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={{ paddingHorizontal: hPad, paddingTop: 8 }}>
          {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
        </View>
      ) : (
        <FlatList
          data={visibleEmails}
          keyExtractor={e => e.id}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadEmails(filter, true); }}
              tintColor="#1F9A5A"
              colors={['#1F9A5A']}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyCircle}>
                <Feather name="inbox" size={26} color="#C7CBD3" />
              </View>
              <Text style={styles.emptyTitle}>
                {inboxTab === 1 ? 'No unread mail' : inboxTab === 2 ? 'Nothing flagged' : 'Inbox is empty'}
              </Text>
              <Text style={styles.emptySub}>
                {gmailError ? 'Connect Gmail in Settings' : 'Check back later'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <EmailRow
              email={item}
              unread={item.unread && !readIds.has(item.id)}
              onPress={() => openThread(item)}
            />
          )}
        />
      )}

      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        {NAV_TABS.map(({ name, icon, lib }) => (
          <TouchableOpacity key={name} style={styles.navTabItem} onPress={() => navigation?.navigate?.(name)}>
            {lib === 'Ionicons'
              ? <Ionicons name={icon} size={22} color="#9AA1AE" />
              : <Feather name={icon} size={22} color="#9AA1AE" />}
            <Text style={styles.navTabLabel}>{name.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const NAV_TABS = [
  { name: 'Home', icon: 'home', lib: 'Ionicons' },
  { name: 'Priorities', icon: 'calendar', lib: 'Feather' },
  { name: 'AskAI', icon: 'mic', lib: 'Feather' },
  { name: 'Space', icon: 'folder', lib: 'Feather' },
  { name: 'Profile', icon: 'user', lib: 'Feather' },
];

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 16, paddingBottom: 10 },
  headerTitle: { fontSize: 34, fontWeight: '800', color: '#14171F', letterSpacing: -1 },
  headerSub: { fontSize: 13, color: '#9AA1AE', marginTop: 1 },
  headerUnread: { color: '#1F9A5A', fontWeight: '700' },
  composeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F5EE', alignItems: 'center', justifyContent: 'center' },

  // Inbox tabs
  inboxTabRow: { flexDirection: 'row', gap: 6, marginBottom: 12, marginTop: 4 },
  inboxTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F3F4F6' },
  inboxTabActive: { backgroundColor: '#14171F' },
  inboxTabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  inboxTabTextActive: { color: '#FFFFFF', fontWeight: '700' },
  inboxTabBadge: { backgroundColor: '#1F9A5A', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  inboxTabBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },

  // Filter pills
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F3F4F6' },
  filterPillActive: { backgroundColor: '#E8F5EE' },
  filterPillText: { fontSize: 11, fontWeight: '600', color: '#9AA1AE' },
  filterPillTextActive: { color: '#1F9A5A', fontWeight: '700' },

  // Error
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 8 },
  errorText: { fontSize: 12, color: '#D97706', fontWeight: '600', flex: 1 },

  // Skeleton
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 0 },
  skeletonAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F1F4' },
  skeletonLine: { height: 12, backgroundColor: '#F0F1F4', borderRadius: 6, width: '80%' },

  // Email row
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingRight: 16, backgroundColor: '#FFFFFF' },
  unreadBar: { width: 3, height: 44, borderRadius: 2, marginRight: 12 },
  rowAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowAvatarText: { fontSize: 16, fontWeight: '800' },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  rowFrom: { fontSize: 14, color: '#6B7280', flex: 1 },
  rowTime: { fontSize: 11, color: '#C7CBD3', marginLeft: 8 },
  rowSubject: { fontSize: 13, color: '#9AA1AE', marginBottom: 2 },
  rowPreview: { fontSize: 12, color: '#C7CBD3' },
  bold: { fontWeight: '800', color: '#14171F' },
  separator: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 71 },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#14171F' },
  emptySub: { fontSize: 13, color: '#9AA1AE' },

  // Thread
  threadHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  threadBack: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  threadHeaderFrom: { fontSize: 15, fontWeight: '700', color: '#14171F' },
  threadHeaderTime: { fontSize: 12, color: '#9AA1AE', marginTop: 1 },
  threadMoreBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },

  threadSubject: { fontSize: 22, fontWeight: '800', color: '#14171F', letterSpacing: -0.4, marginTop: 20, marginBottom: 16, lineHeight: 28 },
  threadSenderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  threadAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  threadAvatarText: { fontSize: 14, fontWeight: '800' },
  threadSenderName: { fontSize: 14, fontWeight: '700', color: '#14171F' },
  threadSenderSub: { fontSize: 12, color: '#9AA1AE' },
  threadDivider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 18 },
  threadBodyLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 20 },
  threadBodyLoadingText: { fontSize: 13, color: '#9AA1AE' },
  threadBody: { fontSize: 15, color: '#374151', lineHeight: 25, marginBottom: 32 },

  // Reply box
  replyBox: { borderWidth: 1.5, borderColor: '#E8F5EE', borderRadius: 20, padding: 16, backgroundColor: '#FAFFFE' },
  replyBoxTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  replyAIBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8F5EE', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  replyAIBadgeText: { fontSize: 12, fontWeight: '700', color: '#1F9A5A' },
  generateBtn: { backgroundColor: '#1F9A5A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  generateBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  replyPlaceholder: { fontSize: 13, color: '#C7CBD3', lineHeight: 20, paddingBottom: 4 },

  draftLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dotRow: { flexDirection: 'row', gap: 4 },
  bounceDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1F9A5A' },
  draftLoadingText: { fontSize: 13, color: '#9AA1AE' },

  draftInput: { fontSize: 14, color: '#14171F', lineHeight: 22, minHeight: 90, marginBottom: 12, padding: 0 },
  replyActions: { flexDirection: 'row', gap: 8 },
  sendBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1F9A5A', borderRadius: 12, paddingVertical: 12 },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  editToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8F5EE', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  editToggleText: { fontSize: 13, fontWeight: '700', color: '#1F9A5A' },
  discardBtn: { backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  discardText: { fontSize: 13, fontWeight: '600', color: '#9AA1AE' },

  // Nav tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10 },
  navTabItem: { flex: 1, alignItems: 'center' },
  navTabLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },
});
