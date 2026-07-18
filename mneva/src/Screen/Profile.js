import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";

const TAB_BAR_CONTENT_HEIGHT = 50;

const SETTINGS_ROWS = [
  {
    id: "1",
    title: "AI Profile",
    value: "Personalize Mneva",
    icon: "cpu",
    iconColor: "#1F9A5A",
    screen: "AIProfile",
  },
  {
    id: "contacts",
    title: "Contacts",
    value: "Google Contacts sync",
    icon: "users",
    iconColor: "#4FA6E8",
    screen: "Contacts",
  },
  {
    id: "2",
    title: "Automations",
    value: "View AI actions",
    icon: "refresh-cw",
    iconColor: "#1F9A5A",
    screen: "TwinDiary",
  },
  {
    id: "3",
    title: "Trust & Autonomy",
    value: null,
    icon: "shield",
    iconColor: "#1F9A5A",
    screen: "Settings",
  },
  {
    id: "4",
    title: "Privacy & Security",
    value: null,
    icon: "lock",
    iconColor: "#374151",
    screen: "Settings",
  },
  {
    id: "5",
    title: "Notifications",
    value: null,
    icon: "bell",
    iconColor: "#1F9A5A",
    screen: "Settings",
  },
  {
    id: "6",
    title: "Account",
    value: null,
    icon: "user",
    iconColor: "#1F9A5A",
    screen: "Settings",
  },
];

export default function Profile({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [darkTheme, setDarkTheme] = useState(false);
  const [user, setUser] = useState(null);

  React.useEffect(() => {
    import('../storage/auth').then(({ getStoredAuth }) => {
      getStoredAuth().then(({ user: stored }) => { if (stored) setUser(stored); });
    });
    import('../api/client').then(({ apiFetch }) => {
      apiFetch('/api/auth/me').then(me => setUser(me)).catch(() => {});
    });
  }, []);

  const getInitials = (name) => {
    if (!name) return 'ME';
    const parts = name.trim().split(' ');
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  };

  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const horizontalPad = width < 360 ? 16 : 20;

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
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'Loading…'}</Text>
            <Text style={styles.profileEmail}>{user?.email || ''}</Text>
            <View style={styles.planBadge}>
              <Feather name="sun" size={12} color="#1F9A5A" />
              <Text style={styles.planBadgeText}>{"  "}{user?.plan || 'Mneva Plus'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.themeCard}>
          <View style={styles.themeRow}>
            <Feather name="sun" size={18} color="#F5A623" />
            <Text style={styles.themeLabel}>Interactive Dark Theme</Text>
          </View>
          <Switch
            value={darkTheme}
            onValueChange={setDarkTheme}
            trackColor={{ false: "#E3E5EA", true: "#1F9A5A" }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.settingsCard}>
          {SETTINGS_ROWS.map((row, index) => (
            <TouchableOpacity
              key={row.id}
              style={[
                styles.settingsRow,
                index !== SETTINGS_ROWS.length - 1 && styles.settingsRowDivider,
              ]}
              activeOpacity={0.7}
              onPress={() => {
                if (!row.screen) return;
                if (row.title === 'Privacy & Security') navigation?.navigate?.('Settings', { tab: 1 });
                else if (row.title === 'Notifications') navigation?.navigate?.('Settings', { tab: 2 });
                else if (row.title === 'Account') navigation?.navigate?.('Settings', { tab: 3 });
                else navigation?.navigate?.(row.screen);
              }}
            >
              <Feather name={row.icon} size={18} color={row.iconColor} />
              <Text style={styles.settingsLabel}>{row.title}</Text>
              {row.value && (
                <Text style={styles.settingsValue}>{row.value}</Text>
              )}
              <Feather name="chevron-right" size={18} color="#C7CBD3" />
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
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation?.navigate?.("Space")}
        >
          <Feather name="folder" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Feather name="user" size={22} color="#1F7A54" />
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>PROFILE</Text>
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
    paddingTop: 20,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#1F9A5A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 22,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#14171F",
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
    color: "#9AA1AE",
    marginBottom: 8,
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#E8F5EE",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  planBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F9A5A",
  },
  themeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  themeLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#14171F",
    marginLeft: 12,
  },
  settingsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 18,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 17,
  },
  settingsRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F1F4",
  },
  settingsLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#14171F",
    marginLeft: 14,
  },
  settingsValue: {
    fontSize: 13,
    color: "#9AA1AE",
    marginRight: 6,
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
