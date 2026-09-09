import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, RefreshControl,
  Modal, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { apiFetch, peekCachedResponse } from '../../api/client';
import { useSocket } from '../../services/socket';
import DateField from './DateField';

const CATEGORIES = ['Electricity', 'Water', 'Internet', 'Mobile', 'Gas', 'Rent', 'Maintenance', 'Insurance', 'Other'];
const BILLING_CYCLES = ['Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Custom'];
const STATUSES = ['Upcoming', 'Due', 'Paid', 'Overdue'];
const CATEGORY_EMOJI = {
  Electricity: '⚡', Water: '💧', Internet: '🌐', Mobile: '📱', Gas: '🔥',
  Rent: '🏠', Maintenance: '🔧', Insurance: '🛡️',
};

const EMPTY_FORM = {
  name: '', category: '', provider: '', accountNumber: '', description: '',
  expectedAmount: '', lastBillAmount: '', minAmount: '', maxAmount: '', currency: 'INR', billingCycle: 'Monthly',
  billDate: '', dueDate: '', nextDueDate: '', gracePeriod: '',
  paymentMethod: '', paymentAccount: '', autoPay: false, autoPayDate: '',
  status: 'Upcoming', lateFee: '', tax: '', reminderDays: '', notes: '', attachmentDocId: '', attachmentName: '',
};

const formFromItem = (item) => ({
  name: item.name || '', category: item.category || '', provider: item.provider || '',
  accountNumber: item.accountNumber || '', description: item.description || '',
  expectedAmount: item.expectedAmount != null ? String(item.expectedAmount) : '',
  lastBillAmount: item.lastBillAmount != null ? String(item.lastBillAmount) : '',
  minAmount: item.minAmount != null ? String(item.minAmount) : '', maxAmount: item.maxAmount != null ? String(item.maxAmount) : '',
  currency: item.currency || 'INR', billingCycle: item.billingCycle || 'Monthly',
  billDate: item.billDate || '', dueDate: item.dueDate || '', nextDueDate: item.nextDueDate || '',
  gracePeriod: item.gracePeriod != null ? String(item.gracePeriod) : '',
  paymentMethod: item.paymentMethod || '', paymentAccount: item.paymentAccount || '',
  autoPay: !!item.autoPay, autoPayDate: item.autoPayDate || '',
  status: item.status || 'Upcoming', lateFee: item.lateFee != null ? String(item.lateFee) : '',
  tax: item.tax != null ? String(item.tax) : '', reminderDays: item.reminderDays != null ? String(item.reminderDays) : '',
  notes: item.notes || '', attachmentDocId: item.attachmentDocId || '', attachmentName: item.attachmentDocId ? 'Attached document' : '',
});

const fmtShortDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—';
const ACCENT = ['#E0546E', '#C8405A'];

const billDisplay = (bill) => ({
  id: bill.id,
  name: bill.name,
  dueDate: bill.dueDate,
  amount: bill.expectedAmount ?? bill.lastBillAmount ?? 0,
  uiStatus: bill.status === 'Paid' ? 'paid' : bill.autoPay ? 'auto' : 'pending',
  category: bill.category,
  logo: CATEGORY_EMOJI[bill.category] || '🧾',
  raw: bill,
});

export default function BillScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { on } = useSocket();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [paying, setPaying] = useState(false);
  const isEditing = !!editItem;

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const b = await apiFetch('/api/finance/bills');
      setBills(Array.isArray(b) ? b : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await peekCachedResponse('/api/finance/bills').catch(() => null);
      if (!cancelled && b) { setBills(Array.isArray(b) ? b : []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const offs = [
      on('bill:created', (bill) => setBills(prev => prev.some(x => x.id === bill.id) ? prev : [bill, ...prev])),
      on('bill:updated', (bill) => setBills(prev => prev.map(x => x.id === bill.id ? bill : x))),
      on('bill:deleted', ({ id }) => setBills(prev => prev.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(off => off?.());
  }, [on]);

  useEffect(() => {
    setForm(editItem ? formFromItem(editItem) : EMPTY_FORM);
  }, [editItem, showForm]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const canSave = form.name.trim() && form.category && form.dueDate;

  const openAdd = () => { setEditItem(null); setShowForm(true); };
  const openEdit = (item) => { setEditItem(item); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditItem(null); };

  const handleDelete = () => {
    Alert.alert('Delete Bill', `Remove "${editItem.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiFetch(`/api/finance/bills/${editItem.id}`, { method: 'DELETE' }); } catch {}
        closeForm();
      } },
    ]);
  };

  const handleAttach = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      setUploading(true);
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const data = await apiFetch('/api/documents/upload', {
        method: 'POST',
        body: { fileBase64: base64, fileName: file.name, mimeType: file.mimeType || 'application/octet-stream' },
      });
      setField('attachmentDocId', data.document?.id || '');
      setField('attachmentName', file.name);
    } catch {
      // Attachment is optional — a failed upload should not block the rest of the form.
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isEditing) {
        await apiFetch(`/api/finance/bills/${editItem.id}`, { method: 'PATCH', body: form });
      } else {
        await apiFetch('/api/finance/bills', { method: 'POST', body: form });
      }
      closeForm();
    } catch {
      // Socket event updates the list on success; a failed request leaves the form open to retry.
    } finally {
      setSaving(false);
    }
  };

  const handlePay = async () => {
    if (!payModal) return;
    setPaying(true);
    try {
      await apiFetch('/api/finance/pay', {
        method: 'POST',
        body: { billId: payModal.id, amount: payModal.amount, payee: payModal.name, category: payModal.category },
      });
      setPayModal(null);
      loadData(true);
    } catch {}
    finally { setPaying(false); }
  };

  const handleBack = () => { if (showForm) closeForm(); else navigation?.goBack(); };
  const displayedBills = bills.map(billDisplay);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#14171F" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>{showForm ? (isEditing ? 'Edit Bill' : 'Add Bill') : 'Bills'}</Text>
          <Text style={styles.headerSubtitle}>{showForm ? 'Electricity, rent, internet & more' : `${displayedBills.length} total`}</Text>
        </View>
        {showForm && isEditing ? (
          <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
            <Feather name="trash-2" size={18} color="#E0546E" />
          </TouchableOpacity>
        ) : !showForm ? (
          <TouchableOpacity onPress={openAdd}>
            <LinearGradient colors={ACCENT} style={styles.addBtnGrad}>
              <Feather name="plus" size={20} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        ) : <View style={{ width: 38 }} />}
      </View>

      {showForm ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.formScroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>BASIC INFORMATION</Text>
            <Text style={styles.fieldLabel}>Bill Name <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. BESCOM Electricity" placeholderTextColor="#9AA1AE" value={form.name} onChangeText={v => setField('name', v)} />

            <Text style={styles.fieldLabel}>Bill Category <Text style={styles.required}>*</Text></Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[styles.selectChip, form.category === c && styles.selectChipActive]} onPress={() => setField('category', c)}>
                  <Text style={[styles.selectChipText, form.category === c && styles.selectChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Provider</Text>
            <TextInput style={styles.input} placeholder="e.g. BESCOM" placeholderTextColor="#9AA1AE" value={form.provider} onChangeText={v => setField('provider', v)} />

            <Text style={styles.fieldLabel}>Consumer / Account Number</Text>
            <TextInput style={styles.input} placeholder="e.g. 123456789" placeholderTextColor="#9AA1AE" value={form.accountNumber} onChangeText={v => setField('accountNumber', v)} />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput style={styles.input} placeholder="Any other details" placeholderTextColor="#9AA1AE" value={form.description} onChangeText={v => setField('description', v)} />

            <Text style={styles.sectionLabel}>AMOUNT</Text>
            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Expected Amount (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.expectedAmount} onChangeText={v => setField('expectedAmount', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Last Bill Amount (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.lastBillAmount} onChangeText={v => setField('lastBillAmount', v)} />
              </View>
            </View>

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Minimum Amount (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.minAmount} onChangeText={v => setField('minAmount', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Maximum Amount (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.maxAmount} onChangeText={v => setField('maxAmount', v)} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Billing Cycle</Text>
            <View style={styles.chipRow}>
              {BILLING_CYCLES.map(c => (
                <TouchableOpacity key={c} style={[styles.selectChip, form.billingCycle === c && styles.selectChipActive]} onPress={() => setField('billingCycle', c)}>
                  <Text style={[styles.selectChipText, form.billingCycle === c && styles.selectChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>DUE INFORMATION</Text>
            <DateField label="Bill Date" value={form.billDate} onChange={v => setField('billDate', v)} />
            <DateField label="Due Date" required value={form.dueDate} onChange={v => setField('dueDate', v)} />
            <DateField label="Next Due Date" value={form.nextDueDate} onChange={v => setField('nextDueDate', v)} />

            <Text style={styles.fieldLabel}>Grace Period (days)</Text>
            <TextInput style={styles.input} placeholder="e.g. 5" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.gracePeriod} onChangeText={v => setField('gracePeriod', v)} />

            <Text style={styles.sectionLabel}>PAYMENT</Text>
            <Text style={styles.fieldLabel}>Payment Method</Text>
            <TextInput style={styles.input} placeholder="e.g. UPI, Card, Bank" placeholderTextColor="#9AA1AE" value={form.paymentMethod} onChangeText={v => setField('paymentMethod', v)} />

            <Text style={styles.fieldLabel}>Payment Account</Text>
            <TextInput style={styles.input} placeholder="e.g. HDFC •••• 4521" placeholderTextColor="#9AA1AE" value={form.paymentAccount} onChangeText={v => setField('paymentAccount', v)} />

            <Text style={styles.fieldLabel}>Auto Pay</Text>
            <View style={styles.chipRow}>
              {[['Yes', true], ['No', false]].map(([label, val]) => (
                <TouchableOpacity key={label} style={[styles.selectChip, form.autoPay === val && styles.selectChipActive]} onPress={() => setField('autoPay', val)}>
                  <Text style={[styles.selectChipText, form.autoPay === val && styles.selectChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.autoPay ? <DateField label="Auto Pay Date" value={form.autoPayDate} onChange={v => setField('autoPayDate', v)} /> : null}

            <Text style={styles.sectionLabel}>STATUS</Text>
            <View style={styles.chipRow}>
              {STATUSES.map(s => (
                <TouchableOpacity key={s} style={[styles.selectChip, form.status === s && styles.selectChipActive]} onPress={() => setField('status', s)}>
                  <Text style={[styles.selectChipText, form.status === s && styles.selectChipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>OPTIONAL</Text>
            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Late Fee (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.lateFee} onChangeText={v => setField('lateFee', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Tax (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.tax} onChangeText={v => setField('tax', v)} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Reminder (days before due)</Text>
            <TextInput style={styles.input} placeholder="e.g. 3" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.reminderDays} onChangeText={v => setField('reminderDays', v)} />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} placeholder="Any other details..." placeholderTextColor="#9AA1AE" value={form.notes} onChangeText={v => setField('notes', v)} multiline numberOfLines={3} />

            <Text style={styles.fieldLabel}>Attach Bill</Text>
            <TouchableOpacity style={styles.attachBtn} onPress={handleAttach} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color="#E0546E" /> : <Feather name="paperclip" size={16} color="#E0546E" />}
              <Text style={styles.attachBtnText}>{form.attachmentName || 'Attach a bill copy'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]} disabled={!canSave || saving} onPress={handleSave}>
              <LinearGradient colors={ACCENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Update Bill' : 'Save Bill'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor="#E0546E" colors={['#E0546E']} />}
        >
          {loading ? (
            [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
          ) : displayedBills.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="file-text" size={32} color="#C7CBD3" />
              <Text style={styles.emptyText}>No bills added yet. Tap + to add one.</Text>
            </View>
          ) : (
            <View style={styles.sectionCard}>
              {displayedBills.map((bill, i) => (
                <TouchableOpacity
                  key={bill.id}
                  style={[styles.row, i !== displayedBills.length - 1 && styles.rowDivider]}
                  onPress={() => bill.uiStatus === 'pending' && setPayModal(bill)}
                  activeOpacity={bill.uiStatus === 'pending' ? 0.7 : 1}
                >
                  <View style={styles.iconWrap}>
                    <Text style={{ fontSize: 18 }}>{bill.logo}</Text>
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowName}>{bill.name}</Text>
                    <Text style={styles.rowSub}>Due {fmtShortDate(bill.dueDate)}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowAmount}>₹{(bill.amount || 0).toLocaleString('en-IN')}</Text>
                    <View style={[styles.badge, { backgroundColor: bill.uiStatus === 'pending' ? '#FEF3C7' : '#EFFDF6' }]}>
                      <Text style={[styles.badgeText, { color: bill.uiStatus === 'pending' ? '#D97706' : '#1F9A5A' }]}>
                        {bill.uiStatus === 'pending' ? 'Pay Now' : bill.uiStatus === 'auto' ? 'Auto' : 'Paid'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.editIconBtn} onPress={() => openEdit(bill.raw)} hitSlop={8}>
                    <Feather name="edit-2" size={14} color="#9AA1AE" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={!!payModal} transparent animationType="fade" onRequestClose={() => setPayModal(null)}>
        <TouchableWithoutFeedback onPress={() => setPayModal(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <Text style={styles.modalTitle}>Confirm Payment</Text>
                <Text style={styles.modalAmount}>₹{(payModal?.amount || 0).toLocaleString('en-IN')}</Text>
                {[['Payee', payModal?.name], ['Category', payModal?.category], ['Via', 'UPI — HDFC ••4521']].map(([k, v]) => (
                  <View key={k} style={styles.modalRow}>
                    <Text style={styles.modalRowKey}>{k}</Text>
                    <Text style={styles.modalRowVal}>{v}</Text>
                  </View>
                ))}
                <View style={styles.biometricNote}>
                  <Feather name="lock" size={13} color="#D97706" />
                  <Text style={styles.biometricText}>  Biometric required for payments ≥ ₹1,000</Text>
                </View>
                <TouchableOpacity style={styles.payBtn} onPress={handlePay} disabled={paying}>
                  <LinearGradient colors={['#1F9A5A', '#3CB37A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.payBtnGrad}>
                    <Text style={styles.payBtnText}>{paying ? 'Processing…' : 'Authenticate & Pay'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setPayModal(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  headerSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 2 },
  addBtnGrad: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FCEAED', alignItems: 'center', justifyContent: 'center' },

  scrollContent: { paddingHorizontal: 20 },
  skeleton: { height: 60, backgroundColor: '#F0F1F4', borderRadius: 14, marginBottom: 10 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13, color: '#9AA1AE', textAlign: 'center', lineHeight: 19 },

  sectionCard: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  iconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTextWrap: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  rowSub: { fontSize: 12, color: '#9AA1AE' },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowAmount: { fontSize: 15, fontWeight: '800', color: '#14171F' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' },

  formScroll: { paddingHorizontal: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5, marginTop: 8, marginBottom: 12 },
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

  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FCEAED', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 16 },
  attachBtnText: { fontSize: 13, fontWeight: '600', color: '#E0546E', flex: 1 },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  editIconBtn: { padding: 6, marginLeft: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(14,17,26,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  modalSheet: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#14171F', textAlign: 'center', marginBottom: 8 },
  modalAmount: { fontSize: 36, fontWeight: '800', color: '#14171F', textAlign: 'center', marginBottom: 20 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  modalRowKey: { fontSize: 13, color: '#9AA1AE' },
  modalRowVal: { fontSize: 13, fontWeight: '700', color: '#14171F' },
  biometricNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginVertical: 16 },
  biometricText: { fontSize: 12, color: '#D97706', fontWeight: '600' },
  payBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  payBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  payBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 16 },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#374151' },
});
