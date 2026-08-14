import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FamilyTaskProvider, useFamilyTask } from './FamilyTasks/FamilyTaskContext';
import ConnectionsTab from './FamilyTasks/ConnectionsTab';
import TasksTab from './FamilyTasks/TasksTab';

const TABS = [
  { id: 'tasks',       label: 'Tasks',       icon: 'check-square' },
  { id: 'connections', label: 'People',       icon: 'users' },
];

function FamilyTasksInner({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const [activeTab, setActiveTab] = useState('tasks');
  const { tasks, connections } = useFamilyTask();

  const pendingConnections = connections.filter(c => c.status === 'PENDING' && c.direction === 'RECEIVED').length;
  const activeTasks  = tasks.filter(t => ['PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS'].includes(t.status)).length;
  const doneTasks    = tasks.filter(t => t.status === 'COMPLETED').length;
  const totalTasks   = tasks.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Hero header */}
      <LinearGradient colors={['#0F5132', '#1F9A5A']} style={[styles.hero, { paddingHorizontal: horizontalPad }]}>
        <View style={styles.heroTop}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.heroTitle}>Family Tasks</Text>
            <Text style={styles.heroSub}>Shared task management</Text>
          </View>
          <View style={styles.heroBadge}>
            <Feather name="check-square" size={18} color="#FFFFFF" />
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatPill label="Active" value={activeTasks} color="#A7F3D0" />
          <StatPill label="Done" value={doneTasks} color="#6EE7B7" />
          <StatPill label="Total" value={totalTasks} color="#D1FAE5" />
          <StatPill label="People" value={connections.filter(c => c.status === 'ACCEPTED').length} color="#FDE68A" />
        </View>

        {/* Tab strip inside hero */}
        <View style={styles.tabStrip}>
          {TABS.map(tab => {
            const badge = tab.id === 'connections' ? pendingConnections : 0;
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.8}
              >
                <Feather name={tab.icon} size={14} color={active ? '#0F5132' : 'rgba(255,255,255,0.65)'} />
                <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{tab.label}</Text>
                {badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      {/* Content */}
      <View style={{ flex: 1, backgroundColor: '#F2F4F7' }}>
        {activeTab === 'tasks'       && <TasksTab       horizontalPad={horizontalPad} insets={insets} />}
        {activeTab === 'connections' && <ConnectionsTab horizontalPad={horizontalPad} insets={insets} />}
      </View>
    </SafeAreaView>
  );
}

function StatPill({ label, value, color }) {
  return (
    <View style={[styles.statPill, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function FamilyTasks({ navigation }) {
  return (
    <FamilyTaskProvider>
      <FamilyTasksInner navigation={navigation} />
    </FamilyTaskProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F5132' },
  hero: { paddingTop: 10, paddingBottom: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  heroBadge: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  statPill: { flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  tabStrip: { flexDirection: 'row', gap: 8 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)' },
  tabBtnActive: { backgroundColor: '#F2F4F7' },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.65)' },
  tabBtnTextActive: { color: '#0F5132' },
  badge: { backgroundColor: '#E0546E', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },
});
