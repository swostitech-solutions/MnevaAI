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

const WORKSPACE_APPS = [
  {
    id: "w1",
    title: "Tasks",
    subtitle: "To-dos",
    icon: "check-square",
    colors: ["#1A73E8", "#1557B0"],
    screen: "Tasks",
  },
  {
    id: "w2",
    title: "Docs",
    subtitle: "Documents",
    icon: "file-text",
    colors: ["#4285F4", "#2A6DD9"],
    screen: "Docs",
  },
  {
    id: "w3",
    title: "Sheets",
    subtitle: "Spreadsheets",
    icon: "grid",
    colors: ["#0F9D58", "#0B7A44"],
    screen: "Sheets",
  },
  {
    id: "w4",
    title: "Slides",
    subtitle: "Presentations",
    icon: "monitor",
    colors: ["#F4B400", "#D49800"],
    screen: "Slides",
  },
  {
    id: "w5",
    title: "Drive",
    subtitle: "All files",
    icon: "hard-drive",
    colors: ["#1A73E8", "#0D47A1"],
    screen: "GoogleDrive",
  },
];

export default function GoogleWorkspace({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const pad = 20;
  // 3 columns
  const cardWidth = (width - pad * 2 - 16) / 3;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* Top header bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
          <Feather name="arrow-left" size={20} color="#14171F" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Google Workspace</Text>
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
        <Text style={styles.sectionLabel}>Apps</Text>

        <View style={styles.grid}>
          {WORKSPACE_APPS.map((app) => (
            <TouchableOpacity
              key={app.id}
              style={[styles.appCard, { width: cardWidth }]}
              activeOpacity={0.8}
              onPress={() => navigation?.navigate?.(app.screen)}
            >
              <LinearGradient
                colors={app.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.appIcon}
              >
                <Feather name={app.icon} size={22} color="#FFFFFF" />
              </LinearGradient>
              <Text style={styles.appTitle}>{app.title}</Text>
              <Text style={styles.appSub}>{app.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  appCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    marginBottom: 4,
  },
  appIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  appTitle: { fontSize: 13, fontWeight: "700", color: "#14171F", marginBottom: 2 },
  appSub: { fontSize: 11, color: "#9AA1AE", textAlign: "center" },
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
