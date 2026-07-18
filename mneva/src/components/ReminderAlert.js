import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Animated, Easing, Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer } from 'expo-audio';
import { getSocket } from '../services/socket';

const { width } = Dimensions.get('window');
const AUTO_CLOSE_MS = 5000;
const CHIME_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

export default function ReminderAlert() {
  const [alerts, setAlerts] = useState([]);
  const firedIds = useRef(new Set());

  const slideY   = useRef(new Animated.Value(-50)).current;
  const opacity  = useRef(new Animated.Value(0)).current;
  const scale    = useRef(new Animated.Value(0.9)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const pulse    = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(null);
  const timerRef = useRef(null);

  const player = useAudioPlayer(CHIME_URL);

  const addAlert = (data) => {
    const key = String(data.id || data._key || Date.now());
    if (firedIds.current.has(key)) return;
    firedIds.current.add(key);
    setAlerts(prev => [...prev, { ...data, _key: Date.now() }]);
  };

  // Register socket listener once socket is ready
  useEffect(() => {
    let socket = null;
    const handler = (data) => addAlert(data);

    getSocket().then(s => {
      if (!s) return;
      socket = s;
      socket.on('reminder:alert', handler);
    });

    return () => {
      socket?.off('reminder:alert', handler);
    };
  }, []);

  const current = alerts[0] || null;

  useEffect(() => {
    if (!current) return;

    slideY.setValue(-50);
    opacity.setValue(0);
    scale.setValue(0.9);
    progress.setValue(1);
    pulse.stopAnimation();

    // Play chime
    try { player.play(); } catch {}

    // Entrance animation
    Animated.parallel([
      Animated.spring(slideY,  { toValue: 0, useNativeDriver: true, tension: 200, friction: 14 }),
      Animated.spring(scale,   { toValue: 1, useNativeDriver: true, tension: 200, friction: 14 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    // Pulse bell icon
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Countdown progress bar
    progressAnim.current = Animated.timing(progress, {
      toValue: 0, duration: AUTO_CLOSE_MS, easing: Easing.linear, useNativeDriver: false,
    });
    progressAnim.current.start(({ finished }) => { if (finished) dismiss(current._key); });

    timerRef.current = setTimeout(() => dismiss(current._key), AUTO_CLOSE_MS + 300);

    return () => {
      clearTimeout(timerRef.current);
      progressAnim.current?.stop();
      pulse.stopAnimation();
    };
  }, [current?._key]);

  const dismiss = (key) => {
    clearTimeout(timerRef.current);
    progressAnim.current?.stop();
    pulse.stopAnimation();
    try { player.pause(); } catch {}

    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY,  { toValue: -30, duration: 200, useNativeDriver: true }),
      Animated.timing(scale,   { toValue: 0.92, duration: 200, useNativeDriver: true }),
    ]).start(() => setAlerts(prev => prev.filter(a => a._key !== key)));
  };

  if (!current) return null;

  const timeStr = new Date(current.time || current.ts || Date.now())
    .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => dismiss(current._key)}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { opacity, transform: [{ translateY: slideY }, { scale }] }]}>

          <LinearGradient colors={['#6C63FF', '#3D8BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.topBar} />

          <View style={styles.body}>

            <View style={styles.headerRow}>
              <View style={styles.agentBadge}>
                <View style={styles.agentDot} />
                <Text style={styles.agentLabel}>MNEVA AI</Text>
              </View>
              <Text style={styles.timeText}>{timeStr}</Text>
            </View>

            <View style={styles.contentRow}>
              <Animated.View style={[styles.iconRing, { transform: [{ scale: pulse }] }]}>
                <LinearGradient colors={['#6C63FF', '#3D8BFF']} style={styles.iconGrad}>
                  <Text style={styles.iconEmoji}>🔔</Text>
                </LinearGradient>
              </Animated.View>

              <View style={styles.textWrap}>
                <Text style={styles.reminderLabel}>REMINDER</Text>
                <Text style={styles.message} numberOfLines={3}>{current.message}</Text>
                {!!current.domain && current.domain !== 'general' && (
                  <View style={styles.domainChip}>
                    <Text style={styles.domainText}>{current.domain}</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.autoCloseHint}>Auto-closing in 5s</Text>

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.dismissBtn} onPress={() => dismiss(current._key)}>
                <Feather name="x" size={14} color="#9AA1AE" />
                <Text style={styles.dismissText}>Dismiss</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.gotItBtn} onPress={() => dismiss(current._key)}>
                <LinearGradient colors={['#6C63FF', '#3D8BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gotItGrad}>
                  <Feather name="check" size={15} color="#fff" />
                  <Text style={styles.gotItText}>Got it</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8,10,20,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: Math.min(width - 48, 380),
    backgroundColor: '#0E1220',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.35)',
    overflow: 'hidden',
    shadowColor: '#6C63FF',
    shadowOpacity: 0.4,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 10 },
    elevation: 24,
  },
  topBar: { height: 3 },
  body: { padding: 22 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  agentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.3)',
  },
  agentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6C63FF' },
  agentLabel: { fontSize: 10, fontWeight: '800', color: '#6C63FF', letterSpacing: 1.2 },
  timeText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 22,
  },
  iconRing: {
    width: 58,
    height: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(108,99,255,0.4)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  iconGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconEmoji: { fontSize: 26 },
  textWrap: { flex: 1 },
  reminderLabel: {
    fontSize: 10, fontWeight: '800', color: '#3D8BFF',
    letterSpacing: 1.5, marginBottom: 6,
  },
  message: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', lineHeight: 23 },
  domainChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(61,139,255,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(61,139,255,0.25)',
  },
  domainText: { fontSize: 10, fontWeight: '700', color: '#3D8BFF', textTransform: 'capitalize' },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: '#6C63FF', borderRadius: 2 },
  autoCloseHint: {
    fontSize: 10, color: 'rgba(255,255,255,0.25)',
    textAlign: 'right', marginBottom: 18,
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  dismissBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dismissText: { fontSize: 14, fontWeight: '700', color: '#9AA1AE' },
  gotItBtn: { flex: 1.6, borderRadius: 14, overflow: 'hidden' },
  gotItGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
  },
  gotItText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
});
