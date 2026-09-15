import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from '../context/ThemeContext';

// Shown instead of the whole app whenever it's locked (cold launch, or
// resuming from background). Attempts Face ID/fingerprint automatically on
// mount, then again if the screen is foregrounded while still locked — the
// user always has a manual retry button too, since a prompt cancelled by
// the OS (an incoming call, switching apps mid-scan) shouldn't strand them
// with no way back in short of force-quitting.
export default function AppLockScreen({ onUnlock }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [authenticating, setAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const hasTriedRef = useRef(false);

  const attemptUnlock = async () => {
    if (authenticating) return;
    setAuthenticating(true);
    setErrorMessage(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Mneva',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        onUnlock();
      } else if (result.error && result.error !== 'user_cancel' && result.error !== 'app_cancel') {
        setErrorMessage("Couldn't verify — try again.");
      }
    } catch {
      setErrorMessage("Couldn't verify — try again.");
    } finally {
      setAuthenticating(false);
    }
  };

  // Auto-prompt once on mount, and again each time the app comes back to
  // the foreground while this screen is still showing (e.g. the user
  // switched apps mid-prompt and came back).
  useEffect(() => {
    if (!hasTriedRef.current) {
      hasTriedRef.current = true;
      attemptUnlock();
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') attemptUnlock();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <LinearGradient
          colors={[theme.accentAlt, theme.accent]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.badge}
        >
          <Feather name="lock" size={30} color="#FFFFFF" />
        </LinearGradient>

        <Image source={require('../../assets/mneva-m-icon.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Mneva is locked</Text>
        <Text style={styles.subtitle}>Unlock with Face ID or fingerprint to continue</Text>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <TouchableOpacity
          style={[styles.unlockBtn, authenticating && styles.unlockBtnDisabled]}
          onPress={attemptUnlock}
          disabled={authenticating}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[theme.accentAlt, theme.accent]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.unlockBtnGrad}
          >
            {authenticating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="unlock" size={17} color="#FFFFFF" />
                <Text style={styles.unlockBtnText}>Unlock</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  badge: {
    width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
    shadowColor: theme.accentAlt, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  logo: { width: 48, height: 44, marginBottom: 20, opacity: 0.85 },
  title: { fontSize: 22, fontWeight: '800', color: theme.text, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.faint, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  error: { fontSize: 13, color: theme.danger, marginBottom: 16, textAlign: 'center' },
  unlockBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  unlockBtnDisabled: { opacity: 0.7 },
  unlockBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 },
  unlockBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
