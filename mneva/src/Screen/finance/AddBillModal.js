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

const CATEGORIES = ['Electricity', 'Water', 'Internet', 'Mobile', 'Gas', 'Rent', 'Maintenance', 'Insurance', 'Other'];
const BILLING_CYCLES = ['Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Custom'];
const STATUSES = ['Upcoming', 'Due', 'Paid', 'Overdue'];

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

export default function AddBillModal({ visible, onClose, editItem }) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isEditing = !!editItem;

  useEffect(() => {
    if (visible) setForm(editItem ? formFromItem(editItem) : EMPTY_FORM);
  }, [visible, editItem]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const canSave = form.name.trim() && form.category && form.dueDate;

  const handleClose = () => { setForm(EMPTY_FORM); onClose(); };

  const handleDelete = () => {
    Alert.alert('Delete Bill', `Remove "${editItem.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiFetch(`/api/finance/bills/${editItem.id}`, { method: 'DELETE' }); } catch {}
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
        await apiFetch(`/api/finance/bills/${editItem.id}`, { method: 'PATCH', body: form });
      } else {
        await apiFetch('/api/finance/bills', { method: 'POST', body: form });
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
            <LinearGradient colors={['#E0546E', '#C8405A']} style={styles.sheetIconGrad}>
              <Feather name="file-text" size={20} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{isEditing ? 'Edit Bill' : 'Add Bill'}</Text>
              <Text style={styles.sheetSubtitle}>Electricity, water, internet, rent and more</Text>
            </View>
            {isEditing && (
              <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
                <Feather name="trash-2" size={18} color="#E0546E" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
              <LinearGradient colors={['#E0546E', '#C8405A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Update Bill' : 'Save Bill'}</Text>
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
  selectChipActive: { backgroundColor: '#FCEAED', borderColor: '#E0546E' },
  selectChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  selectChipTextActive: { color: '#E0546E' },

  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FCEAED', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 16 },
  attachBtnText: { fontSize: 13, fontWeight: '600', color: '#E0546E', flex: 1 },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
