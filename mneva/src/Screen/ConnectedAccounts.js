import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, useWindowDimensions, Linking, AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch, BASE_URL } from '../api/client';
import { getStoredAuth } from '../storage/auth';

const TAB_BAR_CONTENT_HEIGHT = 50;

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
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

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
    setStatuses(results);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadStatuses(); }, []);

  // Refresh statuses when app comes back to foreground (user returns from OAuth browser)
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') loadStatuses(true);
    });
    return () => sub.remove();
  }, [loadStatuses]);

  // Handle deep link callback from OAuth (mneva://googlefit?fit=connected)
  useEffect(() => {
    const handleUrl = ({ url }) => {
      if (
        (url?.includes('googlefit') && url?.includes('fit=connected')) ||
        (url?.includes('contacts')  && url?.includes('contacts=connected'))
      ) {
        loadStatuses(true);
      }
    };
    const sub = Linking.addEventListener('url', handleUrl);
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

  const connectedCount = Object.values(statuses).filter(s => s.connected).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStatuses(true); }} tintColor="#9B72FF" colors={['#9B72FF']} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color="#14171F" />
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
            <Text style={styles.summaryCount}>{INTEGRATIONS.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryLeft}>
            <Text style={[styles.summaryCount, { color: '#1F9A5A' }]}>
              {loading ? '—' : INTEGRATIONS.length - connectedCount}
            </Text>
            <Text style={styles.summaryLabel}>Available</Text>
          </View>
        </View>

        {/* Integration rows */}
        <Text style={styles.sectionHeader}>ALL INTEGRATIONS</Text>
        <View style={styles.listCard}>
          {INTEGRATIONS.map((intg, i) => {
            const status = statuses[intg.id];
            const isConnected = status?.connected || false;
            const isLoading = actionLoading[intg.id] || false;
            const isComingSoon = intg.connectMethod === 'coming_soon';

            return (
              <View
                key={intg.id}
                style={[styles.row, i !== INTEGRATIONS.length - 1 && styles.rowDivider]}
              >
                {/* Icon */}
                <View style={[styles.iconWrap, { backgroundColor: intg.bg }]}>
                  <Feather name={intg.icon} size={20} color={intg.color} />
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
                    onPress={() => {
                      if (intg.id === 'contacts') { navigation?.navigate?.('Contacts'); return; }
                      handleDisconnect(intg);
                    }}
                    disabled={isLoading}
                  >
                    <Text style={styles.disconnectBtnText}>
                      {isLoading ? '…' : intg.id === 'contacts' ? 'Open' : 'Disconnect'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.connectBtn, { backgroundColor: intg.color }]}
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
                  <View style={[styles.statusDot, { backgroundColor: isConnected ? '#1F9A5A' : '#E3E5EA' }]} />
                )}
              </View>
            );
          })}
        </View>

        {/* Info note */}
        <View style={styles.infoNote}>
          <Feather name="lock" size={13} color="#9AA1AE" />
          <Text style={styles.infoNoteText}>  All connections use OAuth 2.0. Mneva never stores your passwords.</Text>
        </View>
      </ScrollView>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Home')}>
          <Ionicons name="home" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Priorities')}>
          <Feather name="calendar" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('AskAI')}>
          <Feather name="mic" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Space')}>
          <Feather name="folder" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Profile')}>
          <Feather name="user" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#14171F' },
  headerSubtitle: { fontSize: 13, color: '#9AA1AE', marginTop: 2 },
  summaryCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 18, marginBottom: 24, alignItems: 'center' },
  summaryLeft: { flex: 1, alignItems: 'center' },
  summaryCount: { fontSize: 26, fontWeight: '800', color: '#14171F', marginBottom: 4 },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: '#9AA1AE' },
  summaryDivider: { width: 1, height: 36, backgroundColor: '#F0F1F4' },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: 12 },
  listCard: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  textWrap: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  rowSubtitle: { fontSize: 12, color: '#9AA1AE' },
  connectBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  connectBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  disconnectBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F3F4F6', marginRight: 8 },
  disconnectBtnText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  comingSoonBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#F3F4F6', marginRight: 8 },
  comingSoonText: { fontSize: 10, fontWeight: '800', color: '#9AA1AE' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  infoNote: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 4 },
  infoNoteText: { fontSize: 12, color: '#9AA1AE', flex: 1, lineHeight: 18 },
  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },
});
