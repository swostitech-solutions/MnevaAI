import React from 'react'
import Modal from './Modal'

export default function ConfirmDialog({ title = 'Are you sure?', body, confirmLabel = 'Delete', danger = true, onConfirm, onClose }) {
  return (
    <Modal title={title} icon="⚠️" onClose={onClose} width={360}>
      {body && <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 18 }}>{body}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className={danger ? 'btn-deny' : 'btn-primary'}
          style={{ flex: 1, padding: '10px', fontSize: 13 }}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button onClick={onClose} style={{ flex: 1, background: 'var(--depth3)', color: 'var(--ink2)', border: '1px solid var(--rim1)', borderRadius: 10, padding: '10px', fontSize: 13, cursor: 'pointer', fontFamily: '"Space Grotesk",sans-serif' }}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
