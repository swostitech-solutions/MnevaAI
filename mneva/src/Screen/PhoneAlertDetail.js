import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';

function fallbackAnalysis(alert) {
  const text = `${alert?.title || ''} ${alert?.body || ''}`.toLowerCase();
  if (/(fraud|suspicious|unauthori[sz]ed|blocked|declined|failed)/i.test(text)) return { label: 'Security or payment check', summary: 'This may need your attention to protect your account or resolve a payment issue.', nextStep: 'Open the original app and verify the activity before sharing any details or taking action.', urgency: 'urgent' };
  if (/(payment|upi|bank|debit|credit|bill|due)/i.test(text)) return { label: 'Money-related alert', summary: 'Mneva detected a finance-related notification that may need a quick review.', nextStep: 'Check the amount, due date, and recipient in the original app. Pay or dispute it only after verifying the details.', urgency: alert?.priority >= 85 ? 'urgent' : 'important' };
  if (/(appointment|meeting|flight|delivery today|medicine|deadline)/i.test(text)) return { label: 'Time-sensitive update', summary: 'This alert appears to have a time-sensitive detail worth reviewing soon.', nextStep: 'Review the time and location in the original app, then add or update a reminder if you need one.', urgency: alert?.priority >= 85 ? 'urgent' : 'important' };
  return { label: 'Action may be needed', summary: 'Mneva marked this notification as useful because it may need a response, follow-up, or review.', nextStep: 'Read the full notification and decide whether to respond, complete the request, or dismiss it.', urgency: 'normal' };
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function PhoneAlertDetail({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [alert, setAlert] = useState(route?.params?.alert || {});

  useEffect(() => {
    const id = route?.params?.alert?.id;
    if (!id) return undefined;
    apiFetch('/api/notifications').then((data) => {
      const latest = (data.notifications || []).find(item => item.id === id);
      if (latest) setAlert(latest);
    }).catch(() => {});
    return undefined;
  }, [route?.params?.alert?.id]);

  const analysis = alert.analysis || fallbackAnalysis(alert);
  const urgent = analysis.urgency === 'urgent';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()} accessibilityLabel="Go back"><Feather name="arrow-left" size={21} color="#14171F" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Phone alert</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.sourceIcon, urgent && styles.sourceIconUrgent]}><Feather name={urgent ? 'alert-circle' : 'bell'} size={25} color={urgent ? '#B42318' : '#9A6700'} /></View>
        <Text style={styles.appName}>{alert.appName || 'Android app'}</Text>
        <Text style={styles.time}>{formatDate(alert.ts)}</Text>

        <View style={styles.messageCard}>
          <Text style={styles.messageLabel}>NOTIFICATION</Text>
          <Text style={styles.messageTitle}>{alert.title || 'Phone alert'}</Text>
          {!!alert.body && <Text style={styles.messageBody}>{alert.body}</Text>}
        </View>

        <View style={[styles.analysisCard, urgent && styles.analysisCardUrgent]}>
          <View style={styles.analysisHeading}><View style={styles.aiIcon}><Feather name="sparkles" size={16} color="#FFFFFF" /></View><View style={styles.analysisHeadingCopy}><Text style={styles.analysisEyebrow}>MNEVA ANALYSIS</Text><Text style={styles.analysisTitle}>{analysis.label}</Text></View></View>
          <Text style={styles.analysisSummary}>{analysis.summary}</Text>
          <View style={styles.nextStep}><View style={styles.nextIcon}><Feather name="arrow-right" size={16} color="#1F7A54" /></View><View style={styles.nextCopy}><Text style={styles.nextLabel}>SUGGESTED NEXT STEP</Text><Text style={styles.nextText}>{analysis.nextStep}</Text></View></View>
        </View>

        <View style={styles.note}><Feather name="shield" size={15} color="#6B7280" /><Text style={styles.noteText}>Mneva gives guidance only. Confirm important details in the original app before taking action.</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' }, header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }, backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }, headerTitle: { color: '#14171F', fontSize: 18, fontWeight: '800' },
  content: { paddingHorizontal: 20, alignItems: 'center', paddingTop: 14 }, sourceIcon: { width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7E6' }, sourceIconUrgent: { backgroundColor: '#FEF3F2' }, appName: { color: '#1F7A54', fontWeight: '800', fontSize: 13, marginTop: 12 }, time: { color: '#9AA1AE', fontSize: 11.5, marginTop: 3 },
  messageCard: { alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E5E7EB', padding: 18, marginTop: 24 }, messageLabel: { color: '#6B7280', fontSize: 10, fontWeight: '800', letterSpacing: 0.7 }, messageTitle: { color: '#14171F', fontSize: 18, fontWeight: '800', lineHeight: 25, marginTop: 7 }, messageBody: { color: '#4B5563', fontSize: 14, lineHeight: 21, marginTop: 9 },
  analysisCard: { alignSelf: 'stretch', backgroundColor: '#EFFBF4', borderRadius: 18, padding: 18, marginTop: 14, borderWidth: 1, borderColor: '#D5F3E0' }, analysisCardUrgent: { backgroundColor: '#FFFAF9', borderColor: '#F9D6D1' }, analysisHeading: { flexDirection: 'row', alignItems: 'center' }, aiIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F9A5A', marginRight: 10 }, analysisHeadingCopy: { flex: 1 }, analysisEyebrow: { color: '#1F7A54', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 }, analysisTitle: { color: '#14171F', fontSize: 15, fontWeight: '800', marginTop: 2 }, analysisSummary: { color: '#374151', fontSize: 13, lineHeight: 19, marginTop: 15 },
  nextStep: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 13, padding: 12, marginTop: 14 }, nextIcon: { width: 27, height: 27, borderRadius: 9, backgroundColor: '#E8F5EE', alignItems: 'center', justifyContent: 'center', marginRight: 9 }, nextCopy: { flex: 1 }, nextLabel: { color: '#6B7280', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 }, nextText: { color: '#242934', fontSize: 12.5, lineHeight: 18, marginTop: 3, fontWeight: '600' },
  note: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 8, marginTop: 17, gap: 7 }, noteText: { flex: 1, color: '#6B7280', fontSize: 11, lineHeight: 16 },
});
