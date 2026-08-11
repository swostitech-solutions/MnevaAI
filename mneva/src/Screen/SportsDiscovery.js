import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { apiFetch } from "../api/client";

const TAB_BAR_HEIGHT = 50;

// ── DeepSeek sports fetch ─────────────────────────────────────────────────────
async function fetchSportsFromAI(sportTitle, tab) {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const prompt = `Today is ${today}. You are a real-time sports data agent.
Return ONLY a valid JSON array (no markdown, no explanation) of ${tab === "Live" ? "currently live" : tab === "Upcoming" ? "upcoming (next 7 days)" : "recently completed (last 7 days)"} ${sportTitle} matches.
Each object must have exactly these fields:
{ "teamA": string, "teamB": string, "scoreA": string, "scoreB": string, "info": string, "venue": string, "status": "${tab === "Live" ? "live" : tab === "Upcoming" ? "upcoming" : "result"}" }
Rules:
- scoreA/scoreB: empty string for upcoming matches, actual score for live/result
- info: for live = current over/minute/quarter + competition name, for upcoming = date + time (IST), for result = winner + margin
- venue: stadium/city name
- Return 3 to 5 matches maximum
- Use real current data based on your knowledge
- Return ONLY the JSON array, nothing else`;

  const res = await apiFetch("/api/agent/chat", {
    method: "POST",
    body: { messages: [{ role: "user", content: prompt }] },
  });

  const text = res.response || res.reply || res.message || res.content || "";
  // Extract JSON array from response
  const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
}

const SPORTS = [
  { id: "cricket",    title: "Cricket",    icon: "activity",   colors: ["#0EA5E9", "#0369A1"] },
  { id: "football",   title: "Football",   icon: "circle",     colors: ["#10B981", "#047857"] },
  { id: "tennis",     title: "Tennis",     icon: "target",     colors: ["#F59E0B", "#D97706"] },
  { id: "basketball", title: "Basketball", icon: "award",      colors: ["#F97316", "#EA580C"] },
  { id: "kabaddi",    title: "Kabaddi",    icon: "zap",        colors: ["#EC4899", "#BE185D"] },
  { id: "hockey",     title: "Hockey",     icon: "wind",       colors: ["#6C47FF", "#4A2FCC"] },
  { id: "badminton",  title: "Badminton",  icon: "feather",    colors: ["#14B8A6", "#0F766E"] },
  { id: "formula1",   title: "Formula 1",  icon: "flag",       colors: ["#EF4444", "#B91C1C"] },
];

const MATCH_TABS = ["Live", "Upcoming", "Previous"];

// Fallback match data per sport per tab
const MATCHES = {
  cricket: {
    Live: [
      { id: "c1", teamA: "India", teamB: "Australia", scoreA: "287/4", scoreB: "210/8", info: "48.2 Overs · 3rd ODI", venue: "Wankhede, Mumbai", status: "live" },
      { id: "c2", teamA: "England", teamB: "South Africa", scoreA: "156/3", scoreB: "—", info: "22.0 Overs · 2nd Test", venue: "Lord's, London", status: "live" },
    ],
    Upcoming: [
      { id: "c3", teamA: "India", teamB: "New Zealand", scoreA: "", scoreB: "", info: "Tomorrow · 9:30 AM", venue: "Eden Gardens, Kolkata", status: "upcoming" },
      { id: "c4", teamA: "Pakistan", teamB: "Sri Lanka", scoreA: "", scoreB: "", info: "25 Jul · 2:00 PM", venue: "Gaddafi Stadium, Lahore", status: "upcoming" },
      { id: "c5", teamA: "West Indies", teamB: "Bangladesh", scoreA: "", scoreB: "", info: "26 Jul · 6:00 PM", venue: "Kensington Oval, Barbados", status: "upcoming" },
    ],
    Previous: [
      { id: "c6", teamA: "India", teamB: "England", scoreA: "345/7", scoreB: "289 AO", info: "India won by 56 runs", venue: "Chepauk, Chennai", status: "result" },
      { id: "c7", teamA: "Australia", teamB: "Pakistan", scoreA: "312/6", scoreB: "308/9", info: "Australia won by 4 runs", venue: "MCG, Melbourne", status: "result" },
    ],
  },
  football: {
    Live: [
      { id: "f1", teamA: "Man City", teamB: "Arsenal", scoreA: "2", scoreB: "1", info: "67' · Premier League", venue: "Etihad Stadium", status: "live" },
      { id: "f2", teamA: "Real Madrid", teamB: "Barcelona", scoreA: "1", scoreB: "1", info: "54' · La Liga", venue: "Santiago Bernabéu", status: "live" },
    ],
    Upcoming: [
      { id: "f3", teamA: "Liverpool", teamB: "Chelsea", scoreA: "", scoreB: "", info: "Tomorrow · 8:00 PM", venue: "Anfield, Liverpool", status: "upcoming" },
      { id: "f4", teamA: "PSG", teamB: "Bayern Munich", scoreA: "", scoreB: "", info: "26 Jul · 10:45 PM", venue: "Parc des Princes", status: "upcoming" },
    ],
    Previous: [
      { id: "f5", teamA: "Man United", teamB: "Tottenham", scoreA: "3", scoreB: "2", info: "Man United won · FT", venue: "Old Trafford", status: "result" },
      { id: "f6", teamA: "Juventus", teamB: "AC Milan", scoreA: "0", scoreB: "0", info: "Draw · FT", venue: "Allianz Stadium", status: "result" },
    ],
  },
  tennis: {
    Live: [
      { id: "t1", teamA: "Djokovic", teamB: "Alcaraz", scoreA: "6-4, 3", scoreB: "3-6, 5", info: "Set 3 · Wimbledon SF", venue: "Centre Court, London", status: "live" },
    ],
    Upcoming: [
      { id: "t2", teamA: "Sinner", teamB: "Medvedev", scoreA: "", scoreB: "", info: "Tomorrow · 3:00 PM", venue: "Court Philippe-Chatrier", status: "upcoming" },
      { id: "t3", teamA: "Swiatek", teamB: "Sabalenka", scoreA: "", scoreB: "", info: "26 Jul · 5:00 PM", venue: "Arthur Ashe Stadium", status: "upcoming" },
    ],
    Previous: [
      { id: "t4", teamA: "Nadal", teamB: "Federer", scoreA: "6-3, 6-4", scoreB: "3-6, 4-6", info: "Nadal won · Final", venue: "Roland Garros", status: "result" },
    ],
  },
  basketball: {
    Live: [
      { id: "b1", teamA: "Lakers", teamB: "Warriors", scoreA: "87", scoreB: "91", info: "Q3 · 4:32 · NBA", venue: "Crypto.com Arena", status: "live" },
    ],
    Upcoming: [
      { id: "b2", teamA: "Celtics", teamB: "Heat", scoreA: "", scoreB: "", info: "Tomorrow · 7:30 AM", venue: "TD Garden, Boston", status: "upcoming" },
      { id: "b3", teamA: "Bulls", teamB: "Knicks", scoreA: "", scoreB: "", info: "26 Jul · 6:00 AM", venue: "United Center, Chicago", status: "upcoming" },
    ],
    Previous: [
      { id: "b4", teamA: "Bucks", teamB: "Nets", scoreA: "112", scoreB: "104", info: "Bucks won · Final", venue: "Fiserv Forum", status: "result" },
    ],
  },
  kabaddi: {
    Live: [
      { id: "k1", teamA: "Patna Pirates", teamB: "U Mumba", scoreA: "32", scoreB: "28", info: "H2 · 8 min · PKL", venue: "Patliputra Sports Complex", status: "live" },
    ],
    Upcoming: [
      { id: "k2", teamA: "Jaipur Pink Panthers", teamB: "Bengal Warriors", scoreA: "", scoreB: "", info: "Tomorrow · 7:30 PM", venue: "SMS Indoor Stadium", status: "upcoming" },
    ],
    Previous: [
      { id: "k3", teamA: "Dabang Delhi", teamB: "Telugu Titans", scoreA: "41", scoreB: "35", info: "Delhi won · Final", venue: "Thyagaraj Sports Complex", status: "result" },
    ],
  },
  hockey: {
    Live: [
      { id: "h1", teamA: "India", teamB: "Netherlands", scoreA: "3", scoreB: "2", info: "Q3 · 42' · FIH Pro League", venue: "Major Dhyan Chand Stadium", status: "live" },
    ],
    Upcoming: [
      { id: "h2", teamA: "Australia", teamB: "Belgium", scoreA: "", scoreB: "", info: "Tomorrow · 5:00 PM", venue: "Perth Hockey Stadium", status: "upcoming" },
    ],
    Previous: [
      { id: "h3", teamA: "Germany", teamB: "Argentina", scoreA: "4", scoreB: "2", info: "Germany won · FT", venue: "Olympic Stadium, Berlin", status: "result" },
    ],
  },
  badminton: {
    Live: [
      { id: "bd1", teamA: "Sindhu", teamB: "Tai Tzu-ying", scoreA: "21-18, 14", scoreB: "18-21, 18", info: "Game 3 · BWF World Tour", venue: "Axiata Arena, KL", status: "live" },
    ],
    Upcoming: [
      { id: "bd2", teamA: "Lakshya Sen", teamB: "Viktor Axelsen", scoreA: "", scoreB: "", info: "Tomorrow · 4:00 PM", venue: "Istora Senayan, Jakarta", status: "upcoming" },
    ],
    Previous: [
      { id: "bd3", teamA: "Srikanth", teamB: "Lin Dan", scoreA: "21-15, 21-19", scoreB: "15-21, 19-21", info: "Srikanth won · SF", venue: "All England Arena", status: "result" },
    ],
  },
  formula1: {
    Live: [
      { id: "f1r1", teamA: "Verstappen", teamB: "Hamilton", scoreA: "P1", scoreB: "P3", info: "Lap 42/58 · British GP", venue: "Silverstone Circuit", status: "live" },
    ],
    Upcoming: [
      { id: "f1r2", teamA: "Hungarian GP", teamB: "Qualifying", scoreA: "", scoreB: "", info: "Tomorrow · 5:00 PM", venue: "Hungaroring, Budapest", status: "upcoming" },
      { id: "f1r3", teamA: "Hungarian GP", teamB: "Race Day", scoreA: "", scoreB: "", info: "27 Jul · 3:00 PM", venue: "Hungaroring, Budapest", status: "upcoming" },
    ],
    Previous: [
      { id: "f1r4", teamA: "Leclerc", teamB: "Norris", scoreA: "P1", scoreB: "P2", info: "Leclerc won · Monaco GP", venue: "Circuit de Monaco", status: "result" },
    ],
  },
};

// ── Match Card ──────────────────────────────────────────────────────────────
function MatchCard({ match, sportColors }) {
  const isLive     = match.status === "live";
  const isUpcoming = match.status === "upcoming";

  return (
    <View style={matchStyles.card}>
      {/* Status badge */}
      <View style={matchStyles.topRow}>
        <Text style={matchStyles.venue} numberOfLines={1}>{match.venue}</Text>
        {isLive && (
          <View style={matchStyles.liveBadge}>
            <View style={matchStyles.liveDot} />
            <Text style={matchStyles.liveBadgeText}>LIVE</Text>
          </View>
        )}
        {isUpcoming && (
          <View style={matchStyles.upcomingBadge}>
            <Text style={matchStyles.upcomingBadgeText}>UPCOMING</Text>
          </View>
        )}
        {match.status === "result" && (
          <View style={matchStyles.resultBadge}>
            <Text style={matchStyles.resultBadgeText}>FT</Text>
          </View>
        )}
      </View>

      {/* Teams + scores */}
      <View style={matchStyles.teamsRow}>
        <View style={matchStyles.teamBlock}>
          <LinearGradient colors={sportColors} style={matchStyles.teamAvatar}>
            <Text style={matchStyles.teamInitial}>{match.teamA[0]}</Text>
          </LinearGradient>
          <Text style={matchStyles.teamName} numberOfLines={1}>{match.teamA}</Text>
          {!!match.scoreA && <Text style={[matchStyles.score, isLive && matchStyles.scoreLive]}>{match.scoreA}</Text>}
        </View>

        <View style={matchStyles.vsBlock}>
          <Text style={matchStyles.vsText}>VS</Text>
          {isLive && <View style={matchStyles.pulseDot} />}
        </View>

        <View style={[matchStyles.teamBlock, { alignItems: "flex-end" }]}>
          <LinearGradient colors={["#9AA1AE", "#6B7280"]} style={matchStyles.teamAvatar}>
            <Text style={matchStyles.teamInitial}>{match.teamB[0]}</Text>
          </LinearGradient>
          <Text style={matchStyles.teamName} numberOfLines={1}>{match.teamB}</Text>
          {!!match.scoreB && <Text style={[matchStyles.score, isLive && matchStyles.scoreLive]}>{match.scoreB}</Text>}
        </View>
      </View>

      {/* Match info */}
      <View style={matchStyles.infoRow}>
        <Feather name={isLive ? "radio" : isUpcoming ? "clock" : "check-circle"} size={11}
          color={isLive ? "#EF4444" : isUpcoming ? "#F97316" : "#10B981"} />
        <Text style={matchStyles.infoText}>{match.info}</Text>
      </View>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
// ── AI Chat Panel ────────────────────────────────────────────────────────────
function AIChatPanel({ currentContext }) {
  const [open, setOpen]         = useState(false);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [messages, setMessages] = useState([
    { id: "0", sender: "ai", text: "Hi! Ask me anything about sports — live scores, fixtures, players, stats 🏆" },
  ]);
  const scrollRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const togglePanel = () => {
    const toValue = open ? 0 : 1;
    setOpen(!open);
    Animated.spring(slideAnim, { toValue, useNativeDriver: false, tension: 80, friction: 12 }).start();
  };

  const panelHeight = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 320] });

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || loading) return;
    setInput("");
    setMessages(prev => [...prev, { id: String(Date.now()), sender: "user", text: content }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    setLoading(true);
    try {
      const prompt = `You are Mneva AI sports assistant. The user is viewing: ${currentContext}.
Answer concisely about sports — scores, fixtures, players, stats, news.
User question: ${content}`;
      const res = await apiFetch("/api/agent/chat", {
        method: "POST",
        body: { messages: [{ role: "user", content: prompt }] },
      });
      const aiText = res.response || res.reply || res.message || res.content || "Let me check that for you!";
      setMessages(prev => [...prev, { id: String(Date.now() + 1), sender: "ai", text: aiText }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setMessages(prev => [...prev, { id: String(Date.now() + 1), sender: "ai", text: "Couldn't reach AI right now. Try again!" }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, currentContext]);

  const QUICK = ["Live scores now", "Today's fixtures", "Top performers", "Recent results"];

  return (
    <View style={chatStyles.wrapper}>
      <TouchableOpacity style={chatStyles.toggleBar} onPress={togglePanel} activeOpacity={0.85}>
        <View style={chatStyles.toggleLeft}>
          <LinearGradient colors={["#F97316", "#6C47FF"]} style={chatStyles.aiDot}>
            <Feather name="cpu" size={12} color="#fff" />
          </LinearGradient>
          <Text style={chatStyles.toggleTitle}>Mneva AI</Text>
          {loading && <ActivityIndicator size="small" color="#F97316" style={{ marginLeft: 8 }} />}
        </View>
        <View style={chatStyles.toggleRight}>
          <Text style={chatStyles.toggleHint}>{open ? "Close" : "Ask about sports"}</Text>
          <Feather name={open ? "chevron-down" : "chevron-up"} size={16} color="#F97316" />
        </View>
      </TouchableOpacity>

      <Animated.View style={[chatStyles.panel, { height: panelHeight, overflow: "hidden" }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={chatStyles.quickChips}>
          {QUICK.map(q => (
            <TouchableOpacity key={q} style={chatStyles.quickChip} onPress={() => setInput(q)}>
              <Text style={chatStyles.quickChipText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView
          ref={scrollRef}
          style={chatStyles.msgScroll}
          contentContainerStyle={{ padding: 12, paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(m => (
            <View key={m.id} style={[chatStyles.bubble, m.sender === "user" ? chatStyles.bubbleUser : chatStyles.bubbleAi]}>
              <Text style={m.sender === "user" ? chatStyles.bubbleTextUser : chatStyles.bubbleTextAi}>{m.text}</Text>
            </View>
          ))}
          {loading && (
            <View style={[chatStyles.bubble, chatStyles.bubbleAi]}>
              <ActivityIndicator size="small" color="#F97316" />
            </View>
          )}
        </ScrollView>

        <View style={chatStyles.inputRow}>
          <TextInput
            style={chatStyles.input}
            placeholder="Ask about scores, fixtures, players…"
            placeholderTextColor="#9AA1AE"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[chatStyles.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            <Feather name="arrow-up" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

export default function SportsDiscovery({ navigation }) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected]   = useState(null);
  const [activeTab, setActiveTab] = useState("Live");
  const [aiMatches, setAiMatches] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState(false);

  const sport       = SPORTS.find(s => s.id === selected);
  const sportColors = sport?.colors || ["#6C47FF", "#4A2FCC"];
  // Priority: AI data > static fallback
  const matches = aiMatches ?? (selected ? (MATCHES[selected]?.[activeTab] || []) : []);
  const aiContext = sport ? `${sport.title} · ${activeTab}` : "Sports";

  const loadAIMatches = useCallback(async (sportTitle, tab) => {
    setAiLoading(true);
    setAiError(false);
    setAiMatches(null);
    try {
      const data = await fetchSportsFromAI(sportTitle, tab);
      setAiMatches(data);
    } catch {
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  }, []);

  const handleSportPress = (s) => {
    setSelected(s.id);
    setActiveTab("Live");
    loadAIMatches(s.title, "Live");
  };

  const handleTabPress = (tab) => {
    setActiveTab(tab);
    if (sport) loadAIMatches(sport.title, tab);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>Live · Scores · Highlights</Text>
          <Text style={styles.headerTitle}>{sport ? sport.title : "Sports"}</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>AI LIVE</Text>
        </View>
      </View>

      {/* ── Agent strip ── */}
      <LinearGradient
        colors={selected ? sportColors : ["#F97316", "#6C47FF"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.agentStrip}
      >
        <View style={styles.agentIcon}>
          <Feather name="cpu" size={14} color="#fff" />
        </View>
        <Text style={styles.agentText}>
          {selected
            ? <>Mneva AI tracking <Text style={styles.agentBold}>{sport.title} · {activeTab}</Text> in real-time</>
            : <>Mneva AI tracking <Text style={styles.agentBold}>live scores, fixtures & highlights</Text> in real-time</>
          }
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>

          {/* ── Sports grid (always visible) ── */}
          <Text style={styles.sectionLabel}>Choose a sport</Text>
          <View style={styles.grid}>
            {SPORTS.map((s) => (
              <TouchableOpacity
                key={s.id}
                activeOpacity={0.85}
                onPress={() => handleSportPress(s)}
                style={[styles.card, selected === s.id && styles.cardActive]}
              >
                <LinearGradient colors={s.colors} style={styles.cardIcon}>
                  <Feather name={s.icon} size={22} color="#fff" />
                </LinearGradient>
                {selected === s.id && (
                  <View style={styles.selectedMark}>
                    <Feather name="check" size={9} color="#fff" />
                  </View>
                )}
                <Text numberOfLines={1} style={[styles.cardTitle, selected === s.id && styles.cardTitleActive]}>
                  {s.title}
                </Text>
                <Text style={styles.cardSub}>Tap to explore</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Tabs + match cards (only when a sport is selected) ── */}
          {!!selected && (
            <View style={{ marginTop: 24 }}>

              {/* Tab row */}
              <View style={styles.tabRow}>
                {MATCH_TABS.map((tab) => (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => handleTabPress(tab)}
                    style={[styles.matchTab, activeTab === tab && { borderBottomColor: sportColors[0], borderBottomWidth: 2 }]}
                  >
                    {tab === "Live" && (
                      <View style={[styles.tabLiveDot, { backgroundColor: activeTab === "Live" ? sportColors[0] : "#9AA1AE" }]} />
                    )}
                    <Text style={[styles.matchTabText, activeTab === tab && { color: sportColors[0] }]}>
                      {tab}
                    </Text>
                    {!aiLoading && (
                      <View style={[styles.tabCount, activeTab === tab && { backgroundColor: sportColors[0] }]}>
                        <Text style={styles.tabCountText}>{matches.length}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* AI source label */}
              {!aiLoading && !aiError && aiMatches && (
                <View style={styles.aiSourceRow}>
                  <Feather name="cpu" size={10} color="#6C47FF" />
                  <Text style={styles.aiSourceText}>Powered by Mneva AI · DeepSeek</Text>
                </View>
              )}
              {!aiLoading && aiError && (
                <View style={styles.aiSourceRow}>
                  <Feather name="alert-circle" size={10} color="#F97316" />
                  <Text style={[styles.aiSourceText, { color: "#F97316" }]}>Showing cached data · AI unavailable</Text>
                </View>
              )}

              {/* Match cards */}
              {aiLoading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={sportColors[0]} />
                  <Text style={styles.loadingText}>Mneva AI fetching {activeTab.toLowerCase()} matches…</Text>
                </View>
              ) : matches.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Feather name="inbox" size={28} color="#C4C9D4" />
                  <Text style={styles.emptyText}>No {activeTab.toLowerCase()} matches found</Text>
                </View>
              ) : (
                <View style={styles.matchList}>
                  {matches.map((match, i) => (
                    <MatchCard key={match.id || i} match={match} sportColors={sportColors} />
                  ))}
                </View>
              )}

            </View>
          )}

        </View>
      </ScrollView>

      {/* ── AI Chat Panel ── */}
      <AIChatPanel currentContext={aiContext} />

      {/* ── Bottom tab bar ── */}
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
          <Feather name="folder" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>SPACE</Text>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F3FA" },

  // Header
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#F4F3FA" },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  headerLabel: { fontSize: 10, fontWeight: "800", color: "#8B83C0", letterSpacing: 1.1, textTransform: "uppercase" },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#14171F", letterSpacing: -0.4, marginTop: 2 },
  livePill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFF7ED" },
  liveDot: { height: 6, width: 6, borderRadius: 3, backgroundColor: "#F97316" },
  liveText: { fontSize: 9, fontWeight: "800", color: "#F97316", letterSpacing: 0.7 },

  // Agent strip
  agentStrip: { marginHorizontal: 16, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", marginBottom: 20 },
  agentIcon: { width: 26, height: 26, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginRight: 10 },
  agentText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600", flex: 1 },
  agentBold: { color: "#FFFFFF", fontWeight: "800" },

  content: { paddingHorizontal: 16 },
  sectionLabel: { fontSize: 10, fontWeight: "800", color: "#8B83C0", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 14 },

  // Grid
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  card: { width: "48%", backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#EBEBF5" },
  cardActive: { borderColor: "#F97316", backgroundColor: "#FFF7ED", shadowColor: "#F97316", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  cardIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  selectedMark: { position: "absolute", top: 10, right: 10, backgroundColor: "#F97316", width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 13, fontWeight: "800", color: "#14171F" },
  cardTitleActive: { color: "#F97316" },
  cardSub: { fontSize: 10, color: "#9AA1AE", fontWeight: "600" },

  // Tab bar
  tabBar: { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EBEBF5", paddingTop: 10 },
  tabItem: { flex: 1, alignItems: "center" },
  tabLabel: { fontSize: 10, fontWeight: "700", color: "#9AA1AE", marginTop: 4, letterSpacing: 0.3 },

  // Match tabs
  tabRow: { flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: 14, marginBottom: 14, overflow: "hidden", borderWidth: 1, borderColor: "#EBEBF5" },
  matchTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11, gap: 5, borderBottomWidth: 2, borderBottomColor: "transparent" },
  matchTabText: { fontSize: 12, fontWeight: "800", color: "#9AA1AE" },
  tabLiveDot: { width: 6, height: 6, borderRadius: 3 },
  tabCount: { backgroundColor: "#EBEBF5", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  tabCountText: { fontSize: 9, fontWeight: "800", color: "#FFFFFF" },

  // Match list
  matchList: { gap: 12 },
  loadingBox: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 12, color: "#9AA1AE", fontWeight: "600", textAlign: "center" },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: "#C4C9D4", fontWeight: "600" },
  aiSourceRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 10 },
  aiSourceText: { fontSize: 10, color: "#6C47FF", fontWeight: "700" },
});

// ── Match card styles ──────────────────────────────────────────────────────────────
const matchStyles = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, shadowColor: "#6C47FF", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  venue: { fontSize: 10, color: "#9AA1AE", fontWeight: "600", flex: 1, marginRight: 8 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF2F2", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#EF4444" },
  liveBadgeText: { fontSize: 9, fontWeight: "800", color: "#EF4444", letterSpacing: 0.5 },
  upcomingBadge: { backgroundColor: "#FFF7ED", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  upcomingBadgeText: { fontSize: 9, fontWeight: "800", color: "#F97316", letterSpacing: 0.5 },
  resultBadge: { backgroundColor: "#F0FDF4", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  resultBadgeText: { fontSize: 9, fontWeight: "800", color: "#10B981", letterSpacing: 0.5 },
  teamsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  teamBlock: { flex: 1, alignItems: "flex-start", gap: 5 },
  teamAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  teamInitial: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  teamName: { fontSize: 12, fontWeight: "800", color: "#14171F", maxWidth: 100 },
  score: { fontSize: 15, fontWeight: "800", color: "#374151" },
  scoreLive: { color: "#EF4444" },
  vsBlock: { alignItems: "center", gap: 4, paddingHorizontal: 8 },
  vsText: { fontSize: 10, fontWeight: "800", color: "#C4C9D4", letterSpacing: 1 },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  infoText: { fontSize: 11, color: "#6B7280", fontWeight: "600" },
});

// ── Chat panel styles ────────────────────────────────────────────────────────────
const chatStyles = StyleSheet.create({
  wrapper:         { backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E8E8F0" },
  toggleBar:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 11 },
  toggleLeft:      { flexDirection: "row", alignItems: "center", gap: 8 },
  aiDot:           { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  toggleTitle:     { fontSize: 13, fontWeight: "800", color: "#14171F" },
  toggleRight:     { flexDirection: "row", alignItems: "center", gap: 5 },
  toggleHint:      { fontSize: 11, color: "#F97316", fontWeight: "600" },
  panel:           { backgroundColor: "#FFF7ED" },
  quickChips:      { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  quickChip:       { backgroundColor: "#FFFFFF", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#FED7AA" },
  quickChipText:   { fontSize: 11, fontWeight: "700", color: "#F97316" },
  msgScroll:       { flex: 1 },
  bubble:          { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, maxWidth: "88%" },
  bubbleAi:        { backgroundColor: "#FFFFFF", alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleUser:      { backgroundColor: "#F97316", alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleTextAi:    { fontSize: 12.5, color: "#374151", lineHeight: 18 },
  bubbleTextUser:  { fontSize: 12.5, color: "#FFFFFF", lineHeight: 18 },
  inputRow:        { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#E8E8F0" },
  input:           { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: "#14171F" },
  sendBtn:         { width: 32, height: 32, borderRadius: 16, backgroundColor: "#F97316", alignItems: "center", justifyContent: "center" },
});
