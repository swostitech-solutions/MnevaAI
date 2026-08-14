import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch } from '../../api/client';
import { usePet } from './PetContext';
import { useSocket } from '../../services/socket';

const REMINDER_TYPES = ['Vaccination', 'Medication', 'Grooming', 'Vet Appointment', 'Feeding'];
const GROOM_TYPES    = ['Bath', 'Hair Trimming', 'Nail Trimming', 'Dental Care', 'Ear Cleaning'];
const EXERCISE_TYPES = ['Walk', 'Exercise', 'Playtime'];
const FREQ_OPTIONS   = ['Daily', 'Every 2 days', 'Weekly', 'Bi-weekly', 'Monthly'];

export default function PetRoutineTab({ horizontalPad, insets }) {
  const { activePet, reload } = usePet();
  const { on } = useSocket();
  const [saving, setSaving] = useState(false);

  // Feeding modal
  const [feedModal, setFeedModal]   = useState(false);
  const [feedForm, setFeedForm]     = useState({ foodName: '', qty: '', times: '', schedule: '', treats: '', dietRestrictions: '' });

  // Grooming modal
  const [groomModal, setGroomModal] = useState(false);
  const [groomForm, setGroomForm]   = useState({ type: '', freq: '', lastDate: '', nextDate: '', notes: '' });

  // Exercise modal
  const [exModal, setExModal]       = useState(false);
  const [exForm, setExForm]         = useState({ type: '', duration: '', freq: '', time: '', notes: '' });

  // Reminders
  const [reminders, setReminders]   = useState([]);
  const [remLoading, setRemLoading] = useState(false);
  const [remModal, setRemModal]     = useState(false);
  const [remForm, setRemForm]       = useState({ type: '', title: '', date: '', time: '', notes: '' });

  // ── patch pet JSON fields ──────────────────────────────────────────────────
  const patch = async (field, value) => {
    if (!activePet) return;
    setSaving(true);
    try {
      await apiFetch(`/api/pet/${activePet.id}`, { method: 'PATCH', body: { [field]: value } });
      reload();
    } catch { /* socket will update */ }
    finally { setSaving(false); }
  };

  // ── load reminders ─────────────────────────────────────────────────────────
  const loadReminders = useCallback(async () => {
    if (!activePet) return;
    setRemLoading(true);
    try {
      const res = await apiFetch(`/api/pet/${activePet.id}/reminders`);
      setReminders(res.reminders || []);
    } catch { /* silent */ }
    finally { setRemLoading(false); }
  }, [activePet?.id]);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  // ── socket: real-time reminder events ──────────────────────────────────────
  useEffect(() => {
    const offCreated = on('pet:reminder:created', (r) => {
      if (r.petId !== activePet?.id) return;
      setReminders(prev => prev.find(x => x.id === r.id) ? prev : [r, ...prev]);
    });
    const offUpdated = on('pet:reminder:updated', (r) => {
      setReminders(prev => prev.map(x => x.id === r.id ? r : x));
    });
    const offDeleted = on('pet:reminder:deleted', ({ id }) => {
      setReminders(prev => prev.filter(x => x.id !== id));
    });
    return () => { offCreated?.(); offUpdated?.(); offDeleted?.(); };
  }, [on, activePet?.id]);

  // ── save handlers ──────────────────────────────────────────────────────────
  const saveFeeding = async () => {
    if (!feedForm.foodName.trim()) return;
    await patch('feeding', feedForm);
    setFeedModal(false);
  };

  const openEditFeed = () => {
    const f = activePet?.feeding;
    if (f) setFeedForm({ foodName: f.foodName || '', qty: f.qty || '', times: f.times || '', schedule: f.schedule || '', treats: f.treats || '', dietRestrictions: f.dietRestrictions || '' });
    setFeedModal(true);
  };

  const saveGroom = async () => {
    if (!groomForm.type) return;
    const existing = activePet?.groomings || [];
    await patch('groomings', [{ id: Date.now().toString(), ...groomForm }, ...existing]);
    setGroomForm({ type: '', freq: '', lastDate: '', nextDate: '', notes: '' });
    setGroomModal(false);
  };

  const saveExercise = async () => {
    if (!exForm.type) return;
    const existing = activePet?.exercises || [];
    await patch('exercises', [{ id: Date.now().toString(), ...exForm }, ...existing]);
    setExForm({ type: '', duration: '', freq: '', time: '', notes: '' });
    setExModal(false);
  };

  const saveReminder = async () => {
    if (!remForm.title.trim() || !remForm.type || !activePet) return;
    let remindAt = null;
    if (remForm.date && remForm.time) {
      remindAt = new Date(`${remForm.date}T${remForm.time}:00`).toISOString();
    } else if (remForm.date) {
      remindAt = new Date(`${remForm.date}T09:00:00`).toISOString();
    }
    setSaving(true);
    try {
      await apiFetch(`/api/pet/${activePet.id}/reminders`, {
        method: 'POST',
        body: { type: remForm.type, title: remForm.title.trim(), remindAt, notes: remForm.notes.trim() || null },
      });
      setRemForm({ type: '', title: '', date: '', time: '', notes: '' });
      setRemModal(false);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const toggleReminder = async (r) => {
    if (!activePet) return;
    try {
      await apiFetch(`/api/pet/${activePet.id}/reminders/${r.id}`, { method: 'PATCH', body: { done: !r.done } });
    } catch { /* socket updates */ }
  };

  const deleteReminder = async (r) => {
    if (!activePet) return;
    try {
      await apiFetch(`/api/pet/${activePet.id}/reminders/${r.id}`, { method: 'DELETE' });
    } catch { /* socket updates */ }
  };

  const feeding   = activePet?.feeding    || null;
  const groomings = activePet?.groomings  || [];
  const exercises = activePet?.exercises  || [];

  return (
    <>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: horizontalPad, paddingBottom: insets.bottom + 32, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {!activePet && (
          <View style={styles.noPetBanner}>
            <Feather name="info" size={14} color="#9AA1AE" />
            <Text style={styles.noPetText}>Add a pet profile first to set up routines</Text>
          </View>
        )}
        {saving && (
          <View style={styles.savingBar}>
            <ActivityIndicator size="small" color="#F5A623" />
            <Text style={styles.savingText}>Saving & updating Mneva AI memory...</Text>
          </View>
        )}

        {/* ── Feeding ── */}
        <SectionHeader label="NUTRITION & FEEDING" color="#1F9A5A" bg="#EFFDF6"
          onAdd={openEditFeed} addLabel={feeding ? 'Edit' : 'Add'} addIcon={feeding ? 'edit-2' : 'plus'} />
        <View style={styles.card}>
          {!feeding ? <EmptyRow icon="coffee" text="No feeding schedule added" /> : (
            [
              { label: 'Food', value: feeding.foodName, icon: 'coffee' },
              { label: 'Quantity', value: feeding.qty, icon: 'bar-chart-2' },
              { label: 'Times/day', value: feeding.times, icon: 'clock' },
              { label: 'Schedule', value: feeding.schedule, icon: 'calendar' },
              { label: 'Treats', value: feeding.treats, icon: 'star' },
              { label: 'Diet Restrictions', value: feeding.dietRestrictions, icon: 'alert-circle' },
            ].filter(r => r.value).map((row, i, arr) => (
              <View key={i} style={[styles.listRow, i < arr.length - 1 && styles.divider]}>
                <View style={[styles.rowIcon, { backgroundColor: '#EFFDF6' }]}><Feather name={row.icon} size={13} color="#1F9A5A" /></View>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))
          )}
        </View>

        {/* ── Grooming ── */}
        <SectionHeader label="GROOMING" color="#9B72FF" bg="#F3EFFE" onAdd={() => setGroomModal(true)} />
        <View style={styles.card}>
          {groomings.length === 0 ? <EmptyRow icon="scissors" text="No grooming schedule added" /> : groomings.map((g, i) => (
            <View key={g.id} style={[styles.listRow, i < groomings.length - 1 && styles.divider]}>
              <View style={[styles.rowIcon, { backgroundColor: '#F3EFFE' }]}><Feather name="scissors" size={14} color="#9B72FF" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{g.type}</Text>
                <Text style={styles.rowMeta}>{[g.freq, g.nextDate ? `Next: ${g.nextDate}` : null].filter(Boolean).join(' · ')}</Text>
              </View>
              <TouchableOpacity onPress={() => patch('groomings', groomings.filter(x => x.id !== g.id))} style={{ padding: 4 }}>
                <Feather name="x" size={14} color="#9AA1AE" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* ── Exercise ── */}
        <SectionHeader label="ACTIVITY & EXERCISE" color="#4FA6E8" bg="#EAF3FD" onAdd={() => setExModal(true)} />
        <View style={styles.card}>
          {exercises.length === 0 ? <EmptyRow icon="zap" text="No activity schedule added" /> : exercises.map((e, i) => (
            <View key={e.id} style={[styles.listRow, i < exercises.length - 1 && styles.divider]}>
              <View style={[styles.rowIcon, { backgroundColor: '#EAF3FD' }]}><Feather name="zap" size={14} color="#4FA6E8" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{e.type}</Text>
                <Text style={styles.rowMeta}>{[e.duration, e.freq, e.time].filter(Boolean).join(' · ')}</Text>
              </View>
              <TouchableOpacity onPress={() => patch('exercises', exercises.filter(x => x.id !== e.id))} style={{ padding: 4 }}>
                <Feather name="x" size={14} color="#9AA1AE" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* ── Reminders ── */}
        <SectionHeader label="REMINDERS" color="#E0546E" bg="#FCEAED" onAdd={() => setRemModal(true)} />
        <View style={styles.card}>
          {remLoading ? (
            <View style={styles.emptyRow}><ActivityIndicator size="small" color="#F5A623" /></View>
          ) : reminders.length === 0 ? <EmptyRow icon="bell" text="No reminders set" /> : reminders.map((r, i) => (
            <View key={r.id} style={[styles.listRow, i < reminders.length - 1 && styles.divider]}>
              <TouchableOpacity onPress={() => toggleReminder(r)} style={[styles.rowIcon, { backgroundColor: r.done ? '#EFFDF6' : '#FCEAED' }]}>
                <Feather name={r.done ? 'check-circle' : 'bell'} size={14} color={r.done ? '#1F9A5A' : '#E0546E'} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, r.done && { textDecorationLine: 'line-through', color: '#9AA1AE' }]}>{r.title}</Text>
                <Text style={styles.rowMeta}>{[r.type, r.remindAt ? new Date(r.remindAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null].filter(Boolean).join(' · ')}</Text>
              </View>
              <TouchableOpacity onPress={() => deleteReminder(r)} style={{ padding: 4 }}>
                <Feather name="x" size={14} color="#9AA1AE" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ── Feeding Modal ── */}
      <SheetModal visible={feedModal} onClose={() => setFeedModal(false)} insets={insets}
        title="Nutrition & Feeding" gradColors={['#1F9A5A', '#3CB37A']} icon="coffee">
        <Text style={styles.fieldLabel}>Food Name / Brand <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Royal Canin" placeholderTextColor="#9AA1AE"
          value={feedForm.foodName} onChangeText={v => setFeedForm(f => ({ ...f, foodName: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Quantity per meal</Text>
            <TextInput style={styles.input} placeholder="e.g. 200g" placeholderTextColor="#9AA1AE"
              value={feedForm.qty} onChangeText={v => setFeedForm(f => ({ ...f, qty: v }))} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Times per day</Text>
            <TextInput style={styles.input} placeholder="e.g. 2" placeholderTextColor="#9AA1AE"
              value={feedForm.times} onChangeText={v => setFeedForm(f => ({ ...f, times: v }))} keyboardType="numeric" />
          </View>
        </View>
        <Text style={styles.fieldLabel}>Feeding Schedule</Text>
        <TextInput style={styles.input} placeholder="e.g. 8 AM and 7 PM" placeholderTextColor="#9AA1AE"
          value={feedForm.schedule} onChangeText={v => setFeedForm(f => ({ ...f, schedule: v }))} />
        <Text style={styles.fieldLabel}>Treats</Text>
        <TextInput style={styles.input} placeholder="e.g. Milk bone, 2/day" placeholderTextColor="#9AA1AE"
          value={feedForm.treats} onChangeText={v => setFeedForm(f => ({ ...f, treats: v }))} />
        <Text style={styles.fieldLabel}>Dietary Restrictions</Text>
        <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} placeholder="e.g. No chicken, grain-free..."
          placeholderTextColor="#9AA1AE" value={feedForm.dietRestrictions}
          onChangeText={v => setFeedForm(f => ({ ...f, dietRestrictions: v }))} multiline />
        <SaveBtn onPress={saveFeeding} disabled={!feedForm.foodName.trim()} colors={['#1F9A5A', '#3CB37A']} label="Save Feeding Schedule" />
      </SheetModal>

      {/* ── Grooming Modal ── */}
      <SheetModal visible={groomModal} onClose={() => setGroomModal(false)} insets={insets}
        title="Add Grooming" gradColors={['#9B72FF', '#7C5CE8']} icon="scissors">
        <Text style={styles.fieldLabel}>Grooming Type <Text style={styles.req}>*</Text></Text>
        <View style={styles.chipRow}>
          {GROOM_TYPES.map(g => (
            <TouchableOpacity key={g} style={[styles.chip, groomForm.type === g && styles.chipActive]} onPress={() => setGroomForm(f => ({ ...f, type: g }))}>
              <Text style={[styles.chipText, groomForm.type === g && styles.chipTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Frequency</Text>
        <View style={styles.chipRow}>
          {FREQ_OPTIONS.map(fr => (
            <TouchableOpacity key={fr} style={[styles.chip, groomForm.freq === fr && styles.chipActive]} onPress={() => setGroomForm(f => ({ ...f, freq: fr }))}>
              <Text style={[styles.chipText, groomForm.freq === fr && styles.chipTextActive]}>{fr}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Last Done</Text>
            <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE"
              value={groomForm.lastDate} onChangeText={v => setGroomForm(f => ({ ...f, lastDate: v }))} keyboardType="numeric" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Next Due</Text>
            <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE"
              value={groomForm.nextDate} onChangeText={v => setGroomForm(f => ({ ...f, nextDate: v }))} keyboardType="numeric" />
          </View>
        </View>
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput style={styles.input} placeholder="Any notes..." placeholderTextColor="#9AA1AE"
          value={groomForm.notes} onChangeText={v => setGroomForm(f => ({ ...f, notes: v }))} />
        <SaveBtn onPress={saveGroom} disabled={!groomForm.type} colors={['#9B72FF', '#7C5CE8']} label="Save Grooming" />
      </SheetModal>

      {/* ── Exercise Modal ── */}
      <SheetModal visible={exModal} onClose={() => setExModal(false)} insets={insets}
        title="Add Activity" gradColors={['#4FA6E8', '#2E86C8']} icon="zap">
        <Text style={styles.fieldLabel}>Activity Type <Text style={styles.req}>*</Text></Text>
        <View style={styles.chipRow}>
          {EXERCISE_TYPES.map(e => (
            <TouchableOpacity key={e} style={[styles.chip, exForm.type === e && styles.chipActive]} onPress={() => setExForm(f => ({ ...f, type: e }))}>
              <Text style={[styles.chipText, exForm.type === e && styles.chipTextActive]}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Duration</Text>
            <TextInput style={styles.input} placeholder="e.g. 30 mins" placeholderTextColor="#9AA1AE"
              value={exForm.duration} onChangeText={v => setExForm(f => ({ ...f, duration: v }))} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Time of day</Text>
            <TextInput style={styles.input} placeholder="e.g. 7 AM" placeholderTextColor="#9AA1AE"
              value={exForm.time} onChangeText={v => setExForm(f => ({ ...f, time: v }))} />
          </View>
        </View>
        <Text style={styles.fieldLabel}>Frequency</Text>
        <View style={styles.chipRow}>
          {FREQ_OPTIONS.map(fr => (
            <TouchableOpacity key={fr} style={[styles.chip, exForm.freq === fr && styles.chipActive]} onPress={() => setExForm(f => ({ ...f, freq: fr }))}>
              <Text style={[styles.chipText, exForm.freq === fr && styles.chipTextActive]}>{fr}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <SaveBtn onPress={saveExercise} disabled={!exForm.type} colors={['#4FA6E8', '#2E86C8']} label="Save Activity" />
      </SheetModal>

      {/* ── Reminder Modal ── */}
      <SheetModal visible={remModal} onClose={() => setRemModal(false)} insets={insets}
        title="Add Reminder" gradColors={['#E0546E', '#C8405A']} icon="bell">
        <Text style={styles.fieldLabel}>Reminder Type <Text style={styles.req}>*</Text></Text>
        <View style={styles.chipRow}>
          {REMINDER_TYPES.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, remForm.type === t && styles.chipActive]} onPress={() => setRemForm(f => ({ ...f, type: t }))}>
              <Text style={[styles.chipText, remForm.type === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Title <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Rabies booster due" placeholderTextColor="#9AA1AE"
          value={remForm.title} onChangeText={v => setRemForm(f => ({ ...f, title: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} placeholder="2025-08-15" placeholderTextColor="#9AA1AE"
              value={remForm.date} onChangeText={v => setRemForm(f => ({ ...f, date: v }))} keyboardType="numeric" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Time (HH:MM)</Text>
            <TextInput style={styles.input} placeholder="09:00" placeholderTextColor="#9AA1AE"
              value={remForm.time} onChangeText={v => setRemForm(f => ({ ...f, time: v }))} keyboardType="numeric" />
          </View>
        </View>
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput style={styles.input} placeholder="Any notes..." placeholderTextColor="#9AA1AE"
          value={remForm.notes} onChangeText={v => setRemForm(f => ({ ...f, notes: v }))} />
        <SaveBtn onPress={saveReminder} disabled={!remForm.title.trim() || !remForm.type} colors={['#E0546E', '#C8405A']} label="Save Reminder" />
      </SheetModal>
    </>
  );
}

function SectionHeader({ label, color, bg, onAdd, addLabel = 'Add', addIcon = 'plus' }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <TouchableOpacity style={[styles.sectionAddBtn, { backgroundColor: bg }]} onPress={onAdd}>
        <Feather name={addIcon} size={14} color={color} />
        <Text style={[styles.sectionAddText, { color }]}>{addLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyRow({ icon, text }) {
  return (
    <View style={styles.emptyRow}>
      <Feather name={icon} size={18} color="#C7CBD3" />
      <Text style={styles.emptyRowText}>{text}</Text>
    </View>
  );
}

function SheetModal({ visible, onClose, insets, title, gradColors, icon, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <LinearGradient colors={gradColors} style={styles.sheetIcon}>
              <Feather name={icon} size={20} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.sheetTitle}>{title}</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SaveBtn({ onPress, disabled, colors, label }) {
  return (
    <TouchableOpacity style={[styles.saveBtn, disabled && styles.saveBtnDisabled]} disabled={disabled} onPress={onPress}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
        <Feather name="check" size={16} color="#FFFFFF" />
        <Text style={styles.saveBtnText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  noPetBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F6F8', borderRadius: 12, padding: 12, marginBottom: 16 },
  noPetText:      { fontSize: 13, color: '#9AA1AE', fontWeight: '600' },
  savingBar:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3EFFE', borderRadius: 10, padding: 10, marginBottom: 12 },
  savingText:     { fontSize: 12, color: '#7C3AED', fontWeight: '600' },
  sectionHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel:   { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5 },
  sectionAddBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  sectionAddText: { fontSize: 12, fontWeight: '700' },
  card:           { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, marginBottom: 20 },
  listRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  divider:        { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  rowIcon:        { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle:       { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  rowMeta:        { fontSize: 12, color: '#9AA1AE' },
  rowLabel:       { flex: 1, fontSize: 13, color: '#6B7280', fontWeight: '600' },
  rowValue:       { fontSize: 13, fontWeight: '700', color: '#14171F', maxWidth: '55%', textAlign: 'right' },
  emptyRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  emptyRowText:   { fontSize: 13, color: '#9AA1AE', fontWeight: '600' },
  overlay:        { flex: 1, backgroundColor: 'rgba(14,17,26,0.55)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%' },
  sheetHandle:    { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E5EA', marginBottom: 20 },
  sheetHeader:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetIcon:      { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle:     { fontSize: 20, fontWeight: '800', color: '#14171F' },
  fieldLabel:     { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  req:            { color: '#E0546E' },
  input:          { backgroundColor: '#F5F6F8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: '#14171F', marginBottom: 16 },
  rowFields:      { flexDirection: 'row' },
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip:           { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F5F6F8', borderWidth: 1.5, borderColor: 'transparent' },
  chipActive:     { backgroundColor: '#FEF3C7', borderColor: '#F5A623' },
  chipText:       { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#F5A623' },
  saveBtn:        { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled:{ opacity: 0.45 },
  saveBtnGrad:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText:    { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
