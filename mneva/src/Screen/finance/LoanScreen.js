import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { apiFetch, peekCachedResponse } from '../../api/client';
import { useSocket } from '../../services/socket';
import { useTheme } from '../../context/ThemeContext';
import DateField from './DateField';

const LOAN_TYPES = ['Personal Loan', 'Home Loan', 'Car Loan', 'Education Loan', 'Business Loan', 'Gold Loan', 'Other'];
const STATUSES = ['Active', 'Closed', 'Pending'];
const INTEREST_TYPES = ['Fixed', 'Floating'];
const INTEREST_CALCULATIONS = ['Reducing Balance', 'Flat Rate'];
const EMI_FREQUENCIES = ['Monthly', 'Bi-weekly', 'Quarterly'];

const EMPTY_FORM = {
  name: '', loanType: '', lenderName: '', accountNumber: '', purpose: '', status: 'Active',
  originalAmount: '', outstandingAmount: '', amountPaid: '', processingFee: '', otherCharges: '',
  interestRate: '', interestType: '', interestCalculation: '',
  emiAmount: '', emiFrequency: 'Monthly', emiStartDate: '', nextEmiDate: '', emiEndDate: '',
  numberOfEmis: '', emisPaid: '', emisRemaining: '',
  loanStartDate: '', loanMaturityDate: '',
  autoDebit: false, paymentAccount: '', paymentDay: '',
  prepaymentAllowed: null, prepaymentCharges: '', notes: '', attachmentDocId: '', attachmentName: '',
};

const formFromItem = (item) => ({
  name: item.name || '', loanType: item.loanType || '', lenderName: item.lenderName || '',
  accountNumber: item.accountNumber || '', purpose: item.purpose || '', status: item.status || 'Active',
  originalAmount: String(item.originalAmount ?? ''), outstandingAmount: String(item.outstandingAmount ?? ''),
  amountPaid: String(item.amountPaid ?? ''), processingFee: item.processingFee != null ? String(item.processingFee) : '',
  otherCharges: item.otherCharges != null ? String(item.otherCharges) : '',
  interestRate: String(item.interestRate ?? ''), interestType: item.interestType || '', interestCalculation: item.interestCalculation || '',
  emiAmount: String(item.emiAmount ?? ''), emiFrequency: item.emiFrequency || 'Monthly',
  emiStartDate: item.emiStartDate || '', nextEmiDate: item.nextEmiDate || '', emiEndDate: item.emiEndDate || '',
  numberOfEmis: String(item.numberOfEmis ?? ''), emisPaid: String(item.emisPaid ?? ''),
  emisRemaining: item.emisRemaining != null ? String(item.emisRemaining) : '',
  loanStartDate: item.loanStartDate || '', loanMaturityDate: item.loanMaturityDate || '',
  autoDebit: !!item.autoDebit, paymentAccount: item.paymentAccount || '',
  paymentDay: item.paymentDay != null ? String(item.paymentDay) : '',
  prepaymentAllowed: item.prepaymentAllowed ?? null,
  prepaymentCharges: item.prepaymentCharges != null ? String(item.prepaymentCharges) : '',
  notes: item.notes || '', attachmentDocId: item.attachmentDocId || '', attachmentName: item.attachmentDocId ? 'Attached document' : '',
});

const fmtShortDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—';
const ACCENT = ['#4FA6E8', '#3D8BFF'];

export default function LoanScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { on } = useSocket();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isEditing = !!editItem;

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const l = await apiFetch('/api/finance/loans');
      setLoans(l?.loans || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const l = await peekCachedResponse('/api/finance/loans').catch(() => null);
      if (!cancelled && l) { setLoans(l.loans || []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const offs = [
      on('loan:created', (loan) => setLoans(prev => prev.some(x => x.id === loan.id) ? prev : [loan, ...prev])),
      on('loan:updated', (loan) => setLoans(prev => prev.map(x => x.id === loan.id ? loan : x))),
      on('loan:deleted', ({ id }) => setLoans(prev => prev.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(off => off?.());
  }, [on]);

  useEffect(() => {
    setForm(editItem ? formFromItem(editItem) : EMPTY_FORM);
  }, [editItem, showForm]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const canSave = form.name.trim() && form.loanType && form.lenderName.trim()
    && form.originalAmount && form.outstandingAmount && form.interestRate
    && form.interestType && form.interestCalculation && form.emiAmount
    && form.numberOfEmis && form.loanStartDate && form.emiStartDate;

  const openAdd = () => { setEditItem(null); setShowForm(true); };
  const openEdit = (item) => { setEditItem(item); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditItem(null); };

  const handleDelete = () => {
    Alert.alert('Delete Loan', `Remove "${editItem.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiFetch(`/api/finance/loans/${editItem.id}`, { method: 'DELETE' }); } catch {}
        closeForm();
      } },
    ]);
  };

  const handleAttach = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
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
        await apiFetch(`/api/finance/loans/${editItem.id}`, { method: 'PATCH', body: form });
      } else {
        await apiFetch('/api/finance/loans', { method: 'POST', body: form });
      }
      closeForm();
    } catch {
      // Socket event updates the list on success; a failed request leaves the form open to retry.
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => { if (showForm) closeForm(); else navigation?.goBack(); };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>{showForm ? (isEditing ? 'Edit Loan' : 'Add Loan') : 'Loans'}</Text>
          <Text style={styles.headerSubtitle}>{showForm ? 'Home, car, personal & more' : `${loans.length} total`}</Text>
        </View>
        {showForm && isEditing ? (
          <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
            <Feather name="trash-2" size={18} color={theme.danger} />
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={[styles.formScroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>BASIC INFORMATION</Text>
            <Text style={styles.fieldLabel}>Loan Name <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. Home Loan — HDFC" placeholderTextColor={theme.placeholder} value={form.name} onChangeText={v => setField('name', v)} />

            <Text style={styles.fieldLabel}>Loan Type <Text style={styles.required}>*</Text></Text>
            <View style={styles.chipRow}>
              {LOAN_TYPES.map(t => (
                <TouchableOpacity key={t} style={[styles.selectChip, form.loanType === t && styles.selectChipActive]} onPress={() => setField('loanType', t)}>
                  <Text style={[styles.selectChipText, form.loanType === t && styles.selectChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Lender / Bank Name <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. HDFC Bank" placeholderTextColor={theme.placeholder} value={form.lenderName} onChangeText={v => setField('lenderName', v)} />

            <Text style={styles.fieldLabel}>Loan Account Number</Text>
            <TextInput style={styles.input} placeholder="e.g. ••••4521" placeholderTextColor={theme.placeholder} value={form.accountNumber} onChangeText={v => setField('accountNumber', v)} />

            <Text style={styles.fieldLabel}>Purpose</Text>
            <TextInput style={styles.input} placeholder="e.g. Home renovation" placeholderTextColor={theme.placeholder} value={form.purpose} onChangeText={v => setField('purpose', v)} />

            <Text style={styles.fieldLabel}>Status</Text>
            <View style={styles.chipRow}>
              {STATUSES.map(s => (
                <TouchableOpacity key={s} style={[styles.selectChip, form.status === s && styles.selectChipActive]} onPress={() => setField('status', s)}>
                  <Text style={[styles.selectChipText, form.status === s && styles.selectChipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>LOAN AMOUNT</Text>
            <Text style={styles.fieldLabel}>Original Loan Amount (₹) <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.originalAmount} onChangeText={v => setField('originalAmount', v)} />

            <Text style={styles.fieldLabel}>Current Outstanding Amount (₹) <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.outstandingAmount} onChangeText={v => setField('outstandingAmount', v)} />

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Amount Already Paid (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.amountPaid} onChangeText={v => setField('amountPaid', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Processing Fee (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.processingFee} onChangeText={v => setField('processingFee', v)} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Other Charges (₹)</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.otherCharges} onChangeText={v => setField('otherCharges', v)} />

            <Text style={styles.sectionLabel}>INTEREST DETAILS</Text>
            <Text style={styles.fieldLabel}>Interest Rate (%) <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. 8.5" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.interestRate} onChangeText={v => setField('interestRate', v)} />

            <Text style={styles.fieldLabel}>Interest Type <Text style={styles.required}>*</Text></Text>
            <View style={styles.chipRow}>
              {INTEREST_TYPES.map(t => (
                <TouchableOpacity key={t} style={[styles.selectChip, form.interestType === t && styles.selectChipActive]} onPress={() => setField('interestType', t)}>
                  <Text style={[styles.selectChipText, form.interestType === t && styles.selectChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Interest Calculation <Text style={styles.required}>*</Text></Text>
            <View style={styles.chipRow}>
              {INTEREST_CALCULATIONS.map(t => (
                <TouchableOpacity key={t} style={[styles.selectChip, form.interestCalculation === t && styles.selectChipActive]} onPress={() => setField('interestCalculation', t)}>
                  <Text style={[styles.selectChipText, form.interestCalculation === t && styles.selectChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>EMI DETAILS</Text>
            <Text style={styles.fieldLabel}>EMI Amount (₹) <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.emiAmount} onChangeText={v => setField('emiAmount', v)} />

            <Text style={styles.fieldLabel}>EMI Frequency</Text>
            <View style={styles.chipRow}>
              {EMI_FREQUENCIES.map(f => (
                <TouchableOpacity key={f} style={[styles.selectChip, form.emiFrequency === f && styles.selectChipActive]} onPress={() => setField('emiFrequency', f)}>
                  <Text style={[styles.selectChipText, form.emiFrequency === f && styles.selectChipTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <DateField label="EMI Start Date" required value={form.emiStartDate} onChange={v => setField('emiStartDate', v)} />
            <DateField label="Next EMI Date" value={form.nextEmiDate} onChange={v => setField('nextEmiDate', v)} />
            <DateField label="EMI End Date" value={form.emiEndDate} onChange={v => setField('emiEndDate', v)} />

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Number of EMIs <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="number-pad" value={form.numberOfEmis} onChangeText={v => setField('numberOfEmis', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>EMIs Paid</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="number-pad" value={form.emisPaid} onChangeText={v => setField('emisPaid', v)} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>EMIs Remaining</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="number-pad" value={form.emisRemaining} onChangeText={v => setField('emisRemaining', v)} />

            <Text style={styles.sectionLabel}>LOAN DATES</Text>
            <DateField label="Loan Start Date" required value={form.loanStartDate} onChange={v => setField('loanStartDate', v)} />
            <DateField label="Loan Maturity Date" value={form.loanMaturityDate} onChange={v => setField('loanMaturityDate', v)} />

            <Text style={styles.sectionLabel}>PAYMENT</Text>
            <Text style={styles.fieldLabel}>Auto Debit?</Text>
            <View style={styles.chipRow}>
              {[['Yes', true], ['No', false]].map(([label, val]) => (
                <TouchableOpacity key={label} style={[styles.selectChip, form.autoDebit === val && styles.selectChipActive]} onPress={() => setField('autoDebit', val)}>
                  <Text style={[styles.selectChipText, form.autoDebit === val && styles.selectChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Payment Account / Bank</Text>
            <TextInput style={styles.input} placeholder="e.g. HDFC •••• 4521" placeholderTextColor={theme.placeholder} value={form.paymentAccount} onChangeText={v => setField('paymentAccount', v)} />

            <Text style={styles.fieldLabel}>Payment Day (of month)</Text>
            <TextInput style={styles.input} placeholder="e.g. 5" placeholderTextColor={theme.placeholder} keyboardType="number-pad" value={form.paymentDay} onChangeText={v => setField('paymentDay', v)} />

            <Text style={styles.sectionLabel}>OPTIONAL</Text>
            <Text style={styles.fieldLabel}>Prepayment Allowed?</Text>
            <View style={styles.chipRow}>
              {[['Yes', true], ['No', false]].map(([label, val]) => (
                <TouchableOpacity key={label} style={[styles.selectChip, form.prepaymentAllowed === val && styles.selectChipActive]} onPress={() => setField('prepaymentAllowed', val)}>
                  <Text style={[styles.selectChipText, form.prepaymentAllowed === val && styles.selectChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Prepayment Charges (₹)</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.prepaymentCharges} onChangeText={v => setField('prepaymentCharges', v)} />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} placeholder="Any other details..." placeholderTextColor={theme.placeholder} value={form.notes} onChangeText={v => setField('notes', v)} multiline numberOfLines={3} />

            <Text style={styles.fieldLabel}>Attach Document</Text>
            <TouchableOpacity style={styles.attachBtn} onPress={handleAttach} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color={theme.info} /> : <Feather name="paperclip" size={16} color={theme.info} />}
              <Text style={styles.attachBtnText}>{form.attachmentName || 'Attach a document'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]} disabled={!canSave || saving} onPress={handleSave}>
              <LinearGradient colors={ACCENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Update Loan' : 'Save Loan'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor={theme.info} colors={[theme.info]} />}
        >
          {loading ? (
            [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
          ) : loans.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="briefcase" size={32} color={theme.disabled} />
              <Text style={styles.emptyText}>No loans added yet. Tap + to add one.</Text>
            </View>
          ) : (
            <View style={styles.sectionCard}>
              {loans.map((loan, i) => (
                <TouchableOpacity key={loan.id} style={[styles.row, i !== loans.length - 1 && styles.rowDivider]} onPress={() => openEdit(loan)} activeOpacity={0.7}>
                  <View style={styles.iconWrap}>
                    <Feather name="briefcase" size={16} color={theme.info} />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowName}>{loan.name}</Text>
                    <Text style={styles.rowSub}>{loan.lenderName} · Next EMI {fmtShortDate(loan.nextEmiDate)}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowAmount}>₹{(loan.outstandingAmount || 0).toLocaleString('en-IN')}</Text>
                    <View style={[styles.badge, { backgroundColor: loan.status === 'Active' ? (theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6') : theme.soft }]}>
                      <Text style={[styles.badgeText, { color: loan.status === 'Active' ? theme.accent : theme.muted }]}>{loan.status}</Text>
                    </View>
                  </View>
                  <Feather name="edit-2" size={14} color={theme.faint} style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 12, color: theme.faint, marginTop: 2 },
  addBtnGrad: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED', alignItems: 'center', justifyContent: 'center' },

  scrollContent: { paddingHorizontal: 20 },
  skeleton: { height: 60, backgroundColor: theme.border, borderRadius: 14, marginBottom: 10 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13, color: theme.faint, textAlign: 'center', lineHeight: 19 },

  sectionCard: { backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },
  iconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTextWrap: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  rowSub: { fontSize: 12, color: theme.faint },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowAmount: { fontSize: 15, fontWeight: '800', color: theme.text },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' },

  formScroll: { paddingHorizontal: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.faint, letterSpacing: 0.5, marginTop: 8, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  required: { color: theme.danger },
  input: { backgroundColor: theme.surfaceAlt, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: theme.text, marginBottom: 16 },
  inputMultiline: { height: 90, textAlignVertical: 'top' },
  rowFields: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  selectChip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.surfaceAlt, borderWidth: 1.5, borderColor: 'transparent' },
  selectChipActive: { backgroundColor: theme.isDark ? 'rgba(107,184,240,0.14)' : '#EAF3FD', borderColor: theme.info },
  selectChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  selectChipTextActive: { color: theme.info },

  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.isDark ? 'rgba(107,184,240,0.14)' : '#EAF3FD', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 16 },
  attachBtnText: { fontSize: 13, fontWeight: '600', color: theme.info, flex: 1 },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
