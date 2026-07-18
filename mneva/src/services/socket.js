import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { BASE_URL } from '../api/client';
import { getStoredAuth } from '../storage/auth';

let _socket = null;
let _connecting = false;
let _listeners = []; // queued listeners before socket is ready

export async function getSocket() {
  if (_socket?.connected) return _socket;
  if (_connecting) {
    // wait up to 5s for connection
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (_socket?.connected) { clearInterval(t); resolve(_socket); }
      }, 100);
      setTimeout(() => { clearInterval(t); resolve(_socket); }, 5000);
    });
  }

  const { token } = await getStoredAuth();
  if (!token) return null;

  if (_socket) { _socket.disconnect(); _socket = null; }

  _connecting = true;
  _socket = io(BASE_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    timeout: 10000,
  });

  _socket.on('connect', () => { _connecting = false; });
  _socket.on('connect_error', () => { _connecting = false; });
  _socket.on('disconnect', () => { _connecting = false; });

  return _socket;
}

export function disconnectSocket() {
  _socket?.disconnect();
  _socket = null;
  _connecting = false;
}

/** Hook — returns { on, emit } with reliable listener registration */
export function useSocket() {
  const socketRef = useRef(null);
  const readyRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    getSocket().then(s => {
      if (mounted && s) {
        socketRef.current = s;
        readyRef.current = true;
      }
    });
    return () => { mounted = false; };
  }, []);

  const on = useCallback((event, handler) => {
    // Register immediately if socket exists, otherwise wait
    const register = (s) => { if (s) s.on(event, handler); };

    if (socketRef.current) {
      register(socketRef.current);
    } else {
      getSocket().then(s => {
        socketRef.current = s;
        register(s);
      });
    }

    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      getSocket().then(s => { if (s) s.emit(event, data); });
    }
  }, []);

  return { on, emit, socketRef };
}
