import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const VACCINE_STATUS = ['Up to date', 'Due soon', 'Overdue'];

export default function PetHealthTab({ pet, horizontalPad, insets }) {
  // Vaccines
  const [vaccines, setVaccines] = useState([]);
  const [vaccineModal, setVaccineModal] = useState(false);
  const [vaccineName, setVaccineName] = useState('');
  const [vaccineDate, setVaccineDate] = useState('');
  const [vaccineNext, setVaccineNext] = useState('');
  const [vaccineStatus, setVaccineStatus] = useState('');
  const [vaccineNotes, setVaccineNotes] = useState('');

  // Medications
  const [meds, setMeds] = useState([]);
  const [medModal, setMedModal] = useState(false);
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medFreq, setMedFreq] = useState('');
  const [medStart, setMedStart] = useState('');
  const [medEnd, setMedEnd] = useState('');
  const [medNotes, setMedNotes] = useState('');

  // Vet
  const [vet, setVet] = useState(null);
  const [vetModal, setVetModal] = useState(false);
  const [vetName, setVetName] = useState('');
  const [vetClinic, setVetClinic] = useState('');
  const [vetPhone, setVetPhone] = useState('');
  const [vetAddress, setVetAddress] = useState('');
  const [vetLastVisit, setVetLastVisit] = useState('');
  const [vetNextVisit, setVetNextVisit] = useState('');

  // Allergies
  const [allergies, setAllergies] = useState([]);
  const [allergyModal, setAllergyModal] = useState(false);
  const [allergyName, setAllergyName] = useState('');
  const [allergyReaction, setAllergyReaction] = useState('');

  const statusColor = (s) => s === 'Up to date' ? '#1F9A5A' : s === 'Due soon' ? '#D97706' : '#E0546E';
  const statusBg = (s) => s === 'Up to date' ? '#EFFDF6' : s === 'Due soon' ? '#FEF3C7' : '#FCEAED';

  const saveVaccine = () => {
    if (!vaccineName.trim()) return;
    setVaccines(p => [{ id: Date.now().toString(), name: vaccineName.trim(), date: vaccineDate.trim(), next: vaccineNext.trim(), status: vaccineStatus, notes: vaccineNotes.trim() }, ...p]);
    setVaccineName(''); setVaccineDate(''); setVaccineNext(''); setVaccineStatus(''); setVaccineNotes('');
    setVaccineModal(false);
  };

  const saveMed = () => {
    if (!medName.trim()) return;
    setMeds(p => [{ id: Date.now().toString(), name: medName.trim(), dosage: medDosage.trim(), freq: medFreq.trim(), start: medStart.trim(), end: medEnd.trim(), notes: medNotes.trim() }, ...p]);
    setMedName(''); setMedDosage(''); setMedFreq(''); setMedStart(''); setMedEnd(''); setMedNotes('');
    setMedModal(false);
  };

  const saveVet = () => {
    if (!vetName.trim()) return;
    setVet({ name: vetName.trim(), clinic: vetClinic.trim(), phone: vetPhone.trim(), address: vetAddress.trim(), lastVisit: vetLastVisit.trim(), nextVisit: vetNextVisit.trim() });
    setVetModal(false);
  };

  const saveAllergy = () => {
    if (!allergyName.trim()) return;
    setAllergies(p => [{ id: Date.now().toString(), name: allergyName.trim(), reaction: allergyReaction.trim() }, ...p]);
    setAllergyName(''); setAllergyReaction('');
    setAllergyModal(false);
  };

  const NoPetBanner = () => (
    <View style={styles.noPetBanner}>
      <Feather name="info" size={14} color="#9AA1AE" />
      <Text style={styles.noPetText}>Add a pet profile first to track health records</Text>
    </View>
  );

  return (
    <>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: horizontalPad, paddingBottom: insets.bottom + 32, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {!pet && <NoPetBanner />}

        {/* Vaccinations */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>VACCINATIONS</Text>
          <TouchableOpacity style={styles.sectionAddBtn} onPress={() => setVaccineModal(true)}>
            <Feather name="plus" size={14} color="#1F9A5A" />
            <Text style={styles.sectionAddText}>Add</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {vaccines.length === 0 ? (
            <EmptyRow icon="shield" text="No vaccinations added" />
          ) : vaccines.map((v, i) => (
            <View key={v.id} style={[styles.listRow, i < vaccines.length - 1 && styles.listRowDivider]}>
              <View style={[styles.rowIcon, { backgroundColor: statusBg(v.status) }]}>
                <Feather name="shield" size={14} color={statusColor(v.status)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{v.name}</Text>
                {v.date ? <Text style={styles.rowMeta}>Given: {v.date}</Text> : null}
                {v.next ? <Text style={styles.rowMeta}>Next due: {v.next}</Text> : null}
              </View>
              {v.status ? (
                <View style={[styles.statusTag, { backgroundColor: statusBg(v.status) }]}>
                  <Text style={[styles.statusTagText, { color: statusColor(v.status) }]}>{v.status}</Text>
                </View>
              ) : null}
              <TouchableOpacity onPress={() => setVaccines(p => p.filter(x => x.id !== v.id))} style={{ padding: 4, marginLeft: 6 }}>
                <Feather name="x" size={14} color="#9AA1AE" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Medications */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>MEDICATIONS</Text>
          <TouchableOpacity style={styles.sectionAddBtn} onPress={() => setMedModal(true)}>
            <Feather name="plus" size={14} color="#E0546E" />
            <Text style={[styles.sectionAddText, { color: '#E0546E' }]}>Add</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {meds.length === 0 ? (
            <EmptyRow icon="activity" text="No medications added" />
          ) : meds.map((m, i) => (
            <View key={m.id} style={[styles.listRow, i < meds.length - 1 && styles.listRowDivider]}>
              <View style={[styles.rowIcon, { backgroundColor: '#FCEAED' }]}>
                <Feather name="activity" size={14} color="#E0546E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{m.name}</Text>
                <Text style={styles.rowMeta}>{[m.dosage, m.freq].filter(Boolean).join(' · ')}</Text>
                {(m.start || m.end) ? <Text style={styles.rowMeta}>{m.start}{m.end ? ` → ${m.end}` : ''}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setMeds(p => p.filter(x => x.id !== m.id))} style={{ padding: 4 }}>
                <Feather name="x" size={14} color="#9AA1AE" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Vet */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>VET INFORMATION</Text>
          <TouchableOpacity style={[styles.sectionAddBtn, { backgroundColor: '#EAF3FD' }]} onPress={() => {
            if (vet) { setVetName(vet.name); setVetClinic(vet.clinic); setVetPhone(vet.phone); setVetAddress(vet.address); setVetLastVisit(vet.lastVisit); setVetNextVisit(vet.nextVisit); }
            setVetModal(true);
          }}>
            <Feather name={vet ? 'edit-2' : 'plus'} size={14} color="#4FA6E8" />
            <Text style={[styles.sectionAddText, { color: '#4FA6E8' }]}>{vet ? 'Edit' : 'Add'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {!vet ? (
            <EmptyRow icon="user" text="No vet info added" />
          ) : (
            [
              { label: 'Doctor', value: vet.name, icon: 'user' },
              { label: 'Clinic', value: vet.clinic, icon: 'home' },
              { label: 'Phone', value: vet.phone, icon: 'phone' },
              { label: 'Address', value: vet.address, icon: 'map-pin' },
              { label: 'Last Visit', value: vet.lastVisit, icon: 'calendar' },
              { label: 'Next Visit', value: vet.nextVisit, icon: 'clock' },
            ].filter(r => r.value).map((row, i, arr) => (
              <View key={i} style={[styles.listRow, i < arr.length - 1 && styles.listRowDivider]}>
                <View style={[styles.rowIcon, { backgroundColor: '#EAF3FD' }]}>
                  <Feather name={row.icon} size={13} color="#4FA6E8" />
                </View>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))
          )}
        </View>

        {/* Allergies */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>ALLERGIES</Text>
          <TouchableOpacity style={[styles.sectionAddBtn, { backgroundColor: '#FEF3C7' }]} onPress={() => setAllergyModal(true)}>
            <Feather name="plus" size={14} color="#D97706" />
            <Text style={[styles.sectionAddText, { color: '#D97706' }]}>Add</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {allergies.length === 0 ? (
            <EmptyRow icon="alert-triangle" text="No allergies recorded" />
          ) : allergies.map((a, i) => (
            <View key={a.id} style={[styles.listRow, i < allergies.length - 1 && styles.listRowDivider]}>
              <View style={[styles.rowIcon, { backgroundColor: '#FEF3C7' }]}>
                <Feather name="alert-triangle" size={14} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{a.name}</Text>
                {a.reaction ? <Text style={styles.rowMeta}>{a.reaction}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setAllergies(p => p.filter(x => x.id !== a.id))} style={{ padding: 4 }}>
                <Feather name="x" size={14} color="#9AA1AE" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Vaccine Modal */}
      <SheetModal visible={vaccineModal} onClose={() => setVaccineModal(false)} insets={insets}
        title="Add Vaccination" subtitle="Record vaccine details" gradColors={['#1F9A5A', '#3CB37A']} icon="shield">
        <Text style={styles.fieldLabel}>Vaccine Name <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Rabies, Parvovirus" placeholderTextColor="#9AA1AE" value={vaccineName} onChangeText={setVaccineName} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Date Given</Text>
            <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={vaccineDate} onChangeText={setVaccineDate} keyboardType="numeric" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Next Due</Text>
            <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={vaccineNext} onChangeText={setVaccineNext} keyboardType="numeric" />
          </View>
        </View>
        <Text style={styles.fieldLabel}>Status</Text>
        <View style={styles.chipRow}>
          {VACCINE_STATUS.map(s => (
            <TouchableOpacity key={s} style={[styles.chip, vaccineStatus === s && { backgroundColor: statusBg(s), borderColor: statusColor(s) }]} onPress={() => setVaccineStatus(s)}>
              <Text style={[styles.chipText, vaccineStatus === s && { color: statusColor(s) }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput style={styles.input} placeholder="Any notes..." placeholderTextColor="#9AA1AE" value={vaccineNotes} onChangeText={setVaccineNotes} />
        <SaveBtn onPress={saveVaccine} disabled={!vaccineName.trim()} colors={['#1F9A5A', '#3CB37A']} label="Save Vaccination" />
      </SheetModal>

      {/* Med Modal */}
      <SheetModal visible={medModal} onClose={() => setMedModal(false)} insets={insets}
        title="Add Medication" subtitle="Pet medication details" gradColors={['#E0546E', '#C8405A']} icon="activity">
        <Text style={styles.fieldLabel}>Medicine Name <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Deworming tablet" placeholderTextColor="#9AA1AE" value={medName} onChangeText={setMedName} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Dosage</Text>
            <TextInput style={styles.input} placeholder="e.g. 1 tablet" placeholderTextColor="#9AA1AE" value={medDosage} onChangeText={setMedDosage} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Frequency</Text>
            <TextInput style={styles.input} placeholder="e.g. Daily" placeholderTextColor="#9AA1AE" value={medFreq} onChangeText={setMedFreq} />
          </View>
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Start Date</Text>
            <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={medStart} onChangeText={setMedStart} keyboardType="numeric" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>End Date</Text>
            <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={medEnd} onChangeText={setMedEnd} keyboardType="numeric" />
          </View>
        </View>
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput style={styles.input} placeholder="Any special instructions..." placeholderTextColor="#9AA1AE" value={medNotes} onChangeText={setMedNotes} />
        <SaveBtn onPress={saveMed} disabled={!medName.trim()} colors={['#E0546E', '#C8405A']} label="Save Medication" />
      </SheetModal>

      {/* Vet Modal */}
      <SheetModal visible={vetModal} onClose={() => setVetModal(false)} insets={insets}
        title="Vet Information" subtitle="Your pet's doctor details" gradColors={['#4FA6E8', '#2E86C8']} icon="user">
        <Text style={styles.fieldLabel}>Doctor Name <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Dr. Mehta" placeholderTextColor="#9AA1AE" value={vetName} onChangeText={setVetName} />
        <Text style={styles.fieldLabel}>Clinic / Hospital</Text>
        <TextInput style={styles.input} placeholder="e.g. PetCare Clinic" placeholderTextColor="#9AA1AE" value={vetClinic} onChangeText={setVetClinic} />
        <Text style={styles.fieldLabel}>Phone</Text>
        <TextInput style={styles.input} placeholder="e.g. +91 98765 43210" placeholderTextColor="#9AA1AE" value={vetPhone} onChangeText={setVetPhone} keyboardType="phone-pad" />
        <Text style={styles.fieldLabel}>Address</Text>
        <TextInput style={styles.input} placeholder="Clinic address" placeholderTextColor="#9AA1AE" value={vetAddress} onChangeText={setVetAddress} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Last Visit</Text>
            <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={vetLastVisit} onChangeText={setVetLastVisit} keyboardType="numeric" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Next Visit</Text>
            <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={vetNextVisit} onChangeText={setVetNextVisit} keyboardType="numeric" />
          </View>
        </View>
        <SaveBtn onPress={saveVet} disabled={!vetName.trim()} colors={['#4FA6E8', '#2E86C8']} label="Save Vet Info" />
      </SheetModal>

      {/* Allergy Modal */}
      <SheetModal visible={allergyModal} onClose={() => setAllergyModal(false)} insets={insets}
        title="Add Allergy" subtitle="Record known allergies" gradColors={['#F5A623', '#E8943A']} icon="alert-triangle">
        <Text style={styles.fieldLabel}>Allergy / Trigger <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="e.g. Chicken, Pollen, Dust" placeholderTextColor="#9AA1AE" value={allergyName} onChangeText={setAllergyName} />
        <Text style={styles.fieldLabel}>Reaction / Symptoms</Text>
        <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="e.g. Skin rash, vomiting..." placeholderTextColor="#9AA1AE" value={allergyReaction} onChangeText={setAllergyReaction} multiline />
        <SaveBtn onPress={saveAllergy} disabled={!allergyName.trim()} colors={['#F5A623', '#E8943A']} label="Save Allergy" />
      </SheetModal>
    </>
  );
}

// ── Reusable sub-components ──

function EmptyRow({ icon, text }) {
  return (
    <View style={styles.emptyRow}>
      <Feather name={icon} size={18} color="#C7CBD3" />
      <Text style={styles.emptyRowText}>{text}</Text>
    </View>
  );
}

function SheetModal({ visible, onClose, insets, title, subtitle, gradColors, icon, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <LinearGradient colors={gradColors} style={styles.sheetIcon}>
              <Feather name={icon} size={20} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Text style={styles.sheetSubtitle}>{subtitle}</Text>
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5 },
  sectionAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFFDF6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  sectionAddText: { fontSize: 12, fontWeight: '700', color: '#1F9A5A' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, marginBottom: 20 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  listRowDivider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
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
  sheetSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 2 },
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
