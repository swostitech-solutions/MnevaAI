import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, RefreshControl, useWindowDimensions,
  ActivityIndicator, Animated, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { apiFetch, peekCachedResponse } from '../api/client';
import { onAppDataRefresh } from '../services/dataRefresh';
import { useTheme } from '../context/ThemeContext';

const TAB_BAR_CONTENT_HEIGHT = 50;

// Converts a "#RRGGBB" brand color into a translucent rgba() for use as a
// dark-mode icon-wrap tint — the flat pastel hexes below (sec.bg) were tuned
// for a white background only and look like a solid, wrong-toned block once
// the surface behind them goes dark.
function hexToRgba(hex, alpha) {
  const clean = (hex || '').replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Used to autosuggest a correctly-spelled country as the user types in the
// Country field — checked locally (no network call needed, unlike City
// below) since this is a short, fixed, offline-friendly list.
const COUNTRY_LIST = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia',
  'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium',
  'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei',
  'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Chad', 'Chile', 'China',
  'Colombia', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti',
  'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Estonia', 'Ethiopia', 'Fiji', 'Finland',
  'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea',
  'Guyana', 'Haiti', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran',
  'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan',
  'Kenya', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya',
  'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali',
  'Malta', 'Mauritius', 'Mexico', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco',
  'Mozambique', 'Myanmar', 'Namibia', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger',
  'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania',
  'Russia', 'Rwanda', 'Saudi Arabia', 'Senegal', 'Serbia', 'Singapore', 'Slovakia', 'Slovenia',
  'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Sweden',
  'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo',
  'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine',
  'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Venezuela',
  'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];

// ── Section definitions ──────────────────────────────────────────────────────
const SECTIONS = [
  {
    key: 'about', icon: 'user', title: 'About You', color: '#615FF8', bg: '#EEEDFE',
    fields: [
      { name: 'nickname',    label: 'What should Mneva call you?',     type: 'text',   validate: 'alpha', placeholder: 'e.g. Nivi' },
      { name: 'dateOfBirth', label: 'Date of birth',                   type: 'date',   placeholder: 'YYYY-MM-DD' },
      { name: 'city',        label: 'City',                            type: 'text',   validate: 'alpha', placeholder: 'Bengaluru', required: true },
      { name: 'country',     label: 'Country',                         type: 'text',   validate: 'alpha', placeholder: 'India', required: true },
      { name: 'language',    label: 'Preferred language',              type: 'text',   validate: 'alpha', allow: ',', placeholder: 'English' },
      { name: 'gender',      label: 'Gender',                          type: 'chips',  single: true, options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'] },
    ],
  },
  {
    key: 'work', icon: 'briefcase', title: 'Work & Career', color: '#4FA6E8', bg: '#EAF3FD',
    fields: [
      { name: 'occupation',        label: 'Profession',              type: 'text',     validate: 'alpha', allow: '&/,', placeholder: 'Product Manager' },
      { name: 'company',           label: 'Company',                 type: 'text',     placeholder: 'Acme Labs' },
      { name: 'industry',          label: 'Industry',                type: 'text',     validate: 'alpha', allow: '&/,', placeholder: 'Fintech' },
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
      { name: 'wakeTime',          label: 'Wake up time',          type: 'time',  placeholder: '06:30 AM' },
      { name: 'sleepTime',         label: 'Sleep time',            type: 'time',  placeholder: '11:00 PM' },
      { name: 'workingHours',      label: 'Working hours',         type: 'timerange' },
      { name: 'workMode',          label: 'Work mode',             type: 'chips', single: true, options: ['Remote', 'In-Office', 'Hybrid'] },
      { name: 'productiveTime',    label: 'Most productive time',  type: 'chips', single: true, options: ['Morning', 'Afternoon', 'Evening', 'Night'] },
      { name: 'exerciseFrequency', label: 'Exercise days/week',    type: 'chips', single: true, options: ['0', '1-2', '3-4', '5+'] },
    ],
  },
  {
    key: 'health', icon: 'activity', title: 'Health Profile', color: '#E0546E', bg: '#FCEAED',
    fields: [
      { name: 'height',            label: 'Height',            type: 'measure', unit: 'cm', min: 50, max: 275, placeholder: '172' },
      { name: 'weight',            label: 'Weight',            type: 'measure', unit: 'kg', min: 10, max: 500, placeholder: '68' },
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
    key: 'aiprefs', icon: 'cpu', title: 'AI Preferences', color: '#615FF8', bg: '#EEEDFE',
    fields: [
      { name: 'aiPersonality',        label: 'How should Mneva respond?',          type: 'chips', single: true, options: ['Professional', 'Friendly', 'Coach', 'Mentor', 'Casual'] },
      { name: 'responseLength',       label: 'Answer style',                       type: 'chips', single: true, options: ['Short', 'Medium', 'Detailed'] },
      { name: 'enableMemory',         label: 'Remember conversations?',            type: 'toggle' },
      { name: 'proactiveSuggestions', label: 'Allow proactive suggestions?',       type: 'toggle' },
    ],
  },
];

// Family's four reminder switches now live inside the Space screens they
// control (Family Tasks, Children & Activity, Medication, Pet Care), so the
// profile has one section fewer. A 'family' entry saved earlier is ignored.
const SECTION_KEYS = SECTIONS.map(sec => sec.key);

// ── Validation helpers ───────────────────────────────────────────────────────
const ALPHA_STRIP_CHARS = '0123456789!@#$%^&*()_+=[]{}<>?/\\|~`":;,';
const HAS_LETTER = /[A-Za-zÀ-￿]/;

// Removes digits and symbols as the user types, so a name/language/profession
// field can only ever hold letters, spaces and . ' - (plus per-field extras).
function sanitizeAlpha(text, allow = '') {
  let out = '';
  for (const ch of String(text || '')) {
    if (ALPHA_STRIP_CHARS.includes(ch) && !allow.includes(ch)) continue;
    out += ch;
  }
  return out.replace(/\s{2,}/g, ' ');
}

const pad2 = (n) => String(n).padStart(2, '0');
const toIsoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Typing "19950827" becomes "1995-08-27" as they go.
function formatDobInput(text) {
  const digits = String(text || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function parseIsoDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

// Reads whatever date format an older save may hold (ISO timestamp,
// DD/MM/YYYY, "27 Aug 1995") so the calendar opens on the date already in
// the field instead of a default one.
function parseFlexibleDate(str) {
  const v = String(str || '').trim();
  if (!v) return null;
  const strict = parseIsoDate(v.slice(0, 10));
  if (strict && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(v)) return strict;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (dmy) return parseIsoDate(`${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`);
  const t = Date.parse(v);
  if (!Number.isNaN(t)) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  return null;
}

function validateDob(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const date = parseIsoDate(v);
  if (!date) return 'Enter a valid date as YYYY-MM-DD, or pick it from the calendar';
  const now = new Date();
  if (date > now) return 'Date of birth cannot be in the future';
  if (date.getFullYear() < 1900 || now.getFullYear() - date.getFullYear() > 120) return 'Enter a realistic date of birth';
  return null;
}

// Accepts "6:30 AM", "06:30pm", or a legacy 24h "18:00"; returns "06:30 PM".
function normalizeTime12(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  let m = /^(\d{1,2})(?::?(\d{2}))?\s*([AaPp])\.?[Mm]?\.?$/.exec(t);
  if (m) {
    const h = Number(m[1]); const min = Number(m[2] || 0);
    if (h < 1 || h > 12 || min > 59) return null;
    return `${pad2(h)}:${pad2(min)} ${m[3].toUpperCase()}M`;
  }
  m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) {
    const h = Number(m[1]); const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return `${pad2(h % 12 === 0 ? 12 : h % 12)}:${pad2(min)} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  return null;
}

const time12ToMinutes = (t) => {
  const m = /^(\d{2}):(\d{2}) (AM|PM)$/.exec(t || '');
  if (!m) return null;
  return (Number(m[1]) % 12) * 60 + Number(m[2]) + (m[3] === 'PM' ? 720 : 0);
};

const dateToTime12 = (d) => normalizeTime12(`${d.getHours()}:${pad2(d.getMinutes())}`);

function time12ToDate(t) {
  const mins = time12ToMinutes(normalizeTime12(t) || '');
  const d = new Date();
  d.setHours(mins == null ? 9 : Math.floor(mins / 60), mins == null ? 0 : mins % 60, 0, 0);
  return d;
}

const splitRange = (v) => String(v || '').split(/\s*(?:-|–|—|\bto\b)\s*/i).map((x) => x.trim());

function parseRange(v) {
  const parts = splitRange(v);
  return { from: parts[0] ? (normalizeTime12(parts[0]) ?? parts[0]) : '', to: parts[1] ? (normalizeTime12(parts[1]) ?? parts[1]) : '' };
}

const formatRange = (from, to) => (from || to ? `${from || ''} - ${to || ''}` : '');

function sanitizeMeasure(text) {
  const cleaned = String(text || '').replace(/[^0-9.]/g, '');
  const [intPart, ...rest] = cleaned.split('.');
  const dec = rest.join('').slice(0, 1);
  const whole = intPart.slice(0, 3);
  return rest.length ? `${whole}.${dec}` : whole;
}

const COUNTRY_ALIASES = {
  usa: 'United States', us: 'United States', america: 'United States', 'united states of america': 'United States',
  uk: 'United Kingdom', britain: 'United Kingdom', 'great britain': 'United Kingdom', england: 'United Kingdom',
  uae: 'United Arab Emirates', holland: 'Netherlands',
};
const COUNTRY_ISO = { 'United States': 'us', 'United Kingdom': 'gb', 'United Arab Emirates': 'ae', Netherlands: 'nl' };

function canonicalCountry(text) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return '';
  if (COUNTRY_ALIASES[q]) return COUNTRY_ALIASES[q];
  return COUNTRY_LIST.find((c) => c.toLowerCase() === q) || null;
}

function placeInCountry(place, canonical) {
  const name = String(place?.country || '').toLowerCase();
  const code = String(place?.country_code || '').toLowerCase();
  const target = canonical.toLowerCase();
  return name === target || (COUNTRY_ISO[canonical] && COUNTRY_ISO[canonical] === code) || name.includes(target) || target.includes(name);
}

async function searchCities(name, count = 10) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=${count}&language=en&format=json`);
  const data = await res.json();
  return data?.results || [];
}

// City + Country are checked against each other on save. Returns
// { errors, country } — country is filled in from the city when left blank.
// A network failure never blocks saving; only a definite mismatch does.
async function verifyLocation(city, countryText) {
  const errors = {};
  let country = String(countryText || '').trim();
  let canonical = '';
  if (country) {
    canonical = canonicalCountry(country);
    if (!canonical) errors.country = 'Pick a valid country from the suggestions';
    else country = canonical;
  }
  const cityName = String(city || '').trim();
  if (cityName && !errors.country) {
    try {
      const results = await searchCities(cityName);
      if (!results.length) {
        errors.city = `We couldn't find a city called "${cityName}"`;
      } else if (canonical) {
        if (!results.some((r) => placeInCountry(r, canonical))) errors.city = `"${cityName}" isn't a city in ${canonical}`;
      } else {
        country = results[0].country || '';
      }
    } catch {}
  }
  return { errors, country };
}

function validateFieldValue(f, value) {
  const v = typeof value === 'string' ? value.trim() : value;
  if (f.required && !v) return `${f.label.replace(/\?$/, '')} is required`;
  if (f.validate === 'alpha') {
    if (!v) return null;
    if (!HAS_LETTER.test(v)) return `${f.label.replace(/\?$/, '')}: use letters only`;
    if (v.length > 60) return 'Too long — keep it under 60 characters';
    return null;
  }
  if (f.type === 'date') return validateDob(v);
  if (f.type === 'time') {
    if (!v) return null;
    return normalizeTime12(v) ? null : 'Use a time like 06:30 AM';
  }
  if (f.type === 'timerange') {
    if (!v) return null;
    const { from, to } = parseRange(v);
    const a = normalizeTime12(from); const b = normalizeTime12(to);
    if (!a || !b) return 'Set both a start and an end time (e.g. 09:00 AM - 06:00 PM)';
    if (a === b) return 'Start and end time cannot be the same';
    return null;
  }
  if (f.type === 'measure') {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < f.min || n > f.max) return `Enter a ${f.label.toLowerCase()} between ${f.min} and ${f.max} ${f.unit}`;
    return null;
  }
  return null;
}

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
      else if (f.type === 'measure') { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); out[f.name] = Number.isFinite(n) ? String(n) : ''; }
      else if (f.type === 'date') { const d = parseFlexibleDate(v); out[f.name] = d ? toIsoDate(d) : String(v ?? ''); }
      else if (f.type === 'time') out[f.name] = v ? (normalizeTime12(v) ?? String(v)) : '';
      else if (f.type === 'timerange') { const r = parseRange(v); out[f.name] = formatRange(r.from, r.to); }
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
    else if (f.type === 'measure') out[f.name] = v ? `${v} ${f.unit}` : '';
    else if (f.type === 'time') out[f.name] = v ? (normalizeTime12(v) ?? v) : '';
    else if (f.type === 'timerange') { const r = parseRange(v); out[f.name] = v ? formatRange(normalizeTime12(r.from) ?? r.from, normalizeTime12(r.to) ?? r.to) : ''; }
    else if (f.validate === 'alpha' || f.type === 'date') out[f.name] = typeof v === 'string' ? v.trim() : (v ?? '');
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
// These are module-level helper components repeated once per section/option,
// so they take `styles`/`theme` as props instead of calling useTheme()
// themselves — that would recreate the whole stylesheet on every row render.
function ChipsField({ options, value, single, onChange, styles, theme }) {
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

// Autosuggests correct spellings for City/Country as the user types, so a
// typo (or an abbreviation like "USA" that Home.js's weather lookup can't
// use directly — see the "N degree, USA doesn't show weather" fix) gets
// caught and corrected right at entry instead of silently breaking whatever
// reads these fields later. Country is matched against a fixed offline list;
// City calls the same Open-Meteo geocoding search the weather feature uses,
// debounced so it isn't refetching on every keystroke.
const CITY_SUGGEST_DEBOUNCE_MS = 350;

function LocationSuggestField({ field, value, onChangeText, onCitySelected, error, countryValue, styles, theme }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const filterCountry = (text) => {
    const q = text.trim().toLowerCase();
    if (!q) return setSuggestions([]);
    const startsWith = COUNTRY_LIST.filter((c) => c.toLowerCase().startsWith(q));
    const includes = COUNTRY_LIST.filter((c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q));
    setSuggestions([...startsWith, ...includes].slice(0, 6).map((c) => ({ id: c, label: c, country: c })));
  };

  const fetchCity = async (text) => {
    const q = text.trim();
    if (q.length < 2) return setSuggestions([]);
    const myRequestId = ++requestIdRef.current;
    try {
      let found = await searchCities(q, 10);
      if (myRequestId !== requestIdRef.current) return; // a newer keystroke already superseded this
      // With a country already chosen, only cities of that country are offered.
      const canonical = canonicalCountry(countryValue);
      if (canonical) found = found.filter((r) => placeInCountry(r, canonical));
      const results = found.slice(0, 6).map((r) => ({
        id: String(r.id),
        label: r.admin1 && r.admin1 !== r.name ? `${r.name}, ${r.admin1}, ${r.country}` : `${r.name}, ${r.country}`,
        city: r.name,
        country: r.country,
      }));
      setSuggestions(results);
    } catch {
      if (myRequestId === requestIdRef.current) setSuggestions([]);
    }
  };

  const handleChangeText = (text) => {
    onChangeText(text);
    setShowSuggestions(true);
    if (field.name === 'country') {
      filterCountry(text);
    } else {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchCity(text), CITY_SUGGEST_DEBOUNCE_MS);
    }
  };

  const handleSelect = (item) => {
    setShowSuggestions(false);
    setSuggestions([]);
    if (field.name === 'country') {
      onChangeText(item.country);
    } else {
      onChangeText(item.city);
      // Correcting the city to its real spelling also tells us its real
      // country — filling that in too (only if Country is still blank) is
      // exactly the pairing the weather feature needs to work correctly.
      onCitySelected?.(item.country);
    }
  };

  return (
    <View>
      <TextInput
        style={[styles.textInput, error && styles.inputError]}
        value={value || ''}
        onChangeText={handleChangeText}
        onFocus={() => setShowSuggestions(true)}
        // Delay lets a suggestion's onPress register before the list
        // disappears — a plain onBlur would hide it first and swallow the tap.
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={field.placeholder}
        placeholderTextColor={theme.placeholder}
        autoCorrect={false}
        autoCapitalize="words"
      />
      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestBox}>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.suggestRow, i === suggestions.length - 1 && styles.suggestRowLast]}
              onPress={() => handleSelect(s)}
            >
              <Feather name="map-pin" size={13} color={theme.accent} />
              <Text style={styles.suggestText} numberOfLines={1}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function DateField({ value, onChange, placeholder, error, styles, theme }) {
  const [showIos, setShowIos] = useState(false);
  const current = parseFlexibleDate(value) || new Date(1995, 0, 1);
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current, mode: 'date', maximumDate: new Date(), minimumDate: new Date(1900, 0, 1),
        onChange: (e, d) => { if (e.type === 'set' && d) onChange(toIsoDate(d)); },
      });
    } else setShowIos((v) => !v);
  };
  return (
    <View>
      <View style={[styles.inputRow, error && styles.inputError]}>
        <TextInput
          style={styles.inputRowText}
          value={value || ''}
          onChangeText={(t) => onChange(formatDobInput(t))}
          placeholder={placeholder}
          placeholderTextColor={theme.placeholder}
          keyboardType="number-pad"
          maxLength={10}
        />
        <TouchableOpacity onPress={open} style={styles.inputIconBtn} hitSlop={8}>
          <Feather name="calendar" size={18} color={theme.accent} />
        </TouchableOpacity>
      </View>
      {showIos && Platform.OS === 'ios' && (
        <View>
          <DateTimePicker
            value={current} mode="date" display="spinner" maximumDate={new Date()} minimumDate={new Date(1900, 0, 1)}
            themeVariant={theme.isDark ? 'dark' : 'light'}
            onChange={(e, d) => { if (d) onChange(toIsoDate(d)); }}
          />
          <TouchableOpacity onPress={() => setShowIos(false)} style={styles.pickerDone}>
            <Text style={styles.pickerDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// 12-hour AM/PM time: pick from the clock or type it ("6:30 pm" is tidied
// to "06:30 PM" once they leave the field).
function TimeField({ value, onChange, placeholder, error, styles, theme, compact }) {
  const [showIos, setShowIos] = useState(false);
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: time12ToDate(value), mode: 'time', is24Hour: false,
        onChange: (e, d) => { if (e.type === 'set' && d) onChange(dateToTime12(d)); },
      });
    } else setShowIos((v) => !v);
  };
  const tidy = () => { const n = normalizeTime12(value); if (n && n !== value) onChange(n); };
  return (
    <View style={compact ? { flex: 1 } : undefined}>
      <View style={[styles.inputRow, error && styles.inputError]}>
        <TextInput
          style={styles.inputRowText}
          value={value || ''}
          onChangeText={(t) => onChange(t.replace(/[^0-9:AaPpMm\s.]/g, '').slice(0, 8).toUpperCase())}
          onEndEditing={tidy}
          placeholder={placeholder}
          placeholderTextColor={theme.placeholder}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TouchableOpacity onPress={open} style={styles.inputIconBtn} hitSlop={8}>
          <Feather name="clock" size={18} color={theme.accent} />
        </TouchableOpacity>
      </View>
      {showIos && Platform.OS === 'ios' && (
        <View>
          <DateTimePicker
            value={time12ToDate(value)} mode="time" display="spinner" is24Hour={false}
            themeVariant={theme.isDark ? 'dark' : 'light'}
            onChange={(e, d) => { if (d) onChange(dateToTime12(d)); }}
          />
          <TouchableOpacity onPress={() => setShowIos(false)} style={styles.pickerDone}>
            <Text style={styles.pickerDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function TimeRangeField({ value, onChange, error, styles, theme }) {
  const { from, to } = parseRange(value);
  return (
    <View style={styles.rangeRow}>
      <TimeField compact value={from} placeholder="09:00 AM" error={error} styles={styles} theme={theme}
        onChange={(v) => onChange(formatRange(v, to))} />
      <Text style={styles.rangeDash}>to</Text>
      <TimeField compact value={to} placeholder="06:00 PM" error={error} styles={styles} theme={theme}
        onChange={(v) => onChange(formatRange(from, v))} />
    </View>
  );
}

function MeasureField({ field, value, onChange, error, styles, theme }) {
  return (
    <View style={[styles.inputRow, error && styles.inputError]}>
      <TextInput
        style={styles.inputRowText}
        value={value || ''}
        onChangeText={(t) => onChange(sanitizeMeasure(t))}
        placeholder={field.placeholder}
        placeholderTextColor={theme.placeholder}
        keyboardType="decimal-pad"
        maxLength={5}
      />
      <Text style={styles.unitText}>{field.unit}</Text>
    </View>
  );
}

function SectionCard({ sec, formData, onChange, onSave, saving, saved, errors = {}, styles, theme }) {
  const [open, setOpen] = useState(false);
  const fillPct = getSectionFill(sec, formData);
  const tintBg = theme.isDark ? hexToRgba(sec.color, 0.16) : sec.bg;
  const savedBg = theme.isDark ? hexToRgba(theme.accent, 0.16) : '#EFFDF6';

  return (
    <View style={styles.sectionCard}>
      {/* Header — tap to expand */}
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setOpen(o => !o)} activeOpacity={0.8}>
        <View style={[styles.sectionIconWrap, { backgroundColor: tintBg }]}>
          <Feather name={sec.icon} size={18} color={sec.color} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{sec.title}</Text>
          <Text style={styles.sectionSubtitle}>
            {saved ? '✓ Saved' : fillPct > 0 ? `${fillPct}% filled` : 'Tap to fill'}
          </Text>
        </View>
        <View style={[styles.sectionPctBadge, { backgroundColor: saved ? savedBg : fillPct > 0 ? tintBg : theme.soft }]}>
          <Text style={[styles.sectionPctText, { color: saved ? theme.accent : fillPct > 0 ? sec.color : theme.faint }]}>
            {saved ? '✓' : `${fillPct}%`}
          </Text>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.disabled} style={{ marginLeft: 8 }} />
      </TouchableOpacity>

      {/* Expanded fields */}
      {open && (
        <View style={styles.sectionBody}>
          {sec.fields.map(f => (
            <View key={f.name} style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{f.label}{f.required ? <Text style={styles.required}> *</Text> : null}</Text>

              {f.type === 'text' && (f.name === 'city' || f.name === 'country') && (
                <LocationSuggestField
                  field={f}
                  error={errors[f.name]}
                  countryValue={formData.country}
                  value={formData[f.name]}
                  onChangeText={v => onChange(f.name, v)}
                  onCitySelected={(country) => { if (!formData.country) onChange('country', country); }}
                  styles={styles}
                  theme={theme}
                />
              )}

              {f.type === 'date' && (
                <DateField value={formData[f.name]} onChange={v => onChange(f.name, v)} placeholder={f.placeholder}
                  error={errors[f.name]} styles={styles} theme={theme} />
              )}
              {f.type === 'time' && (
                <TimeField value={formData[f.name]} onChange={v => onChange(f.name, v)} placeholder={f.placeholder}
                  error={errors[f.name]} styles={styles} theme={theme} />
              )}
              {f.type === 'timerange' && (
                <TimeRangeField value={formData[f.name]} onChange={v => onChange(f.name, v)}
                  error={errors[f.name]} styles={styles} theme={theme} />
              )}
              {f.type === 'measure' && (
                <MeasureField field={f} value={formData[f.name]} onChange={v => onChange(f.name, v)}
                  error={errors[f.name]} styles={styles} theme={theme} />
              )}

              {f.type === 'text' && f.name !== 'city' && f.name !== 'country' && (
                <TextInput
                  style={[styles.textInput, errors[f.name] && styles.inputError]}
                  value={formData[f.name] || ''}
                  onChangeText={v => onChange(f.name, v)}
                  placeholder={f.placeholder}
                  placeholderTextColor={theme.placeholder}
                />
              )}

              {f.type === 'textarea' && (
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={formData[f.name] || ''}
                  onChangeText={v => onChange(f.name, v)}
                  placeholder={f.placeholder}
                  placeholderTextColor={theme.placeholder}
                  multiline
                  numberOfLines={3}
                />
              )}

              {!!errors[f.name] && <Text style={styles.fieldError}>{errors[f.name]}</Text>}

              {f.type === 'chips' && (
                <ChipsField
                  options={f.options}
                  value={formData[f.name]}
                  single={f.single}
                  onChange={v => onChange(f.name, v)}
                  styles={styles}
                  theme={theme}
                />
              )}

              {f.type === 'toggle' && (
                <View style={styles.toggleRow}>
                  <Switch
                    value={!!formData[f.name]}
                    onValueChange={v => onChange(f.name, v)}
                    trackColor={{ false: theme.borderStrong, true: sec.color }}
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
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState({});
  const [completionPct, setCompletionPct] = useState(0);
  const [completedSections, setCompletedSections] = useState([]);
  const [toast, setToast] = useState(null); // { title, subtitle, isError }
  const [errors, setErrors] = useState({});
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef(null);
  const hasRealDataRef = useRef(false);

  // Shared by the real fetch below and by the cache-hydration pass before it,
  // so a returning user sees their last known profile immediately instead of
  // blank fields/skeletons for however long the network round-trip takes.
  const applyProfileData = (profile = {}) => {
    setFormData(buildDefaults(profile));
    setCompletionPct(profile.completionPct || 0);
    const sections = (Array.isArray(profile.completedSections) ? profile.completedSections : []).filter(k => SECTION_KEYS.includes(k));
    setCompletedSections(sections);
    const done = {};
    sections.forEach(k => { done[k] = true; });
    setSaved(done);
  };

  // Bumped on every loadProfile() call AND on every successful save (see
  // onSave) — a response only gets applied if it's still the most recent
  // thing in flight when it resolves. Without this, a slow/retried GET
  // issued before an edit (this screen stays mounted under whatever's
  // pushed on top of it, so its onAppDataRefresh listener keeps firing in
  // the background) can resolve AFTER a newer save and silently revert the
  // field the user just typed and saved back to its pre-edit value.
  const latestRequestIdRef = useRef(0);

  const loadProfile = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    const requestId = ++latestRequestIdRef.current;
    try {
      const res = await apiFetch('/api/onboarding/profile');
      if (requestId !== latestRequestIdRef.current) return; // superseded — discard
      hasRealDataRef.current = true;
      applyProfileData(res?.profile || {});
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  // Paint the last known profile immediately from cache — otherwise this
  // screen shows blank fields/skeletons on every single open even though
  // nothing has changed since last time. loadProfile() below still runs
  // right after and silently replaces this with fresh data; the ref guard
  // stops a slow cache read from ever clobbering real data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await peekCachedResponse('/api/onboarding/profile').catch(() => null);
      if (!cancelled && !hasRealDataRef.current && cached?.profile) {
        applyProfileData(cached.profile);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadProfile(); }, []);
  useEffect(() => onAppDataRefresh(() => loadProfile(true)), []);

  const showToast = (title, subtitle, isError = false) => {
    clearTimeout(toastTimer.current);
    setToast({ title, subtitle, isError });
    toastAnim.setValue(0);
    Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true, tension: 180, friction: 12 }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setToast(null));
    }, 3000);
  };

  const fieldByName = useRef({}).current;
  if (!fieldByName.__filled) { SECTIONS.forEach(sec => sec.fields.forEach(f => { fieldByName[f.name] = f; })); fieldByName.__filled = true; }

  const onChange = (name, value) => {
    const f = fieldByName[name];
    let next = value;
    let hint = null;
    if (f?.validate === 'alpha' && typeof value === 'string') {
      next = sanitizeAlpha(value, f.allow || '');
      if (next !== value.replace(/\s{2,}/g, ' ')) hint = 'Only letters are allowed here — numbers and symbols are not accepted';
    }
    setFormData(prev => ({ ...prev, [name]: next }));
    setErrors(prev => {
      if (!prev[name] && !hint) return prev;
      const copy = { ...prev };
      if (hint) copy[name] = hint; else delete copy[name];
      // Changing city/country invalidates the other one's mismatch message.
      if (name === 'city' || name === 'country') { delete copy.city; delete copy.country; if (hint) copy[name] = hint; }
      return copy;
    });
  };

  const onSave = async (sec) => {
    setSaving(sec.key);
    try {
      const found = {};
      sec.fields.forEach(f => {
        const msg = validateFieldValue(f, formData[f.name]);
        if (msg) found[f.name] = msg;
      });
      let data = formData;
      if (sec.key === 'about') {
        const loc = await verifyLocation(formData.city, formData.country);
        if (!found.city && loc.errors.city) found.city = loc.errors.city;
        if (!found.country && loc.errors.country) found.country = loc.errors.country;
        if (!found.country && !found.city && loc.country && loc.country !== formData.country) {
          data = { ...formData, country: loc.country };
          setFormData(data);
        }
      }
      setErrors(prev => {
        const copy = { ...prev };
        sec.fields.forEach(f => { delete copy[f.name]; });
        return { ...copy, ...found };
      });
      if (Object.keys(found).length) {
        showToast('Please check your details', Object.values(found)[0], true);
        return;
      }
      const res = await apiFetch('/api/onboarding/section', {
        method: 'POST',
        body: { section: sec.key, data: buildPayload(sec, data) },
      });
      // Invalidates any loadProfile() GET still in flight from before this
      // save — its response (reflecting the pre-save value) would otherwise
      // be free to land after this and silently undo it.
      latestRequestIdRef.current++;
      setCompletionPct(res.completionPct || 0);
      const newSections = Array.isArray(res.completedSections) ? res.completedSections.filter(k => SECTION_KEYS.includes(k)) : completedSections;
      setCompletedSections(newSections);
      setSaved(prev => ({ ...prev, [sec.key]: true }));
      showToast(`${sec.title} saved ✓`, 'Your profile has been updated successfully', false);
    } catch (err) {
      showToast('Save failed', err?.message || 'Please try again', true);
    } finally {
      setSaving(null);
    }
  };

  const savedCount = Object.keys(saved).filter(k => SECTION_KEYS.includes(k)).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProfile(true); }} tintColor={theme.accent} colors={[theme.accent]} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
            <Feather name="arrow-left" size={20} color={theme.text} />
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
              errors={errors}
              styles={styles}
              theme={theme}
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
          <LinearGradient colors={toast.isError ? ['#E0546E', '#C0394F'] : ['#1F9A5A', '#27AE6A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.toastGrad}>
            <View style={styles.toastIconWrap}>
              <Feather name={toast.isError ? 'alert-circle' : 'check-circle'} size={22} color="#FFFFFF" />
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

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 13, color: theme.faint, marginTop: 2 },

  progressCard: { borderRadius: 22, padding: 20, marginBottom: 20 },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 16 },
  progressPct: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  progressLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 2 },
  progressDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  progressBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  progressBarFill: { height: 6, backgroundColor: '#FFFFFF', borderRadius: 3 },
  progressHint: { fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },

  sectionSkeleton: { height: 68, backgroundColor: theme.card, borderRadius: 18, marginBottom: 10 },

  sectionCard: { backgroundColor: theme.card, borderRadius: 18, marginBottom: 10, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  sectionIconWrap: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  sectionSubtitle: { fontSize: 12, color: theme.faint, marginTop: 2 },
  sectionPctBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  sectionPctText: { fontSize: 11, fontWeight: '800' },

  sectionBody: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: theme.border },

  fieldWrap: { marginTop: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginBottom: 8 },
  required: { color: theme.danger },

  textInput: { backgroundColor: theme.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.text, borderWidth: 1, borderColor: theme.borderStrong },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  inputError: { borderColor: '#E0546E' },
  fieldError: { marginTop: 6, fontSize: 12, color: '#E0546E' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: theme.borderStrong, paddingLeft: 14 },
  inputRowText: { flex: 1, paddingVertical: 12, fontSize: 14, color: theme.text },
  inputIconBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  unitText: { paddingHorizontal: 14, fontSize: 13, fontWeight: '700', color: theme.muted },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeDash: { fontSize: 12, fontWeight: '600', color: theme.muted },
  pickerDone: { alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 8 },
  pickerDoneText: { color: theme.accent, fontWeight: '700', fontSize: 14 },

  suggestBox: { marginTop: 6, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  suggestRowLast: { borderBottomWidth: 0 },
  suggestText: { flex: 1, fontSize: 13, color: theme.text },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.borderStrong },
  chipActive: { backgroundColor: theme.accentAlt, borderColor: theme.accentAlt },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.muted },
  chipTextActive: { color: '#FFFFFF' },

  toggleRow: { alignItems: 'flex-start' },

  saveBtn: { marginTop: 20, borderRadius: 14, overflow: 'hidden' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnGrad: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  tabBar: { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },

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
