import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { getOrCreateVaultKey } from '../storage/vaultKey';
import { encryptBase64, decryptToBase64 } from '../storage/vaultCrypto';

const ACCENT = ['#6C5CE7', '#5A4BD1'];
const WARNING_SEEN_KEY = 'mneva_vault_warning_seen';

const fmtSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function VaultScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  // The only feature in the app that's genuinely end-to-end encrypted — so
  // this is what the Settings > Privacy > "End-to-end encryption" toggle
  // actually gates, instead of doing nothing like it used to.
  const [e2eEnabled, setE2eEnabled] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const loadFiles = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await apiFetch('/api/vault');
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    apiFetch('/api/trust/settings').then((data) => {
      const enabled = data?.preferences?.privacy?.e2eEncryption !== false;
      setE2eEnabled(enabled);
      if (enabled) loadFiles();
    }).catch(() => { setE2eEnabled(true); loadFiles(); })
      .finally(() => setCheckingAccess(false));
  }, [loadFiles]);

  useEffect(() => {
    AsyncStorage.getItem(WARNING_SEEN_KEY).then((seen) => {
      if (!seen) setShowWarning(true);
    });
  }, []);

  const dismissWarning = async () => {
    setShowWarning(false);
    await AsyncStorage.setItem(WARNING_SEEN_KEY, 'true');
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];

      setUploading(true);
      const base64Plaintext = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const deviceKey = await getOrCreateVaultKey();
      const encryptedBlob = await encryptBase64(base64Plaintext, deviceKey);

      await apiFetch('/api/vault/upload', {
        method: 'POST',
        body: { fileBase64: encryptedBlob, fileName: file.name, mimeType: file.mimeType || 'application/octet-stream' },
      });
      await loadFiles(true);
    } catch {
      Alert.alert('Upload failed', "Couldn't encrypt or upload this file — try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (file) => {
    setBusyId(file.id);
    try {
      const data = await apiFetch(`/api/vault/${file.id}/download`);
      const deviceKey = await getOrCreateVaultKey();
      const decryptedBase64 = decryptToBase64(data.dataBase64, deviceKey);

      const tempUri = `${FileSystem.cacheDirectory}${file.fileName}`;
      await FileSystem.writeAsStringAsync(tempUri, decryptedBase64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(tempUri, { mimeType: file.mimeType, dialogTitle: file.fileName });
      } else {
        Alert.alert('Decrypted', `Saved to ${tempUri}`);
      }
    } catch {
      Alert.alert("Couldn't open file", 'This file may be corrupted, or was encrypted on a different device.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (file) => {
    Alert.alert('Delete file', `Permanently delete "${file.fileName}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusyId(file.id);
        try {
          await apiFetch(`/api/vault/${file.id}`, { method: 'DELETE' });
          setFiles((prev) => prev.filter((f) => f.id !== file.id));
        } catch {} finally { setBusyId(null); }
      } },
    ]);
  };

  const handleEnableE2e = async () => {
    try {
      await apiFetch('/api/trust/settings', { method: 'PATCH', body: { privacy: { e2eEncryption: true } } });
      setE2eEnabled(true);
      loadFiles();
    } catch {
      Alert.alert("Couldn't enable this", 'Please try again.');
    }
  };

  if (checkingAccess) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.centerFill}><ActivityIndicator size="small" color={theme.accent} /></View>
      </SafeAreaView>
    );
  }

  if (!e2eEnabled) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Secure Vault</Text>
          </View>
        </View>
        <View style={styles.lockedWrap}>
          <View style={styles.modalIconWrap}>
            <Feather name="lock" size={26} color={theme.accent} />
          </View>
          <Text style={styles.modalTitle}>End-to-end encryption is off</Text>
          <Text style={styles.modalBody}>
            Secure Vault only works with end-to-end encryption on — that's what lets it encrypt files on this
            device before they're ever uploaded. Turn it on in Settings &gt; Privacy, or right here.
          </Text>
          <TouchableOpacity style={styles.modalBtn} onPress={handleEnableE2e}>
            <Text style={styles.modalBtnText}>Turn on end-to-end encryption</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Secure Vault</Text>
          <Text style={styles.headerSubtitle}>{files.length} file{files.length !== 1 ? 's' : ''} · encrypted on this device</Text>
        </View>
        <TouchableOpacity onPress={handleUpload} disabled={uploading}>
          <LinearGradient colors={ACCENT} style={styles.addBtnGrad}>
            {uploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="plus" size={20} color="#FFFFFF" />}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <FlatList
        data={files}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFiles(true); }} tintColor={theme.accent} colors={[theme.accent]} />}
        ListEmptyComponent={
          loading ? (
            <>
              {[1, 2].map((i) => <View key={i} style={styles.skeleton} />)}
            </>
          ) : (
            <View style={styles.emptyWrap}>
              <Feather name="lock" size={32} color={theme.disabled} />
              <Text style={styles.emptyText}>No files in your vault yet. Tap + to encrypt and store one.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Feather name="file-text" size={18} color={theme.accent} />
            </View>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowName} numberOfLines={1}>{item.fileName}</Text>
              <Text style={styles.rowSub}>{fmtSize(item.size)} · {fmtDate(item.createdAt)}</Text>
            </View>
            {busyId === item.id ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <>
                <TouchableOpacity style={styles.iconBtn} onPress={() => handleView(item)} hitSlop={8}>
                  <Feather name="eye" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(item)} hitSlop={8}>
                  <Feather name="trash-2" size={16} color={theme.danger} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      />

      <Modal visible={showWarning} transparent animationType="fade" onRequestClose={dismissWarning}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalIconWrap}>
              <Feather name="shield" size={26} color={theme.accent} />
            </View>
            <Text style={styles.modalTitle}>Only you hold the key</Text>
            <Text style={styles.modalBody}>
              Files here are encrypted on this device before they're ever uploaded — Mneva's servers only ever
              store scrambled data and can't read it, not even for support.{'\n\n'}
              There's no password reset for this. If you lose this device, or reinstall the app without a backup
              of it, files in your Vault can never be recovered.
            </Text>
            <TouchableOpacity style={styles.modalBtn} onPress={dismissWarning}>
              <Text style={styles.modalBtnText}>I understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 12, color: theme.faint, marginTop: 2 },
  addBtnGrad: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },

  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  listContent: { paddingHorizontal: 20 },
  skeleton: { height: 64, backgroundColor: theme.border, borderRadius: 14, marginBottom: 10 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13, color: theme.faint, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20 },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 16, padding: 14, marginBottom: 10 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTextWrap: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  rowSub: { fontSize: 12, color: theme.faint },
  iconBtn: { padding: 8, marginLeft: 4 },

  modalOverlay: { flex: 1, backgroundColor: theme.overlay, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  modalSheet: { width: '100%', backgroundColor: theme.card, borderRadius: 28, padding: 24, alignItems: 'center' },
  modalIconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: theme.text, marginBottom: 10, textAlign: 'center' },
  modalBody: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  modalBtn: { width: '100%', borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: theme.accent },
  modalBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
