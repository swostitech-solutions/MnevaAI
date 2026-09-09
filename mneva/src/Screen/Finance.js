import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Feather } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { apiFetch, peekCachedResponse } from '../api/client';
import { onAppDataRefresh } from '../services/dataRefresh';
import { useSocket } from '../services/socket';
import { useTheme } from '../context/ThemeContext';

const TAB_BAR_CONTENT_HEIGHT = 50;
const SPEND_COLORS = ['#1F9A5A', '#615FF8', '#4FA6E8', '#E0546E', '#F5A623', '#9B72FF', '#06B6D4'];

// A small multi-segment donut — reused for the Spending breakdown and the
// Portfolio holdings allocation, since both are "share of a total" data.
function DonutChart({ data, size = 128, strokeWidth = 18, centerLabel, centerSub, theme, styles }) {
  const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.border} strokeWidth={strokeWidth} fill="none" />
        {total > 0 && data.map((d, i) => {
          if (!d.value) return null;
          const segLen = (d.value / total) * circumference;
          const offset = -cumulative;
          cumulative += segLen;
          return (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={d.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${segLen} ${circumference - segLen}`}
              strokeDashoffset={offset}
              rotation="-90"
              origin={`${size / 2}, ${size / 2}`}
            />
          );
        })}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.donutCenter]} pointerEvents="none">
        <Text style={styles.donutCenterLabel} numberOfLines={1}>{centerLabel}</Text>
        {centerSub ? <Text style={styles.donutCenterSub}>{centerSub}</Text> : null}
      </View>
    </View>
  );
}

const ADD_OPTIONS = [
  { key: 'loan', label: 'Loan', sub: 'Home, car, personal & more', icon: 'briefcase', colors: ['#4FA6E8', '#3D8BFF'], screen: 'LoanScreen' },
  { key: 'emi', label: 'EMI', sub: 'Any installment purchase', icon: 'credit-card', colors: ['#F5A623', '#E0901A'], screen: 'EmiScreen' },
  { key: 'subscription', label: 'Subscription', sub: 'Streaming, software & more', icon: 'repeat', colors: ['#9B72FF', '#7C5CE8'], screen: 'SubscriptionScreen' },
  { key: 'bill', label: 'Bill', sub: 'Electricity, rent, internet & more', icon: 'file-text', colors: ['#E0546E', '#C8405A'], screen: 'BillScreen' },
  { key: 'fd', label: 'Fixed Deposit', sub: 'Bank FDs & maturity tracking', icon: 'lock', colors: ['#06B6D4', '#0891B2'], screen: 'FDScreen' },
];

export default function Finance({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const { on } = useSocket();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const [bills, setBills] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [spending, setSpending] = useState(null);
  const [loans, setLoans] = useState([]);
  const [emis, setEmis] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [fixedDeposits, setFixedDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const hasRealDataRef = useRef(false);

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [b, p, s, l, e, sub, fd] = await Promise.all([
        apiFetch('/api/finance/bills'),
        apiFetch('/api/finance/portfolio'),
        apiFetch('/api/finance/spending?period=month'),
        apiFetch('/api/finance/loans'),
        apiFetch('/api/finance/emis'),
        apiFetch('/api/finance/subscriptions'),
        apiFetch('/api/finance/fixed-deposits'),
      ]);
      hasRealDataRef.current = true;
      setBills(Array.isArray(b) ? b : []);
      setPortfolio(p);
      setSpending(s);
      setLoans(l?.loans || []);
      setEmis(e?.emis || []);
      setSubscriptions(sub?.subscriptions || []);
      setFixedDeposits(fd?.fixedDeposits || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  // Paint the last known data immediately from cache — otherwise this screen
  // shows skeleton cards on every single open even though nothing changed
  // since last time. loadData() below still runs right after and silently
  // replaces this with fresh data; the ref guard stops a slow cache read
  // from ever clobbering real data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [b, p, s, l, e, sub, fd] = await Promise.all([
        peekCachedResponse('/api/finance/bills').catch(() => null),
        peekCachedResponse('/api/finance/portfolio').catch(() => null),
        peekCachedResponse('/api/finance/spending?period=month').catch(() => null),
        peekCachedResponse('/api/finance/loans').catch(() => null),
        peekCachedResponse('/api/finance/emis').catch(() => null),
        peekCachedResponse('/api/finance/subscriptions').catch(() => null),
        peekCachedResponse('/api/finance/fixed-deposits').catch(() => null),
      ]);
      const gotSomething = b || p || s || l || e || sub || fd;
      if (!cancelled && !hasRealDataRef.current && gotSomething) {
        if (b) setBills(Array.isArray(b) ? b : []);
        if (p) setPortfolio(p);
        if (s) setSpending(s);
        if (l) setLoans(l.loans || []);
        if (e) setEmis(e.emis || []);
        if (sub) setSubscriptions(sub.subscriptions || []);
        if (fd) setFixedDeposits(fd.fixedDeposits || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);
  useEffect(() => onAppDataRefresh(() => loadData(true)), []);

  // Loans/EMIs/Subscriptions/Bills/FDs are added & edited on their own
  // screens now — this dashboard only tracks the raw lists to compute the
  // overview totals below, so it still needs to stay live via sockets.
  useEffect(() => {
    const offs = [
      on('bill:created', (bill) => setBills(prev => prev.some(x => x.id === bill.id) ? prev : [bill, ...prev])),
      on('bill:updated', (bill) => setBills(prev => prev.map(x => x.id === bill.id ? bill : x))),
      on('bill:deleted', ({ id }) => setBills(prev => prev.filter(x => x.id !== id))),
      on('loan:created', (loan) => setLoans(prev => prev.some(x => x.id === loan.id) ? prev : [loan, ...prev])),
      on('loan:updated', (loan) => setLoans(prev => prev.map(x => x.id === loan.id ? loan : x))),
      on('loan:deleted', ({ id }) => setLoans(prev => prev.filter(x => x.id !== id))),
      on('emi:created', (emi) => setEmis(prev => prev.some(x => x.id === emi.id) ? prev : [emi, ...prev])),
      on('emi:updated', (emi) => setEmis(prev => prev.map(x => x.id === emi.id ? emi : x))),
      on('emi:deleted', ({ id }) => setEmis(prev => prev.filter(x => x.id !== id))),
      on('subscription:created', (s) => setSubscriptions(prev => prev.some(x => x.id === s.id) ? prev : [s, ...prev])),
      on('subscription:updated', (s) => setSubscriptions(prev => prev.map(x => x.id === s.id ? s : x))),
      on('subscription:deleted', ({ id }) => setSubscriptions(prev => prev.filter(x => x.id !== id))),
      on('fd:created', (fd) => setFixedDeposits(prev => prev.some(x => x.id === fd.id) ? prev : [fd, ...prev])),
      on('fd:updated', (fd) => setFixedDeposits(prev => prev.map(x => x.id === fd.id ? fd : x))),
      on('fd:deleted', ({ id }) => setFixedDeposits(prev => prev.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(off => off?.());
  }, [on]);

  const pendingBills = bills.filter(b => b.status !== 'Paid' && !b.autoPay).length;

  const STAT_CARDS = [
    { label: 'Total Spend', value: `₹${(spending?.total || 0).toLocaleString('en-IN')}`, color: '#1F9A5A', sub: 'This month' },
    { label: 'Bills Pending', value: pendingBills, color: '#F5A623', sub: 'Awaiting payment' },
    { label: 'Portfolio', value: portfolio ? `₹${((portfolio.totalCurrent || 0) / 1000).toFixed(0)}k` : '—', color: '#615FF8', sub: `+${portfolio?.returnPct || 0}% return` },
    { label: 'CIBIL Score', value: portfolio?.cibilScore || '—', color: '#4FA6E8', sub: portfolio?.cibilGrade || 'Not connected' },
  ];

  const activeLoans = loans.filter(l => l.status === 'Active');
  const loanOutstanding = activeLoans.reduce((sum, l) => sum + (l.outstandingAmount || 0), 0);
  const activeEmis = emis.filter(e => e.status === 'Active');
  const emiMonthly = activeEmis.reduce((sum, e) => sum + (e.emiAmount || 0), 0);
  const activeSubs = subscriptions.filter(s => s.status === 'Active');
  const subsTotal = activeSubs.reduce((sum, s) => sum + (s.amount || 0), 0);
  const activeFds = fixedDeposits.filter(f => f.status === 'Active');
  const fdInvested = activeFds.reduce((sum, f) => sum + (f.principalAmount || 0), 0);

  const OVERVIEW = [
    { key: 'loan', label: 'Loans', icon: 'briefcase', colors: ['#4FA6E8', '#3D8BFF'], screen: 'LoanScreen', count: activeLoans.length, total: loanOutstanding, totalLabel: 'outstanding' },
    { key: 'emi', label: 'EMIs', icon: 'credit-card', colors: ['#F5A623', '#E0901A'], screen: 'EmiScreen', count: activeEmis.length, total: emiMonthly, totalLabel: 'per month' },
    { key: 'subscription', label: 'Subscriptions', icon: 'repeat', colors: ['#9B72FF', '#7C5CE8'], screen: 'SubscriptionScreen', count: activeSubs.length, total: subsTotal, totalLabel: 'billed' },
    { key: 'fd', label: 'Fixed Deposits', icon: 'lock', colors: ['#06B6D4', '#0891B2'], screen: 'FDScreen', count: activeFds.length, total: fdInvested, totalLabel: 'invested' },
  ];
  const maxOverviewTotal = Math.max(...OVERVIEW.map(ov => ov.total), 1);

  const spendChartData = (spending?.categories || []).map((cat, i) => ({
    value: cat.amount || 0,
    color: SPEND_COLORS[i % SPEND_COLORS.length],
  }));

  const holdingsChartData = (portfolio?.holdings || []).map((h, i) => ({
    value: h.current || 0,
    color: SPEND_COLORS[i % SPEND_COLORS.length],
  }));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor={theme.accent} colors={[theme.accent]} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Finance</Text>
            <Text style={styles.headerSubtitle}>Bills, portfolio & spending</Text>
          </View>
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

        {/* Overview — totals for everything added via "Add to Finance" */}
        <View style={[styles.sectionCard, { marginTop: 4 }]}>
          <Text style={styles.sectionTitle}>Overview</Text>

          <View style={styles.barChartWrap}>
            {OVERVIEW.map((ov) => {
              const pct = ov.total > 0 ? Math.max((ov.total / maxOverviewTotal) * 100, 6) : 2;
              return (
                <View key={ov.key} style={styles.barChartCol}>
                  <View style={styles.barChartTrack}>
                    <LinearGradient colors={ov.colors} style={[styles.barChartFill, { height: `${pct}%` }]} />
                  </View>
                  <Text style={styles.barChartLabel} numberOfLines={1}>{ov.label}</Text>
                </View>
              );
            })}
          </View>

          <View style={{ marginTop: 4 }}>
            {OVERVIEW.map((ov, i) => (
              <TouchableOpacity
                key={ov.key}
                style={[styles.chooserOption, i !== OVERVIEW.length - 1 && styles.rowDivider]}
                onPress={() => navigation?.navigate?.(ov.screen)}
                activeOpacity={0.7}
              >
                <LinearGradient colors={ov.colors} style={styles.chooserIconGrad}>
                  <Feather name={ov.icon} size={18} color="#FFFFFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chooserOptionTitle}>{ov.label}</Text>
                  <Text style={styles.chooserOptionSub}>{ov.count} active</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.overviewAmount}>₹{ov.total.toLocaleString('en-IN')}</Text>
                  <Text style={styles.overviewAmountSub}>{ov.totalLabel}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
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
              <>
                <View style={styles.donutRowCentered}>
                  <DonutChart
                    data={holdingsChartData}
                    centerLabel={`₹${((portfolio.totalCurrent || 0) / 1000).toFixed(1)}k`}
                    centerSub="allocated"
                    theme={theme}
                    styles={styles}
                  />
                </View>
                {(portfolio.holdings || []).map((h, i) => (
                  <View key={h.id || i} style={[styles.holdingRow, i !== portfolio.holdings.length - 1 && styles.rowDivider]}>
                    <View style={[styles.spendDot, { backgroundColor: SPEND_COLORS[i % SPEND_COLORS.length] }]} />
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
                ))}
              </>
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
              <View style={styles.donutRow}>
                <DonutChart
                  data={spendChartData}
                  centerLabel={`₹${((spending.total || 0) / 1000).toFixed(1)}k`}
                  centerSub="spent"
                  theme={theme}
                  styles={styles}
                />
                <View style={styles.legendCol}>
                  {(spending.categories || []).map((cat, i) => {
                    const pct = spending.total > 0 ? Math.round((cat.amount / spending.total) * 100) : 0;
                    return (
                      <View key={cat.name} style={styles.legendRow}>
                        <View style={[styles.spendDot, { backgroundColor: SPEND_COLORS[i % SPEND_COLORS.length] }]} />
                        <Text style={styles.legendName} numberOfLines={1}>{cat.name}</Text>
                        <Text style={styles.legendPct}>{pct}%</Text>
                        <Text style={styles.legendAmount}>₹{(cat.amount || 0).toLocaleString('en-IN')}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Add to Finance — always-visible card. Each option opens its own
            full page (list + add form) instead of a popup. */}
        <View style={[styles.sectionCard, { marginTop: 16 }]}>
          <Text style={styles.sectionTitle}>Add to Finance</Text>
          <View style={{ marginTop: 10 }}>
            {ADD_OPTIONS.map((opt, i) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.chooserOption, i !== ADD_OPTIONS.length - 1 && styles.rowDivider]}
                onPress={() => navigation?.navigate?.(opt.screen)}
                activeOpacity={0.7}
              >
                <LinearGradient colors={opt.colors} style={styles.chooserIconGrad}>
                  <Feather name={opt.icon} size={18} color="#FFFFFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chooserOptionTitle}>{opt.label}</Text>
                  <Text style={styles.chooserOptionSub}>{opt.sub}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.disabled} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Home')}>
          <Ionicons name="home" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Priorities')}>
          <Feather name="calendar" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('AskAI')}>
          <Feather name="mic" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Space')}>
          <Feather name="folder" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Profile')}>
          <Feather name="user" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 13, color: theme.faint, marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    width: '47.5%', backgroundColor: theme.card, borderRadius: 16, padding: 14,
    shadowColor: '#0F1720', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statLabel: { fontSize: 11, fontWeight: '700', color: theme.faint, letterSpacing: 0.3, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statSub: { fontSize: 11, color: theme.faint },
  sectionCard: {
    backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
    shadowColor: '#0F1720', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  emptyWrap: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, color: theme.faint, textAlign: 'center', lineHeight: 19 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },
  portfolioReturn: { fontSize: 13, fontWeight: '800', color: theme.accent },
  portfolioSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 14 },
  portfolioStat: { alignItems: 'center' },
  portfolioStatLabel: { fontSize: 10, color: theme.faint, fontWeight: '600', marginBottom: 4 },
  portfolioStatValue: { fontSize: 14, fontWeight: '800' },
  holdingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  holdingTextWrap: { flex: 1 },
  holdingName: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  holdingSub: { fontSize: 11, color: theme.faint },
  holdingRight: { alignItems: 'flex-end' },
  holdingReturn: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  holdingCurrent: { fontSize: 12, color: theme.muted },
  savingsRate: { fontSize: 12, fontWeight: '700', color: theme.accent },
  spendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },

  donutCenter: { alignItems: 'center', justifyContent: 'center' },
  donutCenterLabel: { fontSize: 15, fontWeight: '800', color: theme.text },
  donutCenterSub: { fontSize: 10, color: theme.faint, marginTop: 2 },
  donutRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8 },
  donutRowCentered: { alignItems: 'center', marginBottom: 16 },
  legendCol: { flex: 1, marginLeft: 20, gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  legendName: { flex: 1, fontSize: 12, color: theme.textSecondary, fontWeight: '600', marginLeft: 6 },
  legendPct: { fontSize: 11, color: theme.faint, width: 32, textAlign: 'right' },
  legendAmount: { fontSize: 12, fontWeight: '700', color: theme.text, width: 76, textAlign: 'right', marginLeft: 6 },

  barChartWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 108, marginTop: 6, marginBottom: 4, paddingHorizontal: 2 },
  barChartCol: { flex: 1, alignItems: 'center' },
  barChartTrack: { width: 26, height: 84, backgroundColor: theme.soft, borderRadius: 13, justifyContent: 'flex-end', overflow: 'hidden' },
  barChartFill: { width: '100%', borderRadius: 13 },
  barChartLabel: { fontSize: 10, color: theme.faint, fontWeight: '700', marginTop: 8, textAlign: 'center' },

  chooserOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  chooserIconGrad: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chooserOptionTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
  chooserOptionSub: { fontSize: 12, color: theme.faint, marginTop: 1 },
  overviewAmount: { fontSize: 14, fontWeight: '800', color: theme.text },
  overviewAmountSub: { fontSize: 11, color: theme.faint, marginTop: 1 },
  tabBar: { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
});
