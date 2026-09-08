import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, TouchableWithoutFeedback, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch, peekCachedResponse } from '../api/client';
import { onAppDataRefresh } from '../services/dataRefresh';
import { useSocket } from '../services/socket';
import AddLoanModal from './finance/AddLoanModal';
import AddEmiModal from './finance/AddEmiModal';
import AddSubscriptionModal from './finance/AddSubscriptionModal';
import AddBillModal from './finance/AddBillModal';

const TAB_BAR_CONTENT_HEIGHT = 50;
const SPEND_COLORS = ['#1F9A5A', '#615FF8', '#4FA6E8', '#E0546E', '#F5A623', '#9B72FF', '#06B6D4'];

const CATEGORY_EMOJI = {
  Electricity: '⚡', Water: '💧', Internet: '🌐', Mobile: '📱', Gas: '🔥',
  Rent: '🏠', Maintenance: '🔧', Insurance: '🛡️',
};

// Real Bill rows (Upcoming/Due/Paid/Overdue + autoPay) mapped to the shape
// this section has always rendered (pending/auto/paid), so the existing
// "Upcoming Bills" UI didn't need a rewrite when the backend went from a
// hardcoded stub to real data.
const billDisplay = (bill) => ({
  id: bill.id,
  name: bill.name,
  dueDate: bill.dueDate,
  amount: bill.expectedAmount ?? bill.lastBillAmount ?? 0,
  uiStatus: bill.status === 'Paid' ? 'paid' : bill.autoPay ? 'auto' : 'pending',
  category: bill.category,
  logo: CATEGORY_EMOJI[bill.category] || '🧾',
});

const fmtShortDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—';

const ADD_OPTIONS = [
  { key: 'loan', label: 'Loan', sub: 'Home, car, personal & more', icon: 'briefcase', colors: ['#4FA6E8', '#3D8BFF'] },
  { key: 'emi', label: 'EMI', sub: 'Any installment purchase', icon: 'credit-card', colors: ['#F5A623', '#E0901A'] },
  { key: 'subscription', label: 'Subscription', sub: 'Streaming, software & more', icon: 'repeat', colors: ['#9B72FF', '#7C5CE8'] },
  { key: 'bill', label: 'Bill', sub: 'Electricity, rent, internet & more', icon: 'file-text', colors: ['#E0546E', '#C8405A'] },
];

export default function Finance({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const { on } = useSocket();

  const [bills, setBills] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [spending, setSpending] = useState(null);
  const [loans, setLoans] = useState([]);
  const [emis, setEmis] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [paying, setPaying] = useState(false);
  const [chooserVisible, setChooserVisible] = useState(false);
  const [activeAddModal, setActiveAddModal] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const openCreate = (type) => { setEditingItem(null); setActiveAddModal(type); };
  const openEdit = (type, item) => { setEditingItem(item); setActiveAddModal(type); };
  const closeAddModal = () => { setActiveAddModal(null); setEditingItem(null); };

  const hasRealDataRef = useRef(false);

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [b, p, s, l, e, sub] = await Promise.all([
        apiFetch('/api/finance/bills'),
        apiFetch('/api/finance/portfolio'),
        apiFetch('/api/finance/spending?period=month'),
        apiFetch('/api/finance/loans'),
        apiFetch('/api/finance/emis'),
        apiFetch('/api/finance/subscriptions'),
      ]);
      hasRealDataRef.current = true;
      setBills(Array.isArray(b) ? b : []);
      setPortfolio(p);
      setSpending(s);
      setLoans(l?.loans || []);
      setEmis(e?.emis || []);
      setSubscriptions(sub?.subscriptions || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  // Paint the last known bills/portfolio/spending/loans/emis/subscriptions
  // immediately from cache — otherwise this screen shows skeleton cards on
  // every single open even though nothing changed since last time. loadData()
  // below still runs right after and silently replaces this with fresh data;
  // the ref guard stops a slow cache read from ever clobbering real data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [b, p, s, l, e, sub] = await Promise.all([
        peekCachedResponse('/api/finance/bills').catch(() => null),
        peekCachedResponse('/api/finance/portfolio').catch(() => null),
        peekCachedResponse('/api/finance/spending?period=month').catch(() => null),
        peekCachedResponse('/api/finance/loans').catch(() => null),
        peekCachedResponse('/api/finance/emis').catch(() => null),
        peekCachedResponse('/api/finance/subscriptions').catch(() => null),
      ]);
      const gotSomething = b || p || s || l || e || sub;
      if (!cancelled && !hasRealDataRef.current && gotSomething) {
        if (b) setBills(Array.isArray(b) ? b : []);
        if (p) setPortfolio(p);
        if (s) setSpending(s);
        if (l) setLoans(l.loans || []);
        if (e) setEmis(e.emis || []);
        if (sub) setSubscriptions(sub.subscriptions || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);
  useEffect(() => onAppDataRefresh(() => loadData(true)), []);

  // New Loans/EMIs/Subscriptions/Bills never get pushed into state from the
  // Add-modal's own POST response — they arrive here over the socket, same
  // convention as ParentMedication.js, so every screen with this data open
  // stays in sync, not just the one that created it.
  useEffect(() => {
    const offs = [
      on('loan:created', (loan) => setLoans(prev => prev.some(x => x.id === loan.id) ? prev : [loan, ...prev])),
      on('loan:updated', (loan) => setLoans(prev => prev.map(x => x.id === loan.id ? loan : x))),
      on('loan:deleted', ({ id }) => setLoans(prev => prev.filter(x => x.id !== id))),
      on('emi:created', (emi) => setEmis(prev => prev.some(x => x.id === emi.id) ? prev : [emi, ...prev])),
      on('emi:updated', (emi) => setEmis(prev => prev.map(x => x.id === emi.id ? emi : x))),
      on('emi:deleted', ({ id }) => setEmis(prev => prev.filter(x => x.id !== id))),
      on('subscription:created', (s) => setSubscriptions(prev => prev.some(x => x.id === s.id) ? prev : [s, ...prev])),
      on('subscription:updated', (s) => setSubscriptions(prev => prev.map(x => x.id === s.id ? s : x))),
      on('subscription:deleted', ({ id }) => setSubscriptions(prev => prev.filter(x => x.id !== id))),
      on('bill:created', (bill) => setBills(prev => prev.some(x => x.id === bill.id) ? prev : [bill, ...prev])),
      on('bill:updated', (bill) => setBills(prev => prev.map(x => x.id === bill.id ? bill : x))),
      on('bill:deleted', ({ id }) => setBills(prev => prev.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(off => off?.());
  }, [on]);

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

  const displayedBills = bills.map(b => ({ ...billDisplay(b), raw: b }));
  const pendingBills = displayedBills.filter(b => b.uiStatus === 'pending').length;

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
          <TouchableOpacity onPress={() => setChooserVisible(true)}>
            <LinearGradient colors={['#1F9A5A', '#3CB37A']} style={styles.headerBadge}>
              <Feather name="plus" size={20} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
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
              <Text style={styles.sectionBadgeText}>{displayedBills.length} total</Text>
            </View>
          </View>

          {loading ? (
            [1, 2].map(i => <View key={i} style={styles.billSkeleton} />)
          ) : displayedBills.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="inbox" size={26} color="#C7CBD3" />
              <Text style={styles.emptyText}>No bills yet. Tap + to add one.</Text>
            </View>
          ) : (
            displayedBills.map((bill, i) => (
              <TouchableOpacity
                key={bill.id}
                style={[styles.billRow, i !== displayedBills.length - 1 && styles.billRowDivider]}
                onPress={() => bill.uiStatus === 'pending' && setPayModal(bill)}
                activeOpacity={bill.uiStatus === 'pending' ? 0.7 : 1}
              >
                <View style={styles.billIconWrap}>
                  <Text style={styles.billEmoji}>{bill.logo}</Text>
                </View>
                <View style={styles.billTextWrap}>
                  <Text style={styles.billName}>{bill.name}</Text>
                  <Text style={styles.billDue}>Due {fmtShortDate(bill.dueDate)}</Text>
                </View>
                <View style={styles.billRight}>
                  <Text style={styles.billAmount}>₹{(bill.amount || 0).toLocaleString('en-IN')}</Text>
                  <View style={[styles.billBadge, { backgroundColor: bill.uiStatus === 'pending' ? '#FEF3C7' : '#EFFDF6' }]}>
                    <Text style={[styles.billBadgeText, { color: bill.uiStatus === 'pending' ? '#D97706' : '#1F9A5A' }]}>
                      {bill.uiStatus === 'pending' ? 'Pay Now' : bill.uiStatus === 'auto' ? 'Auto' : 'Paid'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.editIconBtn} onPress={() => openEdit('bill', bill.raw)} hitSlop={8}>
                  <Feather name="edit-2" size={14} color="#9AA1AE" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Loans */}
        <View style={[styles.sectionCard, { marginTop: 16 }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Loans</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{loans.length} total</Text>
            </View>
          </View>
          {loans.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="briefcase" size={26} color="#C7CBD3" />
              <Text style={styles.emptyText}>No loans added yet.</Text>
            </View>
          ) : (
            loans.map((loan, i) => (
              <View key={loan.id} style={[styles.billRow, i !== loans.length - 1 && styles.billRowDivider]}>
                <View style={styles.billIconWrap}>
                  <Feather name="briefcase" size={16} color="#4FA6E8" />
                </View>
                <View style={styles.billTextWrap}>
                  <Text style={styles.billName}>{loan.name}</Text>
                  <Text style={styles.billDue}>{loan.lenderName} · Next EMI {fmtShortDate(loan.nextEmiDate)}</Text>
                </View>
                <View style={styles.billRight}>
                  <Text style={styles.billAmount}>₹{(loan.outstandingAmount || 0).toLocaleString('en-IN')}</Text>
                  <View style={[styles.billBadge, { backgroundColor: loan.status === 'Active' ? '#EFFDF6' : '#F3F4F6' }]}>
                    <Text style={[styles.billBadgeText, { color: loan.status === 'Active' ? '#1F9A5A' : '#6B7280' }]}>{loan.status}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.editIconBtn} onPress={() => openEdit('loan', loan)} hitSlop={8}>
                  <Feather name="edit-2" size={14} color="#9AA1AE" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* EMIs */}
        <View style={[styles.sectionCard, { marginTop: 16 }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>EMIs</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{emis.length} total</Text>
            </View>
          </View>
          {emis.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="credit-card" size={26} color="#C7CBD3" />
              <Text style={styles.emptyText}>No EMIs added yet.</Text>
            </View>
          ) : (
            emis.map((emi, i) => {
              const remaining = emi.installmentsRemaining ?? Math.max((emi.numberOfInstallments || 0) - (emi.installmentsPaid || 0), 0);
              return (
                <View key={emi.id} style={[styles.billRow, i !== emis.length - 1 && styles.billRowDivider]}>
                  <View style={styles.billIconWrap}>
                    <Feather name="credit-card" size={16} color="#F5A623" />
                  </View>
                  <View style={styles.billTextWrap}>
                    <Text style={styles.billName}>{emi.name}</Text>
                    <Text style={styles.billDue}>{emi.provider} · {remaining} left</Text>
                  </View>
                  <View style={styles.billRight}>
                    <Text style={styles.billAmount}>₹{(emi.emiAmount || 0).toLocaleString('en-IN')}</Text>
                    <Text style={styles.billMetaText}>{fmtShortDate(emi.nextPaymentDate)}</Text>
                  </View>
                  <TouchableOpacity style={styles.editIconBtn} onPress={() => openEdit('emi', emi)} hitSlop={8}>
                    <Feather name="edit-2" size={14} color="#9AA1AE" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        {/* Subscriptions */}
        <View style={[styles.sectionCard, { marginTop: 16 }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Subscriptions</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{subscriptions.length} total</Text>
            </View>
          </View>
          {subscriptions.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="repeat" size={26} color="#C7CBD3" />
              <Text style={styles.emptyText}>No subscriptions added yet.</Text>
            </View>
          ) : (
            subscriptions.map((sub, i) => (
              <View key={sub.id} style={[styles.billRow, i !== subscriptions.length - 1 && styles.billRowDivider]}>
                <View style={styles.billIconWrap}>
                  <Feather name="repeat" size={16} color="#9B72FF" />
                </View>
                <View style={styles.billTextWrap}>
                  <Text style={styles.billName}>{sub.name}</Text>
                  <Text style={styles.billDue}>
                    {sub.provider || sub.category} · {sub.billingCycle}{sub.autoRenewal ? ' · Auto-renew' : ''}
                  </Text>
                </View>
                <View style={styles.billRight}>
                  <Text style={styles.billAmount}>₹{(sub.amount || 0).toLocaleString('en-IN')}</Text>
                  <Text style={styles.billMetaText}>{fmtShortDate(sub.nextBillingDate)}</Text>
                </View>
                <TouchableOpacity style={styles.editIconBtn} onPress={() => openEdit('subscription', sub)} hitSlop={8}>
                  <Feather name="edit-2" size={14} color="#9AA1AE" />
                </TouchableOpacity>
              </View>
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

      {/* Add-type Chooser */}
      <Modal visible={chooserVisible} transparent animationType="fade" onRequestClose={() => setChooserVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setChooserVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.chooserSheet}>
                <Text style={styles.modalTitle}>Add to Finance</Text>
                {ADD_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={styles.chooserOption}
                    onPress={() => { setChooserVisible(false); openCreate(opt.key); }}
                  >
                    <LinearGradient colors={opt.colors} style={styles.chooserIconGrad}>
                      <Feather name={opt.icon} size={18} color="#FFFFFF" />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chooserOptionTitle}>{opt.label}</Text>
                      <Text style={styles.chooserOptionSub}>{opt.sub}</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color="#C7CBD3" />
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <AddLoanModal visible={activeAddModal === 'loan'} onClose={closeAddModal} editItem={activeAddModal === 'loan' ? editingItem : null} />
      <AddEmiModal visible={activeAddModal === 'emi'} onClose={closeAddModal} editItem={activeAddModal === 'emi' ? editingItem : null} />
      <AddSubscriptionModal visible={activeAddModal === 'subscription'} onClose={closeAddModal} editItem={activeAddModal === 'subscription' ? editingItem : null} />
      <AddBillModal visible={activeAddModal === 'bill'} onClose={closeAddModal} editItem={activeAddModal === 'bill' ? editingItem : null} />

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
  billMetaText: { fontSize: 11, color: '#9AA1AE' },
  editIconBtn: { padding: 6, marginLeft: 4 },
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
  chooserSheet: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 28, padding: 20 },
  chooserOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  chooserIconGrad: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chooserOptionTitle: { fontSize: 15, fontWeight: '700', color: '#14171F' },
  chooserOptionSub: { fontSize: 12, color: '#9AA1AE', marginTop: 1 },
  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },
});
