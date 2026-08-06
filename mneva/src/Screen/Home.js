import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  Animated,
  Easing,
  Vibration,
  AppState,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { Ionicons, Feather } from "@expo/vector-icons";
import { clearAuth, getStoredAuth } from '../storage/auth';
import { apiFetch, BASE_URL } from '../api/client';
import { useSocket, resetSocket } from '../services/socket';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';

// NOTE: This screen expects your app root to be wrapped in
// <SafeAreaProvider> (from react-native-safe-area-context) so that
// useSafeAreaInsets() below returns correct values on every device
// (notches, punch-holes, home-indicator, Android nav bar, etc).
//
// App.js:
//   import { SafeAreaProvider } from "react-native-safe-area-context";
//   export default function App() {
//     return (
//       <SafeAreaProvider>
//         <Home />
//       </SafeAreaProvider>
//     );
//   }

const RING_SIZE = 80;
const RING_STROKE = 7;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

const TAB_BAR_CONTENT_HEIGHT = 50;
const FAB_SIZE = 56;
const FAB_GAP = 16;
const ORB_SIZE = 64;

function formatRecentLogTime(timestamp, fallback = '') {
  if (!timestamp) return fallback;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

// Deliberately mirror the formatter in Priorities.js so a scheduled reminder
// has exactly the same displayed time in both places.
function formatPriorityReminderTime(timestamp, fallback = '') {
  if (!timestamp) return fallback;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function isJoinableMeetingLink(link) {
  return typeof link === 'string' && /^https?:\/\/\S+$/i.test(link.trim());
}

function isToday(value, todayStart, todayEnd) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= todayStart && date <= todayEnd;
}

function FocusRing({ percent }) {
  const progress = RING_CIRC - (percent / 100) * RING_CIRC;
  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="#EDEFF3"
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="#14171F"
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
          strokeDashoffset={progress}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <View style={styles.ringLabel}>
        <Text style={styles.ringPercent}>{percent}%</Text>
        <Text style={styles.ringCaption}>FOCUS</Text>
      </View>
    </View>
  );
}

const CATEGORIES = ["Finance", "Career", "Lifestyle", "Relationships"];
const CATEGORY_COLORS = {
  Finance: "#1F9A5A",
  Career: "#615FF8",
  Lifestyle: "#4FA6E8",
  Relationships: "#E0546E",
};

function QuickCaptureSheet({ visible, onClose, onSubmit, bottomInset }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("Finance");

  const handleAdd = () => {
    if (!text.trim()) return;
    onSubmit({ text: text.trim(), category });
    setText("");
    setCategory("Finance");
    onClose();
  };

  const handleClose = () => {
    setText("");
    setCategory("Finance");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.sheetOverlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        <View
          style={[styles.sheetContainer, { paddingBottom: 20 + bottomInset }]}
        >
          <View style={styles.sheetHandle} />

          <Text style={styles.sheetTitle}>Quick priority capture</Text>
          <Text style={styles.sheetSubtitle}>
            Record vital goals. Mneva AI files and balances it automatically.
          </Text>

          <TextInput
            style={styles.sheetInput}
            placeholder="Approve quarterly budget, schedule call..."
            placeholderTextColor="#9AA1AE"
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
          />

          <View style={styles.sheetChipRow}>
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.sheetChip,
                    active && {
                      backgroundColor: CATEGORY_COLORS[cat],
                      borderColor: CATEGORY_COLORS[cat],
                    },
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text
                    style={[
                      styles.sheetChipText,
                      active && styles.sheetChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[
              styles.sheetSubmitButton,
              !text.trim() && styles.sheetSubmitButtonDisabled,
            ]}
            onPress={handleAdd}
            disabled={!text.trim()}
          >
            <Text style={styles.sheetSubmitText}>Add Priority</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Voice Orb overlay ────────────────────────────────────────────────────────
// Waveform bars — animate while listening / speaking
function WaveBars({ active, color }) {
  const bars = [0.4, 0.7, 1.0, 0.7, 1.0, 0.55, 0.85, 0.55, 1.0, 0.7, 0.4];
  const anims = useRef(bars.map(h => new Animated.Value(h))).current;
  const loopRef = useRef(null);

  useEffect(() => {
    if (active) {
      loopRef.current = Animated.loop(
        Animated.stagger(60, anims.map((a, i) =>
          Animated.sequence([
            Animated.timing(a, { toValue: 0.15 + Math.random() * 0.85, duration: 300 + i * 30, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
            Animated.timing(a, { toValue: bars[i], duration: 300 + i * 30, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          ])
        ))
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      anims.forEach((a, i) => Animated.timing(a, { toValue: bars[i], duration: 200, useNativeDriver: true }).start());
    }
    return () => loopRef.current?.stop();
  }, [active]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 36 }}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height: 36,
            borderRadius: 2,
            backgroundColor: color,
            opacity: 0.9,
            transform: [{ scaleY: anim }],
          }}
        />
      ))}
    </View>
  );
}

function VoiceOrb({ visible, onClose, navigation }) {
  const slideAnim  = useRef(new Animated.Value(60)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const orbScale   = useRef(new Animated.Value(0.85)).current;
  const ring1Anim  = useRef(new Animated.Value(1)).current;
  const ring2Anim  = useRef(new Animated.Value(1)).current;
  const ring3Anim  = useRef(new Animated.Value(1)).current;
  const glowAnim   = useRef(new Animated.Value(0)).current;
  const rippleLoop = useRef(null);

  const audioRecorder  = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const convIdRef      = useRef(null);
  const historyRef     = useRef([]);          // full message history for multi-turn
  const [phase, setPhase]           = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply]           = useState('');
  const phaseRef = useRef('idle');

  const setPhaseSync = (p) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    if (visible) {
      setPhaseSync('idle'); setTranscript(''); setReply('');
      // load or create conversation (same as AskAI)
      const initConv = async () => {
        try {
          const list = await apiFetch('/api/conversations');
          const convs = Array.isArray(list) ? list : list.conversations || [];
          let convId;
          if (convs.length === 0) {
            const created = await apiFetch('/api/conversations', { method: 'POST', body: { title: 'New Conversation' } });
            convId = created.id;
          } else {
            convId = convs[0].id;
          }
          convIdRef.current = convId;
          // load history into memory
          const saved = await apiFetch(`/api/messages/${convId}`);
          historyRef.current = Array.isArray(saved)
            ? saved.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
            : [];
        } catch { historyRef.current = []; }
      };
      initConv();
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }),
        Animated.spring(orbScale,  { toValue: 1, useNativeDriver: true, tension: 70, friction: 8 }),
      ]).start();
    } else {
      stopAll();
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 60, duration: 240, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // Concentric ripple rings while listening
  useEffect(() => {
    if (phase === 'listening' || phase === 'speaking') {
      const makeRipple = (anim, delay) => Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(anim, { toValue: 1.9, duration: 1400, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          ]),
          Animated.timing(anim, { toValue: 1, duration: 0, useNativeDriver: true }),
        ])
      );
      rippleLoop.current = [
        makeRipple(ring1Anim, 0),
        makeRipple(ring2Anim, 460),
        makeRipple(ring3Anim, 920),
      ];
      rippleLoop.current.forEach(l => l.start());
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(glowAnim, { toValue: 0.4, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      ).start();
    } else {
      rippleLoop.current?.forEach(l => l.stop());
      [ring1Anim, ring2Anim, ring3Anim].forEach(a => a.setValue(1));
      glowAnim.setValue(0);
    }
  }, [phase]);

  const stopAll = () => {
    rippleLoop.current?.forEach(l => l.stop());
    Speech.stop();
    setPhaseSync('idle');
  };

  // Stop speech when app goes to background or screen navigates away
  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', state => {
      if (state !== 'active') stopAll();
    });
    const unsubBlur = navigation?.addListener?.('blur', stopAll);
    return () => {
      appStateSub.remove();
      unsubBlur?.();
      stopAll();
    };
  }, [navigation]);

  const startListening = async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) { setPhaseSync('error'); setReply('Microphone permission denied.'); return; }
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      Vibration.vibrate(40);
      setPhaseSync('listening'); setTranscript(''); setReply('');
    } catch { setPhaseSync('error'); setReply('Could not start recording.'); }
  };

  const stopListening = async () => {
    if (phaseRef.current !== 'listening') return;
    setPhaseSync('thinking');
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error('no uri');
      const { token } = await getStoredAuth();
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const tRes = await fetch(`${BASE_URL}/api/agent/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64, fileName: 'voice.m4a', mimeType: 'audio/m4a' }),
      });
      const tData = await tRes.json();
      const text = tData?.text || '';
      if (!text) { setPhaseSync('error'); setReply('Could not understand. Try again.'); return; }
      setTranscript(text);

      // append user message to history
      historyRef.current = [...historyRef.current, { role: 'user', content: text }];

      // persist user message
      const convId = convIdRef.current;
      if (convId) {
        try { await apiFetch('/api/messages', { method: 'POST', body: { conversationId: convId, role: 'user', content: text } }); } catch {}
      }

      // send full history to AI — same as AskAI screen
      const aRes = await apiFetch('/api/agent/chat', { method: 'POST', body: { messages: historyRef.current } });
      const aiText = aRes.response || aRes.reply || aRes.message || aRes.content || 'Done.';

      // append AI reply to history
      historyRef.current = [...historyRef.current, { role: 'assistant', content: aiText }];

      // persist AI reply
      if (convId) {
        try { await apiFetch('/api/messages', { method: 'POST', body: { conversationId: convId, role: 'assistant', content: aiText } }); } catch {}
      }

      setReply(aiText);
      setPhaseSync('speaking');
      Vibration.vibrate(30);
      const cleanReply = aiText
        .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA9F}\u{FE00}-\u{FEFF}]/gu, '')
        .replace(/[*_`#~>|\-=+\[\]{}\\^]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      Speech.speak(cleanReply, {
        language: 'en-IN', pitch: 1.0, rate: 0.95,
        onDone: () => setPhaseSync('idle'),
        onError: () => setPhaseSync('idle'),
        onStopped: () => setPhaseSync('idle'),
      });
    } catch { setPhaseSync('error'); setReply('Something went wrong. Please try again.'); }
  };

  const handleOrbPress = () => {
    if (phase === 'idle' || phase === 'error') startListening();
    else if (phase === 'listening')            stopListening();
    else if (phase === 'speaking') { Speech.stop(); setPhaseSync('idle'); }
  };

  const openFullChat = () => { onClose(); navigation?.navigate?.('AskAI'); };

  // Per-phase design tokens
  const PHASE = {
    idle:      { color: '#1F9A5A', glow: 'rgba(31,154,90,0.35)',  icon: 'mic',          label: 'TAP TO SPEAK',         sub: 'Your AI Chief of Staff is ready' },
    listening: { color: '#E0546E', glow: 'rgba(224,84,110,0.35)', icon: 'activity',     label: 'LISTENING',            sub: 'Tap the orb to stop' },
    thinking:  { color: '#615FF8', glow: 'rgba(97,95,248,0.35)',  icon: 'cpu',          label: 'PROCESSING',           sub: 'Mneva is thinking…' },
    speaking:  { color: '#4FA6E8', glow: 'rgba(79,166,232,0.35)', icon: 'volume-2',     label: 'SPEAKING',             sub: 'Tap to stop' },
    error:     { color: '#F5A623', glow: 'rgba(245,166,35,0.35)', icon: 'alert-circle', label: 'TRY AGAIN',            sub: 'Tap the orb to retry' },
  };
  const p = PHASE[phase] || PHASE.idle;

  const ring1Opacity = ring1Anim.interpolate({ inputRange: [1, 1.9], outputRange: [0.5, 0] });
  const ring2Opacity = ring2Anim.interpolate({ inputRange: [1, 1.9], outputRange: [0.35, 0] });
  const ring3Opacity = ring3Anim.interpolate({ inputRange: [1, 1.9], outputRange: [0.2, 0] });

  if (!visible) return null;

  return (
    <Animated.View style={[styles.orbOverlay, { opacity: fadeAnim }]} pointerEvents="box-none">

      {/* ── Top bar ── */}
      <Animated.View style={[styles.orbTopBar, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.orbBrand}>
          <View style={[styles.orbBrandDot, { backgroundColor: p.color }]} />
          <Text style={styles.orbBrandText}>MNEVA AI</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.orbCloseBtn}>
          <Feather name="x" size={18} color="#6B7280" />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Centre stage ── */}
      <Animated.View style={[styles.orbStage, { transform: [{ scale: orbScale }] }]}>
        {/* Ripple rings */}
        {(phase === 'listening' || phase === 'speaking') && [
          [ring1Anim, ring1Opacity],
          [ring2Anim, ring2Opacity],
          [ring3Anim, ring3Opacity],
        ].map(([scale, opacity], i) => (
          <Animated.View key={i} style={[styles.orbRipple, { borderColor: p.color, transform: [{ scale }], opacity }]} />
        ))}

        {/* Soft glow */}
        <Animated.View style={[styles.orbGlow, { backgroundColor: p.glow, opacity: glowAnim }]} />

        {/* Orb button */}
        <TouchableOpacity style={[styles.orbMainBtn, { backgroundColor: p.color, shadowColor: p.color }]} onPress={handleOrbPress} activeOpacity={0.82}>
          {phase === 'thinking' ? (
            <View style={styles.orbThinkRow}>
              {[0, 1, 2].map(i => <View key={i} style={styles.orbThinkDot} />)}
            </View>
          ) : (
            <Feather name={p.icon} size={34} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* ── Status text ── */}
      <Animated.View style={[styles.orbStatusBlock, { transform: [{ translateY: slideAnim }] }]}>
        <Text style={[styles.orbPhaseLabel, { color: p.color }]}>{p.label}</Text>
        <Text style={styles.orbPhaseSub}>{p.sub}</Text>

        {/* Waveform */}
        {(phase === 'listening' || phase === 'speaking') && (
          <View style={styles.orbWaveRow}>
            <WaveBars active color={p.color} />
          </View>
        )}
      </Animated.View>

      {/* ── Conversation card ── */}
      {(!!transcript || !!reply) && (
        <Animated.View style={[styles.orbConvoCard, { transform: [{ translateY: slideAnim }] }]}>
          {!!transcript && (
            <View style={styles.orbConvoRow}>
              <View style={styles.orbConvoYouDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.orbConvoWho}>YOU</Text>
                <Text style={styles.orbConvoText} numberOfLines={2}>{transcript}</Text>
              </View>
            </View>
          )}
          {!!transcript && !!reply && <View style={styles.orbDivider} />}
          {!!reply && (
            <View style={styles.orbConvoRow}>
              <View style={[styles.orbConvoYouDot, { backgroundColor: p.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.orbConvoWho, { color: p.color }]}>MNEVA</Text>
                <Text style={styles.orbConvoText} numberOfLines={5}>{reply}</Text>
              </View>
            </View>
          )}
        </Animated.View>
      )}

      {/* ── Footer ── */}
      <Animated.View style={[styles.orbFooterRow, { transform: [{ translateY: slideAnim }] }]}>
        <TouchableOpacity style={styles.orbFooterBtn} onPress={openFullChat}>
          <Feather name="message-square" size={14} color="#9AA1AE" />
          <Text style={styles.orbFooterText}>Open full conversation</Text>
          <Feather name="chevron-right" size={14} color="#C7CBD3" />
        </TouchableOpacity>
      </Animated.View>

    </Animated.View>
  );
}

export default function Home({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [captureVisible, setCaptureVisible] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [orbVisible, setOrbVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifs, setRecentNotifs] = useState([]);
  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [localPriorities, setLocalPriorities] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [weather, setWeather] = useState(null);
  const [pendingActions, setPendingActions] = useState([]);
  const [actedIds, setActedIds] = useState({});
  const [meetingSuggestActed, setMeetingSuggestActed] = useState({});
  const [financeSnap, setFinanceSnap] = useState(null);
  const [healthSnap, setHealthSnap] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [calendarItems, setCalendarItems] = useState([]);
  const [doneMeetingIds, setDoneMeetingIds] = useState(new Set());
  const [profilePct, setProfilePct] = useState(null);
  const [profileCity, setProfileCity] = useState(null);
  const notificationBriefRefreshRef = useRef(null);

  const loadWeather = async (cityOverride = null, countryOverride = null) => {
    if (!cityOverride) {
      // Try to show cached weather even without city
      try {
        const cached = await AsyncStorage.getItem('mneva_weather');
        if (cached) setWeather(JSON.parse(cached));
        else setWeather({ temp: '--', feelsLike: '--', high: '--', low: '--', humidity: '--', wind: '--', code: 0, city: 'Set city in AI Profile' });
      } catch {
        setWeather({ temp: '--', feelsLike: '--', high: '--', low: '--', humidity: '--', wind: '--', code: 0, city: 'Set city in AI Profile' });
      }
      return;
    }

    // Check cache — keyed by city so stale city data is never shown
    const cacheKey = `mneva_weather_${cityOverride.toLowerCase()}`;
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Use cache only if it's less than 30 minutes old
        if (parsed._ts && Date.now() - parsed._ts < 30 * 60 * 1000) {
          setWeather(parsed);
          return;
        }
      }
    } catch {}

    try {
      const q = countryOverride ? `${cityOverride}, ${countryOverride}` : cityOverride;
      const geoRes  = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
      const geoData = await geoRes.json();
      const place   = geoData?.results?.[0];
      if (!place) {
        setWeather({ temp: '--', feelsLike: '--', high: '--', low: '--', humidity: '--', wind: '--', code: 0, city: cityOverride });
        return;
      }
      const { latitude: lat, longitude: lon, name } = place;
      const url  = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,windspeed_10m,relativehumidity_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
      const res  = await fetch(url);
      const data = await res.json();
      const fresh = {
        temp:      Math.round(data.current?.temperature_2m        ?? 27),
        feelsLike: Math.round(data.current?.apparent_temperature  ?? 27),
        wind:      Math.round(data.current?.windspeed_10m         ?? 0),
        humidity:  Math.round(data.current?.relativehumidity_2m   ?? 0),
        high:      Math.round(data.daily?.temperature_2m_max?.[0] ?? 27),
        low:       Math.round(data.daily?.temperature_2m_min?.[0] ?? 20),
        code:      data.current?.weather_code ?? 0,
        city:      name || cityOverride,
        _ts:       Date.now(),
      };
      setWeather(fresh);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(fresh));
      // Also update the generic key for fallback
      await AsyncStorage.setItem('mneva_weather', JSON.stringify(fresh));
    } catch {
      setWeather(w => w || { temp: '--', feelsLike: '--', high: '--', low: '--', humidity: '--', wind: '--', code: 0, city: cityOverride || 'Unavailable' });
    }
  };

  const isMountedRef = useRef(false);
  const isLoadingRef = useRef(false);

  const loadData = async (isRefresh = false) => {
    // Prevent concurrent loads
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    if (!isRefresh) setBriefLoading(true);
    try {
      const { user: stored } = await getStoredAuth();
      if (stored) setUser(stored);

      // Phase 1 — critical data + tasks all in one shot
      const [meRes, notifsRes, briefRes, profileRes, tasksRes, calendarRes, doneMeetingsRes] = await Promise.allSettled([
        apiFetch('/api/auth/me'),
        apiFetch('/api/notifications'),
        apiFetch('/api/dashboard/brief'),
        apiFetch('/api/onboarding/profile'),
        apiFetch('/api/tasks'),
        apiFetch('/api/calendar/meetings'),
        apiFetch('/api/tasks/meeting-done'),
      ]);

      const me        = meRes.status      === 'fulfilled' ? meRes.value      : null;
      const notifs    = notifsRes.status  === 'fulfilled' ? notifsRes.value  : null;
      const briefData = briefRes.status   === 'fulfilled' ? briefRes.value   : null;
      const profileRes2 = profileRes.status === 'fulfilled' ? profileRes.value : null;
      const tasksData = tasksRes.status   === 'fulfilled' ? tasksRes.value   : null;
      const calendarData = calendarRes.status === 'fulfilled' ? calendarRes.value : null;
      const doneMeetingsData = doneMeetingsRes.status === 'fulfilled' ? doneMeetingsRes.value : null;

      if (me)     setUser(me);
      if (notifs) {
        setUnreadCount(notifs.unreadCount || 0);
        setRecentNotifs((notifs.notifications || []).filter(n => !n.read && (n.type === 'email' || n.type === 'sms')).slice(0, 4));
      }
      if (briefData) setBrief(briefData);
      if (calendarData) setCalendarItems(Array.isArray(calendarData) ? calendarData : calendarData.meetings || []);
      if (doneMeetingsData) setDoneMeetingIds(new Set(doneMeetingsData.ids || []));
      if (profileRes2) {
        const city    = profileRes2?.profile?.city    || null;
        const country = profileRes2?.profile?.country || null;
        setProfilePct(profileRes2?.profile?.completionPct ?? 0);
        setProfileCity(city);
        loadWeather(city, country);
      }

      // Seed localPriorities from DB tasks — source of truth
      if (tasksData) {
        const allTasks = Array.isArray(tasksData) ? tasksData : [];
        setAllTasks(allTasks);
        const STRIPE_COLORS = ['#44BA82', '#615FF8', '#4FA6E8', '#E0546E', '#F5A623'];
        const seeded = allTasks
          .filter(t => t.status === 'PENDING' && t.title && !t.title.startsWith('meeting_done:'))
          .map((t, i) => ({
            id: t.id,
            color: STRIPE_COLORS[i % STRIPE_COLORS.length],
            title: t.title,
            subtitle: t.description || 'Pending · AI tracked',
            isLocal: false,
          }));
        setLocalPriorities(seeded);
      }

      setBriefLoading(false);

      // Phase 2 — secondary data in background
      const [ledgerRes, portfolioRes, spendingRes, healthRes] = await Promise.allSettled([
        apiFetch('/api/agent/ledger'),
        apiFetch('/api/finance/portfolio'),
        apiFetch('/api/finance/spending'),
        apiFetch('/api/health-data/metrics'),
      ]);

      if (ledgerRes.status === 'fulfilled') {
        const pending = (ledgerRes.value.entries || []).filter(e => e.status === 'pending_approval');
        setPendingActions(pending);
      }
      if (portfolioRes.status === 'fulfilled' || spendingRes.status === 'fulfilled') {
        const portfolio = portfolioRes.status === 'fulfilled' ? portfolioRes.value : null;
        const spending  = spendingRes.status  === 'fulfilled' ? spendingRes.value  : null;
        setFinanceSnap({
          netWorth:    portfolio?.netWorth || portfolio?.totalCurrent || 0,
          spent:       spending?.total || 0,
          savingsRate: spending?.savingsRate || 0,
        });
      }
      if (healthRes.status === 'fulfilled') {
        const h = healthRes.value;
        setHealthSnap({
          steps: h?.steps?.value ?? h?.healthSync?.steps ?? null,
          sleep: h?.sleep?.value ?? h?.healthSync?.sleep ?? null,
        });
      }
    } catch {}
    finally {
      isLoadingRef.current = false;
      setBriefLoading(false);
      setRefreshing(false);
    }
  };

  // Single mount load
  useEffect(() => { loadData(); }, []);

  // Re-fetch when screen comes back into focus (after navigating away)
  // Skip the very first focus event which fires right after mount
  useEffect(() => {
    const unsubFocus = navigation?.addListener?.('focus', () => {
      if (!isMountedRef.current) { isMountedRef.current = true; return; }
      loadData(true);
    });
    return () => unsubFocus?.();
  }, [navigation]);

  // Re-fetch when app comes back to foreground after being backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // A suspended mobile connection can become stale in seconds. Refresh
        // on every resume; loadData already prevents concurrent requests.
        loadData(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Stop all speech when navigating away or app goes to background
  useEffect(() => {
    const stopSpeech = () => Speech.stop();
    const unsubBlur = navigation?.addListener?.('blur', stopSpeech);
    return () => {
      stopSpeech();
      unsubBlur?.();
    };
  }, [navigation]);

  // Real-time socket listeners for live notifications
  const { on } = useSocket();
  useEffect(() => {
    const normalise = (n) => ({
      id:   n.id   || String(Date.now()),
      type: n.type || 'email',
      from: n.from || n.title || '',
      body: n.body || n.preview || '',
      ts:   n.ts   || new Date().toISOString(),
      read: false,
    });
    const addNotif = (raw) => {
      const notif = normalise(raw);
      // Only add email/sms to Recent Inbox
      if (notif.type === 'email' || notif.type === 'sms') {
        setRecentNotifs(prev => {
          if (prev.find(x => x.id === notif.id)) return prev;
          return [notif, ...prev].slice(0, 4);
        });
      }
      setUnreadCount(prev => prev + 1);
      // A phone alert can be important without creating a task. Debounce the
      // briefing refresh so the personalised important-alert count changes
      // immediately, while duplicate socket events cause only one request.
      clearTimeout(notificationBriefRefreshRef.current);
      notificationBriefRefreshRef.current = setTimeout(() => {
        apiFetch('/api/dashboard/brief').then(b => { if (b) setBrief(b); }).catch(() => {});
      }, 250);
    };
    const offGmail   = on('gmail:notification',    addNotif);
    const offCreated  = on('notification:created', addNotif);
    const offSms      = on('sms:notification',      addNotif);

    // Helper: fetch tasks + brief together and sync all state
    const syncTasksAndBrief = () => {
      Promise.allSettled([
        apiFetch('/api/tasks'),
        apiFetch('/api/dashboard/brief'),
        apiFetch('/api/calendar/meetings'),
        apiFetch('/api/tasks/meeting-done'),
      ]).then(([tasksRes, briefRes, calendarRes, doneRes]) => {
        if (briefRes.status === 'fulfilled' && briefRes.value) setBrief(briefRes.value);
        if (calendarRes.status === 'fulfilled') {
          const items = Array.isArray(calendarRes.value) ? calendarRes.value : calendarRes.value.meetings || [];
          setCalendarItems(items);
        }
        if (doneRes.status === 'fulfilled') setDoneMeetingIds(new Set(doneRes.value.ids || []));
        if (tasksRes.status === 'fulfilled') {
          const allTasks = Array.isArray(tasksRes.value) ? tasksRes.value : [];
          setAllTasks(allTasks);
          const STRIPE_COLORS = ['#44BA82', '#615FF8', '#4FA6E8', '#E0546E', '#F5A623'];
          const seeded = allTasks
            .filter(t => t.status === 'PENDING' && t.title && !t.title.startsWith('meeting_done:'))
            .map((t, i) => ({
              id: t.id,
              color: STRIPE_COLORS[i % STRIPE_COLORS.length],
              title: t.title,
              subtitle: t.description || 'Pending · AI tracked',
              isLocal: false,
            }));
          setLocalPriorities(seeded);
        }
      }).catch(() => {});
    };

    // real-time task sync — when AI creates a task, optimistically add it
    // then do a full sync to ensure consistency
    const offTask = on('task:created', (task) => {
      if (!task?.id || !task?.title) return;
      setLocalPriorities(prev => {
        if (prev.find(p => p.id === task.id)) return prev;
        const color = CATEGORY_COLORS[task.description] || '#44BA82';
        return [{ id: task.id, color, title: task.title, subtitle: task.description || 'Pending · AI tracked', isLocal: false }, ...prev];
      });
      // Full sync after short delay to let DB write settle
      setTimeout(syncTasksAndBrief, 800);
    });

    // Real-time ledger update — sync tasks + brief
    const offLedger = on('ledger:updated', () => {
      setTimeout(syncTasksAndBrief, 800);
    });

    // Keep the calendar-backed priority list current without waiting for a
    // screen remount or the next manual refresh.
    const offMeeting = on('meeting:created', (meeting) => {
      if (!meeting?.start) return;
      setCalendarItems(prev => {
        const key = meeting.eventId || meeting.id;
        if (prev.some(item => (item.eventId || item.id) === key)) return prev;
        return [{ ...meeting, id: meeting.id || key }, ...prev];
      });
      setMeetings(prev => {
        const key = meeting.eventId || meeting.id;
        if (prev.some(item => (item.eventId || item.id) === key)) return prev;
        return [{ ...meeting, id: meeting.id || key }, ...prev];
      });
    });

    // Real-time profile completion update
    const offProfile = on('profile:updated', ({ completionPct: pct }) => {
      if (pct != null) setProfilePct(pct);
    });

    return () => {
      clearTimeout(notificationBriefRefreshRef.current);
      offGmail?.(); offCreated?.(); offSms?.(); offTask?.(); offLedger?.(); offMeeting?.(); offProfile?.();
    };
  }, [on]);

  // Polling fallback — silently refresh notifications every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const notifs = await apiFetch('/api/notifications');
        const unread = (notifs.notifications || []).filter(n => !n.read && (n.type === 'email' || n.type === 'sms')).slice(0, 4);
        setRecentNotifs(unread);
        setUnreadCount(notifs.unreadCount || 0);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Polling — refresh brief + tasks + ledger every 30s for live feel
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [briefData, ledgerData, tasksData] = await Promise.allSettled([
          apiFetch('/api/dashboard/brief'),
          apiFetch('/api/agent/ledger'),
          apiFetch('/api/tasks'),
        ]);
        if (briefData.status === 'fulfilled') setBrief(briefData.value);
        if (ledgerData.status === 'fulfilled') {
          const pending = (ledgerData.value.entries || []).filter(e => e.status === 'pending_approval');
          setPendingActions(pending);
        }
        // Keep localPriorities in sync with DB on every poll cycle
        if (tasksData.status === 'fulfilled') {
          const allTasks = Array.isArray(tasksData.value) ? tasksData.value : [];
          setAllTasks(allTasks);
          const STRIPE_COLORS = ['#44BA82', '#615FF8', '#4FA6E8', '#E0546E', '#F5A623'];
          const seeded = allTasks
            .filter(t => t.status === 'PENDING' && t.title && !t.title.startsWith('meeting_done:'))
            .map((t, i) => ({
              id: t.id,
              color: STRIPE_COLORS[i % STRIPE_COLORS.length],
              title: t.title,
              subtitle: t.description || 'Pending · AI tracked',
              isLocal: false,
            }));
          setLocalPriorities(seeded);
        }
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    Promise.allSettled([
      apiFetch('/api/calendar/meetings'),
      apiFetch('/api/tasks/meeting-done'),
    ])
      .then(([calendarRes, doneRes]) => {
        if (calendarRes.status !== 'fulfilled') return;
        const all = Array.isArray(calendarRes.value) ? calendarRes.value : calendarRes.value.meetings || [];
        setCalendarItems(all);
        if (doneRes.status === 'fulfilled') setDoneMeetingIds(new Set(doneRes.value.ids || []));
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        // Deduplicate by eventId first, then by id
        const seen = new Set();
        const unique = all.filter(m => {
          const key = m.eventId || m.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setMeetings(unique.filter(m => m.start && new Date(m.start) >= now));
      })
      .catch(() => {});
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setActedIds({});
    setLocalPriorities([]);
    loadData(true);
  };

  const handleMeetingSuggest = async (emailId, action, suggestion) => {
    setMeetingSuggestActed(prev => ({ ...prev, [emailId]: action }));
    if (action === 'approve') {
      try {
        // Default: schedule 1 hour from now, rounded to next hour
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
      setBrief(prev => prev ? {
        ...prev,
        suggestedMeetings: (prev.suggestedMeetings || []).filter(m => m.emailId !== emailId),
      } : prev);
    }, 800);
  };

  const handleAction = async (actionId, type) => {
    setActedIds(prev => ({ ...prev, [actionId]: type }));
    try {
      await apiFetch(`/api/agent/${type}`, { method: 'POST', body: { actionId } });
    } catch {}
    setTimeout(() => {
      setPendingActions(prev => prev.filter(a => a.id !== actionId));
      setActedIds(prev => { const n = { ...prev }; delete n[actionId]; return n; });
    }, 700);
  };

  const TOOL_META = {
    initiate_payment:  { icon: 'credit-card', color: '#1F9A5A', label: 'Payment' },
    book_cab:          { icon: 'navigation',  color: '#4FA6E8', label: 'Cab Booking' },
    order_food:        { icon: 'shopping-bag',color: '#F5A623', label: 'Food Order' },
    send_email:        { icon: 'mail',        color: '#615FF8', label: 'Send Email' },
    draft_reply:       { icon: 'edit-2',      color: '#615FF8', label: 'Draft Reply' },
    schedule_event:    { icon: 'calendar',    color: '#E0546E', label: 'Schedule Event' },
    set_reminder:      { icon: 'bell',        color: '#F5A623', label: 'Reminder' },
  };

  const getActionLabel = (action) => {
    const inp = action.input || {};
    switch (action.tool) {
      case 'initiate_payment': return `Pay ₹${inp.amount || ''} to ${inp.payee || inp.to || 'recipient'}`;
      case 'book_cab':         return `Cab: ${inp.pickup || 'pickup'} → ${inp.destination || 'destination'}`;
      case 'order_food':       return `Order from ${inp.restaurant || 'restaurant'}`;
      case 'send_email':       return `Email to ${inp.recipient || inp.to || 'recipient'}`;
      case 'draft_reply':      return `Reply draft for ${inp.subject || 'email'}`;
      case 'schedule_event':   return `Schedule: ${inp.title || 'event'}`;
      case 'set_reminder':     return inp.message || 'Set reminder';
      default:                 return action.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  };

  const getWeatherIcon = (code) => {
    if (code === 0) return 'sun';
    if (code <= 3) return 'cloud';
    if (code <= 67) return 'cloud-rain';
    if (code <= 77) return 'cloud-snow';
    if (code <= 82) return 'cloud-drizzle';
    return 'cloud-lightning';
  };

  const getWeatherDesc = (code) => {
    if (code === 0) return 'Clear sky';
    if (code <= 2) return 'Partly cloudy';
    if (code === 3) return 'Overcast';
    if (code <= 48) return 'Foggy conditions';
    if (code <= 57) return 'Light drizzle';
    if (code <= 67) return 'Rain showers';
    if (code <= 77) return 'Snow showers';
    if (code <= 82) return 'Rain showers';
    return 'Thunderstorm';
  };

  const getWeatherIconColor = (code) => {
    if (code === 0) return '#F5A623';
    if (code <= 3) return '#9AA1AE';
    if (code <= 67) return '#4FA6E8';
    if (code <= 77) return '#A8C8F0';
    return '#4FA6E8';
  };

  const getInitials = (name) => {
    if (!name) return 'ME';
    const parts = name.trim().split(' ');
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getDateString = () => {
    return new Date().toLocaleDateString('en-IN', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  };

  const handleLogout = async () => {
    await clearAuth();
    resetSocket();
    navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
  };

  const markNotifRead = async (id) => {
    setRecentNotifs(prev => prev.filter(n => n.id !== id));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      const freshBrief = await apiFetch('/api/dashboard/brief');
      if (freshBrief) setBrief(freshBrief);
    } catch {}
  };

  const markAllNotifsRead = async () => {
    setRecentNotifs([]);
    setUnreadCount(0);
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
      const freshBrief = await apiFetch('/api/dashboard/brief');
      if (freshBrief) setBrief(freshBrief);
    } catch {}
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'email':    return { icon: 'mail',       color: '#615FF8', bg: '#EEEDFE' };
      case 'sms':      return { icon: 'message-square', color: '#1F9A5A', bg: '#EFFDF6' };
      case 'calendar': return { icon: 'calendar',   color: '#4FA6E8', bg: '#EAF3FD' };
      case 'payment':  return { icon: 'credit-card',color: '#1F9A5A', bg: '#EFFDF6' };
      case 'reminder': return { icon: 'bell',       color: '#F5A623', bg: '#FEF3C7' };
      default:         return { icon: 'zap',        color: '#9AA1AE', bg: '#F3F4F6' };
    }
  };

  const handleAddPriority = async ({ text, category }) => {
    // optimistic UI — add instantly
    const tempId = `local_${Date.now()}`;
    setLocalPriorities((prev) => [
      { id: tempId, color: CATEGORY_COLORS[category], title: text, subtitle: category, isLocal: true },
      ...prev,
    ]);
    // persist to backend
    try {
      const task = await apiFetch('/api/tasks', {
        method: 'POST',
        body: { title: text, description: category, status: 'PENDING' },
      });
      // replace temp with real task id
      setLocalPriorities((prev) =>
        prev.map(p => p.id === tempId
          ? { ...p, id: task.id, isLocal: false }
          : p
        )
      );
    } catch {
      // keep optimistic item even if save fails
    }
  };

  // Merge backend tasks + locally added priorities + meetings
  const STRIPE_COLORS = ['#44BA82', '#615FF8', '#4FA6E8', '#E0546E', '#F5A623'];
  // Titles already shown in Recent Logs — don't count them twice in the overview.
  const loggedTitles = new Set(
    (brief?.autoCompleted || []).map(l => (l.title || '').toLowerCase().trim())
  );

  const backendTasks = (brief?.pendingTasks || [])
    .filter(t => {
      const title = (t.title || '').trim();
      if (/^[a-z_]+:[a-z0-9]+$/i.test(title)) return false;
      if (/^[a-z]+(_[a-z]+)+$/.test(title)) return false;
      if (!title || title.length < 3) return false;
      // Don't show if already in Recent Logs
      if (loggedTitles.has(title.toLowerCase())) return false;
      return true;
    })
    .map((t, i) => ({
      id: t.id,
      color: STRIPE_COLORS[i % STRIPE_COLORS.length],
      title: t.title,
      subtitle: t.description || 'Pending · AI tracked',
    }));
  const meetingTasks = meetings
    .filter(m => {
      if (!m.meetLink) return false;
      const t = (m.title || '').trim();
      if (!t || t.length < 3) return false;
      if (/^[0-9a-f-]{8,}$/i.test(t)) return false;
      // Ask AI stores one meeting as a task and a calendar event. The task is
      // the dashboard priority; don't render its calendar mirror a second time.
      const taskTitles = new Set([...localPriorities, ...backendTasks].map(p => (p.title || '').trim().toLowerCase()));
      if (taskTitles.has(t.toLowerCase())) return false;
      return true;
    })
    .map((m) => {
    const s = new Date(m.start);
    const e = m.end ? new Date(m.end) : null;
    const time = s.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dur = e ? Math.round((e - s) / 60000) : null;
    const durStr = dur ? (dur >= 60 ? `${Math.floor(dur/60)}h${dur%60 ? ` ${dur%60}m` : ''}` : `${dur}m`) : '';
    const isRealMeeting = !!m.meetLink;
    return {
      id: m.eventId || m.id,
      color: isRealMeeting ? '#E0546E' : '#F5A623',
      title: m.title,
      subtitle: isRealMeeting
        ? `Meeting · ${time}${durStr ? ` · ${durStr}` : ''}`
        : `Reminder · ${time}${durStr ? ` · ${durStr}` : ''}`,
      isMeeting: isRealMeeting,
      meetLink: m.meetLink,
    };
  });
  const seenIds = new Set();
  const allPriorities = [...localPriorities, ...backendTasks, ...meetingTasks].filter(p => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });
  // Match the Priorities screen exactly: ordinary appointments are reminders,
  // and their persisted task mirror must not be counted a second time.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayReminders = calendarItems.filter(item =>
    !isJoinableMeetingLink(item.meetLink)
    && item.start
    && isToday(item.start, todayStart, todayEnd)
  );
  const reminderTitles = new Set(todayReminders.map(item => (item.title || '').trim().toLowerCase()));
  const todayTaskItems = allTasks.filter(task => {
    if (task.status !== 'PENDING' || !isToday(task.createdAt, todayStart, todayEnd) || /^Meeting · /i.test(task.description || '')) return false;
    const isReminderTask = /^Reminder ·/i.test(task.description || '');
    return !isReminderTask || !reminderTitles.has((task.title || '').trim().toLowerCase());
  });
  const doneTaskCount = todayReminders.filter(item => doneMeetingIds.has(item.id)).length;
  const pendingTaskCount = todayTaskItems.length
    + todayReminders.filter(item => !doneMeetingIds.has(item.id)).length;
  const totalTaskCount = todayTaskItems.length + todayReminders.length;
  // This is deliberately built from the same two lists used by Priorities.
  // Do not use the dashboard/ledger feed here: it can contain historical AI
  // actions, which would make this card disagree with the Today tab.
  const dashboardPriorityItems = [
    ...todayTaskItems.map(task => ({
      id: `task_${task.id}`,
      title: task.title,
      detail: task.description || 'Pending · AI tracked',
      done: false,
      icon: 'clock',
    })),
    ...todayReminders.map(reminder => ({
      id: `reminder_${reminder.id}`,
      title: reminder.title,
      detail: formatPriorityReminderTime(reminder.start),
      done: doneMeetingIds.has(reminder.id),
      icon: 'bell',
    })),
  ];
  // Calendar reminders are the source of truth for the scheduled time shown
  // in Priorities. Match a dashboard log to that record before falling back
  // to the ledger timestamp supplied by the API.
  const getReminderScheduledAt = (title, fallback = null) => {
    const reminderTitle = (title || '').replace(/^Reminder set:\s*/i, '').trim().toLowerCase();
    const reminder = calendarItems.find(item =>
      !isJoinableMeetingLink(item.meetLink)
      && (item.title || '').trim().toLowerCase() === reminderTitle
      && item.start
    );
    return reminder?.start || fallback;
  };

  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const fabBottom = tabBarHeight + FAB_GAP;
  const orbBottom = tabBarHeight + 14;
  // Scroll content needs enough bottom padding to clear the tab bar
  const scrollBottomPad = tabBarHeight + 24;
  const importantNotificationCount = brief?.importantNotifications?.count || 0;
  const urgentNotificationCount = brief?.importantNotifications?.urgentCount || 0;
  const firstName = user?.name?.trim()?.split(' ')[0] || 'there';
  const importantNotificationHeadline = importantNotificationCount
    ? `Hey ${firstName} — you have ${importantNotificationCount} important notification${importantNotificationCount === 1 ? '' : 's'}${urgentNotificationCount ? `, including ${urgentNotificationCount} urgent` : ''}.`
    : null;

  // Slightly shrink side padding on very narrow devices (e.g. small phones in split-screen)
  const horizontalPad = width < 360 ? 16 : 20;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: horizontalPad,
            paddingBottom: scrollBottomPad,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#1F9A5A"
            colors={['#1F9A5A']}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingSmall}>{getGreeting()}</Text>
            <Text style={styles.greetingName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {user?.name?.split(' ')[0] || 'there'} 👋
            </Text>
            <View style={styles.subGreetingRow}>
              <Feather name="sun" size={14} color="#F5A623" />
              <Text style={styles.subGreeting}>
                {'  '}{getDateString()}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.searchIconBtn} onPress={() => navigation?.navigate?.('Search')}>
              <Feather name="search" size={20} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={() => setLogoutVisible(true)}>
              <Feather name="log-out" size={18} color="#9AA1AE" />
            </TouchableOpacity>
            <View style={styles.avatarWrapper}>
              <LinearGradient
                colors={["#6C63FF", "#4C3AED"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
              </LinearGradient>
            </View>
          </View>
        </View>

        {/* Focus + Weather row */}
        <View style={styles.topRow}>
          <TouchableOpacity
            style={[styles.card, styles.focusCard]}
            onPress={() => navigation?.navigate?.('AIProfile')}
            activeOpacity={0.8}
          >
            <FocusRing percent={profilePct ?? 0} />
            <Text style={styles.focusCaption}>
              {profilePct >= 80 ? 'Profile strong' : profilePct >= 40 ? 'Keep filling' : 'Complete profile'}
            </Text>
            <View style={styles.focusProfileBadge}>
              <Feather name="user" size={9} color="#615FF8" />
              <Text style={styles.focusProfileBadgeText}>{' '}AI Profile</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.card, styles.weatherCard]}>
            {/* Top row — temp + icon */}
            <View style={styles.weatherHeaderRow}>
              <View>
                <Text style={styles.weatherTemp}>
                  {weather ? `${weather.temp}°` : '--°'}
                </Text>
                <Text style={styles.weatherFeels}>
                  Feels {weather ? `${weather.feelsLike}°` : '--°'}
                </Text>
              </View>
              <View style={styles.weatherIconWrap}>
                <Feather
                  name={weather ? getWeatherIcon(weather.code) : 'cloud'}
                  size={22}
                  color={weather ? getWeatherIconColor(weather.code) : '#9AA1AE'}
                />
              </View>
            </View>
            {/* City */}
            <View style={styles.weatherCityRow}>
              <Feather name="map-pin" size={10} color="#4FA6E8" />
              <Text style={styles.weatherLocation} numberOfLines={1}>
                {weather ? weather.city : 'Loading…'}
              </Text>
            </View>
            {/* Condition */}
            <Text style={styles.weatherDesc}>
              {weather ? getWeatherDesc(weather.code) : ''}
            </Text>
            {/* Stats row */}
            <View style={styles.weatherStatsRow}>
              <View style={styles.weatherStat}>
                <Feather name="droplet" size={10} color="#4FA6E8" />
                <Text style={styles.weatherStatText}>{weather ? `${weather.humidity}%` : '--'}</Text>
              </View>
              <View style={styles.weatherStat}>
                <Feather name="wind" size={10} color="#9AA1AE" />
                <Text style={styles.weatherStatText}>{weather ? `${weather.wind}km/h` : '--'}</Text>
              </View>
              <View style={styles.weatherStat}>
                <Feather name="thermometer" size={10} color="#E0546E" />
                <Text style={styles.weatherStatText}>{weather ? `${weather.high}°/${weather.low}°` : '--'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Autonomy Engine — pending approvals */}
        {pendingActions.length > 0 && (
          <>
            <View style={[styles.sectionHeaderRow, { marginBottom: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={styles.autonomyDot} />
                <Text style={styles.sectionHeader}>AUTONOMY ENGINE</Text>
              </View>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{pendingActions.length} pending</Text>
              </View>
            </View>

            {pendingActions.map((action) => {
              const meta = TOOL_META[action.tool] || { icon: 'zap', color: '#9AA1AE', label: 'Action' };
              const acted = actedIds[action.id];
              return (
                <View
                  key={action.id}
                  style={[
                    styles.actionCard,
                    acted === 'approve' && styles.actionCardApproved,
                    acted === 'deny'    && styles.actionCardDenied,
                  ]}
                >
                  <View style={[styles.actionIconWrap, { backgroundColor: meta.color + '18' }]}>
                    <Feather name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={styles.actionTextWrap}>
                    <Text style={styles.actionLabel} numberOfLines={1}>{getActionLabel(action)}</Text>
                    <Text style={styles.actionMeta}>{meta.label} · awaiting approval</Text>
                  </View>
                  {acted ? (
                    <View style={[styles.actedBadge, acted === 'approve' ? styles.actedApprove : styles.actedDeny]}>
                      <Feather name={acted === 'approve' ? 'check' : 'x'} size={14} color="#FFFFFF" />
                    </View>
                  ) : (
                    <View style={styles.actionBtns}>
                      <TouchableOpacity
                        style={styles.denyBtn}
                        onPress={() => handleAction(action.id, 'deny')}
                      >
                        <Feather name="x" size={16} color="#E0546E" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => handleAction(action.id, 'approve')}
                      >
                        <Feather name="check" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* Today's priorities overview */}
        <LinearGradient
          colors={["#3CB37A", "#1F7A54"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.briefingCard}
        >
          {/* Top label row */}
          <View style={styles.briefingLabelRow}>
            <View style={styles.briefingLabelLeft}>
              <View style={styles.briefingLabelIconWrap}>
                <Feather name="sun" size={12} color="#1F7A54" />
              </View>
              <Text style={styles.briefingLabel}>TODAY'S PRIORITIES</Text>
            </View>
            <View style={styles.briefingTimeBadge}>
              <Text style={styles.briefingTimeText}>{getDateString()}</Text>
            </View>
          </View>

          {briefLoading ? (
            <View style={styles.briefingSkeletonWrap}>
              <View style={styles.briefingSkeleton} />
              <View style={[styles.briefingSkeleton, { width: '60%' }]} />
            </View>
          ) : (
            <>
              {/* Stats row */}
              <View style={styles.briefingStatsRow}>
                <View style={styles.briefingStatChip}>
                  <Text style={styles.briefingStatNum}>{totalTaskCount}</Text>
                  <Text style={styles.briefingStatLabel}>Tasks</Text>
                </View>
                <View style={styles.briefingStatDivider} />
                <View style={styles.briefingStatChip}>
                  <Text style={styles.briefingStatNum}>{pendingTaskCount}</Text>
                  <Text style={styles.briefingStatLabel}>Pending</Text>
                </View>
                <View style={styles.briefingStatDivider} />
                <View style={styles.briefingStatChip}>
                  <Text style={styles.briefingStatNum}>{doneTaskCount}</Text>
                  <Text style={styles.briefingStatLabel}>Done</Text>
                </View>
              </View>

              {/* Headline */}
              <Text style={styles.briefingTitle}>
                {pendingTaskCount
                  ? `${pendingTaskCount} task${pendingTaskCount === 1 ? '' : 's'} pending.`
                  : doneTaskCount
                    ? 'All today’s priorities completed.'
                    : 'All clear for today!'}
              </Text>

              {/* Render the same current-day task/reminder data as Priorities. */}
              {dashboardPriorityItems.slice(0, 3).map(item => (
                <View key={item.id} style={styles.briefingItemRow}>
                  <View style={styles.briefingIconWrap}>
                    <Feather name={item.done ? 'check' : item.icon} size={12} color="#1F7A54" />
                  </View>
                  <View style={styles.briefingItemTextWrap}>
                    <Text style={styles.briefingItemText} numberOfLines={1}>{item.title}</Text>
                    {!!item.detail && <Text style={styles.briefingItemDetail} numberOfLines={1}>{item.detail}</Text>}
                  </View>
                  <View style={styles.briefingItemBadge}>
                    <Text style={styles.briefingItemBadgeText}>{item.done ? 'DONE' : 'NEW'}</Text>
                  </View>
                </View>
              ))}

              {dashboardPriorityItems.length === 0 && (
                <View style={styles.briefingEmptyRow}>
                  <Feather name="check-circle" size={15} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.briefingEmptyText}>All clear — no priorities today</Text>
                </View>
              )}
            </>
          )}

          {/* CTA */}
          <TouchableOpacity style={styles.briefingButton} onPress={() => navigation?.navigate?.('Priorities')}>
            <View style={styles.briefingButtonLeft}>
              <Feather name="list" size={14} color="#1F7A54" />
              <Text style={styles.briefingButtonText}>View today’s priorities</Text>
            </View>
            <View style={styles.briefingButtonArrow}>
              <Feather name="arrow-right" size={14} color="#1F7A54" />
            </View>
          </TouchableOpacity>
        </LinearGradient>

        {/* Recent Inbox */}
        {recentNotifs.length > 0 && (
          <>
            <View style={[styles.sectionHeaderRow, { marginTop: 8, marginBottom: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={styles.inboxDot} />
                <Text style={styles.sectionHeader}>RECENT INBOX</Text>
                <View style={styles.inboxCountBadge}>
                  <Text style={styles.inboxCountText}>{recentNotifs.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={markAllNotifsRead}>
                <Text style={styles.markAllReadText}>Mark all read</Text>
              </TouchableOpacity>
            </View>

            {recentNotifs.map((notif) => {
              const meta = getNotifIcon(notif.type);
              const timeStr = notif.ts
                ? new Date(notif.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                : '';
              return (
                <TouchableOpacity
                  key={notif.id}
                  style={styles.notifCard}
                  activeOpacity={0.75}
                  onPress={() => navigation?.navigate?.('Communications')}
                >
                  <View style={[styles.notifIconWrap, { backgroundColor: meta.bg }]}>
                    <Feather name={meta.icon} size={16} color={meta.color} />
                  </View>
                  <View style={styles.notifTextWrap}>
                    <View style={styles.notifTitleRow}>
                      <Text style={styles.notifTitle} numberOfLines={1}>{notif.from || notif.title}</Text>
                      <Text style={styles.notifTime}>{timeStr}</Text>
                    </View>
                    <Text style={styles.notifBody} numberOfLines={2}>{notif.body || notif.title}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.notifReadBtn}
                    onPress={(e) => { e.stopPropagation?.(); markNotifRead(notif.id); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={13} color="#9AA1AE" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.inboxViewAllBtn}
              onPress={() => navigation?.navigate?.('Communications')}
            >
              <Feather name="inbox" size={13} color="#615FF8" />
              <Text style={styles.inboxViewAllText}>Open full inbox</Text>
              <Feather name="arrow-right" size={13} color="#615FF8" />
            </TouchableOpacity>
          </>
        )}

        {/* Finance + Health summary */}
        <View style={styles.summaryRow}>
          <View style={[styles.card, styles.summaryCard]}>
            <View style={styles.summaryLabelRow}>
              <Feather name="credit-card" size={14} color="#3CB37A" />
              <Text style={styles.summaryLabel}>{"  "}Finance</Text>
            </View>
            <Text style={styles.summaryValue}>
              {financeSnap
                ? financeSnap.netWorth > 0
                  ? `₹${financeSnap.netWorth.toLocaleString('en-IN')}`
                  : financeSnap.spent > 0
                    ? `₹${financeSnap.spent.toLocaleString('en-IN')} spent`
                    : '—'
                : '…'}
            </Text>
            <Text style={styles.summaryDelta}>
              {financeSnap
                ? financeSnap.netWorth > 0
                  ? 'Net worth'
                  : financeSnap.savingsRate > 0
                    ? `${financeSnap.savingsRate}% savings rate`
                    : 'No data yet'
                : ''}
            </Text>
          </View>

          <View style={[styles.card, styles.summaryCard]}>
            <View style={styles.summaryLabelRow}>
              <Feather name="heart" size={14} color="#E0546E" />
              <Text style={styles.summaryLabel}>{"  "}Health Core</Text>
            </View>
            <Text style={styles.summaryValue}>
              {healthSnap
                ? healthSnap.steps != null
                  ? healthSnap.steps.toLocaleString('en-IN')
                  : '—'
                : '…'}
            </Text>
            <Text style={styles.summarySub}>
              {healthSnap
                ? [
                    healthSnap.steps != null ? 'Steps' : null,
                    healthSnap.sleep  != null ? `${healthSnap.sleep}h sleep` : null,
                  ].filter(Boolean).join(' · ') || 'No data yet'
                : ''}
            </Text>
          </View>
        </View>

        {/* Recent logs */}
        <Text style={[styles.sectionHeader, { marginTop: 8, marginBottom: 10 }]}>
          RECENT LOGS
        </Text>

        {briefLoading ? (
          [1, 2].map((i) => (
            <View key={i} style={styles.logSkeletonRow}>
              <View style={styles.logSkeletonIcon} />
              <View style={{ flex: 1 }}>
                <View style={styles.logSkeletonLine} />
                <View style={[styles.logSkeletonLine, { width: '45%', marginTop: 6 }]} />
              </View>
            </View>
          ))
        ) : (brief?.autoCompleted || []).length === 0 ? (
          <View style={styles.emptyLogs}>
            <Feather name="activity" size={24} color="#C7CBD3" />
            <Text style={styles.emptyLogsText}>No AI actions logged yet today</Text>
          </View>
        ) : (
          (brief.autoCompleted).slice(0, 5).map((log, i) => {
            const rawLogDetail = log.logDetail || log.detail || 'Auto resolved';
            // Legacy reminder details contained a second timestamp. Remove it
            // and use the actual log timestamp below for one correct AM/PM.
            const logDetail = log.tool === 'set_reminder'
              ? rawLogDetail.replace(/\s*·\s*\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi, '').trim()
              : rawLogDetail;
            const logTime = log.tool === 'set_reminder'
              ? formatPriorityReminderTime(getReminderScheduledAt(log.title, log.scheduledAt), log.time)
              : formatRecentLogTime(log.timestamp, log.time);
            return (
              <View key={i} style={styles.logRow}>
                <View style={styles.logIconWrap}>
                  <Feather name="check" size={14} color="#1F7A54" />
                </View>
                <View style={styles.logTextWrap}>
                  <Text style={styles.logTitle} numberOfLines={1}>{log.title}</Text>
                  <Text style={styles.logSubtitle}>
                    {logDetail}{logTime ? ` · ${logTime}` : ''}
                  </Text>
                </View>
                <View style={styles.logBadge}>
                  <Text style={styles.logBadgeText}>AI</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Floating add button */}
      <TouchableOpacity
        style={[styles.fab, { right: horizontalPad, bottom: fabBottom }]}
        onPress={() => setCaptureVisible(true)}
      >
        <Feather name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Voice Orb trigger — centred above tab bar */}
      <TouchableOpacity
        style={[styles.voiceOrbTrigger, { bottom: orbBottom }]}
        onPress={() => setOrbVisible(true)}
        onLongPress={() => setOrbVisible(true)}
        activeOpacity={0.85}
      >
        <View style={styles.voiceOrbGlow} />
        <View style={styles.voiceOrbInner}>
          <Feather name="mic" size={22} color="#1F9A5A" />
        </View>
      </TouchableOpacity>

      <VoiceOrb
        visible={orbVisible}
        onClose={() => setOrbVisible(false)}
        navigation={navigation}
      />

      <QuickCaptureSheet
        visible={captureVisible}
        onClose={() => setCaptureVisible(false)}
        onSubmit={handleAddPriority}
        bottomInset={insets.bottom}
      />

      {/* Logout Modal */}
      <Modal visible={logoutVisible} transparent animationType="fade" onRequestClose={() => setLogoutVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setLogoutVisible(false)}>
          <View style={styles.logoutOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.logoutSheet}>
                <View style={styles.logoutIconWrap}>
                  <LinearGradient colors={['#FF6B6B', '#C0392B']} style={styles.logoutIconGrad}>
                    <Feather name="log-out" size={24} color="#FFFFFF" />
                  </LinearGradient>
                </View>
                <Text style={styles.logoutTitle}>Sign out?</Text>
                <Text style={styles.logoutSubtitle}>
                  Your session will end and you'll need to sign in again to access Mneva AI.
                </Text>
                <TouchableOpacity style={styles.logoutConfirmBtn} onPress={handleLogout}>
                  <LinearGradient colors={['#FF6B6B', '#C0392B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.logoutConfirmGrad}>
                    <Feather name="log-out" size={16} color="#FFFFFF" />
                    <Text style={styles.logoutConfirmText}>Yes, sign me out</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity style={styles.logoutCancelBtn} onPress={() => setLogoutVisible(false)}>
                  <Text style={styles.logoutCancelText}>Stay signed in</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Bottom tab bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem}>
          <Ionicons name="home" size={22} color="#1F7A54" />
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => { Speech.stop(); navigation?.navigate?.("Priorities"); }}
        >
          <Feather name="calendar" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => { Speech.stop(); navigation?.navigate?.("AskAI"); }}
        >
          <Feather name="mic" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => { Speech.stop(); navigation?.navigate?.("Space"); }}
        >
          <Feather name="folder" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => { Speech.stop(); navigation?.navigate?.("Profile"); }}
        >
          <Feather name="user" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F9FAFC",
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  greetingSmall: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 2,
  },
  greetingName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#14171F",
  },
  subGreetingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  subGreeting: {
    fontSize: 13,
    color: "#6B7280",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoutBtn: {
    padding: 6,
  },
  searchIconBtn: {
    padding: 6,
  },
  logoutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14,17,26,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  logoutSheet: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  logoutIconWrap: {
    marginBottom: 20,
    borderRadius: 22,
    overflow: 'hidden',
  },
  logoutIconGrad: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#14171F',
    marginBottom: 10,
  },
  logoutSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  logoutConfirmBtn: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  logoutConfirmGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  logoutConfirmText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  logoutCancelBtn: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  logoutCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  avatarWrapper: {
    position: "relative",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  topRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  card: {
    borderRadius: 20,
    padding: 16,
  },
  focusCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  ringLabel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  ringPercent: {
    fontSize: 18,
    fontWeight: "800",
    color: "#14171F",
  },
  ringCaption: {
    fontSize: 9,
    fontWeight: "700",
    color: "#9AA1AE",
    letterSpacing: 0.5,
  },
  focusCaption: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  focusProfileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: '#EEEDFE',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  focusProfileBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#615FF8',
  },
  weatherCard: {
    flex: 1,
    backgroundColor: "#F0F5FE",
  },
  weatherHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  weatherIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  weatherTemp: {
    fontSize: 28,
    fontWeight: "800",
    color: "#14171F",
    lineHeight: 32,
  },
  weatherFeels: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: '500',
    marginTop: 1,
  },
  weatherCityRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 3, marginTop: 8,
  },
  weatherLocation: {
    fontSize: 11,
    fontWeight: "700",
    color: "#14171F",
    flex: 1,
  },
  weatherDesc: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 3,
    lineHeight: 15,
  },
  weatherStatsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 6,
  },
  weatherStat: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    gap: 3, backgroundColor: '#FFFFFF',
    borderRadius: 8, paddingVertical: 5, paddingHorizontal: 5,
  },
  weatherStatText: {
    fontSize: 10, fontWeight: '700', color: '#374151',
  },
  briefingCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
  },
  briefingSkeletonWrap: { marginBottom: 16 },
  briefingSkeleton: {
    height: 14, borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 10, width: '85%',
  },
  briefingLabelRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  briefingLabelLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  briefingLabelIconWrap: {
    width: 22, height: 22, borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  briefingLabel: {
    color: 'rgba(255,255,255,0.9)', fontSize: 11,
    fontWeight: '700', letterSpacing: 0.8,
  },
  briefingTimeBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  briefingTimeText: { fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  briefingStatsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 14, padding: 14, marginBottom: 16,
  },
  briefingStatChip: { flex: 1, alignItems: 'center' },
  briefingStatNum: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  briefingStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 2 },
  briefingStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  briefingTitle: {
    color: '#FFFFFF', fontSize: 17, fontWeight: '700',
    lineHeight: 24, marginBottom: 14,
  },
  briefingItemRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, padding: 10, marginBottom: 8, gap: 10,
  },
  briefingIconWrap: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  briefingItemTextWrap: { flex: 1 },
  briefingItemText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  briefingItemDetail: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },
  briefingItemBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  briefingItemBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 },
  briefingSuggestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
  },
  briefingSuggestBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  briefingEmptyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, opacity: 0.7,
  },
  briefingEmptyText: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
  briefingButton: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  briefingButtonLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  briefingButtonText: { color: '#1F7A54', fontWeight: '700', fontSize: 14 },
  briefingButtonArrow: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: '#EFFDF6',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 0.5,
  },
  viewAllRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  viewAllText: {
    color: "#4C3AED",
    fontWeight: "700",
    fontSize: 13,
    marginRight: 2,
  },
  dragHint: {
    fontSize: 12,
    color: "#9AA1AE",
    fontStyle: "italic",
    marginBottom: 12,
  },
  priorityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 10,
    overflow: "hidden",
  },
  priorityRowChecked: {
    opacity: 0.45,
  },
  prioritySkeletonRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
  },
  prioritySkeletonStripe: {
    width: 4,
    backgroundColor: '#E3E5EA',
  },
  prioritySkeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F0F1F4',
    width: '70%',
  },
  emptyPriorities: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  emptyPrioritiesText: {
    fontSize: 13,
    color: '#9AA1AE',
    fontWeight: '600',
  },
  priorityStripe: {
    width: 4,
    alignSelf: "stretch",
  },
  priorityTextWrap: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  priorityTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#14171F",
    marginBottom: 3,
  },
  prioritySubtitle: {
    fontSize: 12,
    color: "#9AA1AE",
  },
  checkCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  checkCircleActive: {
    backgroundColor: "#1F9A5A",
  },
  priorityTitleChecked: {
    textDecorationLine: 'line-through',
    color: '#9AA1AE',
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  summaryLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#14171F",
    marginBottom: 4,
  },
  summaryDelta: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1F9A5A",
  },
  summarySub: {
    fontSize: 12,
    color: "#9AA1AE",
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  logIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EFFDF6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  logTextWrap: {
    flex: 1,
  },
  logTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#14171F",
    marginBottom: 2,
  },
  logSubtitle: {
    fontSize: 12,
    color: "#9AA1AE",
  },
  logBadge: {
    backgroundColor: '#EFFDF6',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 8,
  },
  logBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1F9A5A',
    letterSpacing: 0.3,
  },
  logSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  logSkeletonIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F1F4',
    marginRight: 12,
  },
  logSkeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F0F1F4',
    width: '70%',
  },
  emptyLogs: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyLogsText: {
    fontSize: 13,
    color: '#9AA1AE',
    fontWeight: '600',
  },
  // Recent Inbox
  inboxDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#615FF8',
  },
  inboxCountBadge: {
    backgroundColor: '#EEEDFE', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  inboxCountText: { fontSize: 11, fontWeight: '800', color: '#615FF8' },
  markAllReadText: { fontSize: 12, fontWeight: '700', color: '#615FF8' },
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 14, marginBottom: 10, gap: 12,
    borderLeftWidth: 3, borderLeftColor: '#EEEDFE',
  },
  notifIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  notifTextWrap: { flex: 1 },
  notifTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  notifTitle: { fontSize: 13, fontWeight: '700', color: '#14171F', flex: 1, marginRight: 8 },
  notifTime: { fontSize: 11, color: '#9AA1AE', fontWeight: '500' },
  notifBody: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  notifReadBtn: {
    width: 24, height: 24, borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 2,
  },
  inboxViewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, backgroundColor: '#EEEDFE',
    borderRadius: 14, paddingVertical: 13, marginBottom: 20,
  },
  inboxViewAllText: { fontSize: 13, fontWeight: '700', color: '#615FF8' },
  meetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
  },
  meetAccentBar: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: '#1F9A5A',
  },
  meetTitle: { fontSize: 15, fontWeight: "700", color: "#14171F", marginBottom: 3 },
  meetMeta: { fontSize: 12, color: "#6B7280", marginBottom: 3 },
  meetAttendees: { fontSize: 12, color: "#9AA1AE", marginBottom: 2 },
  meetDesc: { fontSize: 12, color: "#9AA1AE", marginTop: 2, lineHeight: 17 },
  meetJoinBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#1F9A5A", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, marginLeft: 10,
  },
  meetJoinBtnText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  autonomyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#1F9A5A',
  },
  pendingBadge: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F5A623',
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F0F1F4',
  },
  actionCardApproved: {
    opacity: 0.5,
    borderColor: '#1F9A5A',
  },
  actionCardDenied: {
    opacity: 0.5,
    borderColor: '#E0546E',
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#14171F',
    marginBottom: 2,
  },
  actionMeta: {
    fontSize: 12,
    color: '#9AA1AE',
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  denyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFF0F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#1F9A5A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actedBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actedApprove: {
    backgroundColor: '#1F9A5A',
  },
  actedDeny: {
    backgroundColor: '#E0546E',
  },
  fab: {
    position: "absolute",
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: "#1F9A5A",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  // ── Voice Orb trigger ────────────────────────────────────────────────────
  voiceOrbTrigger: {
    position: 'absolute',
    alignSelf: 'center',
    left: '50%',
    marginLeft: -(ORB_SIZE / 2),
    width: ORB_SIZE,
    height: ORB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  voiceOrbGlow: {
    position: 'absolute',
    width: ORB_SIZE + 20,
    height: ORB_SIZE + 20,
    borderRadius: (ORB_SIZE + 20) / 2,
    backgroundColor: 'rgba(31,154,90,0.15)',
  },
  voiceOrbInner: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(31,154,90,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F9A5A',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  // ── Voice Orb full-screen overlay ───────────────────────────────────────
  orbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F7F8FA',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 48,
    paddingHorizontal: 28,
    zIndex: 200,
  },
  orbTopBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orbBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orbBrandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  orbBrandText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9AA1AE',
    letterSpacing: 2,
  },
  orbCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECEEF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbStage: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbRipple: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1.5,
  },
  orbGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  orbMainBtn: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  orbInnerGlass: {},
  orbThinkRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  orbThinkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    opacity: 0.9,
  },
  orbStatusBlock: {
    alignItems: 'center',
    gap: 6,
  },
  orbPhaseLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  orbPhaseSub: {
    fontSize: 15,
    color: '#9AA1AE',
    fontWeight: '500',
    textAlign: 'center',
  },
  orbWaveRow: {
    marginTop: 10,
  },
  orbConvoCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    gap: 4,
  },
  orbDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#F0F1F4',
    marginVertical: 12,
  },
  orbConvoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  orbConvoYouDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#C7CBD3',
    marginTop: 6,
    flexShrink: 0,
  },
  orbConvoWho: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B0B5BF',
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  orbConvoText: {
    fontSize: 14,
    color: '#14171F',
    lineHeight: 21,
    fontWeight: '500',
  },
  orbFooterRow: {
    width: '100%',
    alignItems: 'center',
  },
  orbFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECEEF2',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  orbFooterText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#9AA1AE',
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#EEF0F3",
    paddingTop: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9AA1AE",
    marginTop: 4,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: "#1F7A54",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(20,23,31,0.45)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E3E5EA",
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#14171F",
    marginBottom: 6,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: "#9AA1AE",
    lineHeight: 19,
    marginBottom: 20,
  },
  sheetInput: {
    backgroundColor: "#F5F6F8",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#14171F",
    minHeight: 52,
    maxHeight: 120,
    marginBottom: 16,
  },
  sheetChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  sheetChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E3E5EA",
    backgroundColor: "#FFFFFF",
  },
  sheetChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  sheetChipTextActive: {
    color: "#FFFFFF",
  },
  sheetSubmitButton: {
    backgroundColor: "#14171F",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetSubmitButtonDisabled: {
    backgroundColor: "#D1D3D9",
  },
  sheetSubmitText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
