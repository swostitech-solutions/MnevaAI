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

const TASK_TYPES = ['Plumbing', 'Electrical', 'Cleaning', 'Painting', 'Carpentry', 'AC Service', 'Pest Control', 'Other'];
const PRIORITY   = ['High', 'Medium', 'Low'];
const pColor = (p) => p === 'High' ? '#E0546E' : p === 'Medium' ? '#D97706' : '#1F9A5A';
const pBg    = (p) => p === 'High' ? '#FCEAED' : p === 'Medium' ? '#FEF3C7' : '#EFFDF6';

export default function HomeMaintenance({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = width < 360 ? 16 : 20;
  const { items, loading, saving, create, update, remove, byType } = useFamilyItems('home');
  const { on } = useSocket();

  const [alert, setAlert]           = useState(null);
  const [taskModal, setTaskModal]   = useState(false);
  const [contactModal, setContactModal] = useState(false);
  const [warrantyModal, setWarrantyModal] = useState(false);
  const [taskForm, setTaskForm]     = useState({ type: '', title: '', priority: '', dueDate: '', time: '', notes: '' });
  const [contactForm, setContactForm] = useState({ name: '', role: '', phone: '', notes: '' });
  const [warrantyForm, setWarrantyForm] = useState({ item: '', brand: '', purchaseDate: '', expiryDate: '', notes: '' });

  useEffect(() => {
    const off = on('family:alert', (data) => {
      if (data.domain === 'home') setAlert(data);
    });
    return () => off?.();
  }, [on]);

  const tasks      = byType('task');
  const contacts   = byType('contact');
  const warranties = byType('warranty');

  const saveTask = async () => {
    if (!taskForm.title.trim() || !taskForm.type) return;
    const remindAt = (taskForm.dueDate && taskForm.time)
      ? new Date(`${taskForm.dueDate}T${taskForm.time}:00`).toISOString()
      : taskForm.dueDate ? new Date(`${taskForm.dueDate}T09:00:00`).toISOString() : null;
    await create('task', taskForm, remindAt);
    setTaskForm({ type: '', title: '', priority: '', dueDate: '', time: '', notes: '' });
    setTaskModal(false);
  };

  const saveContact = async () => {
    if (!contactForm.name.trim()) return;
    await create('contact', contactForm);
    setContactForm({ name: '', role: '', phone: '', notes: '' });
    setContactModal(false);
  };

  const saveWarranty = async () => {
    if (!warrantyForm.item.trim()) return;
    await create('warranty', warrantyForm);
    setWarrantyForm({ item: '', brand: '', purchaseDate: '', expiryDate: '', notes: '' });
    setWarrantyModal(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {alert && (
        <View style={styles.alertBanner}>
          <LinearGradient colors={['#E0546E', '#C8405A']} style={styles.alertGrad}>
            <Text style={styles.alertEmoji}>🏠</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>🔔 {alert.type} Due</Text>
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
          <Text style={styles.headerTitle}>Home Maintenance</Text>
          <Text style={styles.headerSub}>Tasks, contacts & warranties</Text>
        </View>
        <View style={styles.headerBadge}><Text style={{ fontSize: 22 }}>🏠</Text></View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#E0546E" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
          {saving && <SavingBar color="#E0546E" />}

          {items.length > 0 && (
            <View style={styles.memoryBadge}>
              <Feather name="cpu" size={12} color="#9B72FF" />
              <Text style={styles.memoryText}>Mneva AI has memorized {items.length} home item{items.length !== 1 ? 's' : ''}</Text>
            </View>
          )}

          <SectionHeader label="MAINTENANCE TASKS" color="#E0546E" bg="#FCEAED" onAdd={() => setTaskModal(true)} />
          <View style={styles.card}>
            {tasks.length === 0 ? <EmptyRow icon="tool" text="No tasks added" /> : tasks.map((t, i) => (
              <View key={t.id} style={[styles.listRow, i < tasks.length - 1 && styles.divider]}>
                <TouchableOpacity onPress={() => update(t.id, { done: !t.done })}
                  style={[styles.rowIcon, { backgroundColor: t.done ? '#EFFDF6' : '#FCEAED' }]}>
                  <Feather name={t.done ? 'check-circle' : 'tool'} size={14} color={t.done ? '#1F9A5A' : '#E0546E'} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, t.done && { textDecorationLine: 'line-through', color: '#9AA1AE' }]}>{t.data.title}</Text>
                  <Text style={styles.rowMeta}>{[t.data.type, t.data.dueDate ? `Due: ${t.data.dueDate}` : null].filter(Boolean).join(' · ')}</Text>
                </View>
                {t.data.priority ? <View style={[styles.tag, { backgroundColor: pBg(t.data.priority) }]}><Text style={[styles.tagText, { color: pColor(t.data.priority) }]}>{t.data.priority}</Text></View> : null}
                {t.remindAt && <View style={styles.remindTag}><Feather name="bell" size={10} color="#E0546E" /></View>}
                <TouchableOpacity onPress={() => remove(t.id)} style={{ padding: 4 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
              </View>
            ))}
          </View>

          <SectionHeader label="SERVICE CONTACTS" color="#4FA6E8" bg="#EAF3FD" onAdd={() => setContactModal(true)} />
          <View style={styles.card}>
            {contacts.length === 0 ? <EmptyRow icon="phone" text="No contacts added" /> : contacts.map((c, i) => (
              <View key={c.id} style={[styles.listRow, i < contacts.length - 1 && styles.divider]}>
                <View style={[styles.rowIcon, { backgroundColor: '#EAF3FD' }]}><Feather name="phone" size={14} color="#4FA6E8" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{c.data.name}</Text>
                  <Text style={styles.rowMeta}>{[c.data.role, c.data.phone].filter(Boolean).join(' · ')}</Text>
                </View>
                <TouchableOpacity onPress={() => remove(c.id)} style={{ padding: 4 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
              </View>
            ))}
          </View>

          <SectionHeader label="WARRANTIES & APPLIANCES" color="#D97706" bg="#FEF3C7" onAdd={() => setWarrantyModal(true)} />
          <View style={styles.card}>
            {warranties.length === 0 ? <EmptyRow icon="shield" text="No warranties added" /> : warranties.map((w, i) => (
              <View key={w.id} style={[styles.listRow, i < warranties.length - 1 && styles.divider]}>
                <View style={[styles.rowIcon, { backgroundColor: '#FEF3C7' }]}><Feather name="shield" size={14} color="#D97706" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{w.data.item}{w.data.brand ? ` · ${w.data.brand}` : ''}</Text>
                  <Text style={styles.rowMeta}>{w.data.expiryDate ? `Expires: ${w.data.expiryDate}` : w.data.purchaseDate ? `Bought: ${w.data.purchaseDate}` : ''}</Text>
                </View>
                <TouchableOpacity onPress={() => remove(w.id)} style={{ padding: 4 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Task Modal */}
      <SheetModal visible={taskModal} onClose={() => setTaskModal(false)} insets={insets} title="Add Task" gradColors={['#E0546E', '#C8405A']} icon="tool">
        <FLabel>Task Type *</FLabel>
        <View style={styles.chipRow}>
          {TASK_TYPES.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, taskForm.type === t && styles.chipActive]} onPress={() => setTaskForm(f => ({ ...f, type: t }))}>
              <Text style={[styles.chipText, taskForm.type === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <FLabel>Task Title *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Fix kitchen tap" placeholderTextColor="#9AA1AE" value={taskForm.title} onChangeText={v => setTaskForm(f => ({ ...f, title: v }))} />
        <FLabel>Priority</FLabel>
        <View style={styles.chipRow}>
          {PRIORITY.map(p => (
            <TouchableOpacity key={p} style={[styles.chip, taskForm.priority === p && { backgroundColor: pBg(p), borderColor: pColor(p) }]} onPress={() => setTaskForm(f => ({ ...f, priority: p }))}>
              <Text style={[styles.chipText, taskForm.priority === p && { color: pColor(p) }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><FLabel>Due Date (YYYY-MM-DD)</FLabel><TextInput style={styles.input} placeholder="2025-08-15" placeholderTextColor="#9AA1AE" value={taskForm.dueDate} onChangeText={v => setTaskForm(f => ({ ...f, dueDate: v }))} keyboardType="numeric" /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><FLabel>Time (HH:MM)</FLabel><TextInput style={styles.input} placeholder="09:00" placeholderTextColor="#9AA1AE" value={taskForm.time} onChangeText={v => setTaskForm(f => ({ ...f, time: v }))} keyboardType="numeric" /></View>
        </View>
        <SaveBtn onPress={saveTask} disabled={!taskForm.title.trim() || !taskForm.type} colors={['#E0546E', '#C8405A']} label="Save Task" />
      </SheetModal>

      {/* Contact Modal */}
      <SheetModal visible={contactModal} onClose={() => setContactModal(false)} insets={insets} title="Add Service Contact" gradColors={['#4FA6E8', '#2E86C8']} icon="phone">
        <FLabel>Name *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Ramesh Plumber" placeholderTextColor="#9AA1AE" value={contactForm.name} onChangeText={v => setContactForm(f => ({ ...f, name: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><FLabel>Role</FLabel><TextInput style={styles.input} placeholder="e.g. Plumber" placeholderTextColor="#9AA1AE" value={contactForm.role} onChangeText={v => setContactForm(f => ({ ...f, role: v }))} /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><FLabel>Phone</FLabel><TextInput style={styles.input} placeholder="+91 98765..." placeholderTextColor="#9AA1AE" value={contactForm.phone} onChangeText={v => setContactForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" /></View>
        </View>
        <SaveBtn onPress={saveContact} disabled={!contactForm.name.trim()} colors={['#4FA6E8', '#2E86C8']} label="Save Contact" />
      </SheetModal>

      {/* Warranty Modal */}
      <SheetModal visible={warrantyModal} onClose={() => setWarrantyModal(false)} insets={insets} title="Add Warranty" gradColors={['#D97706', '#B45309']} icon="shield">
        <FLabel>Item Name *</FLabel>
        <TextInput style={styles.input} placeholder="e.g. Washing Machine" placeholderTextColor="#9AA1AE" value={warrantyForm.item} onChangeText={v => setWarrantyForm(f => ({ ...f, item: v }))} />
        <FLabel>Brand</FLabel>
        <TextInput style={styles.input} placeholder="e.g. LG, Samsung" placeholderTextColor="#9AA1AE" value={warrantyForm.brand} onChangeText={v => setWarrantyForm(f => ({ ...f, brand: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><FLabel>Purchase Date</FLabel><TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={warrantyForm.purchaseDate} onChangeText={v => setWarrantyForm(f => ({ ...f, purchaseDate: v }))} keyboardType="numeric" /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><FLabel>Expiry Date</FLabel><TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={warrantyForm.expiryDate} onChangeText={v => setWarrantyForm(f => ({ ...f, expiryDate: v }))} keyboardType="numeric" /></View>
        </View>
        <SaveBtn onPress={saveWarranty} disabled={!warrantyForm.item.trim()} colors={['#D97706', '#B45309']} label="Save Warranty" />
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
  headerBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  savingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FCEAED', borderRadius: 10, padding: 10, marginBottom: 12 },
  savingText: { fontSize: 12, color: '#E0546E', fontWeight: '600' },
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
  remindTag: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#FCEAED', alignItems: 'center', justifyContent: 'center' },
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
