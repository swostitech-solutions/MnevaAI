import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFamilyItems } from '../hooks/useFamilyItems';
import { useSocket } from '../services/socket';

const OCCASION_TYPES = ['Birthday', 'Anniversary', 'Festival', 'Wedding', 'Graduation', 'Baby Shower', 'Other'];
const GIFT_STATUS    = ['Idea', 'Ordered', 'Delivered', 'Given'];
const sColor = (s) => s === 'Given' ? '#1F9A5A' : s === 'Delivered' ? '#4FA6E8' : s === 'Ordered' ? '#D97706' : '#9B72FF';
const sBg    = (s) => s === 'Given' ? '#EFFDF6' : s === 'Delivered' ? '#EAF3FD' : s === 'Ordered' ? '#FEF3C7' : '#F3EFFE';

export default function CelebrationGifting({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = width < 360 ? 16 : 20;
  const { items, loading, saving, create, remove, byType } = useFamilyItems('celebration');
  const { on } = useSocket();

  const [alert, setAlert]         = useState(null);
  const [occModal, setOccModal]   = useState(false);
  const [giftModal, setGiftModal] = useState(false);
  const [occForm, setOccForm]     = useState({ type: '', person: '', date: '', time: '', notes: '' });
  const [giftForm, setGiftForm]   = useState({ person: '', occasion: '', item: '', budget: '', status: 'Idea', notes: '' });

  useEffect(() => {
    const off = on('family:alert', (data) => {
      if (data.domain === 'celebration') setAlert(data);
    });
    return () => off?.();
  }, [on]);

  const occasions = byType('occasion');
  const gifts     = byType('gift');
  const totalBudget = gifts.reduce((sum, g) => sum + (parseFloat(g.data?.budget) || 0), 0);

  const saveOccasion = async () => {
    if (!occForm.person.trim() || !occForm.type) return;
    const remindAt = (occForm.date && occForm.time)
      ? new Date(`${occForm.date}T${occForm.time}:00`).toISOString()
      : occForm.date ? new Date(`${occForm.date}T09:00:00`).toISOString() : null;
    await create('occasion', occForm, remindAt);
    setOccForm({ type: '', person: '', date: '', time: '', notes: '' });
    setOccModal(false);
  };

  const saveGift = async () => {
    if (!giftForm.item.trim() || !giftForm.person.trim()) return;
    await create('gift', giftForm);
    setGiftForm({ person: '', occasion: '', item: '', budget: '', status: 'Idea', notes: '' });
    setGiftModal(false);
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
          <Feather name="arrow-left" size={20} color="#14171F" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Celebrations & Gifting</Text>
          <Text style={styles.headerSub}>Occasions, gifts & budget</Text>
        </View>
        <View style={styles.headerBadge}><Text style={{ fontSize: 22 }}>🎁</Text></View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#E0546E" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
          {saving && <SavingBar />}

          {gifts.length > 0 && (
            <View style={styles.budgetCard}>
              <Feather name="trending-up" size={16} color="#9B72FF" />
              <Text style={styles.budgetText}>Total gift budget: <Text style={styles.budgetAmount}>₹{totalBudget.toLocaleString('en-IN')}</Text></Text>
            </View>
          )}

          {items.length > 0 && (
            <View style={styles.memoryBadge}>
              <Feather name="cpu" size={12} color="#9B72FF" />
              <Text style={styles.memoryText}>Mneva AI remembers {occasions.length} occasion{occasions.length !== 1 ? 's' : ''} & {gifts.length} gift{gifts.length !== 1 ? 's' : ''}</Text>
            </View>
          )}

          <SectionHeader label="UPCOMING OCCASIONS" color="#E0546E" bg="#FCEAED" onAdd={() => setOccModal(true)} />
          <View style={styles.card}>
            {occasions.length === 0 ? <EmptyRow icon="gift" text="No occasions added" /> : occasions.map((o, i) => (
              <View key={o.id} style={[styles.listRow, i < occasions.length - 1 && styles.divider]}>
                <View style={[styles.rowIcon, { backgroundColor: '#FCEAED' }]}><Feather name="gift" size={14} color="#E0546E" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{o.data.person}</Text>
                  <Text style={styles.rowMeta}>{[o.data.type, o.data.date].filter(Boolean).join(' · ')}</Text>
                </View>
                {o.remindAt && <View style={styles.remindTag}><Feather name="bell" size={10} color="#E0546E" /><Text style={styles.remindTagText}>Reminder</Text></View>}
                <TouchableOpacity onPress={() => remove(o.id)} style={{ padding: 4 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
              </View>
            ))}
          </View>

          <SectionHeader label="GIFT IDEAS & TRACKER" color="#9B72FF" bg="#F3EFFE" onAdd={() => setGiftModal(true)} />
          <View style={styles.card}>
            {gifts.length === 0 ? <EmptyRow icon="package" text="No gifts added" /> : gifts.map((g, i) => (
              <View key={g.id} style={[styles.listRow, i < gifts.length - 1 && styles.divider]}>
                <View style={[styles.rowIcon, { backgroundColor: '#F3EFFE' }]}><Feather name="package" size={14} color="#9B72FF" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{g.data.item}</Text>
                  <Text style={styles.rowMeta}>{[g.data.person, g.data.occasion, g.data.budget ? `₹${g.data.budget}` : null].filter(Boolean).join(' · ')}</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: sBg(g.data.status) }]}>
                  <Text style={[styles.tagText, { color: sColor(g.data.status) }]}>{g.data.status}</Text>
                </View>
                <TouchableOpacity onPress={() => remove(g.id)} style={{ padding: 4, marginLeft: 6 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Occasion Modal */}
      <SheetModal visible={occModal} onClose={() => setOccModal(false)} insets={insets} title="Add Occasion" gradColors={['#E0546E', '#C8405A']} icon="gift">
        <FLabel>Occasion Type *</FLabel>
        <View style={styles.chipRow}>
          {OCCASION_TYPES.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, occForm.type === t && styles.chipActive]} onPress={() => setOccForm(f => ({ ...f, type: t }))}>
              <Text style={[styles.chipText, occForm.type === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <FLabel>Person / Name *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Mom's Birthday" placeholderTextColor="#9AA1AE" value={occForm.person} onChangeText={v => setOccForm(f => ({ ...f, person: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><FLabel>Date (YYYY-MM-DD)</FLabel><TextInput style={styles.input} placeholder="2025-08-15" placeholderTextColor="#9AA1AE" value={occForm.date} onChangeText={v => setOccForm(f => ({ ...f, date: v }))} keyboardType="numeric" /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><FLabel>Time (HH:MM)</FLabel><TextInput style={styles.input} placeholder="09:00" placeholderTextColor="#9AA1AE" value={occForm.time} onChangeText={v => setOccForm(f => ({ ...f, time: v }))} keyboardType="numeric" /></View>
        </View>
        <FLabel>Notes</FLabel>
        <TextInput style={styles.input} placeholder="Any notes..." placeholderTextColor="#9AA1AE" value={occForm.notes} onChangeText={v => setOccForm(f => ({ ...f, notes: v }))} />
        <SaveBtn onPress={saveOccasion} disabled={!occForm.person.trim() || !occForm.type} colors={['#E0546E', '#C8405A']} label="Save Occasion" />
      </SheetModal>

      {/* Gift Modal */}
      <SheetModal visible={giftModal} onClose={() => setGiftModal(false)} insets={insets} title="Add Gift" gradColors={['#9B72FF', '#7C5CE8']} icon="package">
        <FLabel>Gift Item *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Silk saree, Watch" placeholderTextColor="#9AA1AE" value={giftForm.item} onChangeText={v => setGiftForm(f => ({ ...f, item: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><FLabel>For *</FLabel><TextInput style={styles.input} placeholder="Person's name" placeholderTextColor="#9AA1AE" value={giftForm.person} onChangeText={v => setGiftForm(f => ({ ...f, person: v }))} /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><FLabel>Budget (₹)</FLabel><TextInput style={styles.input} placeholder="e.g. 2000" placeholderTextColor="#9AA1AE" value={giftForm.budget} onChangeText={v => setGiftForm(f => ({ ...f, budget: v }))} keyboardType="numeric" /></View>
        </View>
        <FLabel>Occasion</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Birthday, Diwali" placeholderTextColor="#9AA1AE" value={giftForm.occasion} onChangeText={v => setGiftForm(f => ({ ...f, occasion: v }))} />
        <FLabel>Status</FLabel>
        <View style={styles.chipRow}>
          {GIFT_STATUS.map(s => (
            <TouchableOpacity key={s} style={[styles.chip, giftForm.status === s && { backgroundColor: sBg(s), borderColor: sColor(s) }]} onPress={() => setGiftForm(f => ({ ...f, status: s }))}>
              <Text style={[styles.chipText, giftForm.status === s && { color: sColor(s) }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <SaveBtn onPress={saveGift} disabled={!giftForm.item.trim() || !giftForm.person.trim()} colors={['#9B72FF', '#7C5CE8']} label="Save Gift" />
      </SheetModal>
    </SafeAreaView>
  );
}

function SavingBar() {
  return (
    <View style={styles.savingBar}>
      <ActivityIndicator size="small" color="#E0546E" />
      <Text style={styles.savingText}>Saving & updating Mneva AI memory...</Text>
    </View>
  );
}
function SectionHeader({ label, color, bg, onAdd }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <TouchableOpacity style={[styles.addBtn, { backgroundColor: bg }]} onPress={onAdd}>
        <Feather name="plus" size={14} color={color} /><Text style={[styles.addBtnText, { color }]}>Add</Text>
      </TouchableOpacity>
    </View>
  );
}
function EmptyRow({ icon, text }) {
  return <View style={styles.emptyRow}><Feather name={icon} size={18} color="#C7CBD3" /><Text style={styles.emptyText}>{text}</Text></View>;
}
function FLabel({ children }) { return <Text style={styles.fieldLabel}>{children}</Text>; }
function SheetModal({ visible, onClose, insets, title, gradColors, icon, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <LinearGradient colors={gradColors} style={styles.sheetIcon}><Feather name={icon} size={20} color="#FFFFFF" /></LinearGradient>
            <Text style={styles.sheetTitle}>{title}</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function SaveBtn({ onPress, disabled, colors, label }) {
  return (
    <TouchableOpacity style={[styles.saveBtn, disabled && styles.saveBtnDisabled]} disabled={disabled} onPress={onPress}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
        <Feather name="check" size={16} color="#FFFFFF" /><Text style={styles.saveBtnText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  alertBanner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999 },
  alertGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  alertEmoji: { fontSize: 20 },
  alertTitle: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  alertBody: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  headerSub: { fontSize: 12, color: '#9AA1AE', marginTop: 1 },
  headerBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FCEAED', alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  savingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FCEAED', borderRadius: 10, padding: 10, marginBottom: 12 },
  savingText: { fontSize: 12, color: '#E0546E', fontWeight: '600' },
  budgetCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3EFFE', borderRadius: 14, padding: 12, marginBottom: 12 },
  budgetText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  budgetAmount: { color: '#9B72FF', fontWeight: '800' },
  memoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F3EFFE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  memoryText: { fontSize: 12, color: '#7C3AED', fontWeight: '600', flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  addBtnText: { fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, marginBottom: 20 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  rowMeta: { fontSize: 12, color: '#9AA1AE' },
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 10, fontWeight: '800' },
  remindTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FCEAED', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 },
  remindTagText: { fontSize: 10, fontWeight: '700', color: '#E0546E' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  emptyText: { fontSize: 13, color: '#9AA1AE', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(14,17,26,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E5EA', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#F5F6F8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: '#14171F', marginBottom: 16 },
  rowFields: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F5F6F8', borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { backgroundColor: '#FEF3C7', borderColor: '#F5A623' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#F5A623' },
  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
