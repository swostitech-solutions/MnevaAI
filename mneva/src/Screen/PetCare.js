import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  useWindowDimensions, Animated, Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import PetProfileTab from './PetCare/PetProfileTab';
import PetHealthTab from './PetCare/PetHealthTab';
import PetRoutineTab from './PetCare/PetRoutineTab';
import { apiFetch } from '../api/client';
import { useSocket } from '../services/socket';
import { onAppDataRefresh } from '../services/dataRefresh';
import { PetContext } from './PetCare/PetContext';

const TABS = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'health',  label: 'Health',  icon: 'activity' },
  { id: 'routine', label: 'Routine', icon: 'clock' },
];

const SPECIES_EMOJI = { Dog: '🐶', Cat: '🐱', Bird: '🐦', Rabbit: '🐰', Fish: '🐟' };

export default function PetCare({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = width < 360 ? 16 : 20;
  const [activeTab, setActiveTab] = useState('profile');
  const { on } = useSocket();

  // Shared state
  const [pets, setPets]       = useState([]);
  const [activePet, setActivePet] = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  // Alert banner state
  const [alert, setAlert]     = useState(null);
  const alertAnim             = useRef(new Animated.Value(-100)).current;
  const alertTimerRef         = useRef(null);

  const showAlert = useCallback((data) => {
    setAlert(data);
    Animated.spring(alertAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
    clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => {
      Animated.timing(alertAnim, { toValue: -120, useNativeDriver: true, duration: 300 }).start(() => setAlert(null));
    }, 6000);
  }, [alertAnim]);

  const dismissAlert = useCallback(() => {
    clearTimeout(alertTimerRef.current);
    Animated.timing(alertAnim, { toValue: -120, useNativeDriver: true, duration: 250 }).start(() => setAlert(null));
  }, [alertAnim]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/pet');
      if (!mountedRef.current) return;
      const list = res.pets || [];
      setPets(list);
      setActivePet(prev => {
        if (!prev) return list[0] || null;
        return list.find(p => p.id === prev.id) || list[0] || null;
      });
    } catch { /* silent */ }
    finally { if (mountedRef.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const unsub = onAppDataRefresh(load);
    return () => { mountedRef.current = false; unsub(); clearTimeout(alertTimerRef.current); };
  }, [load]);

  // Real-time socket events
  useEffect(() => {
    const offCreated = on('pet:created', (pet) => {
      setPets(prev => prev.find(p => p.id === pet.id) ? prev : [pet, ...prev]);
      setActivePet(prev => prev || pet);
    });
    const offUpdated = on('pet:updated', (pet) => {
      setPets(prev => prev.map(p => p.id === pet.id ? pet : p));
      setActivePet(prev => prev?.id === pet.id ? pet : prev);
    });
    const offDeleted = on('pet:deleted', ({ id }) => {
      setPets(prev => {
        const next = prev.filter(p => p.id !== id);
        setActivePet(ap => ap?.id === id ? (next[0] || null) : ap);
        return next;
      });
    });
    const offReminderCreated = on('pet:reminder:created', (r) => {
      // Refresh reminders in routine tab via context
    });
    const offAlert = on('pet:alert', (data) => {
      showAlert(data);
    });
    return () => { offCreated?.(); offUpdated?.(); offDeleted?.(); offReminderCreated?.(); offAlert?.(); };
  }, [on, showAlert]);

  const contextValue = { pets, setPets, activePet, setActivePet, loading, reload: load };

  return (
    <PetContext.Provider value={contextValue}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>

        {/* Real-time alert banner */}
        {alert && (
          <Animated.View style={[styles.alertBanner, { transform: [{ translateY: alertAnim }] }]}>
            <LinearGradient colors={['#F5A623', '#E8943A']} style={styles.alertGrad}>
              <Text style={styles.alertEmoji}>{SPECIES_EMOJI[alert.petSpecies] || '🐾'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>🔔 {alert.petName} — {alert.type}</Text>
                <Text style={styles.alertBody} numberOfLines={1}>{alert.title}</Text>
              </View>
              <Pressable onPress={dismissAlert} style={styles.alertClose}>
                <Feather name="x" size={16} color="#FFFFFF" />
              </Pressable>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Header */}
        <View style={[styles.header, { paddingHorizontal: pad }]}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#14171F" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Pet Care</Text>
            <Text style={styles.headerSubtitle}>
              {activePet ? `${activePet.name} · Mneva AI remembers` : 'Vet, meds & feeding schedule'}
            </Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={{ fontSize: 20 }}>{activePet ? (SPECIES_EMOJI[activePet.species] || '🐾') : '🐾'}</Text>
          </View>
        </View>

        {/* Multi-pet selector */}
        {pets.length > 1 && (
          <View style={[styles.petSelector, { paddingHorizontal: pad }]}>
            {pets.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.petChip, activePet?.id === p.id && styles.petChipActive]}
                onPress={() => setActivePet(p)}
              >
                <Text style={styles.petChipEmoji}>{SPECIES_EMOJI[p.species] || '🐾'}</Text>
                <Text style={[styles.petChipText, activePet?.id === p.id && styles.petChipTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Tab bar */}
        <View style={[styles.tabStrip, { paddingHorizontal: pad }]}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.8}
            >
              <Feather name={tab.icon} size={14} color={activeTab === tab.id ? '#F5A623' : '#9AA1AE'} />
              <Text style={[styles.tabBtnText, activeTab === tab.id && styles.tabBtnTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <View style={{ flex: 1 }}>
          {activeTab === 'profile' && <PetProfileTab horizontalPad={pad} insets={insets} />}
          {activeTab === 'health'  && <PetHealthTab  horizontalPad={pad} insets={insets} />}
          {activeTab === 'routine' && <PetRoutineTab horizontalPad={pad} insets={insets} />}
        </View>
      </SafeAreaView>
    </PetContext.Provider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },

  alertBanner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999 },
  alertGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  alertEmoji: { fontSize: 22 },
  alertTitle: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  alertBody: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  alertClose: { padding: 4 },

  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  headerSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 1 },
  headerBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },

  petSelector: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  petChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: 'transparent' },
  petChipActive: { borderColor: '#F5A623', backgroundColor: '#FEF3C7' },
  petChipEmoji: { fontSize: 14 },
  petChipText: { fontSize: 12, fontWeight: '700', color: '#9AA1AE' },
  petChipTextActive: { color: '#F5A623' },

  tabStrip: { flexDirection: 'row', gap: 8, marginBottom: 4, paddingBottom: 12 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 14, backgroundColor: '#FFFFFF' },
  tabBtnActive: { backgroundColor: '#FEF3C7' },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: '#9AA1AE' },
  tabBtnTextActive: { color: '#F5A623' },
});
