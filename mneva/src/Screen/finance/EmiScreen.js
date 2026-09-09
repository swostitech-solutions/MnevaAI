import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch, peekCachedResponse } from '../../api/client';
import { useSocket } from '../../services/socket';
import DateField from './DateField';

const EMI_TYPES = ['Loan EMI', 'Credit Card EMI', 'Product EMI', 'Other'];
const FREQUENCIES = ['Monthly', 'Bi-weekly', 'Quarterly'];
const PAYMENT_METHODS = ['Card', 'Bank', 'UPI', 'Wallet', 'Other'];
const STATUSES = ['Active', 'Completed', 'Overdue', 'Cancelled'];

const EMPTY_FORM = {
  name: '', emiType: '', provider: '', description: '',
  totalAmount: '', downPayment: '', financedAmount: '', emiAmount: '', interestRate: '', processingFee: '', totalPayable: '',
  numberOfInstallments: '', installmentsPaid: '', installmentsRemaining: '', startDate: '', nextPaymentDate: '', endDate: '', frequency: 'Monthly',
  paymentMethod: '', autoDebit: false, paymentAccount: '', paymentDay: '',
  status: 'Active', productName: '', orderReference: '', notes: '',
};

const formFromItem = (item) => ({
  name: item.name || '', emiType: item.emiType || '', provider: item.provider || '', description: item.description || '',
  totalAmount: String(item.totalAmount ?? ''), downPayment: item.downPayment != null ? String(item.downPayment) : '',
  financedAmount: String(item.financedAmount ?? ''), emiAmount: String(item.emiAmount ?? ''),
  interestRate: item.interestRate != null ? String(item.interestRate) : '', processingFee: item.processingFee != null ? String(item.processingFee) : '',
  totalPayable: item.totalPayable != null ? String(item.totalPayable) : '',
  numberOfInstallments: String(item.numberOfInstallments ?? ''), installmentsPaid: String(item.installmentsPaid ?? ''),
  installmentsRemaining: item.installmentsRemaining != null ? String(item.installmentsRemaining) : '',
  startDate: item.startDate || '', nextPaymentDate: item.nextPaymentDate || '', endDate: item.endDate || '',
  frequency: item.frequency || 'Monthly',
  paymentMethod: item.paymentMethod || '', autoDebit: !!item.autoDebit, paymentAccount: item.paymentAccount || '',
  paymentDay: item.paymentDay != null ? String(item.paymentDay) : '',
  status: item.status || 'Active', productName: item.productName || '', orderReference: item.orderReference || '', notes: item.notes || '',
});

const fmtShortDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—';
const ACCENT = ['#F5A623', '#E0901A'];

export default function EmiScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { on } = useSocket();
  const [emis, setEmis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isEditing = !!editItem;

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const e = await apiFetch('/api/finance/emis');
      setEmis(e?.emis || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const e = await peekCachedResponse('/api/finance/emis').catch(() => null);
      if (!cancelled && e) { setEmis(e.emis || []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const offs = [
      on('emi:created', (emi) => setEmis(prev => prev.some(x => x.id === emi.id) ? prev : [emi, ...prev])),
      on('emi:updated', (emi) => setEmis(prev => prev.map(x => x.id === emi.id ? emi : x))),
      on('emi:deleted', ({ id }) => setEmis(prev => prev.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(off => off?.());
  }, [on]);

  useEffect(() => {
    setForm(editItem ? formFromItem(editItem) : EMPTY_FORM);
  }, [editItem, showForm]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const canSave = form.name.trim() && form.emiType && form.provider.trim()
    && form.totalAmount && form.financedAmount && form.emiAmount
    && form.numberOfInstallments && form.startDate;

  const openAdd = () => { setEditItem(null); setShowForm(true); };
  const openEdit = (item) => { setEditItem(item); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditItem(null); };

  const handleDelete = () => {
    Alert.alert('Delete EMI', `Remove "${editItem.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiFetch(`/api/finance/emis/${editItem.id}`, { method: 'DELETE' }); } catch {}
        closeForm();
      } },
    ]);
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isEditing) {
        await apiFetch(`/api/finance/emis/${editItem.id}`, { method: 'PATCH', body: form });
      } else {
        await apiFetch('/api/finance/emis', { method: 'POST', body: form });
      }
      closeForm();
    } catch {
      // Socket event updates the list on success; a failed request leaves the form open to retry.
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => { if (showForm) closeForm(); else navigation?.goBack(); };
  const remainingFor = (emi) => emi.installmentsRemaining ?? Math.max((emi.numberOfInstallments || 0) - (emi.installmentsPaid || 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#14171F" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>{showForm ? (isEditing ? 'Edit EMI' : 'Add EMI') : 'EMIs'}</Text>
          <Text style={styles.headerSubtitle}>{showForm ? 'Any EMI — not just from a loan' : `${emis.length} total`}</Text>
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
            <Text style={styles.fieldLabel}>EMI Name <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. Laptop EMI" placeholderTextColor="#9AA1AE" value={form.name} onChangeText={v => setField('name', v)} />

            <Text style={styles.fieldLabel}>EMI Type <Text style={styles.required}>*</Text></Text>
            <View style={styles.chipRow}>
              {EMI_TYPES.map(t => (
                <TouchableOpacity key={t} style={[styles.selectChip, form.emiType === t && styles.selectChipActive]} onPress={() => setField('emiType', t)}>
                  <Text style={[styles.selectChipText, form.emiType === t && styles.selectChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Provider / Bank / Merchant <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. Amazon Pay Later" placeholderTextColor="#9AA1AE" value={form.provider} onChangeText={v => setField('provider', v)} />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput style={styles.input} placeholder="e.g. MacBook Air M2" placeholderTextColor="#9AA1AE" value={form.description} onChangeText={v => setField('description', v)} />

            <Text style={styles.sectionLabel}>AMOUNT</Text>
            <Text style={styles.fieldLabel}>Total Amount (₹) <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.totalAmount} onChangeText={v => setField('totalAmount', v)} />

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Down Payment (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.downPayment} onChangeText={v => setField('downPayment', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Financed Amount (₹) <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.financedAmount} onChangeText={v => setField('financedAmount', v)} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>EMI Amount (₹) <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.emiAmount} onChangeText={v => setField('emiAmount', v)} />

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Interest Rate (%)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.interestRate} onChangeText={v => setField('interestRate', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Processing Fee (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.processingFee} onChangeText={v => setField('processingFee', v)} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Total Payable (₹)</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.totalPayable} onChangeText={v => setField('totalPayable', v)} />

            <Text style={styles.sectionLabel}>SCHEDULE</Text>
            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>No. of Installments <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.numberOfInstallments} onChangeText={v => setField('numberOfInstallments', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Installments Paid</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.installmentsPaid} onChangeText={v => setField('installmentsPaid', v)} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Installments Remaining</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.installmentsRemaining} onChangeText={v => setField('installmentsRemaining', v)} />

            <DateField label="Start Date" required value={form.startDate} onChange={v => setField('startDate', v)} />
            <DateField label="Next Payment Date" value={form.nextPaymentDate} onChange={v => setField('nextPaymentDate', v)} />
            <DateField label="End Date" value={form.endDate} onChange={v => setField('endDate', v)} />

            <Text style={styles.fieldLabel}>Frequency</Text>
            <View style={styles.chipRow}>
              {FREQUENCIES.map(f => (
                <TouchableOpacity key={f} style={[styles.selectChip, form.frequency === f && styles.selectChipActive]} onPress={() => setField('frequency', f)}>
                  <Text style={[styles.selectChipText, form.frequency === f && styles.selectChipTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>PAYMENT</Text>
            <Text style={styles.fieldLabel}>Payment Method</Text>
            <View style={styles.chipRow}>
              {PAYMENT_METHODS.map(p => (
                <TouchableOpacity key={p} style={[styles.selectChip, form.paymentMethod === p && styles.selectChipActive]} onPress={() => setField('paymentMethod', p)}>
                  <Text style={[styles.selectChipText, form.paymentMethod === p && styles.selectChipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Auto Debit</Text>
            <View style={styles.chipRow}>
              {[['Yes', true], ['No', false]].map(([label, val]) => (
                <TouchableOpacity key={label} style={[styles.selectChip, form.autoDebit === val && styles.selectChipActive]} onPress={() => setField('autoDebit', val)}>
                  <Text style={[styles.selectChipText, form.autoDebit === val && styles.selectChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Payment Account</Text>
            <TextInput style={styles.input} placeholder="e.g. HDFC •••• 4521" placeholderTextColor="#9AA1AE" value={form.paymentAccount} onChangeText={v => setField('paymentAccount', v)} />

            <Text style={styles.fieldLabel}>Payment Day (of month)</Text>
            <TextInput style={styles.input} placeholder="e.g. 5" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.paymentDay} onChangeText={v => setField('paymentDay', v)} />

            <Text style={styles.sectionLabel}>STATUS</Text>
            <View style={styles.chipRow}>
              {STATUSES.map(s => (
                <TouchableOpacity key={s} style={[styles.selectChip, form.status === s && styles.selectChipActive]} onPress={() => setField('status', s)}>
                  <Text style={[styles.selectChipText, form.status === s && styles.selectChipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>OPTIONAL</Text>
            <Text style={styles.fieldLabel}>Product / Purchase Name</Text>
            <TextInput style={styles.input} placeholder="e.g. MacBook Air M2" placeholderTextColor="#9AA1AE" value={form.productName} onChangeText={v => setField('productName', v)} />

            <Text style={styles.fieldLabel}>Order Reference</Text>
            <TextInput style={styles.input} placeholder="e.g. Order #12345" placeholderTextColor="#9AA1AE" value={form.orderReference} onChangeText={v => setField('orderReference', v)} />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} placeholder="Any other details..." placeholderTextColor="#9AA1AE" value={form.notes} onChangeText={v => setField('notes', v)} multiline numberOfLines={3} />

            <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]} disabled={!canSave || saving} onPress={handleSave}>
              <LinearGradient colors={ACCENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Update EMI' : 'Save EMI'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor="#F5A623" colors={['#F5A623']} />}
        >
          {loading ? (
            [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
          ) : emis.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="credit-card" size={32} color="#C7CBD3" />
              <Text style={styles.emptyText}>No EMIs added yet. Tap + to add one.</Text>
            </View>
          ) : (
            <View style={styles.sectionCard}>
              {emis.map((emi, i) => (
                <TouchableOpacity key={emi.id} style={[styles.row, i !== emis.length - 1 && styles.rowDivider]} onPress={() => openEdit(emi)} activeOpacity={0.7}>
                  <View style={styles.iconWrap}>
                    <Feather name="credit-card" size={16} color="#F5A623" />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowName}>{emi.name}</Text>
                    <Text style={styles.rowSub}>{emi.provider} · {remainingFor(emi)} left</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowAmount}>₹{(emi.emiAmount || 0).toLocaleString('en-IN')}</Text>
                    <Text style={styles.rowMeta}>{fmtShortDate(emi.nextPaymentDate)}</Text>
                  </View>
                  <Feather name="edit-2" size={14} color="#9AA1AE" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
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
  rowMeta: { fontSize: 11, color: '#9AA1AE' },

  formScroll: { paddingHorizontal: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5, marginTop: 8, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  required: { color: '#E0546E' },
  input: { backgroundColor: '#F5F6F8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: '#14171F', marginBottom: 16 },
  inputMultiline: { height: 90, textAlignVertical: 'top' },
  rowFields: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  selectChip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F5F6F8', borderWidth: 1.5, borderColor: 'transparent' },
  selectChipActive: { backgroundColor: '#FEF3C7', borderColor: '#F5A623' },
  selectChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  selectChipTextActive: { color: '#D97706' },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
