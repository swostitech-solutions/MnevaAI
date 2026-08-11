import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { apiFetch } from "../api/client";
import { useTheme } from '@react-navigation/native';

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

// ── DeepSeek: fetch summary + key points ─────────────────────────────────────
async function fetchStoryAnalysis(headline, summary) {
  const prompt = `You are Mneva AI news analyst. Analyse this news story and return ONLY a valid JSON object (no markdown):
{
  "summary": "3-4 sentence plain-English summary of the story",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4"],
  "sentiment": "Positive | Negative | Neutral",
  "impact": "High | Medium | Low",
  "impactReason": "one sentence why"
}

Story headline: ${headline}
Story summary: ${summary}

Return ONLY the JSON object.`;

  const res = await apiFetch("/api/agent/chat", {
    method: "POST",
    body: { messages: [{ role: "user", content: prompt }] },
  });
  const text = res.response || res.reply || res.message || res.content || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

// ── Ask Mneva chat ────────────────────────────────────────────────────────────
function AskMnevaPanel({ headline, summary }) {
  const [open, setOpen]         = useState(false);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [messages, setMessages] = useState([
    { id: "0", sender: "ai", text: `I've read this story. Ask me anything about it — context, impact, background or related news 🗞️` },
  ]);
  const scrollRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const togglePanel = () => {
    const toValue = open ? 0 : 1;
    setOpen(!open);
    Animated.spring(slideAnim, { toValue, useNativeDriver: false, tension: 80, friction: 12 }).start();
  };

  const panelHeight = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 300] });

  const QUICK = ["Why does this matter?", "Give me background", "What happens next?", "Related stories"];

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    if (!text) setInput("");
    setMessages(prev => [...prev, { id: String(Date.now()), sender: "user", text: content }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    setLoading(true);
    try {
      const prompt = `You are Mneva AI. The user is reading this news story:
Headline: ${headline}
Summary: ${summary}

Answer this question concisely (3-5 sentences max): ${content}`;
      const res = await apiFetch("/api/agent/chat", {
        method: "POST",
        body: { messages: [{ role: "user", content: prompt }] },
      });
      const aiText = res.response || res.reply || res.message || res.content || "Let me think about that!";
      setMessages(prev => [...prev, { id: String(Date.now() + 1), sender: "ai", text: aiText }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setMessages(prev => [...prev, { id: String(Date.now() + 1), sender: "ai", text: "Couldn't reach AI right now. Try again!" }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, headline, summary]);

  return (
    <View style={chatStyles.wrapper}>
      {/* Toggle bar */}
      <TouchableOpacity style={chatStyles.toggleBar} onPress={togglePanel} activeOpacity={0.85}>
        <View style={chatStyles.toggleLeft}>
          <LinearGradient colors={["#6C47FF", "#4A2FCC"]} style={chatStyles.aiDot}>
            <Feather name="cpu" size={12} color="#fff" />
          </LinearGradient>
          <Text style={chatStyles.toggleTitle}>Ask Mneva</Text>
          {loading && <ActivityIndicator size="small" color="#6C47FF" style={{ marginLeft: 8 }} />}
        </View>
        <View style={chatStyles.toggleRight}>
          <Text style={chatStyles.toggleHint}>{open ? "Close" : "Ask about this story"}</Text>
          <Feather name={open ? "chevron-down" : "chevron-up"} size={16} color="#6C47FF" />
        </View>
      </TouchableOpacity>

      <Animated.View style={[chatStyles.panel, { height: panelHeight, overflow: "hidden" }]}>
        {/* Quick chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={chatStyles.quickChips}>
          {QUICK.map(q => (
            <TouchableOpacity key={q} style={chatStyles.quickChip} onPress={() => sendMessage(q)}>
              <Text style={chatStyles.quickChipText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Messages */}
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
              <ActivityIndicator size="small" color="#6C47FF" />
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={chatStyles.inputRow}>
          <TextInput
            style={chatStyles.input}
            placeholder="Ask anything about this story…"
            placeholderTextColor="#9AA1AE"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[chatStyles.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]}
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

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function NewsStory({ route, navigation }) {
  const insets  = useSafeAreaInsets();
  const story   = route?.params?.story || {};
  const colors  = getCategoryColors(story.category);

  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchStoryAnalysis(story.headline, story.summary);
        setAnalysis(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sentimentColor = analysis?.sentiment === "Positive" ? "#10B981"
    : analysis?.sentiment === "Negative" ? "#EF4444" : "#F59E0B";

  const impactColor = analysis?.impact === "High" ? "#EF4444"
    : analysis?.impact === "Medium" ? "#F97316" : "#10B981";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color="#14171F" />
          </TouchableOpacity>
          <View style={[styles.categoryPill, { backgroundColor: colors[0] + "18" }]}>
            <Text style={[styles.categoryText, { color: colors[0] }]}>{story.category}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={styles.timeText}>{story.time}</Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 160 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Category gradient bar ── */}
          <LinearGradient colors={colors} style={styles.categoryBar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />

          <View style={styles.content}>

            {/* ── Headline ── */}
            <Text style={styles.headline}>{story.headline}</Text>

            {/* ── Meta row ── */}
            <View style={styles.metaRow}>
              <View style={styles.sourceRow}>
                <View style={[styles.sourceDot, { backgroundColor: colors[0] }]} />
                <Text style={styles.sourceText}>{story.source}</Text>
              </View>
              <View style={styles.readRow}>
                <Feather name="clock" size={11} color="#9AA1AE" />
                <Text style={styles.readTime}>{story.readTime}</Text>
              </View>
            </View>

            {/* ── Original summary ── */}
            <Text style={styles.originalSummary}>{story.summary}</Text>

            {/* ── AI Analysis card ── */}
            <View style={styles.analysisCard}>
              <LinearGradient colors={colors} style={styles.analysisBar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
              <View style={styles.analysisHeader}>
                <LinearGradient colors={["#6C47FF", "#4A2FCC"]} style={styles.analysisIcon}>
                  <Feather name="cpu" size={13} color="#fff" />
                </LinearGradient>
                <Text style={styles.analysisTitle}>Mneva AI Analysis</Text>
                {loading && <ActivityIndicator size="small" color="#6C47FF" style={{ marginLeft: 8 }} />}
              </View>

              {loading && (
                <View style={styles.analysisLoading}>
                  <Text style={styles.analysisLoadingText}>Analysing story…</Text>
                </View>
              )}

              {error && !loading && (
                <Text style={styles.analysisError}>Couldn't analyse this story right now.</Text>
              )}

              {analysis && !loading && (
                <View style={styles.analysisBody}>

                  {/* Sentiment + Impact badges */}
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: sentimentColor + "18" }]}>
                      <Feather name="activity" size={10} color={sentimentColor} />
                      <Text style={[styles.badgeText, { color: sentimentColor }]}>{analysis.sentiment}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: impactColor + "18" }]}>
                      <Feather name="zap" size={10} color={impactColor} />
                      <Text style={[styles.badgeText, { color: impactColor }]}>{analysis.impact} Impact</Text>
                    </View>
                  </View>

                  {/* AI Summary */}
                  <Text style={styles.aiSummaryLabel}>SUMMARY</Text>
                  <Text style={styles.aiSummaryText}>{analysis.summary}</Text>

                  {/* Key Points */}
                  <Text style={styles.aiSummaryLabel}>KEY POINTS</Text>
                  <View style={styles.keyPointsList}>
                    {(analysis.keyPoints || []).map((pt, i) => (
                      <View key={i} style={styles.keyPointRow}>
                        <LinearGradient colors={colors} style={styles.keyPointDot} />
                        <Text style={styles.keyPointText}>{pt}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Impact reason */}
                  {!!analysis.impactReason && (
                    <View style={[styles.impactBox, { backgroundColor: impactColor + "10", borderColor: impactColor + "30" }]}>
                      <Feather name="info" size={12} color={impactColor} />
                      <Text style={[styles.impactText, { color: impactColor }]}>{analysis.impactReason}</Text>
                    </View>
                  )}

                  <View style={styles.aiSourceRow}>
                    <Feather name="cpu" size={10} color="#6C47FF" />
                    <Text style={styles.aiSourceText}>Powered by Mneva AI · DeepSeek</Text>
                  </View>
                </View>
              )}
            </View>

          </View>
        </ScrollView>

        {/* ── Ask Mneva panel ── */}
        <AskMnevaPanel headline={story.headline} summary={story.summary} />

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F3FA" },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#EBEBF5" },
  categoryPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  categoryText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  timeText: { fontSize: 11, color: "#9AA1AE", fontWeight: "600" },

  categoryBar: { height: 4, marginHorizontal: 16, borderRadius: 2, marginBottom: 16 },
  content: { paddingHorizontal: 16 },

  headline: { fontSize: 22, fontWeight: "800", color: "#14171F", lineHeight: 30, letterSpacing: -0.4, marginBottom: 12 },

  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sourceDot: { width: 7, height: 7, borderRadius: 4 },
  sourceText: { fontSize: 12, color: "#6B7280", fontWeight: "700" },
  readRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  readTime: { fontSize: 11, color: "#9AA1AE", fontWeight: "600" },

  originalSummary: { fontSize: 14, color: "#374151", lineHeight: 22, marginBottom: 20 },

  // Analysis card
  analysisCard: { backgroundColor: "#FFFFFF", borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "#EBEBF5", marginBottom: 16, shadowColor: "#6C47FF", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  analysisBar: { height: 3 },
  analysisHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, paddingBottom: 10 },
  analysisIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  analysisTitle: { fontSize: 13, fontWeight: "800", color: "#14171F" },
  analysisLoading: { paddingHorizontal: 14, paddingBottom: 14 },
  analysisLoadingText: { fontSize: 12, color: "#9AA1AE", fontWeight: "600" },
  analysisError: { fontSize: 12, color: "#F97316", paddingHorizontal: 14, paddingBottom: 14 },

  analysisBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  badgeRow: { flexDirection: "row", gap: 8 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: "800" },

  aiSummaryLabel: { fontSize: 9, fontWeight: "800", color: "#8B83C0", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 4 },
  aiSummaryText: { fontSize: 13, color: "#374151", lineHeight: 20 },

  keyPointsList: { gap: 8 },
  keyPointRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  keyPointDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  keyPointText: { fontSize: 12, color: "#374151", lineHeight: 18, flex: 1 },

  impactBox: { flexDirection: "row", alignItems: "flex-start", gap: 7, borderRadius: 10, borderWidth: 1, padding: 10 },
  impactText: { fontSize: 11, fontWeight: "600", flex: 1, lineHeight: 16 },

  aiSourceRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  aiSourceText: { fontSize: 10, color: "#6C47FF", fontWeight: "700" },
});

const chatStyles = StyleSheet.create({
  wrapper:        { backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E8E8F0" },
  toggleBar:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 11 },
  toggleLeft:     { flexDirection: "row", alignItems: "center", gap: 8 },
  aiDot:          { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  toggleTitle:    { fontSize: 13, fontWeight: "800", color: "#14171F" },
  toggleRight:    { flexDirection: "row", alignItems: "center", gap: 5 },
  toggleHint:     { fontSize: 11, color: "#6C47FF", fontWeight: "600" },
  panel:          { backgroundColor: "#F5F3FF" },
  quickChips:     { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  quickChip:      { backgroundColor: "#FFFFFF", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#DDD6FE" },
  quickChipText:  { fontSize: 11, fontWeight: "700", color: "#6C47FF" },
  msgScroll:      { flex: 1 },
  bubble:         { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, maxWidth: "88%" },
  bubbleAi:       { backgroundColor: "#FFFFFF", alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleUser:     { backgroundColor: "#6C47FF", alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleTextAi:   { fontSize: 12.5, color: "#374151", lineHeight: 18 },
  bubbleTextUser: { fontSize: 12.5, color: "#FFFFFF", lineHeight: 18 },
  inputRow:       { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#E8E8F0" },
  input:          { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: "#14171F" },
  sendBtn:        { width: 32, height: 32, borderRadius: 16, backgroundColor: "#6C47FF", alignItems: "center", justifyContent: "center" },
});
