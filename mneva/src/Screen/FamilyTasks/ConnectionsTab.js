import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { useFamilyTask, RELATIONSHIPS } from './FamilyTaskContext';
import { apiFetch } from '../../api/client';

const REL_COLORS = {
  Father: '#4FA6E8', Mother: '#E0546E', Brother: '#1F9A5A', Sister: '#9B72FF',
  Spouse: '#F5A623', Son: '#4FA6E8', Daughter: '#E0546E', Grandparent: '#6B7280',
  Grandchild: '#1F9A5A', Partner: '#F5A623', Relative: '#9B72FF',
  Caregiver: '#D97706', Other: '#9AA1AE',
};
const REL_BG = {
  Father: '#EAF3FD', Mother: '#FCEAED', Brother: '#EFFDF6', Sister: '#F3EFFE',
  Spouse: '#FEF3C7', Son: '#EAF3FD', Daughter: '#FCEAED', Grandparent: '#F5F6F8',
  Grandchild: '#EFFDF6', Partner: '#FEF3C7', Relative: '#F3EFFE',
  Caregiver: '#FEF3C7', Other: '#F5F6F8',
};
const relColor = r => REL_COLORS[r] || '#9AA1AE';
const relBg    = r => REL_BG[r]    || '#F5F6F8';

export default function ConnectionsTab({ horizontalPad, insets }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { connections, sendRequest, acceptConnection, rejectConnection, removeConnection } = useFamilyTask();

  const [modal, setModal] = useState(false);

  const accepted = connections.filter(c => c.status === 'ACCEPTED');
  const incoming = connections.filter(c => c.status === 'PENDING' && c.direction === 'RECEIVED');
  const sent     = connections.filter(c => c.status === 'PENDING' && c.direction === 'SENT');
  const rejected = connections.filter(c => c.status === 'REJECTED');

  const doSend = async (name, relationship, email) => {
    try {
      await sendRequest(name, relationship, email);
    } catch (err) {
      alert(err?.message || 'Failed to send request');
    }
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: horizontalPad, paddingBottom: insets.bottom + 40, paddingTop: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Action button */}
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setModal(true)} activeOpacity={0.88}>
          <LinearGradient colors={['#0F5132', '#1F9A5A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnGrad}>
            <View style={styles.btnIconWrap}>
              <Feather name="user-plus" size={15} color={theme.accent} />
            </View>
            <Text style={styles.primaryBtnText}>Send Connection Request</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Incoming requests — always visible */}
        <SectionLabel text={`REQUESTS FOR YOU (${incoming.length})`} styles={styles} />
        {incoming.length === 0 ? (
          <View style={styles.emptySection}>
            <Feather name="arrow-down-left" size={18} color={theme.disabled} />
            <Text style={styles.emptySectionText}>No incoming requests yet</Text>
          </View>
        ) : incoming.map(c => (
          <View key={c.id} style={[styles.requestCard, styles.requestCardIncoming]}>
            <View style={styles.directionBadgeIncoming}>
              <Feather name="arrow-down-left" size={11} color={theme.accent} />
            </View>
            <View style={[styles.requestAvatar, { backgroundColor: relBg(c.relationship) }]}>
              <Text style={[styles.requestAvatarText, { color: relColor(c.relationship) }]}>
                {c.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.directionRow}>
                <Text style={styles.requestName}>{c.name}</Text>
                <Feather name="arrow-right" size={11} color={theme.faint} />
                <Text style={styles.directionYou}>You</Text>
              </View>
              <View style={[styles.relTag, { backgroundColor: relBg(c.relationship) }]}>
                <Text style={[styles.relTagText, { color: relColor(c.relationship) }]}>{c.relationship}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptConnection(c.id)}>
              <Feather name="check" size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectConnection(c.id)}>
              <Feather name="x" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Sent requests — always visible */}
        <SectionLabel text={`SENT BY YOU (${sent.length})`} styles={styles} />
        {sent.length === 0 ? (
          <View style={styles.emptySection}>
            <Feather name="arrow-up-right" size={18} color={theme.disabled} />
            <Text style={styles.emptySectionText}>No sent requests yet — tap Send Request above</Text>
          </View>
        ) : sent.map(c => (
          <View key={c.id} style={styles.requestCard}>
            <View style={styles.directionBadgeSent}>
              <Feather name="arrow-up-right" size={11} color={theme.warning} />
            </View>
            <View style={[styles.requestAvatar, { backgroundColor: relBg(c.relationship) }]}>
              <Text style={[styles.requestAvatarText, { color: relColor(c.relationship) }]}>
                {c.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.directionRow}>
                <Text style={styles.directionYou}>You</Text>
                <Feather name="arrow-right" size={11} color={theme.faint} />
                <Text style={styles.requestName}>{c.name}</Text>
              </View>
              <View style={[styles.relTag, { backgroundColor: relBg(c.relationship) }]}>
                <Text style={[styles.relTagText, { color: relColor(c.relationship) }]}>{c.relationship}</Text>
              </View>
              {c.email ? <Text style={styles.requestEmail}>{c.email}</Text> : null}
            </View>
            <View style={styles.pendingTag}>
              <Feather name="clock" size={10} color={theme.warning} />
              <Text style={styles.pendingTagText}>Awaiting</Text>
            </View>
            <TouchableOpacity onPress={() => removeConnection(c.id)} style={styles.removeBtn}>
              <Feather name="x" size={14} color={theme.faint} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Family circle */}
        <SectionLabel text={`FAMILY CIRCLE · ${accepted.length} CONNECTED`} styles={styles} />
        {accepted.length === 0 ? (
          <View style={styles.emptyCircle}>
            <View style={styles.emptyCircleIcon}>
              <Feather name="users" size={28} color={theme.disabled} />
            </View>
            <Text style={styles.emptyCircleTitle}>No connections yet</Text>
            <Text style={styles.emptyCircleSub}>Send a request to add family members</Text>
          </View>
        ) : (
          <View style={styles.circleGrid}>
            {accepted.map(c => (
              <View key={c.id} style={styles.circleCard}>
                <LinearGradient
                  colors={[relColor(c.relationship) + 'CC', relColor(c.relationship)]}
                  style={styles.circleAvatar}
                >
                  <Text style={styles.circleAvatarText}>{c.name.charAt(0).toUpperCase()}</Text>
                </LinearGradient>
                <Text style={styles.circleName} numberOfLines={1}>{c.name}</Text>
                <View style={[styles.relTag, { backgroundColor: relBg(c.relationship), alignSelf: 'center' }]}>
                  <Text style={[styles.relTagText, { color: relColor(c.relationship) }]}>{c.relationship}</Text>
                </View>
                <View style={styles.connectedDot}>
                  <Feather name="check" size={9} color="#FFFFFF" />
                </View>
                <TouchableOpacity style={styles.circleRemove} onPress={() => removeConnection(c.id)}>
                  <Feather name="user-x" size={12} color={theme.faint} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Rejected */}
        {rejected.length > 0 && (
          <>
            <SectionLabel text="REJECTED" styles={styles} />
            {rejected.map(c => (
              <View key={c.id} style={[styles.requestCard, { opacity: 0.5 }]}>
                <View style={[styles.requestAvatar, { backgroundColor: theme.surfaceAlt }]}>
                  <Text style={[styles.requestAvatarText, { color: theme.faint }]}>{c.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.requestName, { color: theme.faint }]}>{c.name}</Text>
                  <Text style={styles.rejectedSub}>{c.relationship}</Text>
                </View>
                <TouchableOpacity onPress={() => removeConnection(c.id)} style={styles.removeBtn}>
                  <Feather name="trash-2" size={14} color={theme.faint} />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Send Request Sheet */}
      <RequestSheet
        visible={modal}
        onClose={() => setModal(false)}
        insets={insets}
        onSubmit={doSend}
        theme={theme}
        styles={styles}
      />


    </>
  );
}

function SectionLabel({ text, styles }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

function RequestSheet({ visible, onClose, insets, onSubmit, theme, styles }) {
  const [emailQuery, setEmailQuery] = useState('');
  const [phoneQuery, setPhoneQuery] = useState('');
  const [searching, setSearching]   = useState(false);
  const [foundUser, setFoundUser]   = useState(null);
  const [notFound, setNotFound]     = useState(false);
  const [noPhoneWarning, setNoPhoneWarning] = useState(false);
  const [rel, setRel]               = useState('');
  const debounceRef                 = useRef(null);

  useEffect(() => {
    if (!visible) {
      setEmailQuery(''); setPhoneQuery(''); setFoundUser(null); setNotFound(false); setNoPhoneWarning(false); setRel(''); setSearching(false);
    }
  }, [visible]);

  // Search only when both fields have enough input
  useEffect(() => {
    clearTimeout(debounceRef.current);
    setFoundUser(null); setNotFound(false); setNoPhoneWarning(false);
    const email = emailQuery.trim();
    const phone = phoneQuery.trim();
    if (email.length < 3 || phone.length < 10) { setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch(
          `/api/auth/users/search?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`
        );
        setFoundUser(data.user || null);
        setNotFound(!data.user);
        setNoPhoneWarning(!!data.targetHasNoPhone);
      } catch {
        setNotFound(true);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [emailQuery, phoneQuery]);

  const canSend = foundUser && rel;

  const handleSend = () => {
    if (!canSend) return;
    onSubmit(foundUser.name, rel, foundUser.email);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.sheetHandle} />

          {/* Header */}
          <LinearGradient colors={['#0F5132', '#1F9A5A']} style={styles.sheetHero}>
            <LinearGradient colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.1)']} style={styles.sheetHeroIcon}>
              <Feather name="user-plus" size={20} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetHeroTitle}>Send Request</Text>
              <Text style={styles.sheetHeroSub}>Both email & phone must match</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.sheetCloseBtn}>
              <Feather name="x" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ paddingHorizontal: 20 }}>

            {/* Email input */}
            <Text style={styles.label}>Email Address <Text style={styles.req}>*</Text></Text>
            <View style={styles.searchBox}>
              <Feather name="mail" size={16} color={theme.faint} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="e.g. priya@gmail.com"
                placeholderTextColor={theme.placeholder}
                value={emailQuery}
                onChangeText={t => { setEmailQuery(t); setFoundUser(null); setNotFound(false); }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
              {emailQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setEmailQuery(''); setFoundUser(null); setNotFound(false); }}>
                  <Feather name="x-circle" size={16} color={theme.faint} />
                </TouchableOpacity>
              )}
            </View>

            {/* Phone input */}
            <Text style={styles.label}>Mobile Number <Text style={styles.req}>*</Text></Text>
            <View style={styles.searchBox}>
              <Feather name="phone" size={16} color={theme.faint} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={theme.placeholder}
                value={phoneQuery}
                onChangeText={t => { setPhoneQuery(t); setFoundUser(null); setNotFound(false); }}
                keyboardType="phone-pad"
                maxLength={10}
              />
              {searching && <ActivityIndicator size="small" color={theme.accent} />}
              {phoneQuery.length > 0 && !searching && (
                <TouchableOpacity onPress={() => { setPhoneQuery(''); setFoundUser(null); setNotFound(false); }}>
                  <Feather name="x-circle" size={16} color={theme.faint} />
                </TouchableOpacity>
              )}
            </View>

            {/* Not found state */}
            {notFound && (
              <View style={styles.notFoundBox}>
                <Feather name="user-x" size={18} color={theme.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.notFoundTitle}>No user found</Text>
                  <Text style={styles.notFoundSub}>No Mneva account matches this email & phone combination.</Text>
                </View>
              </View>
            )}

            {/* Found user — no phone warning */}
            {foundUser && noPhoneWarning && (
              <View style={styles.warnBox}>
                <Feather name="alert-circle" size={16} color={theme.warning} />
                <Text style={styles.warnText}>This user hasn't added their phone yet. They should add it in Settings → Account.</Text>
              </View>
            )}

            {/* Found user profile card */}
            {foundUser && (
              <View style={styles.profileCard}>
                <View style={styles.profileCardTop}>
                  <LinearGradient colors={['#0F5132', '#1F9A5A']} style={styles.profileAvatar}>
                    <Text style={styles.profileAvatarText}>
                      {foundUser.name.charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.profileName}>{foundUser.name}</Text>
                    <Text style={styles.profileEmail}>{foundUser.email}</Text>
                  </View>
                  <View style={styles.profileFoundBadge}>
                    <Feather name="check-circle" size={13} color={theme.accent} />
                    <Text style={styles.profileFoundText}>Found</Text>
                  </View>
                </View>

                {/* Relationship picker inside the card */}
                <Text style={[styles.label, { marginTop: 14 }]}>Your Relationship <Text style={styles.req}>*</Text></Text>
                <View style={styles.chipRow}>
                  {RELATIONSHIPS.map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, rel === r && { backgroundColor: relBg(r), borderColor: relColor(r) }]}
                      onPress={() => setRel(r)}
                    >
                      <Text style={[styles.chipText, rel === r && { color: relColor(r), fontWeight: '800' }]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Preview */}
                {rel !== '' && (
                  <View style={styles.previewRow}>
                    <View style={styles.previewPerson}>
                      <View style={[styles.previewAvatar, { backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6' }]}>
                        <Text style={[styles.previewAvatarText, { color: theme.accent }]}>Y</Text>
                      </View>
                      <Text style={styles.previewName}>You</Text>
                    </View>
                    <View style={styles.previewArrow}>
                      <View style={styles.previewArrowLine} />
                      <Feather name="arrow-right" size={16} color={theme.accent} />
                    </View>
                    <View style={styles.previewPerson}>
                      <View style={[styles.previewAvatar, { backgroundColor: relBg(rel) }]}>
                        <Text style={[styles.previewAvatarText, { color: relColor(rel) }]}>
                          {foundUser.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.previewName} numberOfLines={1}>{foundUser.name}</Text>
                      <View style={[styles.relTag, { backgroundColor: relBg(rel), alignSelf: 'center' }]}>
                        <Text style={[styles.relTagText, { color: relColor(rel) }]}>{rel}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Send button */}
            <TouchableOpacity
              style={[styles.submitBtn, !canSend && styles.submitBtnDisabled]}
              disabled={!canSend}
              onPress={handleSend}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#0F5132', '#1F9A5A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                <Feather name="send" size={16} color="#FFFFFF" />
                <Text style={styles.submitText}>
                  {foundUser ? `Send Request to ${foundUser.name}` : 'Send Request'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (theme) => StyleSheet.create({
  primaryBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 20 },
  primaryBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
  btnIconWrap: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: theme.faint, letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },

  // Request card
  requestCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 16, padding: 14, marginBottom: 10, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  requestCardIncoming: { borderLeftWidth: 3, borderLeftColor: theme.accent },
  directionBadgeSent: { position: 'absolute', top: 10, left: 10, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  directionBadgeIncoming: { position: 'absolute', top: 10, left: 10, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6', alignItems: 'center', justifyContent: 'center' },
  directionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  directionYou: { fontSize: 12, fontWeight: '800', color: theme.accent },
  requestAvatar: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  requestAvatarText: { fontSize: 18, fontWeight: '800' },
  requestName: { fontSize: 14, fontWeight: '800', color: theme.text },
  requestEmail: { fontSize: 11, color: theme.faint, marginTop: 3 },
  relTag: { alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  relTagText: { fontSize: 10, fontWeight: '800' },
  acceptBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center' },
  pendingTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  pendingTagText: { fontSize: 10, fontWeight: '800', color: theme.warning },
  removeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  rejectedSub: { fontSize: 12, color: theme.faint },
  emptySection: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed' },
  emptySectionText: { fontSize: 13, color: theme.disabled, fontWeight: '600' },

  // Family circle grid
  emptyCircle: { alignItems: 'center', paddingVertical: 40, gap: 10, backgroundColor: theme.card, borderRadius: 20, marginBottom: 16 },
  emptyCircleIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  emptyCircleTitle: { fontSize: 16, fontWeight: '800', color: theme.text },
  emptyCircleSub: { fontSize: 12, color: theme.faint },
  circleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  circleCard: { width: '47%', backgroundColor: theme.card, borderRadius: 20, padding: 16, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  circleAvatar: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  circleAvatarText: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  circleName: { fontSize: 14, fontWeight: '800', color: theme.text },
  connectedDot: { position: 'absolute', top: 12, right: 12, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  circleRemove: { position: 'absolute', bottom: 10, right: 12 },

  // Sheet
  overlay: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.isDark ? theme.bg : '#F2F4F7', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, marginTop: 10 },
  sheetHero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 18, marginBottom: 4 },
  sheetHeroIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sheetHeroTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  sheetHeroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginBottom: 8, marginTop: 14, letterSpacing: 0.3 },
  req: { color: theme.danger },
  input: { backgroundColor: theme.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: theme.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.card, borderWidth: 1.5, borderColor: 'transparent' },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  submitBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 20, marginBottom: 8 },
  submitBtnDisabled: { opacity: 0.4 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  // Search sheet
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 0 },
  searchInput: { flex: 1, fontSize: 14, color: theme.text },
  notFoundBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED', borderRadius: 14, padding: 14, marginTop: 12 },
  notFoundTitle: { fontSize: 13, fontWeight: '800', color: theme.danger },
  notFoundSub: { fontSize: 12, color: theme.danger, opacity: 0.8, marginTop: 2 },
  warnBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7', borderRadius: 12, padding: 12, marginTop: 8 },
  warnText: { flex: 1, fontSize: 12, color: theme.isDark ? theme.warning : '#92400E', lineHeight: 17 },
  // dual-field search (email + phone must both match)
  profileCard: { backgroundColor: theme.card, borderRadius: 18, padding: 16, marginTop: 12, borderWidth: 1.5, borderColor: theme.isDark ? 'rgba(52,199,123,0.3)' : '#D1FAE5' },
  profileCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  profileAvatar: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  profileName: { fontSize: 15, fontWeight: '800', color: theme.text },
  profileEmail: { fontSize: 12, color: theme.faint, marginTop: 2 },
  profileFoundBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  profileFoundText: { fontSize: 11, fontWeight: '800', color: theme.accent },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, backgroundColor: theme.surfaceAlt, borderRadius: 14, padding: 14 },
  previewPerson: { alignItems: 'center', gap: 6, flex: 1 },
  previewAvatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  previewAvatarText: { fontSize: 18, fontWeight: '800' },
  previewName: { fontSize: 12, fontWeight: '800', color: theme.text, textAlign: 'center' },
  previewArrow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  previewArrowLine: { width: 16, height: 2, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.3)' : '#D1FAE5', borderRadius: 1 },
});
