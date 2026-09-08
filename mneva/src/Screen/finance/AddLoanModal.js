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

export default function AddLoanModal({ visible, onClose, editItem }) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isEditing = !!editItem;

  useEffect(() => {
    if (visible) setForm(editItem ? formFromItem(editItem) : EMPTY_FORM);
  }, [visible, editItem]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const canSave = form.name.trim() && form.loanType && form.lenderName.trim()
    && form.originalAmount && form.outstandingAmount && form.interestRate
    && form.interestType && form.interestCalculation && form.emiAmount
    && form.numberOfEmis && form.loanStartDate && form.emiStartDate;

  const handleClose = () => { setForm(EMPTY_FORM); onClose(); };

  const handleDelete = () => {
    Alert.alert('Delete Loan', `Remove "${editItem.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiFetch(`/api/finance/loans/${editItem.id}`, { method: 'DELETE' }); } catch {}
        handleClose();
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
            <LinearGradient colors={['#4FA6E8', '#3D8BFF']} style={styles.sheetIconGrad}>
              <Feather name="briefcase" size={20} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{isEditing ? 'Edit Loan' : 'Add Loan'}</Text>
              <Text style={styles.sheetSubtitle}>Track a personal, home, car or other loan</Text>
            </View>
            {isEditing && (
              <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
                <Feather name="trash-2" size={18} color="#E0546E" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>BASIC INFORMATION</Text>
            <Text style={styles.fieldLabel}>Loan Name <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. Home Loan — HDFC" placeholderTextColor="#9AA1AE" value={form.name} onChangeText={v => setField('name', v)} />

            <Text style={styles.fieldLabel}>Loan Type <Text style={styles.required}>*</Text></Text>
            <View style={styles.chipRow}>
              {LOAN_TYPES.map(t => (
                <TouchableOpacity key={t} style={[styles.selectChip, form.loanType === t && styles.selectChipActive]} onPress={() => setField('loanType', t)}>
                  <Text style={[styles.selectChipText, form.loanType === t && styles.selectChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Lender / Bank Name <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. HDFC Bank" placeholderTextColor="#9AA1AE" value={form.lenderName} onChangeText={v => setField('lenderName', v)} />

            <Text style={styles.fieldLabel}>Loan Account Number</Text>
            <TextInput style={styles.input} placeholder="e.g. ••••4521" placeholderTextColor="#9AA1AE" value={form.accountNumber} onChangeText={v => setField('accountNumber', v)} />

            <Text style={styles.fieldLabel}>Purpose</Text>
            <TextInput style={styles.input} placeholder="e.g. Home renovation" placeholderTextColor="#9AA1AE" value={form.purpose} onChangeText={v => setField('purpose', v)} />

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
            <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.originalAmount} onChangeText={v => setField('originalAmount', v)} />

            <Text style={styles.fieldLabel}>Current Outstanding Amount (₹) <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.outstandingAmount} onChangeText={v => setField('outstandingAmount', v)} />

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Amount Already Paid (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.amountPaid} onChangeText={v => setField('amountPaid', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Processing Fee (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.processingFee} onChangeText={v => setField('processingFee', v)} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Other Charges (₹)</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.otherCharges} onChangeText={v => setField('otherCharges', v)} />

            <Text style={styles.sectionLabel}>INTEREST DETAILS</Text>
            <Text style={styles.fieldLabel}>Interest Rate (%) <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. 8.5" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.interestRate} onChangeText={v => setField('interestRate', v)} />

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
            <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.emiAmount} onChangeText={v => setField('emiAmount', v)} />

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
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.numberOfEmis} onChangeText={v => setField('numberOfEmis', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>EMIs Paid</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.emisPaid} onChangeText={v => setField('emisPaid', v)} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>EMIs Remaining</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.emisRemaining} onChangeText={v => setField('emisRemaining', v)} />

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
            <TextInput style={styles.input} placeholder="e.g. HDFC •••• 4521" placeholderTextColor="#9AA1AE" value={form.paymentAccount} onChangeText={v => setField('paymentAccount', v)} />

            <Text style={styles.fieldLabel}>Payment Day (of month)</Text>
            <TextInput style={styles.input} placeholder="e.g. 5" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.paymentDay} onChangeText={v => setField('paymentDay', v)} />

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
            <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.prepaymentCharges} onChangeText={v => setField('prepaymentCharges', v)} />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} placeholder="Any other details..." placeholderTextColor="#9AA1AE" value={form.notes} onChangeText={v => setField('notes', v)} multiline numberOfLines={3} />

            <Text style={styles.fieldLabel}>Attach Document</Text>
            <TouchableOpacity style={styles.attachBtn} onPress={handleAttach} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color="#4FA6E8" /> : <Feather name="paperclip" size={16} color="#4FA6E8" />}
              <Text style={styles.attachBtnText}>{form.attachmentName || 'Attach a document'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]} disabled={!canSave || saving} onPress={handleSave}>
              <LinearGradient colors={['#4FA6E8', '#3D8BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Update Loan' : 'Save Loan'}</Text>
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
  selectChipActive: { backgroundColor: '#EAF3FD', borderColor: '#4FA6E8' },
  selectChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  selectChipTextActive: { color: '#3D8BFF' },

  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EAF3FD', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 16 },
  attachBtnText: { fontSize: 13, fontWeight: '600', color: '#3D8BFF', flex: 1 },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
