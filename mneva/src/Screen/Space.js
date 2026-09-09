import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useTheme } from '../context/ThemeContext';
const TAB_BAR_CONTENT_HEIGHT = 50;

const MODULES = [
  {
    id: "1",
    title: "Finance",
    subtitle: "Bills, portfolio & spending",
    icon: "credit-card",
    iconColor: "#1F9A5A",
    iconBg: "#EFFDF6",
    screen: "Finance",
  },
  {
    id: "2",
    title: "Communications",
    subtitle: "Emails & AI drafts",
    icon: "mail",
    iconColor: "#615FF8",
    iconBg: "#EEEDFE",
    screen: "Communications",
  },
  {
    id: "3",
    title: "Health Core",
    subtitle: "Vitals, appointments & meds",
    icon: "heart",
    iconColor: "#E0546E",
    iconBg: "#FCEAED",
    screen: "Health",
  },
  {
    id: "4",
    title: "Life Ops",
    subtitle: "Cabs, food & deliveries",
    icon: "zap",
    iconColor: "#F5A623",
    iconBg: "#FEF3C7",
    screen: "LifeOps",
  },
  {
    id: "5",
    title: "Twin Diary",
    subtitle: "Signed AI action ledger",
    icon: "shield",
    iconColor: "#4FA6E8",
    iconBg: "#EAF3FD",
    screen: "TwinDiary",
  },
  {
    id: "6",
    title: "Connected Accounts",
    subtitle: "Integrations & automations",
    icon: "sliders",
    iconColor: "#9B72FF",
    iconBg: "#F3EFFE",
    screen: "ConnectedAccounts",
  },
  {
    id: "7",
    title: "Google Workspace",
    subtitle: "Tasks, Docs, Sheets & more",
    icon: "grid",
    iconColor: "#4285F4",
    iconBg: "#E8F0FE",
    screen: null,
  },
  {
    id: "8",
    title: "Media & Discovery",
    subtitle: "Music, News, Movies & Sports",
    icon: "play-circle",
    iconColor: "#6C47FF",
    iconBg: "#F0EEFF",
    screen: "MediaDiscovery",
  },
  {
    id: "9",
    title: "Family",
    subtitle: "Family circle & shared life",
    icon: "users",
    iconColor: "#E8672A",
    iconBg: "#FEF0E8",
    screen: "Family",
  },
];

// Every module's iconBg above is a light pastel tuned to sit behind a
// saturated icon color on a white card — on a dark card those same pastels
// read as a jarring bright patch, so in dark mode we swap to a translucent
// tint of the icon's own color instead of the literal pastel hex.
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : '255, 255, 255';
}

export default function Space({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const horizontalPad = width < 360 ? 16 : 20;
  const cardGap = 12;
  const cardWidth = (width - horizontalPad * 2 - cardGap) / 2;

  const handleModulePress = (mod) => {
    navigation?.navigate?.(mod.screen === null ? "GoogleWorkspace" : mod.screen);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerTitle}>Workspace</Text>
        <Text style={styles.headerSubtitle}>
          All systems catalogued automatically
        </Text>

        <View style={styles.grid}>
          {MODULES.map((mod) => (
            <TouchableOpacity
              key={mod.id}
              style={[styles.categoryCard, { width: cardWidth }]}
              activeOpacity={0.8}
              onPress={() => handleModulePress(mod)}
            >
              <View style={[styles.categoryIconWrap, { backgroundColor: theme.isDark ? `rgba(${hexToRgb(mod.iconColor)}, 0.18)` : mod.iconBg }]}>
                <Feather name={mod.icon} size={20} color={mod.iconColor} />
              </View>
              <Text style={styles.categoryTitle}>{mod.title}</Text>
              <Text style={styles.categorySubtitle}>{mod.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Bottom tab bar */}

      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Home")}>
          <Ionicons name="home" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Priorities")}>
          <Feather name="calendar" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("AskAI")}>
          <Feather name="mic" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Feather name="folder" size={22} color={theme.accent} />
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.("Profile")}>
          <Feather name="user" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  headerTitle: { fontSize: 32, fontWeight: "800", color: theme.text, marginBottom: 4 },
  headerSubtitle: { fontSize: 14, color: theme.faint, marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  categoryCard: {
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  categoryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  categoryTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginBottom: 4 },
  categorySubtitle: { fontSize: 12, color: theme.faint },
  tabBar: {
    flexDirection: "row",
    backgroundColor: theme.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 10,
  },
  tabItem: { flex: 1, alignItems: "center" },
  tabLabel: { fontSize: 10, fontWeight: "700", color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
  tabLabelActive: { color: theme.accent },
});
