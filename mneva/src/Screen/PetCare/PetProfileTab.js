import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const SPECIES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish', 'Other'];
const SEX = ['Male', 'Female'];
const COAT_TYPES = ['Short', 'Long', 'Curly', 'Wavy', 'Hairless'];

export default function PetProfileTab({ pet, setPet, horizontalPad, insets }) {
  const [modal, setModal] = useState(false);

  // Basic info
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState('');
  const [dob, setDob] = useState('');
  const [microchip, setMicrochip] = useState('');

  // Physical info
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [coatType, setCoatType] = useState('');
  const [colorMarkings, setColorMarkings] = useState('');

  const canSave = name.trim() && species;

  const calcAge = (dobStr) => {
    if (!dobStr) return null;
    const parts = dobStr.split('/');
    if (parts.length !== 3) return null;
    const birth = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    if (isNaN(birth)) return null;
    const now = new Date();
    const years = now.getFullYear() - birth.getFullYear();
    const months = now.getMonth() - birth.getMonth();
    const totalMonths = years * 12 + months;
    if (totalMonths < 12) return `${totalMonths} months`;
    return `${Math.floor(totalMonths / 12)} yrs ${totalMonths % 12} mo`;
  };

  const resetForm = () => {
    setName(''); setSpecies(''); setBreed(''); setSex(''); setDob('');
    setMicrochip(''); setWeight(''); setHeight(''); setCoatType(''); setColorMarkings('');
  };

  const savePet = () => {
    setPet({
      name: name.trim(), species, breed: breed.trim(), sex, dob: dob.trim(),
      age: calcAge(dob.trim()), microchip: microchip.trim(),
      weight: weight.trim(), height: height.trim(), coatType, colorMarkings: colorMarkings.trim(),
    });
    resetForm();
    setModal(false);
  };

  const openEdit = () => {
    if (pet) {
      setName(pet.name); setSpecies(pet.species); setBreed(pet.breed);
      setSex(pet.sex); setDob(pet.dob); setMicrochip(pet.microchip);
      setWeight(pet.weight); setHeight(pet.height); setCoatType(pet.coatType);
      setColorMarkings(pet.colorMarkings);
    }
    setModal(true);
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={[{ paddingHorizontal: horizontalPad, paddingBottom: insets.bottom + 32, paddingTop: 8 }]}
        showsVerticalScrollIndicator={false}
      >
        {!pet ? (
          <View style={styles.emptyWrap}>
            <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={styles.emptyIcon}>
              <Feather name="heart" size={32} color="#F5A623" />
            </LinearGradient>
            <Text style={styles.emptyTitle}>No pet added yet</Text>
            <Text style={styles.emptySubtitle}>Add your pet's profile to get started</Text>
            <TouchableOpacity style={styles.addPetBtn} onPress={() => setModal(true)}>
              <LinearGradient colors={['#F5A623', '#E8943A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.addPetBtnGrad}>
                <Feather name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.addPetBtnText}>Add Pet Profile</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Pet avatar card */}
            <View style={styles.petAvatarCard}>
              <LinearGradient colors={['#F5A623', '#E8943A']} style={styles.petAvatar}>
                <Text style={styles.petAvatarEmoji}>
                  {pet.species === 'Dog' ? '🐶' : pet.species === 'Cat' ? '🐱' : pet.species === 'Bird' ? '🐦' : pet.species === 'Rabbit' ? '🐰' : pet.species === 'Fish' ? '🐟' : '🐾'}
                </Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.petName}>{pet.name}</Text>
                <Text style={styles.petBreed}>{pet.breed || pet.species}{pet.sex ? ` · ${pet.sex}` : ''}</Text>
                {pet.age ? <Text style={styles.petAge}>{pet.age} old</Text> : null}
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={openEdit}>
                <Feather name="edit-2" size={16} color="#F5A623" />
              </TouchableOpacity>
            </View>

            {/* Basic Info */}
            <Text style={styles.sectionLabel}>BASIC INFORMATION</Text>
            <View style={styles.infoCard}>
              {[
                { label: 'Species', value: pet.species, icon: 'tag' },
                { label: 'Breed', value: pet.breed, icon: 'info' },
                { label: 'Sex', value: pet.sex, icon: 'user' },
                { label: 'Date of Birth', value: pet.dob, icon: 'calendar' },
                { label: 'Age', value: pet.age, icon: 'clock' },
                { label: 'Microchip / ID', value: pet.microchip, icon: 'shield' },
              ].filter(r => r.value).map((row, i, arr) => (
                <View key={i} style={[styles.infoRow, i < arr.length - 1 && styles.infoRowDivider]}>
                  <View style={styles.infoIconWrap}>
                    <Feather name={row.icon} size={13} color="#6B7280" />
                  </View>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value}</Text>
                </View>
              ))}
            </View>

            {/* Physical Info */}
            {(pet.weight || pet.height || pet.coatType || pet.colorMarkings) ? (
              <>
                <Text style={styles.sectionLabel}>PHYSICAL INFORMATION</Text>
                <View style={styles.infoCard}>
                  {[
                    { label: 'Weight', value: pet.weight, icon: 'bar-chart-2' },
                    { label: 'Height / Size', value: pet.height, icon: 'maximize-2' },
                    { label: 'Coat Type', value: pet.coatType, icon: 'wind' },
                    { label: 'Color / Markings', value: pet.colorMarkings, icon: 'droplet' },
                  ].filter(r => r.value).map((row, i, arr) => (
                    <View key={i} style={[styles.infoRow, i < arr.length - 1 && styles.infoRowDivider]}>
                      <View style={styles.infoIconWrap}>
                        <Feather name={row.icon} size={13} color="#6B7280" />
                      </View>
                      <Text style={styles.infoLabel}>{row.label}</Text>
                      <Text style={styles.infoValue}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Add / Edit Modal */}
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
                <Text style={styles.sheetTitle}>{pet ? 'Edit Pet Profile' : 'Add Pet Profile'}</Text>
                <Text style={styles.sheetSubtitle}>Basic & physical details</Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              <Text style={styles.sectionDivider}>BASIC INFORMATION</Text>

              <Text style={styles.fieldLabel}>Pet Name <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} placeholder="e.g. Bruno, Whiskers" placeholderTextColor="#9AA1AE" value={name} onChangeText={setName} />

              <Text style={styles.fieldLabel}>Species <Text style={styles.req}>*</Text></Text>
              <View style={styles.chipRow}>
                {SPECIES.map(s => (
                  <TouchableOpacity key={s} style={[styles.chip, species === s && styles.chipActive]} onPress={() => setSpecies(s)}>
                    <Text style={[styles.chipText, species === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Breed</Text>
              <TextInput style={styles.input} placeholder="e.g. Labrador, Persian" placeholderTextColor="#9AA1AE" value={breed} onChangeText={setBreed} />

              <Text style={styles.fieldLabel}>Sex</Text>
              <View style={styles.chipRow}>
                {SEX.map(s => (
                  <TouchableOpacity key={s} style={[styles.chip, sex === s && styles.chipActive]} onPress={() => setSex(s)}>
                    <Text style={[styles.chipText, sex === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Date of Birth</Text>
                  <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor="#9AA1AE" value={dob} onChangeText={setDob} keyboardType="numeric" />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Microchip / ID</Text>
                  <TextInput style={styles.input} placeholder="Optional" placeholderTextColor="#9AA1AE" value={microchip} onChangeText={setMicrochip} />
                </View>
              </View>

              <Text style={styles.sectionDivider}>PHYSICAL INFORMATION</Text>

              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Weight</Text>
                  <TextInput style={styles.input} placeholder="e.g. 12 kg" placeholderTextColor="#9AA1AE" value={weight} onChangeText={setWeight} />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Height / Size</Text>
                  <TextInput style={styles.input} placeholder="e.g. Medium" placeholderTextColor="#9AA1AE" value={height} onChangeText={setHeight} />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Coat Type</Text>
              <View style={styles.chipRow}>
                {COAT_TYPES.map(c => (
                  <TouchableOpacity key={c} style={[styles.chip, coatType === c && styles.chipActive]} onPress={() => setCoatType(c)}>
                    <Text style={[styles.chipText, coatType === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Color / Markings</Text>
              <TextInput style={styles.input} placeholder="e.g. Golden with white patch" placeholderTextColor="#9AA1AE" value={colorMarkings} onChangeText={setColorMarkings} />

              <TouchableOpacity style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} onPress={savePet}>
                <LinearGradient colors={['#F5A623', '#E8943A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                  <Feather name="check" size={16} color="#FFFFFF" />
                  <Text style={styles.saveBtnText}>Save Pet Profile</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#14171F' },
  emptySubtitle: { fontSize: 13, color: '#9AA1AE', textAlign: 'center' },
  addPetBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  addPetBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 14 },
  addPetBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  petAvatarCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 20, gap: 14 },
  petAvatar: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  petAvatarEmoji: { fontSize: 28 },
  petName: { fontSize: 18, fontWeight: '800', color: '#14171F' },
  petBreed: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  petAge: { fontSize: 12, color: '#F5A623', fontWeight: '700', marginTop: 2 },
  editBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5, marginBottom: 10 },
  infoCard: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 16, marginBottom: 20 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  infoRowDivider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  infoIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F5F6F8', alignItems: 'center', justifyContent: 'center' },
  infoLabel: { flex: 1, fontSize: 13, color: '#6B7280', fontWeight: '600' },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#14171F', maxWidth: '55%', textAlign: 'right' },

  overlay: { flex: 1, backgroundColor: 'rgba(14,17,26,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E5EA', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  sheetSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 2 },

  sectionDivider: { fontSize: 11, fontWeight: '700', color: '#9AA1AE', letterSpacing: 0.5, marginBottom: 12, marginTop: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  req: { color: '#E0546E' },
  input: { backgroundColor: '#F5F6F8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: '#14171F', marginBottom: 16 },
  rowFields: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F5F6F8', borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { backgroundColor: '#FEF3C7', borderColor: '#F5A623' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#F5A623' },
  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4, marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
