import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

// Google Play's User Data policy requires a prominent, in-app disclosure
// before an app starts reading data as sensitive as the call log — it has
// to say what is collected, how it's used, and require an affirmative tap,
// same as NotificationAccessDisclosure.js. Keep this text in sync with
// MnevaCallLogAccessModule.kt and backend/src/routes/callLog.js if either
// changes what's read or stored.
const SECTIONS = [
  {
    icon: 'phone-call',
    title: 'What Mneva reads',
    body: 'Once you allow access, Mneva reads your call log: the number, saved contact name (if any), call type (incoming/outgoing/missed), and when each call happened. It does not record or listen to calls — only this log entry.',
  },
  {
    icon: 'upload-cloud',
    title: 'Where it goes',
    body: "This is sent securely (HTTPS) to Mneva's servers and linked to your account, to work out which contacts you talk to most days.",
  },
  {
    icon: 'shield',
    title: 'What is NOT kept',
    body: "Mneva does not store your full call history. Only a rolling list of the recent days you talked to each contact is kept — enough to notice a pattern, not a permanent call log archive.",
  },
  {
    icon: 'bell',
    title: 'Why it matters',
    body: "If you usually talk to someone most days and a day goes by without a call, Mneva gives you a gentle reminder so you don't lose touch without meaning to.",
  },
  {
    icon: 'toggle-left',
    title: 'You stay in control',
    body: 'This is optional. Turn it off any time from Settings → Notifications here — turning it off deletes what was synced and stops all reading immediately.',
  },
];

export default function CallLogAccessDisclosure({ visible, onAccept, onDecline }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.iconWrap}>
            <Feather name="phone-call" size={22} color={theme.accent} />
          </View>
          <Text style={styles.title}>Allow Mneva to read your call log?</Text>
          <Text style={styles.subtitle}>
            Mneva reads your call log to notice who you talk to regularly, so it can remind you if you've gone a day without reaching someone you usually stay in touch with.
          </Text>

          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
            {SECTIONS.map(({ icon, title, body }) => (
              <View key={title} style={styles.section}>
                <Feather name={icon} size={16} color={theme.accent} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.sectionTitle}>{title}</Text>
                  <Text style={styles.sectionBody}>{body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <Text style={styles.footnote}>
            Tapping "Agree & continue" opens Android's own permission prompt for call log access.
          </Text>

          <View style={styles.btns}>
            <TouchableOpacity style={styles.declineBtn} onPress={onDecline} activeOpacity={0.8}>
              <Text style={styles.declineText}>No thanks</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.8}>
              <Text style={styles.acceptText}>Agree & continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', paddingHorizontal: 20 },
  box: { backgroundColor: theme.surface, borderRadius: 20, padding: 20, maxHeight: '88%' },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.soft, marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: theme.text },
  subtitle: { fontSize: 13, lineHeight: 19, color: theme.textSecondary, marginTop: 6, marginBottom: 12 },
  scroll: { flexGrow: 0 },
  section: { flexDirection: 'row', paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.border },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 3 },
  sectionBody: { fontSize: 13, lineHeight: 19, color: theme.muted },
  footnote: { fontSize: 12, lineHeight: 17, color: theme.faint, marginTop: 10 },
  btns: { flexDirection: 'row', marginTop: 16 },
  declineBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: theme.borderStrong, marginRight: 10,
  },
  declineText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  acceptBtn: { flex: 1.3, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: theme.accent },
  acceptText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
