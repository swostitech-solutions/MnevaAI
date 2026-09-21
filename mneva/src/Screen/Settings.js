import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, ActivityIndicator, useWindowDimensions, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { apiFetch, peekCachedResponse } from '../api/client';
import { useSocket } from '../services/socket';
import { clearAuth, saveTokens } from '../storage/auth';
import { isAppLockEnabled, setAppLockEnabled } from '../storage/appLock';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, Platform } from 'react-native';
import {
  enableNotificationCapture,
  disableNotificationCapture,
  isNotificationCaptureEnabled,
  notificationCaptureAvailable,
} from '../services/notificationCapture';
import { useTheme } from '../context/ThemeContext';

const TABS = ['Trust', 'Privacy', 'Notifications', 'Account'];

const TRUST_LEVELS = [
  { level: 1, name: 'Observe',      desc: 'Monitor silently, surface insights' },
  { level: 2, name: 'Suggest',      desc: 'Draft actions awaiting approval' },
  { level: 3, name: 'Draft & Prep', desc: 'Prepare complete actions — one tap' },
  { level: 4, name: 'Inner Circle', desc: 'Execute goals autonomously' },
];

// The 4 domains from "Stages in Mneva AI.pdf" — each earns trust on its own
// clock (see backend/src/services/pendingActions.service.js). Finance stays
// first/default per that same spec.
const DOMAIN_TABS = [
  { key: 'finance',        label: 'Finance',       icon: 'credit-card' },
  { key: 'communications', label: 'Communication', icon: 'mail' },
  { key: 'health',         label: 'Health Core',   icon: 'heart' },
  { key: 'family',         label: 'Family',        icon: 'users' },
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
const DEFAULT_LEAD_TIMES = [30, 5];

function formatLeadTime(minutes) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60} hr${minutes / 60 !== 1 ? 's' : ''}`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const LEVEL_NAMES = { 1: 'Observe', 2: 'Suggest', 3: 'Draft & Prep', 4: 'Inner Circle' };
// Must match the thresholds in backend/src/services/pendingActions.service.js
// — purely display constants for the progress text, changing them alone
// doesn't change how leveling actually works.
const L1_MIN_DAYS = 14;
const L1_MIN_ACTIONS = 15;
const L2_MIN_DAYS = 30;
const L2_ACCEPT_RATE_TO_L3 = 80;
const L3_ACCEPT_RATE_TO_L4 = 90;
const L3_REJECT_RATE_DEMOTE = 20;

// A masked password field with an eye button to reveal what was actually
// typed — every field in the Change Password modal uses this, since a
// typo is otherwise invisible until the submit fails.
function PasswordField({ value, onChangeText, placeholder, visible, onToggleVisible, theme, styles, autoFocus }) {
  return (
    <View style={styles.pwFieldWrap}>
      <TextInput
        style={styles.pwInput}
        placeholder={placeholder}
        placeholderTextColor={theme.placeholder}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoFocus={autoFocus}
      />
      <TouchableOpacity style={styles.pwEyeBtn} onPress={onToggleVisible} hitSlop={8}>
        <Feather name={visible ? 'eye-off' : 'eye'} size={18} color={theme.faint} />
      </TouchableOpacity>
    </View>
  );
}

// A more prominent alert card (icon + message) for password-form errors,
// in place of a plain line of red text — the "new password = current
// password" case in particular is easy to trigger by mistake (muscle memory
// retypes the old one) and deserves to actually stand out.
function PwAlertBox({ message, theme, styles }) {
  if (!message) return null;
  return (
    <View style={styles.pwAlertBox}>
      <Feather name="alert-circle" size={16} color={theme.danger} />
      <Text style={styles.pwAlertText}>{message}</Text>
    </View>
  );
}

function AccountTab({ user, currentLevel, navigation, onPhoneUpdated }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [phoneModal, setPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const [pwModal, setPwModal] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const closePwModal = () => {
    setPwModal(false);
    setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError('');
    setShowCurrentPw(false); setShowNewPw(false); setShowConfirmPw(false);
  };

  const handleChangePassword = async () => {
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match'); return; }
    if (newPw === currentPw) { setPwError("That's your current password — please choose a different one for your new password."); return; }
    setPwSaving(true); setPwError('');
    try {
      // The server rotates this account's session on a successful change
      // (same single-device mechanism a fresh login uses) and hands back a
      // fresh token pair specifically so THIS device isn't logged out by its
      // own request — has to be saved here, or the next API call from this
      // same screen would immediately get "signed in on another device".
      const res = await apiFetch('/api/auth/change-password', {
        method: 'PATCH',
        body: { currentPassword: currentPw, newPassword: newPw },
      });
      if (res?.token) await saveTokens(res.token, res.refreshToken);
      closePwModal();
      Alert.alert('Password changed', 'Your password has been updated.');
    } catch (err) {
      setPwError(err.message || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  const handleSavePhone = async () => {
    if (!/^[6-9]\d{9}$/.test(phoneInput.trim())) {
      setPhoneError('Enter a valid 10-digit Indian mobile number');
      return;
    }
    setPhoneSaving(true); setPhoneError('');
    try {
      await apiFetch('/api/auth/phone', { method: 'PATCH', body: { phone: phoneInput.trim() } });
      setPhoneModal(false);
      onPhoneUpdated(phoneInput.trim());
    } catch (err) {
      setPhoneError(err.message || 'Failed to update phone');
    } finally {
      setPhoneSaving(false);
    }
  };

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
              // This used to call a route that didn't exist and swallow the
              // resulting error, so tapping Delete always logged the user out
              // locally while their account and data stayed on the server
              // untouched. Now a failure is surfaced instead of hidden, since
              // silently "succeeding" here would be worse than doing nothing.
              await apiFetch('/api/auth/account', { method: 'DELETE' });
              await clearAuth();
              navigation?.reset?.({ index: 0, routes: [{ name: 'Onboarding' }] });
            } catch (err) {
              Alert.alert('Couldn\'t delete account', err?.message || 'Please try again.');
            }
          },
        },
      ]
    );

  const INFO_ROWS = [
    { label: 'Email',        value: user?.email || '—',                    icon: 'mail' },
    { label: 'Phone',        value: user?.phone || 'Not added',             icon: 'phone', action: () => { setPhoneInput(user?.phone || ''); setPhoneError(''); setPhoneModal(true); } },
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
        {INFO_ROWS.map(({ label, value, icon, action }, i) => (
          <TouchableOpacity
            key={label}
            style={[styles.infoRow, i !== INFO_ROWS.length - 1 && styles.divider]}
            onPress={action}
            activeOpacity={action ? 0.7 : 1}
            disabled={!action}
          >
            <Feather name={icon} size={15} color={theme.faint} />
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={[styles.infoValue, !user?.phone && label === 'Phone' && { color: theme.danger }]} numberOfLines={1}>{value}</Text>
            {action && <Feather name="edit-2" size={13} color={theme.faint} style={{ marginLeft: 6 }} />}
          </TouchableOpacity>
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

      {/* Secure Vault + Change Password */}
      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Privacy</Text>
      <View style={styles.card}>
        <TouchableOpacity style={[styles.dangerRow, styles.divider]} onPress={() => navigation?.navigate?.('Vault')} activeOpacity={0.7}>
          <Feather name="lock" size={16} color={theme.accent} />
          <Text style={[styles.dangerLabel, { color: theme.text }]}>Secure Vault</Text>
          <Feather name="chevron-right" size={16} color={theme.disabled} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerRow} onPress={() => setPwModal(true)} activeOpacity={0.7}>
          <Feather name="key" size={16} color={theme.accent} />
          <Text style={[styles.dangerLabel, { color: theme.text }]}>Change Password</Text>
          <Feather name="chevron-right" size={16} color={theme.disabled} />
        </TouchableOpacity>
      </View>

      {/* Danger zone */}
      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Data & Account</Text>
      <View style={styles.card}>
        <TouchableOpacity style={[styles.dangerRow, styles.divider]} onPress={handleExport} activeOpacity={0.7}>
          <Feather name="download" size={16} color={theme.accent} />
          <Text style={[styles.dangerLabel, { color: theme.accent }]}>Export My Data (DPDP)</Text>
          <Feather name="chevron-right" size={16} color={theme.disabled} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerRow} onPress={handleDelete} activeOpacity={0.7}>
          <Feather name="trash-2" size={16} color={theme.danger} />
          <Text style={[styles.dangerLabel, { color: theme.danger }]}>Delete Account</Text>
          <Feather name="chevron-right" size={16} color={theme.disabled} />
        </TouchableOpacity>
      </View>
      {/* Phone update modal */}
      <Modal visible={phoneModal} transparent animationType="fade" onRequestClose={() => setPhoneModal(false)}>
        <View style={styles.phoneModalOverlay}>
          <View style={styles.phoneModalBox}>
            <Text style={styles.phoneModalTitle}>{user?.phone ? 'Update Phone Number' : 'Add Phone Number'}</Text>
            <Text style={styles.phoneModalSub}>Required to be found in Family & Space features</Text>
            <View style={styles.phoneModalRow}>
              <View style={styles.phoneModalPrefix}><Text style={styles.phoneModalPrefixText}>🇮🇳 +91</Text></View>
              <TextInput
                style={styles.phoneModalInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={theme.placeholder}
                value={phoneInput}
                onChangeText={setPhoneInput}
                keyboardType="phone-pad"
                maxLength={10}
                autoFocus
              />
            </View>
            {phoneError ? <Text style={styles.phoneModalError}>{phoneError}</Text> : null}
            <View style={styles.phoneModalBtns}>
              <TouchableOpacity style={styles.phoneModalCancel} onPress={() => setPhoneModal(false)}>
                <Text style={styles.phoneModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.phoneModalSave} onPress={handleSavePhone} disabled={phoneSaving}>
                {phoneSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.phoneModalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password modal */}
      <Modal visible={pwModal} transparent animationType="fade" onRequestClose={closePwModal}>
        <View style={styles.phoneModalOverlay}>
          <View style={styles.phoneModalBox}>
            <Text style={styles.phoneModalTitle}>Change Password</Text>
            <Text style={styles.phoneModalSub}>You'll stay signed in here — every other device gets signed out.</Text>
            <PasswordField
              placeholder="Current password"
              value={currentPw}
              onChangeText={setCurrentPw}
              visible={showCurrentPw}
              onToggleVisible={() => setShowCurrentPw(v => !v)}
              theme={theme}
              styles={styles}
              autoFocus
            />
            <PasswordField
              placeholder="New password (min. 8 characters)"
              value={newPw}
              onChangeText={setNewPw}
              visible={showNewPw}
              onToggleVisible={() => setShowNewPw(v => !v)}
              theme={theme}
              styles={styles}
            />
            <PasswordField
              placeholder="Confirm new password"
              value={confirmPw}
              onChangeText={setConfirmPw}
              visible={showConfirmPw}
              onToggleVisible={() => setShowConfirmPw(v => !v)}
              theme={theme}
              styles={styles}
            />
            <PwAlertBox message={pwError} theme={theme} styles={styles} />
            <View style={styles.phoneModalBtns}>
              <TouchableOpacity style={styles.phoneModalCancel} onPress={closePwModal}>
                <Text style={styles.phoneModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.phoneModalSave, (!currentPw || !newPw || !confirmPw || pwSaving) && { opacity: 0.5 }]}
                onPress={handleChangePassword}
                disabled={!currentPw || !newPw || !confirmPw || pwSaving}
              >
                {pwSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.phoneModalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function Settings({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { on } = useSocket();
  const [activeTab, setActiveTab] = useState(route?.params?.tab ?? 0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Legacy global level — still shown as a read-only row in the Account tab
  // (see AccountTab below); the Trust tab itself now runs entirely on
  // per-domain data (domainTrust), sourced from /api/auth/me's trustLevel
  // rather than the old flat trust/settings response.
  const [currentLevel, setCurrentLevel] = useState(1);
  // One row per Finance/Communication/Health Core/Family — see "Stages in
  // Mneva AI.pdf" and backend/src/services/pendingActions.service.js.
  const [domainTrust, setDomainTrust] = useState({});
  const [selectedDomain, setSelectedDomain] = useState('finance');
  const [confirmingLevel, setConfirmingLevel] = useState(false);
  const [privacy, setPrivacy] = useState({ biometricGate: true, e2eEncryption: true, signedLedger: true, dataSharing: false });
  const [notifications, setNotifications] = useState({ email: true, payments: true, rides: true, aiInsights: true, system: true });
  const [leadTimes, setLeadTimes] = useState(DEFAULT_LEAD_TIMES);
  const [newLeadTime, setNewLeadTime] = useState('');
  const [user, setUser] = useState(null);
  const [phoneCaptureEnabled, setPhoneCaptureEnabled] = useState(false);
  const [phoneCaptureBusy, setPhoneCaptureBusy] = useState(false);
  // Device-local (not synced to the account, unlike PRIVACY_TOGGLES above) —
  // whether biometrics unlock the app itself, checked once on mount.
  const [appLockOn, setAppLockOn] = useState(true);
  const [appLockSupported, setAppLockSupported] = useState(true);

  // Shared by the real fetch below and by the cache-hydration pass before
  // it, so a returning user sees their last known settings immediately
  // instead of a loading spinner for however long the network round-trip
  // takes.
  const hasRealDataRef = useRef(false);
  const applySettingsData = (data, me) => {
    if (data) {
      if (data.domains) setDomainTrust(data.domains);
      const prefs = data.preferences || {};
      if (prefs.privacy)       setPrivacy(p => ({ ...p, ...prefs.privacy }));
      if (prefs.notifications) setNotifications(n => ({ ...n, ...prefs.notifications }));
      if (Array.isArray(prefs.notificationLeadTimes) && prefs.notificationLeadTimes.length) {
        setLeadTimes(prefs.notificationLeadTimes);
      }
    }
    if (me) {
      setUser(me);
      setCurrentLevel(me.trustLevel || 1);
    }
  };

  // Paint the last known settings immediately from cache — otherwise this
  // screen shows a full-screen spinner on every single open even though
  // nothing has actually changed since last time. The real fetch below
  // still runs right after and silently replaces this with fresh data; the
  // ref guard stops a slow cache read from ever clobbering real data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [data, me] = await Promise.all([
        peekCachedResponse('/api/trust/settings'),
        peekCachedResponse('/api/auth/me'),
      ]);
      if (!cancelled && !hasRealDataRef.current && (data || me)) {
        applySettingsData(data, me);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/trust/settings'),
      apiFetch('/api/auth/me'),
    ]).then(([data, me]) => {
      hasRealDataRef.current = true;
      applySettingsData(data, me);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [enabledPref, hasHardware, isEnrolled] = await Promise.all([
          isAppLockEnabled(),
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        setAppLockOn(enabledPref);
        setAppLockSupported(hasHardware && isEnrolled);
      } catch {
        setAppLockSupported(false);
      }
    })();
  }, []);

  const toggleAppLock = async (val) => {
    setAppLockOn(val);
    await setAppLockEnabled(val);
  };

  // A domain's trust level can change on its own (auto-adjusted after
  // enough approvals/denials in chat, not just earned by tapping something
  // here) — this keeps the Trust tab in sync live instead of only
  // reflecting reality on next load. The server resets that domain's
  // counters to zero the moment a level change fires — reflect that
  // immediately instead of showing stale stats until the next full reload.
  useEffect(() => on('domainTrust:levelChanged', ({ domain, level }) => {
    setDomainTrust(prev => ({
      ...prev,
      [domain]: { ...prev[domain], level, actionsAtLevel: 0, acceptedAtLevel: 0, rejectedAtLevel: 0, acceptRate: null, daysAtLevel: 0, pendingL2Confirm: false },
    }));
  }), [on]);

  // Finance-only: fires once L1's 14-day/15-action bar is met, so the
  // "ready for Suggest mode" banner appears without waiting for a reload.
  useEffect(() => on('domainTrust:pendingConfirm', ({ domain }) => {
    setDomainTrust(prev => ({ ...prev, [domain]: { ...prev[domain], pendingL2Confirm: true } }));
  }), [on]);

  // Android's settings page is outside the app, so confirm the final consent
  // whenever the Settings screen becomes active again.
  useEffect(() => {
    const refresh = () => isNotificationCaptureEnabled().then(setPhoneCaptureEnabled).catch(() => {});
    const unsub = navigation?.addListener?.('focus', () => {
      refresh();
    });
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    refresh();
    return () => { unsub?.(); appStateSub.remove(); };
  }, [navigation]);

  const save = useCallback(async (patch) => {
    setSaving(true);
    await apiFetch('/api/trust/settings', { method: 'PATCH', body: patch }).catch(() => {});
    setSaving(false);
  }, []);

  const toggleDomainEnabled = (domain, val) => {
    setDomainTrust(prev => ({ ...prev, [domain]: { ...prev[domain], enabled: val } }));
    save({ domain, enabled: val });
  };

  // Finance-only: confirms the L1->L2 promotion the PDF says finance must
  // ask for explicitly, instead of auto-promoting silently like the other
  // 3 domains.
  const confirmFinanceLevel = async () => {
    setConfirmingLevel(true);
    try {
      const res = await apiFetch('/api/trust/confirm-level', { method: 'POST', body: { domain: 'finance' } });
      if (res?.success) {
        setDomainTrust(prev => ({
          ...prev,
          finance: { ...prev.finance, level: 2, pendingL2Confirm: false, actionsAtLevel: 0, acceptedAtLevel: 0, rejectedAtLevel: 0, acceptRate: null, daysAtLevel: 0 },
        }));
      }
    } catch {}
    finally { setConfirmingLevel(false); }
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

  const addLeadTime = () => {
    const mins = parseInt(newLeadTime, 10);
    if (!mins || mins <= 0 || mins > 10080 || leadTimes.includes(mins)) { setNewLeadTime(''); return; }
    const next = [...leadTimes, mins].sort((a, b) => b - a).slice(0, 5);
    setLeadTimes(next);
    setNewLeadTime('');
    save({ notificationLeadTimes: next });
  };

  const removeLeadTime = (mins) => {
    const next = leadTimes.filter(m => m !== mins);
    setLeadTimes(next);
    save({ notificationLeadTimes: next });
  };

  const togglePhoneCapture = async (enabled) => {
    if (!enabled) {
      setPhoneCaptureBusy(true);
      await disableNotificationCapture().catch(() => {});
      setPhoneCaptureEnabled(false);
      setPhoneCaptureBusy(false);
      return;
    }
    if (Platform.OS !== 'android') {
      Alert.alert('Android feature', 'Apple does not allow apps to read notifications from other apps. Mneva can still use notifications sent directly to it on iPhone.');
      return;
    }
    if (!notificationCaptureAvailable) {
      Alert.alert('Android build required', 'Install the Mneva Android development or production build. Expo Go cannot use Android notification access.');
      return;
    }
    setPhoneCaptureBusy(true);
    try {
      await enableNotificationCapture();
      Alert.alert('Allow notification access', 'In Android Settings, enable Mneva. Mneva will analyse only useful alerts for your briefing and priorities. You can turn this off at any time.');
    } catch (error) {
      Alert.alert('Could not enable', error.message || 'Please try again.');
    } finally {
      setPhoneCaptureBusy(false);
    }
  };

  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const hPad = width < 360 ? 16 : 20;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ActivityIndicator style={{ flex: 1 }} color={theme.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: hPad }]}>
        <TouchableOpacity onPress={() => navigation?.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        {saving
          ? <ActivityIndicator size="small" color={theme.accent} />
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
        {activeTab === 0 && (() => {
          const dt = domainTrust[selectedDomain] || {};
          const level = dt.level || 1;
          const total = (dt.acceptedAtLevel || 0) + (dt.rejectedAtLevel || 0);
          const acceptPct = total > 0 ? Math.round(((dt.acceptedAtLevel || 0) / total) * 100) : 0;

          return (
            <>
              {/* Domain sub-tabs — each of the 4 PDF domains earns trust on
                  its own clock, so everything below is scoped to whichever
                  one is selected here. Finance is the default. Horizontally
                  scrollable, content-sized chips (matches Health.js's
                  category tabs) rather than 4 equal-flex slots — "Communication"
                  is meaningfully longer than the other 3 labels and wrapped
                  awkwardly when forced into an even share of the row. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.domainTabScroll}
                contentContainerStyle={styles.domainTabRow}
              >
                {DOMAIN_TABS.map(({ key, label, icon }) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.domainTabBtn, selectedDomain === key && styles.domainTabBtnActive]}
                    onPress={() => setSelectedDomain(key)}
                  >
                    <Feather name={icon} size={13} color={selectedDomain === key ? '#FFFFFF' : theme.muted} />
                    <Text style={[styles.domainTabText, selectedDomain === key && styles.domainTabTextActive]} numberOfLines={1}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Finance-only: L1's 14-day/15-action bar is met, but
                  promotion waits on an explicit yes (see the PDF). */}
              {selectedDomain === 'finance' && dt.pendingL2Confirm && (
                <View style={styles.confirmBanner}>
                  <Feather name="zap" size={16} color={theme.accent} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.confirmBannerTitle}>Ready for Suggest mode</Text>
                    <Text style={styles.confirmBannerDesc}>Mneva has learned enough about your finance habits to start suggesting actions.</Text>
                  </View>
                  <TouchableOpacity style={styles.confirmBannerBtn} onPress={confirmFinanceLevel} disabled={confirmingLevel}>
                    {confirmingLevel ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.confirmBannerBtnText}>Turn on</Text>}
                  </TouchableOpacity>
                </View>
              )}

              {/* Progress to next level — the exact thresholds this domain
                  needs to cross next, not a cosmetic score disconnected from
                  what actually triggers a change. */}
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>{DOMAIN_TABS.find(d => d.key === selectedDomain)?.label} Trust</Text>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreNum}>L{level}</Text>
                  <Text style={styles.scoreHint}>{LEVEL_NAMES[level]}</Text>
                </View>

                {level >= 4 ? (
                  <View style={styles.streakMaxRow}>
                    <Feather name="award" size={15} color={theme.accent} />
                    <Text style={styles.streakMaxText}>Inner Circle reached — full autonomy unlocked</Text>
                  </View>
                ) : level === 1 ? (
                  <>
                    <View style={styles.barBg}>
                      <View style={[styles.barFill, { width: `${Math.min(100, Math.round(((dt.actionsAtLevel || 0) / L1_MIN_ACTIONS) * 100))}%` }]} />
                    </View>
                    <Text style={styles.streakLabel}>
                      {dt.actionsAtLevel || 0}/{L1_MIN_ACTIONS} actions observed · {dt.daysAtLevel || 0}/{L1_MIN_DAYS} days
                    </Text>
                  </>
                ) : level === 2 ? (
                  <>
                    <View style={styles.barBg}>
                      <View style={[styles.barFill, { width: `${Math.min(100, total > 0 ? acceptPct : 0)}%` }]} />
                    </View>
                    <Text style={styles.streakLabel}>
                      {total > 0 ? `${acceptPct}% accepted (need ${L2_ACCEPT_RATE_TO_L3}%)` : 'No suggestions yet'} · {dt.daysAtLevel || 0}/{L2_MIN_DAYS} days
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={styles.barBg}>
                      <View style={[styles.barFill, { width: `${Math.min(100, total > 0 ? acceptPct : 0)}%` }]} />
                    </View>
                    <Text style={styles.streakLabel}>
                      {total > 0 ? `${acceptPct}% accepted (need ${L3_ACCEPT_RATE_TO_L4}%)` : 'No one-tap actions yet'}
                    </Text>
                  </>
                )}

                {level === 3 && total > 0 && (100 - acceptPct) > 0 && (
                  <View style={styles.streakWarnRow}>
                    <Feather name="alert-triangle" size={12} color={theme.warning} />
                    <Text style={styles.streakWarnText}>
                      Reject rate must stay under {L3_REJECT_RATE_DEMOTE}% or this drops back to L2 · currently {100 - acceptPct}%
                    </Text>
                  </View>
                )}
              </View>

              {/* Level display — earned automatically (enough approvals/
                  declines in chat moves this), never set by tapping a card. */}
              <Text style={styles.sectionLabel}>Autonomy Level</Text>
              <Text style={styles.levelHint}>Earned automatically as you approve or decline what Mneva proposes for this domain — not something you set directly.</Text>
              {TRUST_LEVELS.map(({ level: l, name, desc }) => (
                <View
                  key={l}
                  style={[styles.levelCard, level === l && styles.levelCardActive, level !== l && styles.levelCardInactive]}
                >
                  <View style={[styles.levelBadge, level === l && styles.levelBadgeActive]}>
                    <Text style={[styles.levelBadgeText, level === l && styles.levelBadgeTextActive]}>L{l}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={[styles.levelName, level === l && styles.levelNameActive]}>{name}</Text>
                    <Text style={styles.levelDesc}>{desc}</Text>
                  </View>
                  {level === l && <Feather name="check-circle" size={18} color={theme.accent} />}
                </View>
              ))}

              {/* This domain's on/off switch */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Domain Autonomy</Text>
              <View style={styles.card}>
                <View style={styles.toggleRow}>
                  <Feather name={DOMAIN_TABS.find(d => d.key === selectedDomain)?.icon} size={16} color={theme.accent} />
                  <Text style={styles.toggleLabel}>{DOMAIN_TABS.find(d => d.key === selectedDomain)?.label}</Text>
                  <Switch
                    value={dt.enabled !== false}
                    onValueChange={v => toggleDomainEnabled(selectedDomain, v)}
                    trackColor={{ false: theme.borderStrong, true: theme.accent }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </>
          );
        })()}

        {/* ── PRIVACY TAB ── */}
        {activeTab === 1 && (
          <>
            <Text style={styles.sectionLabel}>Privacy & Security</Text>
            <View style={styles.card}>
              {PRIVACY_TOGGLES.map(({ key, label, icon }, i) => {
                const isBiometricGate = key === 'biometricGate';
                const disabled = isBiometricGate && !appLockSupported;
                return (
                  <View key={key} style={[styles.toggleRow, i !== PRIVACY_TOGGLES.length - 1 && styles.divider]}>
                    <Feather name={icon} size={16} color={theme.textSecondary} />
                    <Text style={styles.toggleLabel}>{label}</Text>
                    <Switch
                      value={!!privacy[key] && !disabled}
                      onValueChange={v => togglePrivacy(key, v)}
                      disabled={disabled}
                      trackColor={{ false: theme.borderStrong, true: theme.accent }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                );
              })}
              {!appLockSupported && (
                <Text style={styles.appLockHint}>
                  Set up Face ID, fingerprint, or a screen lock on this device to use the biometric payment gate.
                </Text>
              )}
            </View>

            <Text style={styles.sectionLabel}>App Lock</Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <Feather name="lock" size={16} color={theme.textSecondary} />
                <Text style={styles.toggleLabel}>Unlock Mneva with Face ID / fingerprint</Text>
                <Switch
                  value={appLockOn && appLockSupported}
                  onValueChange={toggleAppLock}
                  disabled={!appLockSupported}
                  trackColor={{ false: theme.borderStrong, true: theme.accent }}
                  thumbColor="#FFFFFF"
                />
              </View>
              {!appLockSupported && (
                <Text style={styles.appLockHint}>
                  Set up Face ID, fingerprint, or a screen lock on this device to use this.
                </Text>
              )}
            </View>
          </>
        )}

        {/* ── NOTIFICATIONS TAB ── */}
        {activeTab === 2 && (
          <>
            <Text style={styles.sectionLabel}>Notification Preferences</Text>
            <View style={[styles.card, { marginBottom: 12 }]}>
              <View style={styles.captureRow}>
                <View style={styles.captureIcon}><Feather name="smartphone" size={18} color={theme.accent} /></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.captureTitle}>Analyse phone notifications</Text>
                  <Text style={styles.captureDesc}>Important alerts go to Morning Briefing. Urgent ones also become Priorities.</Text>
                  {Platform.OS === 'ios' && <Text style={styles.captureUnavailable}>Available on Android only</Text>}
                </View>
                {phoneCaptureBusy
                  ? <ActivityIndicator size="small" color={theme.accent} />
                  : <Switch value={phoneCaptureEnabled} onValueChange={togglePhoneCapture} trackColor={{ false: theme.borderStrong, true: theme.accent }} thumbColor="#FFFFFF" />}
              </View>
            </View>
            <View style={styles.card}>
              {NOTIF_TOGGLES.map(({ key, label, icon }, i) => (
                <View key={key} style={[styles.toggleRow, i !== NOTIF_TOGGLES.length - 1 && styles.divider]}>
                  <Feather name={icon} size={16} color={theme.accent} />
                  <Text style={styles.toggleLabel}>{label}</Text>
                  <Switch
                    value={!!notifications[key]}
                    onValueChange={v => toggleNotif(key, v)}
                    trackColor={{ false: theme.borderStrong, true: theme.accent }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Reminder Timing</Text>
            <View style={[styles.card, { paddingVertical: 14 }]}>
              <Text style={styles.leadTimeHint}>
                For important items Mneva detects (bills, EMIs, subscriptions, medication refills and more), how many advance alerts do you want, and how many minutes before?
              </Text>

              {leadTimes.length === 0 ? (
                <Text style={styles.leadTimeEmpty}>No advance alerts set — you'll only be notified when something is due.</Text>
              ) : (
                leadTimes.map((mins, i) => (
                  <View key={`${mins}-${i}`} style={[styles.leadTimeRow, i !== leadTimes.length - 1 && styles.divider]}>
                    <View style={styles.leadTimeIconWrap}>
                      <Feather name="clock" size={14} color={theme.accentAlt} />
                    </View>
                    <Text style={styles.leadTimeText}>{formatLeadTime(mins)} before</Text>
                    <TouchableOpacity onPress={() => removeLeadTime(mins)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="x" size={16} color={theme.faint} />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <View style={styles.leadTimeAddRow}>
                <TextInput
                  style={styles.leadTimeInput}
                  placeholder="e.g. 15"
                  placeholderTextColor={theme.placeholder}
                  value={newLeadTime}
                  onChangeText={setNewLeadTime}
                  keyboardType="number-pad"
                  maxLength={5}
                  onSubmitEditing={addLeadTime}
                />
                <Text style={styles.leadTimeInputSuffix}>min before</Text>
                <TouchableOpacity style={styles.leadTimeAddBtn} onPress={addLeadTime} disabled={!newLeadTime}>
                  <Feather name="plus" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ── ACCOUNT TAB ── */}
        {activeTab === 3 && (
          <AccountTab
            user={user}
            currentLevel={currentLevel}
            navigation={navigation}
            onPhoneUpdated={(phone) => setUser(u => ({ ...u, phone }))}
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
              ? <Ionicons name={icon} size={22} color={theme.faint} />
              : <Feather name={icon} size={22} color={theme.faint} />}
            <Text style={styles.tabLabel}>{name.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe:            { flex: 1, backgroundColor: theme.bg },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  headerTitle:     { fontSize: 18, fontWeight: '800', color: theme.text },
  tabRow:          { flexDirection: 'row', marginBottom: 4 },
  tabBtn:          { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:    { borderBottomColor: theme.accent },
  tabBtnText:      { fontSize: 13, fontWeight: '700', color: theme.faint },
  tabBtnTextActive:{ color: theme.accent },
  card:            { backgroundColor: theme.card, borderRadius: 18, paddingHorizontal: 18, marginBottom: 16 },
  sectionLabel:    { fontSize: 12, fontWeight: '700', color: theme.faint, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },

  domainTabScroll: { marginBottom: 16 },
  domainTabRow: { flexDirection: 'row', gap: 8, paddingVertical: 2, paddingRight: 4 },
  domainTabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: theme.soft },
  domainTabBtnActive: { backgroundColor: theme.accent },
  domainTabText: { fontSize: 12.5, fontWeight: '700', color: theme.muted },
  domainTabTextActive: { color: '#FFFFFF' },

  confirmBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.isDark ? 'rgba(52,199,123,0.14)' : '#EFFBF4', borderRadius: 14, borderWidth: 1, borderColor: theme.accent, padding: 14, marginBottom: 16 },
  confirmBannerTitle: { fontSize: 13.5, fontWeight: '800', color: theme.text },
  confirmBannerDesc: { fontSize: 11.5, color: theme.muted, marginTop: 2, lineHeight: 15 },
  confirmBannerBtn: { backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginLeft: 10 },
  confirmBannerBtnText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
  scoreRow:        { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  scoreNum:        { fontSize: 32, fontWeight: '800', color: theme.accent, marginRight: 10 },
  scoreHint:       { fontSize: 13, color: theme.faint },
  barBg:           { height: 8, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#E8F5EE', borderRadius: 4, overflow: 'hidden' },
  barFill:         { height: 8, backgroundColor: theme.accent, borderRadius: 4 },
  streakLabel:     { fontSize: 12.5, color: theme.faint, fontWeight: '600', marginTop: 8 },
  streakMaxRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#E8F5EE', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  streakMaxText:   { fontSize: 12.5, color: theme.accent, fontWeight: '700', flex: 1 },
  streakWarnRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  streakWarnText:  { fontSize: 12, color: theme.warning, fontWeight: '600', flex: 1 },
  levelHint:       { fontSize: 12, color: theme.faint, marginBottom: 12, lineHeight: 17 },

  levelCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: theme.border },
  levelCardActive: { borderColor: theme.accent, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.10)' : '#F5FBF8' },
  levelCardInactive: { opacity: 0.6 },
  levelBadge:      { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  levelBadgeActive:{ backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#E8F5EE' },
  levelBadgeText:  { fontSize: 12, fontWeight: '800', color: theme.faint },
  levelBadgeTextActive: { color: theme.accent },
  levelName:       { fontSize: 15, fontWeight: '700', color: theme.text },
  levelNameActive: { color: theme.accent },
  levelDesc:       { fontSize: 12, color: theme.faint, marginTop: 2 },
  toggleRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  toggleLabel:     { flex: 1, fontSize: 14, fontWeight: '600', color: theme.text, marginLeft: 12 },
  appLockHint:     { fontSize: 12, color: theme.faint, paddingBottom: 14, paddingHorizontal: 2 },
  captureRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  captureIcon:     { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#E8F5EE', alignItems: 'center', justifyContent: 'center' },
  captureTitle:    { fontSize: 14, fontWeight: '700', color: theme.text },
  captureDesc:     { fontSize: 12, lineHeight: 17, color: theme.muted, marginTop: 3, paddingRight: 8 },
  captureUnavailable: { fontSize: 11, color: theme.faint, marginTop: 5 },
  divider:         { borderBottomWidth: 1, borderBottomColor: theme.border },

  leadTimeHint:      { fontSize: 12, color: theme.muted, lineHeight: 17, marginBottom: 12 },
  leadTimeEmpty:     { fontSize: 12, color: theme.faint, fontStyle: 'italic', marginBottom: 8 },
  leadTimeRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  leadTimeIconWrap:  { width: 30, height: 30, borderRadius: 10, backgroundColor: theme.isDark ? 'rgba(129,128,255,0.18)' : '#EEEDFE', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  leadTimeText:      { flex: 1, fontSize: 14, fontWeight: '600', color: theme.text },
  leadTimeAddRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  leadTimeInput:     { width: 64, backgroundColor: theme.surfaceAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: theme.text, textAlign: 'center' },
  leadTimeInputSuffix: { flex: 1, fontSize: 12, color: theme.faint },
  leadTimeAddBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.accentAlt, alignItems: 'center', justifyContent: 'center' },
  bottomBar:       { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem:         { flex: 1, alignItems: 'center' },
  tabLabel:        { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
  // Account tab
  acctHeader:      { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 18, padding: 18, marginBottom: 20 },
  acctAvatar:      { width: 60, height: 60, borderRadius: 30, backgroundColor: '#1F9A5A', alignItems: 'center', justifyContent: 'center' },
  acctAvatarText:  { color: '#FFFFFF', fontWeight: '800', fontSize: 20 },
  acctName:        { fontSize: 18, fontWeight: '800', color: theme.text, marginBottom: 3 },
  acctSub:         { fontSize: 13, color: theme.faint },
  infoRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  infoLabel:       { flex: 1, fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginLeft: 12 },
  infoValue:       { fontSize: 13, color: theme.faint, maxWidth: '45%', textAlign: 'right' },
  upgradeBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent, borderRadius: 16, paddingVertical: 16, marginBottom: 4 },
  upgradeBtnText:  { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  dangerRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  dangerLabel:     { flex: 1, fontSize: 14, fontWeight: '600', marginLeft: 12 },
  // Phone modal
  phoneModalOverlay:   { flex: 1, backgroundColor: theme.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  phoneModalBox:       { backgroundColor: theme.card, borderRadius: 20, padding: 24, width: '100%' },
  phoneModalTitle:     { fontSize: 17, fontWeight: '800', color: theme.text, marginBottom: 4 },
  phoneModalSub:       { fontSize: 12, color: theme.faint, marginBottom: 18 },
  phoneModalRow:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 12, overflow: 'hidden', marginBottom: 10 },
  phoneModalPrefix:    { paddingHorizontal: 12, paddingVertical: 13, backgroundColor: theme.soft, borderRightWidth: 1, borderRightColor: theme.border },
  phoneModalPrefixText:{ fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  phoneModalInput:     { flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: theme.text },
  pwFieldWrap:         { position: 'relative', marginBottom: 10 },
  pwInput:             { borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingRight: 44, paddingVertical: 13, fontSize: 15, color: theme.text },
  pwEyeBtn:            { position: 'absolute', right: 4, top: 0, bottom: 0, width: 40, alignItems: 'center', justifyContent: 'center' },
  pwAlertBox:          { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: theme.isDark ? 'rgba(224,84,110,0.14)' : '#FCEAED', borderRadius: 12, borderWidth: 1, borderColor: theme.danger + '40', padding: 12, marginBottom: 10 },
  pwAlertText:         { flex: 1, fontSize: 12.5, color: theme.danger, lineHeight: 17, fontWeight: '600' },
  phoneModalError:     { fontSize: 12, color: theme.danger, marginBottom: 10 },
  phoneModalBtns:      { flexDirection: 'row', gap: 10, marginTop: 6 },
  phoneModalCancel:    { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: theme.soft, alignItems: 'center' },
  phoneModalCancelText:{ fontSize: 14, fontWeight: '700', color: theme.muted },
  phoneModalSave:      { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: theme.accent, alignItems: 'center' },
  phoneModalSaveText:  { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
