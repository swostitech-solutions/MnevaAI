import React, { useState } from 'react';
import { Text, TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

// Shared by every Finance "Add" form — each has several date fields (Loan
// alone has six), and the RN date-picker dance (fake input → conditional
// picker → iOS-only Done button) is easy to get subtly wrong if copy-pasted
// per field. One component, used everywhere, matching the pattern already
// established in LifeOps.js / Askai.js.
//
// Rendered only a handful of times per form (not inside a scrolling list),
// so — unlike TaskCard/MeetingCard in Priorities.js — it calls useTheme()
// and builds its own styles directly, the same way Settings.js's AccountTab
// does for a component that isn't repeated across many rows.
// Builds YYYY-MM-DD from the device's LOCAL calendar fields, never through
// toISOString() (which converts to UTC first) — a date picked late at
// night in a timezone ahead of UTC (e.g. just after midnight IST) would
// otherwise convert to the PREVIOUS day in UTC, silently saving the wrong
// date. The user picked a calendar day on their own device; this keeps it
// exactly that day regardless of what timezone the backend runs in.
const pad2 = (n) => String(n).padStart(2, '0');
const toLocalDateOnly = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export default function DateField({ label, required, value, onChange, minimumDate }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [show, setShow] = useState(false);
  const dateObj = value ? new Date(value) : new Date();

  return (
    <>
      <Text style={styles.fieldLabel}>
        {label}{required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity style={styles.input} onPress={() => setShow(true)}>
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
        </Text>
        <Feather name="calendar" size={16} color={theme.faint} />
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          minimumDate={minimumDate}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(e, date) => {
            setShow(Platform.OS === 'ios');
            // mode="date" above never lets the user pick a time, but the
            // native picker still hands back a Date object carrying
            // whatever time happened to be on the clock when it was
            // constructed — so the raw ISO string includes a meaningless
            // "T09:35:00.000Z"-style time that then got saved and shown
            // verbatim wherever a screen displays this field raw (it relies
            // on this already being a plain date, same as a few screens
            // already truncated themselves after hitting that exact bug).
            // toLocalDateOnly fixes every caller at once, including ones
            // that forget to truncate themselves.
            if (date) onChange(toLocalDateOnly(date));
          }}
        />
      )}
      {Platform.OS === 'ios' && show && (
        <TouchableOpacity style={styles.doneBtn} onPress={() => setShow(false)}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

const createStyles = (theme) => StyleSheet.create({
  fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  required: { color: theme.danger },
  input: {
    backgroundColor: theme.surfaceAlt, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
    marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  valueText: { fontSize: 14, color: theme.text },
  placeholderText: { fontSize: 14, color: theme.placeholder },
  doneBtn: { alignSelf: 'flex-end', backgroundColor: theme.text, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: -10, marginBottom: 16 },
  doneBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
