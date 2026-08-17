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

const EVENT_TYPES = ['Birthday', 'Anniversary', 'School', 'Medical', 'Travel', 'Festival', 'Meeting', 'Other'];
const MEMBERS     = ['Dad', 'Mom', 'Self', 'Spouse', 'Child', 'All'];
const tColor = (t) => ({ Birthday: '#E0546E', Anniversary: '#9B72FF', School: '#4FA6E8', Medical: '#1F9A5A', Travel: '#D97706', Festival: '#F5A623', Meeting: '#6B7280', Other: '#9AA1AE' }[t] || '#9AA1AE');
const tBg    = (t) => ({ Birthday: '#FCEAED', Anniversary: '#F3EFFE', School: '#EAF3FD', Medical: '#EFFDF6', Travel: '#FEF3C7', Festival: '#FEF3C7', Meeting: '#F5F6F8', Other: '#F5F6F8' }[t] || '#F5F6F8');
const tIcon  = (t) => ({ Birthday: 'gift', Anniversary: 'heart', School: 'book', Medical: 'activity', Travel: 'map-pin', Festival: 'star', Meeting: 'users', Other: 'calendar' }[t] || 'calendar');

export default function FamilyCalendar({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = width < 360 ? 16 : 20;
  const { items, loading, saving, create, remove } = useFamilyItems('calendar');
  const { on } = useSocket();

  const [alert, setAlert]   = useState(null);
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState({ type: '', title: '', member: '', date: '', time: '', notes: '' });

  useEffect(() => {
    const off = on('family:alert', (data) => {
      if (data.domain === 'calendar') setAlert(data);
    });
    return () => off?.();
  }, [on]);

  const saveEvent = async () => {
    if (!form.title.trim() || !form.type || !form.date.trim()) return;
    const remindAt = (form.date && form.time)
      ? new Date(`${form.date}T${form.time}:00`).toISOString()
      : new Date(`${form.date}T09:00:00`).toISOString();
    await create('event', form, remindAt);
    setForm({ type: '', title: '', member: '', date: '', time: '', notes: '' });
    setModal(false);
  };

  // Group by month (date field YYYY-MM-DD)
  const sorted = [...items].sort((a, b) => (a.data?.date || '').localeCompare(b.data?.date || ''));
  const grouped = sorted.reduce((acc, e) => {
    const key = (e.data?.date || '').slice(0, 7) || 'No date';
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {alert && (
        <View style={styles.alertBanner}>
          <LinearGradient colors={['#F5A623', '#E8943A']} style={styles.alertGrad}>
            <Text style={styles.alertEmoji}>📅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>🔔 {alert.type} Today!</Text>
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
          <Text style={styles.headerTitle}>Family Calendar</Text>
          <Text style={styles.headerSub}>{items.length} event{items.length !== 1 ? 's' : ''} scheduled</Text>
        </View>
        <TouchableOpacity onPress={() => setModal(true)} style={styles.addFab}>
          <LinearGradient colors={['#F5A623', '#E8943A']} style={styles.addFabGrad}>
            <Feather name="plus" size={20} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#F5A623" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
          {saving && <SavingBar />}

          {items.length > 0 && (
            <View style={styles.memoryBadge}>
              <Feather name="cpu" size={12} color="#9B72FF" />
              <Text style={styles.memoryText}>Mneva AI has memorized {items.length} family event{items.length !== 1 ? 's' : ''}</Text>
            </View>
          )}

          {items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={styles.emptyIcon}>
                <Feather name="calendar" size={32} color="#F5A623" />
              </LinearGradient>
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptySubtitle}>Tap + to add family events, birthdays & more</Text>
            </View>
          ) : (
            Object.entries(grouped).map(([month, evts]) => (
              <View key={month}>
                <Text style={styles.monthLabel}>{month}</Text>
                <View style={styles.card}>
                  {evts.map((e, i) => (
                    <View key={e.id} style={[styles.listRow, i < evts.length - 1 && styles.divider]}>
                      <View style={[styles.rowIcon, { backgroundColor: tBg(e.data?.type) }]}>
                        <Feather name={tIcon(e.data?.type)} size={14} color={tColor(e.data?.type)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{e.data?.title}</Text>
                        <Text style={styles.rowMeta}>{[e.data?.date, e.data?.time, e.data?.member].filter(Boolean).join(' · ')}</Text>
                      </View>
                      <View style={[styles.tag, { backgroundColor: tBg(e.data?.type) }]}>
                        <Text style={[styles.tagText, { color: tColor(e.data?.type) }]}>{e.data?.type}</Text>
                      </View>
                      {e.remindAt && <View style={styles.remindDot}><Feather name="bell" size={10} color="#F5A623" /></View>}
                      <TouchableOpacity onPress={() => remove(e.id)} style={{ padding: 4, marginLeft: 4 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add Event Modal */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setModal(false)}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
          <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <LinearGradient colors={['#F5A623', '#E8943A']} style={styles.sheetIcon}>
                <Feather name="calendar" size={20} color="#FFFFFF" />
              </LinearGradient>
              <Text style={styles.sheetTitle}>Add Event</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Event Type *</Text>
              <View style={styles.chipRow}>
                {EVENT_TYPES.map(t => (
                  <TouchableOpacity key={t} style={[styles.chip, form.type === t && { backgroundColor: tBg(t), borderColor: tColor(t) }]} onPress={() => setForm(f => ({ ...f, type: t }))}>
                    <Text style={[styles.chipText, form.type === t && { color: tColor(t) }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput style={styles.input} placeholder="e.g. Dad's Birthday" placeholderTextColor="#9AA1AE" value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} />
              <Text style={styles.fieldLabel}>For Member</Text>
              <View style={styles.chipRow}>
                {MEMBERS.map(m => (
                  <TouchableOpacity key={m} style={[styles.chip, form.member === m && styles.chipActive]} onPress={() => setForm(f => ({ ...f, member: m }))}>
                    <Text style={[styles.chipText, form.member === m && styles.chipTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Date * (YYYY-MM-DD)</Text>
                  <TextInput style={styles.input} placeholder="2025-08-15" placeholderTextColor="#9AA1AE" value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} keyboardType="numeric" />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Time (HH:MM)</Text>
                  <TextInput style={styles.input} placeholder="09:00" placeholderTextColor="#9AA1AE" value={form.time} onChangeText={v => setForm(f => ({ ...f, time: v }))} keyboardType="numeric" />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput style={styles.input} placeholder="Any notes..." placeholderTextColor="#9AA1AE" value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} />
              <TouchableOpacity
                style={[styles.saveBtn, (!form.title.trim() || !form.type || !form.date.trim()) && styles.saveBtnDisabled]}
                disabled={!form.title.trim() || !form.type || !form.date.trim()}
                onPress={saveEvent}
              >
                <LinearGradient colors={['#F5A623', '#E8943A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                  <Feather name="check" size={16} color="#FFFFFF" />
                  <Text style={styles.saveBtnText}>Save Event</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function SavingBar() {
  return (
    <View style={styles.savingBar}>
      <ActivityIndicator size="small" color="#F5A623" />
      <Text style={styles.savingText}>Saving & updating Mneva AI memory...</Text>
    </View>
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
  addFab: { borderRadius: 14, overflow: 'hidden' },
  addFabGrad: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  savingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 12 },
  savingText: { fontSize: 12, color: '#D97706', fontWeight: '600' },
  memoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F3EFFE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  memoryText: { fontSize: 12, color: '#7C3AED', fontWeight: '600', flex: 1 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#14171F' },
  emptySubtitle: { fontSize: 13, color: '#9AA1AE', textAlign: 'center' },
  monthLabel: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5, marginBottom: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, marginBottom: 20 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  rowMeta: { fontSize: 12, color: '#9AA1AE' },
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 10, fontWeight: '800' },
  remindDot: { width: 22, height: 22, borderRadius: 7, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
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
