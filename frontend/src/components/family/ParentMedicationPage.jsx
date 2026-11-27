import React from 'react'
import EntityCrudPage from '../ui/EntityCrudPage'
import { familyApi } from '../../services/api'

const FREQUENCIES = ['Once daily', 'Twice daily', 'Thrice daily', 'Weekly', 'As needed']
const PARENTS = ['Dad', 'Mom', 'Both']

const FIELDS = [
  { key: 'medName', label: 'Medicine Name', type: 'text', required: true },
  { key: 'dosage', label: 'Dosage', type: 'text', required: true, hint: 'e.g. 500mg' },
  { key: 'frequency', label: 'Frequency', type: 'select', options: FREQUENCIES, required: true },
  { key: 'mealTime', label: 'Meal Time', type: 'text', hint: 'e.g. After breakfast' },
  { key: 'parent', label: 'For', type: 'select', options: PARENTS, required: true },
  { key: 'startDate', label: 'Start Date', type: 'date' },
  { key: 'duration', label: 'Duration', type: 'text', hint: 'e.g. 30 days' },
  { key: 'doctor', label: 'Doctor', type: 'text' },
  { key: 'refillDate', label: 'Refill Date', type: 'date' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export default function ParentMedicationPage() {
  return (
      <EntityCrudPage
        title="Parent Medications" icon="💊" backTo="/family" backLabel="← Family"
        queryKey={['parentMeds']} listFn={familyApi.medications}
        createFn={familyApi.createMedication} updateFn={familyApi.updateMedication} removeFn={familyApi.deleteMedication}
        fields={FIELDS}
        emptyIcon="💊" emptyTitle="No medications tracked" emptyBody="Track your parents' medicines, dosage and refill schedule."
        renderCard={(m) => (
          <>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{m.medName} <span style={{ fontWeight: 400, color: 'var(--ink3)', fontSize: 12 }}>({m.dosage})</span></div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>For {m.parent} · {m.frequency}{m.mealTime ? ` · ${m.mealTime}` : ''}</div>
            {m.doctor && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>Dr. {m.doctor}</div>}
            {m.refillDate && <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 4 }}>Refill: {m.refillDate}</div>}
          </>
        )}
      />
  )
}
