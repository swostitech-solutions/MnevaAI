import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  useWindowDimensions,
  Alert,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { onAppDataRefresh } from '../services/dataRefresh';
import { useTheme } from '../context/ThemeContext';

const TAB_BAR_CONTENT_HEIGHT = 50;

// Must match TRUST_LEVELS/LEVEL_NAMES in Settings.js and the domain list in
// backend/src/services/pendingActions.service.js — Automations (Twin
// Diary's autonomous actions) only actually run once EVERY domain has
// reached Trust Level 4 (Inner Circle); below that, at least one domain is
// still asking for approval or observing, so there's nothing fully
// autonomous to show yet.
const AUTOMATION_UNLOCK_LEVEL = 4;
const TRUST_LEVEL_NAMES = { 1: 'Observe', 2: 'Suggest', 3: 'Draft & Prep', 4: 'Inner Circle' };
const DOMAIN_LABELS = { finance: 'Finance', communications: 'Communication', health: 'Health Core', family: 'Family' };
const DOMAINS_COUNT = Object.keys(DOMAIN_LABELS).length;

function displayPlanName(plan) {
  const value = (plan || '').toLowerCase();
  if (value.includes('family')) return 'Family';
  if (value.includes('pro')) return 'Pro';
  return 'Basic';
}

const SETTINGS_ROWS = [
  {
    id: "subscription",
    title: "Subscription",
    value: "Manage your plan",
    icon: "credit-card",
    iconColor: "#1F9A5A",
    screen: "Subscription",
  },
  {
    id: "phone-alerts",
    title: "Phone Alerts",
    value: "View alert history",
    icon: "smartphone",
    iconColor: "#1F9A5A",
    screen: "PhoneAlerts",
  },
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
    // Medium gray reads fine on both a white and a near-black background —
    // the original #374151 was tuned for light mode only and nearly
    // disappears once the row's background goes dark.
    iconColor: "#6B7280",
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
  const { theme, isDark, toggleTheme } = useTheme();
  const styles = createStyles(theme);
  const [user, setUser] = useState(null);
  // Per-domain trust (Finance/Communication/Health Core/Family) — Automations
  // unlocks only once every one of these has independently reached L4.
  const [domainTrust, setDomainTrust] = useState(null);
  const domainsBelowL4 = domainTrust
    ? Object.entries(domainTrust).filter(([, d]) => (d.level || 1) < AUTOMATION_UNLOCK_LEVEL)
    : [];
  // Before the trust data has loaded, default to locked rather than
  // flashing an unlocked row that immediately re-locks once the real
  // per-domain levels come in.
  const automationsUnlocked = !!domainTrust && domainsBelowL4.length === 0;

  const loadProfileData = () => {
    import('../api/client').then(({ apiFetch }) => {
      apiFetch('/api/auth/me').then(me => setUser(me)).catch(() => {});
      apiFetch('/api/trust/settings').then(data => { if (data?.domains) setDomainTrust(data.domains); }).catch(() => {});
    });
  };

  React.useEffect(() => {
    import('../storage/auth').then(({ getStoredAuth }) => {
      getStoredAuth().then(({ user: stored }) => { if (stored) setUser(stored); });
    });
    loadProfileData();
  }, []);

  React.useEffect(() => onAppDataRefresh(loadProfileData), []);

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
            <TouchableOpacity style={styles.planBadge} onPress={() => navigation?.navigate?.('Subscription')} activeOpacity={0.75}>
              <Feather name="sun" size={12} color={theme.accent} />
              <Text style={styles.planBadgeText}>{"  "}{displayPlanName(user?.plan)}</Text>
              <Feather name="chevron-right" size={13} color={theme.accent} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.themeCard}>
          <View style={styles.themeRow}>
            <Feather name={isDark ? "moon" : "sun"} size={18} color={theme.warning} />
            <Text style={styles.themeLabel}>Interactive Dark Theme</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: theme.borderStrong, true: theme.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.settingsCard}>
          {SETTINGS_ROWS.map((row, index) => {
            // Automations (Twin Diary's autonomous actions) only actually
            // run once EVERY domain has reached Trust Level 4 — below that,
            // tapping through to an action feed that will always be
            // incomplete is confusing. Show the lock state right on the row
            // instead.
            const isAutomations = row.id === '2';
            const locked = isAutomations && !automationsUnlocked;
            const rowIcon = locked ? 'lock' : row.icon;
            const rowIconColor = locked ? theme.disabled : row.iconColor;
            const rowValue = isAutomations
              ? (locked ? (domainTrust ? `${DOMAINS_COUNT - domainsBelowL4.length}/${DOMAINS_COUNT} at Inner Circle` : 'Checking…') : row.value)
              : row.value;
            return (
              <TouchableOpacity
                key={row.id}
                style={[
                  styles.settingsRow,
                  index !== SETTINGS_ROWS.length - 1 && styles.settingsRowDivider,
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  if (!row.screen) return;
                  if (locked) {
                    const behindList = domainsBelowL4
                      .map(([domain, d]) => `${DOMAIN_LABELS[domain] || domain}: L${d.level || 1} (${TRUST_LEVEL_NAMES[d.level || 1] || 'Observe'})`)
                      .join('\n');
                    Alert.alert(
                      'Automations are locked',
                      `Automations only run once every domain reaches Trust Level 4 — Inner Circle. Still catching up:\n\n${behindList}\n\nIncrease trust in Trust & Autonomy to unlock this.`,
                      [
                        { text: 'Not now', style: 'cancel' },
                        { text: 'Go to Trust & Autonomy', onPress: () => navigation?.navigate?.('Settings', { tab: 0 }) },
                      ],
                    );
                    return;
                  }
                  if (row.title === 'Privacy & Security') navigation?.navigate?.('Settings', { tab: 1 });
                  else if (row.title === 'Notifications') navigation?.navigate?.('Settings', { tab: 2 });
                  else if (row.title === 'Account') navigation?.navigate?.('Settings', { tab: 3 });
                  else navigation?.navigate?.(row.screen);
                }}
              >
                <Feather name={rowIcon} size={18} color={rowIconColor} />
                <Text style={styles.settingsLabel}>{row.title}</Text>
                {rowValue && (
                  <Text style={[styles.settingsValue, locked && styles.settingsValueLocked]}>{rowValue}</Text>
                )}
                <Feather name="chevron-right" size={18} color={theme.disabled} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Bottom tab bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation?.navigate?.("Home")}
        >
          <Ionicons name="home" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation?.navigate?.("Priorities")}
        >
          <Feather name="calendar" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation?.navigate?.("AskAI")}
        >
          <Feather name="mic" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation?.navigate?.("Space")}
        >
          <Feather name="folder" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Feather name="user" size={22} color={theme.accent} />
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>PROFILE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.bg,
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
    color: theme.text,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
    color: theme.faint,
    marginBottom: 8,
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: theme.isDark ? "rgba(52, 199, 123, 0.16)" : "#E8F5EE",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  planBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.accent,
  },
  themeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.card,
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
    color: theme.text,
    marginLeft: 12,
  },
  settingsCard: {
    backgroundColor: theme.card,
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
    borderBottomColor: theme.border,
  },
  settingsLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: theme.text,
    marginLeft: 14,
  },
  settingsValue: {
    fontSize: 13,
    color: theme.faint,
    marginRight: 6,
  },
  settingsValueLocked: {
    color: theme.warning,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: theme.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.faint,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: theme.accent,
  },
});
