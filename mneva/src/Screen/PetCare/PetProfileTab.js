import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { usePet } from './PetContext';

const SPECIES    = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish', 'Other'];
const SEX        = ['Male', 'Female'];
const COAT_TYPES = ['Short', 'Long', 'Curly', 'Wavy', 'Hairless'];
const SPECIES_EMOJI = { Dog: '🐶', Cat: '🐱', Bird: '🐦', Rabbit: '🐰', Fish: '🐟', Other: '🐾' };

const EMPTY = { name: '', species: '', breed: '', sex: '', dob: '', microchip: '', weight: '', height: '', coatType: '', colorMarkings: '' };

const calcAge = (dobStr) => {
  if (!dobStr) return null;
  const parts = dobStr.split('/');
  if (parts.length !== 3) return null;
  const birth = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  if (isNaN(birth)) return null;
  const totalMonths = (new Date().getFullYear() - birth.getFullYear()) * 12 + (new Date().getMonth() - birth.getMonth());
  return totalMonths < 12 ? `${totalMonths} months` : `${Math.floor(totalMonths / 12)} yrs ${totalMonths % 12} mo`;
};

export default function PetProfileTab({ horizontalPad, insets }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { pets, activePet, setActivePet, loading, reload } = usePet();
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = !!activePet;

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canSave = form.name.trim() && form.species;

  const openAdd  = () => { setForm(EMPTY); setModal(true); };
  const openEdit = () => {
    if (!activePet) return;
    setForm({ name: activePet.name, species: activePet.species, breed: activePet.breed || '', sex: activePet.sex || '', dob: activePet.dob || '', microchip: activePet.microchip || '', weight: activePet.weight || '', height: activePet.height || '', coatType: activePet.coatType || '', colorMarkings: activePet.colorMarkings || '' });
    setModal(true);
  };

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isEdit && activePet) {
        await apiFetch(`/api/pet/${activePet.id}`, { method: 'PATCH', body: form });
      } else {
        await apiFetch('/api/pet', { method: 'POST', body: form });
      }
      setModal(false);
      reload();
    } catch { /* socket updates state */ }
    finally { setSaving(false); }
  };

  const deletePet = async () => {
    if (!activePet) return;
    try { await apiFetch(`/api/pet/${activePet.id}`, { method: 'DELETE' }); }
    catch { /* socket updates */ }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.warning} /></View>;

  return (
    <>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: horizontalPad, paddingBottom: insets.bottom + 32, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {/* AI memory badge */}
        {activePet && (
          <View style={styles.memoryBadge}>
            <Feather name="cpu" size={12} color={theme.accentAlt} />
            <Text style={styles.memoryBadgeText}>Mneva AI knows about {activePet.name}. Ask "What does my pet eat?" in chat.</Text>
          </View>
        )}

        {!activePet ? (
          <View style={styles.emptyWrap}>
            <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={styles.emptyIcon}>
              <Feather name="heart" size={32} color={theme.warning} />
            </LinearGradient>
            <Text style={styles.emptyTitle}>No pet added yet</Text>
            <Text style={styles.emptySubtitle}>Add your pet's profile — Mneva AI will remember everything</Text>
            <TouchableOpacity style={styles.addPetBtn} onPress={openAdd}>
              <LinearGradient colors={['#F5A623', '#E8943A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.addPetBtnGrad}>
                <Feather name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.addPetBtnText}>Add Pet Profile</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.petAvatarCard}>
              <LinearGradient colors={['#F5A623', '#E8943A']} style={styles.petAvatar}>
                <Text style={styles.petAvatarEmoji}>{SPECIES_EMOJI[activePet.species] || '🐾'}</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.petName}>{activePet.name}</Text>
                <Text style={styles.petBreed}>{activePet.breed || activePet.species}{activePet.sex ? ` · ${activePet.sex}` : ''}</Text>
                {activePet.dob ? <Text style={styles.petAge}>{calcAge(activePet.dob)} old</Text> : null}
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={openEdit}>
                <Feather name="edit-2" size={16} color={theme.warning} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.editBtn, { backgroundColor: (theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED'), marginLeft: 6 }]} onPress={deletePet}>
                <Feather name="trash-2" size={16} color={theme.danger} />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>BASIC INFORMATION</Text>
            <View style={styles.infoCard}>
              {[
                { label: 'Species', value: activePet.species, icon: 'tag' },
                { label: 'Breed', value: activePet.breed, icon: 'info' },
                { label: 'Sex', value: activePet.sex, icon: 'user' },
                { label: 'Date of Birth', value: activePet.dob, icon: 'calendar' },
                { label: 'Age', value: calcAge(activePet.dob), icon: 'clock' },
                { label: 'Microchip / ID', value: activePet.microchip, icon: 'shield' },
              ].filter(r => r.value).map((row, i, arr) => (
                <View key={i} style={[styles.infoRow, i < arr.length - 1 && styles.infoRowDivider]}>
                  <View style={styles.infoIconWrap}><Feather name={row.icon} size={13} color={theme.muted} /></View>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value}</Text>
                </View>
              ))}
            </View>

            {(activePet.weight || activePet.height || activePet.coatType || activePet.colorMarkings) && (
              <>
                <Text style={styles.sectionLabel}>PHYSICAL INFORMATION</Text>
                <View style={styles.infoCard}>
                  {[
                    { label: 'Weight', value: activePet.weight, icon: 'bar-chart-2' },
                    { label: 'Height / Size', value: activePet.height, icon: 'maximize-2' },
                    { label: 'Coat Type', value: activePet.coatType, icon: 'wind' },
                    { label: 'Color / Markings', value: activePet.colorMarkings, icon: 'droplet' },
                  ].filter(r => r.value).map((row, i, arr) => (
                    <View key={i} style={[styles.infoRow, i < arr.length - 1 && styles.infoRowDivider]}>
                      <View style={styles.infoIconWrap}><Feather name={row.icon} size={13} color={theme.muted} /></View>
                      <Text style={styles.infoLabel}>{row.label}</Text>
                      <Text style={styles.infoValue}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Add another pet */}
            <TouchableOpacity style={styles.addAnotherBtn} onPress={openAdd}>
              <Feather name="plus" size={14} color={theme.warning} />
              <Text style={styles.addAnotherText}>Add another pet</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <LinearGradient colors={['#F5A623', '#E8943A']} style={styles.sheetIcon}>
                <Feather name="heart" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{isEdit ? 'Edit Pet Profile' : 'Add Pet Profile'}</Text>
                <Text style={styles.sheetSubtitle}>Mneva AI will remember this</Text>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Pet Name <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="e.g. Bruno, Whiskers" placeholderTextColor={theme.faint} value={form.name} onChangeText={v => setField('name', v)} />

              <Text style={styles.fieldLabel}>Species <Text style={styles.req}>*</Text></Text>
              <View style={styles.chipRow}>
                {SPECIES.map(s => (
                  <TouchableOpacity key={s} style={[styles.chip, form.species === s && styles.chipActive]} onPress={() => setField('species', s)}>
                    <Text style={[styles.chipText, form.species === s && styles.chipTextActive]}>{SPECIES_EMOJI[s]} {s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Breed</Text>
              <TextInput style={styles.input} placeholder="e.g. Labrador, Persian" placeholderTextColor={theme.faint} value={form.breed} onChangeText={v => setField('breed', v)} />

              <Text style={styles.fieldLabel}>Sex</Text>
              <View style={styles.chipRow}>
                {SEX.map(s => (
                  <TouchableOpacity key={s} style={[styles.chip, form.sex === s && styles.chipActive]} onPress={() => setField('sex', s)}>
                    <Text style={[styles.chipText, form.sex === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Date of Birth</Text>
                  <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor={theme.faint} value={form.dob} onChangeText={v => setField('dob', v)} keyboardType="numeric" />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Microchip / ID</Text>
                  <TextInput style={styles.input} placeholder="Optional" placeholderTextColor={theme.faint} value={form.microchip} onChangeText={v => setField('microchip', v)} />
                </View>
              </View>

              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Weight</Text>
                  <TextInput style={styles.input} placeholder="e.g. 12 kg" placeholderTextColor={theme.faint} value={form.weight} onChangeText={v => setField('weight', v)} />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Height / Size</Text>
                  <TextInput style={styles.input} placeholder="e.g. Medium" placeholderTextColor={theme.faint} value={form.height} onChangeText={v => setField('height', v)} />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Coat Type</Text>
              <View style={styles.chipRow}>
                {COAT_TYPES.map(c => (
                  <TouchableOpacity key={c} style={[styles.chip, form.coatType === c && styles.chipActive]} onPress={() => setField('coatType', c)}>
                    <Text style={[styles.chipText, form.coatType === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Color / Markings</Text>
              <TextInput style={styles.input} placeholder="e.g. Golden with white patch" placeholderTextColor={theme.faint} value={form.colorMarkings} onChangeText={v => setField('colorMarkings', v)} />

              <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]} disabled={!canSave || saving} onPress={save}>
                <LinearGradient colors={['#F5A623', '#E8943A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                  {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                  <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save & Teach Mneva AI'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const createStyles = (theme) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  memoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE'), borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  memoryBadgeText: { fontSize: 12, color: theme.accentAlt, fontWeight: '600', flex: 1 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.text },
  emptySubtitle: { fontSize: 13, color: theme.faint, textAlign: 'center' },
  addPetBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  addPetBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 14 },
  addPetBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  petAvatarCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 20, padding: 16, marginBottom: 20, gap: 14 },
  petAvatar: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  petAvatarEmoji: { fontSize: 28 },
  petName: { fontSize: 18, fontWeight: '800', color: theme.text },
  petBreed: { fontSize: 13, color: theme.muted, marginTop: 2 },
  petAge: { fontSize: 12, color: theme.warning, fontWeight: '700', marginTop: 2 },
  editBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: (theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7'), alignItems: 'center', justifyContent: 'center' },
  addAnotherBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: theme.warning, borderStyle: 'dashed', marginTop: 4 },
  addAnotherText: { fontSize: 13, fontWeight: '700', color: theme.warning },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.faint, letterSpacing: 0.5, marginBottom: 10 },
  infoCard: { backgroundColor: theme.card, borderRadius: 18, paddingHorizontal: 16, marginBottom: 20 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  infoRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },
  infoIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { flex: 1, fontSize: 13, color: theme.muted, fontWeight: '600' },
  infoValue: { fontSize: 13, fontWeight: '700', color: theme.text, maxWidth: '55%', textAlign: 'right' },
  overlay: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  sheetSubtitle: { fontSize: 12, color: theme.faint, marginTop: 2 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  req: { color: theme.danger },
  input: { backgroundColor: theme.surfaceAlt, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: theme.text, marginBottom: 16 },
  rowFields: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.surfaceAlt, borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { backgroundColor: (theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7'), borderColor: theme.warning },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  chipTextActive: { color: theme.warning },
  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
