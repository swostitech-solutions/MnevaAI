import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
  useWindowDimensions,
  Animated,
  Linking,
  Image,
  AppState,
  InteractionManager,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useAudioRecorder, AudioModule, RecordingPresets } from "expo-audio";
import * as Speech from "expo-speech";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as FileSystem from "expo-file-system/legacy";
import { apiFetch, peekCachedResponse } from "../api/client";
import { useSocket } from "../services/socket";
import { onAppDataRefresh } from '../services/dataRefresh';
import { useTheme } from '../context/ThemeContext';
const TAB_BAR_CONTENT_HEIGHT = 50;

const INITIAL_MESSAGES = [
  {
    id: "1",
    sender: "ai",
    text: "Hi! I'm Mneva, your AI Chief of Staff. Ask me anything — finance, emails, health, cabs, or just what's on your mind.",
    ts: null,
  },
];

// Shown only on a fresh conversation — the same "here's what I can actually
// do" onboarding pattern real agent products use, instead of a blank input
// box and a wall of text the user has to guess how to use.
const QUICK_PROMPTS = [
  { icon: "calendar",     label: "Schedule a meeting",  prompt: "Schedule a meeting for tomorrow at 5pm" },
  { icon: "credit-card",  label: "Check my finances",   prompt: "Give me a summary of my finances" },
  { icon: "heart",        label: "Health summary",      prompt: "What's my health summary for today?" },
  { icon: "mail",         label: "Check my emails",     prompt: "Do I have any urgent emails today?" },
];

const DURATIONS = [
  { label: "30 min", value: "30" },
  { label: "1 hr",   value: "60" },
  { label: "1.5 hr", value: "90" },
  { label: "2 hr",   value: "120" },
];

function AiAvatar({ theme, styles }) {
  return (
    <LinearGradient
      colors={[theme.accentAlt, theme.accent]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.aiAvatar}
    >
      <Feather name="cpu" size={13} color="#FFFFFF" />
    </LinearGradient>
  );
}

// A small pulsing "the agent is live" cue next to the header subtitle — the
// same visual language used on Priorities/Twin Diary, so this reads as one
// always-on assistant rather than a static screen you send messages into.
function LiveDot({ theme }) {
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
    <View style={{ width: 12, height: 12, alignItems: "center", justifyContent: "center", marginRight: 6 }}>
      <Animated.View style={{ position: "absolute", width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent, opacity: 0.35, transform: [{ scale }] }} />
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: theme.accent }} />
    </View>
  );
}

// Fades + slides in once per message the first time it mounts — since each
// message keeps the same `key`, this never replays on later re-renders, but
// it does play once for messages loaded from history too, which is fine:
// the whole list settling in together reads as intentional, not glitchy.
function FadeInMessage({ children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [anim]);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

function DateSeparator({ ts, styles }) {
  if (!ts) return null;
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  let label;
  if (d.toDateString() === today.toDateString()) label = 'Today';
  else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
  else label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <View style={styles.dateSepRow}>
      <View style={styles.dateSepLine} />
      <Text style={styles.dateSepText}>{label}</Text>
      <View style={styles.dateSepLine} />
    </View>
  );
}

// Shared by the real history fetch and the cache-hydration pass so both
// produce identical message shapes without duplicating the mapping logic.
function normalizeSavedMessages(savedMessages) {
  return Array.isArray(savedMessages)
    ? savedMessages.map(m => ({
        id: m.id,
        sender: m.role === "user" ? "user" : "ai",
        text: m.content,
        ts: m.createdAt || m.ts || new Date().toISOString(),
      }))
    : [];
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function RichText({ text, isUser, styles }) {
  const parts = text.split(URL_REGEX);
  return (
    <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAi}>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <Text key={i} style={isUser ? styles.linkUser : styles.linkAi} onPress={() => Linking.openURL(part)}>
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

// Reveals a fresh AI reply a few characters at a time instead of dumping the
// whole block instantly — this is what actually reads as "the agent is
// composing this", the same cue every real chat-agent product uses. Only
// ever runs once per message (keyed by mount, not by re-render), so history
// loaded from the server renders instantly rather than replaying.
function TypewriterText({ text, isUser, styles, onDone }) {
  const [revealedLen, setRevealedLen] = useState(0);
  useEffect(() => {
    let i = 0;
    const CHARS_PER_TICK = 3;
    const interval = setInterval(() => {
      i += CHARS_PER_TICK;
      if (i >= text.length) {
        setRevealedLen(text.length);
        clearInterval(interval);
        onDone?.();
      } else {
        setRevealedLen(i);
      }
    }, 20);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <RichText text={text.slice(0, revealedLen)} isUser={isUser} styles={styles} />;
}

// Cycles a few "the agent is actively working" phrases while waiting on a
// reply — a plain spinner reads as "frozen"; this reads as "still with you".
const THINKING_PHRASES = ["Thinking…", "Working on it…", "Almost there…"];

function ThinkingDots({ theme }) {
  const anims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = anims.map((val, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(val, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 140),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [anims]);
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {anims.map((val, i) => (
        <Animated.View
          key={i}
          style={{
            width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent,
            opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
            transform: [{ translateY: val.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }}
        />
      ))}
    </View>
  );
}

function ThinkingBubble({ theme, styles }) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhraseIdx(i => (i + 1) % THINKING_PHRASES.length), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={[styles.bubbleRow, styles.bubbleRowAi]}>
      <AiAvatar theme={theme} styles={styles} />
      <View style={[styles.bubble, styles.bubbleAi, styles.thinkingBubble]}>
        <ThinkingDots theme={theme} />
        <Text style={styles.thinkingText}>{THINKING_PHRASES[phraseIdx]}</Text>
      </View>
    </View>
  );
}

function MessageBubble({ message, theme, styles, animate, onDoneTyping, isEditing, editText, onChangeEditText, onStartEdit, onSaveEdit, onCancelEdit }) {
  const isUser = message.sender === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isEditing) {
    return (
      <View style={[styles.bubbleRow, styles.bubbleRowUser]}>
        <View style={[styles.bubble, styles.bubbleUser, styles.bubbleEditing]}>
          <TextInput
            style={styles.editInput}
            value={editText}
            onChangeText={onChangeEditText}
            multiline
            autoFocus
          />
          <View style={styles.editActionsRow}>
            <TouchableOpacity style={styles.editCancelBtn} onPress={onCancelEdit}>
              <Text style={styles.editCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editSaveBtn} onPress={onSaveEdit}>
              <Feather name="corner-down-left" size={12} color={theme.accent} />
              <Text style={styles.editSaveText}>Save &amp; resend</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const isImageAttachment = message.attachment?.type === "image";

  return (
    <View>
      <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAi]}>
        {!isUser && <AiAvatar theme={theme} styles={styles} />}
        <View style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAi,
          isImageAttachment && styles.bubbleImageWrap,
        ]}>
          {!!message.attachment && <AttachmentPreview attachment={message.attachment} theme={theme} styles={styles} />}
          {!!message.text && (
            animate
              ? <TypewriterText text={message.text} isUser={isUser} styles={styles} onDone={onDoneTyping} />
              : <RichText text={message.text} isUser={isUser} styles={styles} />
          )}
        </View>
      </View>
      {/* Always-visible Edit/Copy actions on messages you sent — explicit
          icons instead of a hidden long-press gesture, so the option is
          obvious rather than something the user has to discover. Doesn't
          apply to an attachment-only bubble — there's no text to edit/copy. */}
      {isUser && !!message.text && (
        <View style={styles.msgActionsRow}>
          <TouchableOpacity style={styles.msgActionBtn} onPress={() => onStartEdit(message)}>
            <Feather name="edit-2" size={12} color={theme.faint} />
            <Text style={styles.msgActionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.msgActionBtn} onPress={handleCopy}>
            <Feather name={copied ? "check" : "copy"} size={12} color={copied ? theme.accent : theme.faint} />
            <Text style={[styles.msgActionText, copied && { color: theme.accent }]}>{copied ? "Copied" : "Copy"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// Shows what was actually picked — an inline thumbnail for a photo, a
// filename/type card for a document — instead of only a text confirmation
// once the upload finishes.
function AttachmentPreview({ attachment, theme, styles }) {
  if (attachment.type === "image") {
    return <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} resizeMode="cover" />;
  }
  const ext = (attachment.name || "").split(".").pop()?.toUpperCase().slice(0, 4) || "FILE";
  return (
    <View style={styles.attachmentFileCard}>
      <View style={styles.attachmentFileIconWrap}>
        <Feather name="file-text" size={18} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.attachmentFileName} numberOfLines={1}>{attachment.name}</Text>
        <Text style={styles.attachmentFileType}>{ext} file</Text>
      </View>
    </View>
  );
}

// ── Meeting Scheduler Modal ──────────────────────────────────────────────────
function MeetingModal({ visible, onClose, onCreated, bottomInset, theme, styles }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attendees, setAttendees] = useState("");
  const [duration, setDuration] = useState("60");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fmtDate = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const handleCreate = async () => {
    if (!title.trim()) { setError("Meeting title is required."); return; }
    setError("");
    setLoading(true);
    try {
      const start = new Date(selectedDate);
      start.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
      const end = new Date(start.getTime() + Number(duration) * 60000);
      const attendeeList = attendees ? attendees.split(",").map(s => s.trim()).filter(Boolean) : [];
      const res = await apiFetch("/api/calendar/meetings", {
        method: "POST",
        body: { title, start: start.toISOString(), end: end.toISOString(), description, attendees: attendeeList },
      });
      if (!res.success) throw new Error(res.error || "Failed to create meeting");
      onCreated(res.meeting);
      setTitle(""); setDescription(""); setAttendees(""); setDuration("60");
      setSelectedDate(new Date()); setSelectedTime(new Date());
      onClose();
    } catch (err) {
      setError(err.message || "Could not create meeting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView style={styles.modalSheet} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.modalContent, { paddingBottom: 20 + bottomInset }]}>
          <View style={styles.sheetHandle} />

          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>📅 Schedule Meeting</Text>
              <Text style={styles.modalSubtitle}>Creates event + Google Meet link</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Feather name="x" size={20} color={theme.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.meetBadge}>
            <Feather name="video" size={16} color={theme.accent} />
            <Text style={styles.meetBadgeText}>Google Meet link auto-generated</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>Meeting Title *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Team Standup, Client Call…"
              placeholderTextColor={theme.placeholder}
              value={title}
              onChangeText={setTitle}
            />

            {/* Date picker */}
            <Text style={styles.fieldLabel}>Date *</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
              <Feather name="calendar" size={16} color={theme.accent} />
              <Text style={styles.pickerBtnText}>{fmtDate(selectedDate)}</Text>
              <Feather name="chevron-down" size={16} color={theme.faint} />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                minimumDate={new Date()}
                onChange={(e, date) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (date) setSelectedDate(date);
                }}
              />
            )}
            {Platform.OS === "ios" && showDatePicker && (
              <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.pickerDoneBtnText}>Done</Text>
              </TouchableOpacity>
            )}

            {/* Time picker */}
            <Text style={styles.fieldLabel}>Time *</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimePicker(true)}>
              <Feather name="clock" size={16} color={theme.accent} />
              <Text style={styles.pickerBtnText}>{fmtTime(selectedTime)}</Text>
              <Feather name="chevron-down" size={16} color={theme.faint} />
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePicker
                value={selectedTime}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(e, time) => {
                  setShowTimePicker(Platform.OS === "ios");
                  if (time) setSelectedTime(time);
                }}
              />
            )}
            {Platform.OS === "ios" && showTimePicker && (
              <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowTimePicker(false)}>
                <Text style={styles.pickerDoneBtnText}>Done</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.fieldLabel}>Duration</Text>
            <View style={styles.chipRow}>
              {DURATIONS.map(d => (
                <TouchableOpacity
                  key={d.value}
                  style={[styles.durationChip, duration === d.value && styles.durationChipActive]}
                  onPress={() => setDuration(d.value)}
                >
                  <Text style={[styles.durationChipText, duration === d.value && styles.durationChipTextActive]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Attendees (comma-separated emails)</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="alice@example.com, bob@example.com"
              placeholderTextColor={theme.placeholder}
              value={attendees}
              onChangeText={setAttendees}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Description / Agenda</Text>
            <TextInput
              style={[styles.fieldInput, { height: 64, textAlignVertical: "top" }]}
              placeholder="Optional agenda or notes…"
              placeholderTextColor={theme.placeholder}
              value={description}
              onChangeText={setDescription}
              multiline
            />

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.createBtn, loading && { opacity: 0.6 }]}
                onPress={handleCreate}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={styles.createBtnText}>📹 Create Meeting + Meet Link</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function AskAI({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const scrollRef = useRef(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef(null);

  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachModal, setAttachModal] = useState(false);
  const [meetModal, setMeetModal] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { id, summary, tool, args }
  const [liveTypingId, setLiveTypingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const voiceEnabledRef = useRef(true);
  const conversationIdRef = useRef(null);
  const aiLoadingRef = useRef(false);
  const initialHistoryPositioningRef = useRef(false);
  const hasRealHistoryRef = useRef(false);
  const { on, emit } = useSocket();

  // History arrives asynchronously. Waiting for both React's layout pass and
  // any navigation animation prevents the chat from opening at message one.
  const scrollToLatest = useCallback((animated = false) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
      InteractionManager.runAfterInteractions(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
      });
    });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 250);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 750);
  }, []);

  // ── Load conversation history from backend (same as web app) ─────────────
  const loadConversation = useCallback(async () => {
    // Never replace the visible conversation while a reply is in flight.
    if (aiLoadingRef.current) return;
    try {
      const list = await apiFetch("/api/conversations");
      const conversations = Array.isArray(list) ? list : list.conversations || [];

      let convId;
      if (conversations.length === 0) {
        const created = await apiFetch("/api/conversations", {
          method: "POST",
          body: { title: "New Conversation" },
        });
        convId = created.id;
      } else {
        convId = conversations[0].id;
      }
      conversationIdRef.current = convId;

      const savedMessages = await apiFetch(`/api/messages/${convId}`);
      const normalized = normalizeSavedMessages(savedMessages);
      hasRealHistoryRef.current = true;

      if (normalized.length) {
        initialHistoryPositioningRef.current = true;
        setMessages(normalized);
        scrollToLatest(false);
      }
    } catch {
      // Keep the current chat on screen; the shared recovery flow will retry.
    }
  }, [scrollToLatest]);

  // Paint the last known conversation immediately from cache — otherwise this
  // screen always shows the generic welcome message for however long the
  // conversation-list → messages round-trip takes, even for a returning user
  // who was mid-conversation. This never touches the network and never
  // creates a conversation — it only walks the cached list/messages that a
  // previous real fetch already wrote. loadConversation() above still runs
  // right after and silently replaces this with fresh data; the ref guard
  // stops a slow cache read from ever clobbering real data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cachedList = await peekCachedResponse("/api/conversations").catch(() => null);
      if (cancelled || hasRealHistoryRef.current || !cachedList) return;
      const conversations = Array.isArray(cachedList) ? cachedList : cachedList.conversations || [];
      const convId = conversations[0]?.id;
      if (!convId) return;
      const cachedMessages = await peekCachedResponse(`/api/messages/${convId}`).catch(() => null);
      if (cancelled || hasRealHistoryRef.current || !cachedMessages) return;
      const normalized = normalizeSavedMessages(cachedMessages);
      if (normalized.length) {
        conversationIdRef.current = convId;
        initialHistoryPositioningRef.current = true;
        setMessages(normalized);
        scrollToLatest(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scrollToLatest]);

  useEffect(() => { loadConversation(); }, [loadConversation]);
  useEffect(() => onAppDataRefresh(loadConversation), [loadConversation]);
  useEffect(() => { aiLoadingRef.current = aiLoading; }, [aiLoading]);
  useEffect(() => {
    if (!initialHistoryPositioningRef.current) return undefined;
    scrollToLatest(false);
    const done = setTimeout(() => { initialHistoryPositioningRef.current = false; }, 1200);
    return () => clearTimeout(done);
  }, [messages, scrollToLatest]);

  const persistMessage = async (role, content) => {
    const convId = conversationIdRef.current;
    if (!convId || !content) return;
    try {
      await apiFetch("/api/messages", {
        method: "POST",
        body: { conversationId: convId, role, content },
      });
    } catch {}
  };

  const clearHistory = async () => {
    setMessages(INITIAL_MESSAGES);
  };

  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const horizontalPad = width < 360 ? 16 : 20;

  // Pulse animation while recording
  useEffect(() => {
    if (recording) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [recording]);

  const addMessage = (msg) => {
    setMessages(prev => [...prev, msg]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 400);
  };

  const speakText = (text) => {
    if (!voiceEnabledRef.current) return;
    Speech.stop();
    const clean = text
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA9F}\u{FE00}-\u{FEFF}]/gu, '')
      .replace(/[*_`#~>|\-=+\[\]{}\\^]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!clean) return;

    // Auto-detect language from response text
    const detectLang = (t) => {
      if (/[\u0900-\u097F]/.test(t)) return 'hi-IN';  // Hindi/Devanagari
      if (/[\u0C00-\u0C7F]/.test(t)) return 'te-IN';  // Telugu
      if (/[\u0B80-\u0BFF]/.test(t)) return 'ta-IN';  // Tamil
      if (/[\u0C80-\u0CFF]/.test(t)) return 'kn-IN';  // Kannada
      if (/[\u0D00-\u0D7F]/.test(t)) return 'ml-IN';  // Malayalam
      if (/[\u0980-\u09FF]/.test(t)) return 'bn-IN';  // Bengali
      if (/[\u0A00-\u0A7F]/.test(t)) return 'pa-IN';  // Punjabi
      if (/[\u0B00-\u0B7F]/.test(t)) return 'or-IN';  // Odia
      if (/[\u0900-\u097F]/.test(t)) return 'mr-IN';  // Marathi
      return 'en-IN';
    };
    const lang = detectLang(clean);

    setSpeaking(true);
    Speech.speak(clean, {
      language: lang,
      pitch: 1.0,
      rate: 0.95,
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
    });
  };

  const stopSpeaking = () => {
    Speech.stop();
    setSpeaking(false);
  };

  const toggleVoice = () => {
    const next = !voiceEnabledRef.current;
    voiceEnabledRef.current = next;
    setVoiceEnabled(next);
    if (!next) stopSpeaking();
  };

  // Stop speech on unmount, navigation away, or app going to background
  useEffect(() => {
    const stopAll = () => { Speech.stop(); setSpeaking(false); };

    // App goes to background (home button / switch app)
    const appStateSub = AppState.addEventListener('change', state => {
      if (state !== 'active') stopAll();
    });

    // Navigate away to another tab/screen
    const unsubBlur = navigation?.addListener?.('blur', stopAll);

    // Component unmounts
    return () => {
      stopAll();
      appStateSub.remove();
      unsubBlur?.();
    };
  }, [navigation]);

  // `historyBase` lets an edited-and-resent message rebuild from a truncated
  // history instead of the current `messages` state — needed because the
  // truncation from handleSaveEdit is a scheduled state update, not yet
  // visible to this closure if we read `messages` directly right after it.
  const handleSend = async (text, historyBase) => {
    const content = (text || input).trim();
    if (!content || aiLoading) return;
    if (!text) setInput("");

    const baseMessages = historyBase || messages;
    const userMsg = { id: String(Date.now()), sender: "user", text: content, ts: new Date().toISOString() };
    const updatedMessages = [...baseMessages, userMsg];
    setMessages(updatedMessages);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    await persistMessage("user", content);

    setAiLoading(true);
    try {
      const apiMessages = updatedMessages.map(m => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      }));
      const res = await apiFetch("/api/agent/chat", {
        method: "POST",
        body: { messages: apiMessages },
        // The agent loop can run up to 10 sequential tool-calling iterations
        // against OpenAI plus real tool execution per turn — the default 15s
        // timeout could abort a genuinely-still-working request and show a
        // false "could not connect" for a complex, multi-step ask.
        timeoutMs: 60000,
      });
      const aiText = res.response || res.reply || res.message || res.content || "I processed your request.";
      const aiMsgId = String(Date.now() + 1);
      addMessage({ id: aiMsgId, sender: "ai", text: aiText, ts: new Date().toISOString() });
      setLiveTypingId(aiMsgId);
      await persistMessage("assistant", aiText);
      speakText(aiText);
      setAiLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 500);
    } catch (err) {
      addMessage({ id: String(Date.now() + 1), sender: "ai", text: "Sorry, I could not connect to the AI right now. Please try again." });
      setAiLoading(false);
    }
  };

  // ── Edit a sent question — truncates local + server history from that
  // point on, then resends the edited text as a fresh turn ──────────────────
  const handleStartEdit = (message) => {
    if (aiLoading) return;
    Speech.stop();
    setSpeaking(false);
    setEditingId(message.id);
    setEditingText(message.text);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const handleSaveEdit = async () => {
    const newText = editingText.trim();
    if (!newText) return;
    const idx = messages.findIndex(m => m.id === editingId);
    if (idx === -1) { handleCancelEdit(); return; }
    const targetId = editingId;
    const truncated = messages.slice(0, idx);
    setMessages(truncated);
    handleCancelEdit();
    const convId = conversationIdRef.current;
    if (convId) {
      apiFetch(`/api/messages/${convId}/from/${targetId}`, { method: "DELETE" }).catch(() => {});
    }
    await handleSend(newText, truncated);
  };

  // ── Voice recording (expo-audio → backend transcription) ──────────────────
  const startRecording = async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        addMessage({ id: String(Date.now()), sender: 'ai', text: 'Microphone permission denied. Please enable it in Settings.' });
        return;
      }
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecording(true);
    } catch {
      addMessage({ id: String(Date.now()), sender: 'ai', text: 'Could not start recording. Please try again.' });
    }
  };

  const stopRecording = async () => {
    setRecording(false);
    setTranscribing(true);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error('No recording URI');

      // Read as base64 and send as JSON — avoids React Native FormData binary issues
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const data = await apiFetch('/api/agent/transcribe', {
        method: 'POST',
        body: { audioBase64: base64, fileName: 'voice.m4a', mimeType: 'audio/m4a' },
      });
      if (data?.text) {
        await handleSend(data.text);
      } else {
        addMessage({ id: String(Date.now()), sender: 'ai', text: 'Could not transcribe audio. Please type your message instead.' });
      }
    } catch {
      addMessage({ id: String(Date.now()), sender: 'ai', text: 'Transcription failed. Please type your message.' });
    } finally {
      setTranscribing(false);
    }
  };

  const handleMicPress = () => {
    if (recording) {
      stopRecording();
    } else {
      Speech.stop();
      setSpeaking(false);
      startRecording();
    }
  };

  // ── Shared upload handler (same as web's handleFileChange) ─────────────────
  const uploadFile = async (uri, name, mimeType) => {
    setUploading(true);
    setAttachModal(false);
    const isImage = (mimeType || "").startsWith("image/");
    // Show what was actually picked as its own message bubble \u2014 previously
    // the only feedback was a text line ("Uploading X\u2026"), with no visual
    // trace of the file/photo itself anywhere in the conversation.
    addMessage({
      id: String(Date.now()),
      sender: "user",
      attachment: { type: isImage ? "image" : "document", uri, name, mimeType },
      ts: new Date().toISOString(),
    });
    addMessage({ id: String(Date.now() + 1), sender: "ai", text: `Uploading ${name}\u2026` });
    try {
      // Read file as base64 and send as JSON — avoids React Native FormData binary issues
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const data = await apiFetch('/api/documents/upload', {
        method: "POST",
        body: { fileBase64: base64, fileName: name, mimeType: mimeType || 'application/octet-stream' },
      });

      const chunks = data.chunks || 0;
      const msg = chunks > 0
        ? `\u2705 Uploaded and indexed **${name}** (${chunks} chunk${chunks > 1 ? 's' : ''}). You can now ask me questions about its content.`
        : `Uploaded ${name}. ${data.note || 'No readable text was found in the file.'}`;

      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { id: String(Date.now()), sender: "ai", text: msg, ts: new Date().toISOString() };
        return copy;
      });
    } catch (err) {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { id: String(Date.now()), sender: "ai", text: `Upload failed: ${err.message}`, ts: new Date().toISOString() };
        return copy;
      });
    } finally {
      setUploading(false);
    }
  };

  // ── Document picker ───────────────────────────────────────────────────────
  const handleDocUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/*", "application/json",
               "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      await uploadFile(file.uri, file.name, file.mimeType);
    } catch {
      addMessage({ id: String(Date.now()), sender: "ai", text: "Document upload failed. Please try again.", ts: new Date().toISOString() });
    }
  };

  // ── Image picker (camera roll or camera) ──────────────────────────────────
  const handleImageUpload = async (useCamera = false) => {
    try {
      let result;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          addMessage({ id: String(Date.now()), sender: "ai", text: "Camera permission denied. Please enable it in Settings.", ts: new Date().toISOString() });
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          addMessage({ id: String(Date.now()), sender: "ai", text: "Photo library permission denied. Please enable it in Settings.", ts: new Date().toISOString() });
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
      }
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const name = asset.fileName || `photo_${Date.now()}.jpg`;
      const mimeType = asset.mimeType || "image/jpeg";
      await uploadFile(asset.uri, name, mimeType);
    } catch {
      addMessage({ id: String(Date.now()), sender: "ai", text: "Image upload failed. Please try again.", ts: new Date().toISOString() });
    }
  };

  // ── Meeting created callback ───────────────────────────────────────────────
  const handleMeetingCreated = (meeting) => {
    const start = meeting.start ? new Date(meeting.start) : null;
    const end   = meeting.end   ? new Date(meeting.end)   : null;
    const dateStr = start
      ? start.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
      : "";
    const timeStr = start
      ? start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
      : "";
    const durationMin = start && end ? Math.round((end - start) / 60000) : null;
    const durationStr = durationMin
      ? durationMin >= 60
        ? `${Math.floor(durationMin / 60)}h${durationMin % 60 ? ` ${durationMin % 60}m` : ""}`
        : `${durationMin} min`
      : "";
    const attendees = Array.isArray(meeting.attendees) && meeting.attendees.length
      ? meeting.attendees.join(", ")
      : null;
    const desc = meeting.description?.trim() || null;

    const lines = [
      `Meeting scheduled! ✅`,
      dateStr   ? `\n🗓  ${dateStr}` : null,
      timeStr   ? `🕐 ${timeStr}${durationStr ? `  ·  ${durationStr}` : ""}` : null,
      attendees ? `👥 ${attendees}` : null,
      desc      ? `📝 ${desc}` : null,
      meeting.meetLink ? `\n📹 ${meeting.meetLink}` : null,
    ].filter(Boolean).join("\n");

    addMessage({ id: String(Date.now()), sender: "ai", text: lines, ts: new Date().toISOString() });
    persistMessage("assistant", lines);
  };

  const handleApprove = () => {
    if (!pendingAction) return;
    emit('action:approve', { actionId: pendingAction.id });
    addMessage({ id: String(Date.now()), sender: 'ai', text: `✅ Action approved: ${pendingAction.summary}`, ts: new Date().toISOString() });
    setPendingAction(null);
  };

  const handleDeny = () => {
    if (!pendingAction) return;
    emit('action:deny', { actionId: pendingAction.id });
    addMessage({ id: String(Date.now()), sender: 'ai', text: `❌ Action cancelled.`, ts: new Date().toISOString() });
    setPendingAction(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[styles.header, { paddingHorizontal: horizontalPad }]}>
          <View style={styles.headerBrandRow}>
            <LinearGradient
              colors={[theme.accentAlt, theme.accent]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.headerBadge}
            >
              <Feather name="cpu" size={18} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Ask Mneva</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <LiveDot theme={theme} />
                <Text style={styles.headerSubtitle}>Voice, docs, or type — I'm ready</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerActionsRow}>
            {/* Stop speaking button — only visible while speaking */}
            {speaking && (
              <TouchableOpacity
                style={[styles.scheduleBtn, { backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : 'rgba(224,84,110,0.1)', borderColor: theme.isDark ? 'rgba(241,113,134,0.4)' : 'rgba(224,84,110,0.3)' }]}
                onPress={stopSpeaking}
              >
                <Feather name="square" size={13} color={theme.danger} />
                <Text style={[styles.scheduleBtnText, { color: theme.danger }]}>Stop</Text>
              </TouchableOpacity>
            )}
            {/* Voice toggle */}
            <TouchableOpacity
              style={[styles.scheduleBtn, { backgroundColor: voiceEnabled ? (theme.isDark ? 'rgba(52,199,123,0.16)' : 'rgba(31,154,90,0.1)') : (theme.isDark ? 'rgba(154,161,174,0.16)' : 'rgba(155,161,174,0.1)'), borderColor: voiceEnabled ? (theme.isDark ? 'rgba(52,199,123,0.4)' : 'rgba(31,154,90,0.3)') : (theme.isDark ? 'rgba(154,161,174,0.4)' : 'rgba(155,161,174,0.3)') }]}
              onPress={() => { toggleVoice(); }}
            >
              <Feather name={voiceEnabled ? "volume-2" : "volume-x"} size={13} color={voiceEnabled ? theme.accent : theme.faint} />
              <Text style={[styles.scheduleBtnText, { color: voiceEnabled ? theme.accent : theme.faint }]}>
                {voiceEnabled ? 'Voice On' : 'Voice Off'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.scheduleBtn} onPress={() => setMeetModal(true)}>
              <Feather name="calendar" size={14} color={theme.accent} />
              <Text style={styles.scheduleBtnText}>Schedule</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad }]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => {
            if (initialHistoryPositioningRef.current) scrollToLatest(false);
          }}
          onLayout={() => {
            if (initialHistoryPositioningRef.current) scrollToLatest(false);
          }}
        >
          {messages.map((m, idx) => {
            const prev = messages[idx - 1];
            const showDate = !prev || (m.ts && prev.ts &&
              new Date(m.ts).toDateString() !== new Date(prev.ts).toDateString()) ||
              (!prev.ts && m.ts);
            return (
              <FadeInMessage key={m.id}>
                {showDate && <DateSeparator ts={m.ts} styles={styles} />}
                <MessageBubble
                  message={m}
                  theme={theme}
                  styles={styles}
                  animate={m.id === liveTypingId}
                  onDoneTyping={() => setLiveTypingId(null)}
                  isEditing={m.id === editingId}
                  editText={editingText}
                  onChangeEditText={setEditingText}
                  onStartEdit={handleStartEdit}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                />
              </FadeInMessage>
            );
          })}
          {messages.length === 1 && !aiLoading && !transcribing && (
            <View style={styles.suggestWrap}>
              <Text style={styles.suggestLabel}>TRY ASKING</Text>
              <View style={styles.suggestGrid}>
                {QUICK_PROMPTS.map(q => (
                  <TouchableOpacity key={q.label} style={styles.suggestChip} onPress={() => handleSend(q.prompt)}>
                    <View style={styles.suggestIconWrap}>
                      <Feather name={q.icon} size={14} color={theme.accent} />
                    </View>
                    <Text style={styles.suggestChipText}>{q.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {transcribing && (
            <View style={[styles.bubbleRow, styles.bubbleRowAi]}>
              <AiAvatar theme={theme} styles={styles} />
              <View style={[styles.bubble, styles.bubbleAi, { paddingVertical: 16, paddingHorizontal: 20 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color={theme.accent} />
                  <Text style={{ fontSize: 12, color: theme.faint }}>Transcribing…</Text>
                </View>
              </View>
            </View>
          )}
          {aiLoading && !transcribing && <ThinkingBubble theme={theme} styles={styles} />}
        </ScrollView>

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingHorizontal: horizontalPad, paddingBottom: 12 }]}>
          {/* Attachment button — opens picker modal */}
          <TouchableOpacity style={styles.iconButton} onPress={() => setAttachModal(true)} disabled={uploading}>
            <Feather name={uploading ? "loader" : "paperclip"} size={20} color={uploading ? theme.accent : theme.muted} />
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder="Ask anything or use voice"
            placeholderTextColor={theme.placeholder}
            value={input}
            onChangeText={setInput}
            multiline
          />

          {/* Mic button — pulses red while recording */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[styles.micButton, recording && styles.micButtonActive]}
              onPress={handleMicPress}
              disabled={transcribing}
            >
              <Feather name={recording ? "square" : "mic"} size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={styles.sendButton}
            onPress={() => handleSend()}
            disabled={!input.trim() || aiLoading}
          >
            {input.trim() && !aiLoading ? (
              <LinearGradient
                colors={[theme.accentAlt, theme.accent]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.sendButtonInner}
              >
                <Feather name="arrow-up" size={18} color="#FFFFFF" />
              </LinearGradient>
            ) : (
              <View style={[styles.sendButtonInner, styles.sendButtonDisabled]}>
                <Feather name="arrow-up" size={18} color={theme.disabled} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
          <TouchableOpacity style={styles.tabItem} onPress={() => { Speech.stop(); setSpeaking(false); navigation?.navigate?.("Home"); }}>
            <Ionicons name="home" size={22} color={theme.faint} />
            <Text style={styles.tabLabel}>HOME</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => { Speech.stop(); setSpeaking(false); navigation?.navigate?.("Priorities"); }}>
            <Feather name="calendar" size={22} color={theme.faint} />
            <Text style={styles.tabLabel}>PRIORITIES</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem}>
            <Feather name="mic" size={22} color={theme.accent} />
            <Text style={[styles.tabLabel, styles.tabLabelActive]}>ASK AI</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => { Speech.stop(); setSpeaking(false); navigation?.navigate?.("Space"); }}>
            <Feather name="folder" size={22} color={theme.faint} />
            <Text style={styles.tabLabel}>SPACE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => { Speech.stop(); setSpeaking(false); navigation?.navigate?.("Profile"); }}>
            <Feather name="user" size={22} color={theme.faint} />
            <Text style={styles.tabLabel}>PROFILE</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Action approve/deny card */}
      {pendingAction && (
        <Modal visible transparent animationType="fade" onRequestClose={handleDeny}>
          <View style={styles.actionOverlay}>
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>⚡ Action Required</Text>
              <Text style={styles.actionSummary}>{pendingAction.summary}</Text>
              <View style={styles.actionBtns}>
                <TouchableOpacity style={styles.approveBtn} onPress={handleApprove}>
                  <Feather name="check" size={15} color="#fff" />
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.denyBtn} onPress={handleDeny}>
                  <Feather name="x" size={15} color={theme.danger} />
                  <Text style={styles.denyBtnText}>Deny</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <MeetingModal
        visible={meetModal}
        onClose={() => setMeetModal(false)}
        onCreated={handleMeetingCreated}
        bottomInset={insets.bottom}
        theme={theme}
        styles={styles}
      />

      {/* Attachment picker modal */}
      <Modal visible={attachModal} transparent animationType="fade" onRequestClose={() => setAttachModal(false)}>
        <TouchableWithoutFeedback onPress={() => setAttachModal(false)}>
          <View style={styles.attachOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.attachSheet, { paddingBottom: 16 + insets.bottom }]}>
                <View style={styles.sheetHandle} />
                <Text style={styles.attachTitle}>Add Attachment</Text>
                <Text style={styles.attachSubtitle}>Upload a file or image — Mneva will read and index it so you can ask questions about it</Text>

                <TouchableOpacity style={styles.attachOption} onPress={handleDocUpload}>
                  <View style={[styles.attachIcon, { backgroundColor: theme.isDark ? 'rgba(107,184,240,0.16)' : "rgba(61,139,255,0.1)" }]}>
                    <Feather name="file-text" size={22} color={theme.info} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attachOptionTitle}>Document</Text>
                    <Text style={styles.attachOptionSub}>PDF, DOCX, TXT, CSV, JSON…</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={theme.faint} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.attachOption} onPress={() => handleImageUpload(false)}>
                  <View style={[styles.attachIcon, { backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : "rgba(31,154,90,0.1)" }]}>
                    <Feather name="image" size={22} color={theme.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attachOptionTitle}>Photo Library</Text>
                    <Text style={styles.attachOptionSub}>Pick an image — OCR extracts text</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={theme.faint} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.attachOption} onPress={() => handleImageUpload(true)}>
                  <View style={[styles.attachIcon, { backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : "rgba(155,114,255,0.1)" }]}>
                    <Feather name="camera" size={22} color={theme.accentAlt} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attachOptionTitle}>Camera</Text>
                    <Text style={styles.attachOptionSub}>Take a photo — OCR extracts text</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={theme.faint} />
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerBrandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  headerBadge: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    shadowColor: theme.accentAlt, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  headerActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  headerTitle: { fontSize: 26, fontWeight: "800", color: theme.text, marginBottom: 4, letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 13, color: theme.faint },
  scheduleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : "rgba(31,154,90,0.1)",
    borderWidth: 1,
    borderColor: theme.isDark ? 'rgba(52,199,123,0.4)' : "rgba(31,154,90,0.3)",
  },
  scheduleBtnText: { fontSize: 12, fontWeight: "700", color: theme.accent },
  container: { flex: 1 },
  scrollContent: { paddingTop: 8, paddingBottom: 16 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 16 },
  bubbleRowAi: { justifyContent: "flex-start" },
  bubbleRowUser: { justifyContent: "flex-end" },
  aiAvatar: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    marginRight: 8,
    shadowColor: theme.accentAlt, shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  bubble: {
    maxWidth: "86%", borderRadius: 20, paddingHorizontal: 18, paddingVertical: 14,
    shadowColor: "#0F1720", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  bubbleAi: { backgroundColor: theme.card, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: theme.border },
  bubbleUser: { backgroundColor: theme.accent, borderBottomRightRadius: 6 },
  bubbleTextAi: { fontSize: 14.5, lineHeight: 21, color: theme.textSecondary },
  bubbleTextUser: { fontSize: 14.5, lineHeight: 21, color: "#FFFFFF" },

  // ── Attachment preview (what was actually uploaded) ───────────────────────
  bubbleImageWrap: { padding: 4 },
  attachmentImage: { width: 200, height: 200, borderRadius: 16 },
  attachmentFileCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 14, padding: 10, minWidth: 190,
  },
  attachmentFileIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  attachmentFileName: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  attachmentFileType: { fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 1 },
  linkAi: {
    fontSize: 14.5, lineHeight: 21,
    color: theme.accent,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  linkUser: {
    fontSize: 14.5, lineHeight: 21,
    color: "#ADFFD4",
    fontWeight: "700",
    textDecorationLine: "underline",
  },

  // ── Thinking indicator ─────────────────────────────────────────────────────
  thinkingBubble: {
    flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 15, paddingHorizontal: 18,
    backgroundColor: theme.isDark ? "rgba(52,199,123,0.10)" : "#F5FBF8",
    borderColor: theme.isDark ? "rgba(52,199,123,0.25)" : "#DFF3E7",
  },
  thinkingText: { fontSize: 12.5, fontWeight: "600", color: theme.faint },

  // ── Edit-and-resend (explicit Edit/Copy row under a sent message) ─────────
  bubbleEditing: { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.4)" },
  editInput: { fontSize: 14.5, lineHeight: 21, color: "#FFFFFF", minHeight: 40, padding: 0 },
  editActionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: 14, marginTop: 10 },
  editCancelBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  editCancelText: { fontSize: 12.5, fontWeight: "700", color: "rgba(255,255,255,0.75)" },
  editSaveBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFFFFF", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  editSaveText: { fontSize: 12.5, fontWeight: "800", color: theme.accent },
  msgActionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: 14, marginTop: 5, marginBottom: 4 },
  msgActionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 2 },
  msgActionText: { fontSize: 11, fontWeight: "600", color: theme.faint },

  // ── Quick-prompt suggestions (fresh conversation only) ────────────────────
  suggestWrap: { marginTop: 4, marginBottom: 8 },
  suggestLabel: { fontSize: 11, fontWeight: "800", color: theme.faint, letterSpacing: 0.8, marginBottom: 10, marginLeft: 34 },
  suggestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginLeft: 34 },
  suggestChip: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: theme.card, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 13,
    borderWidth: 1, borderColor: theme.border,
  },
  suggestIconWrap: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: theme.isDark ? "rgba(52,199,123,0.16)" : "#EFFDF6",
    alignItems: "center", justifyContent: "center",
  },
  suggestChipText: { fontSize: 12.5, fontWeight: "600", color: theme.textSecondary },

  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    backgroundColor: theme.bg,
  },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  textInput: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.text,
    maxHeight: 100,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  micButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.disabled,
    alignItems: "center", justifyContent: "center",
    marginLeft: 4,
  },
  micButtonActive: { backgroundColor: theme.danger },
  sendButton: {
    width: 36, height: 36, borderRadius: 18,
    marginLeft: 8,
    shadowColor: theme.accent, shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sendButtonInner: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  sendButtonDisabled: { backgroundColor: theme.border, shadowOpacity: 0 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: theme.card,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 10,
  },
  tabItem: { flex: 1, alignItems: "center" },
  tabLabel: { fontSize: 10, fontWeight: "700", color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
  tabLabelActive: { color: theme.accent },

  // ── Action card ────────────────────────────────────────────────────────────
  actionOverlay: {
    flex: 1, backgroundColor: theme.overlay,
    alignItems: 'center', justifyContent: 'center',
  },
  actionCard: {
    width: 320, backgroundColor: theme.card, borderRadius: 20,
    padding: 22, marginHorizontal: 20,
  },
  actionTitle: { fontSize: 16, fontWeight: '800', color: theme.text, marginBottom: 10 },
  actionSummary: { fontSize: 13.5, color: theme.textSecondary, lineHeight: 20, marginBottom: 18 },
  actionBtns: { flexDirection: 'row', gap: 10 },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 12,
  },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  denyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : 'rgba(224,84,110,0.1)', borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: theme.isDark ? 'rgba(241,113,134,0.4)' : 'rgba(224,84,110,0.3)',
  },
  denyBtnText: { color: theme.danger, fontSize: 13, fontWeight: '700' },

  // ── Meeting Modal ──────────────────────────────────────────────────────────
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.overlay },
  modalSheet: { position: "absolute", bottom: 0, left: 0, right: 0 },
  modalContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "92%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: theme.borderStrong,
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text },
  modalSubtitle: { fontSize: 12, color: theme.faint, marginTop: 2 },
  modalClose: { padding: 4 },
  meetBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : "rgba(31,154,90,0.08)",
    borderWidth: 1,
    borderColor: theme.isDark ? 'rgba(52,199,123,0.4)' : "rgba(31,154,90,0.2)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 16,
  },
  meetBadgeText: { fontSize: 12, fontWeight: "700", color: theme.accent },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: theme.muted, marginBottom: 5, marginTop: 10 },
  fieldInput: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: theme.text,
  },
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  pickerBtnText: { flex: 1, fontSize: 14, fontWeight: "600", color: theme.text },
  pickerDoneBtn: {
    alignSelf: "flex-end",
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.accent,
    borderRadius: 10,
  },
  pickerDoneBtnText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  row: { flexDirection: "row" },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  durationChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    backgroundColor: theme.surfaceAlt,
    alignItems: "center",
  },
  durationChipActive: { backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : "rgba(31,154,90,0.12)", borderColor: theme.accent },
  durationChipText: { fontSize: 12, fontWeight: "600", color: theme.muted },
  durationChipTextActive: { color: theme.accent },
  errorText: { fontSize: 12, color: theme.danger, marginTop: 8 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 20 },
  createBtn: {
    flex: 1,
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: theme.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "700", color: theme.textSecondary },

  // ── Attachment Modal ───────────────────────────────────────────────────────
  attachOverlay: {
    flex: 1,
    backgroundColor: theme.overlay,
    justifyContent: "flex-end",
  },
  attachSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  attachTitle: { fontSize: 18, fontWeight: "800", color: theme.text, marginBottom: 4, marginTop: 8 },
  attachSubtitle: { fontSize: 12, color: theme.faint, marginBottom: 16, lineHeight: 17 },
  attachOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.soft,
  },
  attachIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  attachOptionTitle: { fontSize: 15, fontWeight: "700", color: theme.text },
  attachOptionSub: { fontSize: 12, color: theme.faint, marginTop: 2 },

  // ── Date separator ─────────────────────────────────────────────────────────
  dateSepRow: { flexDirection: "row", alignItems: "center", marginVertical: 12 },
  dateSepLine: { flex: 1, height: 1, backgroundColor: theme.border },
  dateSepText: { fontSize: 11, color: theme.faint, fontWeight: "600", marginHorizontal: 10 },
});
