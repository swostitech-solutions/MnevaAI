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
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, BASE_URL } from '../api/client';
import { saveAuth } from '../storage/auth';
import { resetSocket, getSocket } from '../services/socket';

export default function Signin({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const errorAnim = useRef(new Animated.Value(0)).current;
  const warmupDoneRef = useRef(false);

  const showError = (msg, detail = '') => {
    setError(msg);
    setErrorDetail(detail);
    errorAnim.setValue(0);
    Animated.spring(errorAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
  };

  // Warmup on mount (catches case where App.js warmup hasn't resolved yet)
  useEffect(() => {
    if (warmupDoneRef.current) return;
    warmupDoneRef.current = true;
    fetch(`${BASE_URL}/api/health`, { method: 'GET' }).catch(() => {});
  }, []);

  const handleSignin = async () => {
    setError('');
    setErrorDetail('');
    if (!email.trim() || !password) {
      showError('Missing credentials', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), password },
      });
      // Persist the new session *before* mounting Home. Previously Home could
      // fetch with the previous/no token, leaving the UI empty until logout and
      // login caused another app start.
      await saveAuth(data.token, data.user);
      resetSocket();
      await getSocket();
      navigation.replace('Home');
    } catch (err) {
      if (err.status === 403) {
        navigation.navigate('VerifyOtp', { email: email.trim().toLowerCase() });
      } else if (err.status === 503) {
        showError('Service unavailable', 'Our servers are waking up. Please try again in a moment.');
      } else {
        showError('Sign in failed', err.message || 'The email or password you entered is incorrect.');
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
        <StatusBar style="dark" />

        <Image
          source={require('../../assets/mneva-m-icon.png')}
          style={styles.badge}
          resizeMode="contain"
        />

        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue to Mneva AI</Text>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#9CA3AF"
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
              placeholderTextColor="#9CA3AF"
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
                color="#9AA1AE"
              />
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <Animated.View
            style={[
              styles.errorBanner,
              {
                opacity: errorAnim,
                transform: [{ translateY: errorAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
              },
            ]}
          >
            <View style={styles.errorAccentBar} />
            <View style={styles.errorIconWrap}>
              <Ionicons name="shield-outline" size={18} color="#FF6B6B" />
            </View>
            <View style={styles.errorTextWrap}>
              <View style={styles.errorTitleRow}>
                <Text style={styles.errorLabel}>AUTH ERROR</Text>
              </View>
              <Text style={styles.errorTitle}>{error}</Text>
              {errorDetail ? <Text style={styles.errorSub}>{errorDetail}</Text> : null}
            </View>
            <TouchableOpacity
              onPress={() => { setError(''); setErrorDetail(''); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.errorClose}
            >
              <Ionicons name="close" size={14} color="#6B7280" />
            </TouchableOpacity>
          </Animated.View>
        ) : null}

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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#FAFAFC',
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
    color: '#14171F',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 28,
  },
  errorBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 16,
    paddingVertical: 14,
    paddingRight: 14,
    marginBottom: 14,
    marginTop: 8,
    overflow: 'hidden',
  },
  errorAccentBar: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: '#FF4D4D',
    borderRadius: 4,
    marginRight: 12,
    marginLeft: 0,
  },
  errorIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFE8E8',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  errorTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  errorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  errorLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FF4D4D',
    letterSpacing: 1.2,
  },
  errorTitle: {
    color: '#14171F',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  errorSub: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 17,
  },
  errorClose: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapper: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    color: '#374151',
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E7EF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#14171F',
    fontSize: 15,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E7EF',
    borderRadius: 12,
    paddingRight: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#14171F',
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
    color: '#6B7280',
    fontSize: 14,
  },
  signupLink: {
    color: '#7B5FE8',
    fontSize: 14,
    fontWeight: '700',
  },
});
