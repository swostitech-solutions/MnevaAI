import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, BASE_URL } from '../api/client';
import { saveAuth } from '../storage/auth';

export default function Signin({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warming, setWarming] = useState(false);

  // Ping backend on mount to wake Render free tier from sleep
  useEffect(() => {
    let cancelled = false;
    const warmUp = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/health`, { method: 'GET' });
        if (!res.ok && !cancelled) setWarming(false);
      } catch {
        // server was sleeping — show warming message
        if (!cancelled) {
          setWarming(true);
          // retry every 3s until it responds
          const interval = setInterval(async () => {
            try {
              const r = await fetch(`${BASE_URL}/api/health`, { method: 'GET' });
              if (r.ok && !cancelled) {
                setWarming(false);
                clearInterval(interval);
              }
            } catch {}
          }, 3000);
          // clear after 90s max
          setTimeout(() => { clearInterval(interval); if (!cancelled) setWarming(false); }, 90000);
        }
      }
    };
    warmUp();
    return () => { cancelled = true; };
  }, []);

  const handleSignin = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), password },
      });
      await saveAuth(data.token, data.user);
      navigation.replace('Home');
    } catch (err) {
      if (err.status === 403) {
        // Email not verified — go to OTP screen
        navigation.navigate('VerifyOtp', { email: email.trim().toLowerCase() });
      } else {
        setError(err.message || 'Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar style="dark" />

        <Image
          source={require('../../assets/mneva-m-icon.png')}
          style={styles.badge}
          resizeMode="contain"
        />

        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue to Mneva AI</Text>

        {warming ? (
          <View style={styles.warmingBanner}>
            <ActivityIndicator size="small" color="#7B5FE8" />
            <Text style={styles.warmingText}>  Waking up server… first login may take ~30s</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

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
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
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
  warmingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F0FF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    width: '100%',
  },
  warmingText: {
    fontSize: 12,
    color: '#7B5FE8',
    fontWeight: '600',
    flexShrink: 1,
  },
});
