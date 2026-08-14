import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch } from '../api/client';
import { useSocket } from '../services/socket';
import { onAppDataRefresh } from '../services/dataRefresh';

const FREQUENCIES = ['Once daily', 'Twice daily', 'Thrice daily', 'Every 8 hrs', 'Weekly', 'As needed'];
const MEAL_TIMES  = ['Before meal', 'After meal', 'With meal', 'Empty stomach'];
const PARENTS     = ['Dad', 'Mom', 'Both'];

const parentColor = (p) => p === 'Dad' ? '#4FA6E8' : p === 'Mom' ? '#E0546E' : '#9B72FF';
const parentBg    = (p) => p === 'Dad' ? '#EAF3FD' : p === 'Mom' ? '#FCEAED' : '#F3EFFE';

const EMPTY_FORM = { medName: '', dosage: '', frequency: '', mealTime: '', parent: '', startDate: '', duration: '', doctor: '', notes: '', refillDate: '' };

export default function ParentMedication({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = width < 360 ? 16 : 20;
  const { on } = useSocket();

  const [medications, setMedications] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [modal, setModal]             = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedMed, setSelectedMed] = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/family/parent-medications');
      if (mountedRef.current) setMedications(res.medications || []);
    } catch { /* silent */ }
    finally { if (mountedRef.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const unsub = onAppDataRefresh(load);
    return () => { mountedRef.current = false; unsub(); };
  }, [load]);

  // Real-time socket events
  useEffect(() => {
    const offCreated = on('parent_med:created', (med) => {
      setMedications(prev => prev.find(m => m.id === med.id) ? prev : [med, ...prev]);
    });
    const offUpdated = on('parent_med:updated', (med) => {
      setMedications(prev => prev.map(m => m.id === med.id ? med : m));
      setSelectedMed(prev => prev?.id === med.id ? med : prev);
    });
    const offDeleted = on('parent_med:deleted', ({ id }) => {
      setMedications(prev => prev.filter(m => m.id !== id));
    });
    return () => { offCreated?.(); offUpdated?.(); offDeleted?.(); };
  }, [on]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const canSave = form.medName.trim() && form.dosage.trim() && form.frequency && form.parent;

  const saveMedication = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await apiFetch('/api/family/parent-medications', {
        method: 'POST',
        body: form,
      });
      setForm(EMPTY_FORM);
      setModal(false);
    } catch { /* socket will update state */ }
    finally { setSaving(false); }
  };

  const toggleActive = async (med) => {
    try {
      await apiFetch(`/api/family/parent-medications/${med.id}`, {
        method: 'PATCH',
        body: { active: !med.active },
      });
    } catch { /* socket will update */ }
  };

  const deleteMed = async (id) => {
    try {
      await apiFetch(`/api/family/parent-medications/${id}`, { method: 'DELETE' });
      setDetailModal(false);
    } catch { /* socket will update */ }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: pad }]}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#14171F" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Parent Medication</Text>
          <Text style={styles.headerSubtitle}>Mneva remembers & tracks in real-time</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => { setForm(EMPTY_FORM); setModal(true); }}>
          <LinearGradient colors={['#E0546E', '#C8405A']} style={styles.addBtnGrad}>
            <Feather name="plus" size={18} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#E0546E" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: pad, paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary chips */}
          <View style={styles.summaryRow}>
            {[
              { bg: '#FCEAED', icon: 'activity', color: '#E0546E', label: `${medications.filter(m => m.active).length} Active` },
              { bg: '#EAF3FD', icon: 'user',     color: '#4FA6E8', label: `${medications.filter(m => m.parent === 'Dad' || m.parent === 'Both').length} Dad` },
              { bg: '#FCEAED', icon: 'user',     color: '#E0546E', label: `${medications.filter(m => m.parent === 'Mom' || m.parent === 'Both').length} Mom` },
              { bg: '#FEF3C7', icon: 'refresh-cw', color: '#D97706', label: `${medications.filter(m => m.refillDate).length} Refills` },
            ].map((c, i) => (
              <View key={i} style={[styles.summaryChip, { backgroundColor: c.bg }]}>
                <Feather name={c.icon} size={13} color={c.color} />
                <Text style={[styles.summaryChipText, { color: c.color }]}>{c.label}</Text>
              </View>
            ))}
          </View>

          {/* AI Memory badge */}
          {medications.length > 0 && (
            <View style={styles.memoryBadge}>
              <Feather name="cpu" size={12} color="#9B72FF" />
              <Text style={styles.memoryBadgeText}>Mneva AI has memorized {medications.filter(m => m.active).length} active medication{medications.filter(m => m.active).length !== 1 ? 's' : ''} for your parents</Text>
            </View>
          )}

          {medications.length === 0 ? (
            <View style={styles.emptyWrap}>
              <LinearGradient colors={['#FCEAED', '#FAD4DB']} style={styles.emptyIcon}>
                <Feather name="activity" size={32} color="#E0546E" />
              </LinearGradient>
              <Text style={styles.emptyTitle}>No medications added</Text>
              <Text style={styles.emptySubtitle}>Tap + to add. Mneva AI will remember and track them.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>ALL MEDICATIONS</Text>
              {medications.map((med) => (
                <TouchableOpacity
                  key={med.id}
                  style={[styles.medCard, !med.active && styles.medCardInactive]}
                  activeOpacity={0.8}
                  onPress={() => { setSelectedMed(med); setDetailModal(true); }}
                >
                  <View style={[styles.medIconWrap, { backgroundColor: parentBg(med.parent) }]}>
                    <Feather name="activity" size={18} color={parentColor(med.parent)} />
                  </View>
                  <View style={styles.medCardBody}>
                    <View style={styles.medCardTopRow}>
                      <Text style={[styles.medName, !med.active && styles.medNameInactive]}>{med.medName}</Text>
                      <View style={[styles.parentTag, { backgroundColor: parentBg(med.parent) }]}>
                        <Text style={[styles.parentTagText, { color: parentColor(med.parent) }]}>{med.parent}</Text>
                      </View>
                    </View>
                    <Text style={styles.medDosage}>{med.dosage} · {med.frequency}</Text>
                    {med.mealTime ? <Text style={styles.medMeta}>{med.mealTime}</Text> : null}
                    <View style={styles.medTagRow}>
                      {med.refillDate ? (
                        <View style={styles.refillTag}>
                          <Feather name="refresh-cw" size={10} color="#D97706" />
                          <Text style={styles.refillTagText}>Refill: {med.refillDate}</Text>
                        </View>
                      ) : null}
                      {med.doctor ? (
                        <View style={styles.doctorTag}>
                          <Feather name="user" size={10} color="#6B7280" />
                          <Text style={styles.doctorTagText}>Dr. {med.doctor}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => toggleActive(med)} style={styles.toggleBtn}>
                    <View style={[styles.toggleDot, { backgroundColor: med.active ? '#1F9A5A' : '#D1D5DB' }]} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Add Medication Modal ── */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <LinearGradient colors={['#E0546E', '#C8405A']} style={styles.sheetIconGrad}>
                <Feather name="activity" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Add Medication</Text>
                <Text style={styles.sheetSubtitle}>Mneva AI will remember this</Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>For <Text style={styles.required}>*</Text></Text>
              <View style={styles.chipRow}>
                {PARENTS.map(p => (
                  <TouchableOpacity key={p} style={[styles.selectChip, form.parent === p && { backgroundColor: parentColor(p), borderColor: parentColor(p) }]} onPress={() => setField('parent', p)}>
                    <Text style={[styles.selectChipText, form.parent === p && { color: '#FFFFFF' }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Medicine Name <Text style={styles.required}>*</Text></Text>
              <TextInput style={styles.input} placeholder="e.g. Metformin 500mg" placeholderTextColor="#9AA1AE" value={form.medName} onChangeText={v => setField('medName', v)} />

              <Text style={styles.fieldLabel}>Dosage <Text style={styles.required}>*</Text></Text>
              <TextInput style={styles.input} placeholder="e.g. 1 tablet, 5ml" placeholderTextColor="#9AA1AE" value={form.dosage} onChangeText={v => setField('dosage', v)} />

              <Text style={styles.fieldLabel}>Frequency <Text style={styles.required}>*</Text></Text>
              <View style={styles.chipRow}>
                {FREQUENCIES.map(f => (
                  <TouchableOpacity key={f} style={[styles.selectChip, form.frequency === f && styles.selectChipActive]} onPress={() => setField('frequency', f)}>
                    <Text style={[styles.selectChipText, form.frequency === f && styles.selectChipTextActive]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>When to take</Text>
              <View style={styles.chipRow}>
                {MEAL_TIMES.map(m => (
                  <TouchableOpacity key={m} style={[styles.selectChip, form.mealTime === m && styles.selectChipActive]} onPress={() => setField('mealTime', m)}>
                    <Text style={[styles.selectChipText, form.mealTime === m && styles.selectChipTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Start Date</Text>
                  <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={form.startDate} onChangeText={v => setField('startDate', v)} keyboardType="numeric" />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Duration</Text>
                  <TextInput style={styles.input} placeholder="e.g. 30 days" placeholderTextColor="#9AA1AE" value={form.duration} onChangeText={v => setField('duration', v)} />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Next Refill Date</Text>
              <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={form.refillDate} onChangeText={v => setField('refillDate', v)} keyboardType="numeric" />

              <Text style={styles.fieldLabel}>Doctor Name</Text>
              <TextInput style={styles.input} placeholder="e.g. Dr. Sharma" placeholderTextColor="#9AA1AE" value={form.doctor} onChangeText={v => setField('doctor', v)} />

              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput style={[styles.input, styles.inputMultiline]} placeholder="Special instructions or side effects..." placeholderTextColor="#9AA1AE" value={form.notes} onChangeText={v => setField('notes', v)} multiline numberOfLines={3} />

              <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]} disabled={!canSave || saving} onPress={saveMedication}>
                <LinearGradient colors={['#E0546E', '#C8405A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                  {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                  <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save & Teach Mneva AI'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Detail Modal ── */}
      <Modal visible={detailModal} transparent animationType="slide" onRequestClose={() => setDetailModal(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setDetailModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          {selectedMed && (
            <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <LinearGradient colors={[parentColor(selectedMed.parent), parentColor(selectedMed.parent) + 'CC']} style={styles.sheetIconGrad}>
                  <Feather name="activity" size={20} color="#FFFFFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>{selectedMed.medName}</Text>
                  <Text style={styles.sheetSubtitle}>For {selectedMed.parent}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteMed(selectedMed.id)} style={styles.deleteBtn}>
                  <Feather name="trash-2" size={18} color="#E0546E" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {[
                  { label: 'Dosage',       value: selectedMed.dosage,                                    icon: 'droplet' },
                  { label: 'Frequency',    value: selectedMed.frequency,                                 icon: 'clock' },
                  { label: 'When to take', value: selectedMed.mealTime,                                  icon: 'coffee' },
                  { label: 'Start Date',   value: selectedMed.startDate,                                 icon: 'calendar' },
                  { label: 'Duration',     value: selectedMed.duration,                                  icon: 'bar-chart-2' },
                  { label: 'Next Refill',  value: selectedMed.refillDate,                                icon: 'refresh-cw' },
                  { label: 'Doctor',       value: selectedMed.doctor ? `Dr. ${selectedMed.doctor}` : null, icon: 'user' },
                  { label: 'Notes',        value: selectedMed.notes,                                     icon: 'file-text' },
                ].filter(r => r.value).map((row, i) => (
                  <View key={i} style={styles.detailRow}>
                    <View style={styles.detailIconWrap}>
                      <Feather name={row.icon} size={14} color="#6B7280" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailLabel}>{row.label}</Text>
                      <Text style={styles.detailValue}>{row.value}</Text>
                    </View>
                  </View>
                ))}

                {/* AI memory note */}
                <View style={styles.aiMemoryNote}>
                  <Feather name="cpu" size={13} color="#9B72FF" />
                  <Text style={styles.aiMemoryNoteText}>Mneva AI knows about this medication. Ask "What medicines does Dad take?" in chat.</Text>
                </View>

                <TouchableOpacity style={[styles.saveBtn, { marginTop: 8 }]} onPress={() => { toggleActive(selectedMed); setDetailModal(false); }}>
                  <LinearGradient
                    colors={selectedMed.active ? ['#6B7280', '#4B5563'] : ['#1F9A5A', '#3CB37A']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.saveBtnGrad}
                  >
                    <Feather name={selectedMed.active ? 'pause-circle' : 'play-circle'} size={16} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>{selectedMed.active ? 'Mark as Inactive' : 'Mark as Active'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  headerSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 1 },
  addBtn: { borderRadius: 14, overflow: 'hidden' },
  addBtnGrad: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingTop: 4 },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  summaryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  summaryChipText: { fontSize: 12, fontWeight: '700' },

  memoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F3EFFE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  memoryBadgeText: { fontSize: 12, color: '#7C3AED', fontWeight: '600', flex: 1 },

  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#14171F' },
  emptySubtitle: { fontSize: 13, color: '#9AA1AE', textAlign: 'center' },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5, marginBottom: 12 },

  medCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  medCardInactive: { opacity: 0.5 },
  medIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  medCardBody: { flex: 1 },
  medCardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  medName: { fontSize: 15, fontWeight: '800', color: '#14171F' },
  medNameInactive: { color: '#9AA1AE' },
  parentTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  parentTagText: { fontSize: 10, fontWeight: '800' },
  medDosage: { fontSize: 13, color: '#374151', fontWeight: '600', marginBottom: 2 },
  medMeta: { fontSize: 12, color: '#9AA1AE', marginBottom: 4 },
  medTagRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  refillTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  refillTagText: { fontSize: 10, fontWeight: '700', color: '#D97706' },
  doctorTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5F6F8', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  doctorTagText: { fontSize: 10, fontWeight: '600', color: '#6B7280' },
  toggleBtn: { padding: 6 },
  toggleDot: { width: 12, height: 12, borderRadius: 6 },

  overlay: { flex: 1, backgroundColor: 'rgba(14,17,26,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E5EA', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetIconGrad: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  sheetSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 2 },
  deleteBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FCEAED', alignItems: 'center', justifyContent: 'center' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  required: { color: '#E0546E' },
  input: { backgroundColor: '#F5F6F8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: '#14171F', marginBottom: 16 },
  inputMultiline: { height: 90, textAlignVertical: 'top' },
  rowFields: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  selectChip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F5F6F8', borderWidth: 1.5, borderColor: 'transparent' },
  selectChipActive: { backgroundColor: '#FCEAED', borderColor: '#E0546E' },
  selectChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  selectChipTextActive: { color: '#E0546E' },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  detailIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F5F6F8', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  detailLabel: { fontSize: 11, fontWeight: '600', color: '#9AA1AE', marginBottom: 3 },
  detailValue: { fontSize: 14, fontWeight: '700', color: '#14171F' },

  aiMemoryNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F3EFFE', borderRadius: 12, padding: 12, marginTop: 16, marginBottom: 4 },
  aiMemoryNoteText: { fontSize: 12, color: '#7C3AED', fontWeight: '600', flex: 1, lineHeight: 18 },
});
