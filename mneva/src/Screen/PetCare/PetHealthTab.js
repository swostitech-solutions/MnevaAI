import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch } from '../../api/client';
import { usePet } from '../PetCare';

const VACCINE_STATUS = ['Up to date', 'Due soon', 'Overdue'];
const statusColor = (s) => s === 'Up to date' ? '#1F9A5A' : s === 'Due soon' ? '#D97706' : '#E0546E';
const statusBg    = (s) => s === 'Up to date' ? '#EFFDF6' : s === 'Due soon' ? '#FEF3C7' : '#FCEAED';

export default function PetHealthTab({ horizontalPad, insets }) {
  const { activePet, reload } = usePet();
  const [saving, setSaving] = useState(false);

  const [vaccineModal, setVaccineModal] = useState(false);
  const [vForm, setVForm] = useState({ name: '', date: '', next: '', status: '', notes: '' });

  const [medModal, setMedModal] = useState(false);
  const [mForm, setMForm] = useState({ name: '', dosage: '', freq: '', start: '', end: '', notes: '' });

  const [vetModal, setVetModal] = useState(false);
  const [vetForm, setVetForm] = useState({ name: '', clinic: '', phone: '', address: '', lastVisit: '', nextVisit: '' });

  const [allergyModal, setAllergyModal] = useState(false);
  const [aForm, setAForm] = useState({ name: '', reaction: '' });

  const patch = async (field, value) => {
    if (!activePet) return;
    setSaving(true);
    try { await apiFetch(`/api/pet/${activePet.id}`, { method: 'PATCH', body: { [field]: value } }); reload(); }
    catch { /* socket updates */ }
    finally { setSaving(false); }
  };

  const addVaccine = async () => {
    if (!vForm.name.trim() || !activePet) return;
    await patch('vaccines', [{ id: Date.now().toString(), ...vForm }, ...(activePet.vaccines || [])]);
    setVForm({ name: '', date: '', next: '', status: '', notes: '' });
    setVaccineModal(false);
  };

  const addMed = async () => {
    if (!mForm.name.trim() || !activePet) return;
    await patch('medications', [{ id: Date.now().toString(), ...mForm }, ...(activePet.medications || [])]);
    setMForm({ name: '', dosage: '', freq: '', start: '', end: '', notes: '' });
    setMedModal(false);
  };

  const saveVet = async () => {
    if (!vetForm.name.trim() || !activePet) return;
    await patch('vet', vetForm);
    setVetModal(false);
  };

  const addAllergy = async () => {
    if (!aForm.name.trim() || !activePet) return;
    await patch('allergies', [{ id: Date.now().toString(), ...aForm }, ...(activePet.allergies || [])]);
    setAForm({ name: '', reaction: '' });
    setAllergyModal(false);
  };

  const openVetEdit = () => {
    if (activePet?.vet) setVetForm({ name: activePet.vet.name || '', clinic: activePet.vet.clinic || '', phone: activePet.vet.phone || '', address: activePet.vet.address || '', lastVisit: activePet.vet.lastVisit || '', nextVisit: activePet.vet.nextVisit || '' });
    setVetModal(true);
  };

  const vaccines  = activePet?.vaccines   || [];
  const meds      = activePet?.medications || [];
  const allergies = activePet?.allergies  || [];
  const vet       = activePet?.vet        || null;

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingHorizontal: horizontalPad, paddingBottom: insets.bottom + 32, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
        {!activePet && <View style={styles.noPetBanner}><Feather name="info" size={14} color="#9AA1AE" /><Text style={styles.noPetText}>Add a pet profile first to track health records</Text></View>}
        {saving && <View style={styles.savingBar}><ActivityIndicator size="small" color="#F5A623" /><Text style={styles.savingText}>Saving & updating Mneva AI memory...</Text></View>}

        {/* Vaccinations */}
        <SectionHeader label="VACCINATIONS" color="#1F9A5A" bg="#EFFDF6" onAdd={() => setVaccineModal(true)} />
        <View style={styles.card}>
          {vaccines.length === 0 ? <EmptyRow icon="shield" text="No vaccinations added" /> : vaccines.map((v, i) => (
            <View key={v.id} style={[styles.listRow, i < vaccines.length - 1 && styles.divider]}>
              <View style={[styles.rowIcon, { backgroundColor: statusBg(v.status) }]}><Feather name="shield" size={14} color={statusColor(v.status)} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{v.name}</Text>
                {v.date ? <Text style={styles.rowMeta}>Given: {v.date}</Text> : null}
                {v.next ? <Text style={styles.rowMeta}>Next due: {v.next}</Text> : null}
              </View>
              {v.status ? <View style={[styles.statusTag, { backgroundColor: statusBg(v.status) }]}><Text style={[styles.statusTagText, { color: statusColor(v.status) }]}>{v.status}</Text></View> : null}
              <TouchableOpacity onPress={() => patch('vaccines', vaccines.filter(x => x.id !== v.id))} style={{ padding: 4, marginLeft: 6 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Medications */}
        <SectionHeader label="MEDICATIONS" color="#E0546E" bg="#FCEAED" onAdd={() => setMedModal(true)} />
        <View style={styles.card}>
          {meds.length === 0 ? <EmptyRow icon="activity" text="No medications added" /> : meds.map((m, i) => (
            <View key={m.id} style={[styles.listRow, i < meds.length - 1 && styles.divider]}>
              <View style={[styles.rowIcon, { backgroundColor: '#FCEAED' }]}><Feather name="activity" size={14} color="#E0546E" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{m.name}</Text>
                <Text style={styles.rowMeta}>{[m.dosage, m.freq].filter(Boolean).join(' · ')}</Text>
                {(m.start || m.end) ? <Text style={styles.rowMeta}>{m.start}{m.end ? ` → ${m.end}` : ''}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => patch('medications', meds.filter(x => x.id !== m.id))} style={{ padding: 4 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Vet */}
        <SectionHeader label="VET INFORMATION" color="#4FA6E8" bg="#EAF3FD" onAdd={openVetEdit} addLabel={vet ? 'Edit' : 'Add'} addIcon={vet ? 'edit-2' : 'plus'} />
        <View style={styles.card}>
          {!vet ? <EmptyRow icon="user" text="No vet info added" /> : (
            [{ label: 'Doctor', value: vet.name, icon: 'user' }, { label: 'Clinic', value: vet.clinic, icon: 'home' }, { label: 'Phone', value: vet.phone, icon: 'phone' }, { label: 'Last Visit', value: vet.lastVisit, icon: 'calendar' }, { label: 'Next Visit', value: vet.nextVisit, icon: 'clock' }]
              .filter(r => r.value).map((row, i, arr) => (
                <View key={i} style={[styles.listRow, i < arr.length - 1 && styles.divider]}>
                  <View style={[styles.rowIcon, { backgroundColor: '#EAF3FD' }]}><Feather name={row.icon} size={13} color="#4FA6E8" /></View>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowValue}>{row.value}</Text>
                </View>
              ))
          )}
        </View>

        {/* Allergies */}
        <SectionHeader label="ALLERGIES" color="#D97706" bg="#FEF3C7" onAdd={() => setAllergyModal(true)} />
        <View style={styles.card}>
          {allergies.length === 0 ? <EmptyRow icon="alert-triangle" text="No allergies recorded" /> : allergies.map((a, i) => (
            <View key={a.id} style={[styles.listRow, i < allergies.length - 1 && styles.divider]}>
              <View style={[styles.rowIcon, { backgroundColor: '#FEF3C7' }]}><Feather name="alert-triangle" size={14} color="#D97706" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{a.name}</Text>
                {a.reaction ? <Text style={styles.rowMeta}>{a.reaction}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => patch('allergies', allergies.filter(x => x.id !== a.id))} style={{ padding: 4 }}><Feather name="x" size={14} color="#9AA1AE" /></TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Vaccine Modal */}
      <SheetModal visible={vaccineModal} onClose={() => setVaccineModal(false)} insets={insets} title="Add Vaccination" gradColors={['#1F9A5A', '#3CB37A']} icon="shield">
        <Text style={styles.fieldLabel}>Vaccine Name <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Rabies, Parvovirus" placeholderTextColor="#9AA1AE" value={vForm.name} onChangeText={v => setVForm(f => ({ ...f, name: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Date Given</Text><TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={vForm.date} onChangeText={v => setVForm(f => ({ ...f, date: v }))} keyboardType="numeric" /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Next Due</Text><TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={vForm.next} onChangeText={v => setVForm(f => ({ ...f, next: v }))} keyboardType="numeric" /></View>
        </View>
        <Text style={styles.fieldLabel}>Status</Text>
        <View style={styles.chipRow}>
          {VACCINE_STATUS.map(s => (
            <TouchableOpacity key={s} style={[styles.chip, vForm.status === s && { backgroundColor: statusBg(s), borderColor: statusColor(s) }]} onPress={() => setVForm(f => ({ ...f, status: s }))}>
              <Text style={[styles.chipText, vForm.status === s && { color: statusColor(s) }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <SaveBtn onPress={addVaccine} disabled={!vForm.name.trim()} colors={['#1F9A5A', '#3CB37A']} label="Save Vaccination" />
      </SheetModal>

      {/* Med Modal */}
      <SheetModal visible={medModal} onClose={() => setMedModal(false)} insets={insets} title="Add Medication" gradColors={['#E0546E', '#C8405A']} icon="activity">
        <Text style={styles.fieldLabel}>Medicine Name <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Deworming tablet" placeholderTextColor="#9AA1AE" value={mForm.name} onChangeText={v => setMForm(f => ({ ...f, name: v }))} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Dosage</Text><TextInput style={styles.input} placeholder="e.g. 1 tablet" placeholderTextColor="#9AA1AE" value={mForm.dosage} onChangeText={v => setMForm(f => ({ ...f, dosage: v }))} /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Frequency</Text><TextInput style={styles.input} placeholder="e.g. Daily" placeholderTextColor="#9AA1AE" value={mForm.freq} onChangeText={v => setMForm(f => ({ ...f, freq: v }))} /></View>
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Start Date</Text><TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={mForm.start} onChangeText={v => setMForm(f => ({ ...f, start: v }))} keyboardType="numeric" /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>End Date</Text><TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={mForm.end} onChangeText={v => setMForm(f => ({ ...f, end: v }))} keyboardType="numeric" /></View>
        </View>
        <SaveBtn onPress={addMed} disabled={!mForm.name.trim()} colors={['#E0546E', '#C8405A']} label="Save Medication" />
      </SheetModal>

      {/* Vet Modal */}
      <SheetModal visible={vetModal} onClose={() => setVetModal(false)} insets={insets} title="Vet Information" gradColors={['#4FA6E8', '#2E86C8']} icon="user">
        <Text style={styles.fieldLabel}>Doctor Name <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Dr. Mehta" placeholderTextColor="#9AA1AE" value={vetForm.name} onChangeText={v => setVetForm(f => ({ ...f, name: v }))} />
        <Text style={styles.fieldLabel}>Clinic / Hospital</Text>
        <TextInput style={styles.input} placeholder="e.g. PetCare Clinic" placeholderTextColor="#9AA1AE" value={vetForm.clinic} onChangeText={v => setVetForm(f => ({ ...f, clinic: v }))} />
        <Text style={styles.fieldLabel}>Phone</Text>
        <TextInput style={styles.input} placeholder="+91 98765 43210" placeholderTextColor="#9AA1AE" value={vetForm.phone} onChangeText={v => setVetForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Last Visit</Text><TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={vetForm.lastVisit} onChangeText={v => setVetForm(f => ({ ...f, lastVisit: v }))} keyboardType="numeric" /></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Next Visit</Text><TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={vetForm.nextVisit} onChangeText={v => setVetForm(f => ({ ...f, nextVisit: v }))} keyboardType="numeric" /></View>
        </View>
        <SaveBtn onPress={saveVet} disabled={!vetForm.name.trim()} colors={['#4FA6E8', '#2E86C8']} label="Save Vet Info" />
      </SheetModal>

      {/* Allergy Modal */}
      <SheetModal visible={allergyModal} onClose={() => setAllergyModal(false)} insets={insets} title="Add Allergy" gradColors={['#F5A623', '#E8943A']} icon="alert-triangle">
        <Text style={styles.fieldLabel}>Allergy / Trigger <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Chicken, Pollen, Dust" placeholderTextColor="#9AA1AE" value={aForm.name} onChangeText={v => setAForm(f => ({ ...f, name: v }))} />
        <Text style={styles.fieldLabel}>Reaction / Symptoms</Text>
        <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="e.g. Skin rash, vomiting..." placeholderTextColor="#9AA1AE" value={aForm.reaction} onChangeText={v => setAForm(f => ({ ...f, reaction: v }))} multiline />
        <SaveBtn onPress={addAllergy} disabled={!aForm.name.trim()} colors={['#F5A623', '#E8943A']} label="Save Allergy" />
      </SheetModal>
    </>
  );
}

function SectionHeader({ label, color, bg, onAdd, addLabel = 'Add', addIcon = 'plus' }) {
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

function EmptyRow({ icon, text }) {
  return <View style={styles.emptyRow}><Feather name={icon} size={18} color="#C7CBD3" /><Text style={styles.emptyRowText}>{text}</Text></View>;
}

function SheetModal({ visible, onClose, insets, title, gradColors, icon, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={onClose}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <LinearGradient colors={gradColors} style={styles.sheetIcon}><Feather name={icon} size={20} color="#FFFFFF" /></LinearGradient>
            <Text style={styles.sheetTitle}>{title}</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SaveBtn({ onPress, disabled, colors, label }) {
  return (
    <TouchableOpacity style={[styles.saveBtn, disabled && styles.saveBtnDisabled]} disabled={disabled} onPress={onPress}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
        <Feather name="check" size={16} color="#FFFFFF" />
        <Text style={styles.saveBtnText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  noPetBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F6F8', borderRadius: 12, padding: 12, marginBottom: 16 },
  noPetText: { fontSize: 13, color: '#9AA1AE', fontWeight: '600' },
  savingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3EFFE', borderRadius: 10, padding: 10, marginBottom: 12 },
  savingText: { fontSize: 12, color: '#7C3AED', fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5 },
  sectionAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  sectionAddText: { fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, marginBottom: 20 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  rowMeta: { fontSize: 12, color: '#9AA1AE' },
  rowLabel: { flex: 1, fontSize: 13, color: '#6B7280', fontWeight: '600' },
  rowValue: { fontSize: 13, fontWeight: '700', color: '#14171F', maxWidth: '55%', textAlign: 'right' },
  statusTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusTagText: { fontSize: 10, fontWeight: '800' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  emptyRowText: { fontSize: 13, color: '#9AA1AE', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(14,17,26,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E5EA', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  req: { color: '#E0546E' },
  input: { backgroundColor: '#F5F6F8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: '#14171F', marginBottom: 16 },
  rowFields: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F5F6F8', borderWidth: 1.5, borderColor: 'transparent' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
