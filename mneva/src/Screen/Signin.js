import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch, BASE_URL } from '../api/client';
import { saveAuth } from '../storage/auth';
import { resetSocket, getSocket } from '../services/socket';
import { registerForPushNotifications } from '../services/pushNotifications';
import { useTheme } from '../context/ThemeContext';

export default function Signin({ navigation }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);
  const alertAnim = useRef(new Animated.Value(0)).current;
  const warmupDoneRef = useRef(false);

  // Warmup on mount (catches case where App.js warmup hasn't resolved yet)
  useEffect(() => {
    if (warmupDoneRef.current) return;
    warmupDoneRef.current = true;
    fetch(`${BASE_URL}/api/health`, { method: 'GET' }).catch(() => {});
  }, []);

  // Reads what actually went wrong (no response at all, wrong credentials,
  // server temporarily down, bad input) and turns it into an alert an agent
  // would actually give you — specific about what happened and what to do
  // next, not a flat "invalid email or password" no matter the cause.
  const showAlert = (info) => {
    setAlert(info);
    alertAnim.setValue(0);
    Animated.spring(alertAnim, { toValue: 1, useNativeDriver: true, tension: 180, friction: 14 }).start();
  };

  const classifySigninError = (err) => {
    if (!err?.status) {
      return {
        icon: 'wifi-off',
        tone: 'warning',
        title: "Can't reach Mneva",
        message: 'Check your internet connection and try again.',
      };
    }
    if (err.status === 401) {
      return {
        icon: 'shield-off',
        tone: 'danger',
        title: 'Incorrect email or password',
        message: "That combination doesn't match our records. Double-check and try again.",
      };
    }
    if (err.status === 503 || err.status === 504) {
      return {
        icon: 'server',
        tone: 'warning',
        title: 'Mneva is waking up',
        message: err.message || 'Our servers are temporarily unavailable — please try again in a moment.',
      };
    }
    if (err.status === 400) {
      return {
        icon: 'alert-circle',
        tone: 'danger',
        title: 'Check your details',
        message: err.message || 'Please enter a valid email and password.',
      };
    }
    return {
      icon: 'alert-triangle',
      tone: 'danger',
      title: 'Sign-in failed',
      message: err.message || 'Something went wrong. Please try again.',
    };
  };

  const handleSignin = async () => {
    setAlert(null);
    if (!email.trim() || !password) {
      showAlert({
        icon: 'edit-3',
        tone: 'warning',
        title: 'Missing details',
        message: 'Enter both your email and password to continue.',
      });
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        retry: true,
        body: { email: email.trim().toLowerCase(), password },
      });
      // Persist the new session *before* mounting Home. Previously Home could
      // fetch with the previous/no token, leaving the UI empty until logout and
      // login caused another app start.
      await saveAuth(data.token, data.user);
      resetSocket();
      await getSocket();
      registerForPushNotifications().catch(() => {});
      navigation.replace('Home');
    } catch (err) {
      if (err.status === 403) {
        navigation.navigate('VerifyOtp', { email: email.trim().toLowerCase() });
      } else {
        showAlert(classifySigninError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <StatusBar style={theme.statusBarStyle} />

        <Image
          source={require('../../assets/mneva-m-icon.png')}
          style={styles.badge}
          resizeMode="contain"
        />

        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue to Mneva AI</Text>

        {alert && (
          <Animated.View
            style={[
              styles.alertCard,
              alert.tone === 'danger' ? styles.alertCardDanger : styles.alertCardWarning,
              {
                opacity: alertAnim,
                transform: [{ translateY: alertAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
              },
            ]}
          >
            <View style={[styles.alertIconWrap, alert.tone === 'danger' ? styles.alertIconWrapDanger : styles.alertIconWrapWarning]}>
              <Feather name={alert.icon} size={16} color={alert.tone === 'danger' ? theme.danger : theme.warning} />
            </View>
            <View style={styles.alertTextWrap}>
              <Text style={styles.alertTitle}>{alert.title}</Text>
              <Text style={styles.alertMessage}>{alert.message}</Text>
            </View>
          </Animated.View>
        )}

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={theme.placeholder}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              placeholder="••••••••"
              placeholderTextColor={theme.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((v) => !v)}
            >
              <Ionicons
                name={showPassword ? 'eye' : 'eye-off'}
                size={20}
                color={theme.faint}
              />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.signinButton, loading && styles.signinButtonDisabled]}
          onPress={handleSignin}
          disabled={loading}
        >
          <LinearGradient
            colors={['#7B5FE8', '#4FA6E8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.signinButtonGradient}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.signinButtonText}>Sign in</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.signupRow}>
          <Text style={styles.signupText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
            <Text style={styles.signupLink}>Create one</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 60,
  },
  badge: {
    width: 78,
    height: 72,
    marginBottom: 18,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: theme.muted,
    marginBottom: 28,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
    gap: 11,
  },
  alertCardDanger: {
    backgroundColor: theme.isDark ? 'rgba(241,113,134,0.10)' : '#FFF5F7',
    borderColor: theme.isDark ? 'rgba(241,113,134,0.3)' : '#FBD5DD',
  },
  alertCardWarning: {
    backgroundColor: theme.isDark ? 'rgba(255,184,77,0.10)' : '#FFF8EA',
    borderColor: theme.isDark ? 'rgba(255,184,77,0.3)' : '#F5E0AD',
  },
  alertIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertIconWrapDanger: {
    backgroundColor: theme.isDark ? 'rgba(241,113,134,0.18)' : '#FCEAED',
  },
  alertIconWrapWarning: {
    backgroundColor: theme.isDark ? 'rgba(255,184,77,0.18)' : '#FEF3C7',
  },
  alertTextWrap: { flex: 1 },
  alertTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 2,
  },
  alertMessage: {
    fontSize: 12.5,
    color: theme.textSecondary,
    lineHeight: 17,
  },
  inputWrapper: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    color: theme.textSecondary,
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 15,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    borderRadius: 12,
    paddingRight: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 15,
  },
  eyeButton: {
    padding: 8,
  },
  signinButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  signinButtonDisabled: {
    opacity: 0.7,
  },
  signinButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  signupRow: {
    flexDirection: 'row',
    marginTop: 24,
  },
  signupText: {
    color: theme.muted,
    fontSize: 14,
  },
  signupLink: {
    color: theme.accentAlt,
    fontSize: 14,
    fontWeight: '700',
  },
});
