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
            if (date) onChange(date.toISOString());
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
