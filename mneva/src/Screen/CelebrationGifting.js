import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, useWindowDimensions, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFamilyItems } from '../hooks/useFamilyItems';
import { useSocket } from '../services/socket';
import { useTheme } from '../context/ThemeContext';
import DateField from './finance/DateField';
import TimeField from './finance/TimeField';

const OCCASION_TYPES = ['Birthday', 'Anniversary', 'Festival', 'Wedding', 'Graduation', 'Baby Shower', 'Other'];
const GIFT_STATUS    = ['Idea', 'Ordered', 'Delivered', 'Given'];
const sColor = (s, theme) => s === 'Given' ? theme.accent : s === 'Delivered' ? theme.info : s === 'Ordered' ? theme.warning : theme.accentAlt;
const sBg    = (s, theme) => {
  if (s === 'Given') return theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6';
  if (s === 'Delivered') return theme.isDark ? 'rgba(107,184,240,0.16)' : '#EAF3FD';
  if (s === 'Ordered') return theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7';
  return theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE';
};

const EMPTY_OCC  = { type: '', person: '', date: '', time: '', notes: '' };
const EMPTY_GIFT = { person: '', occasionId: '', occasion: '', item: '', budget: '', status: 'Idea', notes: '' };

// Mirrors validateFamilyItemData in backend/src/routes/familyItems.js — kept
// here too so an invalid save is caught before a network round-trip.
function occasionError(f) {
  if (!f.type) return null // required-but-empty just disables Save, no need to nag before the user's picked anything
  if (!f.person.trim()) return null
  if (f.date && new Date(f.date) < new Date(new Date().toDateString())) return 'Date cannot be in the past';
  if (f.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time)) return 'Time must be a valid HH:MM time';
  return null;
}
function giftError(f) {
  if (!f.item.trim() || !f.person.trim()) return null
  if (f.budget && !(Number(f.budget) >= 0)) return 'Budget must be zero or a positive number';
  return null;
}

export default function CelebrationGifting({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = width < 360 ? 16 : 20;
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { items, loading, saving, create, update, remove, byType } = useFamilyItems('celebration');
  const { on } = useSocket();

  const [alert, setAlert]         = useState(null);
  const [occModal, setOccModal]   = useState(false);
  const [giftModal, setGiftModal] = useState(false);
  const [editOcc, setEditOcc]     = useState(null); // null = adding; otherwise the item being edited
  const [editGift, setEditGift]   = useState(null);
  const [occForm, setOccForm]     = useState(EMPTY_OCC);
  const [giftForm, setGiftForm]   = useState(EMPTY_GIFT);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const off = on('family:alert', (data) => {
      if (data.domain === 'celebration') setAlert(data);
    });
    return () => off?.();
  }, [on]);

  const occasions = byType('occasion');
  const gifts     = byType('gift');
  const totalBudget = gifts.reduce((sum, g) => sum + (parseFloat(g.data?.budget) || 0), 0);

  const occErr  = occasionError(occForm);
  const giftErr = giftError(giftForm);
  const occCanSave  = !!occForm.type && occForm.person.trim() && !occErr;
  const giftCanSave = giftForm.item.trim() && giftForm.person.trim() && !giftErr;

  const openAddOcc  = () => { setEditOcc(null); setOccForm(EMPTY_OCC); setSaveError(''); setOccModal(true); };
  const openEditOcc = (item) => {
    setEditOcc(item);
    setOccForm({ type: item.data.type || '', person: item.data.person || '', date: item.data.date || '', time: item.data.time || '', notes: item.data.notes || '' });
    setSaveError('');
    setOccModal(true);
  };
  const openAddGift  = () => { setEditGift(null); setGiftForm(EMPTY_GIFT); setSaveError(''); setGiftModal(true); };
  const openEditGift = (item) => {
    setEditGift(item);
    setGiftForm({
      person: item.data.person || '', occasionId: item.data.occasionId || '', occasion: item.data.occasion || '',
      item: item.data.item || '', budget: item.data.budget != null ? String(item.data.budget) : '',
      status: item.data.status || 'Idea', notes: item.data.notes || '',
    });
    setSaveError('');
    setGiftModal(true);
  };

  const saveOccasion = async () => {
    if (!occCanSave) return;
    setSaveError('');
    const remindAt = (occForm.date && occForm.time)
      ? new Date(`${occForm.date}T${occForm.time}:00`).toISOString()
      : occForm.date ? new Date(`${occForm.date}T09:00:00`).toISOString() : null;
    try {
      if (editOcc) await update(editOcc.id, { data: occForm, remindAt });
      else await create('occasion', occForm, remindAt);
      setOccModal(false);
    } catch (err) {
      setSaveError(err.message || 'Could not save this occasion.');
    }
  };

  const saveGift = async () => {
    if (!giftCanSave) return;
    setSaveError('');
    try {
      if (editGift) await update(editGift.id, { data: giftForm });
      else await create('gift', giftForm);
      setGiftModal(false);
    } catch (err) {
      setSaveError(err.message || 'Could not save this gift.');
    }
  };

  const deleteOccasion = () => {
    Alert.alert('Delete Occasion', `Remove "${editOcc.data.person}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await remove(editOcc.id); setOccModal(false); }
        catch (err) { setSaveError(err.message || 'Could not delete this occasion.'); }
      } },
    ]);
  };
  const deleteGift = () => {
    Alert.alert('Delete Gift', `Remove "${editGift.data.item}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await remove(editGift.id); setGiftModal(false); }
        catch (err) { setSaveError(err.message || 'Could not delete this gift.'); }
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {alert && (
        <View style={styles.alertBanner}>
          <LinearGradient colors={['#E0546E', '#C8405A']} style={styles.alertGrad}>
            <Text style={styles.alertEmoji}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>🔔 {alert.type} Coming Up!</Text>
              <Text style={styles.alertBody} numberOfLines={1}>{alert.title}</Text>
            </View>
            <TouchableOpacity onPress={() => setAlert(null)} style={{ padding: 4 }}><Feather name="x" size={16} color="#FFFFFF" /></TouchableOpacity>
          </LinearGradient>
        </View>
      )}

      <View style={[styles.header, { paddingHorizontal: pad }]}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Celebrations & Gifting</Text>
          <Text style={styles.headerSub}>Occasions, gifts & budget</Text>
        </View>
        <View style={styles.headerBadge}><Text style={{ fontSize: 22 }}>🎁</Text></View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={theme.danger} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
          {saving && <SavingBar theme={theme} styles={styles} />}

          {gifts.length > 0 && (
            <View style={styles.budgetCard}>
              <Feather name="trending-up" size={16} color={theme.accentAlt} />
              <Text style={styles.budgetText}>Total gift budget: <Text style={styles.budgetAmount}>₹{totalBudget.toLocaleString('en-IN')}</Text></Text>
            </View>
          )}

          {items.length > 0 && (
            <View style={styles.memoryBadge}>
              <Feather name="cpu" size={12} color={theme.accentAlt} />
              <Text style={styles.memoryText}>Mneva AI remembers {occasions.length} occasion{occasions.length !== 1 ? 's' : ''} & {gifts.length} gift{gifts.length !== 1 ? 's' : ''}</Text>
            </View>
          )}

          <SectionHeader label="UPCOMING OCCASIONS" color={theme.danger} bg={theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED'} onAdd={openAddOcc} styles={styles} />
          <View style={styles.card}>
            {occasions.length === 0 ? <EmptyRow icon="gift" text="No occasions added" theme={theme} styles={styles} /> : occasions.map((o, i) => {
              const linkedGiftCount = gifts.filter(g => g.data?.occasionId === o.id).length;
              return (
                <TouchableOpacity key={o.id} style={[styles.listRow, i < occasions.length - 1 && styles.divider]} onPress={() => openEditOcc(o)} activeOpacity={0.7}>
                  <View style={[styles.rowIcon, { backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED' }]}><Feather name="gift" size={14} color={theme.danger} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{o.data.person}</Text>
                    <Text style={styles.rowMeta}>{[o.data.type, o.data.date].filter(Boolean).join(' · ')}</Text>
                  </View>
                  {linkedGiftCount > 0 && <View style={styles.linkTag}><Feather name="link" size={9} color={theme.accentAlt} /><Text style={styles.linkTagText}>{linkedGiftCount}</Text></View>}
                  {o.remindAt && <View style={styles.remindTag}><Feather name="bell" size={10} color={theme.danger} /><Text style={styles.remindTagText}>Reminder</Text></View>}
                  <Feather name="chevron-right" size={16} color={theme.faint} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              );
            })}
          </View>

          <SectionHeader label="GIFT IDEAS & TRACKER" color={theme.accentAlt} bg={theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE'} onAdd={openAddGift} styles={styles} />
          <View style={styles.card}>
            {gifts.length === 0 ? <EmptyRow icon="package" text="No gifts added" theme={theme} styles={styles} /> : gifts.map((g, i) => (
              <TouchableOpacity key={g.id} style={[styles.listRow, i < gifts.length - 1 && styles.divider]} onPress={() => openEditGift(g)} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE' }]}><Feather name="package" size={14} color={theme.accentAlt} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{g.data.item}</Text>
                  <Text style={styles.rowMeta}>{[g.data.person, g.data.occasion, g.data.budget ? `₹${g.data.budget}` : null].filter(Boolean).join(' · ')}</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: sBg(g.data.status, theme) }]}>
                  <Text style={[styles.tagText, { color: sColor(g.data.status, theme) }]}>{g.data.status}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={theme.faint} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Occasion Modal */}
      <SheetModal
        visible={occModal} onClose={() => setOccModal(false)} insets={insets}
        title={editOcc ? 'Edit Occasion' : 'Add Occasion'} gradColors={['#E0546E', '#C8405A']} icon="gift" theme={theme} styles={styles}
        onDelete={editOcc ? deleteOccasion : null} deleteColor={theme.danger}
      >
        <FLabel styles={styles}>Occasion Type *</FLabel>
        <View style={styles.chipRow}>
          {OCCASION_TYPES.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, occForm.type === t && styles.chipActive]} onPress={() => setOccForm(f => ({ ...f, type: t }))}>
              <Text style={[styles.chipText, occForm.type === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <FLabel styles={styles}>Person / Name *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Mom's Birthday" placeholderTextColor={theme.placeholder} value={occForm.person} onChangeText={v => setOccForm(f => ({ ...f, person: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><DateField label="Date" value={occForm.date} minimumDate={new Date()} onChange={v => setOccForm(f => ({ ...f, date: v.slice(0, 10) }))} /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><TimeField label="Time" value={occForm.time} onChange={v => setOccForm(f => ({ ...f, time: v }))} /></View>
        </View>
        <FLabel styles={styles}>Notes</FLabel>
        <TextInput style={styles.input} placeholder="Any notes..." placeholderTextColor={theme.placeholder} value={occForm.notes} onChangeText={v => setOccForm(f => ({ ...f, notes: v }))} />
        {(occErr || saveError) ? <Text style={styles.errorText}>{occErr || saveError}</Text> : null}
        <SaveBtn onPress={saveOccasion} disabled={!occCanSave || saving} colors={['#E0546E', '#C8405A']} label={editOcc ? 'Update Occasion' : 'Save Occasion'} styles={styles} />
      </SheetModal>

      {/* Gift Modal */}
      <SheetModal
        visible={giftModal} onClose={() => setGiftModal(false)} insets={insets}
        title={editGift ? 'Edit Gift' : 'Add Gift'} gradColors={['#9B72FF', '#7C5CE8']} icon="package" theme={theme} styles={styles}
        onDelete={editGift ? deleteGift : null} deleteColor={theme.danger}
      >
        <FLabel styles={styles}>Gift Item *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Silk saree, Watch" placeholderTextColor={theme.placeholder} value={giftForm.item} onChangeText={v => setGiftForm(f => ({ ...f, item: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><FLabel styles={styles}>For *</FLabel><TextInput style={styles.input} placeholder="Person's name" placeholderTextColor={theme.placeholder} value={giftForm.person} onChangeText={v => setGiftForm(f => ({ ...f, person: v }))} /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><FLabel styles={styles}>Budget (₹)</FLabel><TextInput style={styles.input} placeholder="e.g. 2000" placeholderTextColor={theme.placeholder} value={giftForm.budget} onChangeText={v => setGiftForm(f => ({ ...f, budget: v }))} keyboardType="numeric" /></View>
        </View>

        <FLabel styles={styles}>Link to an Occasion (optional)</FLabel>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, !giftForm.occasionId && styles.chipActive]}
            onPress={() => setGiftForm(f => ({ ...f, occasionId: '' }))}
          >
            <Text style={[styles.chipText, !giftForm.occasionId && styles.chipTextActive]}>None</Text>
          </TouchableOpacity>
          {occasions.map(o => (
            <TouchableOpacity
              key={o.id}
              style={[styles.chip, giftForm.occasionId === o.id && styles.chipActive]}
              onPress={() => setGiftForm(f => ({ ...f, occasionId: o.id, occasion: `${o.data.person} (${o.data.type})` }))}
            >
              <Text style={[styles.chipText, giftForm.occasionId === o.id && styles.chipTextActive]}>{o.data.person}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <FLabel styles={styles}>Occasion{giftForm.occasionId ? ' (linked above)' : ''}</FLabel>
        <TextInput
          style={[styles.input, !!giftForm.occasionId && styles.inputDisabled]}
          editable={!giftForm.occasionId}
          placeholder="e.g. Birthday, Diwali"
          placeholderTextColor={theme.placeholder}
          value={giftForm.occasion}
          onChangeText={v => setGiftForm(f => ({ ...f, occasion: v }))}
        />

        <FLabel styles={styles}>Status</FLabel>
        <View style={styles.chipRow}>
          {GIFT_STATUS.map(s => (
            <TouchableOpacity key={s} style={[styles.chip, giftForm.status === s && { backgroundColor: sBg(s, theme), borderColor: sColor(s, theme) }]} onPress={() => setGiftForm(f => ({ ...f, status: s }))}>
              <Text style={[styles.chipText, giftForm.status === s && { color: sColor(s, theme) }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {(giftErr || saveError) ? <Text style={styles.errorText}>{giftErr || saveError}</Text> : null}
        <SaveBtn onPress={saveGift} disabled={!giftCanSave || saving} colors={['#9B72FF', '#7C5CE8']} label={editGift ? 'Update Gift' : 'Save Gift'} styles={styles} />
      </SheetModal>
    </SafeAreaView>
  );
}

function SavingBar({ theme, styles }) {
  return (
    <View style={styles.savingBar}>
      <ActivityIndicator size="small" color={theme.danger} />
      <Text style={styles.savingText}>Saving & updating Mneva AI memory...</Text>
    </View>
  );
}
function SectionHeader({ label, color, bg, onAdd, styles }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <TouchableOpacity style={[styles.addBtn, { backgroundColor: bg }]} onPress={onAdd}>
        <Feather name="plus" size={14} color={color} /><Text style={[styles.addBtnText, { color }]}>Add</Text>
      </TouchableOpacity>
    </View>
  );
}
function EmptyRow({ icon, text, theme, styles }) {
  return <View style={styles.emptyRow}><Feather name={icon} size={18} color={theme.disabled} /><Text style={styles.emptyText}>{text}</Text></View>;
}
function FLabel({ children, styles }) { return <Text style={styles.fieldLabel}>{children}</Text>; }
function SheetModal({ visible, onClose, insets, title, gradColors, icon, children, styles, onDelete, deleteColor }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <LinearGradient colors={gradColors} style={styles.sheetIcon}><Feather name={icon} size={20} color="#FFFFFF" /></LinearGradient>
            <Text style={[styles.sheetTitle, { flex: 1 }]}>{title}</Text>
            {onDelete && (
              <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
                <Feather name="trash-2" size={18} color={deleteColor} />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function SaveBtn({ onPress, disabled, colors, label, styles }) {
  return (
    <TouchableOpacity style={[styles.saveBtn, disabled && styles.saveBtnDisabled]} disabled={disabled} onPress={onPress}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
        <Feather name="check" size={16} color="#FFFFFF" /><Text style={styles.saveBtnText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  alertBanner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999 },
  alertGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  alertEmoji: { fontSize: 20 },
  alertTitle: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  alertBody: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  headerSub: { fontSize: 12, color: theme.faint, marginTop: 1 },
  headerBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED', alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  savingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED', borderRadius: 10, padding: 10, marginBottom: 12 },
  savingText: { fontSize: 12, color: theme.danger, fontWeight: '600' },
  budgetCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE', borderRadius: 14, padding: 12, marginBottom: 12 },
  budgetText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
  budgetAmount: { color: theme.accentAlt, fontWeight: '800' },
  memoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  memoryText: { fontSize: 12, color: theme.accentAlt, fontWeight: '600', flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.faint, letterSpacing: 0.5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  addBtnText: { fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: theme.card, borderRadius: 18, paddingHorizontal: 14, marginBottom: 20 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: theme.border },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  rowMeta: { fontSize: 12, color: theme.faint },
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 10, fontWeight: '800' },
  remindTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 },
  remindTagText: { fontSize: 10, fontWeight: '700', color: theme.danger },
  linkTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 },
  linkTagText: { fontSize: 10, fontWeight: '700', color: theme.accentAlt },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  emptyText: { fontSize: 13, color: theme.faint, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  deleteBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED', alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  input: { backgroundColor: theme.surfaceAlt, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: theme.text, marginBottom: 16 },
  inputDisabled: { opacity: 0.6 },
  rowFields: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.surfaceAlt, borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { backgroundColor: theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7', borderColor: theme.warning },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  chipTextActive: { color: theme.warning },
  errorText: { fontSize: 12, color: theme.danger, marginBottom: 12 },
  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
