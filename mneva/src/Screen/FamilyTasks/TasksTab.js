import React, { useState, useEffect } from 'react';
import { getStoredAuth } from '../../storage/auth';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { useFamilyTask, TASK_STATUSES, PRIORITIES, CATEGORIES, RECURRENCES } from './FamilyTaskContext';
import DateField from '../finance/DateField';

const FILTERS = ['All', 'Draft', 'Pending', 'In Progress', 'Completed'];
const FILTER_MAP = {
  'All': null, 'Draft': 'DRAFT', 'Pending': 'PENDING_ACCEPTANCE',
  'In Progress': 'IN_PROGRESS', 'Completed': 'COMPLETED',
};
const PRIORITY_COLOR = { Low: '#1F9A5A', Medium: '#D97706', High: '#E0546E', Urgent: '#9B72FF' };
const PRIORITY_BG    = { Low: '#EFFDF6', Medium: '#FEF3C7', High: '#FCEAED', Urgent: '#F3EFFE' };

export default function TasksTab({ horizontalPad, insets }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { tasks, connections } = useFamilyTask();
  const [filter, setFilter] = useState('All');
  const [createModal, setCreateModal] = useState(false);
  const [myId, setMyId] = useState(null);

  useEffect(() => {
    getStoredAuth().then(({ user }) => { if (user?.id) setMyId(user.id); }).catch(() => {});
  }, []);

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
              <Feather name="inbox" size={36} color={theme.accent} />
            </View>
            <Text style={styles.emptyTitle}>No tasks yet</Text>
            <Text style={styles.emptySubtitle}>Tap the button below to create{'\n'}your first family task</Text>
          </View>
        ) : (
          filtered.map(task => <TaskCard key={task.id} task={task} myId={myId} theme={theme} styles={styles} />)
        )}
      </ScrollView>

      {/* Create button — full width at bottom */}
      <View style={[styles.createBarWrap, { paddingBottom: insets.bottom + 12, paddingHorizontal: horizontalPad }]}>
        <TouchableOpacity style={styles.createBar} activeOpacity={0.88} onPress={() => setCreateModal(true)}>
          <LinearGradient colors={['#0F5132', '#1F9A5A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.createBarGrad}>
            <View style={styles.createBarIcon}>
              <Feather name="plus" size={18} color={theme.accent} />
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
        theme={theme}
        styles={styles}
      />
    </View>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task, myId, theme, styles }) {
  const { updateTaskStatus } = useFamilyTask();
  const [detailOpen, setDetailOpen] = useState(false);
  const s = TASK_STATUSES[task.status] || TASK_STATUSES.DRAFT;
  const pc = PRIORITY_COLOR[task.priority] || theme.faint;
  const pb = PRIORITY_BG[task.priority]   || theme.surfaceAlt;
  const doneItems  = task.checklist?.filter(i => i.done).length || 0;
  const totalItems = task.checklist?.length || 0;
  const progress   = totalItems > 0 ? doneItems / totalItems : 0;

  const isAssignee = myId && task.assignedTo?.id === myId;
  const isCreator  = myId && task.createdBy?.id === myId;

  const doStatus = (status) => updateTaskStatus(task.id, status).catch(e => Alert.alert('Error', e?.message || 'Failed'));

  const assigneeName = task.assignedTo?.name || 'Unassigned';
  const creatorName  = task.createdBy?.name;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => setDetailOpen(true)} style={[styles.card, { borderLeftColor: pc }]}>
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
              <Text style={styles.assigneeAvatarText}>{assigneeName.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.assigneeText}>{assigneeName}</Text>
          </View>
        ) : (
          <View style={styles.unassignedChip}>
            <Feather name="user" size={11} color={theme.faint} />
            <Text style={styles.unassignedText}>Unassigned</Text>
          </View>
        )}
        {creatorName ? (
          <View style={styles.metaChip}>
            <Feather name="user" size={11} color={theme.muted} />
            <Text style={styles.metaChipText}>by {creatorName}</Text>
          </View>
        ) : null}
        {task.dueDate ? (
          <View style={styles.metaChip}>
            <Feather name="calendar" size={11} color={theme.muted} />
            <Text style={styles.metaChipText}>{task.dueDate}</Text>
          </View>
        ) : null}
        {task.category ? (
          <View style={styles.metaChip}>
            <Feather name="tag" size={11} color={theme.muted} />
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

      {/* Action buttons */}
      {isAssignee && task.status === 'PENDING_ACCEPTANCE' && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.actionAccept]} onPress={() => doStatus('ACCEPTED')}>
            <Feather name="check" size={13} color={theme.accent} />
            <Text style={[styles.actionBtnText, { color: theme.accent }]}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionReject]} onPress={() => doStatus('REJECTED')}>
            <Feather name="x" size={13} color={theme.danger} />
            <Text style={[styles.actionBtnText, { color: theme.danger }]}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}
      {(isAssignee || isCreator) && task.status === 'ACCEPTED' && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.actionProgress]} onPress={() => doStatus('IN_PROGRESS')}>
            <Feather name="play" size={13} color={theme.accentAlt} />
            <Text style={[styles.actionBtnText, { color: theme.accentAlt }]}>Start</Text>
          </TouchableOpacity>
        </View>
      )}
      {(isAssignee || isCreator) && task.status === 'IN_PROGRESS' && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.actionAccept]} onPress={() => doStatus('COMPLETED')}>
            <Feather name="check-circle" size={13} color={theme.accent} />
            <Text style={[styles.actionBtnText, { color: theme.accent }]}>Complete</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionReject]} onPress={() => doStatus('CANCELLED')}>
            <Feather name="slash" size={13} color={theme.muted} />
            <Text style={[styles.actionBtnText, { color: theme.muted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.tapHint}>
        <Feather name="chevron-right" size={12} color={theme.faint} />
        <Text style={styles.tapHintText}>Tap for full details</Text>
      </View>

      <TaskDetailModal visible={detailOpen} onClose={() => setDetailOpen(false)} task={task} myId={myId} theme={theme} styles={styles} />
    </TouchableOpacity>
  );
}

// ─── Task Detail Modal ─────────────────────────────────────────────────────────
function TaskDetailModal({ visible, onClose, task, myId, theme, styles }) {
  const { updateTaskStatus, toggleChecklistItem, addComment, editTask, deleteTask } = useFamilyTask();
  const [editOpen, setEditOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [busy, setBusy] = useState(false);

  const s = TASK_STATUSES[task.status] || TASK_STATUSES.DRAFT;
  const pc = PRIORITY_COLOR[task.priority] || theme.faint;
  const isCreator = myId && task.createdBy?.id === myId;
  const isAssignee = myId && task.assignedTo?.id === myId;
  const checklist = task.checklist || [];
  const comments = task.comments || [];

  const doStatus = (status) => updateTaskStatus(task.id, status).catch(e => Alert.alert('Error', e?.message || 'Failed'));
  const toggleItem = (itemId) => toggleChecklistItem(task.id, itemId).catch(e => Alert.alert('Error', e?.message || 'Failed'));
  const sendComment = async () => {
    if (!commentText.trim() || busy) return;
    setBusy(true);
    try { await addComment(task.id, commentText.trim()); setCommentText(''); }
    catch (e) { Alert.alert('Error', e?.message || 'Failed'); }
    finally { setBusy(false); }
  };
  const onDelete = () => {
    Alert.alert('Delete task?', `"${task.title}" will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteTask(task.id); onClose(); }
        catch (e) { Alert.alert('Error', e?.message || 'Failed'); }
      } },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={styles.detailSheet}>
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={styles.detailHeaderRow}>
              <Text style={styles.detailTitle}>{task.title}</Text>
              <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                <Text style={[styles.statusBadgeText, { color: s.color }]}>{s.label}</Text>
              </View>
            </View>
            {!!task.description && <Text style={styles.detailDesc}>{task.description}</Text>}

            <View style={styles.detailInfoCard}>
              <DetailRow icon="user" label="Assigned to" value={task.assignedTo?.name || 'Unassigned'} styles={styles} theme={theme} />
              <DetailRow icon="user-check" label="Created by" value={task.createdBy?.name} styles={styles} theme={theme} />
              <DetailRow icon="flag" label="Priority" value={task.priority} valueColor={pc} styles={styles} theme={theme} />
              {!!task.category && <DetailRow icon="tag" label="Category" value={task.category} styles={styles} theme={theme} />}
              {!!task.dueDate && <DetailRow icon="calendar" label="Due date" value={task.dueDate} styles={styles} theme={theme} />}
              {task.recurrence && task.recurrence !== 'None' && <DetailRow icon="repeat" label="Repeats" value={task.recurrence} styles={styles} theme={theme} last />}
            </View>

            {checklist.length > 0 && (
              <>
                <Text style={styles.detailSectionLabel}>CHECKLIST · {checklist.filter(i => i.done).length}/{checklist.length}</Text>
                <View style={styles.detailInfoCard}>
                  {checklist.map((item, i) => (
                    <TouchableOpacity key={item.id} style={[styles.checklistRow, i < checklist.length - 1 && styles.infoRowDivider]} onPress={() => toggleItem(item.id)}>
                      <Feather name={item.done ? 'check-square' : 'square'} size={18} color={item.done ? theme.accent : theme.faint} />
                      <Text style={[styles.checklistText, item.done && styles.checklistTextDone]}>{item.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Status actions */}
            {isAssignee && task.status === 'PENDING_ACCEPTANCE' && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.actionBtn, styles.actionAccept]} onPress={() => doStatus('ACCEPTED')}>
                  <Feather name="check" size={13} color={theme.accent} /><Text style={[styles.actionBtnText, { color: theme.accent }]}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.actionReject]} onPress={() => doStatus('REJECTED')}>
                  <Feather name="x" size={13} color={theme.danger} /><Text style={[styles.actionBtnText, { color: theme.danger }]}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
            {(isAssignee || isCreator) && task.status === 'ACCEPTED' && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.actionBtn, styles.actionProgress]} onPress={() => doStatus('IN_PROGRESS')}>
                  <Feather name="play" size={13} color={theme.accentAlt} /><Text style={[styles.actionBtnText, { color: theme.accentAlt }]}>Start</Text>
                </TouchableOpacity>
              </View>
            )}
            {(isAssignee || isCreator) && task.status === 'IN_PROGRESS' && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.actionBtn, styles.actionAccept]} onPress={() => doStatus('COMPLETED')}>
                  <Feather name="check-circle" size={13} color={theme.accent} /><Text style={[styles.actionBtnText, { color: theme.accent }]}>Complete</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.actionReject]} onPress={() => doStatus('CANCELLED')}>
                  <Feather name="slash" size={13} color={theme.muted} /><Text style={[styles.actionBtnText, { color: theme.muted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.detailSectionLabel}>COMMENTS{comments.length ? ` · ${comments.length}` : ''}</Text>
            {comments.map(c => (
              <View key={c.id} style={styles.commentRow}>
                <View style={styles.commentAvatar}><Text style={styles.commentAvatarText}>{(c.by || '?').charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.commentBy}>{c.by}</Text>
                  <Text style={styles.commentText}>{c.text}</Text>
                </View>
              </View>
            ))}
            <View style={styles.commentInputRow}>
              <TextInput style={styles.commentInput} placeholder="Add a comment…" placeholderTextColor={theme.placeholder} value={commentText} onChangeText={setCommentText} onSubmitEditing={sendComment} returnKeyType="send" />
              <TouchableOpacity style={styles.commentSendBtn} onPress={sendComment} disabled={busy}>
                <Feather name="send" size={15} color={theme.accent} />
              </TouchableOpacity>
            </View>

            {isCreator && (
              <View style={[styles.actionRow, { marginTop: 20 }]}>
                <TouchableOpacity style={[styles.actionBtn, styles.actionEdit]} onPress={() => setEditOpen(true)}>
                  <Feather name="edit-2" size={13} color={theme.accentAlt} /><Text style={[styles.actionBtnText, { color: theme.accentAlt }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.actionReject]} onPress={onDelete}>
                  <Feather name="trash-2" size={13} color={theme.danger} /><Text style={[styles.actionBtnText, { color: theme.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      <EditTaskModal visible={editOpen} onClose={() => setEditOpen(false)} task={task} editTask={editTask} theme={theme} styles={styles} />
    </Modal>
  );
}

function DetailRow({ icon, label, value, valueColor, last, styles, theme }) {
  if (!value) return null;
  return (
    <View style={[styles.infoRow, !last && styles.infoRowDivider]}>
      <Feather name={icon} size={13} color={theme.muted} style={{ width: 20 }} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

// ─── Edit Task Modal ────────────────────────────────────────────────────────────
function EditTaskModal({ visible, onClose, task, editTask, theme, styles }) {
  const [title, setTitle]       = useState(task.title);
  const [description, setDesc]  = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority);
  const [category, setCategory] = useState(task.category || '');
  const [dueDate, setDueDate]   = useState(task.dueDate || '');
  const [recurrence, setRecurrence] = useState(task.recurrence || 'None');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle(task.title); setDesc(task.description || ''); setPriority(task.priority);
    setCategory(task.category || ''); setDueDate(task.dueDate || ''); setRecurrence(task.recurrence || 'None');
    setError('');
  }, [visible, task]);

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await editTask(task.id, { title: title.trim(), description, priority, category, dueDate, recurrence });
      onClose();
    } catch (e) { setError(e?.message || 'Could not save changes'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <LinearGradient colors={['#0F5132', '#1F9A5A']} style={styles.sheetHero}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetHeroTitle}>Edit Task</Text>
              <Text style={styles.sheetHeroSub} numberOfLines={1}>{task.title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.sheetCloseBtn}><Feather name="x" size={16} color="#FFFFFF" /></TouchableOpacity>
          </LinearGradient>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ paddingHorizontal: 20 }}>
            <Text style={styles.label}>Task Title <Text style={styles.req}>*</Text></Text>
            <TextInput style={styles.input} placeholderTextColor={theme.placeholder} value={title} onChangeText={setTitle} />
            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholderTextColor={theme.placeholder} value={description} onChangeText={setDesc} multiline />
            <Text style={styles.label}>Priority</Text>
            <View style={styles.chipRow}>
              {PRIORITIES.map(p => (
                <TouchableOpacity key={p} style={[styles.chip, priority === p && { backgroundColor: PRIORITY_BG[p], borderColor: PRIORITY_COLOR[p] }]} onPress={() => setPriority(p)}>
                  <Feather name="flag" size={11} color={priority === p ? PRIORITY_COLOR[p] : theme.faint} />
                  <Text style={[styles.chipText, priority === p && { color: PRIORITY_COLOR[p] }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(category === c ? '' : c)}>
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <DateField label="Due Date" value={dueDate} minimumDate={new Date()} onChange={v => setDueDate(v.slice(0, 10))} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Repeat</Text>
                <View style={styles.chipCol}>
                  {RECURRENCES.map(r => (
                    <TouchableOpacity key={r} style={[styles.chip, recurrence === r && styles.chipActive]} onPress={() => setRecurrence(r)}>
                      <Text style={[styles.chipText, recurrence === r && styles.chipTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
            {!!error && <Text style={{ color: theme.danger, fontSize: 12, marginTop: 8 }}>{error}</Text>}
            <TouchableOpacity style={[styles.submitBtn, (!title.trim() || saving) && styles.submitBtnDisabled]} disabled={!title.trim() || saving} onPress={save}>
              <LinearGradient colors={['#0F5132', '#1F9A5A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                <Feather name="check" size={16} color="#FFFFFF" />
                <Text style={styles.submitText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Create Task Modal ────────────────────────────────────────────────────────
function CreateTaskModal({ visible, onClose, insets, connections, theme, styles }) {
  const { createTask } = useFamilyTask();
  const accepted = connections.filter(c => c.status === 'ACCEPTED');

  const [title, setTitle]           = useState('');
  const [description, setDesc]      = useState('');
  const [assignee, setAssignee] = useState(null); // { id, name, connectionId }
  const [priority, setPriority]     = useState('Medium');
  const [category, setCategory]     = useState('');
  const [dueDate, setDueDate]       = useState('');
  const [recurrence, setRecurrence] = useState('None');
  const [checklistInput, setCLInput] = useState('');
  const [checklist, setChecklist]   = useState([]);

  const reset = () => {
    setTitle(''); setDesc(''); setAssignee(null); setPriority('Medium');
    setCategory(''); setDueDate(''); setRecurrence('None'); setCLInput(''); setChecklist([]);
  };

  const addItem = () => {
    if (!checklistInput.trim()) return;
    setChecklist(p => [...p, { id: Date.now().toString(), text: checklistInput.trim(), done: false }]);
    setCLInput('');
  };

  const handleCreate = async () => {
    if (!title.trim()) return Alert.alert('Title required', 'Please enter a task title.');
    if (!assignee) return Alert.alert('Assign required', 'Please select a family member to assign this task.');
    try {
      await createTask({
        connectionId: assignee.connectionId,
        assigneeId:   assignee.id,
        title: title.trim(), description, priority, category, dueDate, recurrence, checklist,
      });
      reset(); onClose();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to create task');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.sheetHandle} />

          {/* Sheet header */}
          <LinearGradient colors={['#0F5132', '#1F9A5A']} style={styles.sheetHero}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetHeroTitle}>New Task</Text>
              <Text style={styles.sheetHeroSub}>
                {assignee ? `Will be assigned to ${assignee.name}` : 'Select a family member to assign'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.sheetCloseBtn}>
              <Feather name="x" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ paddingHorizontal: 20 }}>
            {/* Title */}
            <Text style={styles.label}>Task Title <Text style={styles.req}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. Buy groceries" placeholderTextColor={theme.placeholder} value={title} onChangeText={setTitle} />

            {/* Description */}
            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder="Optional details…" placeholderTextColor={theme.placeholder} value={description} onChangeText={setDesc} multiline />

            {/* Assign to */}
            <Text style={styles.label}>Assign To</Text>
            {accepted.length === 0 ? (
              <View style={styles.hintBox}>
                <Feather name="info" size={13} color={theme.faint} />
                <Text style={styles.hintText}>Add family members from the People tab first.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
                <TouchableOpacity
                  style={[styles.avatarOption, assignee === null && styles.avatarOptionActive]}
                  onPress={() => setAssignee(null)}
                >
                  <View style={[styles.avatarCircle, { backgroundColor: theme.border }]}>
                    <Feather name="slash" size={14} color={theme.faint} />
                  </View>
                  <Text style={[styles.avatarLabel, assignee === null && styles.avatarLabelActive]}>None</Text>
                </TouchableOpacity>
                {accepted.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.avatarOption, assignee?.id === c.otherId && styles.avatarOptionActive]}
                    onPress={() => setAssignee({ id: c.otherId, name: c.name, connectionId: c.id })}
                  >
                    <LinearGradient
                      colors={assignee?.id === c.otherId ? ['#0F5132', '#1F9A5A'] : (theme.isDark ? ['#2A2F3B', '#333947'] : ['#E8EAF0', '#DDE0E8'])}
                      style={styles.avatarCircle}
                    >
                      <Text style={[styles.avatarInitial, { color: assignee?.id === c.otherId ? '#FFFFFF' : theme.muted }]}>
                        {c.name.charAt(0).toUpperCase()}
                      </Text>
                    </LinearGradient>
                    <Text style={[styles.avatarLabel, assignee?.id === c.otherId && styles.avatarLabelActive]} numberOfLines={1}>
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
                  <Feather name="flag" size={11} color={priority === p ? PRIORITY_COLOR[p] : theme.faint} />
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
                <DateField label="Due Date" value={dueDate} minimumDate={new Date()} onChange={v => setDueDate(v.slice(0, 10))} />
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
                placeholderTextColor={theme.placeholder}
                value={checklistInput}
                onChangeText={setCLInput}
                onSubmitEditing={addItem}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.clAddBtn} onPress={addItem}>
                <Feather name="plus" size={18} color={theme.accent} />
              </TouchableOpacity>
            </View>
            {checklist.map((item, idx) => (
              <View key={item.id} style={styles.clItem}>
                <Text style={styles.clItemNum}>{idx + 1}</Text>
                <Text style={styles.clItemText}>{item.text}</Text>
                <TouchableOpacity onPress={() => setChecklist(p => p.filter(i => i.id !== item.id))}>
                  <Feather name="x" size={14} color={theme.faint} />
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
                <Feather name={assignee ? 'send' : 'save'} size={16} color="#FFFFFF" />
                <Text style={styles.submitText}>
                  {assignee ? `Assign to ${assignee.name}` : 'Select Assignee First'}
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
  // Filter bar
  filterBar: { paddingVertical: 12, gap: 8 },
  filterChip: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.card, borderWidth: 1.5, borderColor: 'transparent' },
  filterChipActive: { backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6', borderColor: theme.accent },
  filterChipText: { fontSize: 12, fontWeight: '700', color: theme.faint },
  filterChipTextActive: { color: theme.accent },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 70, gap: 12 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 28, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  emptySubtitle: { fontSize: 13, color: theme.faint, textAlign: 'center', lineHeight: 20 },

  // Task card
  card: { backgroundColor: theme.card, borderRadius: 18, padding: 16, marginBottom: 10, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: theme.text, marginBottom: 3 },
  cardDesc: { fontSize: 12, color: theme.muted, lineHeight: 17 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  assigneeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6', borderRadius: 20, paddingRight: 10, paddingVertical: 3 },
  assigneeAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  assigneeAvatarText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  assigneeText: { fontSize: 11, fontWeight: '700', color: theme.accent },
  unassignedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.surfaceAlt, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  unassignedText: { fontSize: 11, fontWeight: '600', color: theme.faint },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  metaChipText: { fontSize: 11, fontWeight: '600', color: theme.muted },
  priorityChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  priorityChipText: { fontSize: 11, fontWeight: '700' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  progressTrack: { flex: 1, height: 5, backgroundColor: theme.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  progressText: { fontSize: 11, fontWeight: '700', color: theme.faint, minWidth: 28, textAlign: 'right' },

  // Create bar
  createBarWrap: { backgroundColor: theme.isDark ? theme.bg : '#F2F4F7', paddingTop: 8 },
  createBar: { borderRadius: 18, overflow: 'hidden' },
  createBarGrad: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  createBarIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
  createBarText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // Modal
  overlay: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.isDark ? theme.bg : '#F2F4F7', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '95%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, marginTop: 10, marginBottom: 0 },
  sheetHero: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18, marginBottom: 4 },
  sheetHeroTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  sheetHeroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginBottom: 8, marginTop: 14, letterSpacing: 0.3 },
  req: { color: theme.danger },
  input: { backgroundColor: theme.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: theme.text, marginBottom: 0 },
  inputMulti: { height: 76, textAlignVertical: 'top' },
  hintBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.card, borderRadius: 12, padding: 12 },
  hintText: { fontSize: 12, color: theme.faint, flex: 1 },
  avatarRow: { gap: 12, paddingVertical: 4 },
  avatarOption: { alignItems: 'center', gap: 6, opacity: 0.6 },
  avatarOptionActive: { opacity: 1 },
  avatarCircle: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 18, fontWeight: '800' },
  avatarLabel: { fontSize: 11, fontWeight: '600', color: theme.faint, maxWidth: 56, textAlign: 'center' },
  avatarLabelActive: { color: theme.isDark ? theme.accent : '#0F5132', fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.card, borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6', borderColor: theme.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  chipTextActive: { color: theme.accent },
  twoCol: { flexDirection: 'row', gap: 12 },
  clInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clAddBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6', alignItems: 'center', justifyContent: 'center' },
  clItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  clItemNum: { fontSize: 11, fontWeight: '800', color: theme.accent, minWidth: 16 },
  clItemText: { flex: 1, fontSize: 13, color: theme.textSecondary },
  submitBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 20, marginBottom: 8 },
  submitBtnDisabled: { opacity: 0.4 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  // Action buttons
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, paddingVertical: 8, borderWidth: 1.5 },
  actionAccept: { backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6', borderColor: theme.accent },
  actionReject: { backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED', borderColor: theme.danger },
  actionProgress: { backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE', borderColor: theme.accentAlt },
  actionEdit: { backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE', borderColor: theme.accentAlt },
  actionBtnText: { fontSize: 12, fontWeight: '700' },

  tapHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginTop: 10 },
  tapHintText: { fontSize: 10, fontWeight: '600', color: theme.faint },

  // Detail modal
  detailSheet: { backgroundColor: theme.isDark ? theme.bg : '#F2F4F7', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%', paddingTop: 10 },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8, marginBottom: 8 },
  detailTitle: { flex: 1, fontSize: 19, fontWeight: '800', color: theme.text },
  detailDesc: { fontSize: 13, color: theme.muted, lineHeight: 19, marginBottom: 16 },
  detailInfoCard: { backgroundColor: theme.card, borderRadius: 16, paddingHorizontal: 14, marginBottom: 18 },
  detailSectionLabel: { fontSize: 11, fontWeight: '700', color: theme.faint, letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  infoRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },
  infoLabel: { flex: 1, fontSize: 13, color: theme.muted, fontWeight: '600' },
  infoValue: { fontSize: 13, fontWeight: '700', color: theme.text, maxWidth: '55%', textAlign: 'right' },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  checklistText: { flex: 1, fontSize: 13, color: theme.text, fontWeight: '600' },
  checklistTextDone: { color: theme.faint, textDecorationLine: 'line-through' },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  commentAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.accentAlt, alignItems: 'center', justifyContent: 'center' },
  commentAvatarText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  commentBy: { fontSize: 12, fontWeight: '700', color: theme.text },
  commentText: { fontSize: 13, color: theme.muted, marginTop: 1 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  commentInput: { flex: 1, backgroundColor: theme.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13, color: theme.text },
  commentSendBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6', alignItems: 'center', justifyContent: 'center' },
});
