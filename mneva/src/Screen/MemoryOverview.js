import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';
import { onAppDataRefresh } from '../services/dataRefresh';
import { useTheme } from '../context/ThemeContext';

const TAB_BAR_CONTENT_HEIGHT = 50;

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Row definitions per module — value() reads from the /api/dashboard/
// memory-overview summary response for the collapsed subtitle; module is
// the recordOps.js MODULES key, used to fetch full read-only detail inline
// (see RECORD_RENDERERS below) when the row is tapped to expand — no
// navigation to the real edit screens happens from this page.
const FINANCE_ROWS = [
  {
    key: 'loans', label: 'Loans', icon: 'briefcase', color: '#4FA6E8', module: 'loan',
    value: (m) => m.loans.count ? `${plural(m.loans.count, 'loan')} · ${fmtMoney(m.loans.totalOutstanding)} outstanding` : 'No loans added',
  },
  {
    key: 'emis', label: 'EMIs', icon: 'credit-card', color: '#F5A623', module: 'emi',
    value: (m) => m.emis.count ? `${plural(m.emis.count, 'EMI')} · ${fmtMoney(m.emis.totalMonthly)}/month` : 'No EMIs added',
  },
  {
    key: 'subscriptions', label: 'Subscriptions', icon: 'repeat', color: '#9B72FF', module: 'subscription',
    value: (m) => m.subscriptions.count ? `${plural(m.subscriptions.count, 'active')} · ${fmtMoney(m.subscriptions.totalMonthly)}/month` : 'No active subscriptions',
  },
  {
    key: 'bills', label: 'Bills', icon: 'file-text', color: '#E0546E', module: 'bill',
    value: (m) => m.bills.count ? plural(m.bills.count, 'bill') + ' tracked' : 'No bills added',
  },
  {
    key: 'fixedDeposits', label: 'Fixed Deposits', icon: 'lock', color: '#06B6D4', module: 'fixed_deposit',
    value: (m) => m.fixedDeposits.count ? `${plural(m.fixedDeposits.count, 'FD')} · ${fmtMoney(m.fixedDeposits.totalPrincipal)} invested` : 'No fixed deposits added',
  },
  {
    key: 'portfolioHoldings', label: 'Portfolio', icon: 'trending-up', color: '#615FF8', module: 'portfolio_holding',
    value: (m) => m.portfolioHoldings.count ? `${plural(m.portfolioHoldings.count, 'holding')} · ${fmtMoney(m.portfolioHoldings.totalValue)} value` : 'No holdings added',
  },
  {
    key: 'expenses', label: 'Expenses', icon: 'shopping-bag', color: '#1F9A5A', module: 'expense',
    value: (m) => m.expenses.count ? `${plural(m.expenses.count, 'expense')} this month · ${fmtMoney(m.expenses.totalThisMonth)} spent` : 'No expenses logged this month',
  },
];

const HEALTH_ROWS = [
  {
    key: 'healthLog', label: 'Health Log', icon: 'activity', color: '#E0546E', module: 'health_log',
    value: (m) => m.loggedDays ? `${plural(m.loggedDays, 'day')} logged · last on ${fmtDate(m.lastLoggedDate)}` : 'No health data logged yet',
  },
];

const FAMILY_ROWS = [
  {
    key: 'familyTasks', label: 'Family Tasks', icon: 'check-square', color: '#1F9A5A', module: 'family_task',
    value: (m) => m.familyTasks.count ? `${plural(m.familyTasks.count, 'task')}${m.familyTasks.pending ? ` · ${m.familyTasks.pending} pending` : ''}` : 'No family tasks yet',
  },
  {
    key: 'pets', label: 'Pet Care', icon: 'heart', color: '#F5A623', module: 'pet',
    value: (m) => m.pets.count ? plural(m.pets.count, 'pet') + ' tracked' : 'No pets added',
  },
  {
    key: 'parentMedications', label: 'Parent Medication', icon: 'activity', color: '#E0546E', module: 'parent_medication',
    value: (m) => m.parentMedications.count ? plural(m.parentMedications.count, 'medication') + ' tracked' : 'No medications added',
  },
  {
    key: 'familyItems', label: 'Home, Kids & Celebrations', icon: 'grid', color: '#9B72FF', module: 'family_item',
    value: (m) => m.familyItems.count ? plural(m.familyItems.count, 'item') + ' saved' : 'No items added',
  },
];

// Turns one raw record (exactly what the real module screen would show —
// listRecords() runs the same route handler) into a small read-only card:
// a title, an optional subtitle, and up to a few meta lines.
const RECORD_RENDERERS = {
  loan: (r) => ({
    title: r.name || 'Loan',
    subtitle: [r.loanType, r.lenderName].filter(Boolean).join(' · '),
    meta: [
      r.outstandingAmount != null && `Outstanding: ${fmtMoney(r.outstandingAmount)}`,
      r.status && `Status: ${r.status}`,
      fmtDate(r.nextEmiDate) && `Next EMI: ${fmtDate(r.nextEmiDate)}`,
    ].filter(Boolean),
  }),
  emi: (r) => ({
    title: r.name || 'EMI',
    subtitle: [r.emiType, r.provider].filter(Boolean).join(' · '),
    meta: [
      r.emiAmount != null && `${fmtMoney(r.emiAmount)}/month`,
      (r.installmentsPaid != null && r.numberOfInstallments != null) && `${r.installmentsPaid}/${r.numberOfInstallments} paid`,
      fmtDate(r.nextPaymentDate) && `Next: ${fmtDate(r.nextPaymentDate)}`,
    ].filter(Boolean),
  }),
  subscription: (r) => ({
    title: r.name || 'Subscription',
    subtitle: r.category,
    meta: [
      r.amount != null && `${fmtMoney(r.amount)}/${String(r.billingCycle || 'month').toLowerCase()}`,
      r.status && `Status: ${r.status}`,
      fmtDate(r.nextBillingDate) && `Next billing: ${fmtDate(r.nextBillingDate)}`,
    ].filter(Boolean),
  }),
  bill: (r) => ({
    title: r.name || 'Bill',
    subtitle: r.category,
    meta: [
      (r.expectedAmount ?? r.lastBillAmount) != null && fmtMoney(r.expectedAmount ?? r.lastBillAmount),
      fmtDate(r.dueDate) && `Due: ${fmtDate(r.dueDate)}`,
      r.status && `Status: ${r.status}`,
    ].filter(Boolean),
  }),
  fixed_deposit: (r) => ({
    title: r.name || 'Fixed Deposit',
    subtitle: r.bankName,
    meta: [
      r.principalAmount != null && `Principal: ${fmtMoney(r.principalAmount)}`,
      fmtDate(r.maturityDate) && `Matures: ${fmtDate(r.maturityDate)}`,
      r.status && `Status: ${r.status}`,
    ].filter(Boolean),
  }),
  portfolio_holding: (r) => ({
    title: r.name || 'Holding',
    subtitle: [r.type, r.platform].filter(Boolean).join(' · '),
    meta: [
      r.currentValue != null && `Value: ${fmtMoney(r.currentValue)}`,
      r.investedAmount != null && `Invested: ${fmtMoney(r.investedAmount)}`,
    ].filter(Boolean),
  }),
  expense: (r) => ({
    title: r.name || r.category || 'Expense',
    subtitle: (r.name && r.category) ? r.category : null,
    meta: [
      r.amount != null && fmtMoney(r.amount),
      r.paymentMethod,
      fmtDate(r.date) && fmtDate(r.date),
    ].filter(Boolean),
  }),
  health_log: (r) => {
    const meta = [
      r.steps != null && `${r.steps} steps`,
      r.weight != null && `${r.weight} kg`,
      r.sleep != null && `${r.sleep}h sleep`,
      r.heartRate != null && `${r.heartRate} bpm`,
      r.calories != null && `${r.calories} kcal`,
    ].filter(Boolean);
    return { title: fmtDate(r.date) || r.date, subtitle: null, meta: meta.length ? meta : ['No details logged'] };
  },
  family_task: (r) => ({
    title: r.title || 'Task',
    subtitle: r.category,
    meta: [
      r.status && `Status: ${titleCase(r.status)}`,
      r.priority && `Priority: ${r.priority}`,
      r.dueDate && `Due: ${r.dueDate}`,
    ].filter(Boolean),
  }),
  pet: (r) => ({
    title: r.name || 'Pet',
    subtitle: [r.species, r.breed].filter(Boolean).join(' · '),
    meta: [
      r.sex && `Sex: ${r.sex}`,
      r.weight != null && `Weight: ${r.weight}`,
    ].filter(Boolean),
  }),
  parent_medication: (r) => ({
    title: r.medName || 'Medication',
    subtitle: [r.parent, r.dosage].filter(Boolean).join(' · '),
    meta: [
      r.frequency && `Frequency: ${r.frequency}`,
      r.refillDate && `Refill: ${r.refillDate}`,
      r.doctor && `Doctor: ${r.doctor}`,
    ].filter(Boolean),
  }),
  family_item: (r) => {
    const data = r.data && typeof r.data === 'object' ? r.data : {};
    const meta = Object.entries(data)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .slice(0, 4)
      .map(([k, v]) => `${titleCase(k)}: ${Array.isArray(v) ? v.join(', ') : v}`);
    return {
      title: titleCase(r.type) || 'Item',
      subtitle: r.family_domain ? titleCase(r.family_domain) : null,
      meta,
    };
  },
};

export default function MemoryOverview({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllMemories, setShowAllMemories] = useState(false);
  // Inline expand state for module rows — tapping a row shows its full,
  // read-only record list right here instead of navigating to the real
  // (editable) module screen. Keyed by row.key; records/loading are fetched
  // lazily on first expand and cached for the rest of this screen's life.
  const [expanded, setExpanded] = useState({});
  const [moduleRecords, setModuleRecords] = useState({});
  const [moduleLoading, setModuleLoading] = useState({});

  const toggleModule = useCallback(async (row) => {
    const key = row.key;
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
    setModuleRecords((prevRecords) => {
      if (prevRecords[key] !== undefined) return prevRecords;
      setModuleLoading((prev) => ({ ...prev, [key]: true }));
      apiFetch(`/api/dashboard/memory-overview/records?module=${row.module}`)
        .then((res) => {
          setModuleRecords((prev) => ({ ...prev, [key]: Array.isArray(res?.records) ? res.records : [] }));
        })
        .catch(() => {
          setModuleRecords((prev) => ({ ...prev, [key]: [] }));
        })
        .finally(() => {
          setModuleLoading((prev) => ({ ...prev, [key]: false }));
        });
      return prevRecords;
    });
  }, []);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await apiFetch('/api/dashboard/memory-overview');
      if (res && !res.error) setData(res);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => onAppDataRefresh(() => loadData(true)), [loadData]);

  const profile = data?.profile || null;
  const memories = data?.memories || [];
  const modules = data?.modules || null;
  const visibleMemories = showAllMemories ? memories : memories.slice(0, 5);

  const interestsList = Array.isArray(profile?.interests) ? profile.interests.filter(Boolean) : [];

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
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Memory</Text>
            <Text style={styles.headerSubtitle}>Everything Mneva knows about you</Text>
          </View>
        </View>

        {loading ? (
          [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
        ) : (
          <>
            {/* Profile summary */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Feather name="user" size={18} color={theme.accent} />
                <Text style={styles.cardTitle}>Your Profile</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.cardHeaderHint}>{profile?.completionPct || 0}% complete</Text>
              </View>
              <View style={styles.profileFacts}>
                {profile?.nickname ? <Text style={styles.profileFactLine}><Text style={styles.profileFactLabel}>Name: </Text>{profile.nickname}</Text> : null}
                {(profile?.occupation || profile?.company) ? (
                  <Text style={styles.profileFactLine}>
                    <Text style={styles.profileFactLabel}>Work: </Text>
                    {[profile.occupation, profile.company].filter(Boolean).join(' at ')}
                  </Text>
                ) : null}
                {profile?.city ? <Text style={styles.profileFactLine}><Text style={styles.profileFactLabel}>City: </Text>{[profile.city, profile.country].filter(Boolean).join(', ')}</Text> : null}
                {profile?.topGoal ? <Text style={styles.profileFactLine}><Text style={styles.profileFactLabel}>Top goal: </Text>{profile.topGoal}</Text> : null}
                {!profile?.nickname && !profile?.occupation && !profile?.city && !profile?.topGoal ? (
                  <Text style={styles.emptyHint}>No profile details saved yet.</Text>
                ) : null}
              </View>
              {interestsList.length ? (
                <View style={styles.chipRow}>
                  {interestsList.slice(0, 6).map((it, idx) => (
                    <View key={idx} style={styles.chip}><Text style={styles.chipText}>{it}</Text></View>
                  ))}
                </View>
              ) : null}
              <TouchableOpacity style={styles.editProfileBtn} onPress={() => navigation?.navigate?.('AIProfile')} activeOpacity={0.75}>
                <Text style={styles.editProfileBtnText}>Edit profile</Text>
                <Feather name="chevron-right" size={15} color={theme.accent} />
              </TouchableOpacity>
            </View>

            {/* AI memories */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Feather name="bookmark" size={18} color={theme.accentAlt} />
                <Text style={styles.cardTitle}>Things Mneva Remembers</Text>
              </View>
              {memories.length ? (
                <>
                  {visibleMemories.map((mem, idx) => (
                    <View key={idx} style={[styles.memoryRow, idx !== visibleMemories.length - 1 && styles.rowDivider]}>
                      <Text style={styles.memoryText}>{mem.text}</Text>
                      {fmtDate(mem.updatedAt) ? <Text style={styles.memoryDate}>{fmtDate(mem.updatedAt)}</Text> : null}
                    </View>
                  ))}
                  {memories.length > 5 ? (
                    <TouchableOpacity style={styles.showMoreBtn} onPress={() => setShowAllMemories(v => !v)} activeOpacity={0.75}>
                      <Text style={styles.showMoreText}>{showAllMemories ? 'Show less' : `Show ${memories.length - 5} more`}</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <Text style={styles.emptyHint}>Nothing saved yet — as you add family, pet and other details, Mneva will remember the key points here.</Text>
              )}
            </View>

            {/* Finance */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Feather name="dollar-sign" size={18} color="#1F9A5A" />
                <Text style={styles.cardTitle}>Finance</Text>
              </View>
              {FINANCE_ROWS.map((row, idx) => (
                <ModuleRow
                  key={row.key} row={row} modules={modules?.finance} styles={styles} theme={theme}
                  isLast={idx === FINANCE_ROWS.length - 1}
                  isExpanded={!!expanded[row.key]} isLoading={!!moduleLoading[row.key]}
                  records={moduleRecords[row.key]} onToggle={toggleModule}
                />
              ))}
            </View>

            {/* Health */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Feather name="heart" size={18} color="#E0546E" />
                <Text style={styles.cardTitle}>Health</Text>
              </View>
              {HEALTH_ROWS.map((row, idx) => (
                <ModuleRow
                  key={row.key} row={row} modules={modules?.health} styles={styles} theme={theme}
                  isLast={idx === HEALTH_ROWS.length - 1}
                  isExpanded={!!expanded[row.key]} isLoading={!!moduleLoading[row.key]}
                  records={moduleRecords[row.key]} onToggle={toggleModule}
                />
              ))}
            </View>

            {/* Family */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Feather name="users" size={18} color="#9B72FF" />
                <Text style={styles.cardTitle}>Family</Text>
              </View>
              {FAMILY_ROWS.map((row, idx) => (
                <ModuleRow
                  key={row.key} row={row} modules={modules?.family} styles={styles} theme={theme}
                  isLast={idx === FAMILY_ROWS.length - 1}
                  isExpanded={!!expanded[row.key]} isLoading={!!moduleLoading[row.key]}
                  records={moduleRecords[row.key]} onToggle={toggleModule}
                />
              ))}
            </View>
          </>
        )}
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

// Tapping the row expands it in place — fetches and shows every record for
// that module, read-only, right here on this screen. No navigation to the
// real (editable) module screen happens from this page.
function ModuleRow({ row, modules, styles, theme, isLast, isExpanded, isLoading, records, onToggle }) {
  const subtitle = modules ? row.value(modules) : '—';
  const renderRecord = RECORD_RENDERERS[row.module];
  return (
    <View style={!isLast && !isExpanded && styles.rowDivider}>
      <TouchableOpacity
        style={styles.moduleRow}
        activeOpacity={0.7}
        onPress={() => onToggle(row)}
      >
        <View style={[styles.moduleIconWrap, { backgroundColor: `${row.color}1A` }]}>
          <Feather name={row.icon} size={16} color={row.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.moduleLabel}>{row.label}</Text>
          <Text style={styles.moduleValue} numberOfLines={1}>{subtitle}</Text>
        </View>
        <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.disabled} />
      </TouchableOpacity>

      {isExpanded && (
        <View style={[styles.recordList, !isLast && styles.rowDivider]}>
          {isLoading ? (
            <Text style={styles.emptyHint}>Loading…</Text>
          ) : !records || !records.length ? (
            <Text style={styles.emptyHint}>Nothing saved here yet.</Text>
          ) : (
            records.map((rec, idx) => {
              const { title, subtitle: recSubtitle, meta } = renderRecord ? renderRecord(rec) : { title: 'Record', meta: [] };
              return (
                <View key={rec.id || idx} style={styles.recordCard}>
                  <Text style={styles.recordTitle}>{title}</Text>
                  {recSubtitle ? <Text style={styles.recordSubtitle}>{recSubtitle}</Text> : null}
                  {meta && meta.length ? <Text style={styles.recordMeta}>{meta.join(' · ')}</Text> : null}
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 13, color: theme.faint, marginTop: 2 },

  skeleton: { height: 120, borderRadius: 18, backgroundColor: theme.card, marginBottom: 16, opacity: 0.6 },

  card: { backgroundColor: theme.card, borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: theme.border },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
  cardHeaderHint: { fontSize: 12, fontWeight: '600', color: theme.faint },

  profileFacts: { gap: 6 },
  profileFactLine: { fontSize: 13.5, color: theme.textSecondary, lineHeight: 19 },
  profileFactLabel: { fontWeight: '700', color: theme.text },
  emptyHint: { fontSize: 13, color: theme.faint, lineHeight: 19 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { backgroundColor: theme.surfaceAlt, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },

  editProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.surfaceAlt },
  editProfileBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },

  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },

  memoryRow: { paddingVertical: 10 },
  memoryText: { fontSize: 13.5, color: theme.textSecondary, lineHeight: 19 },
  memoryDate: { fontSize: 11, color: theme.faint, marginTop: 4 },

  showMoreBtn: { paddingVertical: 10, alignItems: 'center' },
  showMoreText: { fontSize: 13, fontWeight: '700', color: theme.accent },

  moduleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  moduleIconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  moduleLabel: { fontSize: 13.5, fontWeight: '700', color: theme.text },
  moduleValue: { fontSize: 12, color: theme.faint, marginTop: 2 },

  recordList: { paddingLeft: 46, paddingBottom: 10, gap: 8 },
  recordCard: { backgroundColor: theme.surfaceAlt, borderRadius: 12, padding: 10 },
  recordTitle: { fontSize: 13, fontWeight: '700', color: theme.text },
  recordSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  recordMeta: { fontSize: 11.5, color: theme.faint, marginTop: 4 },

  tabBar: { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center', gap: 4 },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, letterSpacing: 0.4 },
});
