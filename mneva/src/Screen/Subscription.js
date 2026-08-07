import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';
import { getStoredAuth } from '../storage/auth';

const PLANS = [
  {
    id: 'free', name: 'Free', price: '₹0', period: 'forever',
    domains: '3 active domains',
    domainDetail: 'Communication, Life Ops, Media & Discover',
    autonomy: 'L1–L2',
    autonomyDetail: 'Proposes actions and asks permission',
    memory: '—',
    extras: 'Daily Brief only',
    reason: 'A safe way to build trust and demonstrate daily value with no financial or health exposure.',
  },
  {
    id: 'starter', name: 'Starter', price: '₹399', period: '/ month',
    domains: '5 domains',
    domainDetail: 'Everything in Free, plus Finance and Family',
    autonomy: 'L2',
    autonomyDetail: 'Notifies you and acts on routine tasks',
    memory: '30-day memory',
    extras: 'Basic search',
    reason: 'Built for the higher stakes of money and family coordination, after Mneva has earned your trust.',
    popular: true,
  },
  {
    id: 'professional', name: 'Professional', price: '₹799', period: '/ month',
    domains: 'All 6 domains',
    domainDetail: 'Everything in Starter, plus Health',
    autonomy: 'L3',
    autonomyDetail: 'Acts on trusted categories and logs every action',
    memory: 'Unlimited memory',
    extras: 'All intelligence features and priority support',
    reason: 'For complete support across appointments, vitals, medication, and the rest of your life.',
  },
  {
    id: 'inner-circle', name: 'Inner Circle', price: '₹1,499', period: '/ month',
    domains: 'All 6 domains',
    domainDetail: 'Same domains as Professional',
    autonomy: 'L3–L4',
    autonomyDetail: 'Acts independently and can decide for you in some cases',
    memory: 'Unlimited memory',
    extras: 'Concierge support, full audit history, early access, and API access',
    reason: 'For deeper autonomy, concierge help, and a complete record of how your AI works for you.',
  },
];

function planKey(value = '') {
  const name = value.toLowerCase();
  if (name.includes('inner')) return 'inner-circle';
  if (name.includes('professional')) return 'professional';
  if (name.includes('starter') || name.includes('plus')) return 'starter';
  return 'free';
}

export default function Subscription({ navigation }) {
  const insets = useSafeAreaInsets();
  const [currentPlan, setCurrentPlan] = useState('free');

  useEffect(() => {
    getStoredAuth().then(({ user }) => user?.plan && setCurrentPlan(planKey(user.plan))).catch(() => {});
    apiFetch('/api/auth/me').then(user => user?.plan && setCurrentPlan(planKey(user.plan))).catch(() => {});
  }, []);

  const selectPlan = (plan) => {
    if (plan.id === currentPlan) return;
    Alert.alert(
      `${plan.name} selected`,
      `Secure checkout for ${plan.name} (${plan.price}${plan.period === 'forever' ? ' — free forever' : plan.period}) will be available soon. No payment has been charged.`,
      [{ text: 'OK' }],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={21} color="#14171F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Plans & subscription</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.heroIcon}><Feather name="layers" size={24} color="#FFFFFF" /></View>
        <Text style={styles.title}>Choose your Mneva plan</Text>
        <Text style={styles.subtitle}>Start safely, then unlock more domains and autonomy when you are ready.</Text>

        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <View key={plan.id} style={[styles.planCard, plan.popular && styles.planCardPopular, isCurrent && styles.planCardCurrent]}>
              {plan.popular && <View style={styles.popularBadge}><Text style={styles.popularText}>MOST POPULAR</Text></View>}
              <View style={styles.planTop}>
                <View style={styles.planTitleWrap}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planReason}>{plan.reason}</Text>
                </View>
                {isCurrent && <View style={styles.currentBadge}><Feather name="check" size={12} color="#167547" /><Text style={styles.currentText}>CURRENT</Text></View>}
              </View>
              <View style={styles.priceRow}><Text style={styles.price}>{plan.price}</Text><Text style={styles.period}>{plan.period}</Text></View>

              <View style={styles.details}>
                <Detail icon="grid" label="Domains covered" value={plan.domains} note={plan.domainDetail} />
                <Detail icon="shield" label="Autonomy level" value={plan.autonomy} note={plan.autonomyDetail} />
                <Detail icon="database" label="Memory" value={plan.memory} />
                <Detail icon="zap" label="Also included" value={plan.extras} />
              </View>

              <TouchableOpacity style={[styles.planButton, isCurrent && styles.planButtonCurrent]} onPress={() => selectPlan(plan)} activeOpacity={0.8}>
                <Text style={[styles.planButtonText, isCurrent && styles.planButtonTextCurrent]}>{isCurrent ? 'Your current plan' : `Choose ${plan.name}`}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        <View style={styles.securityNote}>
          <Feather name="lock" size={14} color="#6B7280" />
          <Text style={styles.securityText}>All paid plans are billed monthly. You can change your plan at any time.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ icon, label, value, note }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}><Feather name={icon} size={14} color="#1F9A5A" /></View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
        {note ? <Text style={styles.detailNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#14171F' },
  content: { paddingHorizontal: 20, alignItems: 'center' },
  heroIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#1F9A5A', alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 14 },
  title: { fontSize: 24, fontWeight: '800', color: '#14171F', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19, marginTop: 8, marginBottom: 20, maxWidth: 340 },
  planCard: { alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E7E9EE', overflow: 'hidden' },
  planCardPopular: { borderColor: '#1F9A5A', borderWidth: 2 },
  planCardCurrent: { backgroundColor: '#FBFFFC' },
  popularBadge: { position: 'absolute', right: 0, top: 0, backgroundColor: '#1F9A5A', paddingHorizontal: 11, paddingVertical: 6, borderBottomLeftRadius: 11 },
  popularText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 66 },
  planTitleWrap: { flex: 1 }, planName: { color: '#14171F', fontSize: 19, fontWeight: '800' },
  planReason: { color: '#6B7280', fontSize: 12, marginTop: 4, lineHeight: 17 },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E8F5EE', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, marginLeft: 8, alignSelf: 'flex-start' },
  currentText: { color: '#167547', fontSize: 9, fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 15 }, price: { fontSize: 29, fontWeight: '800', color: '#14171F' }, period: { color: '#6B7280', fontSize: 12, marginLeft: 4 },
  details: { marginTop: 17, borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 3 },
  detailRow: { flexDirection: 'row', paddingTop: 12 }, detailIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#EFFBF4', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  detailCopy: { flex: 1, paddingBottom: 1 }, detailLabel: { color: '#6B7280', fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.35 },
  detailValue: { color: '#242934', fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 1 }, detailNote: { color: '#6B7280', fontSize: 11.5, lineHeight: 16, marginTop: 1 },
  planButton: { backgroundColor: '#1F9A5A', borderRadius: 11, alignItems: 'center', paddingVertical: 13, marginTop: 18 }, planButtonCurrent: { backgroundColor: '#E8F5EE' },
  planButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, planButtonTextCurrent: { color: '#167547' },
  securityNote: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginTop: 4, paddingHorizontal: 10 }, securityText: { flex: 1, color: '#6B7280', fontSize: 10.5, lineHeight: 15 },
});
