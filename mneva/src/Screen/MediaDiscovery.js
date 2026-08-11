import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

const TAB_BAR_CONTENT_HEIGHT = 50;

const MEDIA_APPS = [
  {
    id: "m1",
    title: "Music",
    subtitle: "Spotify · JioSaavn",
    icon: "music",
    colors: ["#1DB954", "#158A3E"],
  },
  {
    id: "m2",
    title: "News",
    subtitle: "Top stories · Briefing",
    icon: "rss",
    colors: ["#E8453C", "#B52E27"],
  },
  {
    id: "m3",
    title: "Movies",
    subtitle: "Netflix · Prime · Hotstar",
    icon: "film",
    colors: ["#6C47FF", "#4A2FCC"],
  },
  {
    id: "m4",
    title: "Sports",
    subtitle: "Scores · Live · Highlights",
    icon: "activity",
    colors: ["#F5A623", "#D4861A"],
  },
];

export default function MediaDiscovery({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const pad = 20;
  const cardWidth = (width - pad * 2 - 12) / 2;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
          <Feather name="arrow-left" size={20} color="#14171F" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Media & Discovery</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: pad,
          paddingTop: 20,
          paddingBottom: tabBarHeight + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Discover</Text>

        <View style={styles.grid}>
          {MEDIA_APPS.map((app) => (
            <TouchableOpacity
              key={app.id}
              style={[styles.card, { width: cardWidth }]}
              activeOpacity={0.8}
              onPress={() => {
                if (app.id === "m1") navigation?.navigate?.("MusicDiscovery");
                if (app.id === "m2") navigation?.navigate?.("NewsDiscovery");
                if (app.id === "m3") navigation?.navigate?.("MovieDiscovery");
                if (app.id === "m4") navigation?.navigate?.("SportsDiscovery");
              }}
            >
              <LinearGradient
                colors={app.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconWrap}
              >
                <Feather name={app.icon} size={26} color="#FFFFFF" />
              </LinearGradient>
              <Text style={styles.cardTitle}>{app.title}</Text>
              <Text style={styles.cardSub}>{app.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

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
          <Feather name="folder" size={22} color="#1F7A54" />
          <Text style={[styles.tabLabel, { color: "#1F7A54" }]}>SPACE</Text>
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#F9FAFC",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: { fontSize: 17, fontWeight: "800", color: "#14171F" },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9AA1AE",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 14,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: "center",
    marginBottom: 4,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#14171F", marginBottom: 3 },
  cardSub: { fontSize: 11, color: "#9AA1AE", textAlign: "center" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#EEF0F3",
    paddingTop: 10,
  },
  tabItem: { flex: 1, alignItems: "center" },
  tabLabel: { fontSize: 10, fontWeight: "700", color: "#9AA1AE", marginTop: 4, letterSpacing: 0.3 },
});
