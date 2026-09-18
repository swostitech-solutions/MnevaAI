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

const TYPES = ['Stock', 'Mutual Fund', 'SIP', 'ETF', 'Bonds', 'Gold', 'Crypto', 'Fixed Income', 'Other'];
const PLATFORMS = ['Groww', 'Zerodha', 'Angel One', 'Upstox', 'Kite', 'Other'];

const EMPTY_FORM = {
  name: '', type: 'Stock', platform: '',
  quantity: '', avgBuyPrice: '', currentPrice: '',
  investedAmount: '', currentValue: '', purchaseDate: '', notes: '',
};

const formFromItem = (item) => ({
  name: item.name || '', type: item.type || 'Stock', platform: item.platform || '',
  quantity: item.quantity != null ? String(item.quantity) : '',
  avgBuyPrice: item.avgBuyPrice != null ? String(item.avgBuyPrice) : '',
  currentPrice: item.currentPrice != null ? String(item.currentPrice) : '',
  investedAmount: String(item.investedAmount ?? ''),
  currentValue: String(item.currentValue ?? ''),
  purchaseDate: item.purchaseDate || '', notes: item.notes || '',
});

const ACCENT = ['#615FF8', '#4A47D5'];

export default function PortfolioScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { on } = useSocket();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [holdings, setHoldings] = useState([]);
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
      const res = await apiFetch('/api/finance/portfolio/holdings');
      setHoldings(res?.holdings || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await peekCachedResponse('/api/finance/portfolio/holdings').catch(() => null);
      if (!cancelled && res) { setHoldings(res.holdings || []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const offs = [
      on('portfolio:created', (h) => setHoldings(prev => prev.some(x => x.id === h.id) ? prev : [h, ...prev])),
      on('portfolio:updated', (h) => setHoldings(prev => prev.map(x => x.id === h.id ? h : x))),
      on('portfolio:deleted', ({ id }) => setHoldings(prev => prev.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(off => off?.());
  }, [on]);

  useEffect(() => {
    setForm(editItem ? formFromItem(editItem) : EMPTY_FORM);
  }, [editItem, showForm]);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const canSave = form.name.trim() && form.type && form.investedAmount && form.currentValue;

  const openAdd = () => { setEditItem(null); setShowForm(true); };
  const openEdit = (item) => { setEditItem(item); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditItem(null); };

  const handleDelete = () => {
    Alert.alert('Delete Holding', `Remove "${editItem.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiFetch(`/api/finance/portfolio/holdings/${editItem.id}`, { method: 'DELETE' }); } catch {}
        closeForm();
      } },
    ]);
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isEditing) {
        await apiFetch(`/api/finance/portfolio/holdings/${editItem.id}`, { method: 'PATCH', body: form });
      } else {
        await apiFetch('/api/finance/portfolio/holdings', { method: 'POST', body: form });
      }
      closeForm();
    } catch {
      // Socket event updates the list on success; a failed request leaves the form open to retry.
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => { if (showForm) closeForm(); else navigation?.goBack(); };

  const totalInvested = holdings.reduce((sum, h) => sum + (h.investedAmount || 0), 0);
  const totalCurrent = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
  const gain = totalCurrent - totalInvested;
  const gainPct = totalInvested > 0 ? Math.round((gain / totalInvested) * 1000) / 10 : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>{showForm ? (isEditing ? 'Edit Holding' : 'Add Holding') : 'Portfolio'}</Text>
          <Text style={styles.headerSubtitle}>{showForm ? 'Stocks, mutual funds, SIPs & more' : `${holdings.length} holding${holdings.length === 1 ? '' : 's'}`}</Text>
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
            <Text style={styles.fieldLabel}>Holding Name <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder="e.g. Reliance Industries, HDFC Flexi Cap Fund" placeholderTextColor={theme.placeholder} value={form.name} onChangeText={v => setField('name', v)} />

            <Text style={styles.fieldLabel}>Type <Text style={styles.required}>*</Text></Text>
            <View style={styles.chipRow}>
              {TYPES.map(t => (
                <TouchableOpacity key={t} style={[styles.selectChip, form.type === t && styles.selectChipActive]} onPress={() => setField('type', t)}>
                  <Text style={[styles.selectChipText, form.type === t && styles.selectChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Platform</Text>
            <View style={styles.chipRow}>
              {PLATFORMS.map(p => (
                <TouchableOpacity key={p} style={[styles.selectChip, form.platform === p && styles.selectChipActive]} onPress={() => setField('platform', p)}>
                  <Text style={[styles.selectChipText, form.platform === p && styles.selectChipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>QUANTITY & PRICE</Text>
            <Text style={styles.fieldLabel}>Units / Shares</Text>
            <TextInput style={styles.input} placeholder="e.g. 50" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.quantity} onChangeText={v => setField('quantity', v)} />

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Avg Buy Price (₹)</Text>
                <TextInput style={styles.input} placeholder="Per unit" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.avgBuyPrice} onChangeText={v => setField('avgBuyPrice', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Current Price (₹)</Text>
                <TextInput style={styles.input} placeholder="Per unit" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.currentPrice} onChangeText={v => setField('currentPrice', v)} />
              </View>
            </View>

            <Text style={styles.sectionLabel}>VALUE</Text>
            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Invested Amount (₹) <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.investedAmount} onChangeText={v => setField('investedAmount', v)} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Current Value (₹) <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor={theme.placeholder} keyboardType="decimal-pad" value={form.currentValue} onChangeText={v => setField('currentValue', v)} />
              </View>
            </View>

            <Text style={styles.sectionLabel}>OTHER DETAILS</Text>
            <DateField label="Purchase Date" value={form.purchaseDate} onChange={v => setField('purchaseDate', v)} />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.input, styles.inputMultiline]} placeholder="Any other details..." placeholderTextColor={theme.placeholder} value={form.notes} onChangeText={v => setField('notes', v)} multiline numberOfLines={3} />

            <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]} disabled={!canSave || saving} onPress={handleSave}>
              <LinearGradient colors={ACCENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isEditing ? 'Update Holding' : 'Save Holding'}</Text>
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
          {!loading && holdings.length > 0 && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                {[['Invested', `₹${totalInvested.toLocaleString('en-IN')}`, theme.faint],
                  ['Current', `₹${totalCurrent.toLocaleString('en-IN')}`, '#1F9A5A'],
                  ['Gain/Loss', `${gain >= 0 ? '+' : ''}${gainPct}%`, gain >= 0 ? '#1F9A5A' : theme.danger]].map(([k, v, c]) => (
                  <View key={k} style={styles.summaryStat}>
                    <Text style={styles.summaryStatLabel}>{k}</Text>
                    <Text style={[styles.summaryStatValue, { color: c }]}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {loading ? (
            [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
          ) : holdings.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="pie-chart" size={32} color={theme.disabled} />
              <Text style={styles.emptyText}>No holdings added yet. Tap + to add your first stock, mutual fund, or SIP.</Text>
            </View>
          ) : (
            <View style={styles.sectionCard}>
              {holdings.map((h, i) => {
                const holdingGain = (h.currentValue || 0) - (h.investedAmount || 0);
                const holdingGainPct = h.investedAmount > 0 ? Math.round((holdingGain / h.investedAmount) * 1000) / 10 : 0;
                return (
                  <TouchableOpacity key={h.id} style={[styles.row, i !== holdings.length - 1 && styles.rowDivider]} onPress={() => openEdit(h)} activeOpacity={0.7}>
                    <View style={styles.iconWrap}>
                      <Feather name="trending-up" size={16} color={theme.accent} />
                    </View>
                    <View style={styles.rowTextWrap}>
                      <Text style={styles.rowName}>{h.name}</Text>
                      <Text style={styles.rowSub}>{h.type}{h.platform ? ` · ${h.platform}` : ''}</Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={styles.rowAmount}>₹{(h.currentValue || 0).toLocaleString('en-IN')}</Text>
                      <Text style={[styles.holdingGain, { color: holdingGain >= 0 ? '#1F9A5A' : theme.danger }]}>
                        {holdingGain >= 0 ? '+' : ''}{holdingGainPct}%
                      </Text>
                    </View>
                    <Feather name="edit-2" size={14} color={theme.faint} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                );
              })}
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

  summaryCard: { backgroundColor: theme.card, borderRadius: 20, padding: 16, marginBottom: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  summaryStat: { alignItems: 'center' },
  summaryStatLabel: { fontSize: 10, color: theme.faint, fontWeight: '600', marginBottom: 4 },
  summaryStatValue: { fontSize: 15, fontWeight: '800' },

  sectionCard: { backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },
  iconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTextWrap: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  rowSub: { fontSize: 12, color: theme.faint },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowAmount: { fontSize: 15, fontWeight: '800', color: theme.text },
  holdingGain: { fontSize: 11, fontWeight: '700' },

  formScroll: { paddingHorizontal: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.faint, letterSpacing: 0.5, marginTop: 8, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  required: { color: theme.danger },
  input: { backgroundColor: theme.surfaceAlt, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: theme.text, marginBottom: 16 },
  inputMultiline: { height: 90, textAlignVertical: 'top' },
  rowFields: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  selectChip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.surfaceAlt, borderWidth: 1.5, borderColor: 'transparent' },
  selectChipActive: { backgroundColor: theme.isDark ? 'rgba(129,128,255,0.16)' : '#EEEDFE', borderColor: theme.accent },
  selectChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  selectChipTextActive: { color: theme.accent },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
