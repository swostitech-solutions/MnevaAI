import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
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
  Animated,
  Linking,
  AppState,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { AudioModule, createAudioPlayer } from "expo-audio";
import { apiFetch } from "../api/client";

// Module-level registry — all active SongRow stop functions
const _activeStopFns = new Set();
function _registerStopFn(fn) { _activeStopFns.add(fn); }
function _unregisterStopFn(fn) { _activeStopFns.delete(fn); }
function stopAllPlayers() { _activeStopFns.forEach(fn => fn()); }

// Fetch 30-sec preview URL from iTunes Search API (no API key needed)
async function fetchPreviewUrl(title, artist) {
  try {
    const q = encodeURIComponent(`${title} ${artist}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1&country=in`);
    const data = await res.json();
    return data.results?.[0]?.previewUrl || null;
  } catch {
    return null;
  }
}

function openYouTube(title, artist) {
  const q = encodeURIComponent(`${title} ${artist}`);
  Linking.openURL(`https://www.youtube.com/results?search_query=${q}`);
}

const TAB_BAR_CONTENT_HEIGHT = 50;

const BROWSE = [
  { id: "trending", title: "Trending", icon: "trending-up", colors: ["#F97316", "#EA580C"] },
  { id: "new", title: "New Releases", icon: "star", colors: ["#8B5CF6", "#6D28D9"] },
  { id: "genres", title: "Genres", icon: "disc", colors: ["#1DB954", "#158A3E"] },
  { id: "moods", title: "Moods", icon: "smile", colors: ["#EC4899", "#BE185D"] },
  { id: "charts", title: "Charts", icon: "bar-chart-2", colors: ["#2563EB", "#1D4ED8"] },
  { id: "recommended", title: "For You", icon: "heart", colors: ["#EAB308", "#CA8A04"] },
  { id: "devotional", title: "Devotional", icon: "sun", colors: ["#F97316", "#C2410C"] },
];

const GROUPS = {
  genres: ["Pop", "Rock", "Hip-Hop", "R&B", "Bollywood"],
  moods: ["Chill", "Focus", "Workout", "Party", "Relax"],
  trending: ["India", "Global", "Viral"],
  new: ["This Week", "Fresh Finds", "Indian Releases"],
  charts: ["India Top 50", "Global Top 50", "Top Albums"],
  recommended: ["Made for You", "Your Mix", "Recently Played"],
  devotional: ["Hindu Bhajans", "Sufi", "Gurbani", "Christian", "Islamic Nasheeds"],
};

const FALLBACK_SONGS = [
  ["Golden Hour", "JVKE", "this is what ____ feels like", "#E9C6A6"],
  ["I Had Some Help", "Post Malone · Morgan Wallen", "F-1 Trillion", "#9CB4B4"],
  ["Birds of a Feather", "Billie Eilish", "HIT ME HARD AND SOFT", "#8FA7CA"],
  ["Husn", "Anuv Jain", "Husn", "#B9A18B"],
  ["Espresso", "Sabrina Carpenter", "Short n' Sweet", "#E6B17C"],
];

const COVER_COLORS = ["#E9C6A6","#9CB4B4","#8FA7CA","#B9A18B","#E6B17C","#BD9172","#C09099","#6D93AB","#BD9A77","#8EA373"];

// ── SongRow — each song has its own player instance ─────────────────────────
function SongRow({ title, artist, album, color, index, isSaved, onToggleSaved }) {
  const [fetching, setFetching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [totalSec, setTotalSec] = useState(30);
  const playerRef = useRef(null);
  const statusSubRef = useRef(null);
  const previewUrlRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    const stopFn = () => {
      try { playerRef.current?.pause(); } catch {}
      setActive(false);
    };
    _registerStopFn(stopFn);
    return () => {
      _unregisterStopFn(stopFn);
      try { statusSubRef.current?.remove(); } catch {}
      try { playerRef.current?.release(); } catch {}
      playerRef.current = null;
    };
  }, []);

  const startPlayback = async (url) => {
    // Release any existing player first
    statusSubRef.current?.remove?.();
    try { playerRef.current?.release?.(); } catch {}
    playerRef.current = null;

    await AudioModule.setAudioModeAsync({ playsInSilentMode: true });

    const player = createAudioPlayer({ uri: url });
    playerRef.current = player;

    // Subscribe to status updates for progress
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (!status) return;
      const cur = status.currentTime ?? 0;
      const dur = status.duration ?? 30;
      setCurrentSec(Math.floor(cur));
      setTotalSec(Math.floor(dur));
      setProgress(dur > 0 ? Math.min(cur / dur, 1) : 0);
      if (status.didJustFinish) {
        setActive(false);
        setProgress(0);
        setCurrentSec(0);
      }
    });
    statusSubRef.current = sub;

    player.play();
    setActive(true);
  };

  const handlePlay = async () => {
    if (active) {
      playerRef.current?.pause?.();
      setActive(false);
      return;
    }
    // Resume if player exists and paused
    if (playerRef.current && previewUrlRef.current) {
      await AudioModule.setAudioModeAsync({ playsInSilentMode: true });
      playerRef.current.play();
      setActive(true);
      return;
    }
    // Fetch preview URL
    setFetching(true);
    const url = await fetchPreviewUrl(title, artist);
    setFetching(false);
    if (!url) {
      setNotFound(true);
      setTimeout(() => setNotFound(false), 3000);
      return;
    }
    previewUrlRef.current = url;
    await startPlayback(url);
  };

  return (
    <View>
      <View style={styles.songRow}>
        <Text style={[styles.trackNumber, active && styles.trackNumberActive]}>
          {active ? "♫" : index + 1}
        </Text>
        <View style={[styles.cover, { backgroundColor: color }]}>
          <Feather name="music" size={19} color="#FFFFFF" />
        </View>
        <View style={styles.songMeta}>
          <Text numberOfLines={1} style={styles.songTitle}>{title}</Text>
          <Text numberOfLines={1} style={styles.songDetails}>{artist}{album ? ` · ${album}` : ""}</Text>
        </View>
        <TouchableOpacity onPress={() => openYouTube(title, artist)} style={styles.rowAction}>
          <Feather name="youtube" size={17} color="#FF0000" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onToggleSaved} style={styles.rowAction}>
          <Feather name="heart" size={17} color={isSaved ? "#E44B6A" : "#8E96A3"} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handlePlay}
          style={[styles.playBtn, active && styles.playBtnActive]}
          disabled={fetching}
        >
          {fetching
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Feather name={active ? "pause" : "play"} size={15} color="#FFFFFF" />}
        </TouchableOpacity>
      </View>

      {active && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.progressTime}>{currentSec}s / {totalSec}s · 30s preview</Text>
        </View>
      )}

      {notFound && (
        <Text style={styles.notFoundText}>Preview unavailable — tap YouTube for full song</Text>
      )}
    </View>
  );
}

// Parse AI text response into song rows
function parseSongsFromAI(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const songs = [];
  for (const line of lines) {
    // Match patterns like: 1. Title - Artist (Album) or "Title" by Artist
    const numbered = line.match(/^\d+[\.\)]\s*(.+)/);
    const raw = numbered ? numbered[1] : line;
    // Try "Title - Artist · Album" or "Title by Artist"
    const dashSplit = raw.split(/\s[-–]\s/);
    if (dashSplit.length >= 2) {
      const title = dashSplit[0].replace(/^["']|["']$/g, "").trim();
      const rest = dashSplit.slice(1).join(" - ");
      const dotSplit = rest.split(/\s[·•]\s/);
      const artist = dotSplit[0].trim();
      const album = dotSplit[1]?.trim() || "";
      if (title.length > 1 && artist.length > 1) {
        songs.push([title, artist, album, COVER_COLORS[songs.length % COVER_COLORS.length]]);
      }
    } else if (raw.toLowerCase().includes(" by ")) {
      const bySplit = raw.split(/ by /i);
      const title = bySplit[0].replace(/^["']|["']$/g, "").trim();
      const artist = bySplit[1]?.trim() || "";
      if (title.length > 1 && artist.length > 1) {
        songs.push([title, artist, "", COVER_COLORS[songs.length % COVER_COLORS.length]]);
      }
    }
    if (songs.length >= 10) break;
  }
  return songs.length >= 3 ? songs : null;
}

// ── AI Chat Panel ────────────────────────────────────────────────────────────
function AIChatPanel({ onSongsUpdate, currentContext }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { id: "0", sender: "ai", text: "Hi! Ask me for music recommendations — by mood, artist, language, or vibe 🎵" },
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const togglePanel = () => {
    const toValue = open ? 0 : 1;
    setOpen(!open);
    Animated.spring(slideAnim, { toValue, useNativeDriver: false, tension: 80, friction: 12 }).start();
  };

  const panelHeight = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 320] });

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    if (!text) setInput("");

    const userMsg = { id: String(Date.now()), sender: "user", text: content };
    setMessages(prev => [...prev, userMsg]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    setLoading(true);

    try {
      const prompt = `You are Mneva AI music assistant. The user is browsing ${currentContext}. 
Respond with a numbered list of 5-8 song recommendations in this exact format:
1. Song Title - Artist Name · Album Name
2. Song Title - Artist Name · Album Name
...
Keep it concise. User request: ${content}`;

      const res = await apiFetch("/api/agent/chat", {
        method: "POST",
        body: {
          messages: [
            { role: "user", content: prompt },
          ],
        },
      });

      const aiText = res.response || res.reply || res.message || res.content || "Here are some picks for you!";
      const aiMsg = { id: String(Date.now() + 1), sender: "ai", text: aiText };
      setMessages(prev => [...prev, aiMsg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

      // Try to parse songs and update the list
      const parsed = parseSongsFromAI(aiText);
      if (parsed) onSongsUpdate(parsed, currentContext);
    } catch {
      setMessages(prev => [...prev, {
        id: String(Date.now() + 1),
        sender: "ai",
        text: "Couldn't connect to AI right now. Try again!",
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, currentContext, onSongsUpdate]);

  // Auto-query when context changes
  useEffect(() => {
    if (!currentContext) return;
    const autoQuery = `Give me top song recommendations for: ${currentContext}`;
    sendMessage(autoQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContext]);

  return (
    <View style={panelStyles.wrapper}>
      {/* Toggle bar */}
      <TouchableOpacity style={panelStyles.toggleBar} onPress={togglePanel} activeOpacity={0.85}>
        <View style={panelStyles.toggleLeft}>
          <LinearGradient colors={["#1DB954", "#158A3E"]} style={panelStyles.aiDot}>
            <Feather name="cpu" size={12} color="#fff" />
          </LinearGradient>
          <Text style={panelStyles.toggleTitle}>Mneva AI</Text>
          {loading && <ActivityIndicator size="small" color="#1DB954" style={{ marginLeft: 8 }} />}
        </View>
        <View style={panelStyles.toggleRight}>
          <Text style={panelStyles.toggleHint}>{open ? "Close" : "Ask AI for music"}</Text>
          <Feather name={open ? "chevron-down" : "chevron-up"} size={16} color="#158A3E" />
        </View>
      </TouchableOpacity>

      {/* Animated panel */}
      <Animated.View style={[panelStyles.panel, { height: panelHeight, overflow: "hidden" }]}>
        <ScrollView
          ref={scrollRef}
          style={panelStyles.msgScroll}
          contentContainerStyle={{ padding: 12, paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(m => (
            <View key={m.id} style={[panelStyles.bubble, m.sender === "user" ? panelStyles.bubbleUser : panelStyles.bubbleAi]}>
              <Text style={m.sender === "user" ? panelStyles.bubbleTextUser : panelStyles.bubbleTextAi}>
                {m.text}
              </Text>
            </View>
          ))}
          {loading && (
            <View style={[panelStyles.bubble, panelStyles.bubbleAi]}>
              <ActivityIndicator size="small" color="#1DB954" />
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={panelStyles.inputRow}>
          <TextInput
            style={panelStyles.input}
            placeholder="Ask for songs, artists, moods…"
            placeholderTextColor="#9AA1AE"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[panelStyles.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            <Feather name="arrow-up" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function MusicDiscovery({ navigation }) {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState("trending");
  const [selection, setSelection] = useState("India");
  const [saved, setSaved] = useState([]);
  const [aiSongs, setAiSongs] = useState(null);
  const [aiLabel, setAiLabel] = useState(null);
  const [aiContext, setAiContext] = useState("Trending · India");

  const fallbackSongs = useMemo(() => {
    const map = {
      Focus: [["A Moment Apart","ODESZA","A Moment Apart","#7289A7"],["Weightless","Marconi Union","Weightless","#9BAAA8"],["Experience","Ludovico Einaudi","In a Time Lapse","#A7A0B7"],["Sunset Lover","Petit Biscuit","Presence","#E4A77B"],["Awake","Tycho","Awake","#92B6C3"]],
      Workout: [["Don't Start Now","Dua Lipa","Future Nostalgia","#D68DA8"],["Can't Hold Us","Macklemore","The Heist","#B28959"],["Believer","Imagine Dragons","Evolve","#B45E4D"],["Titanium","David Guetta · Sia","Nothing but the Beat","#9DB4C6"],["Levitating","Dua Lipa","Future Nostalgia","#9077B6"]],
      Bollywood: [["Tum Hi Ho","Arijit Singh","Aashiqui 2","#BD9172"],["Heeriye","Jasleen Royal · Arijit Singh","Heeriye","#C09099"],["O Maahi","Arijit Singh","Dunki","#6D93AB"],["Pehle Bhi Main","Vishal Mishra","Animal","#BD9A77"],["Apna Bana Le","Arijit Singh","Bhediya","#8EA373"]],
      "Hindu Bhajans": [["Jai Shri Ram","Jubin Nautiyal","Bhakti","#F97316"],["Achyutam Keshavam","Shankar Mahadevan","Bhajans","#EA580C"],["Hanuman Chalisa","Hariharan","Devotional","#C2410C"],["Om Namah Shivaya","S.P. Balasubrahmanyam","Shiv Bhajans","#F59E0B"],["Raghupati Raghav","Lata Mangeshkar","Ram Bhajans","#D97706"]],
      Sufi: [["Kun Faya Kun","A.R. Rahman · Javed Ali","Rockstar","#7C3AED"],["Dama Dam Mast Qalandar","Abida Parveen","Sufi Classics","#6D28D9"],["Tere Bin","Atif Aslam","Sufi","#5B21B6"],["Arziyan","Javed Ali · Kailash Kher","Delhi 6","#8B5CF6"],["Allah Ke Bande","Kailash Kher","Kailasa","#7C3AED"]],
      Gurbani: [["Waheguru Simran","Bhai Harjinder Singh","Gurbani","#F59E0B"],["Deh Shiva","Harshdeep Kaur","Gurbani","#D97706"],["Satnam Waheguru","Bhai Gurpreet Singh","Kirtan","#B45309"],["Ik Onkar","A.R. Rahman","Rang De Basanti","#92400E"],["Ardas","Bhai Maninder Singh","Gurbani","#F97316"]],
      Christian: [["Amazing Grace","Il Divo","Hymns","#1D4ED8"],["Hallelujah","Pentatonix","PTX Vol. IV","#1E40AF"],["How Great Thou Art","Carrie Underwood","Hymns","#1E3A8A"],["10000 Reasons","Matt Redman","10000 Reasons","#2563EB"],["Oceans","Hillsong United","Zion","#3B82F6"]],
      "Islamic Nasheeds": [["Tala Al Badru Alayna","Maher Zain","Nasheeds","#065F46"],["Assalamu Alayka","Maher Zain","Forgive Me","#047857"],["Ya Nabi Salam","Sami Yusuf","Al-Mu'allim","#059669"],["Subhanallah","Atif Aslam","Nasheeds","#10B981"],["Allahu Allah","Sami Yusuf","My Ummah","#34D399"]],
    };
    return map[selection] || FALLBACK_SONGS;
  }, [selection]);

  const songs = aiSongs || fallbackSongs;
  const sectionTitle = BROWSE.find(item => item.id === section)?.title || "Music";

  const chooseSection = (id) => {
    setSection(id);
    const first = GROUPS[id][0];
    setSelection(first);
    setAiSongs(null);
    setAiLabel(null);
    setAiContext(`${BROWSE.find(b => b.id === id)?.title} · ${first}`);
  };

  const chooseSelection = (item) => {
    setSelection(item);
    setAiSongs(null);
    setAiLabel(null);
    setAiContext(`${sectionTitle} · ${item}`);
  };

  const handleAiSongs = useCallback((songs, label) => {
    setAiSongs(songs);
    setAiLabel(label);
  }, []);

  const toggleSaved = (title) => {
    setSaved(items => items.includes(title) ? items.filter(i => i !== title) : [...items, title]);
  };

  // Stop all audio when leaving screen or app goes to background
  useEffect(() => {
    const unsubBlur = navigation?.addListener?.('blur', stopAllPlayers);
    const appStateSub = AppState.addEventListener('change', state => {
      if (state !== 'active') stopAllPlayers();
    });
    return () => {
      stopAllPlayers();
      unsubBlur?.();
      appStateSub.remove();
    };
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: TAB_BAR_CONTENT_HEIGHT + insets.bottom + 28 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.browseHeader}>
              <View>
                <Text style={styles.sectionLabel}>Music intelligence</Text>
                <Text style={styles.browseHeading}>Find your sound</Text>
              </View>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>AI LIVE</Text>
              </View>
            </View>

            {/* Browse grid */}
            <View style={styles.browseGrid}>
              {BROWSE.map(item => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => chooseSection(item.id)}
                  style={[styles.browseCard, section === item.id && styles.browseCardActive]}
                >
                  <LinearGradient colors={item.colors} style={styles.browseIcon}>
                    <Feather name={item.icon} size={19} color="#FFFFFF" />
                  </LinearGradient>
                  {section === item.id && (
                    <View style={styles.selectedMark}>
                      <Feather name="check" size={9} color="#FFFFFF" />
                    </View>
                  )}
                  <Text numberOfLines={1} style={[styles.browseTitle, section === item.id && styles.browseTitleActive]}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Agent strip */}
            <View style={styles.agentStrip}>
              <View style={styles.agentIcon}><Feather name="cpu" size={14} color="#FFFFFF" /></View>
              <Text style={styles.agentText}>
                Mneva AI is curating <Text style={styles.agentHighlight}>{sectionTitle.toLowerCase()}</Text> picks in real-time
              </Text>
            </View>

            {/* Collection chips */}
            <View style={styles.headingRow}>
              <View>
                <Text style={styles.sectionLabel}>{sectionTitle}</Text>
                <Text style={styles.sectionHeading}>Choose a collection</Text>
              </View>
              <Text style={styles.topCount}>{aiSongs ? `AI · ${aiSongs.length}` : "TOP 5"}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {GROUPS[section].map(item => (
                <TouchableOpacity
                  key={item}
                  onPress={() => chooseSelection(item)}
                  style={[styles.chip, selection === item && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selection === item && styles.chipTextActive]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Song list */}
            <View style={styles.listHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text numberOfLines={1} style={styles.listTitle}>{aiLabel || selection}</Text>
                <Text style={styles.listSub}>
                  {aiSongs ? "✨ AI-curated picks" : "Top songs picked for you"}
                </Text>
              </View>
              {aiSongs && (
                <TouchableOpacity onPress={() => { setAiSongs(null); setAiLabel(null); }}>
                  <Text style={styles.seeAll}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.songList}>
              {songs.map(([title, artist, album, color], index) => (
                <SongRow
                  key={`${title}-${index}`}
                  title={title}
                  artist={artist}
                  album={album}
                  color={color}
                  index={index}
                  isSaved={saved.includes(title)}
                  onToggleSaved={() => toggleSaved(title)}
                />
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Mneva AI Chat Panel */}
        <AIChatPanel onSongsUpdate={handleAiSongs} currentContext={aiContext} />

        {/* Bottom tab bar */}
        <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
          <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Home")}>
            <Ionicons name="home" size={22} color="#9AA1AE" />
            <Text style={styles.tabLabel}>HOME</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Priorities")}>
            <Feather name="calendar" size={22} color="#9AA1AE" />
            <Text style={styles.tabLabel}>PRIORITIES</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("AskAI")}>
            <Feather name="mic" size={22} color="#9AA1AE" />
            <Text style={styles.tabLabel}>ASK AI</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Space")}>
            <Feather name="folder" size={22} color="#158A3E" />
            <Text style={[styles.tabLabel, { color: "#158A3E" }]}>SPACE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Profile")}>
            <Feather name="user" size={22} color="#9AA1AE" />
            <Text style={styles.tabLabel}>PROFILE</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const panelStyles = StyleSheet.create({
  wrapper: { backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E5EBE7" },
  toggleBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 11,
  },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiDot: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  toggleTitle: { fontSize: 13, fontWeight: "800", color: "#14241B" },
  toggleRight: { flexDirection: "row", alignItems: "center", gap: 5 },
  toggleHint: { fontSize: 11, color: "#158A3E", fontWeight: "600" },
  panel: { backgroundColor: "#F5FCF7" },
  msgScroll: { flex: 1 },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, maxWidth: "88%" },
  bubbleAi: { backgroundColor: "#FFFFFF", alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: "#1DB954", alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleTextAi: { fontSize: 12.5, color: "#374151", lineHeight: 18 },
  bubbleTextUser: { fontSize: 12.5, color: "#FFFFFF", lineHeight: 18 },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: "#E5EBE7",
  },
  input: {
    flex: 1, backgroundColor: "#FFFFFF", borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 13, color: "#14171F",
  },
  sendBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#1DB954", alignItems: "center", justifyContent: "center",
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F3F6F4" },
  content: { paddingHorizontal: 20, paddingTop: 14 },
  browseHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  sectionLabel: { fontSize: 10, fontWeight: "800", color: "#78877F", letterSpacing: 1.15, textTransform: "uppercase" },
  browseHeading: { fontSize: 25, lineHeight: 30, fontWeight: "800", letterSpacing: -0.5, color: "#14241B", marginTop: 3 },
  livePill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#E0F7E8" },
  liveDot: { height: 6, width: 6, borderRadius: 3, backgroundColor: "#1DB954" },
  liveText: { fontSize: 9, fontWeight: "800", color: "#158A3E", letterSpacing: 0.7 },
  browseGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 9, marginTop: 18 },
  browseCard: { width: "31.8%", height: 104, backgroundColor: "#FFFFFF", borderRadius: 18, padding: 10, justifyContent: "space-between", borderWidth: 1, borderColor: "#E9EFEB", overflow: "hidden" },
  browseCardActive: { borderColor: "#8CDEAA", backgroundColor: "#F5FCF7", shadowColor: "#1DB954", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  browseIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  selectedMark: { position: "absolute", top: 10, right: 9, backgroundColor: "#1DB954", width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  browseTitle: { fontSize: 10, fontWeight: "800", color: "#435049" },
  browseTitleActive: { color: "#158A3E" },
  agentStrip: { marginTop: 17, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: "#158A3E", flexDirection: "row", alignItems: "center" },
  agentIcon: { width: 25, height: 25, borderRadius: 9, backgroundColor: "#1DB954", alignItems: "center", justifyContent: "center", marginRight: 9 },
  agentText: { color: "#D8F5E1", fontSize: 11, fontWeight: "600" },
  agentHighlight: { color: "#FFFFFF", fontWeight: "800" },
  headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 28 },
  sectionHeading: { fontSize: 19, letterSpacing: -0.3, fontWeight: "800", color: "#14241B", marginTop: 4 },
  topCount: { color: "#158A3E", fontSize: 10, fontWeight: "800", paddingBottom: 2, letterSpacing: 0.6 },
  chips: { gap: 8, paddingTop: 14, paddingBottom: 3 },
  chip: { borderRadius: 20, backgroundColor: "#E5EBE7", paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: "#158A3E" },
  chipText: { fontSize: 12, color: "#5D6B63", fontWeight: "700" },
  chipTextActive: { color: "#FFFFFF" },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 25, marginBottom: 11 },
  listTitle: { fontSize: 18, letterSpacing: -0.3, fontWeight: "800", color: "#14241B" },
  listSub: { fontSize: 11, color: "#77857D", marginTop: 3 },
  seeAll: { fontSize: 12, color: "#158A3E", fontWeight: "800" },
  songList: { backgroundColor: "#FFFFFF", borderRadius: 20, paddingVertical: 5, shadowColor: "#243A2D", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2, marginBottom: 16 },
  songRow: { minHeight: 70, flexDirection: "row", alignItems: "center", paddingHorizontal: 10 },
  trackNumber: { width: 19, textAlign: "center", fontSize: 12, color: "#96A19A", fontWeight: "700" },
  trackNumberActive: { color: "#158A3E", fontSize: 19 },
  cover: { width: 44, height: 44, borderRadius: 13, marginLeft: 7, alignItems: "center", justifyContent: "center" },
  songMeta: { flex: 1, marginLeft: 10, marginRight: 4 },
  songTitle: { fontSize: 13, fontWeight: "800", color: "#1B2921" },
  songDetails: { fontSize: 10, color: "#7D8982", marginTop: 3 },
  rowAction: { padding: 5 },
  playBtn: { backgroundColor: "#1DB954", width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginLeft: 2 },
  playBtnActive: { backgroundColor: "#158A3E" },
  progressWrap: { paddingHorizontal: 16, paddingBottom: 10, marginTop: -2 },
  progressTrack: { height: 3, backgroundColor: "#E5EBE7", borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: "#1DB954", borderRadius: 2 },
  progressTime: { fontSize: 9, color: "#9AA1AE", marginTop: 4, textAlign: "right" },
  notFoundText: { fontSize: 10, color: "#E44B6A", marginHorizontal: 16, marginBottom: 8, marginTop: -2 },
  tabBar: { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E5EBE7", paddingTop: 10 },
  tabItem: { flex: 1, alignItems: "center" },
  tabLabel: { fontSize: 10, fontWeight: "700", color: "#9AA1AE", marginTop: 4, letterSpacing: 0.3 },
});
