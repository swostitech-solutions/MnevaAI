import React, { useState } from 'react';
import { Text, TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';

// Shared by every Finance "Add" form — each has several date fields (Loan
// alone has six), and the RN date-picker dance (fake input → conditional
// picker → iOS-only Done button) is easy to get subtly wrong if copy-pasted
// per field. One component, used everywhere, matching the pattern already
// established in LifeOps.js / Askai.js.
export default function DateField({ label, required, value, onChange, minimumDate }) {
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
        <Feather name="calendar" size={16} color="#9AA1AE" />
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

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  required: { color: '#E0546E' },
  input: {
    backgroundColor: '#F5F6F8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
    marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  valueText: { fontSize: 14, color: '#14171F' },
  placeholderText: { fontSize: 14, color: '#9AA1AE' },
  doneBtn: { alignSelf: 'flex-end', backgroundColor: '#14171F', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: -10, marginBottom: 16 },
  doneBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
