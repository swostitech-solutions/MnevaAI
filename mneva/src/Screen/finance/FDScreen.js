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
import DateField from './DateField';

const STATUSES = ['Active', 'Matured', 'Closed', 'Withdrawn Early'];
const COMPOUNDING = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'Cumulative'];
const PAYOUTS = ['On Maturity', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

const EMPTY_FORM = {
  name: '', bankName: '', accountNumber: '', status: 'Active',
  principalAmount: '', interestRate: '', compoundingFrequency: 'Quarterly', interestPayout: 'On Maturity',
  startDate: '', maturityDate: '', tenureMonths: '', maturityAmount: '', interestEarned: '',
  autoRenewal: false, nominee: '', paymentAccount: '',
  prematureWithdrawalAllowed: null, prematureWithdrawalPenalty: '', notes: '', attachmentDocId: '', attachmentName: '',
};

const formFromItem = (item) => ({
  name: item.name || '', bankName: item.bankName || '', accountNumber: item.accountNumber || '', status: item.status || 'Active',
  principalAmount: String(item.principalAmount ?? ''), interestRate: String(item.interestRate ?? ''),
  compoundingFrequency: item.compoundingFrequency || 'Quarterly', interestPayout: item.interestPayout || 'On Maturity',
  startDate: item.startDate || '', maturityDate: item.maturityDate || '',
  tenureMonths: item.tenureMonths != null ? String(item.tenureMonths) : '',
  maturityAmount: item.maturityAmount != null ? String(item.maturityAmount) : '',
  interestEarned: item.interestEarned != null ? String(item.interestEarned) : '',
  autoRenewal: !!item.autoRenewal, nominee: item.nominee || '', paymentAccount: item.paymentAccount || '',
  prematureWithdrawalAllowed: item.prematureWithdrawalAllowed ?? null,
  prematureWithdrawalPenalty: item.prematureWithdrawalPenalty != null ? String(item.prematureWithdrawalPenalty) : '',
  notes: item.notes || '', attachmentDocId: item.attachmentDocId || '', attachmentName: item.attachmentDocId ? 'Attached document' : '',
});

const fmtShortDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—';
const ACCENT = ['#06B6D4', '#0891B2'];

export default function FDScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { on } = useSocket();
  const [fixedDeposits, setFixedDeposits] = useState([]);
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
      const fd = await apiFetch('/api/finance/fixed-deposits');
      setFixedDeposits(fd?.fixedDeposits || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fd = await peekCachedResponse('/api/finance/fixed-deposits').catch(() => null);
      if (!cancelled && fd) { setFixedDeposits(fd.fixedDeposits || []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const offs = [
      on('fd:created', (fd) => setFixedDeposits(prev => prev.some(x => x.id === fd.id) ? prev : [fd, ...prev])),
      on('fd:updated', (fd) => setFixedDeposits(prev => prev.map(x => x.id === fd.id ? fd : x))),
      on('fd:deleted', ({ id }) => setFixedDeposits(prev => prev.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(off => off?.());
  }, [on]);

  useEffect(() => {
    setForm(editItem ? formFromItem(editItem) : EMPTY_FORM);
  }, [editItem, showForm]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const canSave = form.name.trim() && form.bankName.trim() && form.principalAmount
    && form.interestRate && form.startDate && form.maturityDate;

  const openAdd = () => { setEditItem(null); setShowForm(true); };
  const openEdit = (item) => { setEditItem(item); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditItem(null); };

  const handleDelete = () => {
    Alert.alert('Delete Fixed Deposit', `Remove "${editItem.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiFetch(`/api/finance/fixed-deposits/${editItem.id}`, { method: 'DELETE' }); } catch {}
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
        await apiFetch(`/api/finance/fixed-deposits/${editItem.id}`, { method: 'PATCH', body: form });
      } else {
        await apiFetch('/api/finance/fixed-deposits', { method: 'POST', body: form });
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
          <Feather name="arrow-left" size={20} color="#14171F" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>{showForm ? (isEditing ? 'Edit Fixed Deposit' : 'Add Fixed Deposit') : 'Fixed Deposits'}</Text>
          <Text style={styles.headerSubtitle}>{showForm ? 'Bank & post-office FDs' : `${fixedDeposits.length} total`}</Text>
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
            <Text style={styles.fieldLabel}>FD Name <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. Retirement Fund FD" placeholderTextColor="#9AA1AE" value={form.name} onChangeText={v => setField('name', v)} />

            <Text style={styles.fieldLabel}>Bank / Institution <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. HDFC Bank" placeholderTextColor="#9AA1AE" value={form.bankName} onChangeText={v => setField('bankName', v)} />

            <Text style={styles.fieldLabel}>FD Account / Certificate Number</Text>
            <TextInput style={styles.input} placeholder="e.g. ••••4521" placeholderTextColor="#9AA1AE" value={form.accountNumber} onChangeText={v => setField('accountNumber', v)} />

            <Text style={styles.fieldLabel}>Status</Text>
            <View style={styles.chipRow}>
              {STATUSES.map(s => (
                <TouchableOpacity key={s} style={[styles.selectChip, form.status === s && styles.selectChipActive]} onPress={() => setField('status', s)}>
                  <Text style={[styles.selectChipText, form.status === s && styles.selectChipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>AMOUNT & INTEREST</Text>
            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Principal Amount (₹) <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.principalAmount} onChangeText={v => setField('principalAmount', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Interest Rate (%) <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="e.g. 7.1" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.interestRate} onChangeText={v => setField('interestRate', v)} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Compounding Frequency</Text>
            <View style={styles.chipRow}>
              {COMPOUNDING.map(c => (
                <TouchableOpacity key={c} style={[styles.selectChip, form.compoundingFrequency === c && styles.selectChipActive]} onPress={() => setField('compoundingFrequency', c)}>
                  <Text style={[styles.selectChipText, form.compoundingFrequency === c && styles.selectChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Interest Payout</Text>
            <View style={styles.chipRow}>
              {PAYOUTS.map(p => (
                <TouchableOpacity key={p} style={[styles.selectChip, form.interestPayout === p && styles.selectChipActive]} onPress={() => setField('interestPayout', p)}>
                  <Text style={[styles.selectChipText, form.interestPayout === p && styles.selectChipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>DATES & TENURE</Text>
            <DateField label="Start Date" required value={form.startDate} onChange={v => setField('startDate', v)} />
            <DateField label="Maturity Date" required value={form.maturityDate} onChange={v => setField('maturityDate', v)} />

            <Text style={styles.fieldLabel}>Tenure (months)</Text>
            <TextInput style={styles.input} placeholder="e.g. 12" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.tenureMonths} onChangeText={v => setField('tenureMonths', v)} />

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Maturity Amount (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.maturityAmount} onChangeText={v => setField('maturityAmount', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Interest Earned (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.interestEarned} onChangeText={v => setField('interestEarned', v)} />
              </View>
            </View>

            <Text style={styles.sectionLabel}>OTHER DETAILS</Text>
            <Text style={styles.fieldLabel}>Auto Renewal</Text>
            <View style={styles.chipRow}>
              {[['Yes', true], ['No', false]].map(([label, val]) => (
                <TouchableOpacity key={label} style={[styles.selectChip, form.autoRenewal === val && styles.selectChipActive]} onPress={() => setField('autoRenewal', val)}>
                  <Text style={[styles.selectChipText, form.autoRenewal === val && styles.selectChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Nominee</Text>
            <TextInput style={styles.input} placeholder="e.g. Family member name" placeholderTextColor="#9AA1AE" value={form.nominee} onChangeText={v => setField('nominee', v)} />

            <Text style={styles.fieldLabel}>Payment Account</Text>
            <TextInput style={styles.input} placeholder="e.g. HDFC •••• 4521" placeholderTextColor="#9AA1AE" value={form.paymentAccount} onChangeText={v => setField('paymentAccount', v)} />

            <Text style={styles.sectionLabel}>OPTIONAL</Text>
            <Text style={styles.fieldLabel}>Premature Withdrawal Allowed?</Text>
            <View style={styles.chipRow}>
              {[['Yes', true], ['No', false]].map(([label, val]) => (
                <TouchableOpacity key={label} style={[styles.selectChip, form.prematureWithdrawalAllowed === val && styles.selectChipActive]} onPress={() => setField('prematureWithdrawalAllowed', val)}>
                  <Text style={[styles.selectChipText, form.prematureWithdrawalAllowed === val && styles.selectChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Premature Withdrawal Penalty (%)</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.prematureWithdrawalPenalty} onChangeText={v => setField('prematureWithdrawalPenalty', v)} />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} placeholder="Any other details..." placeholderTextColor="#9AA1AE" value={form.notes} onChangeText={v => setField('notes', v)} multiline numberOfLines={3} />

            <Text style={styles.fieldLabel}>Attach Document</Text>
            <TouchableOpacity style={styles.attachBtn} onPress={handleAttach} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color="#0891B2" /> : <Feather name="paperclip" size={16} color="#0891B2" />}
              <Text style={styles.attachBtnText}>{form.attachmentName || 'Attach FD receipt / certificate'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]} disabled={!canSave || saving} onPress={handleSave}>
              <LinearGradient colors={ACCENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Update FD' : 'Save FD'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor="#06B6D4" colors={['#06B6D4']} />}
        >
          {loading ? (
            [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
          ) : fixedDeposits.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="lock" size={32} color="#C7CBD3" />
              <Text style={styles.emptyText}>No fixed deposits added yet. Tap + to add one.</Text>
            </View>
          ) : (
            <View style={styles.sectionCard}>
              {fixedDeposits.map((fd, i) => (
                <TouchableOpacity key={fd.id} style={[styles.row, i !== fixedDeposits.length - 1 && styles.rowDivider]} onPress={() => openEdit(fd)} activeOpacity={0.7}>
                  <View style={styles.iconWrap}>
                    <Feather name="lock" size={16} color="#06B6D4" />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowName}>{fd.name}</Text>
                    <Text style={styles.rowSub}>{fd.bankName} · Matures {fmtShortDate(fd.maturityDate)}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowAmount}>₹{(fd.principalAmount || 0).toLocaleString('en-IN')}</Text>
                    <View style={[styles.badge, { backgroundColor: fd.status === 'Active' ? '#ECFEFF' : '#F3F4F6' }]}>
                      <Text style={[styles.badgeText, { color: fd.status === 'Active' ? '#0891B2' : '#6B7280' }]}>{fd.status}</Text>
                    </View>
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
  selectChipActive: { backgroundColor: '#CFFAFE', borderColor: '#06B6D4' },
  selectChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  selectChipTextActive: { color: '#0E7490' },

  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#CFFAFE', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 16 },
  attachBtnText: { fontSize: 13, fontWeight: '600', color: '#0891B2', flex: 1 },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
