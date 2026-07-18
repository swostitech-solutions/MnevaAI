import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, TouchableWithoutFeedback, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';

const TAB_BAR_CONTENT_HEIGHT = 50;
const SPEND_COLORS = ['#1F9A5A', '#615FF8', '#4FA6E8', '#E0546E', '#F5A623', '#9B72FF', '#06B6D4'];

export default function Finance({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [bills, setBills] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [spending, setSpending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [paying, setPaying] = useState(false);

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [b, p, s] = await Promise.all([
        apiFetch('/api/finance/bills'),
        apiFetch('/api/finance/portfolio'),
        apiFetch('/api/finance/spending?period=month'),
      ]);
      setBills(Array.isArray(b) ? b : []);
      setPortfolio(p);
      setSpending(s);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handlePay = async () => {
    if (!payModal) return;
    setPaying(true);
    try {
      await apiFetch('/api/finance/pay', {
        method: 'POST',
        body: { billId: payModal.id, amount: payModal.amount, payee: payModal.name, category: payModal.category },
      });
      setPayModal(null);
      loadData(true);
    } catch {}
    finally { setPaying(false); }
  };

  const pendingBills = bills.filter(b => b.status === 'pending').length;

  const STAT_CARDS = [
    { label: 'Total Spend', value: `₹${(spending?.total || 0).toLocaleString('en-IN')}`, color: '#1F9A5A', sub: 'This month' },
    { label: 'Bills Pending', value: pendingBills, color: '#F5A623', sub: 'Awaiting payment' },
    { label: 'Portfolio', value: portfolio ? `₹${((portfolio.totalCurrent || 0) / 1000).toFixed(0)}k` : '—', color: '#615FF8', sub: `+${portfolio?.returnPct || 0}% return` },
    { label: 'CIBIL Score', value: portfolio?.cibilScore || '—', color: '#4FA6E8', sub: portfolio?.cibilGrade || 'Not connected' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor="#1F9A5A" colors={['#1F9A5A']} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Finance</Text>
            <Text style={styles.headerSubtitle}>Bills, portfolio & spending</Text>
          </View>
          <LinearGradient colors={['#1F9A5A', '#3CB37A']} style={styles.headerBadge}>
            <Feather name="credit-card" size={18} color="#FFFFFF" />
          </LinearGradient>
        </View>

        {/* Stat Cards */}
        <View style={styles.statsGrid}>
          {STAT_CARDS.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={[styles.statValue, { color: s.color }]}>{loading ? '—' : s.value}</Text>
              <Text style={styles.statSub}>{s.sub}</Text>
            </View>
          ))}
        </View>

        {/* Bills */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Upcoming Bills</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{bills.length} total</Text>
            </View>
          </View>

          {loading ? (
            [1, 2].map(i => <View key={i} style={styles.billSkeleton} />)
          ) : bills.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="inbox" size={26} color="#C7CBD3" />
              <Text style={styles.emptyText}>No bills found. Connect finance integrations.</Text>
            </View>
          ) : (
            bills.map((bill, i) => (
              <TouchableOpacity
                key={bill.id}
                style={[styles.billRow, i !== bills.length - 1 && styles.billRowDivider]}
                onPress={() => bill.status === 'pending' && setPayModal(bill)}
                activeOpacity={bill.status === 'pending' ? 0.7 : 1}
              >
                <View style={styles.billIconWrap}>
                  <Text style={styles.billEmoji}>{bill.logo || '🧾'}</Text>
                </View>
                <View style={styles.billTextWrap}>
                  <Text style={styles.billName}>{bill.name}</Text>
                  <Text style={styles.billDue}>
                    Due {bill.dueDate ? new Date(bill.dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—'}
                  </Text>
                </View>
                <View style={styles.billRight}>
                  <Text style={styles.billAmount}>₹{(bill.amount || 0).toLocaleString('en-IN')}</Text>
                  <View style={[styles.billBadge, { backgroundColor: bill.status === 'pending' ? '#FEF3C7' : '#EFFDF6' }]}>
                    <Text style={[styles.billBadgeText, { color: bill.status === 'pending' ? '#D97706' : '#1F9A5A' }]}>
                      {bill.status === 'pending' ? 'Pay Now' : bill.status === 'auto' ? 'Auto' : 'Paid'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Portfolio */}
        {portfolio && (
          <View style={[styles.sectionCard, { marginTop: 16 }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Investment Portfolio</Text>
              <Text style={styles.portfolioReturn}>+{portfolio.returnPct || 0}%</Text>
            </View>
            <View style={styles.portfolioSummaryRow}>
              {[['Invested', `₹${(portfolio.totalInvested || 0).toLocaleString('en-IN')}`, '#6B7280'],
                ['Current', `₹${(portfolio.totalCurrent || 0).toLocaleString('en-IN')}`, '#1F9A5A'],
                ['Net Worth', `₹${(portfolio.netWorth || 0).toLocaleString('en-IN')}`, '#615FF8']].map(([k, v, c]) => (
                <View key={k} style={styles.portfolioStat}>
                  <Text style={styles.portfolioStatLabel}>{k}</Text>
                  <Text style={[styles.portfolioStatValue, { color: c }]}>{v}</Text>
                </View>
              ))}
            </View>
            {(portfolio.holdings || []).length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No holdings. Connect Zerodha / Groww to populate.</Text>
              </View>
            ) : (
              (portfolio.holdings || []).map((h, i) => (
                <View key={h.id || i} style={[styles.holdingRow, i !== portfolio.holdings.length - 1 && styles.billRowDivider]}>
                  <View style={styles.holdingTextWrap}>
                    <Text style={styles.holdingName}>{h.name}</Text>
                    <Text style={styles.holdingSub}>{h.sipOn ? `SIP ₹${(h.sipAmt || 0).toLocaleString('en-IN')}/mo` : h.ticker || 'Equity'}</Text>
                  </View>
                  <View style={styles.holdingRight}>
                    <Text style={[styles.holdingReturn, { color: h.ret >= 0 ? '#1F9A5A' : '#E0546E' }]}>
                      {h.ret >= 0 ? '+' : ''}{h.ret}%
                    </Text>
                    <Text style={styles.holdingCurrent}>₹{(h.current || 0).toLocaleString('en-IN')}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Spending */}
        {spending && (
          <View style={[styles.sectionCard, { marginTop: 16 }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Spending — This Month</Text>
              <Text style={styles.savingsRate}>Savings {spending.savingsRate || 0}%</Text>
            </View>
            {(spending.categories || []).length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No spending data. Connect finance integrations.</Text>
              </View>
            ) : (
              (spending.categories || []).map((cat, i) => {
                const pct = spending.total > 0 ? (cat.amount / spending.total) * 100 : 0;
                return (
                  <View key={cat.name} style={styles.spendRow}>
                    <View style={[styles.spendDot, { backgroundColor: SPEND_COLORS[i % SPEND_COLORS.length] }]} />
                    <Text style={styles.spendName}>{cat.name}</Text>
                    <View style={styles.spendBarWrap}>
                      <View style={[styles.spendBar, { width: `${Math.min(pct, 100)}%`, backgroundColor: SPEND_COLORS[i % SPEND_COLORS.length] }]} />
                    </View>
                    <Text style={styles.spendAmount}>₹{(cat.amount || 0).toLocaleString('en-IN')}</Text>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Pay Modal */}
      <Modal visible={!!payModal} transparent animationType="fade" onRequestClose={() => setPayModal(null)}>
        <TouchableWithoutFeedback onPress={() => setPayModal(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <Text style={styles.modalTitle}>Confirm Payment</Text>
                <Text style={styles.modalAmount}>₹{(payModal?.amount || 0).toLocaleString('en-IN')}</Text>
                {[['Payee', payModal?.name], ['Category', payModal?.category], ['Via', 'UPI — HDFC ••4521']].map(([k, v]) => (
                  <View key={k} style={styles.modalRow}>
                    <Text style={styles.modalRowKey}>{k}</Text>
                    <Text style={styles.modalRowVal}>{v}</Text>
                  </View>
                ))}
                <View style={styles.biometricNote}>
                  <Feather name="lock" size={13} color="#D97706" />
                  <Text style={styles.biometricText}>  Biometric required for payments ≥ ₹1,000</Text>
                </View>
                <TouchableOpacity style={styles.payBtn} onPress={handlePay} disabled={paying}>
                  <LinearGradient colors={['#1F9A5A', '#3CB37A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.payBtnGrad}>
                    <Text style={styles.payBtnText}>{paying ? 'Processing…' : 'Authenticate & Pay'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setPayModal(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Home')}>
          <Ionicons name="home" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Priorities')}>
          <Feather name="calendar" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('AskAI')}>
          <Feather name="mic" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Space')}>
          <Feather name="folder" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Profile')}>
          <Feather name="user" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#14171F' },
  headerSubtitle: { fontSize: 13, color: '#9AA1AE', marginTop: 2 },
  headerBadge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: { width: '47.5%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14 },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.3, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statSub: { fontSize: 11, color: '#9AA1AE' },
  sectionCard: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#14171F' },
  sectionBadge: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  sectionBadgeText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  billSkeleton: { height: 52, backgroundColor: '#F0F1F4', borderRadius: 12, marginBottom: 10 },
  emptyWrap: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, color: '#9AA1AE', textAlign: 'center', lineHeight: 19 },
  billRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  billRowDivider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  billIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  billEmoji: { fontSize: 18 },
  billTextWrap: { flex: 1 },
  billName: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  billDue: { fontSize: 12, color: '#9AA1AE' },
  billRight: { alignItems: 'flex-end', gap: 4 },
  billAmount: { fontSize: 15, fontWeight: '800', color: '#14171F' },
  billBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  billBadgeText: { fontSize: 10, fontWeight: '800' },
  portfolioReturn: { fontSize: 13, fontWeight: '800', color: '#1F9A5A' },
  portfolioSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F9FAFC', borderRadius: 12, padding: 12, marginBottom: 14 },
  portfolioStat: { alignItems: 'center' },
  portfolioStatLabel: { fontSize: 10, color: '#9AA1AE', fontWeight: '600', marginBottom: 4 },
  portfolioStatValue: { fontSize: 14, fontWeight: '800' },
  holdingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  holdingTextWrap: { flex: 1 },
  holdingName: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  holdingSub: { fontSize: 11, color: '#9AA1AE' },
  holdingRight: { alignItems: 'flex-end' },
  holdingReturn: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  holdingCurrent: { fontSize: 12, color: '#6B7280' },
  savingsRate: { fontSize: 12, fontWeight: '700', color: '#1F9A5A' },
  spendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  spendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  spendName: { fontSize: 12, color: '#374151', fontWeight: '600', width: 80 },
  spendBarWrap: { flex: 1, height: 6, backgroundColor: '#F0F1F4', borderRadius: 3, marginHorizontal: 8, overflow: 'hidden' },
  spendBar: { height: 6, borderRadius: 3 },
  spendAmount: { fontSize: 12, fontWeight: '700', color: '#14171F', width: 70, textAlign: 'right' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(14,17,26,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  modalSheet: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#14171F', textAlign: 'center', marginBottom: 8 },
  modalAmount: { fontSize: 36, fontWeight: '800', color: '#14171F', textAlign: 'center', marginBottom: 20 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  modalRowKey: { fontSize: 13, color: '#9AA1AE' },
  modalRowVal: { fontSize: 13, fontWeight: '700', color: '#14171F' },
  biometricNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginVertical: 16 },
  biometricText: { fontSize: 12, color: '#D97706', fontWeight: '600' },
  payBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  payBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  payBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 16 },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#374151' },
  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },
});
