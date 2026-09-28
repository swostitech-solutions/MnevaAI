import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

// Google Play's User Data policy requires a prominent, in-app disclosure
// before an app starts collecting data from other apps (here: notification
// content via NotificationListenerService). It has to say what is collected,
// how it's used, who it's shared with, and require an affirmative tap — an
// OS settings page or a buried privacy policy doesn't count. Keep this text
// in sync with MnevaNotificationListenerService.kt and
// backend/src/routes/deviceNotifications.js if either changes what's sent.
const SECTIONS = [
  {
    icon: 'bell',
    title: 'What Mneva reads',
    body: 'Once you allow access, Mneva reads the app name, title and message text of new notifications from messaging, payment, shopping, food delivery and ride apps (for example WhatsApp, Google Pay, PhonePe, Paytm, Amazon, Swiggy, Uber), plus messages, emails, calls, reminders and events from any app.',
  },
  {
    icon: 'upload-cloud',
    title: 'Where it goes',
    body: 'This notification content is sent securely (HTTPS) to Mneva\'s servers and linked to your account. To decide what is important, it is also sent to our AI provider, OpenAI. Important alerts are saved to your account so they can show up in your Morning Briefing and Priorities.',
  },
  {
    icon: 'shield',
    title: 'How it\'s protected',
    body: 'Numbers that look like OTPs or verification codes (4–8 digits) are hidden on your phone before anything is sent. Mneva\'s own notifications and ongoing ones (like music players) are skipped. We never sell this data or use it for ads.',
  },
  {
    icon: 'toggle-left',
    title: 'You stay in control',
    body: 'This is optional. You can turn it off any time from Settings → Notifications here, or from Android Settings → Notification access. Turning it off stops all collection immediately.',
  },
];

export default function NotificationAccessDisclosure({ visible, onAccept, onDecline }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.iconWrap}>
            <Feather name="smartphone" size={22} color={theme.accent} />
          </View>
          <Text style={styles.title}>Allow Mneva to read your notifications?</Text>
          <Text style={styles.subtitle}>
            Mneva collects and analyses notifications from other apps on this phone to build your Morning Briefing and Priorities, even when Mneva is closed or not in use.
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
            Tapping "Agree & continue" opens Android Settings, where you turn on Notification access for Mneva.
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
