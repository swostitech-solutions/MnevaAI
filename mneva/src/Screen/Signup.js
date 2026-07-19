import React, { useState } from 'react';
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
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../api/client';

export default function Signup({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [termsModal, setTermsModal] = useState(null);

  const handleSignup = async () => {
    setError('');

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Please fill in all required fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!agreed) {
      setError('Please agree to the Terms of Service and Privacy Policy');
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: {
          name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          confirmPassword,
          agreedToTerms: 'true',
        },
      });

      // Navigate to OTP verification screen
      navigation.navigate('VerifyOtp', {
        email: email.trim().toLowerCase(),
        devOtp: data.devOtp || null, // shown in dev mode when email not configured
      });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
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

        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Start your autonomous journey.</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="John Doe"
            placeholderTextColor="#9CA3AF"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Email Address *</Text>
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
          <Text style={styles.label}>Password *</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Min. 8 characters"
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

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Confirm Password *</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              placeholder="••••••••"
              placeholderTextColor="#9CA3AF"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmPassword((v) => !v)}
            >
              <Ionicons
                name={showConfirmPassword ? 'eye' : 'eye-off'}
                size={20}
                color="#9AA1AE"
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.termsRow}>
          <TouchableOpacity onPress={() => setAgreed((v) => !v)} activeOpacity={0.7}>
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
            </View>
          </TouchableOpacity>
          <Text style={styles.termsText}>
            I agree to the{' '}
            <Text style={styles.termsLink} onPress={() => setTermsModal('terms')}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.termsLink} onPress={() => setTermsModal('privacy')}>Privacy Policy</Text>
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.signupButton, loading && styles.signupButtonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          <LinearGradient
            colors={['#7B5FE8', '#4FA6E8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.signupButtonGradient}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.signupButtonText}>Create account</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.signinRow}>
          <Text style={styles.signinText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Signin')}>
            <Text style={styles.signinLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={!!termsModal} transparent animationType="slide" onRequestClose={() => setTermsModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {termsModal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </Text>
              <TouchableOpacity onPress={() => setTermsModal(null)} style={styles.modalClose}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {termsModal === 'terms' ? (
                <Text style={styles.modalText}>{`Last updated: July 2025

Welcome to Mneva AI. By creating an account, you agree to these Terms of Service.

1. USE OF SERVICE
Mneva AI is a personal AI assistant platform. You must be 18+ to use this service. You are responsible for all activity under your account.

2. AI ACTIONS & TRUST LEVELS
Mneva operates at trust levels L1–L4. Higher trust levels allow autonomous actions on your behalf. You can review and revoke any action from the Twin Diary.

3. PAYMENTS & FINANCIAL ACTIONS
All payment actions ≥ ₹1,000 require biometric confirmation. Mneva is not a licensed financial advisor.

4. DATA & PRIVACY
Your data is encrypted at rest and in transit. We do not sell your personal data.

5. ACCOUNT TERMINATION
You may delete your account at any time from Settings → Account. All data will be permanently erased within 30 days per DPDP Act requirements.

6. GOVERNING LAW
These terms are governed by the laws of India. Disputes shall be resolved in the courts of Bengaluru, Karnataka.

For questions: support@swostitech.com`}</Text>
              ) : (
                <Text style={styles.modalText}>{`Last updated: July 2025

Swostitech Solutions operates Mneva AI. This policy explains how we collect, use, and protect your data.

1. DATA WE COLLECT
• Account info: name, email, password (hashed)
• Usage data: messages, actions, preferences
• Connected integrations: Gmail, Google Fit, Calendar (only with your explicit consent)

2. HOW WE USE YOUR DATA
• To provide and improve the Mneva AI service
• To personalise your AI experience
We never sell your data to third parties.

3. DATA STORAGE
All data is stored on encrypted servers in India. Conversation history is stored in PostgreSQL.

4. YOUR RIGHTS (DPDP Act 2023)
• Right to access your data
• Right to correct inaccurate data
• Right to erase your data
Exercise these rights from Settings → Account.

5. CONTACT
Swostitech Solutions · Bengaluru, India
support@swostitech.com`}</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalBtn} onPress={() => { setTermsModal(null); setAgreed(true); }}>
              <Text style={styles.modalBtnText}>I Understand & Agree</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginTop: 4,
    marginBottom: 24,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: '#7B5FE8',
    borderColor: '#7B5FE8',
  },
  termsText: {
    flex: 1,
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 19,
  },
  termsLink: {
    color: '#7B5FE8',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14,17,26,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E3E5EA',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#14171F',
  },
  modalClose: { padding: 4 },
  modalBody: { marginBottom: 20 },
  modalText: {
    fontSize: 13.5,
    color: '#374151',
    lineHeight: 22,
  },
  modalBtn: {
    backgroundColor: '#7B5FE8',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  modalBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  signupButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  signupButtonDisabled: {
    opacity: 0.7,
  },
  signupButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  signinRow: {
    flexDirection: 'row',
    marginTop: 24,
  },
  signinText: {
    color: '#6B7280',
    fontSize: 14,
  },
  signinLink: {
    color: '#7B5FE8',
    fontSize: 14,
    fontWeight: '700',
  },
});
