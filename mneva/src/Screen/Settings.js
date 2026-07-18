import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, ActivityIndicator, useWindowDimensions, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../api/client';
import { clearAuth } from '../storage/auth';

const TABS = ['Trust', 'Privacy', 'Notifications', 'Account'];

const TRUST_LEVELS = [
  { level: 1, name: 'Observe',      desc: 'Monitor silently, surface insights' },
  { level: 2, name: 'Suggest',      desc: 'Draft actions awaiting approval' },
  { level: 3, name: 'Draft & Prep', desc: 'Prepare complete actions — one tap' },
  { level: 4, name: 'Inner Circle', desc: 'Execute goals autonomously' },
];

const AUTONOMY_TOGGLES = [
  { key: 'finance',       label: 'Finance',       icon: 'credit-card' },
  { key: 'communications',label: 'Communications', icon: 'mail' },
  { key: 'health',        label: 'Health',         icon: 'heart' },
  { key: 'lifeops',       label: 'Life Ops',       icon: 'navigation' },
];

const PRIVACY_TOGGLES = [
  { key: 'biometricGate',   label: 'Biometric gate for payments ≥ ₹1,000', icon: 'shield' },
  { key: 'e2eEncryption',   label: 'End-to-end encryption',                 icon: 'lock' },
  { key: 'signedLedger',    label: 'Signed action ledger (SHA-256)',         icon: 'file-text' },
  { key: 'dataSharing',     label: 'Share anonymised data for AI training',  icon: 'share-2' },
];

const NOTIF_TOGGLES = [
  { key: 'email',      label: 'Email alerts',      icon: 'mail' },
  { key: 'payments',   label: 'Payment alerts',    icon: 'credit-card' },
  { key: 'rides',      label: 'Ride updates',      icon: 'navigation' },
  { key: 'aiInsights', label: 'AI insights',       icon: 'cpu' },
  { key: 'system',     label: 'System alerts',     icon: 'bell' },
];

const TAB_BAR_CONTENT_HEIGHT = 50;

const LEVEL_NAMES = { 1: 'Observe', 2: 'Suggest', 3: 'Draft & Prep', 4: 'Inner Circle' };

function AccountTab({ user, currentLevel, navigation }) {
  const getInitials = (name) => {
    if (!name) return 'ME';
    const parts = name.trim().split(' ');
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  };

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : 'Not available';

  const handleExport = () =>
    Alert.alert('Export Data', 'Your data export will be prepared and sent to your registered email within 24 hours (DPDP compliant).', [{ text: 'OK' }]);

  const handleDelete = () =>
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch('/api/auth/delete-account', { method: 'DELETE' });
            } catch {}
            await clearAuth();
            navigation?.reset?.({ index: 0, routes: [{ name: 'Signin' }] });
          },
        },
      ]
    );

  const INFO_ROWS = [
    { label: 'Email',        value: user?.email || '—',                    icon: 'mail' },
    { label: 'Plan',         value: user?.plan  || 'Free',                 icon: 'star' },
    { label: 'Trust Level',  value: `L${currentLevel} · ${LEVEL_NAMES[currentLevel] || ''}`, icon: 'shield' },
    { label: 'Member Since', value: memberSince,                           icon: 'calendar' },
  ];

  return (
    <>
      {/* Avatar + name */}
      <View style={styles.acctHeader}>
        <View style={styles.acctAvatar}>
          <Text style={styles.acctAvatarText}>{getInitials(user?.name)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.acctName}>{user?.name || '—'}</Text>
          <Text style={styles.acctSub}>{user?.email || ''}</Text>
        </View>
      </View>

      {/* Info rows */}
      <Text style={styles.sectionLabel}>Account Details</Text>
      <View style={styles.card}>
        {INFO_ROWS.map(({ label, value, icon }, i) => (
          <View key={label} style={[styles.infoRow, i !== INFO_ROWS.length - 1 && styles.divider]}>
            <Feather name={icon} size={15} color="#9AA1AE" />
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
          </View>
        ))}
      </View>

      {/* Upgrade */}
      <TouchableOpacity
        style={styles.upgradeBtn}
        onPress={() => Alert.alert('Upgrade', 'Upgrade to Inner Circle ₹999/month — full autonomy, priority support, and unlimited AI actions.')}
        activeOpacity={0.85}
      >
        <Feather name="zap" size={16} color="#FFFFFF" />
        <Text style={styles.upgradeBtnText}>  Upgrade to Inner Circle — ₹999/mo</Text>
      </TouchableOpacity>

      {/* Danger zone */}
      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Data & Account</Text>
      <View style={styles.card}>
        <TouchableOpacity style={[styles.dangerRow, styles.divider]} onPress={handleExport} activeOpacity={0.7}>
          <Feather name="download" size={16} color="#1F9A5A" />
          <Text style={[styles.dangerLabel, { color: '#1F9A5A' }]}>Export My Data (DPDP)</Text>
          <Feather name="chevron-right" size={16} color="#C7CBD3" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerRow} onPress={handleDelete} activeOpacity={0.7}>
          <Feather name="trash-2" size={16} color="#E0546E" />
          <Text style={[styles.dangerLabel, { color: '#E0546E' }]}>Delete Account</Text>
          <Feather name="chevron-right" size={16} color="#C7CBD3" />
        </TouchableOpacity>
      </View>
    </>
  );
}

export default function Settings({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState(route?.params?.tab ?? 0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [currentLevel, setCurrentLevel] = useState(1);
  const [trustScore, setTrustScore] = useState(0);
  const [approvedActions, setApprovedActions] = useState(0);
  const [autonomy, setAutonomy] = useState({});
  const [privacy, setPrivacy] = useState({ biometricGate: true, e2eEncryption: true, signedLedger: true, dataSharing: false });
  const [notifications, setNotifications] = useState({ email: true, payments: true, rides: true, aiInsights: true, system: true });
  const [user, setUser] = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/trust/settings'),
      apiFetch('/api/auth/me'),
    ]).then(([data, me]) => {
      setCurrentLevel(data.currentLevel || 1);
      setTrustScore(data.trustScore || 0);
      setApprovedActions(data.approvedActions || 0);
      const prefs = data.preferences || {};
      if (prefs.autonomy)      setAutonomy(prefs.autonomy);
      if (prefs.privacy)       setPrivacy(p => ({ ...p, ...prefs.privacy }));
      if (prefs.notifications) setNotifications(n => ({ ...n, ...prefs.notifications }));
      setUser(me);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (patch) => {
    setSaving(true);
    await apiFetch('/api/trust/settings', { method: 'PATCH', body: patch }).catch(() => {});
    setSaving(false);
  }, []);

  const setLevel = async (level) => {
    setCurrentLevel(level);
    await apiFetch('/api/trust/level', { method: 'PATCH', body: { level } }).catch(() => {});
  };

  const toggleAutonomy = (key, val) => {
    const next = { ...autonomy, [key]: val };
    setAutonomy(next);
    save({ autonomy: next });
  };

  const togglePrivacy = (key, val) => {
    const next = { ...privacy, [key]: val };
    setPrivacy(next);
    save({ privacy: next });
  };

  const toggleNotif = (key, val) => {
    const next = { ...notifications, [key]: val };
    setNotifications(next);
    save({ notifications: next });
  };

  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const hPad = width < 360 ? 16 : 20;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ActivityIndicator style={{ flex: 1 }} color="#1F9A5A" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: hPad }]}>
        <TouchableOpacity onPress={() => navigation?.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color="#14171F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        {saving
          ? <ActivityIndicator size="small" color="#1F9A5A" />
          : <View style={{ width: 22 }} />}
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { paddingHorizontal: hPad }]}>
        {TABS.map((t, i) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, activeTab === i && styles.tabBtnActive]} onPress={() => setActiveTab(i)}>
            <Text style={[styles.tabBtnText, activeTab === i && styles.tabBtnTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: hPad, paddingTop: 20, paddingBottom: tabBarHeight + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── TRUST TAB ── */}
        {activeTab === 0 && (
          <>
            {/* Score bar */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Trust Score</Text>
              <View style={styles.scoreRow}>
                <Text style={styles.scoreNum}>{trustScore}</Text>
                <Text style={styles.scoreHint}>{approvedActions} approved actions</Text>
              </View>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${Math.min(100, (trustScore / 50) * 100)}%` }]} />
              </View>
            </View>

            {/* Level selector */}
            <Text style={styles.sectionLabel}>Autonomy Level</Text>
            {TRUST_LEVELS.map(({ level, name, desc }) => (
              <TouchableOpacity
                key={level}
                style={[styles.levelCard, currentLevel === level && styles.levelCardActive]}
                onPress={() => setLevel(level)}
                activeOpacity={0.8}
              >
                <View style={[styles.levelBadge, currentLevel === level && styles.levelBadgeActive]}>
                  <Text style={[styles.levelBadgeText, currentLevel === level && styles.levelBadgeTextActive]}>L{level}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.levelName, currentLevel === level && styles.levelNameActive]}>{name}</Text>
                  <Text style={styles.levelDesc}>{desc}</Text>
                </View>
                {currentLevel === level && <Feather name="check-circle" size={18} color="#1F9A5A" />}
              </TouchableOpacity>
            ))}

            {/* Per-domain toggles */}
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Domain Autonomy</Text>
            <View style={styles.card}>
              {AUTONOMY_TOGGLES.map(({ key, label, icon }, i) => (
                <View key={key} style={[styles.toggleRow, i !== AUTONOMY_TOGGLES.length - 1 && styles.divider]}>
                  <Feather name={icon} size={16} color="#1F9A5A" />
                  <Text style={styles.toggleLabel}>{label}</Text>
                  <Switch
                    value={!!autonomy[key]}
                    onValueChange={v => toggleAutonomy(key, v)}
                    trackColor={{ false: '#E3E5EA', true: '#1F9A5A' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── PRIVACY TAB ── */}
        {activeTab === 1 && (
          <>
            <Text style={styles.sectionLabel}>Privacy & Security</Text>
            <View style={styles.card}>
              {PRIVACY_TOGGLES.map(({ key, label, icon }, i) => (
                <View key={key} style={[styles.toggleRow, i !== PRIVACY_TOGGLES.length - 1 && styles.divider]}>
                  <Feather name={icon} size={16} color="#374151" />
                  <Text style={styles.toggleLabel}>{label}</Text>
                  <Switch
                    value={!!privacy[key]}
                    onValueChange={v => togglePrivacy(key, v)}
                    trackColor={{ false: '#E3E5EA', true: '#1F9A5A' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── NOTIFICATIONS TAB ── */}
        {activeTab === 2 && (
          <>
            <Text style={styles.sectionLabel}>Notification Preferences</Text>
            <View style={styles.card}>
              {NOTIF_TOGGLES.map(({ key, label, icon }, i) => (
                <View key={key} style={[styles.toggleRow, i !== NOTIF_TOGGLES.length - 1 && styles.divider]}>
                  <Feather name={icon} size={16} color="#1F9A5A" />
                  <Text style={styles.toggleLabel}>{label}</Text>
                  <Switch
                    value={!!notifications[key]}
                    onValueChange={v => toggleNotif(key, v)}
                    trackColor={{ false: '#E3E5EA', true: '#1F9A5A' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── ACCOUNT TAB ── */}
        {activeTab === 3 && (
          <AccountTab
            user={user}
            currentLevel={currentLevel}
            navigation={navigation}
          />
        )}
      </ScrollView>

      {/* Bottom tab bar */}
      <View style={[styles.bottomBar, { paddingBottom: 10 + insets.bottom }]}>
        {[
          { name: 'Home', icon: 'home', lib: 'Ionicons' },
          { name: 'Priorities', icon: 'calendar', lib: 'Feather' },
          { name: 'AskAI', icon: 'mic', lib: 'Feather' },
          { name: 'Space', icon: 'folder', lib: 'Feather' },
          { name: 'Profile', icon: 'user', lib: 'Feather' },
        ].map(({ name, icon, lib }) => (
          <TouchableOpacity key={name} style={styles.tabItem} onPress={() => navigation?.navigate?.(name)}>
            {lib === 'Ionicons'
              ? <Ionicons name={icon} size={22} color="#9AA1AE" />
              : <Feather name={icon} size={22} color="#9AA1AE" />}
            <Text style={styles.tabLabel}>{name.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: '#F9FAFC' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  headerTitle:     { fontSize: 18, fontWeight: '800', color: '#14171F' },
  tabRow:          { flexDirection: 'row', marginBottom: 4 },
  tabBtn:          { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:    { borderBottomColor: '#1F9A5A' },
  tabBtnText:      { fontSize: 13, fontWeight: '700', color: '#9AA1AE' },
  tabBtnTextActive:{ color: '#1F9A5A' },
  card:            { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 18, marginBottom: 16 },
  sectionLabel:    { fontSize: 12, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  scoreRow:        { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  scoreNum:        { fontSize: 32, fontWeight: '800', color: '#1F9A5A', marginRight: 10 },
  scoreHint:       { fontSize: 13, color: '#9AA1AE' },
  barBg:           { height: 8, backgroundColor: '#E8F5EE', borderRadius: 4, overflow: 'hidden' },
  barFill:         { height: 8, backgroundColor: '#1F9A5A', borderRadius: 4 },
  levelCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: '#F0F1F4' },
  levelCardActive: { borderColor: '#1F9A5A', backgroundColor: '#F5FBF8' },
  levelBadge:      { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F0F1F4', alignItems: 'center', justifyContent: 'center' },
  levelBadgeActive:{ backgroundColor: '#E8F5EE' },
  levelBadgeText:  { fontSize: 12, fontWeight: '800', color: '#9AA1AE' },
  levelBadgeTextActive: { color: '#1F9A5A' },
  levelName:       { fontSize: 15, fontWeight: '700', color: '#14171F' },
  levelNameActive: { color: '#1F9A5A' },
  levelDesc:       { fontSize: 12, color: '#9AA1AE', marginTop: 2 },
  toggleRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  toggleLabel:     { flex: 1, fontSize: 14, fontWeight: '600', color: '#14171F', marginLeft: 12 },
  divider:         { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  bottomBar:       { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 10 },
  tabItem:         { flex: 1, alignItems: 'center' },
  tabLabel:        { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },
  // Account tab
  acctHeader:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginBottom: 20 },
  acctAvatar:      { width: 60, height: 60, borderRadius: 30, backgroundColor: '#1F9A5A', alignItems: 'center', justifyContent: 'center' },
  acctAvatarText:  { color: '#FFFFFF', fontWeight: '800', fontSize: 20 },
  acctName:        { fontSize: 18, fontWeight: '800', color: '#14171F', marginBottom: 3 },
  acctSub:         { fontSize: 13, color: '#9AA1AE' },
  infoRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  infoLabel:       { flex: 1, fontSize: 14, fontWeight: '600', color: '#374151', marginLeft: 12 },
  infoValue:       { fontSize: 13, color: '#9AA1AE', maxWidth: '45%', textAlign: 'right' },
  upgradeBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F9A5A', borderRadius: 16, paddingVertical: 16, marginBottom: 4 },
  upgradeBtnText:  { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  dangerRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  dangerLabel:     { flex: 1, fontSize: 14, fontWeight: '600', marginLeft: 12 },
});
