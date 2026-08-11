import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { apiFetch } from "../api/client";

const TAB_BAR_HEIGHT = 50;

const CATEGORY_COLORS = {
  Politics:      ["#EF4444", "#B91C1C"],
  Business:      ["#F97316", "#EA580C"],
  Technology:    ["#6C47FF", "#4A2FCC"],
  Science:       ["#0EA5E9", "#0369A1"],
  Sports:        ["#10B981", "#047857"],
  Entertainment: ["#EC4899", "#BE185D"],
  Health:        ["#14B8A6", "#0F766E"],
  World:         ["#F59E0B", "#D97706"],
  Finance:       ["#8B5CF6", "#6D28D9"],
  India:         ["#F97316", "#EA580C"],
};
function getCategoryColors(cat) {
  return CATEGORY_COLORS[cat] || ["#6C47FF", "#4A2FCC"];
}

async function fetchNewsFromAI(type, filter) {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const prompts = {
    foryou:   `Today is ${today}. You are a news agent for Indian urban professionals. Return ONLY a valid JSON array of 6 current top news stories relevant to India covering tech, business, politics, sports, health and startups. Each object: { "headline": string, "summary": string (2 sentences), "source": string, "category": string, "time": string, "readTime": string }. ONLY the JSON array.`,
    trending: `Today is ${today}. You are a trending news agent. Return ONLY a valid JSON array of 6 currently trending/breaking news stories in India. Each object: { "headline": string, "summary": string (2 sentences), "source": string, "category": string, "time": string, "readTime": string }. ONLY the JSON array.`,
    discover: `Today is ${today}. Return ONLY a valid JSON array of 6 news stories about "${filter}". Each object: { "headline": string, "summary": string (2 sentences), "source": string, "category": string, "time": string, "readTime": string }. ONLY the JSON array.`,
  };
  const res = await apiFetch("/api/agent/chat", {
    method: "POST",
    body: { messages: [{ role: "user", content: prompts[type] || prompts.foryou }] },
  });
  const text = res.response || res.reply || res.message || res.content || "";
  const match = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
}

const NEWS_TABS = [
  { id: "foryou",    label: "For You",   icon: "user",      colors: ["#6C47FF", "#4A2FCC"] },
  { id: "discover",  label: "Discover",  icon: "compass",   colors: ["#0EA5E9", "#0369A1"] },
  { id: "trending",  label: "Trending",  icon: "trending-up", colors: ["#EF4444", "#B91C1C"] },
  { id: "following", label: "Following", icon: "bookmark",  colors: ["#10B981", "#047857"] },
];

function StoryCard({ story, onPress }) {
  const colors = getCategoryColors(story.category);
  return (
    <TouchableOpacity style={storyStyles.card} activeOpacity={0.85} onPress={onPress}>
      <LinearGradient colors={colors} style={storyStyles.categoryBar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      <View style={storyStyles.body}>
        <View style={storyStyles.topRow}>
          <View style={[storyStyles.categoryPill, { backgroundColor: colors[0] + "18" }]}>
            <Text style={[storyStyles.categoryText, { color: colors[0] }]}>{story.category}</Text>
          </View>
          <Text style={storyStyles.timeText}>{story.time}</Text>
        </View>
        <Text style={storyStyles.headline} numberOfLines={3}>{story.headline}</Text>
        <Text style={storyStyles.summary} numberOfLines={2}>{story.summary}</Text>
        <View style={storyStyles.bottomRow}>
          <View style={storyStyles.sourceRow}>
            <View style={[storyStyles.sourceDot, { backgroundColor: colors[0] }]} />
            <Text style={storyStyles.sourceText}>{story.source}</Text>
          </View>
          <View style={storyStyles.metaRow}>
            <Feather name="clock" size={10} color="#9AA1AE" />
            <Text style={storyStyles.readTime}>{story.readTime}</Text>
            <Feather name="chevron-right" size={13} color="#9AA1AE" style={{ marginLeft: 4 }} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Placeholder content per tab
const TAB_CONTENT = {
  foryou: {
    headline: "Your personalised feed",
    sub: "Mneva AI curates stories based on your interests, location and activity",
    chips: ["India", "Tech", "Finance", "Health", "Cricket", "Startups"],
  },
  discover: {
    headline: "Explore by topic",
    sub: "Browse categories, topics and sources to find what matters to you",
    chips: ["Politics", "Business", "Science", "Sports", "Entertainment", "World"],
  },
  trending: {
    headline: "What India is reading",
    sub: "Top stories ranked by real-time engagement across sources",
    chips: ["Breaking", "Top 10", "Viral", "India", "Global", "Opinion"],
  },
  following: {
    headline: "Your followed topics",
    sub: "Stories from topics and sources you follow appear here",
    chips: ["+ Follow a topic", "+ Add a source"],
  },
};

const DISCOVER_CATEGORIES = [
  { id: "politics",      label: "Politics",      icon: "flag",        colors: ["#EF4444", "#B91C1C"],  topics: ["India Politics", "Parliament", "Elections", "State News", "Policy"] },
  { id: "business",     label: "Business",      icon: "briefcase",   colors: ["#F97316", "#EA580C"],  topics: ["Startups", "Markets", "Economy", "Corporate", "MSMEs"] },
  { id: "technology",   label: "Technology",    icon: "cpu",         colors: ["#6C47FF", "#4A2FCC"],  topics: ["AI & ML", "Gadgets", "Apps", "Cybersecurity", "Space Tech"] },
  { id: "sports",       label: "Sports",        icon: "activity",    colors: ["#10B981", "#047857"],  topics: ["Cricket", "Football", "Tennis", "Kabaddi", "Olympics"] },
  { id: "science",      label: "Science",       icon: "zap",         colors: ["#0EA5E9", "#0369A1"],  topics: ["Space", "Climate", "Medicine", "Research", "Environment"] },
  { id: "entertainment",label: "Entertainment", icon: "film",        colors: ["#EC4899", "#BE185D"],  topics: ["Bollywood", "Hollywood", "OTT", "Music", "Celebrity"] },
  { id: "health",       label: "Health",        icon: "heart",       colors: ["#14B8A6", "#0F766E"],  topics: ["Fitness", "Mental Health", "Nutrition", "Hospitals", "Pharma"] },
  { id: "world",        label: "World",         icon: "globe",       colors: ["#F59E0B", "#D97706"],  topics: ["USA", "China", "Middle East", "Europe", "UN & Global"] },
];

export default function NewsDiscovery({ navigation }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab]         = useState("foryou");
  const [stories, setStories]             = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(false);
  const [discoverCat, setDiscoverCat]     = useState(null);
  const [discoverTopic, setDiscoverTopic] = useState(null);

  const tab     = NEWS_TABS.find(t => t.id === activeTab);
  const content = TAB_CONTENT[activeTab];

  const loadStories = useCallback(async (tabId, filter) => {
    if (tabId === "following") return;
    setLoading(true);
    setError(false);
    setStories([]);
    try {
      const data = await fetchNewsFromAI(tabId, filter);
      setStories(data || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStories("foryou"); }, []);

  const handleTabPress = (tabId) => {
    setActiveTab(tabId);
    setDiscoverCat(null);
    setDiscoverTopic(null);
    setStories([]);
    loadStories(tabId);
  };

  const handleCategoryPress = (cat) => {
    setDiscoverCat(cat);
    setDiscoverTopic(null);
    setStories([]);
  };

  const handleTopicPress = (topic) => {
    setDiscoverTopic(topic);
    loadStories("discover", topic);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>AI · Real-time · Personalised</Text>
          <Text style={styles.headerTitle}>News</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>AI LIVE</Text>
        </View>
      </View>

      {/* ── Agent strip ── */}
      <LinearGradient
        colors={tab.colors}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.agentStrip}
      >
        <View style={styles.agentIcon}>
          <Feather name="cpu" size={14} color="#fff" />
        </View>
        <Text style={styles.agentText}>
          Mneva AI scanning{" "}
          <Text style={styles.agentBold}>1,200+ sources</Text>
          {" "}· summarising in real-time
        </Text>
      </LinearGradient>

      {/* ── Tab row ── */}
      <View style={styles.tabRow}>
        {NEWS_TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            onPress={() => handleTabPress(t.id)}
            style={[styles.tab, activeTab === t.id && { borderBottomColor: t.colors[0], borderBottomWidth: 2 }]}
          >
            <Feather
              name={t.icon}
              size={13}
              color={activeTab === t.id ? t.colors[0] : "#9AA1AE"}
            />
            <Text style={[styles.tabText, activeTab === t.id && { color: t.colors[0] }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>

          {/* ── DISCOVER: category grid ── */}
          {activeTab === "discover" && !discoverCat && (
            <View>
              <Text style={styles.sectionLabel}>Browse by category</Text>
              <View style={styles.catGrid}>
                {DISCOVER_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={styles.catCard}
                    activeOpacity={0.85}
                    onPress={() => handleCategoryPress(cat)}
                  >
                    <LinearGradient colors={cat.colors} style={styles.catIcon}>
                      <Feather name={cat.icon} size={20} color="#fff" />
                    </LinearGradient>
                    <Text style={styles.catLabel}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── DISCOVER: topic chips ── */}
          {activeTab === "discover" && discoverCat && !discoverTopic && (
            <View>
              <TouchableOpacity style={styles.backRow} onPress={() => setDiscoverCat(null)}>
                <Feather name="arrow-left" size={14} color="#6C47FF" />
                <Text style={styles.backText}>All Categories</Text>
              </TouchableOpacity>
              <View style={styles.catHeaderRow}>
                <LinearGradient colors={discoverCat.colors} style={styles.catHeaderIcon}>
                  <Feather name={discoverCat.icon} size={16} color="#fff" />
                </LinearGradient>
                <Text style={styles.catHeaderLabel}>{discoverCat.label}</Text>
              </View>
              <Text style={styles.sectionLabel}>Choose a topic</Text>
              <View style={styles.topicGrid}>
                {discoverCat.topics.map(topic => (
                  <TouchableOpacity
                    key={topic}
                    style={[styles.topicChip, { borderColor: discoverCat.colors[0] + "40" }]}
                    onPress={() => handleTopicPress(topic)}
                  >
                    <Text style={[styles.topicChipText, { color: discoverCat.colors[0] }]}>{topic}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── DISCOVER: topic breadcrumb when stories showing ── */}
          {activeTab === "discover" && discoverTopic && (
            <TouchableOpacity style={styles.backRow} onPress={() => { setDiscoverTopic(null); setStories([]); }}>
              <Feather name="arrow-left" size={14} color="#6C47FF" />
              <Text style={styles.backText}>{discoverCat?.label} · {discoverTopic}</Text>
            </TouchableOpacity>
          )}

          {/* ── FOR YOU / TRENDING hero card ── */}
          {activeTab !== "discover" && (
            <View style={styles.heroCard}>
              <LinearGradient colors={[...tab.colors, "transparent"]} style={styles.heroAccent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
              <View style={styles.heroIconWrap}>
                <LinearGradient colors={tab.colors} style={styles.heroIcon}>
                  <Feather name={tab.icon} size={20} color="#fff" />
                </LinearGradient>
              </View>
              <Text style={styles.heroHeadline}>{TAB_CONTENT[activeTab]?.headline}</Text>
              <Text style={styles.heroSub}>{TAB_CONTENT[activeTab]?.sub}</Text>
            </View>
          )}

          {/* ── Stories (shared) ── */}
          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={tab.colors[0]} />
              <Text style={styles.loadingText}>Mneva AI fetching stories…</Text>
            </View>
          )}
          {!loading && error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={24} color="#F97316" />
              <Text style={styles.errorText}>Couldn’t load stories. Tap to retry.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => loadStories(activeTab, discoverTopic)}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          {!loading && !error && activeTab === "following" && (
            <View style={styles.errorBox}>
              <Feather name="bookmark" size={24} color="#10B981" />
              <Text style={styles.errorText}>Follow topics to see stories here</Text>
            </View>
          )}
          {!loading && !error && stories.length > 0 && (
            <View style={styles.storyList}>
              {stories.map((story, i) => (
                <StoryCard
                  key={i}
                  story={story}
                  onPress={() => navigation?.navigate?.("NewsStory", { story })}
                />
              ))}
              <View style={styles.aiSourceRow}>
                <Feather name="cpu" size={10} color="#6C47FF" />
                <Text style={styles.aiSourceText}>Powered by Mneva AI · DeepSeek</Text>
              </View>
            </View>
          )}

        </View>
      </ScrollView>

      {/* ── Bottom tab bar ── */}
      <View style={[styles.bottomBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.bottomItem} onPress={() => navigation?.navigate?.("Home")}>
          <Ionicons name="home" size={22} color="#9AA1AE" />
          <Text style={styles.bottomLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomItem} onPress={() => navigation?.navigate?.("Priorities")}>
          <Feather name="calendar" size={22} color="#9AA1AE" />
          <Text style={styles.bottomLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomItem} onPress={() => navigation?.navigate?.("AskAI")}>
          <Feather name="mic" size={22} color="#9AA1AE" />
          <Text style={styles.bottomLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomItem} onPress={() => navigation?.navigate?.("Space")}>
          <Feather name="folder" size={22} color="#9AA1AE" />
          <Text style={styles.bottomLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomItem} onPress={() => navigation?.navigate?.("Profile")}>
          <Feather name="user" size={22} color="#9AA1AE" />
          <Text style={styles.bottomLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F3FA" },

  // Header
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  headerLabel: { fontSize: 10, fontWeight: "800", color: "#8B83C0", letterSpacing: 1.1, textTransform: "uppercase" },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#14171F", letterSpacing: -0.4, marginTop: 2 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EDE9FE", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 7 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#6C47FF" },
  liveText: { fontSize: 9, fontWeight: "800", color: "#6C47FF", letterSpacing: 0.7 },

  // Agent strip
  agentStrip: { marginHorizontal: 16, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", marginBottom: 4 },
  agentIcon: { width: 26, height: 26, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginRight: 10 },
  agentText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600", flex: 1 },
  agentBold: { color: "#FFFFFF", fontWeight: "800" },

  // Tab row
  tabRow: { flexDirection: "row", backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#EBEBF5", marginTop: 12 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 11, fontWeight: "800", color: "#9AA1AE" },

  content: { paddingHorizontal: 16, paddingTop: 16 },

  // Hero card
  heroCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 18, marginBottom: 16, overflow: "hidden", borderWidth: 1, borderColor: "#EBEBF5" },
  heroAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  heroIconWrap: { marginBottom: 12 },
  heroIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  heroHeadline: { fontSize: 17, fontWeight: "800", color: "#14171F", marginBottom: 6, letterSpacing: -0.3 },
  heroSub: { fontSize: 12, color: "#6B7280", lineHeight: 18, marginBottom: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 11, fontWeight: "700" },

  // Placeholder
  placeholderBox: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 28, alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#EBEBF5" },
  placeholderIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  placeholderTitle: { fontSize: 15, fontWeight: "800", color: "#14171F" },
  placeholderSub: { fontSize: 12, color: "#9AA1AE", textAlign: "center", lineHeight: 18 },

  // Bottom tab bar
  bottomBar: { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EBEBF5", paddingTop: 10 },
  bottomItem: { flex: 1, alignItems: "center" },
  bottomLabel: { fontSize: 10, fontWeight: "700", color: "#9AA1AE", marginTop: 4, letterSpacing: 0.3 },

  // Story feed
  storyList:    { gap: 12 },

  // Discover
  sectionLabel:    { fontSize: 10, fontWeight: "800", color: "#8B83C0", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 12, marginTop: 4 },
  catGrid:         { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  catCard:         { width: "48%", backgroundColor: "#FFFFFF", borderRadius: 16, padding: 14, alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#EBEBF5" },
  catIcon:         { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  catLabel:        { fontSize: 12, fontWeight: "800", color: "#14171F" },
  backRow:         { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText:        { fontSize: 12, fontWeight: "700", color: "#6C47FF" },
  catHeaderRow:    { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  catHeaderIcon:   { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  catHeaderLabel:  { fontSize: 18, fontWeight: "800", color: "#14171F" },
  topicGrid:       { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  topicChip:       { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  topicChipText:   { fontSize: 12, fontWeight: "700" },
  loadingBox:   { alignItems: "center", paddingVertical: 48, gap: 12 },
  loadingText:  { fontSize: 12, color: "#9AA1AE", fontWeight: "600" },
  errorBox:     { alignItems: "center", paddingVertical: 40, gap: 10 },
  errorText:    { fontSize: 13, color: "#9AA1AE", fontWeight: "600", textAlign: "center" },
  retryBtn:     { backgroundColor: "#F97316", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 8 },
  retryText:    { fontSize: 12, fontWeight: "800", color: "#FFFFFF" },
  aiSourceRow:  { flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "center", paddingTop: 4 },
  aiSourceText: { fontSize: 10, color: "#6C47FF", fontWeight: "700" },
});

const storyStyles = StyleSheet.create({
  card:         { backgroundColor: "#FFFFFF", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "#EBEBF5", shadowColor: "#6C47FF", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  categoryBar:  { height: 3 },
  body:         { padding: 14 },
  topRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  categoryPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  categoryText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  timeText:     { fontSize: 10, color: "#9AA1AE", fontWeight: "600" },
  headline:     { fontSize: 15, fontWeight: "800", color: "#14171F", lineHeight: 22, marginBottom: 6, letterSpacing: -0.2 },
  summary:      { fontSize: 12, color: "#6B7280", lineHeight: 18, marginBottom: 12 },
  bottomRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sourceRow:    { flexDirection: "row", alignItems: "center", gap: 5 },
  sourceDot:    { width: 6, height: 6, borderRadius: 3 },
  sourceText:   { fontSize: 11, color: "#6B7280", fontWeight: "700" },
  metaRow:      { flexDirection: "row", alignItems: "center", gap: 4 },
  readTime:     { fontSize: 10, color: "#9AA1AE", fontWeight: "600" },
});
