import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, useWindowDimensions, Linking, AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch, BASE_URL, peekCachedResponse } from '../api/client';
import { getStoredAuth } from '../storage/auth';
import { useTheme } from '../context/ThemeContext';

const TAB_BAR_CONTENT_HEIGHT = 50;

const TINT_RGB = {
  '#FCEAED': [241, 113, 134],
  '#EFFDF6': [52, 199, 123],
  '#FEF3C7': [255, 184, 77],
  '#EAF3FD': [107, 184, 240],
  '#EEEDFE': [129, 128, 255],
  '#F3EFFE': [129, 128, 255],
};
const COLOR_MAP = {
  '#E0546E': 'danger',
  '#1F9A5A': 'accent',
  '#F5A623': 'warning',
  '#4FA6E8': 'info',
  '#615FF8': 'accentAlt',
  '#9B72FF': 'accentAlt',
  '#374151': 'textSecondary',
};
function intgColor(hex, theme) {
  const key = COLOR_MAP[hex];
  return key ? theme[key] : hex;
}
function intgBg(hex, theme) {
  if (!theme.isDark) return hex;
  const rgb = TINT_RGB[hex];
  return rgb ? `rgba(${rgb.join(',')},0.16)` : theme.surfaceAlt;
}

const INTEGRATIONS = [
  {
    id: 'gmail',
    title: 'Gmail',
    subtitle: 'Emails, drafts & AI replies',
    icon: 'mail',
    color: '#E0546E',
    bg: '#FCEAED',
    statusEndpoint: '/api/gmail/status',
    connectEndpoint: '/api/gmail/connect',
    disconnectEndpoint: '/api/gmail/disconnect',
    connectMethod: 'oauth',
    chainId: 'google-account',
    chainRole: 'primary',
  },
  {
    id: 'calendar',
    title: 'Google Calendar',
    subtitle: 'Schedule meetings & Google Meet',
    icon: 'calendar',
    color: '#1F9A5A',
    bg: '#EFFDF6',
    statusEndpoint: '/api/calendar/status',
    connectEndpoint: '/api/calendar/connect',
    disconnectEndpoint: '/api/calendar/disconnect',
    connectMethod: 'oauth',
    chainId: 'google-account',
    chainRole: 'linked',
    linkedNote: 'Auto-connects with Gmail — same Google sign-in',
  },
  {
    id: 'drive',
    title: 'Google Drive',
    subtitle: 'Files, folders & AI search',
    icon: 'hard-drive',
    color: '#F5A623',
    bg: '#FEF3C7',
    statusEndpoint: '/api/gdrive/status',
    connectEndpoint: '/api/gdrive/connect',
    disconnectEndpoint: '/api/gdrive/disconnect',
    connectMethod: 'oauth',
    chainId: 'google-drive',
    chainRole: 'primary',
  },
  {
    id: 'docs',
    title: 'Google Docs',
    subtitle: 'Read & summarise documents',
    icon: 'file-text',
    color: '#4FA6E8',
    bg: '#EAF3FD',
    statusEndpoint: '/api/gdrive/status',
    connectEndpoint: '/api/gdrive/connect',
    disconnectEndpoint: '/api/gdrive/disconnect',
    connectMethod: 'oauth',
    chainId: 'google-drive',
    chainRole: 'linked',
    linkedNote: 'Included automatically with Google Drive',
  },
  {
    id: 'sheets',
    title: 'Google Sheets',
    subtitle: 'Read & analyse spreadsheets',
    icon: 'grid',
    color: '#1F9A5A',
    bg: '#EFFDF6',
    statusEndpoint: '/api/gdrive/status',
    connectEndpoint: '/api/gdrive/connect',
    disconnectEndpoint: '/api/gdrive/disconnect',
    connectMethod: 'oauth',
    chainId: 'google-drive',
    chainRole: 'linked',
    linkedNote: 'Included automatically with Google Drive',
  },
  {
    id: 'slides',
    title: 'Google Slides',
    subtitle: 'Read & summarise presentations',
    icon: 'monitor',
    color: '#F5A623',
    bg: '#FEF3C7',
    statusEndpoint: '/api/gdrive/status',
    connectEndpoint: '/api/gdrive/connect',
    disconnectEndpoint: '/api/gdrive/disconnect',
    connectMethod: 'oauth',
    chainId: 'google-drive',
    chainRole: 'linked',
    linkedNote: 'Included automatically with Google Drive',
  },
  {
    id: 'tasks',
    title: 'Google Tasks',
    subtitle: 'Sync tasks & to-dos with AI',
    icon: 'check-square',
    color: '#615FF8',
    bg: '#EEEDFE',
    statusEndpoint: '/api/gtasks/status',
    connectEndpoint: '/api/gtasks/connect',
    disconnectEndpoint: '/api/gtasks/disconnect',
    connectMethod: 'oauth',
  },
  {
    id: 'googlefit',
    title: 'Google Fit',
    subtitle: 'Steps, heart rate & sleep',
    icon: 'activity',
    color: '#1F9A5A',
    bg: '#EFFDF6',
    statusEndpoint: '/api/googlefit/status',
    connectEndpoint: '/api/googlefit/connect',
    disconnectEndpoint: '/api/googlefit/disconnect',
    connectMethod: 'oauth',
  },
  {
    id: 'contacts',
    title: 'Google Contacts',
    subtitle: 'Sync & search your contacts',
    icon: 'users',
    color: '#4FA6E8',
    bg: '#EAF3FD',
    statusEndpoint: '/api/contacts/status',
    connectEndpoint: '/api/contacts/connect',
    disconnectEndpoint: '/api/contacts/disconnect',
    connectMethod: 'oauth',
  },
  {
    id: 'zerodha',
    title: 'Zerodha / Groww',
    subtitle: 'Portfolio & SIP tracking',
    icon: 'trending-up',
    color: '#615FF8',
    bg: '#EEEDFE',
    statusEndpoint: null,
    connectEndpoint: null,
    disconnectEndpoint: null,
    connectMethod: 'coming_soon',
  },
  {
    id: 'razorpay',
    title: 'Razorpay UPI',
    subtitle: 'Bill payments & transfers',
    icon: 'credit-card',
    color: '#4FA6E8',
    bg: '#EAF3FD',
    statusEndpoint: null,
    connectEndpoint: null,
    disconnectEndpoint: null,
    connectMethod: 'coming_soon',
  },
  {
    id: 'ola',
    title: 'Ola / Uber',
    subtitle: 'Cab booking & ride history',
    icon: 'navigation',
    color: '#F5A623',
    bg: '#FEF3C7',
    statusEndpoint: null,
    connectEndpoint: null,
    disconnectEndpoint: null,
    connectMethod: 'coming_soon',
  },
  {
    id: 'swiggy',
    title: 'Swiggy / Zomato',
    subtitle: 'Food orders & history',
    icon: 'shopping-bag',
    color: '#E0546E',
    bg: '#FCEAED',
    statusEndpoint: null,
    connectEndpoint: null,
    disconnectEndpoint: null,
    connectMethod: 'coming_soon',
  },
  {
    id: 'abha',
    title: 'ABHA / Google Health',
    subtitle: 'Medical records & prescriptions',
    icon: 'heart',
    color: '#9B72FF',
    bg: '#F3EFFE',
    statusEndpoint: null,
    connectEndpoint: null,
    disconnectEndpoint: null,
    connectMethod: 'coming_soon',
  },
  {
    id: 'cibil',
    title: 'CIBIL / Perfios',
    subtitle: 'Credit score & AA data',
    icon: 'shield',
    color: '#374151',
    bg: '#F3F4F6',
    statusEndpoint: null,
    connectEndpoint: null,
    disconnectEndpoint: null,
    connectMethod: 'coming_soon',
  },
];

export default function ConnectedAccounts({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const hasRealDataRef = useRef(false);

  const loadStatuses = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    const results = {};
    await Promise.all(
      INTEGRATIONS.filter(i => i.statusEndpoint).map(async (intg) => {
        try {
          const data = await apiFetch(intg.statusEndpoint);
          results[intg.id] = { connected: data.connected, email: data.email || null };
        } catch {
          results[intg.id] = { connected: false, email: null };
        }
      })
    );
    hasRealDataRef.current = true;
    setStatuses(results);
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Paint the last known statuses immediately from cache — otherwise this
  // screen shows a blank loading state on every single open even though
  // nothing has actually changed since last time. loadStatuses() below still
  // runs right after and silently replaces this with fresh data; the ref
  // guard stops this from clobbering real data in the rare case the cache
  // read (AsyncStorage) somehow resolves after the network fetch does.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = {};
      await Promise.all(
        INTEGRATIONS.filter(i => i.statusEndpoint).map(async (intg) => {
          const data = await peekCachedResponse(intg.statusEndpoint).catch(() => null);
          if (data) cached[intg.id] = { connected: data.connected, email: data.email || null };
        })
      );
      if (!cancelled && !hasRealDataRef.current && Object.keys(cached).length) {
        setStatuses(prev => ({ ...cached, ...prev }));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadStatuses(); }, []);

  // Refresh statuses when app comes back to foreground (user returns from OAuth browser)
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') loadStatuses(true);
    });
    return () => sub.remove();
  }, [loadStatuses]);

  // Handle deep link callback from OAuth — refresh statuses on any connect/error
  useEffect(() => {
    const handleUrl = ({ url }) => {
      if (!url) return;
      if (
        url.includes('connected') ||
        url.includes('drive=') ||
        url.includes('tasks=') ||
        url.includes('fit=') ||
        url.includes('contacts=') ||
        url.includes('gmail=') ||
        url.includes('calendar=')
      ) {
        loadStatuses(true);
      }
    };
    const sub = Linking.addEventListener('url', handleUrl);
    // Also check on mount in case app was cold-started via deep link
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }); }).catch(() => {});
    return () => sub.remove();
  }, [loadStatuses]);

  const handleConnect = async (intg) => {
    if (intg.connectMethod === 'coming_soon') return;
    setActionLoading(prev => ({ ...prev, [intg.id]: true }));
    try {
      const data = await apiFetch(`${intg.connectEndpoint}?platform=mobile`);
      if (data.url) {
        await Linking.openURL(data.url);
      }
    } catch {}
    finally { setActionLoading(prev => ({ ...prev, [intg.id]: false })); }
  };

  const handleDisconnect = async (intg) => {
    setActionLoading(prev => ({ ...prev, [intg.id]: true }));
    try {
      await apiFetch(intg.disconnectEndpoint, { method: 'POST' });
      setStatuses(prev => ({ ...prev, [intg.id]: { connected: false, email: null } }));
    } catch {}
    finally { setActionLoading(prev => ({ ...prev, [intg.id]: false })); }
  };

  // Linked items (Calendar under Gmail; Docs/Sheets/Slides under Drive) share one
  // OAuth grant with their chain's primary, so they're excluded from the summary
  // counts to avoid the same connection being counted 2-4x over.
  const summaryItems = INTEGRATIONS.filter(i => i.chainRole !== 'linked');
  const connectedCount = summaryItems.filter(i => statuses[i.id]?.connected).length;

  const chainGroups = [];
  const seenChains = new Set();
  const standaloneItems = [];
  INTEGRATIONS.forEach(i => {
    if (i.chainRole === 'primary') {
      seenChains.add(i.chainId);
      chainGroups.push({
        chainId: i.chainId,
        primary: i,
        linked: INTEGRATIONS.filter(l => l.chainId === i.chainId && l.chainRole === 'linked'),
      });
    } else if (!i.chainId) {
      standaloneItems.push(i);
    }
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStatuses(true); }} tintColor={theme.accentAlt} colors={[theme.accentAlt]} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Connected Accounts</Text>
            <Text style={styles.headerSubtitle}>Manage your integrations</Text>
          </View>
        </View>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryCount}>{loading ? '—' : connectedCount}</Text>
            <Text style={styles.summaryLabel}>Connected</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryCount}>{summaryItems.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryLeft}>
            <Text style={[styles.summaryCount, { color: theme.accent }]}>
              {loading ? '—' : summaryItems.length - connectedCount}
            </Text>
            <Text style={styles.summaryLabel}>Available</Text>
          </View>
        </View>

        {/* Chained Google connections */}
        <Text style={styles.sectionHeader}>GOOGLE ACCOUNT CHAINS</Text>
        {chainGroups.map(group => {
          const primaryStatus = statuses[group.primary.id];
          const primaryConnected = primaryStatus?.connected || false;
          const isLoading = actionLoading[group.primary.id] || false;

          return (
            <View key={group.chainId} style={styles.chainCard}>
              <View style={styles.chainHeaderRow}>
                <Feather name="link-2" size={12} color={theme.faint} />
                <Text style={styles.chainHeaderText}>
                  ONE CONNECTION · {1 + group.linked.length} SERVICES
                </Text>
              </View>

              {/* Primary row */}
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: intgBg(group.primary.bg, theme) }]}>
                  <Feather name={group.primary.icon} size={20} color={intgColor(group.primary.color, theme)} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowTitle}>{group.primary.title}</Text>
                  <Text style={styles.rowSubtitle}>
                    {primaryConnected && primaryStatus?.email ? primaryStatus.email : group.primary.subtitle}
                  </Text>
                </View>
                {primaryConnected ? (
                  <TouchableOpacity
                    style={styles.disconnectBtn}
                    onPress={() => handleDisconnect(group.primary)}
                    disabled={isLoading}
                  >
                    <Text style={styles.disconnectBtnText}>{isLoading ? '…' : 'Disconnect'}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.connectBtn, { backgroundColor: intgColor(group.primary.color, theme) }]}
                    onPress={() => handleConnect(group.primary)}
                    disabled={isLoading}
                  >
                    <Text style={styles.connectBtnText}>{isLoading ? '…' : 'Connect'}</Text>
                  </TouchableOpacity>
                )}
                <View style={[styles.statusDot, { backgroundColor: primaryConnected ? theme.accent : theme.borderStrong }]} />
              </View>

              {/* Linked (chained) rows — derive their state from the primary, since they share one OAuth grant */}
              <View style={styles.chainLinkedWrap}>
                <View style={styles.chainConnectorLine} />
                {group.linked.map(intg => (
                  <View key={intg.id} style={styles.chainLinkedRow}>
                    <View style={styles.chainBranchDot} />
                    <View style={[styles.chainLinkedIconWrap, { backgroundColor: intgBg(intg.bg, theme) }]}>
                      <Feather name={intg.icon} size={15} color={intgColor(intg.color, theme)} />
                    </View>
                    <View style={styles.textWrap}>
                      <Text style={styles.chainLinkedTitle}>{intg.title}</Text>
                      <Text style={styles.chainLinkedSubtitle}>{intg.linkedNote}</Text>
                    </View>
                    <View style={[styles.chainLinkedBadge, { backgroundColor: primaryConnected ? intgBg('#EFFDF6', theme) : theme.surfaceAlt }]}>
                      <Feather name={primaryConnected ? 'link' : 'circle'} size={10} color={primaryConnected ? theme.accent : theme.faint} />
                      <Text style={[styles.chainLinkedBadgeText, { color: primaryConnected ? theme.accent : theme.faint }]}>
                        {primaryConnected ? 'Linked' : 'Not linked'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {/* Standalone integration rows */}
        <Text style={styles.sectionHeader}>OTHER INTEGRATIONS</Text>
        <View style={styles.listCard}>
          {standaloneItems.map((intg, i) => {
            const status = statuses[intg.id];
            const isConnected = status?.connected || false;
            const isLoading = actionLoading[intg.id] || false;
            const isComingSoon = intg.connectMethod === 'coming_soon';

            return (
              <View
                key={intg.id}
                style={[styles.row, i !== standaloneItems.length - 1 && styles.rowDivider]}
              >
                {/* Icon */}
                <View style={[styles.iconWrap, { backgroundColor: intgBg(intg.bg, theme) }]}>
                  <Feather name={intg.icon} size={20} color={intgColor(intg.color, theme)} />
                </View>

                {/* Text */}
                <View style={styles.textWrap}>
                  <Text style={styles.rowTitle}>{intg.title}</Text>
                  <Text style={styles.rowSubtitle}>
                    {isConnected && status?.email ? status.email : intg.subtitle}
                  </Text>
                </View>

                {/* Action */}
                {isComingSoon ? (
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>Soon</Text>
                  </View>
                ) : isConnected ? (
                  <TouchableOpacity
                    style={styles.disconnectBtn}
                    onPress={() => handleDisconnect(intg)}
                    disabled={isLoading}
                  >
                    <Text style={styles.disconnectBtnText}>
                      {isLoading ? '…' : 'Disconnect'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.connectBtn, { backgroundColor: intgColor(intg.color, theme) }]}
                    onPress={() => handleConnect(intg)}
                    disabled={isLoading}
                  >
                    <Text style={styles.connectBtnText}>
                      {isLoading ? '…' : 'Connect'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Connected dot */}
                {!isComingSoon && (
                  <View style={[styles.statusDot, { backgroundColor: isConnected ? theme.accent : theme.borderStrong }]} />
                )}
              </View>
            );
          })}
        </View>

        {/* Info note */}
        <View style={styles.infoNote}>
          <Feather name="lock" size={13} color={theme.faint} />
          <Text style={styles.infoNoteText}>  All connections use OAuth 2.0. Mneva never stores your passwords.</Text>
        </View>
      </ScrollView>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Home')}>
          <Ionicons name="home" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Priorities')}>
          <Feather name="calendar" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('AskAI')}>
          <Feather name="mic" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Space')}>
          <Feather name="folder" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Profile')}>
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 13, color: theme.faint, marginTop: 2 },
  summaryCard: { flexDirection: 'row', backgroundColor: theme.card, borderRadius: 20, paddingVertical: 18, marginBottom: 24, alignItems: 'center' },
  summaryLeft: { flex: 1, alignItems: 'center' },
  summaryCount: { fontSize: 26, fontWeight: '800', color: theme.text, marginBottom: 4 },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: theme.faint },
  summaryDivider: { width: 1, height: 36, backgroundColor: theme.border },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: theme.muted, letterSpacing: 0.5, marginBottom: 12 },
  listCard: { backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 16 },

  // Chain (grouped-connection) card
  chainCard: { backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 16, marginBottom: 16 },
  chainHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 14 },
  chainHeaderText: { fontSize: 10, fontWeight: '800', color: theme.faint, letterSpacing: 0.6 },
  chainLinkedWrap: { position: 'relative', paddingLeft: 22, paddingBottom: 10 },
  chainConnectorLine: { position: 'absolute', left: 21, top: 0, bottom: 18, width: 2, backgroundColor: theme.border },
  chainLinkedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  chainBranchDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.border, marginLeft: -5, marginRight: 2 },
  chainLinkedIconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chainLinkedTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 1 },
  chainLinkedSubtitle: { fontSize: 11, color: theme.faint },
  chainLinkedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  chainLinkedBadgeText: { fontSize: 10, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  textWrap: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  rowSubtitle: { fontSize: 12, color: theme.faint },
  connectBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  connectBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  disconnectBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.surfaceAlt, marginRight: 8 },
  disconnectBtnText: { fontSize: 12, fontWeight: '700', color: theme.muted },
  comingSoonBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: theme.surfaceAlt, marginRight: 8 },
  comingSoonText: { fontSize: 10, fontWeight: '800', color: theme.faint },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  infoNote: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 4 },
  infoNoteText: { fontSize: 12, color: theme.faint, flex: 1, lineHeight: 18 },
  tabBar: { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
});
