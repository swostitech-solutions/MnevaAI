import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, TouchableWithoutFeedback, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';

export default function SmartReplyCard({ notif, onSend, onSkip, emit, on, inline = false }) {
  const [draft, setDraft] = useState(notif?.suggestedReply || '');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(!notif?.suggestedReply);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (notif?.suggestedReply) { setDraft(notif.suggestedReply); setLoading(false); return; }
    let cancelled = false;
    apiFetch('/api/agent/draft', {
      method: 'POST',
      body: {
        subject: notif?.subject || notif?.title || '',
        from: notif?.from || '',
        preview: notif?.body || '',
      },
    })
      .then(r => { if (!cancelled) { setDraft(r.draft || ''); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [notif?.id]);

  useEffect(() => {
    if (!on || !notif?.id) return;
    const offSent = on('gmail:reply_sent', ({ notifId }) => {
      if (notifId !== notif.id) return;
      onSkip?.();
    });
    const offErr = on('gmail:reply_error', ({ notifId }) => {
      if (notifId !== notif.id) return;
      setSending(false);
    });
    return () => { offSent(); offErr(); };
  }, [on, notif?.id]);

  const handleSend = () => {
    if (!draft.trim()) return;
    setSending(true);
    if (emit) {
      emit('gmail:send_reply', {
        emailId: notif.emailId || notif.id,
        recipient: notif.from || '',
        subject: notif.subject || notif.title || '',
        draft,
        notifId: notif.id,
      });
    } else {
      onSend?.(draft);
      setSending(false);
    }
  };

  const content = (
    <View style={inline ? styles.inlineSheet : styles.sheet}>
      {!inline && <View style={styles.handle} />}

      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>🤖 Smart Reply</Text>
        <TouchableOpacity onPress={onSkip}>
          <Feather name="x" size={18} color="#6B7280" />
        </TouchableOpacity>
      </View>
      <Text style={styles.subject} numberOfLines={1}>{notif?.subject || notif?.title}</Text>
      <Text style={styles.from} numberOfLines={1}>From: {notif?.from}</Text>

      {/* Preview */}
      {!!notif?.body && (
        <Text style={styles.preview} numberOfLines={2}>{notif.body}</Text>
      )}

      {/* Draft */}
      <Text style={styles.draftLabel}>SUGGESTED REPLY</Text>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#1F9A5A" />
          <Text style={styles.loadingText}>Generating…</Text>
        </View>
      ) : editing ? (
        <TextInput
          autoFocus
          style={styles.draftInput}
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholderTextColor="#9AA1AE"
        />
      ) : (
        <View style={styles.draftBox}>
          <Text style={styles.draftText}>
            {draft || <Text style={{ color: '#9AA1AE' }}>No draft — tap Edit</Text>}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.sendBtn, (sending || loading || !draft.trim()) && styles.btnDisabled]}
          onPress={handleSend}
          disabled={sending || loading || !draft.trim()}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <><Feather name="send" size={14} color="#fff" /><Text style={styles.sendBtnText}>Send Reply</Text></>
          }
        </TouchableOpacity>
        <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(e => !e)}>
          <Feather name={editing ? 'check' : 'edit-2'} size={14} color="#1F9A5A" />
          <Text style={styles.editBtnText}>{editing ? 'Done' : 'Edit'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
          <Text style={styles.skipBtnText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (inline) return content;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onSkip}>
      <TouchableWithoutFeedback onPress={onSkip}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E3E5EA', marginBottom: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  headerLabel: { fontSize: 13, fontWeight: '700', color: '#1F9A5A' },
  subject: { fontSize: 15, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  from: { fontSize: 12, color: '#6B7280', marginBottom: 8 },
  preview: { fontSize: 12, color: '#9AA1AE', lineHeight: 17, marginBottom: 12 },
  draftLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.8, marginBottom: 6 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  loadingText: { fontSize: 12, color: '#9AA1AE' },
  draftBox: {
    backgroundColor: '#F5F6F8', borderRadius: 12,
    padding: 12, marginBottom: 14, minHeight: 72,
  },
  draftText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  draftInput: {
    backgroundColor: '#F5F6F8', borderRadius: 12,
    padding: 12, marginBottom: 14, minHeight: 80,
    fontSize: 13, color: '#14171F', lineHeight: 20,
    borderWidth: 1, borderColor: '#1F9A5A',
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 8 },
  sendBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#1F9A5A', borderRadius: 12, paddingVertical: 12,
  },
  btnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#1F9A5A',
  },
  editBtnText: { fontSize: 13, fontWeight: '700', color: '#1F9A5A' },
  skipBtn: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, backgroundColor: '#F3F4F6',
  },
  skipBtnText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  inlineSheet: {
    backgroundColor: '#F0FDF6',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(31,154,90,0.2)',
  },
});
