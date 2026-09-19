import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch } from '../api/client';
import { useTheme } from '../context/ThemeContext';

const PLANS = [
  {
    id: 'basic', name: 'Basic', price: '$8.99', period: '/ month',
    seats: 'Individual',
    icon: 'user',
    features: [
      'Daily Brief & Priorities',
      'Ask Mneva',
      'Mail & calendar intelligence',
      'L1 Observe + L2 Suggest',
    ],
  },
  {
    id: 'pro', name: 'Pro', price: '$18.99', period: '/ month',
    seats: 'Individual',
    icon: 'zap',
    popular: true,
    popularLabel: 'Most likely for you',
    features: [
      'Everything in Basic',
      'L3 Draft & Prep',
      'Full Twin Diary signed ledger',
      'Health & Fit integration',
    ],
  },
  {
    id: 'family', name: 'Family', price: '$49.99', period: '/ month',
    seats: 'Up to 4 members',
    icon: 'users',
    features: [
      'Pro features for every member',
      'Shared family calendar & tasks',
      'Shared follow-ups and reminders',
      '+$19/mo for 2 extra members',
    ],
  },
];

function planKey(value = '') {
  const name = value.toLowerCase();
  if (name.includes('family')) return 'family';
  if (name.includes('pro')) return 'pro';
  return 'basic';
}

export default function Subscription({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [currentPlan, setCurrentPlan] = useState('basic');

  useEffect(() => {
    // Only the fresh server response decides which plan shows as current —
    // the locally-cached auth blob is captured once at login and never
    // refreshed afterward, so a plan change (or this account simply having
    // been Free all along under a stale cached value) could otherwise keep
    // showing the wrong plan highlighted indefinitely.
    apiFetch('/api/auth/me').then(user => setCurrentPlan(planKey(user?.plan))).catch(() => {});
  }, []);

  const selectPlan = (plan) => {
    if (plan.id === currentPlan) return;
    Alert.alert(
      `${plan.name} selected`,
      `Secure checkout for ${plan.name} (${plan.price}${plan.period}) will be available soon. No payment has been charged.`,
      [{ text: 'OK' }],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Plans & subscription</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Choose your Mneva plan</Text>
        <Text style={styles.subtitle}>Start with Basic, then step up to Pro or Family whenever you need more.</Text>

        {/* Placeholder only — no trial tracking or app lock wired up yet,
            this is just the copy/design for when that's built. */}
        <View style={styles.trialBanner}>
          <View style={styles.trialAccentBar} />
          <Feather name="gift" size={16} color={theme.accent} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.trialTitle}>Your first month is completely free</Text>
            <Text style={styles.trialSubtitle}>Once your free month ends, the app locks until you choose a plan below.</Text>
          </View>
        </View>

        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                plan.popular && styles.planCardPopular,
                isCurrent && styles.planCardCurrent,
              ]}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>{plan.popularLabel}</Text>
                </View>
              )}

              <View style={styles.planTop}>
                <View style={[styles.planIconWrap, plan.popular && styles.planIconWrapPopular]}>
                  <Feather name={plan.icon} size={16} color={plan.popular ? '#FFFFFF' : theme.textSecondary} />
                </View>
                <Text style={styles.planName}>{plan.name}</Text>
                {isCurrent && (
                  <View style={styles.currentBadge}>
                    <Feather name="check" size={11} color={theme.accent} />
                    <Text style={styles.currentText}>CURRENT</Text>
                  </View>
                )}
              </View>

              <View style={styles.priceRow}><Text style={styles.price}>{plan.price}</Text><Text style={styles.period}>{plan.period}</Text></View>
              <Text style={styles.seatsText}>per month · {plan.seats}</Text>

              <View style={styles.featureList}>
                {plan.features.map((feature, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Feather name="check" size={14} color={theme.accent} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              {isCurrent ? (
                <TouchableOpacity style={styles.planButtonCurrent} onPress={() => selectPlan(plan)} activeOpacity={0.8}>
                  <Text style={styles.planButtonTextCurrent}>Your current plan</Text>
                </TouchableOpacity>
              ) : plan.popular ? (
                <TouchableOpacity onPress={() => selectPlan(plan)} activeOpacity={0.85}>
                  <LinearGradient colors={[theme.accentAlt, theme.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.planButton}>
                    <Text style={styles.planButtonText}>Choose {plan.name}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.planButtonOutline} onPress={() => selectPlan(plan)} activeOpacity={0.8}>
                  <Text style={styles.planButtonOutlineText}>Choose {plan.name}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={styles.securityNote}>
          <Feather name="lock" size={14} color={theme.muted} />
          <Text style={styles.securityText}>All plans are billed monthly. You can change your plan at any time.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  backButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  headerTitle: { fontSize: 15, fontWeight: '700', color: theme.text },

  content: { paddingHorizontal: 20, paddingTop: 6, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: theme.text, textAlign: 'center' },
  subtitle: { fontSize: 13, color: theme.muted, textAlign: 'center', lineHeight: 19, marginTop: 6, marginBottom: 18, maxWidth: 320 },

  trialBanner: { alignSelf: 'stretch', flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 14, marginBottom: 18, overflow: 'hidden' },
  trialAccentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: theme.accent },
  trialTitle: { color: theme.text, fontSize: 13.5, fontWeight: '700' },
  trialSubtitle: { color: theme.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },

  planCard: { alignSelf: 'stretch', backgroundColor: theme.card, borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: theme.border },
  planCardPopular: { borderColor: theme.accent, borderWidth: 1.5 },
  planCardCurrent: { borderColor: theme.accent },

  popularBadge: { alignSelf: 'flex-start', backgroundColor: theme.isDark ? 'rgba(52,199,123,0.14)' : '#EFFBF4', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 12 },
  popularText: { color: theme.accent, fontSize: 10.5, fontWeight: '700' },

  planTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planIconWrap: { width: 30, height: 30, borderRadius: 9, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center' },
  planIconWrapPopular: { backgroundColor: theme.accent },
  planName: { flex: 1, color: theme.text, fontSize: 17, fontWeight: '800' },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#E8F5EE', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  currentText: { color: theme.accent, fontSize: 9, fontWeight: '800' },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 15 },
  price: { fontSize: 28, fontWeight: '800', color: theme.text, letterSpacing: -0.4 },
  period: { color: theme.muted, fontSize: 12, marginLeft: 4 },
  seatsText: { color: theme.muted, fontSize: 12, marginTop: 2 },

  featureList: { marginTop: 16, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 14, gap: 11 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  featureText: { flex: 1, color: theme.text, fontSize: 13.5, lineHeight: 19 },

  planButton: { borderRadius: 11, alignItems: 'center', paddingVertical: 13, marginTop: 18 },
  planButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  planButtonOutline: { borderRadius: 11, alignItems: 'center', paddingVertical: 13, marginTop: 18, borderWidth: 1, borderColor: theme.borderStrong },
  planButtonOutlineText: { color: theme.text, fontSize: 13, fontWeight: '800' },
  planButtonCurrent: { backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#E8F5EE', borderRadius: 11, alignItems: 'center', paddingVertical: 13, marginTop: 18 },
  planButtonTextCurrent: { color: theme.accent, fontSize: 13, fontWeight: '800' },

  securityNote: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginTop: 4, paddingHorizontal: 10 },
  securityText: { flex: 1, color: theme.muted, fontSize: 10.5, lineHeight: 15 },
});
