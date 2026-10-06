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
import FamilyReminderToggle from '../components/FamilyReminderToggle';
import DateField from './finance/DateField';
import TimeField, { formatTimeDisplay } from './finance/TimeField';

const ACTIVITY_TYPES = ['School', 'Sports', 'Music', 'Dance', 'Art', 'Tuition', 'Other'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// A person's name — letters and spaces only. Stripped as the user types
// (not just checked at submit) so a digit or symbol can never even land in
// the field to begin with.
const sanitizeLettersOnly = (value) => value.replace(/[^A-Za-z\s]/g, '');

// A grade/class value ("3rd", "Grade 5", "LKG", "Std-8") — letters, digits
// and the handful of separators those actually use. Blocks emoji and any
// other symbol without blocking legitimate grade formats.
const sanitizeGrade = (value) => value.replace(/[^A-Za-z0-9\s/-]/g, '');

const EMPTY_CHILD = { name: '', age: '', school: '', grade: '' };
const EMPTY_ACT   = { childId: '', child: '', type: '', name: '', day: '', time: '', venue: '' };
const EMPTY_EVENT = { childId: '', child: '', title: '', date: '', time: '', notes: '' };

export default function ChildrenActivities({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const pad = width < 360 ? 16 : 20;
  const { items, loading, saving, create, update, remove, byType } = useFamilyItems('children');
  const { on } = useSocket();

  const [alert, setAlert]           = useState(null);
  const [childModal, setChildModal] = useState(false);
  const [actModal, setActModal]     = useState(false);
  const [eventModal, setEventModal] = useState(false);
  const [editChild, setEditChild]   = useState(null); // null = adding; otherwise the item being edited
  const [editAct, setEditAct]       = useState(null);
  const [editEvent, setEditEvent]   = useState(null);
  const [childForm, setChildForm]   = useState(EMPTY_CHILD);
  const [actForm, setActForm]       = useState(EMPTY_ACT);
  const [eventForm, setEventForm]   = useState(EMPTY_EVENT);
  const [saveError, setSaveError]   = useState('');

  useEffect(() => {
    const off = on('family:alert', (data) => {
      if (data.domain === 'children') setAlert(data);
    });
    return () => off?.();
  }, [on]);

  const children   = byType('child');
  const activities = byType('activity');
  const events     = byType('event');

  // Mirrors each Save button's own `disabled` condition below — the button
  // being enabled is the primary guard, this is the backstop in case it's
  // ever reached some other way (e.g. a future submit-on-enter).
  const childFormValid = !!(childForm.name.trim() && childForm.age.trim() && childForm.grade.trim() && childForm.school.trim());
  const actFormValid = !!(actForm.name.trim() && actForm.type && actForm.child.trim() && actForm.day && actForm.time && actForm.venue.trim());

  const openAddChild = () => { setEditChild(null); setChildForm(EMPTY_CHILD); setSaveError(''); setChildModal(true); };
  const openEditChild = (item) => {
    setEditChild(item);
    setChildForm({ name: item.data.name || '', age: item.data.age || '', school: item.data.school || '', grade: item.data.grade || '' });
    setSaveError('');
    setChildModal(true);
  };
  const openAddAct = () => { setEditAct(null); setActForm(EMPTY_ACT); setSaveError(''); setActModal(true); };
  const openEditAct = (item) => {
    setEditAct(item);
    setActForm({
      childId: item.data.childId || '', child: item.data.child || '', type: item.data.type || '',
      name: item.data.name || '', day: item.data.day || '', time: item.data.time || '', venue: item.data.venue || '',
    });
    setSaveError('');
    setActModal(true);
  };
  const openAddEvent = () => { setEditEvent(null); setEventForm(EMPTY_EVENT); setSaveError(''); setEventModal(true); };
  const openEditEvent = (item) => {
    setEditEvent(item);
    setEventForm({
      childId: item.data.childId || '', child: item.data.child || '', title: item.data.title || '',
      date: item.data.date || '', time: item.data.time || '', notes: item.data.notes || '',
    });
    setSaveError('');
    setEventModal(true);
  };

  const saveChild = async () => {
    if (!childFormValid) return;
    setSaveError('');
    try {
      if (editChild) await update(editChild.id, { data: childForm });
      else await create('child', childForm);
      setChildModal(false);
    } catch (err) { setSaveError(err.message || 'Could not save this child.'); }
  };

  const saveActivity = async () => {
    if (!actFormValid) return;
    setSaveError('');
    try {
      if (editAct) await update(editAct.id, { data: actForm });
      else await create('activity', actForm);
      setActModal(false);
    } catch (err) { setSaveError(err.message || 'Could not save this activity.'); }
  };

  const saveEvent = async () => {
    if (!eventForm.title.trim()) return;
    setSaveError('');
    const remindAt = (eventForm.date && eventForm.time)
      ? new Date(`${eventForm.date}T${eventForm.time}:00`).toISOString()
      : eventForm.date ? new Date(`${eventForm.date}T09:00:00`).toISOString() : null;
    try {
      if (editEvent) await update(editEvent.id, { data: eventForm, remindAt });
      else await create('event', eventForm, remindAt);
      setEventModal(false);
    } catch (err) { setSaveError(err.message || 'Could not save this event.'); }
  };

  const deleteChild = () => {
    Alert.alert('Delete Child', `Remove "${editChild.data.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await remove(editChild.id); setChildModal(false); }
        catch (err) { setSaveError(err.message || 'Could not delete this child.'); }
      } },
    ]);
  };
  const deleteActivity = () => {
    Alert.alert('Delete Activity', `Remove "${editAct.data.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await remove(editAct.id); setActModal(false); }
        catch (err) { setSaveError(err.message || 'Could not delete this activity.'); }
      } },
    ]);
  };
  const deleteEvent = () => {
    Alert.alert('Delete Event', `Remove "${editEvent.data.title}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await remove(editEvent.id); setEventModal(false); }
        catch (err) { setSaveError(err.message || 'Could not delete this event.'); }
      } },
    ]);
  };

  // Picking an existing child locks the free-text field to that child's own
  // name; "None" (the default) leaves it a free-typed, unlinked label.
  const pickActChild = (child) => setActForm(f => (
    child ? { ...f, childId: child.id, child: child.data.name } : { ...f, childId: '' }
  ));
  const pickEventChild = (child) => setEventForm(f => (
    child ? { ...f, childId: child.id, child: child.data.name } : { ...f, childId: '' }
  ));

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
          <Feather name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Children & Activities</Text>
          <Text style={styles.headerSub}>School, classes & events</Text>
        </View>
        <View style={styles.headerBadge}><Text style={{ fontSize: 22 }}>👶</Text></View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={theme.accentAlt} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
          {saving && <SavingBar theme={theme} styles={styles} />}

          <FamilyReminderToggle settingKey="schoolReminders" title="School reminders" description="Remind me about school events, homework and deadlines" icon="book-open" color="#9B72FF" />

          {items.length > 0 && (
            <View style={styles.memoryBadge}>
              <Feather name="cpu" size={12} color={theme.accentAlt} />
              <Text style={styles.memoryText}>Mneva AI has memorized {items.length} item{items.length !== 1 ? 's' : ''} for your children</Text>
            </View>
          )}

          <SectionHeader label="CHILDREN" color="#9B72FF" bg="#F3EFFE" onAdd={openAddChild} styles={styles} />
          <View style={styles.card}>
            {children.length === 0 ? <EmptyRow icon="user" text="No children added" theme={theme} styles={styles} /> : children.map((c, i) => {
              const linkedCount = activities.filter(a => a.data?.childId === c.id).length + events.filter(e => e.data?.childId === c.id).length;
              return (
                <TouchableOpacity key={c.id} style={[styles.listRow, i < children.length - 1 && styles.divider]} onPress={() => openEditChild(c)} activeOpacity={0.7}>
                  <View style={[styles.rowIcon, { backgroundColor: '#F3EFFE' }]}><Feather name="user" size={14} color="#9B72FF" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.data.name}{c.data.age ? `, ${c.data.age} yrs` : ''}</Text>
                    <Text style={styles.rowMeta}>{[c.data.school, c.data.grade ? `Grade ${c.data.grade}` : null].filter(Boolean).join(' · ')}</Text>
                  </View>
                  {linkedCount > 0 && <View style={styles.linkTag}><Feather name="link" size={9} color="#9B72FF" /><Text style={styles.linkTagText}>{linkedCount}</Text></View>}
                  <Feather name="chevron-right" size={16} color={theme.faint} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              );
            })}
          </View>

          <SectionHeader label="CLASSES & ACTIVITIES" color="#4FA6E8" bg="#EAF3FD" onAdd={openAddAct} styles={styles} />
          <View style={styles.card}>
            {activities.length === 0 ? <EmptyRow icon="zap" text="No activities added" theme={theme} styles={styles} /> : activities.map((a, i) => (
              <TouchableOpacity key={a.id} style={[styles.listRow, i < activities.length - 1 && styles.divider]} onPress={() => openEditAct(a)} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: '#EAF3FD' }]}><Feather name="zap" size={14} color="#4FA6E8" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{a.data.name}</Text>
                  <Text style={styles.rowMeta}>{[a.data.type, a.data.day, formatTimeDisplay(a.data.time), a.data.child].filter(Boolean).join(' · ')}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={theme.faint} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ))}
          </View>

          <SectionHeader label="SCHOOL EVENTS" color="#1F9A5A" bg="#EFFDF6" onAdd={openAddEvent} styles={styles} />
          <View style={styles.card}>
            {events.length === 0 ? <EmptyRow icon="calendar" text="No events added" theme={theme} styles={styles} /> : events.map((e, i) => (
              <TouchableOpacity key={e.id} style={[styles.listRow, i < events.length - 1 && styles.divider]} onPress={() => openEditEvent(e)} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: '#EFFDF6' }]}><Feather name="calendar" size={14} color="#1F9A5A" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{e.data.title}</Text>
                  <Text style={styles.rowMeta}>{[e.data.child, e.data.date, formatTimeDisplay(e.data.time)].filter(Boolean).join(' · ')}</Text>
                </View>
                {e.remindAt && <View style={styles.remindTag}><Feather name="bell" size={10} color={theme.accentAlt} /><Text style={styles.remindTagText}>Reminder set</Text></View>}
                <Feather name="chevron-right" size={16} color={theme.faint} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Child Modal */}
      <SheetModal
        visible={childModal} onClose={() => setChildModal(false)} insets={insets}
        title={editChild ? 'Edit Child' : 'Add Child'} gradColors={['#9B72FF', '#7C5CE8']} icon="user" theme={theme} styles={styles}
        onDelete={editChild ? deleteChild : null} deleteColor={theme.danger}
      >
        <FLabel styles={styles}>Name *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Arjun" placeholderTextColor={theme.placeholder} value={childForm.name} onChangeText={v => setChildForm(f => ({ ...f, name: sanitizeLettersOnly(v) }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><FLabel styles={styles}>Age *</FLabel><TextInput style={styles.input} placeholder="e.g. 8" placeholderTextColor={theme.placeholder} value={childForm.age} onChangeText={v => setChildForm(f => ({ ...f, age: v.replace(/[^0-9]/g, '') }))} keyboardType="numeric" /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><FLabel styles={styles}>Grade *</FLabel><TextInput style={styles.input} placeholder="e.g. 3rd" placeholderTextColor={theme.placeholder} value={childForm.grade} onChangeText={v => setChildForm(f => ({ ...f, grade: sanitizeGrade(v) }))} /></View>
        </View>
        <FLabel styles={styles}>School *</FLabel>
        <TextInput style={styles.input} placeholder="School name" placeholderTextColor={theme.placeholder} value={childForm.school} onChangeText={v => setChildForm(f => ({ ...f, school: v }))} />
        {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
        <SaveBtn onPress={saveChild} disabled={!childFormValid || saving} colors={['#9B72FF', '#7C5CE8']} label={editChild ? 'Update Child' : 'Add Child'} styles={styles} />
      </SheetModal>

      {/* Activity Modal */}
      <SheetModal
        visible={actModal} onClose={() => setActModal(false)} insets={insets}
        title={editAct ? 'Edit Activity' : 'Add Activity'} gradColors={['#4FA6E8', '#2E86C8']} icon="zap" theme={theme} styles={styles}
        onDelete={editAct ? deleteActivity : null} deleteColor={theme.danger}
      >
        <FLabel styles={styles}>Activity Type *</FLabel>
        <View style={styles.chipRow}>
          {ACTIVITY_TYPES.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, actForm.type === t && styles.chipActive]} onPress={() => setActForm(f => ({ ...f, type: t }))}>
              <Text style={[styles.chipText, actForm.type === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <FLabel styles={styles}>Activity Name *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Cricket coaching" placeholderTextColor={theme.placeholder} value={actForm.name} onChangeText={v => setActForm(f => ({ ...f, name: v }))} />

        <FLabel styles={styles}>For Child *</FLabel>
        <View style={styles.chipRow}>
          <TouchableOpacity style={[styles.chip, !actForm.childId && styles.chipActive]} onPress={() => pickActChild(null)}>
            <Text style={[styles.chipText, !actForm.childId && styles.chipTextActive]}>None</Text>
          </TouchableOpacity>
          {children.map(c => (
            <TouchableOpacity key={c.id} style={[styles.chip, actForm.childId === c.id && styles.chipActive]} onPress={() => pickActChild(c)}>
              <Text style={[styles.chipText, actForm.childId === c.id && styles.chipTextActive]}>{c.data.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={[styles.input, !!actForm.childId && styles.inputDisabled]}
          editable={!actForm.childId}
          placeholder="Child's name" placeholderTextColor={theme.placeholder}
          value={actForm.child} onChangeText={v => setActForm(f => ({ ...f, child: sanitizeLettersOnly(v) }))}
        />

        <FLabel styles={styles}>Day *</FLabel>
        <View style={styles.chipRow}>
          {DAYS.map(d => (
            <TouchableOpacity key={d} style={[styles.chip, actForm.day === d && styles.chipActive]} onPress={() => setActForm(f => ({ ...f, day: d }))}>
              <Text style={[styles.chipText, actForm.day === d && styles.chipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><TimeField label="Time" required value={actForm.time} onChange={v => setActForm(f => ({ ...f, time: v }))} /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><FLabel styles={styles}>Venue *</FLabel><TextInput style={styles.input} placeholder="e.g. Sports ground" placeholderTextColor={theme.placeholder} value={actForm.venue} onChangeText={v => setActForm(f => ({ ...f, venue: v }))} /></View>
        </View>
        {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
        <SaveBtn onPress={saveActivity} disabled={!actFormValid || saving} colors={['#4FA6E8', '#2E86C8']} label={editAct ? 'Update Activity' : 'Save Activity'} styles={styles} />
      </SheetModal>

      {/* Event Modal */}
      <SheetModal
        visible={eventModal} onClose={() => setEventModal(false)} insets={insets}
        title={editEvent ? 'Edit School Event' : 'Add School Event'} gradColors={['#1F9A5A', '#3CB37A']} icon="calendar" theme={theme} styles={styles}
        onDelete={editEvent ? deleteEvent : null} deleteColor={theme.danger}
      >
        <FLabel styles={styles}>Event Title *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Annual Day, PTM" placeholderTextColor={theme.placeholder} value={eventForm.title} onChangeText={v => setEventForm(f => ({ ...f, title: v }))} />

        <FLabel styles={styles}>Child</FLabel>
        <View style={styles.chipRow}>
          <TouchableOpacity style={[styles.chip, !eventForm.childId && styles.chipActive]} onPress={() => pickEventChild(null)}>
            <Text style={[styles.chipText, !eventForm.childId && styles.chipTextActive]}>None</Text>
          </TouchableOpacity>
          {children.map(c => (
            <TouchableOpacity key={c.id} style={[styles.chip, eventForm.childId === c.id && styles.chipActive]} onPress={() => pickEventChild(c)}>
              <Text style={[styles.chipText, eventForm.childId === c.id && styles.chipTextActive]}>{c.data.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <TextInput
              style={[styles.input, !!eventForm.childId && styles.inputDisabled]}
              editable={!eventForm.childId}
              placeholder="Child's name" placeholderTextColor={theme.placeholder}
              value={eventForm.child} onChangeText={v => setEventForm(f => ({ ...f, child: sanitizeLettersOnly(v) }))}
            />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><DateField label="Date" value={eventForm.date} onChange={v => setEventForm(f => ({ ...f, date: v.slice(0, 10) }))} minimumDate={new Date()} /></View>
        </View>
        <TimeField label="Time — for reminder" value={eventForm.time} onChange={v => setEventForm(f => ({ ...f, time: v }))} />
        <FLabel styles={styles}>Notes</FLabel>
        <TextInput style={styles.input} placeholder="Any notes..." placeholderTextColor={theme.placeholder} value={eventForm.notes} onChangeText={v => setEventForm(f => ({ ...f, notes: v }))} />
        {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
        <SaveBtn onPress={saveEvent} disabled={!eventForm.title.trim() || saving} colors={['#1F9A5A', '#3CB37A']} label={editEvent ? 'Update Event' : 'Save Event'} styles={styles} />
      </SheetModal>
    </SafeAreaView>
  );
}

function SavingBar({ theme, styles }) {
  return (
    <View style={styles.savingBar}>
      <ActivityIndicator size="small" color={theme.accentAlt} />
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
function SheetModal({ visible, onClose, insets, title, gradColors, icon, children, theme, styles, onDelete, deleteColor }) {
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
  headerBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE', alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  savingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.isDark ? 'rgba(129,128,255,0.12)' : '#F3EFFE', borderRadius: 10, padding: 10, marginBottom: 12 },
  savingText: { fontSize: 12, color: theme.accentAlt, fontWeight: '600' },
  memoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.isDark ? 'rgba(129,128,255,0.12)' : '#F3EFFE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
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
  remindTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.isDark ? 'rgba(129,128,255,0.12)' : '#F3EFFE', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 },
  remindTagText: { fontSize: 10, fontWeight: '700', color: theme.accentAlt },
  linkTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.isDark ? 'rgba(129,128,255,0.12)' : '#F3EFFE', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 },
  linkTagText: { fontSize: 10, fontWeight: '700', color: '#9B72FF' },
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
