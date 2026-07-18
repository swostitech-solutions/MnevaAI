import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, RefreshControl,
  useWindowDimensions, Linking, ActivityIndicator, AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';
import { useSocket } from '../services/socket';

const TAB_BAR_CONTENT_HEIGHT = 50;

const AVATAR_COLORS = [
  ['#1F9A5A','#3CB37A'], ['#615FF8','#4C3AED'], ['#4FA6E8','#2E86C8'],
  ['#E0546E','#C8405A'], ['#F5A623','#E8943A'], ['#9B72FF','#7C5CE8'],
];

function Avatar({ name, photoUrl, size = 46 }) {
  const idx    = (name?.charCodeAt(0) || 0) % AVATAR_COLORS.length;
  const colors = AVATAR_COLORS[idx];
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <LinearGradient colors={colors} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.35 }]}>{initials}</Text>
    </LinearGradient>
  );
}

function ContactDetailModal({ contact, visible, onClose }) {
  if (!contact) return null;
  const rows = [
    contact.phone       && { icon: 'phone',      label: 'Phone',        value: contact.phone,       action: () => Linking.openURL(`tel:${contact.phone}`) },
    contact.email       && { icon: 'mail',        label: 'Email',        value: contact.email,       action: () => Linking.openURL(`mailto:${contact.email}`) },
    contact.organization && { icon: 'briefcase',  label: 'Company',      value: contact.organization },
    contact.jobTitle    && { icon: 'tag',         label: 'Role',         value: contact.jobTitle },
    contact.address     && { icon: 'map-pin',     label: 'Address',      value: contact.address },
    contact.birthday    && { icon: 'gift',        label: 'Birthday',     value: contact.birthday },
    contact.bio         && { icon: 'align-left',  label: 'Note',         value: contact.bio },
  ].filter(Boolean);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.detailSheet}>
          <View style={styles.sheetHandle} />
          {/* Hero */}
          <View style={styles.detailHero}>
            <Avatar name={contact.displayName} size={72} />
            <Text style={styles.detailName}>{contact.displayName}</Text>
            {contact.jobTitle || contact.organization ? (
              <Text style={styles.detailRole}>
                {[contact.jobTitle, contact.organization].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {/* Quick action buttons */}
            <View style={styles.detailActions}>
              {contact.phone && (
                <TouchableOpacity style={styles.detailActionBtn} onPress={() => Linking.openURL(`tel:${contact.phone}`)}>
                  <View style={[styles.detailActionIcon, { backgroundColor: '#EFFDF6' }]}>
                    <Feather name="phone" size={18} color="#1F9A5A" />
                  </View>
                  <Text style={styles.detailActionLabel}>Call</Text>
                </TouchableOpacity>
              )}
              {contact.email && (
                <TouchableOpacity style={styles.detailActionBtn} onPress={() => Linking.openURL(`mailto:${contact.email}`)}>
                  <View style={[styles.detailActionIcon, { backgroundColor: '#EEEDFE' }]}>
                    <Feather name="mail" size={18} color="#615FF8" />
                  </View>
                  <Text style={styles.detailActionLabel}>Email</Text>
                </TouchableOpacity>
              )}
              {contact.phone && (
                <TouchableOpacity style={styles.detailActionBtn} onPress={() => Linking.openURL(`sms:${contact.phone}`)}>
                  <View style={[styles.detailActionIcon, { backgroundColor: '#EAF3FD' }]}>
                    <Feather name="message-circle" size={18} color="#4FA6E8" />
                  </View>
                  <Text style={styles.detailActionLabel}>Message</Text>
                </TouchableOpacity>
              )}
              {contact.phone && (
                <TouchableOpacity style={styles.detailActionBtn} onPress={() => Linking.openURL(`whatsapp://send?phone=${contact.phone.replace(/\D/g, '')}`)}>
                  <View style={[styles.detailActionIcon, { backgroundColor: '#E8FDF0' }]}>
                    <Feather name="message-square" size={18} color="#25D366" />
                  </View>
                  <Text style={styles.detailActionLabel}>WhatsApp</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Info rows */}
          <ScrollView style={styles.detailRows} showsVerticalScrollIndicator={false}>
            {rows.map((row, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.detailRow, i !== rows.length - 1 && styles.detailRowDivider]}
                onPress={row.action}
                disabled={!row.action}
                activeOpacity={row.action ? 0.6 : 1}
              >
                <View style={styles.detailRowIcon}>
                  <Feather name={row.icon} size={15} color="#6B7280" />
                </View>
                <View style={styles.detailRowText}>
                  <Text style={styles.detailRowLabel}>{row.label}</Text>
                  <Text style={[styles.detailRowValue, row.action && styles.detailRowValueLink]} numberOfLines={2}>
                    {row.value}
                  </Text>
                </View>
                {row.action && <Feather name="chevron-right" size={14} color="#C7CBD3" />}
              </TouchableOpacity>
            ))}
            {/* All phones */}
            {contact.allPhones?.length > 1 && (
              <View style={styles.detailExtraRow}>
                <Text style={styles.detailExtraLabel}>Other numbers</Text>
                {contact.allPhones.slice(1).map((p, i) => (
                  <TouchableOpacity key={i} onPress={() => Linking.openURL(`tel:${p}`)}>
                    <Text style={styles.detailExtraValue}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function Contacts({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight  = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [contacts,      setContacts]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [query,         setQuery]         = useState('');
  const [searching,     setSearching]     = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [total,         setTotal]         = useState(0);
  const [connected,     setConnected]     = useState(null); // null=loading, false=not connected, true=connected
  const [selected,      setSelected]      = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const searchTimer = useRef(null);

  const { on } = useSocket();

  const checkStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/contacts/status');
      setConnected(res.connected);
      return res.connected;
    } catch { setConnected(false); return false; }
  }, []);

  const loadContacts = useCallback(async (reset = true, searchQuery = '') => {
    if (reset) setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '50' });
      if (searchQuery) params.set('query', searchQuery);
      const res = await apiFetch(`/api/contacts?${params}`);
      if (reset) {
        setContacts(res.contacts || []);
      } else {
        setContacts(prev => [...prev, ...(res.contacts || [])]);
      }
      setNextPageToken(res.nextPageToken || null);
      setTotal(res.total || 0);
    } catch (err) {
      if (err.status === 409) setConnected(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    checkStatus().then(ok => { if (ok) loadContacts(); });
  }, []);

  // Refresh when app comes back to foreground (returning from OAuth browser)
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        checkStatus().then(ok => { if (ok) loadContacts(); });
      }
    });
    return () => sub.remove();
  }, []);

  // Re-check status when returning from OAuth
  useEffect(() => {
    const offConnected = on('contacts:connected', () => {
      setConnected(true);
      loadContacts();
    });
    // Real-time poller: new contacts detected on backend
    const offUpdated = on('contacts:updated', ({ newCount }) => {
      if (newCount > 0) loadContacts(true, query);
    });
    return () => { offConnected?.(); offUpdated?.(); };
  }, [on, query]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) {
      loadContacts(true, '');
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(() => loadContacts(true, query.trim()), 400);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  const loadMore = async () => {
    if (!nextPageToken || loadingMore || query) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch(`/api/contacts?pageSize=50&pageToken=${encodeURIComponent(nextPageToken)}`);
      setContacts(prev => [...prev, ...(res.contacts || [])]);
      setNextPageToken(res.nextPageToken || null);
    } catch {}
    finally { setLoadingMore(false); }
  };

  const handleConnect = async () => {
    try {
      const res = await apiFetch('/api/contacts/connect?platform=mobile');
      if (res.url) await Linking.openURL(res.url);
    } catch {}
  };

  const openDetail = (contact) => {
    setSelected(contact);
    setDetailVisible(true);
  };

  // Group contacts alphabetically
  const grouped = React.useMemo(() => {
    if (query) return [{ title: `Results for "${query}"`, data: contacts }];
    const map = {};
    contacts.forEach(c => {
      const letter = (c.displayName?.[0] || '#').toUpperCase();
      const key    = /[A-Z]/.test(letter) ? letter : '#';
      if (!map[key]) map[key] = [];
      map[key].push(c);
    });
    return Object.keys(map).sort().map(k => ({ title: k, data: map[k] }));
  }, [contacts, query]);

  // Not connected screen
  if (connected === false) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.connectScreen}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color="#14171F" />
          </TouchableOpacity>
          <LinearGradient colors={['#4FA6E8', '#2E86C8']} style={styles.connectIcon}>
            <Feather name="users" size={32} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.connectTitle}>Google Contacts</Text>
          <Text style={styles.connectSubtitle}>
            Connect your Google account to sync contacts, call, message and let your AI twin know who matters to you.
          </Text>
          <View style={styles.connectFeatures}>
            {['Search across all contacts', 'One-tap call, email & WhatsApp', 'AI knows your key relationships', 'Syncs automatically'].map((f, i) => (
              <View key={i} style={styles.connectFeatureRow}>
                <View style={styles.connectFeatureDot} />
                <Text style={styles.connectFeatureText}>{f}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
            <LinearGradient colors={['#4FA6E8', '#2E86C8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.connectBtnGrad}>
              <Feather name="users" size={18} color="#FFFFFF" />
              <Text style={styles.connectBtnText}>Connect Google Contacts</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.connectNote}>Read-only access · OAuth 2.0 · No passwords stored</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderContact = ({ item: c }) => (
    <TouchableOpacity style={styles.contactRow} onPress={() => openDetail(c)} activeOpacity={0.7}>
      <Avatar name={c.displayName} size={44} />
      <View style={styles.contactText}>
        <Text style={styles.contactName} numberOfLines={1}>{c.displayName}</Text>
        <Text style={styles.contactSub} numberOfLines={1}>
          {c.jobTitle && c.organization ? `${c.jobTitle} · ${c.organization}` : c.phone || c.email || ''}
        </Text>
      </View>
      <View style={styles.contactActions}>
        {c.phone && (
          <TouchableOpacity style={styles.contactActionBtn} onPress={() => Linking.openURL(`tel:${c.phone}`)}>
            <Feather name="phone" size={14} color="#1F9A5A" />
          </TouchableOpacity>
        )}
        {c.email && (
          <TouchableOpacity style={styles.contactActionBtn} onPress={() => Linking.openURL(`mailto:${c.email}`)}>
            <Feather name="mail" size={14} color="#615FF8" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderSectionHeader = (title) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );

  const flatData = grouped.flatMap(g => [{ type: 'header', title: g.title }, ...g.data.map(c => ({ type: 'contact', ...c }))]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: horizontalPad }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
          <Feather name="arrow-left" size={20} color="#14171F" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Contacts</Text>
          {!loading && <Text style={styles.headerSub}>{total > 0 ? `${total.toLocaleString()} contacts` : `${contacts.length} loaded`}</Text>}
        </View>
        <View style={[styles.headerBadge, { backgroundColor: '#EAF3FD' }]}>
          <Feather name="users" size={18} color="#4FA6E8" />
        </View>
      </View>

      {/* Search bar */}
      <View style={[styles.searchWrap, { marginHorizontal: horizontalPad }]}>
        <Feather name="search" size={16} color="#9AA1AE" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, email or phone…"
          placeholderTextColor="#9AA1AE"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searching && <ActivityIndicator size="small" color="#4FA6E8" style={{ marginRight: 10 }} />}
      </View>

      {/* List */}
      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#4FA6E8" />
          <Text style={styles.loadingText}>Syncing contacts…</Text>
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(item, i) => item.id || item.title || String(i)}
          contentContainerStyle={{ paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadContacts(true, query); }}
              tintColor="#4FA6E8" colors={['#4FA6E8']}
            />
          }
          renderItem={({ item }) => {
            if (item.type === 'header') return renderSectionHeader(item.title);
            return renderContact({ item });
          }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color="#4FA6E8" style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="users" size={32} color="#C7CBD3" />
              <Text style={styles.emptyText}>{query ? 'No contacts found' : 'No contacts yet'}</Text>
            </View>
          }
        />
      )}

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

      <ContactDetailModal contact={selected} visible={detailVisible} onClose={() => setDetailVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 12, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#14171F' },
  headerSub: { fontSize: 12, color: '#9AA1AE', marginTop: 1 },
  headerBadge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  // Search
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 16, paddingHorizontal: 14, height: 48 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#14171F' },
  // Contact row
  contactRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, marginBottom: 8, gap: 12 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '800' },
  contactText: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  contactSub: { fontSize: 12, color: '#9AA1AE' },
  contactActions: { flexDirection: 'row', gap: 6 },
  contactActionBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F5F6F8', alignItems: 'center', justifyContent: 'center' },
  // Section header
  sectionHeader: { paddingVertical: 6, paddingHorizontal: 4, marginTop: 4 },
  sectionHeaderText: { fontSize: 12, fontWeight: '800', color: '#9AA1AE', letterSpacing: 0.5 },
  // Loading / empty
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#9AA1AE', fontWeight: '600' },
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 14, color: '#9AA1AE', fontWeight: '600' },
  // Connect screen
  connectScreen: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 20 },
  connectIcon: { width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 32, marginBottom: 20 },
  connectTitle: { fontSize: 26, fontWeight: '800', color: '#14171F', marginBottom: 10 },
  connectSubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  connectFeatures: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 28, gap: 12 },
  connectFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  connectFeatureDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4FA6E8' },
  connectFeatureText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  connectBtn: { width: '100%', borderRadius: 18, overflow: 'hidden', marginBottom: 14 },
  connectBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 17, gap: 10 },
  connectBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  connectNote: { fontSize: 12, color: '#9AA1AE', textAlign: 'center' },
  // Detail modal
  detailOverlay: { flex: 1, backgroundColor: 'rgba(14,17,26,0.55)', justifyContent: 'flex-end' },
  detailSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '88%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E5EA', marginTop: 12, marginBottom: 8 },
  detailHero: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  detailName: { fontSize: 22, fontWeight: '800', color: '#14171F', marginTop: 14, marginBottom: 4 },
  detailRole: { fontSize: 13, color: '#6B7280', marginBottom: 16 },
  detailActions: { flexDirection: 'row', gap: 16 },
  detailActionBtn: { alignItems: 'center', gap: 6 },
  detailActionIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  detailActionLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  detailRows: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  detailRowDivider: { borderBottomWidth: 1, borderBottomColor: '#F5F6F8' },
  detailRowIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F5F6F8', alignItems: 'center', justifyContent: 'center' },
  detailRowText: { flex: 1 },
  detailRowLabel: { fontSize: 11, color: '#9AA1AE', fontWeight: '600', marginBottom: 2 },
  detailRowValue: { fontSize: 14, color: '#14171F', fontWeight: '500' },
  detailRowValueLink: { color: '#4FA6E8' },
  detailExtraRow: { paddingVertical: 12 },
  detailExtraLabel: { fontSize: 11, color: '#9AA1AE', fontWeight: '600', marginBottom: 6 },
  detailExtraValue: { fontSize: 14, color: '#4FA6E8', fontWeight: '500', marginBottom: 4 },
  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },
});
