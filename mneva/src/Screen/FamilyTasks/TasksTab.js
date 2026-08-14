import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFamilyTask, TASK_STATUSES, PRIORITIES, CATEGORIES, RECURRENCES } from './FamilyTaskContext';

const FILTERS = ['All', 'Draft', 'Pending', 'In Progress', 'Completed'];
const FILTER_MAP = {
  'All': null, 'Draft': 'DRAFT', 'Pending': 'PENDING_ACCEPTANCE',
  'In Progress': 'IN_PROGRESS', 'Completed': 'COMPLETED',
};
const PRIORITY_COLOR = { Low: '#1F9A5A', Medium: '#D97706', High: '#E0546E', Urgent: '#9B72FF' };
const PRIORITY_BG    = { Low: '#EFFDF6', Medium: '#FEF3C7', High: '#FCEAED', Urgent: '#F3EFFE' };

export default function TasksTab({ horizontalPad, insets }) {
  const { tasks, connections } = useFamilyTask();
  const [filter, setFilter] = useState('All');
  const [createModal, setCreateModal] = useState(false);

  const filtered = FILTER_MAP[filter]
    ? tasks.filter(t => t.status === FILTER_MAP[filter])
    : tasks;

  return (
    <View style={{ flex: 1 }}>
      {/* Filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterBar, { paddingHorizontal: horizontalPad }]}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Task list */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: horizontalPad, paddingBottom: insets.bottom + 110, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Feather name="inbox" size={36} color="#1F9A5A" />
            </View>
            <Text style={styles.emptyTitle}>No tasks yet</Text>
            <Text style={styles.emptySubtitle}>Tap the button below to create{'\n'}your first family task</Text>
          </View>
        ) : (
          filtered.map(task => <TaskCard key={task.id} task={task} />)
        )}
      </ScrollView>

      {/* Create button — full width at bottom */}
      <View style={[styles.createBarWrap, { paddingBottom: insets.bottom + 12, paddingHorizontal: horizontalPad }]}>
        <TouchableOpacity style={styles.createBar} activeOpacity={0.88} onPress={() => setCreateModal(true)}>
          <LinearGradient colors={['#0F5132', '#1F9A5A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.createBarGrad}>
            <View style={styles.createBarIcon}>
              <Feather name="plus" size={18} color="#1F9A5A" />
            </View>
            <Text style={styles.createBarText}>Create New Task</Text>
            <Feather name="arrow-right" size={16} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <CreateTaskModal
        visible={createModal}
        onClose={() => setCreateModal(false)}
        insets={insets}
        connections={connections}
      />
    </View>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task }) {
  const s = TASK_STATUSES[task.status] || TASK_STATUSES.DRAFT;
  const pc = PRIORITY_COLOR[task.priority] || '#9AA1AE';
  const pb = PRIORITY_BG[task.priority]   || '#F5F6F8';
  const doneItems  = task.checklist?.filter(i => i.done).length || 0;
  const totalItems = task.checklist?.length || 0;
  const progress   = totalItems > 0 ? doneItems / totalItems : 0;

  return (
    <View style={[styles.card, { borderLeftColor: pc }]}>
      {/* Top row */}
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{task.title}</Text>
          {task.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{task.description}</Text>
          ) : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
          <Text style={[styles.statusBadgeText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>

      {/* Meta row */}
      <View style={styles.metaRow}>
        {task.assignedTo ? (
          <View style={styles.assigneeChip}>
            <View style={styles.assigneeAvatar}>
              <Text style={styles.assigneeAvatarText}>{task.assignedTo.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.assigneeText}>{task.assignedTo}</Text>
          </View>
        ) : (
          <View style={styles.unassignedChip}>
            <Feather name="user" size={11} color="#9AA1AE" />
            <Text style={styles.unassignedText}>Unassigned</Text>
          </View>
        )}
        {task.dueDate ? (
          <View style={styles.metaChip}>
            <Feather name="calendar" size={11} color="#6B7280" />
            <Text style={styles.metaChipText}>{task.dueDate}</Text>
          </View>
        ) : null}
        {task.category ? (
          <View style={styles.metaChip}>
            <Feather name="tag" size={11} color="#6B7280" />
            <Text style={styles.metaChipText}>{task.category}</Text>
          </View>
        ) : null}
        <View style={[styles.priorityChip, { backgroundColor: pb }]}>
          <Feather name="flag" size={11} color={pc} />
          <Text style={[styles.priorityChipText, { color: pc }]}>{task.priority}</Text>
        </View>
      </View>

      {/* Checklist progress */}
      {totalItems > 0 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: pc }]} />
          </View>
          <Text style={styles.progressText}>{doneItems}/{totalItems}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Create Task Modal ────────────────────────────────────────────────────────
function CreateTaskModal({ visible, onClose, insets, connections }) {
  const { createTask } = useFamilyTask();
  const accepted = connections.filter(c => c.status === 'ACCEPTED');

  const [title, setTitle]           = useState('');
  const [description, setDesc]      = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority]     = useState('Medium');
  const [category, setCategory]     = useState('');
  const [dueDate, setDueDate]       = useState('');
  const [recurrence, setRecurrence] = useState('None');
  const [checklistInput, setCLInput] = useState('');
  const [checklist, setChecklist]   = useState([]);

  const reset = () => {
    setTitle(''); setDesc(''); setAssignedTo(''); setPriority('Medium');
    setCategory(''); setDueDate(''); setRecurrence('None'); setCLInput(''); setChecklist([]);
  };

  const addItem = () => {
    if (!checklistInput.trim()) return;
    setChecklist(p => [...p, { id: Date.now().toString(), text: checklistInput.trim(), done: false }]);
    setCLInput('');
  };

  const handleCreate = () => {
    if (!title.trim()) return Alert.alert('Title required', 'Please enter a task title.');
    createTask({ title: title.trim(), description, assignedTo, priority, category, dueDate, recurrence, checklist });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.sheetHandle} />

          {/* Sheet header */}
          <LinearGradient colors={['#0F5132', '#1F9A5A']} style={styles.sheetHero}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetHeroTitle}>New Task</Text>
              <Text style={styles.sheetHeroSub}>
                {assignedTo ? `Will be assigned to ${assignedTo}` : 'Saved as draft until assigned'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.sheetCloseBtn}>
              <Feather name="x" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ paddingHorizontal: 20 }}>
            {/* Title */}
            <Text style={styles.label}>Task Title <Text style={styles.req}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. Buy groceries" placeholderTextColor="#9AA1AE" value={title} onChangeText={setTitle} />

            {/* Description */}
            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder="Optional details…" placeholderTextColor="#9AA1AE" value={description} onChangeText={setDesc} multiline />

            {/* Assign to */}
            <Text style={styles.label}>Assign To</Text>
            {accepted.length === 0 ? (
              <View style={styles.hintBox}>
                <Feather name="info" size={13} color="#9AA1AE" />
                <Text style={styles.hintText}>Add family members from the People tab first.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
                <TouchableOpacity
                  style={[styles.avatarOption, assignedTo === '' && styles.avatarOptionActive]}
                  onPress={() => setAssignedTo('')}
                >
                  <View style={[styles.avatarCircle, { backgroundColor: '#F0F1F4' }]}>
                    <Feather name="slash" size={14} color="#9AA1AE" />
                  </View>
                  <Text style={[styles.avatarLabel, assignedTo === '' && styles.avatarLabelActive]}>None</Text>
                </TouchableOpacity>
                {accepted.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.avatarOption, assignedTo === c.name && styles.avatarOptionActive]}
                    onPress={() => setAssignedTo(c.name)}
                  >
                    <LinearGradient
                      colors={assignedTo === c.name ? ['#0F5132', '#1F9A5A'] : ['#E8EAF0', '#DDE0E8']}
                      style={styles.avatarCircle}
                    >
                      <Text style={[styles.avatarInitial, { color: assignedTo === c.name ? '#FFFFFF' : '#6B7280' }]}>
                        {c.name.charAt(0).toUpperCase()}
                      </Text>
                    </LinearGradient>
                    <Text style={[styles.avatarLabel, assignedTo === c.name && styles.avatarLabelActive]} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Priority */}
            <Text style={styles.label}>Priority</Text>
            <View style={styles.chipRow}>
              {PRIORITIES.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, priority === p && { backgroundColor: PRIORITY_BG[p], borderColor: PRIORITY_COLOR[p] }]}
                  onPress={() => setPriority(p)}
                >
                  <Feather name="flag" size={11} color={priority === p ? PRIORITY_COLOR[p] : '#9AA1AE'} />
                  <Text style={[styles.chipText, priority === p && { color: PRIORITY_COLOR[p] }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, category === c && styles.chipActive]}
                  onPress={() => setCategory(category === c ? '' : c)}
                >
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Due date + Recurrence side by side */}
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Due Date</Text>
                <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#9AA1AE" value={dueDate} onChangeText={setDueDate} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Repeat</Text>
                <View style={styles.chipCol}>
                  {RECURRENCES.map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, recurrence === r && styles.chipActive]}
                      onPress={() => setRecurrence(r)}
                    >
                      <Text style={[styles.chipText, recurrence === r && styles.chipTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Checklist */}
            <Text style={styles.label}>Checklist</Text>
            <View style={styles.clInputRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Add item…"
                placeholderTextColor="#9AA1AE"
                value={checklistInput}
                onChangeText={setCLInput}
                onSubmitEditing={addItem}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.clAddBtn} onPress={addItem}>
                <Feather name="plus" size={18} color="#1F9A5A" />
              </TouchableOpacity>
            </View>
            {checklist.map((item, idx) => (
              <View key={item.id} style={styles.clItem}>
                <Text style={styles.clItemNum}>{idx + 1}</Text>
                <Text style={styles.clItemText}>{item.text}</Text>
                <TouchableOpacity onPress={() => setChecklist(p => p.filter(i => i.id !== item.id))}>
                  <Feather name="x" size={14} color="#9AA1AE" />
                </TouchableOpacity>
              </View>
            ))}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, !title.trim() && styles.submitBtnDisabled]}
              disabled={!title.trim()}
              onPress={handleCreate}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#0F5132', '#1F9A5A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                <Feather name={assignedTo ? 'send' : 'save'} size={16} color="#FFFFFF" />
                <Text style={styles.submitText}>
                  {assignedTo ? `Assign to ${assignedTo}` : 'Save as Draft'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Filter bar
  filterBar: { paddingVertical: 12, gap: 8 },
  filterChip: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: 'transparent' },
  filterChipActive: { backgroundColor: '#EFFDF6', borderColor: '#1F9A5A' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: '#9AA1AE' },
  filterChipTextActive: { color: '#1F9A5A' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 70, gap: 12 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 28, backgroundColor: '#EFFDF6', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  emptySubtitle: { fontSize: 13, color: '#9AA1AE', textAlign: 'center', lineHeight: 20 },

  // Task card
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 10, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#14171F', marginBottom: 3 },
  cardDesc: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  assigneeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFFDF6', borderRadius: 20, paddingRight: 10, paddingVertical: 3 },
  assigneeAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#1F9A5A', alignItems: 'center', justifyContent: 'center' },
  assigneeAvatarText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  assigneeText: { fontSize: 11, fontWeight: '700', color: '#1F9A5A' },
  unassignedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5F6F8', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  unassignedText: { fontSize: 11, fontWeight: '600', color: '#9AA1AE' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5F6F8', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  metaChipText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  priorityChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  priorityChipText: { fontSize: 11, fontWeight: '700' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  progressTrack: { flex: 1, height: 5, backgroundColor: '#F0F1F4', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  progressText: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', minWidth: 28, textAlign: 'right' },

  // Create bar
  createBarWrap: { backgroundColor: '#F2F4F7', paddingTop: 8 },
  createBar: { borderRadius: 18, overflow: 'hidden' },
  createBarGrad: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  createBarIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  createBarText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(14,17,26,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#F2F4F7', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '95%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', marginTop: 10, marginBottom: 0 },
  sheetHero: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18, marginBottom: 4 },
  sheetHeroTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  sheetHeroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 14, letterSpacing: 0.3 },
  req: { color: '#E0546E' },
  input: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: '#14171F', marginBottom: 0 },
  inputMulti: { height: 76, textAlignVertical: 'top' },
  hintBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12 },
  hintText: { fontSize: 12, color: '#9AA1AE', flex: 1 },
  avatarRow: { gap: 12, paddingVertical: 4 },
  avatarOption: { alignItems: 'center', gap: 6, opacity: 0.6 },
  avatarOptionActive: { opacity: 1 },
  avatarCircle: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 18, fontWeight: '800' },
  avatarLabel: { fontSize: 11, fontWeight: '600', color: '#9AA1AE', maxWidth: 56, textAlign: 'center' },
  avatarLabelActive: { color: '#0F5132', fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { backgroundColor: '#EFFDF6', borderColor: '#1F9A5A' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#1F9A5A' },
  twoCol: { flexDirection: 'row', gap: 12 },
  clInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clAddBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#EFFDF6', alignItems: 'center', justifyContent: 'center' },
  clItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  clItemNum: { fontSize: 11, fontWeight: '800', color: '#1F9A5A', minWidth: 16 },
  clItemText: { flex: 1, fontSize: 13, color: '#374151' },
  submitBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 20, marginBottom: 8 },
  submitBtnDisabled: { opacity: 0.4 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
