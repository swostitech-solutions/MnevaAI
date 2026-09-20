import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Feather, Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../api/client';
import { saveAuth } from '../storage/auth';
import { useTheme } from '../context/ThemeContext';

// A masked field with an eye toggle — same small pattern used in Settings.js
// (Change Password) and Signin.js, kept local here since none of those
// export it for reuse.
function PasswordField({ value, onChangeText, placeholder, visible, onToggleVisible, theme, styles }) {
  return (
    <View style={styles.passwordRow}>
      <TextInput
        style={styles.passwordInput}
        placeholder={placeholder}
        placeholderTextColor={theme.placeholder}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
      />
      <TouchableOpacity style={styles.eyeButton} onPress={onToggleVisible}>
        <Ionicons name={visible ? 'eye' : 'eye-off'} size={20} color={theme.faint} />
      </TouchableOpacity>
    </View>
  );
}

export default function ForgotPassword({ navigation }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  // 'email' — ask which account to reset; 'reset' — enter the code + a new
  // password, both shown on this same screen rather than a separate one,
  // since a person moving from "I forgot" to "here's my new password" is
  // one continuous action, not two separate errands.
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);
  const inputs = useRef([]);

  useEffect(() => {
    if (step !== 'reset' || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [step, countdown]);

  const handleSendCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        retry: true,
        body: { email: email.trim().toLowerCase() },
      });
      setStep('reset');
      setCountdown(60);
      // The backend never confirms or denies whether this email is
      // registered (see auth.js) — this screen always moves forward the
      // same way, so it can't leak that either.
      if (data.devOtp) setError(`Dev mode — OTP: ${data.devOtp}`);
    } catch (err) {
      setError(err.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      const data = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim().toLowerCase() },
      });
      setCountdown(60);
      setOtp(['', '', '', '', '', '']);
      if (data.devOtp) setError(`Dev mode — new OTP: ${data.devOtp}`);
    } catch (err) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  const handleChangeOtp = (val, idx) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[idx] = val.slice(-1);
    setOtp(next);
    if (val && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKeyPress = (e, idx) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const handleResetPassword = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('Please enter the 6-digit code'); return; }
    if (newPw.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { setError('New passwords do not match'); return; }
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        retry: true,
        body: { email: email.trim().toLowerCase(), otp: code, newPassword: newPw },
      });
      // Resetting logs the account straight in on this device — no separate
      // sign-in step needed after proving the reset code.
      await saveAuth(data.token, data.user, data.refreshToken);
      navigation.replace('Home');
    } catch (err) {
      setError(err.message || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <StatusBar style={theme.statusBarStyle} />

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </TouchableOpacity>

        <View style={styles.iconWrap}>
          <Feather name={step === 'email' ? 'lock' : 'mail'} size={32} color={theme.accent} />
        </View>

        {step === 'email' ? (
          <>
            <Text style={styles.title}>Forgot password?</Text>
            <Text style={styles.subtitle}>Enter your account email and we'll send you a reset code.</Text>

            {error ? <Text style={[styles.errorText, error.startsWith('Dev') && styles.devText]}>{error}</Text> : null}

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
                autoFocus
              />
            </View>

            <TouchableOpacity style={[styles.actionButton, loading && styles.actionButtonDisabled]} onPress={handleSendCode} disabled={loading}>
              <LinearGradient colors={['#7B5FE8', '#4FA6E8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionButtonGradient}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionButtonText}>Send reset code</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.emailText}>{email.trim()}</Text>
            </Text>

            {error ? <Text style={[styles.errorText, error.startsWith('Dev') && styles.devText]}>{error}</Text> : null}

            <View style={styles.otpRow}>
              {otp.map((digit, idx) => (
                <TextInput
                  key={idx}
                  ref={(r) => (inputs.current[idx] = r)}
                  style={[styles.otpInput, digit && styles.otpInputFilled]}
                  value={digit}
                  onChangeText={(v) => handleChangeOtp(v, idx)}
                  onKeyPress={(e) => handleKeyPress(e, idx)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                />
              ))}
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.label}>New password</Text>
              <PasswordField
                placeholder="Min. 8 characters"
                value={newPw}
                onChangeText={setNewPw}
                visible={showNewPw}
                onToggleVisible={() => setShowNewPw((v) => !v)}
                theme={theme}
                styles={styles}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.label}>Confirm new password</Text>
              <PasswordField
                placeholder="Re-enter new password"
                value={confirmPw}
                onChangeText={setConfirmPw}
                visible={showConfirmPw}
                onToggleVisible={() => setShowConfirmPw((v) => !v)}
                theme={theme}
                styles={styles}
              />
            </View>

            <TouchableOpacity style={[styles.actionButton, loading && styles.actionButtonDisabled]} onPress={handleResetPassword} disabled={loading}>
              <LinearGradient colors={['#3CB37A', '#1F7A54']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionButtonGradient}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionButtonText}>Reset password</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendText}>Didn't receive it? </Text>
              {countdown > 0 ? (
                <Text style={styles.countdownText}>Resend in {countdown}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={resending}>
                  {resending ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={styles.resendLink}>Resend code</Text>}
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 60 },
  backBtn: { position: 'absolute', top: 56, left: 20, padding: 8 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: '700', color: theme.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: theme.muted, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  emailText: { fontWeight: '700', color: theme.text },
  errorText: { color: theme.danger, fontSize: 13, marginBottom: 16, textAlign: 'center' },
  devText: { color: theme.accent },

  inputWrapper: { width: '100%', marginBottom: 16 },
  label: { color: theme.textSecondary, fontSize: 13, marginBottom: 8, fontWeight: '600' },
  input: {
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.borderStrong, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, color: theme.text, fontSize: 15,
  },
  passwordRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card,
    borderWidth: 1, borderColor: theme.borderStrong, borderRadius: 12, paddingRight: 8,
  },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, color: theme.text, fontSize: 15 },
  eyeButton: { padding: 8 },

  otpRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  otpInput: {
    width: 46, height: 54, borderRadius: 12, borderWidth: 1.5, borderColor: theme.borderStrong,
    backgroundColor: theme.card, textAlign: 'center', fontSize: 22, fontWeight: '700', color: theme.text,
  },
  otpInputFilled: { borderColor: theme.accent },

  actionButton: { width: '100%', borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  actionButtonDisabled: { opacity: 0.7 },
  actionButtonGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  resendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  resendText: { color: theme.muted, fontSize: 14 },
  resendLink: { color: theme.accent, fontSize: 14, fontWeight: '700' },
  countdownText: { color: theme.faint, fontSize: 14, fontWeight: '600' },
});
