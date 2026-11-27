import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { vaultApi } from '../../services/api'
import { encryptToBase64, decryptFromBase64 } from '../../services/vaultCrypto'
import EmptyState from '../ui/EmptyState'
import ConfirmDialog from '../ui/ConfirmDialog'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const up = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

const fmtSize = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

export default function VaultPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const { data: files, isLoading } = useQuery({ queryKey: ['vaultFiles'], queryFn: vaultApi.list })

  const handleUploadClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const buffer = new Uint8Array(await file.arrayBuffer())
      const fileBase64 = await encryptToBase64(buffer)
      await vaultApi.upload({ fileBase64, fileName: file.name, mimeType: file.type || 'application/octet-stream' })
      toast.success(`${file.name} encrypted and uploaded`)
      qc.invalidateQueries({ queryKey: ['vaultFiles'] })
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Could not encrypt/upload this file')
    } finally {
      setUploading(false)
    }
  }

  const openFile = async (f) => {
    setBusyId(f.id)
    try {
      const { dataBase64, mimeType } = await vaultApi.download(f.id)
      const plainBytes = await decryptFromBase64(dataBase64)
      const blob = new Blob([plainBytes], { type: mimeType || f.mimeType })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      toast.error('Could not open this file — it may have been encrypted on a different device.')
    } finally {
      setBusyId(null)
    }
  }

  const doDelete = async () => {
    try {
      await vaultApi.remove(confirmDelete.id)
      toast.success('Deleted')
      setConfirmDelete(null)
      qc.invalidateQueries({ queryKey: ['vaultFiles'] })
    } catch {
      toast.error('Could not delete')
    }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>🔒 Vault</div>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />
        <button className="btn-primary" disabled={uploading} onClick={handleUploadClick}>{uploading ? 'Encrypting…' : '+ Add File'}</button>
      </motion.div>
      <motion.div variants={up} style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 20 }}>
        Files are encrypted in this browser before upload — Mneva's servers only ever see ciphertext. This vault is tied to this browser only; files added here won't open on your phone or another browser, same as mobile files won't open here.
      </motion.div>

      {isLoading && <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />}
      {!isLoading && !files?.length && <EmptyState icon="🔒" title="No files in your vault yet" body="Click + Add File to encrypt and store one." />}
      {files?.length > 0 && (
        <motion.div variants={up} className="card" style={{ padding: 8 }}>
          {files.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.fileName}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{fmtSize(f.size)} · {new Date(f.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
              <button className="btn-view" disabled={busyId === f.id} onClick={() => openFile(f)}>{busyId === f.id ? 'Decrypting…' : 'Open'}</button>
              <button className="btn-deny" onClick={() => setConfirmDelete(f)}>Delete</button>
            </div>
          ))}
        </motion.div>
      )}

      {confirmDelete && (
        <ConfirmDialog title={`Delete ${confirmDelete.fileName}?`} body="This cannot be undone." onConfirm={doDelete} onClose={() => setConfirmDelete(null)} />
      )}
    </motion.div>
  )
}
