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

const fmtShortDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—';
const ACCENT = ['#9B72FF', '#7C5CE8'];

export default function SubscriptionScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { on } = useSocket();
  const [subscriptions, setSubscriptions] = useState([]);
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
      const s = await apiFetch('/api/finance/subscriptions');
      setSubscriptions(s?.subscriptions || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await peekCachedResponse('/api/finance/subscriptions').catch(() => null);
      if (!cancelled && s) { setSubscriptions(s.subscriptions || []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const offs = [
      on('subscription:created', (s) => setSubscriptions(prev => prev.some(x => x.id === s.id) ? prev : [s, ...prev])),
      on('subscription:updated', (s) => setSubscriptions(prev => prev.map(x => x.id === s.id ? s : x))),
      on('subscription:deleted', ({ id }) => setSubscriptions(prev => prev.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(off => off?.());
  }, [on]);

  useEffect(() => {
    setForm(editItem ? formFromItem(editItem) : EMPTY_FORM);
  }, [editItem, showForm]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const canSave = form.name.trim() && form.category && form.amount && form.billingCycle && form.startDate;

  const openAdd = () => { setEditItem(null); setShowForm(true); };
  const openEdit = (item) => { setEditItem(item); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditItem(null); };

  const handleDelete = () => {
    Alert.alert('Delete Subscription', `Remove "${editItem.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiFetch(`/api/finance/subscriptions/${editItem.id}`, { method: 'DELETE' }); } catch {}
        closeForm();
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
          <Text style={styles.headerTitle}>{showForm ? (isEditing ? 'Edit Subscription' : 'Add Subscription') : 'Subscriptions'}</Text>
          <Text style={styles.headerSubtitle}>{showForm ? 'Streaming, software & more' : `${subscriptions.length} total`}</Text>
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
              <LinearGradient colors={ACCENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Update Subscription' : 'Save Subscription'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor="#9B72FF" colors={['#9B72FF']} />}
        >
          {loading ? (
            [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
          ) : subscriptions.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="repeat" size={32} color="#C7CBD3" />
              <Text style={styles.emptyText}>No subscriptions added yet. Tap + to add one.</Text>
            </View>
          ) : (
            <View style={styles.sectionCard}>
              {subscriptions.map((sub, i) => (
                <TouchableOpacity key={sub.id} style={[styles.row, i !== subscriptions.length - 1 && styles.rowDivider]} onPress={() => openEdit(sub)} activeOpacity={0.7}>
                  <View style={styles.iconWrap}>
                    <Feather name="repeat" size={16} color="#9B72FF" />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowName}>{sub.name}</Text>
                    <Text style={styles.rowSub}>
                      {sub.provider || sub.category} · {sub.billingCycle}{sub.autoRenewal ? ' · Auto-renew' : ''}
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowAmount}>₹{(sub.amount || 0).toLocaleString('en-IN')}</Text>
                    <Text style={styles.rowMeta}>{fmtShortDate(sub.nextBillingDate)}</Text>
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
  selectChipActive: { backgroundColor: '#F3EFFE', borderColor: '#9B72FF' },
  selectChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  selectChipTextActive: { color: '#7C3AED' },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
