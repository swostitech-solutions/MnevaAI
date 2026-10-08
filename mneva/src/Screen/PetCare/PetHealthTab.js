import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, ActivityIndicator, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { usePet } from './PetContext';
import DateField from '../finance/DateField';

const EMPTY_VACCINE = { name: '', date: '', next: '', status: '', notes: '' };
const EMPTY_MED     = { name: '', dosage: '', freq: '', start: '', end: '', notes: '' };
const EMPTY_VET      = { name: '', clinic: '', phone: '', address: '', lastVisit: '', nextVisit: '' };
const EMPTY_ALLERGY = { name: '', reaction: '' };

const VACCINE_STATUS = ['Up to date', 'Due soon', 'Overdue'];
const statusColor = (s, theme) => s === 'Up to date' ? theme.accent : s === 'Due soon' ? theme.warning : theme.danger;
const statusBg    = (s, theme) => {
  if (s === 'Up to date') return theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6';
  if (s === 'Due soon') return theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7';
  return theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED';
};

export default function PetHealthTab({ horizontalPad, insets }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { activePet, reload } = usePet();
  const [saving, setSaving] = useState(false);

  const [vaccineModal, setVaccineModal] = useState(false);
  const [vForm, setVForm] = useState(EMPTY_VACCINE);
  const [editVaccineId, setEditVaccineId] = useState(null); // null = adding; otherwise the id being edited

  const [medModal, setMedModal] = useState(false);
  const [mForm, setMForm] = useState(EMPTY_MED);
  const [editMedId, setEditMedId] = useState(null);

  const [vetModal, setVetModal] = useState(false);
  const [vetForm, setVetForm] = useState(EMPTY_VET);

  const [allergyModal, setAllergyModal] = useState(false);
  const [aForm, setAForm] = useState(EMPTY_ALLERGY);
  const [editAllergyId, setEditAllergyId] = useState(null);

  const patch = async (field, value) => {
    if (!activePet) return;
    setSaving(true);
    try { await apiFetch(`/api/pet/${activePet.id}`, { method: 'PATCH', body: { [field]: value } }); reload(); }
    catch { /* socket updates */ }
    finally { setSaving(false); }
  };

  const openAddVaccine = () => { setVForm(EMPTY_VACCINE); setEditVaccineId(null); setVaccineModal(true); };
  const openEditVaccine = (v) => { setVForm({ name: v.name || '', date: v.date || '', next: v.next || '', status: v.status || '', notes: v.notes || '' }); setEditVaccineId(v.id); setVaccineModal(true); };
  const closeVaccineModal = () => { setVaccineModal(false); setVForm(EMPTY_VACCINE); setEditVaccineId(null); };

  const addVaccine = async () => {
    if (!vForm.name.trim() || !activePet) return;
    const existing = activePet.vaccines || [];
    const next = editVaccineId
      ? existing.map(x => x.id === editVaccineId ? { ...x, ...vForm } : x)
      : [{ id: Date.now().toString(), ...vForm }, ...existing];
    await patch('vaccines', next);
    closeVaccineModal();
  };

  const deleteVaccine = () => {
    Alert.alert('Delete Vaccination', `Remove "${vForm.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await patch('vaccines', (activePet?.vaccines || []).filter(x => x.id !== editVaccineId));
        closeVaccineModal();
      } },
    ]);
  };

  const openAddMed = () => { setMForm(EMPTY_MED); setEditMedId(null); setMedModal(true); };
  const openEditMed = (m) => { setMForm({ name: m.name || '', dosage: m.dosage || '', freq: m.freq || '', start: m.start || '', end: m.end || '', notes: m.notes || '' }); setEditMedId(m.id); setMedModal(true); };
  const closeMedModal = () => { setMedModal(false); setMForm(EMPTY_MED); setEditMedId(null); };

  const addMed = async () => {
    if (!mForm.name.trim() || !activePet) return;
    const existing = activePet.medications || [];
    const next = editMedId
      ? existing.map(x => x.id === editMedId ? { ...x, ...mForm } : x)
      : [{ id: Date.now().toString(), ...mForm }, ...existing];
    await patch('medications', next);
    closeMedModal();
  };

  const deleteMed = () => {
    Alert.alert('Delete Medication', `Remove "${mForm.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await patch('medications', (activePet?.medications || []).filter(x => x.id !== editMedId));
        closeMedModal();
      } },
    ]);
  };

  const saveVet = async () => {
    if (!vetForm.name.trim() || !activePet) return;
    await patch('vet', vetForm);
    setVetModal(false);
  };

  const deleteVet = () => {
    Alert.alert('Delete Vet Information', `Remove this vet's information? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await patch('vet', null);
        setVetModal(false);
      } },
    ]);
  };

  const openAddAllergy = () => { setAForm(EMPTY_ALLERGY); setEditAllergyId(null); setAllergyModal(true); };
  const openEditAllergy = (a) => { setAForm({ name: a.name || '', reaction: a.reaction || '' }); setEditAllergyId(a.id); setAllergyModal(true); };
  const closeAllergyModal = () => { setAllergyModal(false); setAForm(EMPTY_ALLERGY); setEditAllergyId(null); };

  const addAllergy = async () => {
    if (!aForm.name.trim() || !activePet) return;
    const existing = activePet.allergies || [];
    const next = editAllergyId
      ? existing.map(x => x.id === editAllergyId ? { ...x, ...aForm } : x)
      : [{ id: Date.now().toString(), ...aForm }, ...existing];
    await patch('allergies', next);
    closeAllergyModal();
  };

  const deleteAllergy = () => {
    Alert.alert('Delete Allergy', `Remove "${aForm.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await patch('allergies', (activePet?.allergies || []).filter(x => x.id !== editAllergyId));
        closeAllergyModal();
      } },
    ]);
  };

  const openVetEdit = () => {
    const v = activePet?.vet;
    // Always reset -- otherwise deleting vet info and reopening "Add" would
    // still show the just-deleted values (same bug Feeding had).
    setVetForm({ name: v?.name || '', clinic: v?.clinic || '', phone: v?.phone || '', address: v?.address || '', lastVisit: v?.lastVisit || '', nextVisit: v?.nextVisit || '' });
    setVetModal(true);
  };

  const vaccines  = activePet?.vaccines   || [];
  const meds      = activePet?.medications || [];
  const allergies = activePet?.allergies  || [];
  const vet       = activePet?.vet        || null;

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingHorizontal: horizontalPad, paddingBottom: insets.bottom + 32, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
        {!activePet && <View style={styles.noPetBanner}><Feather name="info" size={14} color={theme.faint} /><Text style={styles.noPetText}>Add a pet profile first to track health records</Text></View>}
        {saving && <View style={styles.savingBar}><ActivityIndicator size="small" color={theme.warning} /><Text style={styles.savingText}>Saving & updating Mneva AI memory...</Text></View>}

        {/* Vaccinations */}
        <SectionHeader label="VACCINATIONS" color={theme.accent} bg={theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6'} onAdd={openAddVaccine} styles={styles} />
        <View style={styles.card}>
          {vaccines.length === 0 ? <EmptyRow icon="shield" text="No vaccinations added" theme={theme} styles={styles} /> : vaccines.map((v, i) => (
            <TouchableOpacity key={v.id} style={[styles.listRow, i < vaccines.length - 1 && styles.divider]} onPress={() => openEditVaccine(v)} activeOpacity={0.7}>
              <View style={[styles.rowIcon, { backgroundColor: statusBg(v.status, theme) }]}><Feather name="shield" size={14} color={statusColor(v.status, theme)} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{v.name}</Text>
                {v.date ? <Text style={styles.rowMeta}>Given: {v.date}</Text> : null}
                {v.next ? <Text style={styles.rowMeta}>Next due: {v.next}</Text> : null}
              </View>
              {v.status ? <View style={[styles.statusTag, { backgroundColor: statusBg(v.status, theme) }]}><Text style={[styles.statusTagText, { color: statusColor(v.status, theme) }]}>{v.status}</Text></View> : null}
              <Feather name="chevron-right" size={16} color={theme.faint} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Medications */}
        <SectionHeader label="MEDICATIONS" color={theme.danger} bg={theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED'} onAdd={openAddMed} styles={styles} />
        <View style={styles.card}>
          {meds.length === 0 ? <EmptyRow icon="activity" text="No medications added" theme={theme} styles={styles} /> : meds.map((m, i) => (
            <TouchableOpacity key={m.id} style={[styles.listRow, i < meds.length - 1 && styles.divider]} onPress={() => openEditMed(m)} activeOpacity={0.7}>
              <View style={[styles.rowIcon, { backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED' }]}><Feather name="activity" size={14} color={theme.danger} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{m.name}</Text>
                <Text style={styles.rowMeta}>{[m.dosage, m.freq].filter(Boolean).join(' · ')}</Text>
                {(m.start || m.end) ? <Text style={styles.rowMeta}>{m.start}{m.end ? ` → ${m.end}` : ''}</Text> : null}
              </View>
              <Feather name="chevron-right" size={16} color={theme.faint} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Vet */}
        <SectionHeader label="VET INFORMATION" color={theme.info} bg={theme.isDark ? 'rgba(107,184,240,0.16)' : '#EAF3FD'} onAdd={openVetEdit} addLabel={vet ? 'Edit' : 'Add'} addIcon={vet ? 'edit-2' : 'plus'} styles={styles} />
        <View style={styles.card}>
          {!vet ? <EmptyRow icon="user" text="No vet info added" theme={theme} styles={styles} /> : (
            [{ label: 'Doctor', value: vet.name, icon: 'user' }, { label: 'Clinic', value: vet.clinic, icon: 'home' }, { label: 'Phone', value: vet.phone, icon: 'phone' }, { label: 'Last Visit', value: vet.lastVisit, icon: 'calendar' }, { label: 'Next Visit', value: vet.nextVisit, icon: 'clock' }]
              .filter(r => r.value).map((row, i, arr) => (
                <View key={i} style={[styles.listRow, i < arr.length - 1 && styles.divider]}>
                  <View style={[styles.rowIcon, { backgroundColor: theme.isDark ? 'rgba(107,184,240,0.16)' : '#EAF3FD' }]}><Feather name={row.icon} size={13} color={theme.info} /></View>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowValue}>{row.value}</Text>
                </View>
              ))
          )}
        </View>

        {/* Allergies */}
        <SectionHeader label="ALLERGIES" color={theme.warning} bg={theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7'} onAdd={openAddAllergy} styles={styles} />
        <View style={styles.card}>
          {allergies.length === 0 ? <EmptyRow icon="alert-triangle" text="No allergies recorded" theme={theme} styles={styles} /> : allergies.map((a, i) => (
            <TouchableOpacity key={a.id} style={[styles.listRow, i < allergies.length - 1 && styles.divider]} onPress={() => openEditAllergy(a)} activeOpacity={0.7}>
              <View style={[styles.rowIcon, { backgroundColor: theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7' }]}><Feather name="alert-triangle" size={14} color={theme.warning} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{a.name}</Text>
                {a.reaction ? <Text style={styles.rowMeta}>{a.reaction}</Text> : null}
              </View>
              <Feather name="chevron-right" size={16} color={theme.faint} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Vaccine Modal */}
      <SheetModal visible={vaccineModal} onClose={closeVaccineModal} insets={insets}
        title={editVaccineId ? 'Edit Vaccination' : 'Add Vaccination'} gradColors={['#1F9A5A', '#3CB37A']} icon="shield" styles={styles}
        onDelete={editVaccineId ? deleteVaccine : null} deleteColor={theme.danger}>
        <Text style={styles.fieldLabel}>Vaccine Name <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Rabies, Parvovirus" placeholderTextColor={theme.placeholder} value={vForm.name} onChangeText={v => setVForm(f => ({ ...f, name: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <DateField
              label="Date Given"
              value={vForm.date}
              onChange={v => setVForm(f => {
                const date = v.slice(0, 10);
                // Next Due can't stay before the new Date Given — clear it
                // rather than silently leave an impossible date behind.
                const next = f.next && f.next < date ? '' : f.next;
                return { ...f, date, next };
              })}
            />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <DateField
              label="Next Due"
              value={vForm.next}
              minimumDate={vForm.date ? new Date(vForm.date) : undefined}
              onChange={v => setVForm(f => ({ ...f, next: v.slice(0, 10) }))}
            />
          </View>
        </View>
        <Text style={styles.fieldLabel}>Status</Text>
        <View style={styles.chipRow}>
          {VACCINE_STATUS.map(s => (
            <TouchableOpacity key={s} style={[styles.chip, vForm.status === s && { backgroundColor: statusBg(s, theme), borderColor: statusColor(s, theme) }]} onPress={() => setVForm(f => ({ ...f, status: s }))}>
              <Text style={[styles.chipText, vForm.status === s && { color: statusColor(s, theme) }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <SaveBtn onPress={addVaccine} disabled={!vForm.name.trim()} colors={['#1F9A5A', '#3CB37A']} label={editVaccineId ? 'Update Vaccination' : 'Save Vaccination'} styles={styles} />
      </SheetModal>

      {/* Med Modal */}
      <SheetModal visible={medModal} onClose={closeMedModal} insets={insets}
        title={editMedId ? 'Edit Medication' : 'Add Medication'} gradColors={['#E0546E', '#C8405A']} icon="activity" styles={styles}
        onDelete={editMedId ? deleteMed : null} deleteColor={theme.danger}>
        <Text style={styles.fieldLabel}>Medicine Name <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Deworming tablet" placeholderTextColor={theme.placeholder} value={mForm.name} onChangeText={v => setMForm(f => ({ ...f, name: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Dosage</Text><TextInput style={styles.input} placeholder="e.g. 1 tablet" placeholderTextColor={theme.placeholder} value={mForm.dosage} onChangeText={v => setMForm(f => ({ ...f, dosage: v }))} /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Frequency</Text><TextInput style={styles.input} placeholder="e.g. Daily" placeholderTextColor={theme.placeholder} value={mForm.freq} onChangeText={v => setMForm(f => ({ ...f, freq: v }))} /></View>
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><DateField label="Start Date" value={mForm.start} onChange={v => setMForm(f => ({ ...f, start: v.slice(0, 10) }))} /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><DateField label="End Date" value={mForm.end} onChange={v => setMForm(f => ({ ...f, end: v.slice(0, 10) }))} /></View>
        </View>
        <SaveBtn onPress={addMed} disabled={!mForm.name.trim()} colors={['#E0546E', '#C8405A']} label={editMedId ? 'Update Medication' : 'Save Medication'} styles={styles} />
      </SheetModal>

      {/* Vet Modal */}
      <SheetModal visible={vetModal} onClose={() => setVetModal(false)} insets={insets} title="Vet Information" gradColors={['#4FA6E8', '#2E86C8']} icon="user" styles={styles}
        onDelete={vet ? deleteVet : null} deleteColor={theme.danger}>
        <Text style={styles.fieldLabel}>Doctor Name <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Dr. Mehta" placeholderTextColor={theme.placeholder} value={vetForm.name} onChangeText={v => setVetForm(f => ({ ...f, name: v }))} />
        <Text style={styles.fieldLabel}>Clinic / Hospital</Text>
        <TextInput style={styles.input} placeholder="e.g. PetCare Clinic" placeholderTextColor={theme.placeholder} value={vetForm.clinic} onChangeText={v => setVetForm(f => ({ ...f, clinic: v }))} />
        <Text style={styles.fieldLabel}>Phone</Text>
        <TextInput style={styles.input} placeholder="+91 98765 43210" placeholderTextColor={theme.placeholder} value={vetForm.phone} onChangeText={v => setVetForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><DateField label="Last Visit" value={vetForm.lastVisit} onChange={v => setVetForm(f => ({ ...f, lastVisit: v.slice(0, 10) }))} /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><DateField label="Next Visit" value={vetForm.nextVisit} onChange={v => setVetForm(f => ({ ...f, nextVisit: v.slice(0, 10) }))} /></View>
        </View>
        <SaveBtn onPress={saveVet} disabled={!vetForm.name.trim()} colors={['#4FA6E8', '#2E86C8']} label="Save Vet Info" styles={styles} />
      </SheetModal>

      {/* Allergy Modal */}
      <SheetModal visible={allergyModal} onClose={closeAllergyModal} insets={insets}
        title={editAllergyId ? 'Edit Allergy' : 'Add Allergy'} gradColors={['#F5A623', '#E8943A']} icon="alert-triangle" styles={styles}
        onDelete={editAllergyId ? deleteAllergy : null} deleteColor={theme.danger}>
        <Text style={styles.fieldLabel}>Allergy / Trigger <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Chicken, Pollen, Dust" placeholderTextColor={theme.placeholder} value={aForm.name} onChangeText={v => setAForm(f => ({ ...f, name: v }))} />
        <Text style={styles.fieldLabel}>Reaction / Symptoms</Text>
        <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="e.g. Skin rash, vomiting..." placeholderTextColor={theme.placeholder} value={aForm.reaction} onChangeText={v => setAForm(f => ({ ...f, reaction: v }))} multiline />
        <SaveBtn onPress={addAllergy} disabled={!aForm.name.trim()} colors={['#F5A623', '#E8943A']} label={editAllergyId ? 'Update Allergy' : 'Save Allergy'} styles={styles} />
      </SheetModal>
    </>
  );
}

function SectionHeader({ label, color, bg, onAdd, addLabel = 'Add', addIcon = 'plus', styles }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <TouchableOpacity style={[styles.sectionAddBtn, { backgroundColor: bg }]} onPress={onAdd}>
        <Feather name={addIcon} size={14} color={color} />
        <Text style={[styles.sectionAddText, { color }]}>{addLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyRow({ icon, text, theme, styles }) {
  return <View style={styles.emptyRow}><Feather name={icon} size={18} color={theme.disabled} /><Text style={styles.emptyRowText}>{text}</Text></View>;
}

function SheetModal({ visible, onClose, insets, title, gradColors, icon, children, styles, onDelete, deleteColor }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <LinearGradient colors={gradColors} style={styles.sheetIcon}><Feather name={icon} size={20} color="#FFFFFF" /></LinearGradient>
            <Text style={[styles.sheetTitle, { flex: 1 }]}>{title}</Text>
            {onDelete && (
              <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
                <Feather name="trash-2" size={18} color={deleteColor} />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SaveBtn({ onPress, disabled, colors, label, styles }) {
  return (
    <TouchableOpacity style={[styles.saveBtn, disabled && styles.saveBtnDisabled]} disabled={disabled} onPress={onPress}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
        <Feather name="check" size={16} color="#FFFFFF" />
        <Text style={styles.saveBtnText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const createStyles = (theme) => StyleSheet.create({
  noPetBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 16 },
  noPetText: { fontSize: 13, color: theme.faint, fontWeight: '600' },
  savingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.isDark ? 'rgba(255,184,77,0.16)' : '#F3EFFE', borderRadius: 10, padding: 10, marginBottom: 12 },
  savingText: { fontSize: 12, color: theme.accentAlt, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.faint, letterSpacing: 0.5 },
  sectionAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  sectionAddText: { fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: theme.card, borderRadius: 18, paddingHorizontal: 14, marginBottom: 20 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: theme.border },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  rowMeta: { fontSize: 12, color: theme.faint },
  rowLabel: { flex: 1, fontSize: 13, color: theme.muted, fontWeight: '600' },
  rowValue: { fontSize: 13, fontWeight: '700', color: theme.text, maxWidth: '55%', textAlign: 'right' },
  statusTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusTagText: { fontSize: 10, fontWeight: '800' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  emptyRowText: { fontSize: 13, color: theme.faint, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  deleteBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED', alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  req: { color: theme.danger },
  input: { backgroundColor: theme.surfaceAlt, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: theme.text, marginBottom: 16 },
  rowFields: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.surfaceAlt, borderWidth: 1.5, borderColor: 'transparent' },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
