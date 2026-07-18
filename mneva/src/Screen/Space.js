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
];

export default function Space({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const horizontalPad = width < 360 ? 16 : 20;
  const cardGap = 12;
  const cardWidth = (width - horizontalPad * 2 - cardGap) / 2;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: horizontalPad,
            paddingBottom: tabBarHeight + 24,
          },
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
              onPress={() => navigation?.navigate?.(mod.screen)}
            >
              <View
                style={[
                  styles.categoryIconWrap,
                  { backgroundColor: mod.iconBg },
                ]}
              >
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
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation?.navigate?.("Home")}
        >
          <Ionicons name="home" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation?.navigate?.("Priorities")}
        >
          <Feather name="calendar" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation?.navigate?.("AskAI")}
        >
          <Feather name="mic" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Feather name="folder" size={22} color="#1F7A54" />
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation?.navigate?.("Profile")}
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
  headerTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#14171F",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9AA1AE",
    marginBottom: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  categoryCard: {
    backgroundColor: "#FFFFFF",
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
  categoryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#14171F",
    marginBottom: 4,
  },
  categorySubtitle: {
    fontSize: 12,
    color: "#9AA1AE",
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
});
