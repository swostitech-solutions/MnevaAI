import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, useWindowDimensions, Modal, TextInput,
  TouchableWithoutFeedback, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch, peekCachedResponse } from '../api/client';
import { onAppDataRefresh } from '../services/dataRefresh';
import { useTheme } from '../context/ThemeContext';
const TAB_BAR_CONTENT_HEIGHT = 50;

const PERIODS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

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

// Mirrors backend/src/services/activityCalc.js exactly (Steps ↔ Distance in
// either direction, Calories Burned ← MET × weight × duration) so the form
// shows the same numbers live, as you type, instead of only after the save
// round-trips through the server. Duration is deliberately NOT auto-filled
// here — it stays purely manual. Kept in plain JS here rather than imported,
// since the backend module isn't reachable from the app bundle.
function metForActivityPreview(workoutType, distanceKm, durationMin) {
  const type = String(workoutType || '').trim().toLowerCase();
  const paceKph = distanceKm && durationMin ? distanceKm / (durationMin / 60) : null;
  if (!type || type.includes('walk')) {
    if (paceKph == null) return 3.5;
    if (paceKph < 4) return 2.8;
    if (paceKph < 5.5) return 3.5;
    if (paceKph < 6.5) return 4.3;
    return 5.0;
  }
  if (type.includes('run') || type.includes('jog') || type.includes('sprint')) {
    if (paceKph == null) return 8.3;
    if (paceKph < 8) return 7.0;
    if (paceKph < 9.5) return 8.3;
    if (paceKph < 11) return 9.8;
    return 11.8;
  }
  const MET_TABLE = {
    cycle: 7.5, cycling: 7.5, bike: 7.5, biking: 7.5,
    swim: 7.0, swimming: 7.0,
    yoga: 2.5, stretching: 2.5,
    gym: 5.0, workout: 5.0, strength: 5.0, 'strength training': 5.0, weights: 5.0, weightlifting: 5.0,
    dance: 5.5, dancing: 5.5,
    hike: 6.0, hiking: 6.0,
    sport: 6.0, sports: 6.0, football: 7.0, basketball: 6.5, badminton: 5.5, tennis: 7.0, cricket: 5.0,
  };
  return MET_TABLE[type] ?? 4.5;
}
function computeDistanceKmFromStepsPreview(steps, heightCm) {
  const strideM = heightCm ? (heightCm * 0.415) / 100 : 0.71;
  return Math.round(((steps * strideM) / 1000) * 100) / 100;
}
// Reverse of the above — same stride-length relationship, so Distance can
// derive Steps just as readily as Steps derives Distance.
function computeStepsFromDistanceKmPreview(distanceKm, heightCm) {
  const strideM = heightCm ? (heightCm * 0.415) / 100 : 0.71;
  return Math.round((distanceKm * 1000) / strideM);
}
function computeCaloriesBurnedPreview(met, weightKg, durationMin) {
  return Math.round(met * weightKg * (durationMin / 60));
}

function LogDataSheet({ visible, onClose, onSynced, metrics, bottomInset, theme, styles }) {
  const [activeTab, setActiveTab] = useState('activity');
  const [form, setForm] = useState({});
  // Which fields the user has directly typed into (even to clear them) —
  // the live auto-calc below only ever fills a field that hasn't been
  // touched, so it never fights a value the user actually chose to enter.
  const [touched, setTouched] = useState({});
  // Steps and Distance are mutually derivable, so simple per-field "touched"
  // gating isn't enough — whichever one the user typed into most recently is
  // the source of truth, and the OTHER one is what gets recomputed. This
  // tracks just that, separately from the generic `touched` map.
  const [lastStepsDistanceEdit, setLastStepsDistanceEdit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (visible) { setTouched({}); setLastStepsDistanceEdit(null); }
  }, [visible]);

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setTouched(t => ({ ...t, [key]: true }));
    if (key === 'steps') setLastStepsDistanceEdit('steps');
    if (key === 'distance') setLastStepsDistanceEdit('distance');
  };
  // Writes a computed default without marking the field "touched", so it
  // keeps recomputing live as the source fields (steps, active minutes,
  // workout type...) change, right up until the user edits it themselves.
  const autoSet = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // Live preview: Distance ↔ Steps (whichever the user typed into last
  // drives the other one), Calories Burned ← MET(workout type, distance,
  // duration) × the user's own weight — same calculation the backend now
  // applies on save, just run instantly in the form so the field itself
  // shows the number, not a blank dash. Duration is never auto-filled here;
  // it stays purely manual, matching the backend. Each autoSet's own state
  // update re-triggers this effect via the dependency array below, so
  // values always converge to the latest inputs within one extra render.
  useEffect(() => {
    const steps = Number(form.steps) || 0;
    const distance = Number(form.distance) || 0;
    const activeMinutes = Number(form.activeMinutes) || 0;
    const explicitDuration = Number(form.workoutDuration) || 0;
    const weightKg = Number(metrics?.weight?.value) || null;
    const heightCm = Number(metrics?.height?.value) || null;

    if (lastStepsDistanceEdit === 'steps' && steps > 0) {
      const derived = String(computeDistanceKmFromStepsPreview(steps, heightCm));
      if (form.distance !== derived) autoSet('distance', derived);
    } else if (lastStepsDistanceEdit === 'distance' && distance > 0) {
      const derived = String(computeStepsFromDistanceKmPreview(distance, heightCm));
      if (form.steps !== derived) autoSet('steps', derived);
    } else if (!touched.distance && steps > 0) {
      // No explicit edit yet on either field this session (e.g. restored
      // from a previous tab) — default to the historical Steps→Distance
      // direction.
      autoSet('distance', String(computeDistanceKmFromStepsPreview(steps, heightCm)));
    }

    const effectiveSteps = steps || (distance ? computeStepsFromDistanceKmPreview(distance, heightCm) : 0);
    const durationForCalc = explicitDuration || activeMinutes || (effectiveSteps ? effectiveSteps / 110 : 0);
    if (!touched.workoutCalories && weightKg && durationForCalc > 0) {
      const distanceForCalc = distance || (effectiveSteps ? computeDistanceKmFromStepsPreview(effectiveSteps, heightCm) : null);
      const met = metForActivityPreview(form.workoutType, distanceForCalc, durationForCalc);
      autoSet('workoutCalories', String(computeCaloriesBurnedPreview(met, weightKg, durationForCalc)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.steps, form.distance, form.activeMinutes, form.workoutDuration, form.workoutType, touched, lastStepsDistanceEdit, metrics]);

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
      await apiFetch('/api/health-data/sync', { method: 'POST', body: payload });
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
      <KeyboardAvoidingView style={styles.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.sheetContent, { paddingBottom: 20 + bottomInset }]}>
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Log Health Data</Text>
              <Text style={styles.sheetSubtitle}>Manual entry — leave blank to skip</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={theme.muted} />
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
                <Feather name={c.icon} size={13} color={activeTab === c.key ? c.color : theme.faint} />
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
                    placeholderTextColor={theme.disabled}
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

function MetricCard({ icon, label, value, unit, color, bg, styles }) {
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

// Sunday-start week bucket for a 'YYYY-MM-DD' date string. Computed in UTC to
// match how healthLog keys are already written server-side
// (`new Date().toISOString().slice(0,10)`), so a date always buckets into the
// same week here as it was recorded under.
function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function endOfWeek(weekStartStr) {
  const d = new Date(`${weekStartStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

function fmtWeekLabel(weekStartStr, weekEndStr) {
  const start = new Date(`${weekStartStr}T00:00:00Z`);
  const end = new Date(`${weekEndStr}T00:00:00Z`);
  const startLabel = start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

// How each loggable field (see CATEGORY_FIELDS above — this covers every
// field across all 6 manual-entry categories, plus the handful Google Fit
// auto-logs) should be combined across a week's worth of daily entries:
// 'sum' for cumulative daily totals (steps, active minutes...), 'avg' for
// fluctuating daily readings (heart rate, macros...), 'latest' for
// point-in-time measurements and free-text fields (weight, workout type,
// cycle phase...) where a week's total/average wouldn't mean anything.
const FIELD_META = {
  // activity
  steps: { agg: 'sum', decimals: 0 },
  activeMinutes: { agg: 'sum', decimals: 0 },
  workoutType: { agg: 'latest', decimals: 0 },
  workoutDuration: { agg: 'sum', decimals: 0 },
  workoutCalories: { agg: 'sum', decimals: 0 },
  distance: { agg: 'sum', decimals: 1 },
  // body
  weight: { agg: 'latest', decimals: 1 },
  height: { agg: 'latest', decimals: 0 },
  bmi: { agg: 'latest', decimals: 1 },
  bodyFat: { agg: 'latest', decimals: 1 },
  muscleMass: { agg: 'latest', decimals: 1 },
  waist: { agg: 'latest', decimals: 0 },
  // vitals
  heartRate: { agg: 'avg', decimals: 0 },
  bloodPressureSystolic: { agg: 'avg', decimals: 0 },
  bloodPressureDiastolic: { agg: 'avg', decimals: 0 },
  bloodOxygen: { agg: 'avg', decimals: 0 },
  bodyTemp: { agg: 'avg', decimals: 1 },
  // nutrition
  calories: { agg: 'avg', decimals: 0 },
  protein: { agg: 'avg', decimals: 0 },
  carbs: { agg: 'avg', decimals: 0 },
  fat: { agg: 'avg', decimals: 0 },
  fiber: { agg: 'avg', decimals: 0 },
  water: { agg: 'avg', decimals: 0 },
  // sleep
  sleep: { agg: 'avg', decimals: 1 },
  sleepBedtime: { agg: 'latest', decimals: 0 },
  sleepWakeup: { agg: 'latest', decimals: 0 },
  sleepDeep: { agg: 'avg', decimals: 1 },
  sleepRem: { agg: 'avg', decimals: 1 },
  sleepLight: { agg: 'avg', decimals: 1 },
  // cycle
  cycleDay: { agg: 'latest', decimals: 0 },
  cyclePhase: { agg: 'latest', decimals: 0 },
  periodFlow: { agg: 'latest', decimals: 0 },
  symptoms: { agg: 'latest', decimals: 0 },
};

function roundTo(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function aggregateField(days, key, meta) {
  if (meta.agg === 'sum' || meta.agg === 'avg') {
    const vals = days.map(d => d[key]).filter(v => typeof v === 'number');
    if (!vals.length) return null;
    const total = vals.reduce((a, b) => a + b, 0);
    return roundTo(meta.agg === 'sum' ? total : total / vals.length, meta.decimals);
  }
  // 'latest' — most recent day in the week that has this field, whether it's
  // a number (weight, cycleDay) or free text (workoutType, symptoms).
  for (let i = days.length - 1; i >= 0; i--) {
    const v = days[i][key];
    if (v !== undefined && v !== null && v !== '') {
      return typeof v === 'number' ? roundTo(v, meta.decimals) : v;
    }
  }
  return null;
}

// Groups the full per-date healthLog (manual entries + Google Fit's daily
// auto-log — see backend `GET /api/health-data/log`) into calendar weeks, so
// the screen can show week-over-week history across every tracked category
// (Activity, Body, Vitals, Nutrition, Sleep, Cycle) instead of just today.
function groupLogByWeek(log) {
  const days = Object.entries(log || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => ({ date, ...entry }));
  if (!days.length) return [];

  const buckets = new Map();
  for (const day of days) {
    const weekStart = startOfWeek(day.date);
    if (!buckets.has(weekStart)) buckets.set(weekStart, []);
    buckets.get(weekStart).push(day);
  }

  const todayWeekStart = startOfWeek(new Date().toISOString().slice(0, 10));

  const weeks = Array.from(buckets.entries()).map(([weekStart, weekDays]) => {
    const stats = {};
    for (const key of Object.keys(FIELD_META)) {
      stats[key] = aggregateField(weekDays, key, FIELD_META[key]);
    }
    return {
      weekStart,
      weekEnd: endOfWeek(weekStart),
      isCurrentWeek: weekStart === todayWeekStart,
      daysLogged: weekDays.length,
      stats,
    };
  });

  weeks.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  return weeks;
}

// Same idea as groupLogByWeek but bucketed by calendar month ('YYYY-MM') —
// backs the Month tab's summary stats and "target reached X/Y days" line.
function groupLogByMonth(log, stepGoal) {
  const days = Object.entries(log || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => ({ date, ...entry }));
  if (!days.length) return [];

  const buckets = new Map();
  for (const day of days) {
    const monthKey = day.date.slice(0, 7);
    if (!buckets.has(monthKey)) buckets.set(monthKey, []);
    buckets.get(monthKey).push(day);
  }

  const todayMonthKey = new Date().toISOString().slice(0, 7);

  const months = Array.from(buckets.entries()).map(([monthKey, monthDays]) => {
    const stats = {};
    for (const key of Object.keys(FIELD_META)) {
      stats[key] = aggregateField(monthDays, key, FIELD_META[key]);
    }
    const daysGoalReached = monthDays.filter(d => (d.steps || 0) >= stepGoal).length;
    return {
      monthKey,
      isCurrentMonth: monthKey === todayMonthKey,
      daysLogged: monthDays.length,
      daysGoalReached,
      stats,
    };
  });

  months.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  return months;
}

// Calendar-math helpers for the Month tab's navigable calendar grid — all in
// UTC to match how healthLog keys are written server-side ('YYYY-MM-DD').

// Every calendar date in a 'YYYY-MM' month, capped at today if it's the
// current month (future days have no data to show).
function datesInMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonthCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const dates = [];
  for (let d = 1; d <= daysInMonthCount; d++) {
    const dateStr = new Date(Date.UTC(year, month - 1, d)).toISOString().slice(0, 10);
    if (dateStr > todayStr) break;
    dates.push(dateStr);
  }
  return dates;
}

// 0 (Sunday) – 6 (Saturday) — how many blank cells to lead the grid with so
// the 1st lands under the correct weekday column.
function firstWeekdayOfMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function shiftMonthKey(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function fmtMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function WeekCard({ week, styles }) {
  return (
    <View style={styles.weekCard}>
      <View style={styles.weekCardHeaderRow}>
        <Text style={styles.weekCardRange}>{fmtWeekLabel(week.weekStart, week.weekEnd)}</Text>
        {week.isCurrentWeek && (
          <View style={styles.weekCardBadge}>
            <Text style={styles.weekCardBadgeText}>This Week</Text>
          </View>
        )}
      </View>
      {LOG_CATEGORIES.map(cat => {
        const fields = (CATEGORY_FIELDS[cat.key] || []).filter(f => week.stats[f.key] != null);
        if (!fields.length) return null;
        return (
          <View key={cat.key} style={styles.weekCategoryBlock}>
            <View style={styles.weekCategoryLabelRow}>
              <Feather name={cat.icon} size={12} color={cat.color} />
              <Text style={[styles.weekCategoryLabel, { color: cat.color }]}>{cat.label.toUpperCase()}</Text>
            </View>
            <View style={styles.weekStatsRow}>
              {fields.map(f => (
                <View key={f.key} style={styles.weekStat}>
                  <Text style={styles.weekStatLabel}>{f.label}</Text>
                  <Text style={styles.weekStatValue}>{week.stats[f.key]}{f.unit ? ` ${f.unit}` : ''}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
      <Text style={styles.weekDaysLogged}>{week.daysLogged}/7 days logged</Text>
    </View>
  );
}

function SummaryStat({ label, value, unit, styles }) {
  if (value == null) return null;
  return (
    <View style={styles.periodSummaryStat}>
      <Text style={styles.periodSummaryValue}>{Number(value).toLocaleString('en-IN')}{unit ? ` ${unit}` : ''}</Text>
      <Text style={styles.periodSummaryLabel}>{label}</Text>
    </View>
  );
}

// Day tab — today's activity at a glance. Steps/goal comes from `metrics`
// (the live Google-Fit-or-fallback reading this screen already fetches);
// Active Minutes/Calories Burned/Distance aren't part of that payload, so
// they're read from today's raw log entry instead.
// A single detail row — icon, label + value, and (when a sensible daily
// target exists) a slim progress bar underneath. Deliberately a list, not
// another grid of boxes — TODAY'S VITALS above already covers that shape.
function DayDetailRow({ icon, label, value, unit, pct, color, theme, styles, last }) {
  return (
    <View style={[styles.dayDetailRow, last && styles.dayDetailRowLast]}>
      <View style={[styles.dayDetailIconWrap, { backgroundColor: color + (theme.isDark ? '2A' : '18') }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.dayDetailTopRow}>
          <Text style={styles.dayDetailLabel}>{label}</Text>
          <Text style={styles.dayDetailValue}>{value != null ? `${Number(value).toLocaleString('en-IN')}${unit ? ' ' + unit : ''}` : '—'}</Text>
        </View>
        {pct != null && (
          <View style={styles.dayDetailBarTrack}>
            <View style={[styles.dayDetailBarFill, { width: `${Math.max(pct, value > 0 ? 4 : 0)}%`, backgroundColor: color }]} />
          </View>
        )}
      </View>
    </View>
  );
}

// Shared hero-card + detail-list rendering for "one day's activity
// breakdown" — used both by the Day tab (today, live-metrics-aware) and by
// tapping a bar/day cell in the Week/Month tabs (a specific past date, read
// straight from that date's healthLog entry).
function DayDetailCard({ dateLabel, steps, stepGoal, activeMinutes, workoutCalories, distance, theme, styles }) {
  const stepPct = Math.min(100, Math.round((steps / stepGoal) * 100));

  const activeGoal = 90; // a commonly-used daily active-minutes target
  const activePct = activeMinutes != null ? Math.min(100, Math.round((activeMinutes / activeGoal) * 100)) : null;

  const calorieGoal = 500;
  const caloriePct = workoutCalories != null ? Math.min(100, Math.round((workoutCalories / calorieGoal) * 100)) : null;

  return (
    <View>
      <View style={styles.dayHero}>
        <View style={styles.dayHeroTopRow}>
          <View>
            <Text style={styles.dayHeroLabel}>{dateLabel.toUpperCase()} · STEPS</Text>
            <View style={styles.dayHeroValueRow}>
              <Text style={styles.dayHeroValue}>{steps.toLocaleString('en-IN')}</Text>
              <Text style={styles.dayHeroGoal}> / {stepGoal.toLocaleString('en-IN')}</Text>
            </View>
          </View>
          <View style={styles.dayHeroBadge}>
            <Feather name="activity" size={20} color="#1F9A5A" />
          </View>
        </View>
        <View style={styles.dayHeroBarTrack}>
          <LinearGradient
            colors={['#8FDCB6', '#1F9A5A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[styles.dayHeroBarFill, { width: `${Math.max(stepPct, steps > 0 ? 4 : 0)}%` }]}
          />
        </View>
        <Text style={styles.dayHeroPct}>{stepPct}% of daily goal</Text>
      </View>

      <View style={styles.dayDetailList}>
        <DayDetailRow icon="clock" label="Active Minutes" value={activeMinutes} unit="min" pct={activePct} color="#4FA6E8" theme={theme} styles={styles} />
        <DayDetailRow icon="zap" label="Calories Burned" value={workoutCalories} unit="kcal" pct={caloriePct} color="#F5A623" theme={theme} styles={styles} />
        <DayDetailRow icon="map-pin" label="Distance Covered" value={distance} unit="km" pct={null} color="#9B72FF" theme={theme} styles={styles} last />
      </View>
    </View>
  );
}

// Day tab — always today, live-metrics-aware (steps prefers the live `metrics`
// reading; the rest come from today's raw log since `metrics` doesn't carry them).
function DayActivityView({ metrics, todayLog, theme, styles }) {
  const steps = metrics?.steps?.value ?? todayLog?.steps ?? 0;
  const stepGoal = metrics?.steps?.goal || 10000;
  return (
    <DayDetailCard
      dateLabel="Today"
      steps={steps}
      stepGoal={stepGoal}
      activeMinutes={todayLog?.activeMinutes ?? null}
      workoutCalories={todayLog?.workoutCalories ?? null}
      distance={todayLog?.distance ?? null}
      theme={theme}
      styles={styles}
    />
  );
}

// "Today" for today, else "Tue, 15 Sep" — used as the DayDetailCard header
// whenever a specific date is tapped in the Week/Month tabs.
function fmtSelectedDateLabel(dateStr, todayStr) {
  if (dateStr === todayStr) return 'Today';
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Week tab — the existing 7-day bar chart (unchanged), plus a totals row
// summarizing the current Sunday–Saturday week (already computed by
// groupLogByWeek for the Weekly Tracking section below, reused here).
function WeekActivityView({ metrics, currentWeek, healthLog, selectedDate, onSelectDate, theme, styles }) {
  const weekSteps = metrics?.weeklySteps || [];
  if (!weekSteps.length) return <Text style={styles.emptyStateText}>No step data yet this week.</Text>;

  const goal = metrics?.steps?.goal || 10000;
  const maxSteps = Math.max(...weekSteps.map(d => d.steps || 0), goal);
  const goalPct = Math.min((goal / maxSteps) * 100, 94);
  const todayStr = new Date().toISOString().slice(0, 10);

  // The tapped bar's detail card only shows while that date is actually one
  // of the 7 bars on screen — switching to Month and back, or the week
  // rolling over, shouldn't leave a stale card for a day no longer in view.
  const selectedDay = weekSteps.find(d => d.date === selectedDate);

  return (
    <>
      <View style={styles.chartHeaderRow}>
        <Text style={styles.sectionCardTitle}>This Week</Text>
        <View style={styles.chartGoalPill}>
          <Feather name="target" size={11} color={theme.accent} />
          <Text style={styles.chartGoalText}>{goal.toLocaleString('en-IN')} goal</Text>
        </View>
      </View>
      <View style={styles.chartArea}>
        <View style={[styles.goalLine, { bottom: `${goalPct}%` }]} />
        <View style={styles.barsRow}>
          {weekSteps.map((day, i) => {
            const steps = day.steps || 0;
            const pct = Math.max((steps / maxSteps) * 100, steps > 0 ? 3 : 0);
            const hitGoal = steps >= goal && steps > 0;
            const isSelected = day.date === selectedDate;
            return (
              <TouchableOpacity key={i} style={styles.barCol} activeOpacity={0.7} onPress={() => onSelectDate(day.date)}>
                <View style={styles.barTrack} />
                {hitGoal && (
                  <View style={[styles.goalBadge, { bottom: `${pct}%` }]}>
                    <Feather name="check" size={10} color="#FFFFFF" />
                  </View>
                )}
                <LinearGradient
                  colors={hitGoal ? ['#3CB37A', '#1F9A5A'] : ['#8FDCB6', '#5FC492']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={[styles.weeklyBar, { height: `${pct}%` }, isSelected && styles.weeklyBarSelected]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={styles.labelsRow}>
        {weekSteps.map((day, i) => (
          <Text
            key={i}
            style={[
              styles.weeklyDayLabel,
              day.date === todayStr && styles.weeklyDayLabelActive,
              day.date === selectedDate && styles.weeklyDayLabelSelected,
            ]}
          >
            {day.day || ''}
          </Text>
        ))}
      </View>
      {currentWeek && (
        <View style={styles.periodSummaryRow}>
          <SummaryStat label="Steps" value={currentWeek.stats.steps} styles={styles} />
          <SummaryStat label="Active" value={currentWeek.stats.activeMinutes} unit="min" styles={styles} />
          <SummaryStat label="Calories" value={currentWeek.stats.workoutCalories} unit="kcal" styles={styles} />
        </View>
      )}
      {selectedDay && (
        <View style={styles.selectedDaySection}>
          <DayDetailCard
            dateLabel={fmtSelectedDateLabel(selectedDate, todayStr)}
            steps={healthLog?.[selectedDate]?.steps ?? selectedDay.steps ?? 0}
            stepGoal={goal}
            activeMinutes={healthLog?.[selectedDate]?.activeMinutes ?? null}
            workoutCalories={healthLog?.[selectedDate]?.workoutCalories ?? null}
            distance={healthLog?.[selectedDate]?.distance ?? null}
            theme={theme}
            styles={styles}
          />
        </View>
      )}
    </>
  );
}

// Month tab — a bar per day of the current month so far (horizontally
// scrollable), plus the same totals row and a "target reached" line, using
// groupLogByMonth's aggregated stats.
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Month tab — a real calendar (Samsung Health / Google Fit style): a day
// cell per date with a filled dot once that day hit the step goal, a
// lighter tint for a logged-but-under-goal day, and a plain neutral circle
// for a day with nothing logged. Prev/Next lets you page back through any
// earlier month that has data, not just the current one.
function MonthActivityView({ selectedMonthKey, onChangeMonth, monthStats, healthLog, goal, selectedDate, onSelectDate, theme, styles }) {
  const dates = datesInMonth(selectedMonthKey);
  const leadingBlanks = firstWeekdayOfMonth(selectedMonthKey);
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const canGoNext = selectedMonthKey < currentMonthKey;
  const cells = [...Array.from({ length: leadingBlanks }, () => null), ...dates];

  // Only show the tapped day's detail card while it actually falls in the
  // month currently being viewed — paging to a different month shouldn't
  // leave last month's selected-day card hanging around.
  const selectedDateInView = selectedDate.slice(0, 7) === selectedMonthKey;

  return (
    <>
      <View style={styles.monthNavRow}>
        <TouchableOpacity onPress={() => onChangeMonth(-1)} style={styles.monthNavBtn}>
          <Feather name="chevron-left" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.sectionCardTitle}>{fmtMonthLabel(selectedMonthKey)}</Text>
        <TouchableOpacity onPress={() => canGoNext && onChangeMonth(1)} style={styles.monthNavBtn} disabled={!canGoNext}>
          <Feather name="chevron-right" size={18} color={canGoNext ? theme.text : theme.disabled} />
        </TouchableOpacity>
      </View>

      <View style={styles.calendarWeekdayRow}>
        {WEEKDAY_LABELS.map((d, i) => (
          <Text key={i} style={styles.calendarWeekdayLabel}>{d}</Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {cells.map((date, i) => {
          if (!date) return <View key={`blank-${i}`} style={styles.calendarCell} />;
          const steps = healthLog?.[date]?.steps || 0;
          const hasData = steps > 0;
          const hitGoal = steps >= goal && steps > 0;
          const isToday = date === todayStr;
          const isSelected = date === selectedDate;
          return (
            <TouchableOpacity key={date} style={styles.calendarCell} activeOpacity={0.7} onPress={() => onSelectDate(date)}>
              <View style={[
                styles.calendarDot,
                hitGoal ? styles.calendarDotGoal : hasData ? styles.calendarDotSome : null,
                isToday && styles.calendarDotToday,
                isSelected && styles.calendarDotSelected,
              ]}>
                <Text style={[styles.calendarDayNum, hitGoal && styles.calendarDayNumGoal]}>{Number(date.slice(-2))}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {monthStats ? (
        <>
          <View style={styles.periodSummaryRow}>
            <SummaryStat label="Steps" value={monthStats.stats.steps} styles={styles} />
            <SummaryStat label="Active" value={monthStats.stats.activeMinutes} unit="min" styles={styles} />
            <SummaryStat label="Calories" value={monthStats.stats.workoutCalories} unit="kcal" styles={styles} />
          </View>
          <Text style={styles.monthTargetText}>Target reached {monthStats.daysGoalReached}/{monthStats.daysLogged} days</Text>
        </>
      ) : (
        <Text style={styles.emptyStateText}>No step data logged this month.</Text>
      )}

      {selectedDateInView && (
        <View style={styles.selectedDaySection}>
          <DayDetailCard
            dateLabel={fmtSelectedDateLabel(selectedDate, todayStr)}
            steps={healthLog?.[selectedDate]?.steps || 0}
            stepGoal={goal}
            activeMinutes={healthLog?.[selectedDate]?.activeMinutes ?? null}
            workoutCalories={healthLog?.[selectedDate]?.workoutCalories ?? null}
            distance={healthLog?.[selectedDate]?.distance ?? null}
            theme={theme}
            styles={styles}
          />
        </View>
      )}
    </>
  );
}

function HistoryModal({ visible, onClose, weeks, bottomInset, theme, styles }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.sheetOverlay} />
      </TouchableWithoutFeedback>
      <View style={styles.historySheetWrap}>
        <View style={[styles.historySheetContent, { paddingBottom: 20 + bottomInset }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Weekly History</Text>
              <Text style={styles.sheetSubtitle}>{weeks.length} week{weeks.length === 1 ? '' : 's'} tracked</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={theme.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {weeks.map(week => <WeekCard key={week.weekStart} week={week} styles={styles} />)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function Health({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const [metrics, setMetrics] = useState(null);
  const [weeklyHistory, setWeeklyHistory] = useState([]);
  const [monthlyHistory, setMonthlyHistory] = useState([]);
  const [healthLog, setHealthLog] = useState({});
  const [period, setPeriod] = useState('week');
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [historyVisible, setHistoryVisible] = useState(false);
  const currentWeek = weeklyHistory.find(w => w.isCurrentWeek) || null;
  const selectedMonthStats = monthlyHistory.find(m => m.monthKey === selectedMonthKey) || null;
  const handleChangeMonth = (delta) => setSelectedMonthKey(k => shiftMonthKey(k, delta));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncVisible, setLogVisible] = useState(false);
  const [fitConnected, setFitConnected] = useState(false);

  const hasRealDataRef = useRef(false);

  // Shared by the real fetch below and by the cache-hydration pass before it,
  // so a returning user sees their last known vitals immediately instead of
  // skeleton cards for however long the network round-trip takes.
  const applyHealthData = ({ m, fitStatus, log }) => {
    if (m) setMetrics(m);
    if (fitStatus) setFitConnected(fitStatus?.connected || false);
    if (log) {
      setHealthLog(log);
      setWeeklyHistory(groupLogByWeek(log));
      setMonthlyHistory(groupLogByMonth(log, m?.steps?.goal || 10000));
    }
  };

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [m, fitStatus, logRes] = await Promise.all([
        apiFetch('/api/health-data/metrics'),
        apiFetch('/api/googlefit/status').catch(() => ({ connected: false })),
        apiFetch('/api/health-data/log').catch(() => ({ log: {} })),
      ]);
      hasRealDataRef.current = true;
      applyHealthData({ m, fitStatus, log: logRes?.log });
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  // Paint the last known vitals/weekly-history immediately from cache —
  // otherwise this screen shows skeleton cards on every single open even
  // though nothing changed since last time. loadData() below still runs
  // right after and silently replaces this with fresh data; the ref guard
  // stops a slow cache read from ever clobbering real data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [m, fitStatus, logRes] = await Promise.all([
        peekCachedResponse('/api/health-data/metrics').catch(() => null),
        peekCachedResponse('/api/googlefit/status').catch(() => null),
        peekCachedResponse('/api/health-data/log').catch(() => null),
      ]);
      const gotSomething = m || fitStatus || logRes;
      if (!cancelled && !hasRealDataRef.current && gotSomething) {
        applyHealthData({ m, fitStatus, log: logRes?.log });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);
  useEffect(() => onAppDataRefresh(() => loadData(true)), []);

  const METRIC_CARDS = [
    { icon: 'activity', label: 'Steps', value: metrics?.steps?.value, unit: 'steps', color: '#1F9A5A', bg: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6' },
    { icon: 'heart', label: 'Heart Rate', value: metrics?.heartRate?.value, unit: 'bpm', color: '#E0546E', bg: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED' },
    { icon: 'moon', label: 'Sleep', value: metrics?.sleep?.value, unit: 'hrs', color: '#615FF8', bg: theme.isDark ? 'rgba(129,128,255,0.16)' : '#EEEDFE' },
    { icon: 'zap', label: 'Calories', value: metrics?.calories?.consumed, unit: 'kcal', color: '#F5A623', bg: theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7' },
    { icon: 'trending-up', label: 'Weight', value: metrics?.weight?.value, unit: 'kg', color: '#4FA6E8', bg: theme.isDark ? 'rgba(107,184,240,0.16)' : '#EAF3FD' },
    { icon: 'bar-chart-2', label: 'Height', value: metrics?.height?.value, unit: 'cm', color: '#9B72FF', bg: theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor={theme.danger} colors={[theme.danger]} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Health Core</Text>
            <Text style={styles.headerSubtitle}>Vitals & activity</Text>
          </View>
          <View style={styles.headerBadge}>
            <Feather name="heart" size={18} color={theme.danger} />
          </View>
        </View>

        {/* Not connected banner */}
        {!fitConnected && !loading && (
          <TouchableOpacity
            style={styles.connectBanner}
            onPress={() => navigation?.navigate?.('ConnectedAccounts')}
            activeOpacity={0.8}
          >
            <Feather name="activity" size={15} color={theme.accent} />
            <Text style={styles.connectBannerText}>  Google Fit not connected — tap to connect and see live vitals</Text>
            <Feather name="chevron-right" size={14} color={theme.accent} />
          </TouchableOpacity>
        )}
        {fitConnected && metrics?.source === 'google_fit' && !loading && (
          <View style={[styles.connectBanner, { backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6' }]}>
            <Feather name="check-circle" size={15} color={theme.accent} />
            <Text style={[styles.connectBannerText, { color: theme.accent }]}>  Google Fit connected · Live data</Text>
          </View>
        )}

        {/* Metrics Grid */}
        <Text style={styles.sectionHeader}>TODAY'S VITALS</Text>
        <View style={styles.metricsGrid}>
          {loading
            ? [1, 2, 3, 4, 5, 6].map(i => <View key={i} style={styles.metricSkeleton} />)
            : METRIC_CARDS.map(m => <MetricCard key={m.label} {...m} styles={styles} />)
          }
        </View>

        {/* Activity Overview — Day / Week / Month tabs (styled after Google
            Fit's own history view), each showing its own chart/stats built
            from the same underlying data: `metrics` for today's live
            reading, and the per-date healthLog for week/month history. */}
        {!loading && (() => {
          const stepGoal = metrics?.steps?.goal || 10000;
          const todayStr = new Date().toISOString().slice(0, 10);
          return (
            <View style={styles.sectionCard}>
              <View style={styles.periodTabsRow}>
                {PERIODS.map(p => (
                  <TouchableOpacity
                    key={p.key}
                    style={[styles.periodTab, period === p.key && styles.periodTabActive]}
                    onPress={() => setPeriod(p.key)}
                  >
                    <Text style={[styles.periodTabText, period === p.key && styles.periodTabTextActive]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {period === 'day' && <DayActivityView metrics={metrics} todayLog={healthLog?.[todayStr]} theme={theme} styles={styles} />}
              {period === 'week' && (
                <WeekActivityView
                  metrics={metrics}
                  currentWeek={currentWeek}
                  healthLog={healthLog}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  theme={theme}
                  styles={styles}
                />
              )}
              {period === 'month' && (
                <MonthActivityView
                  selectedMonthKey={selectedMonthKey}
                  onChangeMonth={handleChangeMonth}
                  monthStats={selectedMonthStats}
                  healthLog={healthLog}
                  goal={stepGoal}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  theme={theme}
                  styles={styles}
                />
              )}
            </View>
          );
        })()}

        {/* Weekly Tracking — only the current Sunday-to-Saturday week shows
            here; the full history (every past week) lives behind "View Full
            History" so this page stays focused on "now", not a long scroll. */}
        <Text style={[styles.sectionHeader, { marginTop: 20 }]}>WEEKLY TRACKING</Text>
        {loading ? (
          <View style={styles.sectionCard}>
            <View style={styles.listSkeleton} />
          </View>
        ) : !currentWeek ? (
          <View style={styles.sectionCard}>
            <View style={styles.emptyWrap}>
              <Feather name="bar-chart-2" size={24} color={theme.disabled} />
              <Text style={styles.emptyText}>No health data logged this week yet — tap + to add your first entry</Text>
            </View>
          </View>
        ) : (
          <WeekCard week={currentWeek} styles={styles} />
        )}
        {weeklyHistory.length > 0 && (
          <TouchableOpacity style={styles.historyLink} onPress={() => setHistoryVisible(true)}>
            <Feather name="clock" size={14} color={theme.info} />
            <Text style={styles.historyLinkText}>View Full History</Text>
            <Feather name="chevron-right" size={16} color={theme.info} />
          </TouchableOpacity>
        )}

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
        metrics={metrics}
        bottomInset={insets.bottom}
        theme={theme}
        styles={styles}
      />

      <HistoryModal
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        weeks={weeklyHistory}
        bottomInset={insets.bottom}
        theme={theme}
        styles={styles}
      />

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
  headerBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED', alignItems: 'center', justifyContent: 'center' },
  connectBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.isDark ? 'rgba(107,184,240,0.16)' : '#EAF3FD', borderRadius: 12, padding: 12, marginBottom: 16 },
  connectBannerText: { fontSize: 12, color: theme.info, fontWeight: '600', flex: 1 },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: theme.muted, letterSpacing: 0.5, marginBottom: 12 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  metricCard: {
    width: '30.5%', borderRadius: 16, padding: 12,
    shadowColor: '#0F1720', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  metricSkeleton: { width: '30.5%', height: 90, backgroundColor: theme.card, borderRadius: 16 },
  metricIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  metricLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, letterSpacing: 0.3, marginBottom: 4 },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  metricValue: { fontSize: 18, fontWeight: '800' },
  metricUnit: { fontSize: 10, color: theme.faint, fontWeight: '600' },
  sectionCard: {
    backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
    shadowColor: '#0F1720', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  sectionCardTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 14 },
  chartHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  chartGoalPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  chartGoalText: { fontSize: 11, fontWeight: '700', color: theme.accent },
  chartArea: { height: 130, position: 'relative', marginBottom: 10 },
  goalLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: theme.info, opacity: 0.6 },
  barsRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  barCol: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', position: 'relative', paddingHorizontal: 4 },
  // Chart track/labels are theme-mapped; the bar fill gradients below are
  // deliberately fixed saturated greens (goal-hit vs normal) — a data-viz
  // choice, not a theme-structural color.
  barTrack: { position: 'absolute', bottom: 0, width: '58%', height: '100%', backgroundColor: theme.soft, borderRadius: 14 },
  weeklyBar: {
    width: '58%', borderRadius: 14, minHeight: 8,
    shadowColor: '#1F9A5A', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  goalBadge: {
    position: 'absolute', width: 20, height: 20, borderRadius: 10,
    backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#FFFFFF', zIndex: 3,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  labelsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weeklyDayLabel: { flex: 1, textAlign: 'center', fontSize: 11, color: theme.faint, fontWeight: '600' },
  weeklyDayLabelActive: { color: theme.text, fontWeight: '800' },
  weeklyBarSelected: { borderWidth: 2, borderColor: theme.text },
  weeklyDayLabelSelected: { color: theme.accent, fontWeight: '800' },
  // Tapped-day detail card, shown below the Week/Month chart
  selectedDaySection: { marginTop: 4, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.border },
  // Day / Week / Month segmented control
  periodTabsRow: { flexDirection: 'row', backgroundColor: theme.surfaceAlt, borderRadius: 12, padding: 3, marginBottom: 16 },
  periodTab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9 },
  periodTabActive: {
    backgroundColor: theme.card,
    shadowColor: '#0F1720', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  periodTabText: { fontSize: 12.5, fontWeight: '700', color: theme.faint },
  periodTabTextActive: { color: theme.accent },
  // Day tab — hero Steps card + a detail list (deliberately not another
  // icon-grid, so it doesn't read as a duplicate of TODAY'S VITALS above).
  dayHero: {
    borderRadius: 18, padding: 16, marginBottom: 4,
    backgroundColor: theme.isDark ? 'rgba(52,199,123,0.12)' : '#EFFDF6',
  },
  dayHeroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  dayHeroLabel: { fontSize: 10, fontWeight: '800', color: theme.faint, letterSpacing: 0.5, marginBottom: 4 },
  dayHeroValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  dayHeroValue: { fontSize: 28, fontWeight: '800', color: theme.text },
  dayHeroGoal: { fontSize: 13, fontWeight: '600', color: theme.faint },
  dayHeroBadge: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.isDark ? 'rgba(52,199,123,0.2)' : '#FFFFFF',
  },
  dayHeroBarTrack: {
    height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6,
    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
  },
  dayHeroBarFill: { height: '100%', borderRadius: 4 },
  dayHeroPct: { fontSize: 11, fontWeight: '700', color: '#1F9A5A' },
  dayDetailList: { marginTop: 8 },
  dayDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  dayDetailRowLast: { borderBottomWidth: 0 },
  dayDetailIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayDetailTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  dayDetailLabel: { fontSize: 12.5, fontWeight: '700', color: theme.text },
  dayDetailValue: { fontSize: 13, fontWeight: '800', color: theme.text },
  dayDetailBarTrack: { height: 5, borderRadius: 3, backgroundColor: theme.soft, overflow: 'hidden' },
  dayDetailBarFill: { height: '100%', borderRadius: 3 },
  // Week/Month totals row, shown below each chart
  periodSummaryRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: theme.border, marginBottom: 10 },
  periodSummaryStat: { alignItems: 'center' },
  periodSummaryValue: { fontSize: 15, fontWeight: '800', color: theme.text },
  periodSummaryLabel: { fontSize: 10, color: theme.faint, fontWeight: '600', marginTop: 2 },
  monthTargetText: { fontSize: 11, color: theme.faint, fontWeight: '600', textAlign: 'center', marginBottom: 10 },
  emptyStateText: { fontSize: 12, color: theme.faint, fontWeight: '600', textAlign: 'center', paddingVertical: 20 },
  // Month tab — navigable calendar grid
  monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthNavBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceAlt },
  calendarWeekdayRow: { flexDirection: 'row', marginBottom: 4 },
  calendarWeekdayLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: theme.faint },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calendarDot: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.surfaceAlt, borderWidth: 2, borderColor: 'transparent',
  },
  calendarDotSome: {
    backgroundColor: theme.isDark ? 'rgba(52,199,123,0.18)' : '#EFFDF6',
    borderColor: theme.isDark ? 'rgba(52,199,123,0.4)' : '#8FDCB6',
  },
  calendarDotGoal: { backgroundColor: '#1F9A5A', borderColor: '#1F9A5A' },
  calendarDotToday: { borderColor: theme.accent },
  // A lift, not a color change — color already carries goal-status and
  // "today", so the tapped day is distinguished by depth instead.
  calendarDotSelected: {
    transform: [{ scale: 1.08 }],
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  calendarDayNum: { fontSize: 11, fontWeight: '700', color: theme.text },
  calendarDayNumGoal: { color: '#FFFFFF' },
  weekCard: {
    backgroundColor: theme.card, borderRadius: 20, padding: 16, marginBottom: 12,
    shadowColor: '#0F1720', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  weekCardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  weekCardRange: { fontSize: 14, fontWeight: '700', color: theme.text },
  weekCardBadge: { backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  weekCardBadgeText: { fontSize: 10, fontWeight: '800', color: theme.danger },
  weekCategoryBlock: { marginBottom: 12 },
  weekCategoryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  weekCategoryLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  weekStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  weekStat: { minWidth: '28%' },
  weekStatLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, letterSpacing: 0.3, marginBottom: 3 },
  weekStatValue: { fontSize: 14, fontWeight: '800', color: theme.text },
  weekDaysLogged: { fontSize: 11, color: theme.faint, fontWeight: '600' },
  listSkeleton: { height: 52, backgroundColor: theme.border, borderRadius: 12, marginBottom: 10 },
  emptyWrap: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, color: theme.faint, fontWeight: '600' },
  tabBar: { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
  // FAB
  fab: {
    position: 'absolute',
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: theme.danger,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  // Sync sheet
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.overlay },
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheetContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  sheetSubtitle: { fontSize: 12, color: theme.faint, marginTop: 3 },
  historyLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginBottom: 4 },
  historyLinkText: { fontSize: 13, fontWeight: '700', color: theme.info },
  historySheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, top: '15%' },
  historySheetContent: {
    flex: 1,
    backgroundColor: theme.bg,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12,
  },
  syncGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  syncField: { width: '47%', backgroundColor: theme.surfaceAlt, borderRadius: 14, padding: 12 },
  syncFieldLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  syncFieldLabelText: { fontSize: 11, fontWeight: '700' },
  syncInputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  syncInput: {
    flex: 1, fontSize: 22, fontWeight: '800', color: theme.text,
    padding: 0,
  },
  syncUnit: { fontSize: 11, color: theme.faint, fontWeight: '600' },
  syncError: { fontSize: 12, color: theme.danger, marginBottom: 10 },
  syncBtn: {
    backgroundColor: theme.danger,
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
    borderRadius: 20, borderWidth: 1.5, borderColor: theme.borderStrong,
    backgroundColor: theme.surfaceAlt,
  },
  catTabText: { fontSize: 12, fontWeight: '700', color: theme.faint },
});
