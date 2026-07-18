import { useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from '../store'

let sock = null

export function useSocket() {
  const { token } = useAuth()

  useEffect(() => {
    if (!token) return
    if (sock?.connected) return

    // Always connect directly to backend port in dev; in prod they share origin
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_API_URL?.replace('/api', '') ||
      'http://localhost:3001'

    sock = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    sock.on('connect', () => console.log('🔌 Socket connected to', socketUrl))
    sock.on('connect_error', (e) => console.warn('Socket error:', e.message))
    sock.on('disconnect', (reason) => console.log('🔌 Socket disconnected:', reason))

    return () => {
      sock?.off('connect')
      sock?.off('connect_error')
      sock?.off('disconnect')
    }
  }, [token])

  const on   = useCallback((evt, fn) => { sock?.on(evt, fn); return () => sock?.off(evt, fn) }, [])
  const emit = useCallback((evt, d) => sock?.emit(evt, d), [])
  return { socket: sock, on, emit }
}

