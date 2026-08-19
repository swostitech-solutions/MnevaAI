import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, useWindowDimensions, Modal, TextInput,
  TouchableWithoutFeedback, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';
import { onAppDataRefresh } from '../services/dataRefresh';
const TAB_BAR_CONTENT_HEIGHT = 50;

const LOG_CATEGORIES = [
  { key: 'activity',    label: 'Activity',    icon: 'activity',   color: '#1F9A5A' },
  { key: 'body',        label: 'Body',        icon: 'trending-up',color: '#4FA6E8' },
  { key: 'vitals',      label: 'Vitals',      icon: 'heart',      color: '#E0546E' },
  { key: 'nutrition',   label: 'Nutrition',   icon: 'zap',        color: '#F5A623' },
  { key: 'sleep',       label: 'Sleep',       icon: 'moon',       color: '#615FF8' },
  { key: 'cycle',       label: 'Cycle',       icon: 'circle',     color: '#E879A0' },
];

const CATEGORY_FIELDS = {
  activity: [
    { key: 'steps',           label: 'Steps',            unit: 'steps', keyboard: 'numeric' },
    { key: 'activeMinutes',   label: 'Active Minutes',   unit: 'min',   keyboard: 'numeric' },
    { key: 'workoutType',     label: 'Workout Type',     unit: '',      keyboard: 'default' },
    { key: 'workoutDuration', label: 'Duration',         unit: 'min',   keyboard: 'numeric' },
    { key: 'workoutCalories', label: 'Calories Burned',  unit: 'kcal',  keyboard: 'numeric' },
    { key: 'distance',        label: 'Distance',         unit: 'km',    keyboard: 'decimal-pad' },
  ],
  body: [
    { key: 'weight',      label: 'Weight',       unit: 'kg',  keyboard: 'decimal-pad' },
    { key: 'height',      label: 'Height',       unit: 'cm',  keyboard: 'numeric' },
    { key: 'bmi',         label: 'BMI',          unit: '',    keyboard: 'decimal-pad' },
    { key: 'bodyFat',     label: 'Body Fat',     unit: '%',   keyboard: 'decimal-pad' },
    { key: 'muscleMass',  label: 'Muscle Mass',  unit: 'kg',  keyboard: 'decimal-pad' },
    { key: 'waist',       label: 'Waist',        unit: 'cm',  keyboard: 'numeric' },
  ],
  vitals: [
    { key: 'heartRate',              label: 'Heart Rate',   unit: 'bpm',  keyboard: 'numeric' },
    { key: 'bloodPressureSystolic',  label: 'BP Systolic',  unit: 'mmHg', keyboard: 'numeric' },
    { key: 'bloodPressureDiastolic', label: 'BP Diastolic', unit: 'mmHg', keyboard: 'numeric' },
    { key: 'bloodOxygen',            label: 'SpO₂',         unit: '%',    keyboard: 'numeric' },
    { key: 'bodyTemp',               label: 'Temperature',  unit: '°C',   keyboard: 'decimal-pad' },
  ],
  nutrition: [
    { key: 'calories', label: 'Calories',  unit: 'kcal', keyboard: 'numeric' },
    { key: 'protein',  label: 'Protein',   unit: 'g',    keyboard: 'numeric' },
    { key: 'carbs',    label: 'Carbs',     unit: 'g',    keyboard: 'numeric' },
    { key: 'fat',      label: 'Fat',       unit: 'g',    keyboard: 'numeric' },
    { key: 'fiber',    label: 'Fiber',     unit: 'g',    keyboard: 'numeric' },
    { key: 'water',    label: 'Water',     unit: 'ml',   keyboard: 'numeric' },
  ],
  sleep: [
    { key: 'sleep',        label: 'Total Sleep',  unit: 'hrs', keyboard: 'decimal-pad' },
    { key: 'sleepBedtime', label: 'Bedtime',      unit: '',    keyboard: 'default' },
    { key: 'sleepWakeup',  label: 'Wake Up',      unit: '',    keyboard: 'default' },
    { key: 'sleepDeep',    label: 'Deep Sleep',   unit: 'hrs', keyboard: 'decimal-pad' },
    { key: 'sleepRem',     label: 'REM Sleep',    unit: 'hrs', keyboard: 'decimal-pad' },
    { key: 'sleepLight',   label: 'Light Sleep',  unit: 'hrs', keyboard: 'decimal-pad' },
  ],
  cycle: [
    { key: 'cycleDay',   label: 'Cycle Day',   unit: '',  keyboard: 'numeric' },
    { key: 'cyclePhase', label: 'Phase',       unit: '',  keyboard: 'default' },
    { key: 'periodFlow', label: 'Flow',        unit: '',  keyboard: 'default' },
    { key: 'symptoms',   label: 'Symptoms',    unit: '',  keyboard: 'default' },
  ],
};

function LogDataSheet({ visible, onClose, onSynced, bottomInset }) {
  const [activeTab, setActiveTab] = useState('activity');
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    const payload = { source: 'manual' };
    Object.entries(form).forEach(([k, v]) => {
      const trimmed = String(v || '').trim();
      if (!trimmed) return;
      const isText = ['workoutType', 'sleepBedtime', 'sleepWakeup', 'cyclePhase', 'periodFlow', 'symptoms'].includes(k);
      payload[k] = isText ? trimmed : Number(trimmed);
    });
    if (Object.keys(payload).length <= 1) { setError('Enter at least one value.'); return; }
    setError('');
    setLoading(true);
    try {
      await apiFetch('/api/health-data/sync', { method: 'POST', body: JSON.stringify(payload) });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setForm({});
        onSynced();
        onClose();
      }, 800);
    } catch {
      setError('Save failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cat = LOG_CATEGORIES.find(c => c.key === activeTab);
  const fields = CATEGORY_FIELDS[activeTab] || [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.sheetOverlay} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView style={styles.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheetContent, { paddingBottom: 20 + bottomInset }]}>
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Log Health Data</Text>
              <Text style={styles.sheetSubtitle}>Manual entry — leave blank to skip</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Category Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catTabsScroll} contentContainerStyle={styles.catTabsRow}>
            {LOG_CATEGORIES.map(c => (
              <TouchableOpacity
                key={c.key}
                style={[styles.catTab, activeTab === c.key && { backgroundColor: c.color + '18', borderColor: c.color }]}
                onPress={() => { setActiveTab(c.key); setError(''); }}
              >
                <Feather name={c.icon} size={13} color={activeTab === c.key ? c.color : '#9AA1AE'} />
                <Text style={[styles.catTabText, activeTab === c.key && { color: c.color }]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Fields for active category */}
          <View style={styles.syncGrid}>
            {fields.map(({ key, label, unit, keyboard }) => (
              <View key={key} style={styles.syncField}>
                <View style={styles.syncFieldLabel}>
                  <Text style={[styles.syncFieldLabelText, { color: cat.color }]}>{label}</Text>
                </View>
                <View style={styles.syncInputRow}>
                  <TextInput
                    style={styles.syncInput}
                    placeholder="—"
                    placeholderTextColor="#C7CBD3"
                    keyboardType={keyboard}
                    value={form[key] || ''}
                    onChangeText={v => set(key, v)}
                  />
                  {!!unit && <Text style={styles.syncUnit}>{unit}</Text>}
                </View>
              </View>
            ))}
          </View>

          {!!error && <Text style={styles.syncError}>{error}</Text>}

          <TouchableOpacity
            style={[styles.syncBtn, { backgroundColor: cat.color }, (loading || success) && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={loading || success}
          >
            {loading
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : success
                ? <><Feather name="check" size={16} color="#FFFFFF" /><Text style={styles.syncBtnText}>  Saved!</Text></>
                : <><Feather name="save" size={16} color="#FFFFFF" /><Text style={styles.syncBtnText}>  Save {cat.label}</Text></>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MetricCard({ icon, label, value, unit, color, bg }) {
  return (
    <View style={[styles.metricCard, { backgroundColor: bg }]}>
      <View style={[styles.metricIconWrap, { backgroundColor: color + '22' }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={[styles.metricValue, { color }]}>{value ?? '—'}</Text>
        {unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
      </View>
    </View>
  );
}

export default function Health({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [metrics, setMetrics] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncVisible, setLogVisible] = useState(false);
  const [fitConnected, setFitConnected] = useState(false);

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [m, a, meds, fitStatus] = await Promise.all([
        apiFetch('/api/health-data/metrics'),
        apiFetch('/api/health-data/appointments'),
        apiFetch('/api/health-data/medications'),
        apiFetch('/api/googlefit/status').catch(() => ({ connected: false })),
      ]);
      setMetrics(m);
      setFitConnected(fitStatus?.connected || false);
      setAppointments(a.appointments || []);
      setMedications(meds.medications || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => onAppDataRefresh(() => loadData(true)), []);

  const METRIC_CARDS = [
    { icon: 'activity', label: 'Steps', value: metrics?.steps?.value, unit: 'steps', color: '#1F9A5A', bg: '#EFFDF6' },
    { icon: 'heart', label: 'Heart Rate', value: metrics?.heartRate?.value, unit: 'bpm', color: '#E0546E', bg: '#FCEAED' },
    { icon: 'moon', label: 'Sleep', value: metrics?.sleep?.value, unit: 'hrs', color: '#615FF8', bg: '#EEEDFE' },
    { icon: 'zap', label: 'Calories', value: metrics?.calories?.consumed, unit: 'kcal', color: '#F5A623', bg: '#FEF3C7' },
    { icon: 'trending-up', label: 'Weight', value: metrics?.weight?.value, unit: 'kg', color: '#4FA6E8', bg: '#EAF3FD' },
    { icon: 'bar-chart-2', label: 'Height', value: metrics?.height?.value, unit: 'cm', color: '#9B72FF', bg: '#F3EFFE' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor="#E0546E" colors={['#E0546E']} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Health Core</Text>
            <Text style={styles.headerSubtitle}>Vitals, appointments & meds</Text>
          </View>
          <View style={styles.headerBadge}>
            <Feather name="heart" size={18} color="#E0546E" />
          </View>
        </View>

        {/* Not connected banner */}
        {!fitConnected && !loading && (
          <TouchableOpacity
            style={styles.connectBanner}
            onPress={() => navigation?.navigate?.('ConnectedAccounts')}
            activeOpacity={0.8}
          >
            <Feather name="activity" size={15} color="#1F9A5A" />
            <Text style={styles.connectBannerText}>  Google Fit not connected — tap to connect and see live vitals</Text>
            <Feather name="chevron-right" size={14} color="#1F9A5A" />
          </TouchableOpacity>
        )}
        {fitConnected && metrics?.source === 'google_fit' && !loading && (
          <View style={[styles.connectBanner, { backgroundColor: '#EFFDF6' }]}>
            <Feather name="check-circle" size={15} color="#1F9A5A" />
            <Text style={[styles.connectBannerText, { color: '#1F9A5A' }]}>  Google Fit connected · Live data</Text>
          </View>
        )}

        {/* Metrics Grid */}
        <Text style={styles.sectionHeader}>TODAY'S VITALS</Text>
        <View style={styles.metricsGrid}>
          {loading
            ? [1, 2, 3, 4, 5, 6].map(i => <View key={i} style={styles.metricSkeleton} />)
            : METRIC_CARDS.map(m => <MetricCard key={m.label} {...m} />)
          }
        </View>

        {/* Weekly Steps */}
        {!loading && (metrics?.weeklySteps || []).length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionCardTitle}>Weekly Steps</Text>
            <View style={styles.weeklyStepsRow}>
              {(metrics.weeklySteps || []).map((day, i) => {
                const max = Math.max(...metrics.weeklySteps.map(d => d.steps || 0), 1);
                const pct = ((day.steps || 0) / max) * 100;
                return (
                  <View key={i} style={styles.weeklyDayCol}>
                    <View style={styles.weeklyBarWrap}>
                      <View style={[styles.weeklyBar, { height: `${Math.max(pct, 4)}%`, backgroundColor: pct > 70 ? '#1F9A5A' : '#4FA6E8' }]} />
                    </View>
                    <Text style={styles.weeklyDayLabel}>{day.day || ''}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Appointments */}
        <Text style={[styles.sectionHeader, { marginTop: 20 }]}>APPOINTMENTS</Text>
        <View style={styles.sectionCard}>
          {loading ? (
            [1, 2].map(i => <View key={i} style={styles.listSkeleton} />)
          ) : appointments.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="calendar" size={24} color="#C7CBD3" />
              <Text style={styles.emptyText}>No upcoming appointments</Text>
            </View>
          ) : (
            appointments.map((appt, i) => (
              <View key={appt.id || i} style={[styles.listRow, i !== appointments.length - 1 && styles.listRowDivider]}>
                <View style={styles.apptIconWrap}>
                  <Feather name="calendar" size={16} color="#4FA6E8" />
                </View>
                <View style={styles.listTextWrap}>
                  <Text style={styles.listTitle}>{appt.title || appt.doctor}</Text>
                  <Text style={styles.listSubtitle}>{appt.date} {appt.time ? `· ${appt.time}` : ''}</Text>
                </View>
                <View style={styles.apptBadge}>
                  <Text style={styles.apptBadgeText}>{appt.type || 'Visit'}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Medications */}
        <Text style={[styles.sectionHeader, { marginTop: 20 }]}>MEDICATIONS</Text>
        <View style={styles.sectionCard}>
          {loading ? (
            [1, 2].map(i => <View key={i} style={styles.listSkeleton} />)
          ) : medications.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="package" size={24} color="#C7CBD3" />
              <Text style={styles.emptyText}>No medications tracked</Text>
            </View>
          ) : (
            medications.map((med, i) => (
              <View key={med.id || i} style={[styles.listRow, i !== medications.length - 1 && styles.listRowDivider]}>
                <View style={styles.medIconWrap}>
                  <Feather name="package" size={16} color="#9B72FF" />
                </View>
                <View style={styles.listTextWrap}>
                  <Text style={styles.listTitle}>{med.name}</Text>
                  <Text style={styles.listSubtitle}>{med.dosage} · {med.frequency}</Text>
                </View>
                <View style={[styles.apptBadge, { backgroundColor: '#F3EFFE' }]}>
                  <Text style={[styles.apptBadgeText, { color: '#9B72FF' }]}>{med.time || 'Daily'}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB — Log Health Data */}
      <TouchableOpacity
        style={[styles.fab, { bottom: tabBarHeight + 16, right: horizontalPad }]}
        onPress={() => setLogVisible(true)}
      >
        <Feather name="plus" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <LogDataSheet
        visible={syncVisible}
        onClose={() => setLogVisible(false)}
        onSynced={() => loadData(true)}
        bottomInset={insets.bottom}
      />

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
  headerBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FCEAED', alignItems: 'center', justifyContent: 'center' },
  connectBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF3FD', borderRadius: 12, padding: 12, marginBottom: 16 },
  connectBannerText: { fontSize: 12, color: '#4FA6E8', fontWeight: '600', flex: 1 },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: 12 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  metricCard: { width: '30.5%', borderRadius: 16, padding: 12 },
  metricSkeleton: { width: '30.5%', height: 90, backgroundColor: '#FFFFFF', borderRadius: 16 },
  metricIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  metricLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.3, marginBottom: 4 },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  metricValue: { fontSize: 18, fontWeight: '800' },
  metricUnit: { fontSize: 10, color: '#9AA1AE', fontWeight: '600' },
  sectionCard: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  sectionCardTitle: { fontSize: 13, fontWeight: '700', color: '#14171F', marginBottom: 14 },
  weeklyStepsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 80, marginBottom: 8 },
  weeklyDayCol: { flex: 1, alignItems: 'center' },
  weeklyBarWrap: { flex: 1, width: '60%', justifyContent: 'flex-end', marginBottom: 4 },
  weeklyBar: { width: '100%', borderRadius: 4, minHeight: 4 },
  weeklyDayLabel: { fontSize: 10, color: '#9AA1AE', fontWeight: '600' },
  listSkeleton: { height: 52, backgroundColor: '#F0F1F4', borderRadius: 12, marginBottom: 10 },
  emptyWrap: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, color: '#9AA1AE', fontWeight: '600' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  listRowDivider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  apptIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EAF3FD', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  medIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3EFFE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  listTextWrap: { flex: 1 },
  listTitle: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  listSubtitle: { fontSize: 12, color: '#9AA1AE' },
  apptBadge: { backgroundColor: '#EAF3FD', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  apptBadgeText: { fontSize: 10, fontWeight: '800', color: '#4FA6E8' },
  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },
  // FAB
  fab: {
    position: 'absolute',
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#E0546E',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  // Sync sheet
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,17,26,0.5)' },
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E5EA', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  sheetSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 3 },
  syncGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  syncField: { width: '47%', backgroundColor: '#F5F6F8', borderRadius: 14, padding: 12 },
  syncFieldLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  syncFieldLabelText: { fontSize: 11, fontWeight: '700' },
  syncInputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  syncInput: {
    flex: 1, fontSize: 22, fontWeight: '800', color: '#14171F',
    padding: 0,
  },
  syncUnit: { fontSize: 11, color: '#9AA1AE', fontWeight: '600' },
  syncError: { fontSize: 12, color: '#E0546E', marginBottom: 10 },
  syncBtn: {
    backgroundColor: '#E0546E',
    borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  syncBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  // Category tabs
  catTabsScroll: { marginBottom: 16 },
  catTabsRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  catTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#E3E5EA',
    backgroundColor: '#F5F6F8',
  },
  catTabText: { fontSize: 12, fontWeight: '700', color: '#9AA1AE' },
});
