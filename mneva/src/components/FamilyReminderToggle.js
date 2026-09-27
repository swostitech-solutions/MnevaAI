import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { apiFetch, peekCachedResponse } from '../api/client';
import { onAppDataRefresh } from '../services/dataRefresh';
import { useTheme } from '../context/ThemeContext';

// One of the four family reminder switches (they used to live in AI Profile →
// Family). Each is stored on the user's profile under `settingKey` and read by
// the AI when it decides what to remind about, so flipping it here takes
// effect immediately. The switch updates instantly and rolls back with a
// message if the save fails.
export default function FamilyReminderToggle({ settingKey, title, description, icon, color, style }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [value, setValue] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const tint = color || theme.accent;

  useEffect(() => {
    let cancelled = false;
    const apply = (res) => { if (!cancelled && !busyRef.current && res?.profile) setValue(!!res.profile[settingKey]); };
    peekCachedResponse('/api/onboarding/profile').then(apply).catch(() => {});
    const load = () => apiFetch('/api/onboarding/profile').then(apply).catch(() => {});
    load();
    const off = onAppDataRefresh(load);
    return () => { cancelled = true; off?.(); };
  }, [settingKey]);

  const onToggle = async (next) => {
    const previous = value;
    busyRef.current = true;
    setValue(next);
    setError('');
    try {
      await apiFetch('/api/onboarding/family-toggle', { method: 'PATCH', body: { key: settingKey, value: next } });
    } catch (err) {
      setValue(previous);
      setError(err?.message || 'Could not save. Please try again.');
    } finally {
      busyRef.current = false;
    }
  };

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: tint + '22' }]}>
          <Feather name={icon || 'bell'} size={16} color={tint} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          {!!description && <Text style={styles.desc}>{description}</Text>}
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: theme.borderStrong, true: tint }}
          thumbColor="#FFFFFF"
        />
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  wrap: { backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 14, paddingVertical: 12, marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: theme.text },
  desc: { fontSize: 12, color: theme.muted, marginTop: 2 },
  error: { fontSize: 12, color: '#E0546E', marginTop: 8 },
});
