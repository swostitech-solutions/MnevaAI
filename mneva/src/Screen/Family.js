import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';

const TAB_BAR_CONTENT_HEIGHT = 50;

export default function Family({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const CARDS = [
    {
      id: '1',
      title: 'Parent Medication',
      subtitle: 'Reminders & refill tracking',
      icon: 'activity',
      color: '#E0546E',
      bg: '#FCEAED',
      gradColors: ['#E0546E', '#C8405A'],
      onPress: () => navigation?.navigate?.('ParentMedication'),
    },
    {
      id: '2',
      title: 'Family Tasks',
      subtitle: 'Shared task management',
      icon: 'check-square',
      color: '#1F9A5A',
      bg: '#EFFDF6',
      gradColors: ['#1F9A5A', '#3CB37A'],
      onPress: () => navigation?.navigate?.('FamilyTasks'),
    },
    {
      id: '3',
      title: 'Pet Care',
      subtitle: 'Vet, meds & feeding schedule',
      icon: 'heart',
      color: '#F5A623',
      bg: '#FEF3C7',
      gradColors: ['#F5A623', '#E8943A'],
      onPress: () => navigation?.navigate?.('PetCare'),
    },
    {
      id: '4',
      title: 'Children & Activities',
      subtitle: 'School, classes & events',
      icon: 'users',
      color: '#9B72FF',
      bg: '#F3EFFE',
      gradColors: ['#9B72FF', '#7C5CE8'],
      onPress: () => navigation?.navigate?.('ChildrenActivities'),
    },
    {
      id: '5',
      title: 'Home Maintenance',
      subtitle: 'Tasks, contacts & warranties',
      icon: 'tool',
      color: '#4FA6E8',
      bg: '#EAF3FD',
      gradColors: ['#4FA6E8', '#2E86C8'],
      onPress: () => navigation?.navigate?.('HomeMaintenance'),
    },
    {
      id: '6',
      title: 'Celebrations & Gifting',
      subtitle: 'Occasions, gifts & budget',
      icon: 'gift',
      color: '#E0546E',
      bg: '#FCEAED',
      gradColors: ['#E0546E', '#C8405A'],
      onPress: () => navigation?.navigate?.('CelebrationGifting'),
    },
    {
      id: '7',
      title: 'Family Calendar',
      subtitle: 'Shared events & reminders',
      icon: 'calendar',
      color: '#D97706',
      bg: '#FEF3C7',
      gradColors: ['#F5A623', '#D97706'],
      onPress: () => navigation?.navigate?.('FamilyCalendar'),
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Family</Text>
            <Text style={styles.headerSubtitle}>Family circle & shared life</Text>
          </View>
          <View style={styles.headerBadge}>
            <Feather name="users" size={18} color={theme.warning} />
          </View>
        </View>

        {/* Cards */}
        {CARDS.map((card) => (
          <TouchableOpacity
            key={card.id}
            style={styles.card}
            activeOpacity={0.8}
            onPress={card.onPress}
          >
            <LinearGradient colors={card.gradColors} style={styles.cardIconWrap}>
              <Feather name={card.icon} size={22} color="#FFFFFF" />
            </LinearGradient>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={card.color} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Home')}>
          <Ionicons name="home" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Priorities')}>
          <Feather name="calendar" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('AskAI')}>
          <Feather name="mic" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Space')}>
          <Feather name="folder" size={22} color={theme.accent} />
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Profile')}>
          <Feather name="user" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 13, color: theme.faint, marginTop: 2 },
  headerBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF0E8', alignItems: 'center', justifyContent: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    gap: 14,
  },
  cardIconWrap: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: theme.text, marginBottom: 3 },
  cardSubtitle: { fontSize: 12, color: theme.faint },
  tabBar: { flexDirection: 'row', backgroundColor: theme.tabBarBg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
  tabLabelActive: { color: theme.accent },
});
