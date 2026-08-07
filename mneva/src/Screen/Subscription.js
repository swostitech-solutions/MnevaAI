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
    description: 'For exploring your personal AI workspace.',
    features: ['Ask AI and core dashboard', 'Basic tasks and reminders', 'Your connected Google account'],
  },
  {
    id: 'plus', name: 'Mneva Plus', price: '₹299', period: '/ month',
    annual: '₹2,499 / year · save ₹1,089',
    description: 'For an organised, proactive daily life.',
    features: ['Everything in Free', 'Phone notification analysis', 'Morning Briefing and smart insights', 'Priority support'],
    popular: true,
  },
  {
    id: 'inner-circle', name: 'Inner Circle', price: '₹999', period: '/ month',
    description: 'For people who want Mneva to take action.',
    features: ['Everything in Plus', 'Advanced automations', 'Priority AI actions with approval controls', 'Dedicated onboarding support'],
  },
];

function planKey(value = '') {
  const name = value.toLowerCase();
  if (name.includes('inner')) return 'inner-circle';
  if (name.includes('plus')) return 'plus';
  return 'free';
}

export default function Subscription({ navigation }) {
  const insets = useSafeAreaInsets();
  const [currentPlan, setCurrentPlan] = useState('plus');
  const [billing, setBilling] = useState('monthly');

  useEffect(() => {
    getStoredAuth().then(({ user }) => user?.plan && setCurrentPlan(planKey(user.plan))).catch(() => {});
    apiFetch('/api/auth/me').then(user => user?.plan && setCurrentPlan(planKey(user.plan))).catch(() => {});
  }, []);

  const selectPlan = (plan) => {
    if (plan.id === currentPlan) return;
    Alert.alert(
      `${plan.name} selected`,
      `Secure checkout for ${plan.name} (${billing === 'annual' && plan.id === 'plus' ? plan.annual : `${plan.price}${plan.period}`}) will be available soon. No payment has been charged.`,
      [{ text: 'OK' }],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <Feather name="arrow-left" size={21} color="#14171F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscription</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.heroIcon}><Feather name="star" size={25} color="#FFFFFF" /></View>
        <Text style={styles.title}>Choose how Mneva helps you</Text>
        <Text style={styles.subtitle}>Simple, transparent pricing in Indian Rupees. You can change plans any time.</Text>

        <View style={styles.billingSwitch}>
          <TouchableOpacity style={[styles.billingOption, billing === 'monthly' && styles.billingOptionActive]} onPress={() => setBilling('monthly')}>
            <Text style={[styles.billingText, billing === 'monthly' && styles.billingTextActive]}>Monthly</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.billingOption, billing === 'annual' && styles.billingOptionActive]} onPress={() => setBilling('annual')}>
            <Text style={[styles.billingText, billing === 'annual' && styles.billingTextActive]}>Yearly</Text>
            <View style={styles.saveBadge}><Text style={styles.saveText}>SAVE 30%</Text></View>
          </TouchableOpacity>
        </View>

        {PLANS.map(plan => {
          const isCurrent = plan.id === currentPlan;
          const shownPrice = billing === 'annual' && plan.id === 'plus' ? '₹2,499' : plan.price;
          const shownPeriod = billing === 'annual' && plan.id === 'plus' ? '/ year' : plan.period;
          return (
            <View key={plan.id} style={[styles.planCard, plan.popular && styles.planCardPopular, isCurrent && styles.planCardCurrent]}>
              {plan.popular && <View style={styles.popularBadge}><Text style={styles.popularText}>MOST POPULAR</Text></View>}
              <View style={styles.planTop}>
                <View>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planDescription}>{plan.description}</Text>
                </View>
                {isCurrent && <View style={styles.currentBadge}><Feather name="check" size={12} color="#1F7A54" /><Text style={styles.currentText}>CURRENT</Text></View>}
              </View>
              <View style={styles.priceRow}><Text style={styles.price}>{shownPrice}</Text><Text style={styles.period}>{shownPeriod}</Text></View>
              {billing === 'annual' && plan.id === 'plus' && <Text style={styles.annualNote}>Equivalent to ₹208/month</Text>}
              {billing === 'monthly' && plan.annual && <Text style={styles.annualNote}>{plan.annual}</Text>}
              <View style={styles.featureList}>
                {plan.features.map(feature => <View key={feature} style={styles.featureRow}><Feather name="check-circle" size={16} color="#1F9A5A" /><Text style={styles.featureText}>{feature}</Text></View>)}
              </View>
              <TouchableOpacity style={[styles.planButton, isCurrent && styles.planButtonCurrent]} onPress={() => selectPlan(plan)} activeOpacity={0.8}>
                <Text style={[styles.planButtonText, isCurrent && styles.planButtonTextCurrent]}>{isCurrent ? 'Your current plan' : `Choose ${plan.name}`}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        <View style={styles.securityNote}><Feather name="lock" size={14} color="#6B7280" /><Text style={styles.securityText}>Prices include applicable taxes. Payments are processed securely when checkout is enabled.</Text></View>
      </ScrollView>
    </SafeAreaView>
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
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19, marginTop: 8, maxWidth: 340 },
  billingSwitch: { flexDirection: 'row', backgroundColor: '#E9EDF1', borderRadius: 13, padding: 4, marginTop: 22, marginBottom: 18, alignSelf: 'stretch' },
  billingOption: { flex: 1, minHeight: 39, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  billingOptionActive: { backgroundColor: '#FFFFFF' },
  billingText: { color: '#6B7280', fontSize: 13, fontWeight: '700' }, billingTextActive: { color: '#14171F' },
  saveBadge: { backgroundColor: '#E1F7EA', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 2 }, saveText: { color: '#167547', fontSize: 8, fontWeight: '800' },
  planCard: { alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E7E9EE', overflow: 'hidden' },
  planCardPopular: { borderColor: '#1F9A5A', borderWidth: 2 }, planCardCurrent: { backgroundColor: '#FBFFFC' },
  popularBadge: { position: 'absolute', right: 0, top: 0, backgroundColor: '#1F9A5A', paddingHorizontal: 11, paddingVertical: 6, borderBottomLeftRadius: 11 }, popularText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 72 }, planName: { color: '#14171F', fontSize: 18, fontWeight: '800' }, planDescription: { color: '#6B7280', fontSize: 12, marginTop: 4, lineHeight: 17, maxWidth: 230 },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E8F5EE', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, alignSelf: 'flex-start' }, currentText: { color: '#1F7A54', fontSize: 9, fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 17 }, price: { fontSize: 28, fontWeight: '800', color: '#14171F' }, period: { color: '#6B7280', fontSize: 12, marginLeft: 4 }, annualNote: { color: '#1F7A54', fontSize: 11, fontWeight: '700', marginTop: 2 },
  featureList: { marginTop: 15, gap: 9 }, featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, featureText: { color: '#374151', fontSize: 12.5, flex: 1 },
  planButton: { backgroundColor: '#1F9A5A', borderRadius: 11, alignItems: 'center', paddingVertical: 13, marginTop: 18 }, planButtonCurrent: { backgroundColor: '#E8F5EE' }, planButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, planButtonTextCurrent: { color: '#1F7A54' },
  securityNote: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginTop: 4, paddingHorizontal: 10 }, securityText: { flex: 1, color: '#6B7280', fontSize: 10.5, lineHeight: 15 },
});
