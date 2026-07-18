import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, RefreshControl, useWindowDimensions,
  ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../api/client';

const TAB_BAR_CONTENT_HEIGHT = 50;

// ── Section definitions ──────────────────────────────────────────────────────
const SECTIONS = [
  {
    key: 'about', icon: 'user', title: 'About You', color: '#615FF8', bg: '#EEEDFE',
    fields: [
      { name: 'nickname',    label: 'What should Mneva call you?',     type: 'text',   placeholder: 'e.g. Nivi' },
      { name: 'dateOfBirth', label: 'Date of birth',                   type: 'text',   placeholder: 'YYYY-MM-DD' },
      { name: 'city',        label: 'City',                            type: 'text',   placeholder: 'Bengaluru' },
      { name: 'country',     label: 'Country',                         type: 'text',   placeholder: 'India' },
      { name: 'language',    label: 'Preferred language',              type: 'text',   placeholder: 'English' },
      { name: 'gender',      label: 'Gender',                          type: 'chips',  single: true, options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'] },
    ],
  },
  {
    key: 'work', icon: 'briefcase', title: 'Work & Career', color: '#4FA6E8', bg: '#EAF3FD',
    fields: [
      { name: 'occupation',        label: 'Profession',              type: 'text',     placeholder: 'Product Manager' },
      { name: 'company',           label: 'Company',                 type: 'text',     placeholder: 'Acme Labs' },
      { name: 'industry',          label: 'Industry',                type: 'text',     placeholder: 'Fintech' },
      { name: 'professionalLevel', label: 'I am a…',                 type: 'chips',    single: true, options: ['Student', 'Professional', 'Business Owner', 'Freelancer'] },
      { name: 'skills',            label: 'Primary skills',          type: 'textarea', placeholder: 'Product strategy, AI, operations' },
      { name: 'careerGoals',       label: 'Career goals',            type: 'textarea', placeholder: 'Grow into a strategy role' },
    ],
  },
  {
    key: 'interests', icon: 'heart', title: 'Interests', color: '#E0546E', bg: '#FCEAED',
    fields: [
      { name: 'interests',    label: 'Select all that apply', type: 'chips', options: ['AI', 'Technology', 'Finance', 'Investing', 'Fitness', 'Health', 'Reading', 'Music', 'Movies', 'Sports', 'Travel', 'Photography', 'Cooking', 'Gaming', 'Business'] },
      { name: 'followTopics', label: 'Topics to follow',     type: 'chips', options: ['AI', 'Technology', 'Finance', 'Investing', 'Fitness', 'Health', 'Sports', 'Travel', 'Business', 'Entrepreneurship'] },
    ],
  },
  {
    key: 'goals', icon: 'target', title: 'Goals', color: '#1F9A5A', bg: '#EFFDF6',
    fields: [
      { name: 'goals',   label: 'Current goals',       type: 'chips', options: ['Lose Weight', 'Gain Muscle', 'Improve Sleep', 'Save Money', 'Build Wealth', 'Learn AI', 'Get a Promotion', 'Improve Productivity', 'Reduce Stress', 'Read More', 'Travel More'] },
      { name: 'topGoal', label: 'Highest priority goal', type: 'chips', single: true, options: ['Lose Weight', 'Gain Muscle', 'Improve Sleep', 'Save Money', 'Build Wealth', 'Learn AI', 'Get a Promotion', 'Improve Productivity', 'Reduce Stress', 'Read More', 'Travel More'] },
    ],
  },
  {
    key: 'lifestyle', icon: 'calendar', title: 'Daily Routine', color: '#F5A623', bg: '#FEF3C7',
    fields: [
      { name: 'wakeTime',          label: 'Wake up time',          type: 'text',  placeholder: '06:30' },
      { name: 'sleepTime',         label: 'Sleep time',            type: 'text',  placeholder: '23:00' },
      { name: 'workingHours',      label: 'Working hours',         type: 'text',  placeholder: '09:00 - 18:00' },
      { name: 'workMode',          label: 'Work mode',             type: 'chips', single: true, options: ['Remote', 'In-Office', 'Hybrid'] },
      { name: 'productiveTime',    label: 'Most productive time',  type: 'chips', single: true, options: ['Morning', 'Afternoon', 'Evening', 'Night'] },
      { name: 'exerciseFrequency', label: 'Exercise days/week',    type: 'chips', single: true, options: ['0', '1-2', '3-4', '5+'] },
    ],
  },
  {
    key: 'health', icon: 'activity', title: 'Health Profile', color: '#E0546E', bg: '#FCEAED',
    fields: [
      { name: 'height',            label: 'Height',            type: 'text',  placeholder: '172 cm' },
      { name: 'weight',            label: 'Weight',            type: 'text',  placeholder: '68 kg' },
      { name: 'bloodGroup',        label: 'Blood group',       type: 'chips', single: true, options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] },
      { name: 'diet',              label: 'Dietary preference', type: 'chips', single: true, options: ['Vegetarian', 'Vegan', 'Non-Vegetarian', 'Eggetarian'] },
      { name: 'exerciseLevel',     label: 'Exercise level',    type: 'chips', single: true, options: ['Beginner', 'Intermediate', 'Advanced'] },
      { name: 'allergies',         label: 'Allergies',         type: 'text',  placeholder: 'e.g. Peanuts (or None)' },
      { name: 'medicalConditions', label: 'Medical conditions', type: 'text', placeholder: 'e.g. Diabetes (or None)' },
    ],
  },
  {
    key: 'finance', icon: 'credit-card', title: 'Finance Profile', color: '#1F9A5A', bg: '#EFFDF6',
    fields: [
      { name: 'monthlyBudget',       label: 'Monthly budget goal',       type: 'text',  placeholder: '₹50,000' },
      { name: 'upiApps',             label: 'UPI apps you use',          type: 'chips', options: ['GPay', 'PhonePe', 'Paytm', 'BHIM', 'Amazon Pay', 'WhatsApp Pay'] },
      { name: 'investmentTypes',     label: 'Investment types',          type: 'chips', options: ['Stocks', 'Mutual Funds', 'SIP', 'Crypto', 'None'] },
      { name: 'investmentPlatforms', label: 'Investment platforms',      type: 'chips', options: ['Groww', 'Zerodha', 'Angel One', 'Upstox', 'Kite', 'Other'] },
      { name: 'financeCountry',      label: 'Primary banking country',   type: 'chips', single: true, options: ['India', 'United States', 'United Kingdom', 'UAE', 'Singapore', 'Other'] },
    ],
  },
  {
    key: 'family', icon: 'users', title: 'Family', color: '#9B72FF', bg: '#F3EFFE',
    fields: [
      { name: 'familyReminders',      label: 'Help manage family tasks?',  type: 'toggle' },
      { name: 'familyMembers',        label: 'Family members',             type: 'chips',  options: ['Parents', 'Spouse / Partner', 'Children', 'Siblings', 'Pets'] },
      { name: 'schoolReminders',      label: 'School reminders?',          type: 'toggle' },
      { name: 'medicineReminders',    label: 'Medicine reminders?',        type: 'toggle' },
      { name: 'vaccinationReminders', label: 'Vaccination reminders?',     type: 'toggle' },
    ],
  },
  {
    key: 'aiprefs', icon: 'cpu', title: 'AI Preferences', color: '#615FF8', bg: '#EEEDFE',
    fields: [
      { name: 'aiPersonality',        label: 'How should Mneva respond?',          type: 'chips', single: true, options: ['Professional', 'Friendly', 'Coach', 'Mentor', 'Casual'] },
      { name: 'responseLength',       label: 'Answer style',                       type: 'chips', single: true, options: ['Short', 'Medium', 'Detailed'] },
      { name: 'enableMemory',         label: 'Remember conversations?',            type: 'toggle' },
      { name: 'proactiveSuggestions', label: 'Allow proactive suggestions?',       type: 'toggle' },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildDefaults(profile = {}) {
  const out = {};
  SECTIONS.forEach(sec =>
    sec.fields.forEach(f => {
      const v = profile[f.name];
      if (f.type === 'toggle') out[f.name] = v ?? false;
      else if (f.type === 'chips' && f.single) out[f.name] = (v && !Array.isArray(v)) ? v : (Array.isArray(v) ? (v[0] ?? '') : '');
      else if (f.type === 'chips') out[f.name] = Array.isArray(v) ? v : (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);
      else if (f.name === 'skills') out[f.name] = Array.isArray(v) ? v.join(', ') : (v ?? '');
      else out[f.name] = v ?? '';
    })
  );
  return out;
}

function buildPayload(sec, formData) {
  const out = {};
  sec.fields.forEach(f => {
    const v = formData[f.name];
    if (f.type === 'toggle') out[f.name] = Boolean(v);
    else if (f.type === 'chips' && f.single) out[f.name] = v ?? '';
    else if (f.type === 'chips') out[f.name] = Array.isArray(v) ? v : [];
    else if (f.name === 'skills') {
      // skills textarea → backend expects array
      out[f.name] = typeof v === 'string'
        ? v.split(',').map(s => s.trim()).filter(Boolean)
        : Array.isArray(v) ? v : [];
    }
    else if (f.type === 'textarea') out[f.name] = v ?? '';
    else out[f.name] = v ?? '';
  });
  return out;
}

function getSectionFill(sec, formData) {
  const fields = sec.fields.filter(f => f.type !== 'toggle');
  if (!fields.length) return 0;
  let filled = 0;
  fields.forEach(f => {
    const v = formData[f.name];
    if (f.type === 'chips') { if (Array.isArray(v) ? v.length > 0 : !!v) filled++; }
    else if (typeof v === 'string' && v.trim()) filled++;
  });
  return Math.round((filled / fields.length) * 100);
}

// ── Field components ─────────────────────────────────────────────────────────
function ChipsField({ options, value, single, onChange }) {
  const selected = single ? value : (Array.isArray(value) ? value : []);
  return (
    <View style={styles.chipsWrap}>
      {options.map(opt => {
        const active = single ? selected === opt : selected.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => {
              if (single) onChange(opt);
              else onChange(active ? selected.filter(x => x !== opt) : [...selected, opt]);
            }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SectionCard({ sec, formData, onChange, onSave, saving, saved }) {
  const [open, setOpen] = useState(false);
  const fillPct = getSectionFill(sec, formData);

  return (
    <View style={styles.sectionCard}>
      {/* Header — tap to expand */}
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setOpen(o => !o)} activeOpacity={0.8}>
        <View style={[styles.sectionIconWrap, { backgroundColor: sec.bg }]}>
          <Feather name={sec.icon} size={18} color={sec.color} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{sec.title}</Text>
          <Text style={styles.sectionSubtitle}>
            {saved ? '✓ Saved' : fillPct > 0 ? `${fillPct}% filled` : 'Tap to fill'}
          </Text>
        </View>
        <View style={[styles.sectionPctBadge, { backgroundColor: saved ? '#EFFDF6' : fillPct > 0 ? sec.bg : '#F3F4F6' }]}>
          <Text style={[styles.sectionPctText, { color: saved ? '#1F9A5A' : fillPct > 0 ? sec.color : '#9AA1AE' }]}>
            {saved ? '✓' : `${Math.round((fillPct / 100) * 10)}%`}
          </Text>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#C7CBD3" style={{ marginLeft: 8 }} />
      </TouchableOpacity>

      {/* Expanded fields */}
      {open && (
        <View style={styles.sectionBody}>
          {sec.fields.map(f => (
            <View key={f.name} style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{f.label}</Text>

              {f.type === 'text' && (
                <TextInput
                  style={styles.textInput}
                  value={formData[f.name] || ''}
                  onChangeText={v => onChange(f.name, v)}
                  placeholder={f.placeholder}
                  placeholderTextColor="#9AA1AE"
                />
              )}

              {f.type === 'textarea' && (
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={formData[f.name] || ''}
                  onChangeText={v => onChange(f.name, v)}
                  placeholder={f.placeholder}
                  placeholderTextColor="#9AA1AE"
                  multiline
                  numberOfLines={3}
                />
              )}

              {f.type === 'chips' && (
                <ChipsField
                  options={f.options}
                  value={formData[f.name]}
                  single={f.single}
                  onChange={v => onChange(f.name, v)}
                />
              )}

              {f.type === 'toggle' && (
                <View style={styles.toggleRow}>
                  <Switch
                    value={!!formData[f.name]}
                    onValueChange={v => onChange(f.name, v)}
                    trackColor={{ false: '#E3E5EA', true: sec.color }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              )}
            </View>
          ))}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={() => onSave(sec)}
            disabled={saving}
          >
            <LinearGradient
              colors={[sec.color, sec.color + 'CC']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.saveBtnGrad}
            >
              {saving
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.saveBtnText}>Save {sec.title}</Text>
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function AIProfile({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState({});
  const [completionPct, setCompletionPct] = useState(0);
  const [completedSections, setCompletedSections] = useState([]);
  const [toast, setToast] = useState(null); // { title, subtitle }
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef(null);

  const loadProfile = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await apiFetch('/api/onboarding/profile');
      const profile = res?.profile || {};
      setFormData(buildDefaults(profile));
      setCompletionPct(profile.completionPct || 0);
      const sections = Array.isArray(profile.completedSections) ? profile.completedSections : [];
      setCompletedSections(sections);
      const done = {};
      sections.forEach(k => { done[k] = true; });
      setSaved(done);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadProfile(); }, []);

  const showToast = (title, subtitle) => {
    clearTimeout(toastTimer.current);
    setToast({ title, subtitle });
    toastAnim.setValue(0);
    Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true, tension: 180, friction: 12 }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setToast(null));
    }, 3000);
  };

  const onChange = (name, value) => setFormData(prev => ({ ...prev, [name]: value }));

  const onSave = async (sec) => {
    setSaving(sec.key);
    try {
      const res = await apiFetch('/api/onboarding/section', {
        method: 'POST',
        body: { section: sec.key, data: buildPayload(sec, formData) },
      });
      setCompletionPct(res.completionPct || 0);
      const newSections = Array.isArray(res.completedSections) ? res.completedSections : completedSections;
      setCompletedSections(newSections);
      setSaved(prev => ({ ...prev, [sec.key]: true }));
      showToast(`${sec.title} saved ✓`, 'Your profile has been updated successfully');
    } catch (err) {
      showToast('Save failed', err?.message || 'Please try again');
    } finally {
      setSaving(null);
    }
  };

  const savedCount = Object.keys(saved).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProfile(true); }} tintColor="#1F9A5A" colors={['#1F9A5A']} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color="#14171F" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>AI Profile</Text>
            <Text style={styles.headerSubtitle}>Personalize your AI Chief of Staff</Text>
          </View>
        </View>

        {/* Progress card */}
        <LinearGradient colors={['#27AE6A', '#1F9A5A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.progressCard}>
          <View style={styles.progressTop}>
            <View>
              <Text style={styles.progressPct}>{loading ? '—' : `${completionPct}%`}</Text>
              <Text style={styles.progressLabel}>Complete</Text>
            </View>
            <View style={styles.progressDivider} />
            <View>
              <Text style={styles.progressPct}>{loading ? '—' : `${savedCount}/${SECTIONS.length}`}</Text>
              <Text style={styles.progressLabel}>Sections</Text>
            </View>
            <View style={styles.progressDivider} />
            <View>
              <Text style={styles.progressPct}>{loading ? '—' : SECTIONS.length - savedCount}</Text>
              <Text style={styles.progressLabel}>Remaining</Text>
            </View>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${completionPct}%` }]} />
          </View>
          <Text style={styles.progressHint}>The more you share, the smarter Mneva becomes</Text>
        </LinearGradient>

        {/* Section cards */}
        {loading ? (
          [1, 2, 3].map(i => <View key={i} style={styles.sectionSkeleton} />)
        ) : (
          SECTIONS.map(sec => (
            <SectionCard
              key={sec.key}
              sec={sec}
              formData={formData}
              onChange={onChange}
              onSave={onSave}
              saving={saving === sec.key}
              saved={!!saved[sec.key]}
            />
          ))
        )}
      </ScrollView>

      {/* Toast */}
      {toast && (
        <Animated.View style={[
          styles.toast,
          { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] },
        ]}>
          <LinearGradient colors={['#1F9A5A', '#27AE6A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.toastGrad}>
            <View style={styles.toastIconWrap}>
              <Feather name="check-circle" size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toastTitle}>{toast.title}</Text>
              <Text style={styles.toastSubtitle}>{toast.subtitle}</Text>
            </View>
          </LinearGradient>
        </Animated.View>
      )}

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

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#14171F' },
  headerSubtitle: { fontSize: 13, color: '#9AA1AE', marginTop: 2 },

  progressCard: { borderRadius: 22, padding: 20, marginBottom: 20 },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 16 },
  progressPct: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  progressLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 2 },
  progressDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  progressBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  progressBarFill: { height: 6, backgroundColor: '#FFFFFF', borderRadius: 3 },
  progressHint: { fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },

  sectionSkeleton: { height: 68, backgroundColor: '#FFFFFF', borderRadius: 18, marginBottom: 10 },

  sectionCard: { backgroundColor: '#FFFFFF', borderRadius: 18, marginBottom: 10, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  sectionIconWrap: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#14171F' },
  sectionSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 2 },
  sectionPctBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  sectionPctText: { fontSize: 11, fontWeight: '800' },

  sectionBody: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: '#F0F1F4' },

  fieldWrap: { marginTop: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 8 },

  textInput: { backgroundColor: '#F5F6F8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#14171F', borderWidth: 1, borderColor: '#E4E7EF' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E7EF' },
  chipActive: { backgroundColor: '#615FF8', borderColor: '#615FF8' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#FFFFFF' },

  toggleRow: { alignItems: 'flex-start' },

  saveBtn: { marginTop: 20, borderRadius: 14, overflow: 'hidden' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnGrad: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },

  toast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#1F9A5A',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 16,
  },
  toastGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  toastIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  toastTitle: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', marginBottom: 2 },
  toastSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
});
