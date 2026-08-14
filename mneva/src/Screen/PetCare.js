import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import PetProfileTab from './PetCare/PetProfileTab';
import PetHealthTab from './PetCare/PetHealthTab';
import PetRoutineTab from './PetCare/PetRoutineTab';

const TABS = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'health',  label: 'Health',  icon: 'activity' },
  { id: 'routine', label: 'Routine', icon: 'clock' },
];

export default function PetCare({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const [activeTab, setActiveTab] = useState('profile');

  // Shared pet state lifted here so all tabs share the same pet data
  const [pet, setPet] = useState(null);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: horizontalPad }]}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#14171F" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Pet Care</Text>
          <Text style={styles.headerSubtitle}>
            {pet ? pet.name : 'Vet, meds & feeding schedule'}
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Feather name="heart" size={18} color="#F5A623" />
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabStrip, { paddingHorizontal: horizontalPad }]}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.8}
          >
            <Feather
              name={tab.icon}
              size={14}
              color={activeTab === tab.id ? '#F5A623' : '#9AA1AE'}
            />
            <Text style={[styles.tabBtnText, activeTab === tab.id && styles.tabBtnTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'profile' && (
          <PetProfileTab
            pet={pet}
            setPet={setPet}
            horizontalPad={horizontalPad}
            insets={insets}
          />
        )}
        {activeTab === 'health' && (
          <PetHealthTab
            pet={pet}
            horizontalPad={horizontalPad}
            insets={insets}
          />
        )}
        {activeTab === 'routine' && (
          <PetRoutineTab
            pet={pet}
            horizontalPad={horizontalPad}
            insets={insets}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  headerSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 1 },
  headerBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  tabStrip: { flexDirection: 'row', gap: 8, marginBottom: 4, paddingBottom: 12 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 14, backgroundColor: '#FFFFFF' },
  tabBtnActive: { backgroundColor: '#FEF3C7' },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: '#9AA1AE' },
  tabBtnTextActive: { color: '#F5A623' },
});
