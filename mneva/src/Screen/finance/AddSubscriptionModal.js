import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch } from '../../api/client';
import DateField from './DateField';

const CATEGORIES = ['Streaming', 'Software', 'Cloud', 'Gaming', 'News', 'Fitness', 'Education', 'Other'];
const BILLING_CYCLES = ['Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];
const PAYMENT_METHODS = ['Card', 'Bank', 'UPI', 'Wallet', 'Other'];
const STATUSES = ['Active', 'Paused', 'Cancelled', 'Expired'];

const EMPTY_FORM = {
  name: '', category: '', provider: '', description: '',
  amount: '', currency: 'INR', billingCycle: 'Monthly', tax: '', totalCharged: '',
  startDate: '', nextBillingDate: '', renewalDate: '', cancellationDate: '',
  paymentMethod: '', paymentAccount: '', autoRenewal: true,
  status: 'Active', trialPeriod: false, trialEndDate: '', reminderBeforeRenewal: '', notes: '',
};

const formFromItem = (item) => ({
  name: item.name || '', category: item.category || '', provider: item.provider || '', description: item.description || '',
  amount: String(item.amount ?? ''), currency: item.currency || 'INR', billingCycle: item.billingCycle || 'Monthly',
  tax: item.tax != null ? String(item.tax) : '', totalCharged: item.totalCharged != null ? String(item.totalCharged) : '',
  startDate: item.startDate || '', nextBillingDate: item.nextBillingDate || '', renewalDate: item.renewalDate || '',
  cancellationDate: item.cancellationDate || '',
  paymentMethod: item.paymentMethod || '', paymentAccount: item.paymentAccount || '', autoRenewal: item.autoRenewal ?? true,
  status: item.status || 'Active', trialPeriod: !!item.trialPeriod, trialEndDate: item.trialEndDate || '',
  reminderBeforeRenewal: item.reminderBeforeRenewal != null ? String(item.reminderBeforeRenewal) : '', notes: item.notes || '',
});

export default function AddSubscriptionModal({ visible, onClose, editItem }) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isEditing = !!editItem;

  useEffect(() => {
    if (visible) setForm(editItem ? formFromItem(editItem) : EMPTY_FORM);
  }, [visible, editItem]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const canSave = form.name.trim() && form.category && form.amount && form.billingCycle && form.startDate;

  const handleClose = () => { setForm(EMPTY_FORM); onClose(); };

  const handleDelete = () => {
    Alert.alert('Delete Subscription', `Remove "${editItem.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiFetch(`/api/finance/subscriptions/${editItem.id}`, { method: 'DELETE' }); } catch {}
        handleClose();
      } },
    ]);
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isEditing) {
        await apiFetch(`/api/finance/subscriptions/${editItem.id}`, { method: 'PATCH', body: form });
      } else {
        await apiFetch('/api/finance/subscriptions', { method: 'POST', body: form });
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
            <LinearGradient colors={['#9B72FF', '#7C5CE8']} style={styles.sheetIconGrad}>
              <Feather name="repeat" size={20} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{isEditing ? 'Edit Subscription' : 'Add Subscription'}</Text>
              <Text style={styles.sheetSubtitle}>Streaming, software, and other recurring services</Text>
            </View>
            {isEditing && (
              <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
                <Feather name="trash-2" size={18} color="#E0546E" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>BASIC INFORMATION</Text>
            <Text style={styles.fieldLabel}>Subscription Name <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. Netflix" placeholderTextColor="#9AA1AE" value={form.name} onChangeText={v => setField('name', v)} />

            <Text style={styles.fieldLabel}>Category <Text style={styles.required}>*</Text></Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[styles.selectChip, form.category === c && styles.selectChipActive]} onPress={() => setField('category', c)}>
                  <Text style={[styles.selectChipText, form.category === c && styles.selectChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Provider</Text>
            <TextInput style={styles.input} placeholder="e.g. Netflix Inc." placeholderTextColor="#9AA1AE" value={form.provider} onChangeText={v => setField('provider', v)} />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput style={styles.input} placeholder="e.g. Premium 4K plan" placeholderTextColor="#9AA1AE" value={form.description} onChangeText={v => setField('description', v)} />

            <Text style={styles.sectionLabel}>PAYMENT</Text>
            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Amount <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.amount} onChangeText={v => setField('amount', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Currency</Text>
                <TextInput style={styles.input} placeholder="INR" placeholderTextColor="#9AA1AE" value={form.currency} onChangeText={v => setField('currency', v)} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Billing Cycle <Text style={styles.required}>*</Text></Text>
            <View style={styles.chipRow}>
              {BILLING_CYCLES.map(c => (
                <TouchableOpacity key={c} style={[styles.selectChip, form.billingCycle === c && styles.selectChipActive]} onPress={() => setField('billingCycle', c)}>
                  <Text style={[styles.selectChipText, form.billingCycle === c && styles.selectChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Tax / GST (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.tax} onChangeText={v => setField('tax', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Total Charged (₹)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9AA1AE" keyboardType="decimal-pad" value={form.totalCharged} onChangeText={v => setField('totalCharged', v)} />
              </View>
            </View>

            <Text style={styles.sectionLabel}>DATES</Text>
            <DateField label="Subscription Start Date" required value={form.startDate} onChange={v => setField('startDate', v)} />
            <DateField label="Next Billing Date" value={form.nextBillingDate} onChange={v => setField('nextBillingDate', v)} />
            <DateField label="Renewal Date" value={form.renewalDate} onChange={v => setField('renewalDate', v)} />
            <DateField label="Cancellation Date" value={form.cancellationDate} onChange={v => setField('cancellationDate', v)} />

            <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>
            <Text style={styles.fieldLabel}>Payment Method</Text>
            <View style={styles.chipRow}>
              {PAYMENT_METHODS.map(p => (
                <TouchableOpacity key={p} style={[styles.selectChip, form.paymentMethod === p && styles.selectChipActive]} onPress={() => setField('paymentMethod', p)}>
                  <Text style={[styles.selectChipText, form.paymentMethod === p && styles.selectChipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Payment Account</Text>
            <TextInput style={styles.input} placeholder="e.g. HDFC •••• 4521" placeholderTextColor="#9AA1AE" value={form.paymentAccount} onChangeText={v => setField('paymentAccount', v)} />

            <Text style={styles.fieldLabel}>Auto Renewal</Text>
            <View style={styles.chipRow}>
              {[['Yes', true], ['No', false]].map(([label, val]) => (
                <TouchableOpacity key={label} style={[styles.selectChip, form.autoRenewal === val && styles.selectChipActive]} onPress={() => setField('autoRenewal', val)}>
                  <Text style={[styles.selectChipText, form.autoRenewal === val && styles.selectChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>STATUS</Text>
            <View style={styles.chipRow}>
              {STATUSES.map(s => (
                <TouchableOpacity key={s} style={[styles.selectChip, form.status === s && styles.selectChipActive]} onPress={() => setField('status', s)}>
                  <Text style={[styles.selectChipText, form.status === s && styles.selectChipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>OPTIONAL</Text>
            <Text style={styles.fieldLabel}>Trial Period?</Text>
            <View style={styles.chipRow}>
              {[['Yes', true], ['No', false]].map(([label, val]) => (
                <TouchableOpacity key={label} style={[styles.selectChip, form.trialPeriod === val && styles.selectChipActive]} onPress={() => setField('trialPeriod', val)}>
                  <Text style={[styles.selectChipText, form.trialPeriod === val && styles.selectChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.trialPeriod ? <DateField label="Trial End Date" value={form.trialEndDate} onChange={v => setField('trialEndDate', v)} /> : null}

            <Text style={styles.fieldLabel}>Reminder Before Renewal (days)</Text>
            <TextInput style={styles.input} placeholder="e.g. 3" placeholderTextColor="#9AA1AE" keyboardType="number-pad" value={form.reminderBeforeRenewal} onChangeText={v => setField('reminderBeforeRenewal', v)} />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} placeholder="Any other details..." placeholderTextColor="#9AA1AE" value={form.notes} onChangeText={v => setField('notes', v)} multiline numberOfLines={3} />

            <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]} disabled={!canSave || saving} onPress={handleSave}>
              <LinearGradient colors={['#9B72FF', '#7C5CE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Update Subscription' : 'Save Subscription'}</Text>
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
  selectChipActive: { backgroundColor: '#F3EFFE', borderColor: '#9B72FF' },
  selectChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  selectChipTextActive: { color: '#7C3AED' },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
