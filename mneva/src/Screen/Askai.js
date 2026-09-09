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
import { Ionicons, Feather } from "@expo/vector-icons";
import { useAudioRecorder, AudioModule, RecordingPresets } from "expo-audio";
import * as Speech from "expo-speech";
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

const DURATIONS = [
  { label: "30 min", value: "30" },
  { label: "1 hr",   value: "60" },
  { label: "1.5 hr", value: "90" },
  { label: "2 hr",   value: "120" },
];

function AiAvatar({ theme, styles }) {
  return (
    <View style={styles.aiAvatar}>
      <Feather name="sun" size={14} color={theme.accent} />
    </View>
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

function MessageBubble({ message, theme, styles }) {
  const isUser = message.sender === "user";
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAi]}>
      {!isUser && <AiAvatar theme={theme} styles={styles} />}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
        <RichText text={message.text} isUser={isUser} styles={styles} />
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
      <KeyboardAvoidingView style={styles.modalSheet} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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

  const handleSend = async (text) => {
    const content = (text || input).trim();
    if (!content || aiLoading) return;
    if (!text) setInput("");

    const userMsg = { id: String(Date.now()), sender: "user", text: content, ts: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
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
      });
      const aiText = res.response || res.reply || res.message || res.content || "I processed your request.";
      addMessage({ id: String(Date.now() + 1), sender: "ai", text: aiText, ts: new Date().toISOString() });
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
    addMessage({ id: String(Date.now()), sender: "ai", text: `Uploading ${name}\u2026` });
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
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Ask Mneva</Text>
            <Text style={styles.headerSubtitle}>Voice, docs, or type — I'm ready</Text>
          </View>
          {/* Stop speaking button — only visible while speaking */}
          {speaking && (
            <TouchableOpacity
              style={[styles.scheduleBtn, { marginRight: 8, backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : 'rgba(224,84,110,0.1)', borderColor: theme.isDark ? 'rgba(241,113,134,0.4)' : 'rgba(224,84,110,0.3)' }]}
              onPress={stopSpeaking}
            >
              <Feather name="square" size={13} color={theme.danger} />
              <Text style={[styles.scheduleBtnText, { color: theme.danger }]}>Stop</Text>
            </TouchableOpacity>
          )}
          {/* Voice toggle */}
          <TouchableOpacity
            style={[styles.scheduleBtn, { marginRight: 8, backgroundColor: voiceEnabled ? (theme.isDark ? 'rgba(52,199,123,0.16)' : 'rgba(31,154,90,0.1)') : (theme.isDark ? 'rgba(154,161,174,0.16)' : 'rgba(155,161,174,0.1)'), borderColor: voiceEnabled ? (theme.isDark ? 'rgba(52,199,123,0.4)' : 'rgba(31,154,90,0.3)') : (theme.isDark ? 'rgba(154,161,174,0.4)' : 'rgba(155,161,174,0.3)') }]}
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
              <View key={m.id}>
                {showDate && <DateSeparator ts={m.ts} styles={styles} />}
                <MessageBubble message={m} theme={theme} styles={styles} />
              </View>
            );
          })}
          {(aiLoading || transcribing) && (
            <View style={[styles.bubbleRow, styles.bubbleRowAi]}>
              <AiAvatar theme={theme} styles={styles} />
              <View style={[styles.bubble, styles.bubbleAi, { paddingVertical: 16, paddingHorizontal: 20 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color={theme.accent} />
                  {transcribing && <Text style={{ fontSize: 12, color: theme.faint }}>Transcribing…</Text>}
                </View>
              </View>
            </View>
          )}
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
            style={[styles.sendButton, (!input.trim() || aiLoading) && styles.sendButtonDisabled]}
            onPress={() => handleSend()}
            disabled={!input.trim() || aiLoading}
          >
            <Feather name="arrow-up" size={18} color={input.trim() ? "#FFFFFF" : theme.disabled} />
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
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: { fontSize: 32, fontWeight: "800", color: theme.text, marginBottom: 4 },
  headerSubtitle: { fontSize: 14, color: theme.faint },
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
    backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : "#EFFDF6",
    alignItems: "center", justifyContent: "center",
    marginRight: 8,
  },
  bubble: { maxWidth: "86%", borderRadius: 20, paddingHorizontal: 18, paddingVertical: 14 },
  bubbleAi: { backgroundColor: theme.card, borderBottomLeftRadius: 6 },
  bubbleUser: { backgroundColor: theme.accent, borderBottomRightRadius: 6 },
  bubbleTextAi: { fontSize: 14.5, lineHeight: 21, color: theme.textSecondary },
  bubbleTextUser: { fontSize: 14.5, lineHeight: 21, color: "#FFFFFF" },
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
    backgroundColor: theme.accent,
    alignItems: "center", justifyContent: "center",
    marginLeft: 8,
  },
  sendButtonDisabled: { backgroundColor: theme.border },
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
