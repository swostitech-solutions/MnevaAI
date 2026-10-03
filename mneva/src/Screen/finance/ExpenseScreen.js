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
import { useTheme } from '../../context/ThemeContext';
import DateField from './DateField';

const PAYMENT_METHODS = ['Cash', 'Online', 'Card', 'UPI'];
const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'];
const CATEGORY_ICONS = {
  Food: 'coffee', Transport: 'truck', Shopping: 'shopping-bag', Bills: 'file-text',
  Entertainment: 'film', Health: 'heart', Other: 'more-horizontal',
};

const EMPTY_FORM = { amount: '', paymentMethod: 'Cash', category: 'Food', note: '', date: '' };

const formFromItem = (item) => ({
  amount: String(item.amount ?? ''),
  paymentMethod: item.paymentMethod || 'Cash',
  category: item.category || 'Other',
  note: item.note || '',
  date: item.date || '',
});

const ACCENT = ['#1F9A5A', '#17824A'];

export default function ExpenseScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { on } = useSocket();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [expenses, setExpenses] = useState([]);
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
      const res = await apiFetch('/api/finance/expenses');
      setExpenses(res?.expenses || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await peekCachedResponse('/api/finance/expenses').catch(() => null);
      if (!cancelled && res) { setExpenses(res.expenses || []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const offs = [
      on('expense:created', (e) => setExpenses(prev => prev.some(x => x.id === e.id) ? prev : [e, ...prev])),
      on('expense:updated', (e) => setExpenses(prev => prev.map(x => x.id === e.id ? e : x))),
      on('expense:deleted', ({ id }) => setExpenses(prev => prev.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(off => off?.());
  }, [on]);

  useEffect(() => {
    setForm(editItem ? formFromItem(editItem) : EMPTY_FORM);
  }, [editItem, showForm]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const canSave = form.amount && Number(form.amount) > 0 && form.paymentMethod;

  const openAdd = () => { setEditItem(null); setShowForm(true); };
  const openEdit = (item) => { setEditItem(item); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditItem(null); };

  const handleDelete = () => {
    Alert.alert('Delete Expense', `Remove this ₹${Number(editItem.amount).toLocaleString('en-IN')} expense? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiFetch(`/api/finance/expenses/${editItem.id}`, { method: 'DELETE' }); } catch {}
        closeForm();
      } },
    ]);
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isEditing) {
        await apiFetch(`/api/finance/expenses/${editItem.id}`, { method: 'PATCH', body: form });
      } else {
        await apiFetch('/api/finance/expenses', { method: 'POST', body: form });
      }
      closeForm();
    } catch {
      // Socket event updates the list on success; a failed request leaves the form open to retry.
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => { if (showForm) closeForm(); else navigation?.goBack(); };

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const thisMonthExpenses = expenses.filter(e => new Date(e.date) >= monthStart);
  const totalThisMonth = thisMonthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>{showForm ? (isEditing ? 'Edit Expense' : 'Add Expense') : 'Expenses'}</Text>
          <Text style={styles.headerSubtitle}>{showForm ? 'Cash, card, UPI & more' : `${expenses.length} logged`}</Text>
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
            <Text style={styles.fieldLabel}>Amount (₹) <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.amount} onChangeText={v => setField('amount', v.replace(/[^0-9.]/g, ''))} />

            <Text style={styles.fieldLabel}>Paid via <Text style={styles.required}>*</Text></Text>
            <View style={styles.chipRow}>
              {PAYMENT_METHODS.map(m => (
                <TouchableOpacity key={m} style={[styles.selectChip, form.paymentMethod === m && styles.selectChipActive]} onPress={() => setField('paymentMethod', m)}>
                  <Text style={[styles.selectChipText, form.paymentMethod === m && styles.selectChipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[styles.selectChip, form.category === c && styles.selectChipActive]} onPress={() => setField('category', c)}>
                  <Text style={[styles.selectChipText, form.category === c && styles.selectChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <DateField label="Date" value={form.date} onChange={v => setField('date', v)} />

            <Text style={styles.fieldLabel}>Note</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} placeholder="What was it for..." placeholderTextColor={theme.placeholder} value={form.note} onChangeText={v => setField('note', v)} multiline numberOfLines={3} />

            <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]} disabled={!canSave || saving} onPress={handleSave}>
              <LinearGradient colors={ACCENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Update Expense' : 'Save Expense'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor={theme.accent} colors={[theme.accent]} />}
        >
          {!loading && expenses.length > 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>This month</Text>
              <Text style={styles.summaryValue}>₹{totalThisMonth.toLocaleString('en-IN')}</Text>
              <Text style={styles.summarySub}>{thisMonthExpenses.length} expense{thisMonthExpenses.length === 1 ? '' : 's'}</Text>
            </View>
          )}
          {loading ? (
            [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
          ) : expenses.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="shopping-bag" size={32} color={theme.disabled} />
              <Text style={styles.emptyText}>No expenses logged yet. Tap + to log your first one, or just tell Mneva "I spent ₹200 on groceries, paid by card".</Text>
            </View>
          ) : (
            <View style={styles.sectionCard}>
              {expenses.map((e, i) => (
                <TouchableOpacity key={e.id} style={[styles.row, i !== expenses.length - 1 && styles.rowDivider]} onPress={() => openEdit(e)} activeOpacity={0.7}>
                  <View style={styles.iconWrap}>
                    <Feather name={CATEGORY_ICONS[e.category] || 'shopping-bag'} size={16} color={theme.accent} />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowName} numberOfLines={1}>{e.note || e.category || 'Expense'}</Text>
                    <Text style={styles.rowSub}>{e.paymentMethod}{e.category ? ` · ${e.category}` : ''} · {new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
                  </View>
                  <Text style={styles.rowAmount}>₹{(e.amount || 0).toLocaleString('en-IN')}</Text>
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
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 10, paddingHorizontal: 20 },
  emptyText: { fontSize: 13, color: theme.faint, textAlign: 'center', lineHeight: 19 },

  summaryCard: { backgroundColor: theme.card, borderRadius: 20, padding: 18, marginBottom: 14, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: theme.faint, fontWeight: '600', marginBottom: 4 },
  summaryValue: { fontSize: 26, fontWeight: '800', color: theme.text },
  summarySub: { fontSize: 12, color: theme.faint, marginTop: 2 },

  sectionCard: { backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },
  iconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTextWrap: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  rowSub: { fontSize: 12, color: theme.faint },
  rowAmount: { fontSize: 15, fontWeight: '800', color: theme.text },

  formScroll: { paddingHorizontal: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  required: { color: theme.danger },
  input: { backgroundColor: theme.surfaceAlt, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: theme.text, marginBottom: 16 },
  inputMultiline: { height: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  selectChip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.surfaceAlt, borderWidth: 1.5, borderColor: 'transparent' },
  selectChipActive: { backgroundColor: theme.isDark ? 'rgba(31,154,90,0.16)' : '#EFFDF6', borderColor: theme.accent },
  selectChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  selectChipTextActive: { color: theme.accent },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
