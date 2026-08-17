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

const ACTIVITY_TYPES = ['School', 'Sports', 'Music', 'Dance', 'Art', 'Tuition', 'Other'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ChildrenActivities({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = width < 360 ? 16 : 20;
  const { items, loading, saving, create, remove, byType } = useFamilyItems('children');
  const { on } = useSocket();

  const [alert, setAlert]         = useState(null);
  const [childModal, setChildModal]   = useState(false);
  const [actModal, setActModal]       = useState(false);
  const [eventModal, setEventModal]   = useState(false);
  const [childForm, setChildForm]     = useState({ name: '', age: '', school: '', grade: '' });
  const [actForm, setActForm]         = useState({ child: '', type: '', name: '', day: '', time: '', venue: '' });
  const [eventForm, setEventForm]     = useState({ child: '', title: '', date: '', time: '', notes: '' });

  useEffect(() => {
    const off = on('family:alert', (data) => {
      if (data.domain === 'children') setAlert(data);
    });
    return () => off?.();
  }, [on]);

  const children   = byType('child');
  const activities = byType('activity');
  const events     = byType('event');

  const saveChild = async () => {
    if (!childForm.name.trim()) return;
    await create('child', childForm);
    setChildForm({ name: '', age: '', school: '', grade: '' });
    setChildModal(false);
  };

  const saveActivity = async () => {
    if (!actForm.name.trim() || !actForm.type) return;
    await create('activity', actForm);
    setActForm({ child: '', type: '', name: '', day: '', time: '', venue: '' });
    setActModal(false);
  };

  const saveEvent = async () => {
    if (!eventForm.title.trim()) return;
    const remindAt = (eventForm.date && eventForm.time)
      ? new Date(`${eventForm.date}T${eventForm.time}:00`).toISOString()
      : eventForm.date ? new Date(`${eventForm.date}T09:00:00`).toISOString() : null;
    await create('event', eventForm, remindAt);
    setEventForm({ child: '', title: '', date: '', time: '', notes: '' });
    setEventModal(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {alert && (
        <View style={styles.alertBanner}>
          <LinearGradient colors={['#9B72FF', '#7C5CE8']} style={styles.alertGrad}>
            <Text style={styles.alertEmoji}>👶</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>🔔 {alert.type} Reminder</Text>
              <Text style={styles.alertBody} numberOfLines={1}>{alert.title}</Text>
            </View>
            <TouchableOpacity onPress={() => setAlert(null)} style={{ padding: 4 }}>
              <Feather name="x" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </LinearGradient>
        </View>
      )}

      <View style={[styles.header, { paddingHorizontal: pad }]}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#14171F" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Children & Activities</Text>
          <Text style={styles.headerSub}>School, classes & events</Text>
        </View>
        <View style={styles.headerBadge}><Text style={{ fontSize: 22 }}>👶</Text></View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#9B72FF" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
          {saving && <SavingBar />}

          {items.length > 0 && (
            <View style={styles.memoryBadge}>
              <Feather name="cpu" size={12} color="#9B72FF" />
              <Text style={styles.memoryText}>Mneva AI has memorized {items.length} item{items.length !== 1 ? 's' : ''} for your children</Text>
            </View>
          )}

          <SectionHeader label="CHILDREN" color="#9B72FF" bg="#F3EFFE" onAdd={() => setChildModal(true)} />
          <View style={styles.card}>
            {children.length === 0 ? <EmptyRow icon="user" text="No children added" /> : children.map((c, i) => (
              <View key={c.id} style={[styles.listRow, i < children.length - 1 && styles.divider]}>
                <View style={[styles.rowIcon, { backgroundColor: '#F3EFFE' }]}><Feather name="user" size={14} color="#9B72FF" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{c.data.name}{c.data.age ? `, ${c.data.age} yrs` : ''}</Text>
                  <Text style={styles.rowMeta}>{[c.data.school, c.data.grade ? `Grade ${c.data.grade}` : null].filter(Boolean).join(' · ')}</Text>
                </View>
                <TouchableOpacity onPress={() => remove(c.id)} style={{ padding: 4 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
              </View>
            ))}
          </View>

          <SectionHeader label="CLASSES & ACTIVITIES" color="#4FA6E8" bg="#EAF3FD" onAdd={() => setActModal(true)} />
          <View style={styles.card}>
            {activities.length === 0 ? <EmptyRow icon="zap" text="No activities added" /> : activities.map((a, i) => (
              <View key={a.id} style={[styles.listRow, i < activities.length - 1 && styles.divider]}>
                <View style={[styles.rowIcon, { backgroundColor: '#EAF3FD' }]}><Feather name="zap" size={14} color="#4FA6E8" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{a.data.name}</Text>
                  <Text style={styles.rowMeta}>{[a.data.type, a.data.day, a.data.time, a.data.child].filter(Boolean).join(' · ')}</Text>
                </View>
                <TouchableOpacity onPress={() => remove(a.id)} style={{ padding: 4 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
              </View>
            ))}
          </View>

          <SectionHeader label="SCHOOL EVENTS" color="#1F9A5A" bg="#EFFDF6" onAdd={() => setEventModal(true)} />
          <View style={styles.card}>
            {events.length === 0 ? <EmptyRow icon="calendar" text="No events added" /> : events.map((e, i) => (
              <View key={e.id} style={[styles.listRow, i < events.length - 1 && styles.divider]}>
                <View style={[styles.rowIcon, { backgroundColor: '#EFFDF6' }]}><Feather name="calendar" size={14} color="#1F9A5A" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{e.data.title}</Text>
                  <Text style={styles.rowMeta}>{[e.data.child, e.data.date, e.data.time].filter(Boolean).join(' · ')}</Text>
                </View>
                {e.remindAt && <View style={styles.remindTag}><Feather name="bell" size={10} color="#9B72FF" /><Text style={styles.remindTagText}>Reminder set</Text></View>}
                <TouchableOpacity onPress={() => remove(e.id)} style={{ padding: 4 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Child Modal */}
      <SheetModal visible={childModal} onClose={() => setChildModal(false)} insets={insets} title="Add Child" gradColors={['#9B72FF', '#7C5CE8']} icon="user">
        <FLabel>Name *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Arjun" placeholderTextColor="#9AA1AE" value={childForm.name} onChangeText={v => setChildForm(f => ({ ...f, name: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><FLabel>Age</FLabel><TextInput style={styles.input} placeholder="e.g. 8" placeholderTextColor="#9AA1AE" value={childForm.age} onChangeText={v => setChildForm(f => ({ ...f, age: v }))} keyboardType="numeric" /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><FLabel>Grade</FLabel><TextInput style={styles.input} placeholder="e.g. 3rd" placeholderTextColor="#9AA1AE" value={childForm.grade} onChangeText={v => setChildForm(f => ({ ...f, grade: v }))} /></View>
        </View>
        <FLabel>School</FLabel>
        <TextInput style={styles.input} placeholder="School name" placeholderTextColor="#9AA1AE" value={childForm.school} onChangeText={v => setChildForm(f => ({ ...f, school: v }))} />
        <SaveBtn onPress={saveChild} disabled={!childForm.name.trim()} colors={['#9B72FF', '#7C5CE8']} label="Add Child" />
      </SheetModal>

      {/* Activity Modal */}
      <SheetModal visible={actModal} onClose={() => setActModal(false)} insets={insets} title="Add Activity" gradColors={['#4FA6E8', '#2E86C8']} icon="zap">
        <FLabel>Activity Type *</FLabel>
        <View style={styles.chipRow}>
          {ACTIVITY_TYPES.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, actForm.type === t && styles.chipActive]} onPress={() => setActForm(f => ({ ...f, type: t }))}>
              <Text style={[styles.chipText, actForm.type === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <FLabel>Activity Name *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Cricket coaching" placeholderTextColor="#9AA1AE" value={actForm.name} onChangeText={v => setActForm(f => ({ ...f, name: v }))} />
        <FLabel>For Child</FLabel>
        <TextInput style={styles.input} placeholder="Child's name" placeholderTextColor="#9AA1AE" value={actForm.child} onChangeText={v => setActForm(f => ({ ...f, child: v }))} />
        <FLabel>Day</FLabel>
        <View style={styles.chipRow}>
          {DAYS.map(d => (
            <TouchableOpacity key={d} style={[styles.chip, actForm.day === d && styles.chipActive]} onPress={() => setActForm(f => ({ ...f, day: d }))}>
              <Text style={[styles.chipText, actForm.day === d && styles.chipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><FLabel>Time</FLabel><TextInput style={styles.input} placeholder="e.g. 5 PM" placeholderTextColor="#9AA1AE" value={actForm.time} onChangeText={v => setActForm(f => ({ ...f, time: v }))} /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><FLabel>Venue</FLabel><TextInput style={styles.input} placeholder="e.g. Sports ground" placeholderTextColor="#9AA1AE" value={actForm.venue} onChangeText={v => setActForm(f => ({ ...f, venue: v }))} /></View>
        </View>
        <SaveBtn onPress={saveActivity} disabled={!actForm.name.trim() || !actForm.type} colors={['#4FA6E8', '#2E86C8']} label="Save Activity" />
      </SheetModal>

      {/* Event Modal */}
      <SheetModal visible={eventModal} onClose={() => setEventModal(false)} insets={insets} title="Add School Event" gradColors={['#1F9A5A', '#3CB37A']} icon="calendar">
        <FLabel>Event Title *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Annual Day, PTM" placeholderTextColor="#9AA1AE" value={eventForm.title} onChangeText={v => setEventForm(f => ({ ...f, title: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><FLabel>Child</FLabel><TextInput style={styles.input} placeholder="Child's name" placeholderTextColor="#9AA1AE" value={eventForm.child} onChangeText={v => setEventForm(f => ({ ...f, child: v }))} /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><FLabel>Date (YYYY-MM-DD)</FLabel><TextInput style={styles.input} placeholder="2025-08-15" placeholderTextColor="#9AA1AE" value={eventForm.date} onChangeText={v => setEventForm(f => ({ ...f, date: v }))} keyboardType="numeric" /></View>
        </View>
        <FLabel>Time (HH:MM) — for reminder</FLabel>
        <TextInput style={styles.input} placeholder="09:00" placeholderTextColor="#9AA1AE" value={eventForm.time} onChangeText={v => setEventForm(f => ({ ...f, time: v }))} keyboardType="numeric" />
        <FLabel>Notes</FLabel>
        <TextInput style={styles.input} placeholder="Any notes..." placeholderTextColor="#9AA1AE" value={eventForm.notes} onChangeText={v => setEventForm(f => ({ ...f, notes: v }))} />
        <SaveBtn onPress={saveEvent} disabled={!eventForm.title.trim()} colors={['#1F9A5A', '#3CB37A']} label="Save Event" />
      </SheetModal>
    </SafeAreaView>
  );
}

function SavingBar() {
  return (
    <View style={styles.savingBar}>
      <ActivityIndicator size="small" color="#9B72FF" />
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
  headerBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F3EFFE', alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  savingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3EFFE', borderRadius: 10, padding: 10, marginBottom: 12 },
  savingText: { fontSize: 12, color: '#7C3AED', fontWeight: '600' },
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
  remindTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F3EFFE', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 },
  remindTagText: { fontSize: 10, fontWeight: '700', color: '#9B72FF' },
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
