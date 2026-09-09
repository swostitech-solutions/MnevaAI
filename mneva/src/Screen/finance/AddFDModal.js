import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { apiFetch } from '../../api/client';
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

export default function AddFDModal({ visible, onClose, editItem }) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isEditing = !!editItem;

  useEffect(() => {
    if (visible) setForm(editItem ? formFromItem(editItem) : EMPTY_FORM);
  }, [visible, editItem]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const canSave = form.name.trim() && form.bankName.trim() && form.principalAmount
    && form.interestRate && form.startDate && form.maturityDate;

  const handleClose = () => { setForm(EMPTY_FORM); onClose(); };

  const handleDelete = () => {
    Alert.alert('Delete Fixed Deposit', `Remove "${editItem.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiFetch(`/api/finance/fixed-deposits/${editItem.id}`, { method: 'DELETE' }); } catch {}
        handleClose();
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
      handleClose();
    } catch {
      // Socket event updates the list on success; a failed request leaves the form open to retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <LinearGradient colors={['#06B6D4', '#0891B2']} style={styles.sheetIconGrad}>
              <Feather name="lock" size={20} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{isEditing ? 'Edit Fixed Deposit' : 'Add Fixed Deposit'}</Text>
              <Text style={styles.sheetSubtitle}>Bank & post-office FDs</Text>
            </View>
            {isEditing && (
              <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
                <Feather name="trash-2" size={18} color="#E0546E" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
              <LinearGradient colors={['#06B6D4', '#0891B2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Update FD' : 'Save FD'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(14,17,26,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E5EA', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetIconGrad: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  sheetSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 2 },
  deleteBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FCEAED', alignItems: 'center', justifyContent: 'center' },

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
