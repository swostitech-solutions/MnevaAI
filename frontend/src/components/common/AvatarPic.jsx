import React, { useRef } from 'react'
import { useAuth } from '../../store'
import { authApi } from '../../services/api'
import toast from 'react-hot-toast'

export default function AvatarPic({ size = 32, fontSize = 11, editable = false, style = {} }) {
  const { user, patchUser } = useAuth()
  const inputRef = useRef(null)

  const isImage = user?.avatar && (user.avatar.startsWith('data:') || user.avatar.startsWith('http'))
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return }
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const updated = await authApi.updateAvatar(ev.target.result)
        patchUser({ avatar: updated.avatar })
        toast.success('Profile picture updated!')
      } catch { toast.error('Could not update picture') }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div
      onClick={editable ? () => inputRef.current?.click() : undefined}
      title={editable ? 'Click to change photo' : user?.name}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: isImage ? 'transparent' : 'linear-gradient(135deg,#3D8BFF,#9B72FF)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize, fontWeight: 700, color: '#fff',
        cursor: editable ? 'pointer' : 'default',
        overflow: 'hidden', position: 'relative',
        ...style,
      }}
    >
      {isImage
        ? <img src={user.avatar} alt={user?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontFamily: '"Space Grotesk",sans-serif' }}>{initials}</span>
      }
      {editable && (
        <>
          <div
            className="avatar-overlay"
            style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity 0.15s', fontSize: Math.round(size * 0.35),
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = 0}
          >📷</div>
          <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        </>
      )}
    </div>
  )
}
