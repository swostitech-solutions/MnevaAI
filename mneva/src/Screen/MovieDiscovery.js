import React, { useState, useRef, useCallback, useEffect } from "react";
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
  Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { apiFetch } from "../api/client";

const TMDB_API_KEY = "7d26a11b38639ed34d93fbd2cc667124";
const TMDB_BASE    = "https://api.themoviedb.org/3";
const TMDB_IMG     = "https://image.tmdb.org/t/p/w342";

// Section → language override
const SECTION_LANG = {
  bollywood: "hi",
  regional:  null, // handled per-chip
};

// Chip → base TMDB query params (language injected per-section at fetch time)
const CHIP_PARAMS = {
  "This Week":      { type: "trending", window: "week" },
  "This Month":     { type: "trending", window: "day" },
  "All Time":       { type: "discover", sort_by: "vote_count.desc" },
  "India":          { type: "discover", with_original_language: "hi" },
  "Global":         { type: "trending", window: "week" },
  "Action":         { type: "discover", with_genres: "28" },
  "Romance":        { type: "discover", with_genres: "10749" },
  "Comedy":         { type: "discover", with_genres: "35" },
  "Drama":          { type: "discover", with_genres: "18" },
  "Thriller":       { type: "discover", with_genres: "53" },
  // Bollywood-specific (language forced via SECTION_LANG)
  "BW Action":      { type: "discover", with_genres: "28", with_original_language: "hi" },
  "BW Romance":     { type: "discover", with_genres: "10749", with_original_language: "hi" },
  "BW Comedy":      { type: "discover", with_genres: "35", with_original_language: "hi" },
  "BW Drama":       { type: "discover", with_genres: "18", with_original_language: "hi" },
  "BW Thriller":    { type: "discover", with_genres: "53", with_original_language: "hi" },
  // Hollywood-specific
  "HW Action":      { type: "discover", with_genres: "28", with_original_language: "en" },
  "HW Animation":   { type: "discover", with_genres: "16", with_original_language: "en" },
  "Sci-Fi":         { type: "discover", with_genres: "878", with_original_language: "en" },
  "Marvel":         { type: "discover", with_genres: "28", with_original_language: "en" },
  "DC":             { type: "discover", with_genres: "28", with_original_language: "en" },
  "Animation":      { type: "discover", with_genres: "16" },
  "Horror":         { type: "discover", with_genres: "27" },
  "Mystery":        { type: "discover", with_genres: "9648" },
  "Documentary":    { type: "discover", with_genres: "99" },
  "Biography":      { type: "discover", with_genres: "36" },
  "Fantasy":        { type: "discover", with_genres: "14" },
  "Netflix":        { type: "discover", with_genres: "18", sort_by: "popularity.desc" },
  "Prime Video":    { type: "discover", with_genres: "28", sort_by: "popularity.desc" },
  "Hotstar":        { type: "discover", with_original_language: "hi" },
  "SonyLIV":        { type: "discover", with_original_language: "hi" },
  "ZEE5":           { type: "discover", with_original_language: "hi" },
  "Tamil":          { type: "discover", with_original_language: "ta" },
  "Telugu":         { type: "discover", with_original_language: "te" },
  "Malayalam":      { type: "discover", with_original_language: "ml" },
  "Kannada":        { type: "discover", with_original_language: "kn" },
  "Punjabi":        { type: "discover", with_original_language: "pa" },
  "Oscar":          { type: "discover", sort_by: "vote_average.desc", "vote_count.gte": "500", with_original_language: "en" },
  "Filmfare":       { type: "discover", sort_by: "vote_average.desc", with_original_language: "hi" },
  "BAFTA":          { type: "discover", sort_by: "vote_average.desc", with_original_language: "en" },
  "National Award": { type: "discover", sort_by: "vote_average.desc", with_original_language: "hi" },
  "Cannes":         { type: "discover", sort_by: "vote_average.desc", "vote_count.gte": "200" },
  "Disney":         { type: "discover", with_genres: "16", sort_by: "popularity.desc" },
  "Pixar":          { type: "discover", with_genres: "16", sort_by: "vote_average.desc" },
  "Family":         { type: "discover", with_genres: "10751" },
  "Adventure":      { type: "discover", with_genres: "12" },
};

async function fetchTMDB(section, chip) {
  const p = { ...(CHIP_PARAMS[chip] || { type: "trending", window: "week" }) };

  // Inject section-level language if the chip doesn't already pin a language
  const sectionLang = SECTION_LANG[section];
  if (sectionLang && !p.with_original_language) {
    p.with_original_language = sectionLang;
  }

  const { type, window: win, ...rest } = p;

  let url;
  if (type === "trending") {
    // For bollywood trending, use discover instead so language filter applies
    if (rest.with_original_language) {
      const qs = new URLSearchParams({ api_key: TMDB_API_KEY, language: "en-US", sort_by: "popularity.desc", ...rest }).toString();
      url = `${TMDB_BASE}/discover/movie?${qs}`;
    } else {
      const qs = new URLSearchParams({ api_key: TMDB_API_KEY, language: "en-US", ...rest }).toString();
      url = `${TMDB_BASE}/trending/movie/${win || "week"}?${qs}`;
    }
  } else {
    const qs = new URLSearchParams({ api_key: TMDB_API_KEY, language: "en-US", sort_by: "popularity.desc", ...rest }).toString();
    url = `${TMDB_BASE}/discover/movie?${qs}`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  return (data.results || []).slice(0, 10).map(m => ({
    title: m.title || m.name || "Unknown",
    director: m.release_date?.slice(0, 4) || "",
    year: m.vote_average ? `⭐ ${m.vote_average.toFixed(1)}` : "",
    poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    overview: m.overview || "",
  }));
}

const TAB_BAR_HEIGHT = 50;

// ── Browse categories ────────────────────────────────────────────────────────
const BROWSE = [
  { id: "trending",    title: "Trending",     icon: "trending-up", colors: ["#F97316", "#EA580C"] },
  { id: "bollywood",   title: "Bollywood",    icon: "film",        colors: ["#EC4899", "#BE185D"] },
  { id: "hollywood",   title: "Hollywood",    icon: "star",        colors: ["#6C47FF", "#4A2FCC"] },
  { id: "genres",      title: "Genres",       icon: "grid",        colors: ["#2563EB", "#1D4ED8"] },
  { id: "webseries",   title: "Web Series",   icon: "tv",          colors: ["#0EA5E9", "#0369A1"] },
  { id: "regional",    title: "Regional",     icon: "map-pin",     colors: ["#10B981", "#047857"] },
  { id: "awardwinner", title: "Award Winners",icon: "award",       colors: ["#EAB308", "#CA8A04"] },
  { id: "kids",        title: "Kids",         icon: "smile",       colors: ["#F43F5E", "#BE123C"] },
];

const GROUPS = {
  trending:    ["This Week", "This Month", "All Time", "India", "Global"],
  bollywood:   ["BW Action", "BW Romance", "BW Comedy", "BW Drama", "BW Thriller"],
  hollywood:   ["HW Action", "Sci-Fi", "Marvel", "DC", "HW Animation"],
  genres:      ["Horror", "Mystery", "Documentary", "Biography", "Fantasy"],
  webseries:   ["Netflix", "Prime Video", "Hotstar", "SonyLIV", "ZEE5"],
  regional:    ["Tamil", "Telugu", "Malayalam", "Kannada", "Punjabi"],
  awardwinner: ["Oscar", "Filmfare", "BAFTA", "National Award", "Cannes"],
  kids:        ["Animation", "Adventure", "Disney", "Pixar", "Family"],
};

// ── Fallback movie data ──────────────────────────────────────────────────────
const FALLBACK = {
  "This Week":    [["Animal","Sandeep Reddy Vanga","2023","#B45E4D"],["Jawan","Atlee","2023","#374151"],["Dunki","Rajkumar Hirani","2023","#6D93AB"],["Sam Bahadur","Meghna Gulzar","2023","#8EA373"],["12th Fail","Vidhu Vinod Chopra","2023","#BD9A77"]],
  Action:         [["Pathaan","Siddharth Anand","2023","#B45E4D"],["War","Siddharth Anand","2019","#374151"],["Tiger 3","Maneesh Sharma","2023","#6D93AB"],["KGF Chapter 2","Prashanth Neel","2022","#8EA373"],["RRR","S.S. Rajamouli","2022","#BD9A77"]],
  "Sci-Fi":       [["Oppenheimer","Christopher Nolan","2023","#374151"],["Dune Part Two","Denis Villeneuve","2024","#B45E4D"],["Interstellar","Christopher Nolan","2014","#6D93AB"],["Avatar","James Cameron","2009","#8EA373"],["Inception","Christopher Nolan","2010","#BD9A77"]],
  Netflix:        [["Sacred Games","Vikramaditya Motwane","2018","#E50914"],["Delhi Crime","Richie Mehta","2019","#B91C1C"],["Scam 1992","Hansal Mehta","2020","#991B1B"],["Mirzapur","Karan Anshuman","2018","#7F1D1D"],["Panchayat","Deepak Kumar Mishra","2020","#DC2626"]],
  Tamil:          [["Leo","Lokesh Kanagaraj","2023","#B45E4D"],["Jailer","Nelson","2023","#374151"],["Ponniyin Selvan","Mani Ratnam","2022","#6D93AB"],["Vikram","Lokesh Kanagaraj","2022","#8EA373"],["Master","Lokesh Kanagaraj","2021","#BD9A77"]],
  Oscar:          [["Oppenheimer","Christopher Nolan","2023","#EAB308"],["Everything Everywhere","Daniel Kwan","2022","#CA8A04"],["CODA","Sian Heder","2021","#B45309"],["Nomadland","Chloé Zhao","2020","#92400E"],["Parasite","Bong Joon-ho","2019","#78350F"]],
  Animation:      [["Spider-Man: Across the Spider-Verse","Joaquim Dos Santos","2023","#6C47FF"],["The Lion King","Jon Favreau","2019","#F59E0B"],["Encanto","Byron Howard","2021","#EC4899"],["Turning Red","Domee Shi","2022","#F97316"],["Moana","Ron Clements","2016","#0EA5E9"]],
};

const COVER_COLORS = ["#B45E4D","#374151","#6D93AB","#8EA373","#BD9A77","#6C47FF","#EC4899","#EAB308","#0EA5E9","#10B981"];

// ── Parse AI response into movie rows ────────────────────────────────────────
function parseMoviesFromAI(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const movies = [];
  for (const line of lines) {
    const numbered = line.match(/^\d+[\.\)]\s*(.+)/);
    const raw = numbered ? numbered[1] : line;
    const dashSplit = raw.split(/\s[-–]\s/);
    if (dashSplit.length >= 2) {
      const title = dashSplit[0].replace(/^["']|["']$/g, "").trim();
      const rest = dashSplit.slice(1).join(" - ");
      const dotSplit = rest.split(/\s[·•]\s/);
      const director = dotSplit[0].trim();
      const year = dotSplit[1]?.trim() || "";
      if (title.length > 1 && director.length > 1) {
        movies.push([title, director, year, COVER_COLORS[movies.length % COVER_COLORS.length]]);
      }
    } else if (raw.toLowerCase().includes(" by ")) {
      const bySplit = raw.split(/ by /i);
      const title = bySplit[0].replace(/^["']|["']$/g, "").trim();
      const director = bySplit[1]?.trim() || "";
      if (title.length > 1 && director.length > 1) {
        movies.push([title, director, "", COVER_COLORS[movies.length % COVER_COLORS.length]]);
      }
    }
    if (movies.length >= 10) break;
  }
  return movies.length >= 3 ? movies : null;
}

function openYouTube(title) {
  Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(title + " trailer")}`);
}

// ── Movie Card ───────────────────────────────────────────────────────────────
function MovieCard({ title, director, year, color, index, isSaved, onToggleSaved, poster, overview }) {
  return (
    <View style={styles.movieCard}>
      {poster ? (
        <Image source={{ uri: poster }} style={styles.moviePoster} resizeMode="cover" />
      ) : (
        <View style={[styles.moviePoster, { backgroundColor: color, alignItems: "center", justifyContent: "center" }]}>
          <Text style={styles.movieRank}>#{index + 1}</Text>
          <Feather name="film" size={28} color="rgba(255,255,255,0.6)" />
        </View>
      )}
      <View style={styles.movieInfo}>
        <Text numberOfLines={2} style={styles.movieTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.movieDirector}>{director}</Text>
        {!!year && <Text style={styles.movieYear}>{year}</Text>}
        {!!overview && <Text numberOfLines={2} style={styles.movieOverview}>{overview}</Text>}
        <View style={styles.movieActions}>
          <TouchableOpacity style={styles.trailerBtn} onPress={() => openYouTube(title)}>
            <Feather name="youtube" size={13} color="#FF0000" />
            <Text style={styles.trailerBtnText}>Trailer</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onToggleSaved} style={styles.saveBtn}>
            <Feather name="bookmark" size={15} color={isSaved ? "#6C47FF" : "#9AA1AE"} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export { BROWSE, GROUPS, FALLBACK, parseMoviesFromAI, MovieCard, openYouTube };

// ── AI Chat Panel ────────────────────────────────────────────────────────────
function AIChatPanel({ onMoviesUpdate, currentContext }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { id: "0", sender: "ai", text: "Hi! Ask me for movie recommendations — by genre, mood, language, director, or platform 🎬" },
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
      const prompt = `You are Mneva AI movie assistant. The user is browsing ${currentContext}.
Respond with a numbered list of 5-8 movie recommendations in this exact format:
1. Movie Title - Director Name · Year
2. Movie Title - Director Name · Year
Keep it concise. User request: ${content}`;

      const res = await apiFetch("/api/agent/chat", {
        method: "POST",
        body: { messages: [{ role: "user", content: prompt }] },
      });

      const aiText = res.response || res.reply || res.message || res.content || "Here are some picks for you!";
      setMessages(prev => [...prev, { id: String(Date.now() + 1), sender: "ai", text: aiText }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

      const parsed = parseMoviesFromAI(aiText);
      if (parsed) onMoviesUpdate(parsed, currentContext);
    } catch {
      setMessages(prev => [...prev, {
        id: String(Date.now() + 1), sender: "ai",
        text: "Couldn't connect to AI right now. Try again!",
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, currentContext, onMoviesUpdate]);

  return (
    <View style={panelStyles.wrapper}>
      <TouchableOpacity style={panelStyles.toggleBar} onPress={togglePanel} activeOpacity={0.85}>
        <View style={panelStyles.toggleLeft}>
          <LinearGradient colors={["#6C47FF", "#4A2FCC"]} style={panelStyles.aiDot}>
            <Feather name="cpu" size={12} color="#fff" />
          </LinearGradient>
          <Text style={panelStyles.toggleTitle}>Mneva AI</Text>
          {loading && <ActivityIndicator size="small" color="#6C47FF" style={{ marginLeft: 8 }} />}
        </View>
        <View style={panelStyles.toggleRight}>
          <Text style={panelStyles.toggleHint}>{open ? "Close" : "Ask AI for movies"}</Text>
          <Feather name={open ? "chevron-down" : "chevron-up"} size={16} color="#6C47FF" />
        </View>
      </TouchableOpacity>

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
              <ActivityIndicator size="small" color="#6C47FF" />
            </View>
          )}
        </ScrollView>

        <View style={panelStyles.inputRow}>
          <TextInput
            style={panelStyles.input}
            placeholder="Ask for movies, directors, genres…"
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
export default function MovieDiscovery({ navigation }) {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState("trending");
  const [selection, setSelection] = useState("This Week");
  const [saved, setSaved] = useState([]);
  const [aiMovies, setAiMovies] = useState(null);
  const [aiLabel, setAiLabel] = useState(null);
  const [aiContext, setAiContext] = useState("Trending · This Week");
  const [tmdbMovies, setTmdbMovies] = useState(null);
  const [tmdbLoading, setTmdbLoading] = useState(false);

  const sectionTitle = BROWSE.find(b => b.id === section)?.title || "Movies";
  const sectionColors = BROWSE.find(b => b.id === section)?.colors || ["#6C47FF", "#4A2FCC"];

  // Priority: AI override > TMDB > static fallback
  const rawMovies = aiMovies
    ? aiMovies
    : tmdbMovies
    ? tmdbMovies.map(m => [m.title, m.director, m.year, COVER_COLORS[0], m.poster, m.overview])
    : (FALLBACK[selection] || FALLBACK["This Week"]);

  // Normalise to [title, director, year, color, poster?, overview?]
  const movies = rawMovies.map(m => Array.isArray(m) ? m : [m.title, m.director, m.year, COVER_COLORS[0], m.poster, m.overview]);

  const loadTMDB = useCallback(async (sec, chip) => {
    setTmdbLoading(true);
    setTmdbMovies(null);
    try {
      const results = await fetchTMDB(sec, chip);
      if (results.length > 0) setTmdbMovies(results);
    } catch {
      // silently fall back to static data
    } finally {
      setTmdbLoading(false);
    }
  }, []);

  // Load TMDB on mount and whenever section/chip changes
  useEffect(() => {
    loadTMDB(section, selection);
  }, [section, selection]);

  const chooseSection = (id) => {
    setSection(id);
    const first = GROUPS[id][0];
    setSelection(first);
    setAiMovies(null);
    setAiLabel(null);
    setAiContext(`${BROWSE.find(b => b.id === id)?.title} · ${first}`);
  };

  const chooseSelection = (item) => {
    setSelection(item);
    setAiMovies(null);
    setAiLabel(null);
    setAiContext(`${sectionTitle} · ${item}`);
  };

  const handleAiMovies = useCallback((movies, label) => {
    setAiMovies(movies);
    setAiLabel(label);
  }, []);

  const toggleSaved = (title) => {
    setSaved(items => items.includes(title) ? items.filter(i => i !== title) : [...items, title]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>Movie intelligence</Text>
            <Text style={styles.headerTitle}>Find your film</Text>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>AI LIVE</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 28 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>

            {/* ── Browse grid ── */}
            <View style={styles.browseGrid}>
              {BROWSE.map(item => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => chooseSection(item.id)}
                  style={[styles.browseCard, section === item.id && styles.browseCardActive]}
                >
                  <LinearGradient colors={item.colors} style={styles.browseIcon}>
                    <Feather name={item.icon} size={18} color="#FFFFFF" />
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

            {/* ── Agent strip ── */}
            <LinearGradient colors={sectionColors} style={styles.agentStrip} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <View style={styles.agentIcon}><Feather name="cpu" size={14} color="#FFFFFF" /></View>
              <Text style={styles.agentText}>
                Mneva AI is curating{" "}
                <Text style={styles.agentHighlight}>{sectionTitle.toLowerCase()}</Text>
                {" "}picks in real-time
              </Text>
            </LinearGradient>

            {/* ── Sub-category chips ── */}
            <View style={styles.headingRow}>
              <View>
                <Text style={styles.sectionLabel}>{sectionTitle}</Text>
                <Text style={styles.sectionHeading}>Choose a category</Text>
              </View>
              <Text style={styles.countBadge}>{aiMovies ? `AI · ${aiMovies.length}` : "TOP 5"}</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {GROUPS[section].map(item => (
                <TouchableOpacity
                  key={item}
                  onPress={() => chooseSelection(item)}
                  style={[styles.chip, selection === item && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selection === item && styles.chipTextActive]}>
                    {item.replace(/^(BW|HW) /, "")}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* ── List header ── */}
            <View style={styles.listHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text numberOfLines={1} style={styles.listTitle}>{(aiLabel || selection).replace(/^(BW|HW) /, "")}</Text>
                <Text style={styles.listSub}>
                  {aiMovies ? "✨ AI-curated picks" : tmdbMovies ? "🎬 Live from TMDB" : "Top picks for you"}
                </Text>
              </View>
              {tmdbLoading && <ActivityIndicator size="small" color="#6C47FF" style={{ marginRight: 8 }} />}
              {aiMovies && (
                <TouchableOpacity onPress={() => { setAiMovies(null); setAiLabel(null); }}>
                  <Text style={styles.resetBtn}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Movie cards ── */}
            <View style={styles.movieList}>
              {movies.map(([title, director, year, color, poster, overview], index) => (
                <MovieCard
                  key={`${title}-${index}`}
                  title={title}
                  director={director}
                  year={year}
                  color={color || COVER_COLORS[index % COVER_COLORS.length]}
                  index={index}
                  poster={poster || null}
                  overview={overview || ""}
                  isSaved={saved.includes(title)}
                  onToggleSaved={() => toggleSaved(title)}
                />
              ))}
            </View>

          </View>
        </ScrollView>

        {/* ── AI Chat Panel ── */}
        <AIChatPanel onMoviesUpdate={handleAiMovies} currentContext={aiContext} />

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

// ── Styles ───────────────────────────────────────────────────────────────────
const panelStyles = StyleSheet.create({
  wrapper: { backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E8E8F0" },
  toggleBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 11 },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiDot: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  toggleTitle: { fontSize: 13, fontWeight: "800", color: "#14171F" },
  toggleRight: { flexDirection: "row", alignItems: "center", gap: 5 },
  toggleHint: { fontSize: 11, color: "#6C47FF", fontWeight: "600" },
  panel: { backgroundColor: "#F5F3FF" },
  msgScroll: { flex: 1 },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, maxWidth: "88%" },
  bubbleAi: { backgroundColor: "#FFFFFF", alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: "#6C47FF", alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleTextAi: { fontSize: 12.5, color: "#374151", lineHeight: 18 },
  bubbleTextUser: { fontSize: 12.5, color: "#FFFFFF", lineHeight: 18 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#E8E8F0" },
  input: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: "#14171F" },
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#6C47FF", alignItems: "center", justifyContent: "center" },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F3FA" },

  // Header
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#F4F3FA" },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  headerLabel: { fontSize: 10, fontWeight: "800", color: "#8B83C0", letterSpacing: 1.1, textTransform: "uppercase" },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#14171F", letterSpacing: -0.4, marginTop: 2 },
  livePill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EDE9FE" },
  liveDot: { height: 6, width: 6, borderRadius: 3, backgroundColor: "#6C47FF" },
  liveText: { fontSize: 9, fontWeight: "800", color: "#6C47FF", letterSpacing: 0.7 },

  content: { paddingHorizontal: 16, paddingTop: 4 },

  // Browse grid
  browseGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10, marginBottom: 16 },
  browseCard: { width: "23.5%", backgroundColor: "#FFFFFF", borderRadius: 16, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "#EBEBF5", gap: 7 },
  browseCardActive: { borderColor: "#A78BFA", backgroundColor: "#F5F3FF", shadowColor: "#6C47FF", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  browseIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  selectedMark: { position: "absolute", top: 7, right: 7, backgroundColor: "#6C47FF", width: 15, height: 15, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  browseTitle: { fontSize: 9, fontWeight: "800", color: "#4B5563", textAlign: "center" },
  browseTitleActive: { color: "#6C47FF" },

  // Agent strip
  agentStrip: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", marginBottom: 20 },
  agentIcon: { width: 26, height: 26, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginRight: 10 },
  agentText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
  agentHighlight: { color: "#FFFFFF", fontWeight: "800" },

  // Section heading + chips
  headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontWeight: "800", color: "#8B83C0", letterSpacing: 1.1, textTransform: "uppercase" },
  sectionHeading: { fontSize: 18, fontWeight: "800", color: "#14171F", letterSpacing: -0.3, marginTop: 3 },
  countBadge: { fontSize: 10, fontWeight: "800", color: "#6C47FF", paddingBottom: 2 },
  chips: { gap: 8, paddingBottom: 16 },
  chip: { borderRadius: 20, backgroundColor: "#EBEBF5", paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: "#6C47FF" },
  chipText: { fontSize: 12, color: "#4B5563", fontWeight: "700" },
  chipTextActive: { color: "#FFFFFF" },

  // List header
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  listTitle: { fontSize: 17, fontWeight: "800", color: "#14171F", letterSpacing: -0.3 },
  listSub: { fontSize: 11, color: "#8B83C0", marginTop: 2 },
  resetBtn: { fontSize: 12, color: "#6C47FF", fontWeight: "800" },

  // Movie cards
  movieList: { gap: 12, marginBottom: 8 },
  movieCard: { backgroundColor: "#FFFFFF", borderRadius: 18, flexDirection: "row", overflow: "hidden", shadowColor: "#6C47FF", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  moviePoster: { width: 90, height: 120 },
  movieOverview: { fontSize: 10, color: "#9AA1AE", marginTop: 3, lineHeight: 14 },
  movieRank: { fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.8)" },
  movieInfo: { flex: 1, padding: 14, justifyContent: "space-between" },
  movieTitle: { fontSize: 14, fontWeight: "800", color: "#14171F", lineHeight: 20 },
  movieDirector: { fontSize: 11, color: "#6B7280", marginTop: 3 },
  movieYear: { fontSize: 10, color: "#A78BFA", fontWeight: "700", marginTop: 2 },
  movieActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  trailerBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FEF2F2", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  trailerBtnText: { fontSize: 11, fontWeight: "700", color: "#EF4444" },
  saveBtn: { padding: 4 },

  // Tab bar
  tabBar: { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EBEBF5", paddingTop: 10 },
  tabItem: { flex: 1, alignItems: "center" },
  tabLabel: { fontSize: 10, fontWeight: "700", color: "#9AA1AE", marginTop: 4, letterSpacing: 0.3 },
});
