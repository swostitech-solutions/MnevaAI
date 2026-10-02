import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

// Mirrors DateField's shape exactly, for a time instead of a date — a tap
// opens the native time picker instead of the user typing a time string by
// hand (which is how times ended up invalid/unparseable in the first
// place). value/onChange carry a plain 24h "HH:MM" string (easy to
// validate, sort and parse elsewhere); the picker and the field's own
// label just display it as a friendly 12h time.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseTimeToDate(value) {
  const d = new Date();
  if (value && HHMM.test(value)) {
    const [h, m] = value.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setSeconds(0, 0);
  }
  return d;
}

function formatHHMM(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Exported so list rows elsewhere can show a stored "HH:MM" value the same
// friendly way ("5:30 PM") instead of the raw 24h string.
export function formatTimeDisplay(value) {
  if (!value || !HHMM.test(value)) return value || '';
  return parseTimeToDate(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function TimeField({ label, required, value, onChange, placeholder = 'Select time' }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [show, setShow] = useState(false);

  return (
    <>
      <Text style={styles.fieldLabel}>
        {label}{required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity style={styles.input} onPress={() => setShow(true)}>
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? formatTimeDisplay(value) : placeholder}
        </Text>
        <Feather name="clock" size={16} color={theme.faint} />
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={parseTimeToDate(value)}
          mode="time"
          is24Hour={false}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, date) => {
            setShow(Platform.OS === 'ios');
            if (date) onChange(formatHHMM(date));
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
