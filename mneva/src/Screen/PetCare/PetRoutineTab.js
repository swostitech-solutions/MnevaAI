import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const REMINDER_TYPES = ['Vaccination', 'Medication', 'Grooming', 'Vet Appointment', 'Feeding'];
const GROOM_TYPES = ['Bath', 'Hair Trimming', 'Nail Trimming', 'Dental Care', 'Ear Cleaning'];
const EXERCISE_TYPES = ['Walk', 'Exercise', 'Playtime'];
const FREQ_OPTIONS = ['Daily', 'Every 2 days', 'Weekly', 'Bi-weekly', 'Monthly'];

export default function PetRoutineTab({ pet, horizontalPad, insets }) {
  // Feeding
  const [feeding, setFeeding] = useState(null);
  const [feedModal, setFeedModal] = useState(false);
  const [foodName, setFoodName] = useState('');
  const [feedQty, setFeedQty] = useState('');
  const [feedTimes, setFeedTimes] = useState('');
  const [feedSchedule, setFeedSchedule] = useState('');
  const [treats, setTreats] = useState('');
  const [dietRestrictions, setDietRestrictions] = useState('');

  // Grooming
  const [groomings, setGroomings] = useState([]);
  const [groomModal, setGroomModal] = useState(false);
  const [groomType, setGroomType] = useState('');
  const [groomFreq, setGroomFreq] = useState('');
  const [groomLastDate, setGroomLastDate] = useState('');
  const [groomNextDate, setGroomNextDate] = useState('');
  const [groomNotes, setGroomNotes] = useState('');

  // Exercise
  const [exercises, setExercises] = useState([]);
  const [exerciseModal, setExerciseModal] = useState(false);
  const [exType, setExType] = useState('');
  const [exDuration, setExDuration] = useState('');
  const [exFreq, setExFreq] = useState('');
  const [exTime, setExTime] = useState('');
  const [exNotes, setExNotes] = useState('');

  // Reminders
  const [reminders, setReminders] = useState([]);
  const [reminderModal, setReminderModal] = useState(false);
  const [remType, setRemType] = useState('');
  const [remTitle, setRemTitle] = useState('');
  const [remDate, setRemDate] = useState('');
  const [remNotes, setRemNotes] = useState('');

  const saveFeeding = () => {
    if (!foodName.trim()) return;
    setFeeding({ foodName: foodName.trim(), qty: feedQty.trim(), times: feedTimes.trim(), schedule: feedSchedule.trim(), treats: treats.trim(), dietRestrictions: dietRestrictions.trim() });
    setFeedModal(false);
  };

  const openEditFeed = () => {
    if (feeding) { setFoodName(feeding.foodName); setFeedQty(feeding.qty); setFeedTimes(feeding.times); setFeedSchedule(feeding.schedule); setTreats(feeding.treats); setDietRestrictions(feeding.dietRestrictions); }
    setFeedModal(true);
  };

  const saveGroom = () => {
    if (!groomType) return;
    setGroomings(p => [{ id: Date.now().toString(), type: groomType, freq: groomFreq, lastDate: groomLastDate.trim(), nextDate: groomNextDate.trim(), notes: groomNotes.trim() }, ...p]);
    setGroomType(''); setGroomFreq(''); setGroomLastDate(''); setGroomNextDate(''); setGroomNotes('');
    setGroomModal(false);
  };

  const saveExercise = () => {
    if (!exType) return;
    setExercises(p => [{ id: Date.now().toString(), type: exType, duration: exDuration.trim(), freq: exFreq, time: exTime.trim(), notes: exNotes.trim() }, ...p]);
    setExType(''); setExDuration(''); setExFreq(''); setExTime(''); setExNotes('');
    setExerciseModal(false);
  };

  const saveReminder = () => {
    if (!remTitle.trim() || !remType) return;
    setReminders(p => [{ id: Date.now().toString(), type: remType, title: remTitle.trim(), date: remDate.trim(), notes: remNotes.trim(), done: false }, ...p]);
    setRemType(''); setRemTitle(''); setRemDate(''); setRemNotes('');
    setReminderModal(false);
  };

  const toggleReminder = (id) => setReminders(p => p.map(r => r.id === id ? { ...r, done: !r.done } : r));

  const NoPetBanner = () => (
    <View style={styles.noPetBanner}>
      <Feather name="info" size={14} color="#9AA1AE" />
      <Text style={styles.noPetText}>Add a pet profile first to set up routines</Text>
    </View>
  );

  return (
    <>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: horizontalPad, paddingBottom: insets.bottom + 32, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {!pet && <NoPetBanner />}

        {/* Feeding */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>NUTRITION & FEEDING</Text>
          <TouchableOpacity style={[styles.sectionAddBtn, { backgroundColor: '#EFFDF6' }]} onPress={openEditFeed}>
            <Feather name={feeding ? 'edit-2' : 'plus'} size={14} color="#1F9A5A" />
            <Text style={[styles.sectionAddText, { color: '#1F9A5A' }]}>{feeding ? 'Edit' : 'Add'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {!feeding ? (
            <EmptyRow icon="coffee" text="No feeding schedule added" />
          ) : (
            [
              { label: 'Food', value: feeding.foodName, icon: 'coffee' },
              { label: 'Quantity', value: feeding.qty, icon: 'bar-chart-2' },
              { label: 'Times per day', value: feeding.times, icon: 'clock' },
              { label: 'Schedule', value: feeding.schedule, icon: 'calendar' },
              { label: 'Treats', value: feeding.treats, icon: 'star' },
              { label: 'Dietary Restrictions', value: feeding.dietRestrictions, icon: 'alert-circle' },
            ].filter(r => r.value).map((row, i, arr) => (
              <View key={i} style={[styles.listRow, i < arr.length - 1 && styles.listRowDivider]}>
                <View style={[styles.rowIcon, { backgroundColor: '#EFFDF6' }]}>
                  <Feather name={row.icon} size={13} color="#1F9A5A" />
                </View>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))
          )}
        </View>

        {/* Grooming */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>GROOMING</Text>
          <TouchableOpacity style={[styles.sectionAddBtn, { backgroundColor: '#F3EFFE' }]} onPress={() => setGroomModal(true)}>
            <Feather name="plus" size={14} color="#9B72FF" />
            <Text style={[styles.sectionAddText, { color: '#9B72FF' }]}>Add</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {groomings.length === 0 ? (
            <EmptyRow icon="scissors" text="No grooming schedule added" />
          ) : groomings.map((g, i) => (
            <View key={g.id} style={[styles.listRow, i < groomings.length - 1 && styles.listRowDivider]}>
              <View style={[styles.rowIcon, { backgroundColor: '#F3EFFE' }]}>
                <Feather name="scissors" size={14} color="#9B72FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{g.type}</Text>
                <Text style={styles.rowMeta}>{[g.freq, g.nextDate ? `Next: ${g.nextDate}` : null].filter(Boolean).join(' · ')}</Text>
              </View>
              <TouchableOpacity onPress={() => setGroomings(p => p.filter(x => x.id !== g.id))} style={{ padding: 4 }}>
                <Feather name="x" size={14} color="#9AA1AE" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Exercise */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>ACTIVITY & EXERCISE</Text>
          <TouchableOpacity style={[styles.sectionAddBtn, { backgroundColor: '#EAF3FD' }]} onPress={() => setExerciseModal(true)}>
            <Feather name="plus" size={14} color="#4FA6E8" />
            <Text style={[styles.sectionAddText, { color: '#4FA6E8' }]}>Add</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {exercises.length === 0 ? (
            <EmptyRow icon="zap" text="No activity schedule added" />
          ) : exercises.map((e, i) => (
            <View key={e.id} style={[styles.listRow, i < exercises.length - 1 && styles.listRowDivider]}>
              <View style={[styles.rowIcon, { backgroundColor: '#EAF3FD' }]}>
                <Feather name="zap" size={14} color="#4FA6E8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{e.type}</Text>
                <Text style={styles.rowMeta}>{[e.duration, e.freq, e.time].filter(Boolean).join(' · ')}</Text>
              </View>
              <TouchableOpacity onPress={() => setExercises(p => p.filter(x => x.id !== e.id))} style={{ padding: 4 }}>
                <Feather name="x" size={14} color="#9AA1AE" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Reminders */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>REMINDERS</Text>
          <TouchableOpacity style={[styles.sectionAddBtn, { backgroundColor: '#FCEAED' }]} onPress={() => setReminderModal(true)}>
            <Feather name="plus" size={14} color="#E0546E" />
            <Text style={[styles.sectionAddText, { color: '#E0546E' }]}>Add</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {reminders.length === 0 ? (
            <EmptyRow icon="bell" text="No reminders set" />
          ) : reminders.map((r, i) => (
            <View key={r.id} style={[styles.listRow, i < reminders.length - 1 && styles.listRowDivider]}>
              <TouchableOpacity onPress={() => toggleReminder(r.id)} style={[styles.rowIcon, { backgroundColor: r.done ? '#EFFDF6' : '#FCEAED' }]}>
                <Feather name={r.done ? 'check-circle' : 'bell'} size={14} color={r.done ? '#1F9A5A' : '#E0546E'} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, r.done && { textDecorationLine: 'line-through', color: '#9AA1AE' }]}>{r.title}</Text>
                <Text style={styles.rowMeta}>{[r.type, r.date].filter(Boolean).join(' · ')}</Text>
              </View>
              <TouchableOpacity onPress={() => setReminders(p => p.filter(x => x.id !== r.id))} style={{ padding: 4 }}>
                <Feather name="x" size={14} color="#9AA1AE" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Feeding Modal */}
      <SheetModal visible={feedModal} onClose={() => setFeedModal(false)} insets={insets}
        title="Nutrition & Feeding" subtitle="Food schedule & diet details" gradColors={['#1F9A5A', '#3CB37A']} icon="coffee">
        <Text style={styles.fieldLabel}>Food Name / Brand <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Royal Canin, Pedigree" placeholderTextColor="#9AA1AE" value={foodName} onChangeText={setFoodName} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Quantity per meal</Text>
            <TextInput style={styles.input} placeholder="e.g. 200g, 1 cup" placeholderTextColor="#9AA1AE" value={feedQty} onChangeText={setFeedQty} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Times per day</Text>
            <TextInput style={styles.input} placeholder="e.g. 2 times" placeholderTextColor="#9AA1AE" value={feedTimes} onChangeText={setFeedTimes} keyboardType="numeric" />
          </View>
        </View>
        <Text style={styles.fieldLabel}>Feeding Schedule</Text>
        <TextInput style={styles.input} placeholder="e.g. 8 AM and 7 PM" placeholderTextColor="#9AA1AE" value={feedSchedule} onChangeText={setFeedSchedule} />
        <Text style={styles.fieldLabel}>Treats</Text>
        <TextInput style={styles.input} placeholder="e.g. Milk bone, 2 per day" placeholderTextColor="#9AA1AE" value={treats} onChangeText={setTreats} />
        <Text style={styles.fieldLabel}>Dietary Restrictions</Text>
        <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="e.g. No chicken, grain-free only..." placeholderTextColor="#9AA1AE" value={dietRestrictions} onChangeText={setDietRestrictions} multiline />
        <SaveBtn onPress={saveFeeding} disabled={!foodName.trim()} colors={['#1F9A5A', '#3CB37A']} label="Save Feeding Schedule" />
      </SheetModal>

      {/* Grooming Modal */}
      <SheetModal visible={groomModal} onClose={() => setGroomModal(false)} insets={insets}
        title="Add Grooming" subtitle="Schedule grooming sessions" gradColors={['#9B72FF', '#7C5CE8']} icon="scissors">
        <Text style={styles.fieldLabel}>Grooming Type <Text style={styles.req}>*</Text></Text>
        <View style={styles.chipRow}>
          {GROOM_TYPES.map(g => (
            <TouchableOpacity key={g} style={[styles.chip, groomType === g && styles.chipActive]} onPress={() => setGroomType(g)}>
              <Text style={[styles.chipText, groomType === g && styles.chipTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Frequency</Text>
        <View style={styles.chipRow}>
          {FREQ_OPTIONS.map(f => (
            <TouchableOpacity key={f} style={[styles.chip, groomFreq === f && styles.chipActive]} onPress={() => setGroomFreq(f)}>
              <Text style={[styles.chipText, groomFreq === f && styles.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Last Done</Text>
            <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={groomLastDate} onChangeText={setGroomLastDate} keyboardType="numeric" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Next Due</Text>
            <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={groomNextDate} onChangeText={setGroomNextDate} keyboardType="numeric" />
          </View>
        </View>
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput style={styles.input} placeholder="Any notes..." placeholderTextColor="#9AA1AE" value={groomNotes} onChangeText={setGroomNotes} />
        <SaveBtn onPress={saveGroom} disabled={!groomType} colors={['#9B72FF', '#7C5CE8']} label="Save Grooming" />
      </SheetModal>

      {/* Exercise Modal */}
      <SheetModal visible={exerciseModal} onClose={() => setExerciseModal(false)} insets={insets}
        title="Add Activity" subtitle="Walks, exercise & playtime" gradColors={['#4FA6E8', '#2E86C8']} icon="zap">
        <Text style={styles.fieldLabel}>Activity Type <Text style={styles.req}>*</Text></Text>
        <View style={styles.chipRow}>
          {EXERCISE_TYPES.map(e => (
            <TouchableOpacity key={e} style={[styles.chip, exType === e && styles.chipActive]} onPress={() => setExType(e)}>
              <Text style={[styles.chipText, exType === e && styles.chipTextActive]}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Duration</Text>
            <TextInput style={styles.input} placeholder="e.g. 30 mins" placeholderTextColor="#9AA1AE" value={exDuration} onChangeText={setExDuration} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Time of day</Text>
            <TextInput style={styles.input} placeholder="e.g. 7 AM" placeholderTextColor="#9AA1AE" value={exTime} onChangeText={setExTime} />
          </View>
        </View>
        <Text style={styles.fieldLabel}>Frequency</Text>
        <View style={styles.chipRow}>
          {FREQ_OPTIONS.map(f => (
            <TouchableOpacity key={f} style={[styles.chip, exFreq === f && styles.chipActive]} onPress={() => setExFreq(f)}>
              <Text style={[styles.chipText, exFreq === f && styles.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput style={styles.input} placeholder="Any notes..." placeholderTextColor="#9AA1AE" value={exNotes} onChangeText={setExNotes} />
        <SaveBtn onPress={saveExercise} disabled={!exType} colors={['#4FA6E8', '#2E86C8']} label="Save Activity" />
      </SheetModal>

      {/* Reminder Modal */}
      <SheetModal visible={reminderModal} onClose={() => setReminderModal(false)} insets={insets}
        title="Add Reminder" subtitle="Set a pet care reminder" gradColors={['#E0546E', '#C8405A']} icon="bell">
        <Text style={styles.fieldLabel}>Reminder Type <Text style={styles.req}>*</Text></Text>
        <View style={styles.chipRow}>
          {REMINDER_TYPES.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, remType === t && styles.chipActive]} onPress={() => setRemType(t)}>
              <Text style={[styles.chipText, remType === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Title <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Rabies booster due" placeholderTextColor="#9AA1AE" value={remTitle} onChangeText={setRemTitle} />
        <Text style={styles.fieldLabel}>Date</Text>
        <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={remDate} onChangeText={setRemDate} keyboardType="numeric" />
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput style={styles.input} placeholder="Any notes..." placeholderTextColor="#9AA1AE" value={remNotes} onChangeText={setRemNotes} />
        <SaveBtn onPress={saveReminder} disabled={!remTitle.trim() || !remType} colors={['#E0546E', '#C8405A']} label="Save Reminder" />
      </SheetModal>
    </>
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

function SheetModal({ visible, onClose, insets, title, subtitle, gradColors, icon, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <LinearGradient colors={gradColors} style={styles.sheetIcon}>
              <Feather name={icon} size={20} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Text style={styles.sheetSubtitle}>{subtitle}</Text>
            </View>
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
  noPetBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F6F8', borderRadius: 12, padding: 12, marginBottom: 16 },
  noPetText: { fontSize: 13, color: '#9AA1AE', fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5 },
  sectionAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  sectionAddText: { fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, marginBottom: 20 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  listRowDivider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  rowMeta: { fontSize: 12, color: '#9AA1AE' },
  rowLabel: { flex: 1, fontSize: 13, color: '#6B7280', fontWeight: '600' },
  rowValue: { fontSize: 13, fontWeight: '700', color: '#14171F', maxWidth: '55%', textAlign: 'right' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  emptyRowText: { fontSize: 13, color: '#9AA1AE', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(14,17,26,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E5EA', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  sheetSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 2 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  req: { color: '#E0546E' },
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
