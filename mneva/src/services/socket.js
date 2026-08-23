import { useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { BASE_URL } from '../api/client';
import { getStoredAuth } from '../storage/auth';

let _socket = null;
let _connecting = false;
// // Callbacks to notify when socket reconnects so hooks can re-register listeners
// let _reconnectCallbacks = new Set();

// export function onSocketReconnect(cb) {
//   _reconnectCallbacks.add(cb);
//   return () => _reconnectCallbacks.delete(cb);
// }

// export async function getSocket() {
//   if (_socket?.connected) return _socket;

//   if (_connecting) {
//     return new Promise((resolve) => {
//       const t = setInterval(() => {
//         if (_socket?.connected || !_connecting) {
//           clearInterval(t);
//           resolve(_socket);
//         }
//       }, 100);
//       // Safety timeout — never block forever
//       setTimeout(() => { clearInterval(t); _connecting = false; resolve(_socket); }, 8000);
//     });
//   }

//   const { token } = await getStoredAuth();
//   if (!token) return null;

//   // Clean up any dead socket
//   if (_socket) { _socket.removeAllListeners(); _socket.disconnect(); _socket = null; }

//   _connecting = true;
//   _socket = io(BASE_URL, {
//     auth: { token },
//     transports: ['websocket'],
//     // Unlimited reconnection — socket.io will keep trying with backoff
//     reconnection: true,
//     reconnectionAttempts: Infinity,
//     reconnectionDelay: 1000,
//     reconnectionDelayMax: 30000,
//     timeout: 10000,
//   });

//   _socket.on('connect', () => {
//     _connecting = false;
//     // Notify all hooks to re-register their listeners after reconnect
//     _reconnectCallbacks.forEach(cb => cb(_socket));
//   });

//   _socket.on('connect_error', () => { _connecting = false; });
//   _socket.on('disconnect', () => { _connecting = false; });

//   return _socket;
// }

// export function disconnectSocket() {
//   if (_socket) { _socket.removeAllListeners(); _socket.disconnect(); }
//   _socket = null;
//   _connecting = false;
//   _reconnectCallbacks.clear();
// }

// export function resetSocket() {
//   if (_socket) { _socket.removeAllListeners(); _socket.disconnect(); }
//   _socket = null;
//   _connecting = false;
// }

// /** Hook — returns { on, emit } with automatic re-registration on reconnect */
// export function useSocket() {
//   const socketRef = useRef(null);
//   // Store all active listeners so we can re-register them after reconnect
//   const listenersRef = useRef([]); // [{ event, handler }]

//   useEffect(() => {
//     let mounted = true;

//     getSocket().then(s => {
//       if (mounted && s) socketRef.current = s;
//     });

//     // Re-register all listeners whenever socket reconnects
//     const unsubReconnect = onSocketReconnect((s) => {
//       if (!mounted) return;
//       socketRef.current = s;
//       listenersRef.current.forEach(({ event, handler }) => {
//         s.off(event, handler); // avoid duplicates
//         s.on(event, handler);
//       });
//     });

//     return () => {
//       mounted = false;
//       unsubReconnect();
//     };
//   }, []);

//   const on = useCallback((event, handler) => {
//     // Track this listener for reconnect re-registration
//     listenersRef.current = [...listenersRef.current, { event, handler }];

//     const register = (s) => { if (s) { s.off(event, handler); s.on(event, handler); } };

//     if (socketRef.current) {
//       register(socketRef.current);
//     } else {
//       getSocket().then(s => {
//         socketRef.current = s;
//         register(s);
//       });
//     }

//     return () => {
//       socketRef.current?.off(event, handler);
//       listenersRef.current = listenersRef.current.filter(l => l.handler !== handler);
//     };
//   }, []);

//   const emit = useCallback((event, data) => {
//     if (socketRef.current?.connected) {
//       socketRef.current.emit(event, data);
//     } else {
//       getSocket().then(s => { if (s) s.emit(event, data); });
//     }
//   }, []);

//   return { on, emit, socketRef };
// }





































/////////////////////////////////// new ////////////////////


// import { useEffect, useRef, useCallback } from "react";
// import { io } from "socket.io-client";
// import { BASE_URL } from "../api/client";
// import { getStoredAuth } from "../storage/auth";

// let _socket = null;
// let _connecting = false;
// // Callbacks to notify when socket reconnects so hooks can re-register listeners
// let _reconnectCallbacks = new Set();

// export function onSocketReconnect(cb) {
//   _reconnectCallbacks.add(cb);
//   return () => _reconnectCallbacks.delete(cb);
// }

// export async function getSocket() {
//   if (_socket?.connected) return _socket;

//   if (_connecting) {
//     return new Promise((resolve) => {
//       const t = setInterval(() => {
//         if (_socket?.connected || !_connecting) {
//           clearInterval(t);
//           resolve(_socket);
//         }
//       }, 100);
//       // Safety timeout — never block forever
//       setTimeout(() => {
//         clearInterval(t);
//         _connecting = false;
//         resolve(_socket);
//       }, 8000);
//     });
//   }

//   const { token } = await getStoredAuth();
//   if (!token) return null;

//   // Clean up any dead socket
//   if (_socket) {
//     _socket.removeAllListeners();
//     _socket.disconnect();
//     _socket = null;
//   }

//   _connecting = true;
//   _socket = io(BASE_URL, {
//     auth: { token },
//     // Allow polling as a fallback when a mobile network/proxy temporarily
//     // breaks a WebSocket connection. Socket.IO will upgrade when possible.
//     transports: ["polling", "websocket"],
//     // Unlimited reconnection — socket.io will keep trying with backoff
//     reconnection: true,
//     reconnectionAttempts: Infinity,
//     reconnectionDelay: 1000,
//     reconnectionDelayMax: 30000,
//     timeout: 10000,
//   });

//   _socket.on("connect", () => {
//     _connecting = false;
//     // Notify all hooks to re-register their listeners after reconnect
//     _reconnectCallbacks.forEach((cb) => cb(_socket));
//   });

//   _socket.on("connect_error", () => {
//     _connecting = false;
//   });
//   _socket.on("disconnect", (reason) => {
//     _connecting = false;
//     // Do not destroy the client on transient disconnects. Socket.IO's
//     // built-in reconnect loop must remain alive.
//     if (
//       reason === "io client disconnect" ||
//       reason === "io server disconnect"
//     ) {
//       return;
//     }
//   });

//   return _socket;
// }

// export function disconnectSocket() {
//   if (_socket) {
//     _socket.removeAllListeners();
//     _socket.disconnect();
//   }
//   _socket = null;
//   _connecting = false;
//   _reconnectCallbacks.clear();
// }

// export function resetSocket() {
//   if (_socket) {
//     _socket.removeAllListeners();
//     _socket.disconnect();
//   }
//   _socket = null;
//   _connecting = false;
// }

// /** Hook — returns { on, emit } with automatic re-registration on reconnect */
// export function useSocket() {
//   const socketRef = useRef(null);
//   // Store all active listeners so we can re-register them after reconnect
//   const listenersRef = useRef([]); // [{ event, handler }]

//   useEffect(() => {
//     let mounted = true;

//     getSocket().then((s) => {
//       if (mounted && s) socketRef.current = s;
//     });

//     // Re-register all listeners whenever socket reconnects
//     const unsubReconnect = onSocketReconnect((s) => {
//       if (!mounted) return;
//       socketRef.current = s;
//       listenersRef.current.forEach(({ event, handler }) => {
//         s.off(event, handler); // avoid duplicates
//         s.on(event, handler);
//       });
//     });

//     return () => {
//       mounted = false;
//       unsubReconnect();
//     };
//   }, []);

//   const on = useCallback((event, handler) => {
//     // Track this listener for reconnect re-registration
//     listenersRef.current = [...listenersRef.current, { event, handler }];

//     const register = (s) => {
//       if (s) {
//         s.off(event, handler);
//         s.on(event, handler);
//       }
//     };

//     if (socketRef.current) {
//       register(socketRef.current);
//     } else {
//       getSocket().then((s) => {
//         socketRef.current = s;
//         register(s);
//       });
//     }

//     return () => {
//       socketRef.current?.off(event, handler);
//       listenersRef.current = listenersRef.current.filter(
//         (l) => l.handler !== handler,
//       );
//     };
//   }, []);

//   const emit = useCallback((event, data) => {
//     if (socketRef.current?.connected) {
//       socketRef.current.emit(event, data);
//     } else {
//       getSocket().then((s) => {
//         if (s) s.emit(event, data);
//       });
//     }
//   }, []);

//   return { on, emit, socketRef };
// }









































//////////////////////////    new 1 //////////////////


let _manuallyClosed = false;
let _connectWaiters = [];
// Callbacks to notify when socket connects/reconnects so hooks can re-register listeners.
let _reconnectCallbacks = new Set();

export function onSocketReconnect(cb) {
  _reconnectCallbacks.add(cb);
  return () => _reconnectCallbacks.delete(cb);
}

function settleConnectWaiters(socket) {
  const waiters = _connectWaiters;
  _connectWaiters = [];
  waiters.forEach(({ resolve }) => resolve(socket));
}

function waitForSocket(socket) {
  return new Promise((resolve) => {
    _connectWaiters.push({ resolve });
    const timer = setTimeout(() => {
      const index = _connectWaiters.findIndex((w) => w.resolve === resolve);
      if (index >= 0) _connectWaiters.splice(index, 1);
      resolve(socket || null);
    }, 10000);
    const originalResolve = resolve;
    // The waiter is removed by settleConnectWaiters; the timeout is harmless
    // after resolution but avoid retaining it longer than necessary.
    _connectWaiters[_connectWaiters.length - 1].resolve = (value) => {
      clearTimeout(timer);
      originalResolve(value);
    };
  });
}

function attachSocketHandlers(socket) {
  socket.on("connect", () => {
    _connecting = false;
    _manuallyClosed = false;
    settleConnectWaiters(socket);
    _reconnectCallbacks.forEach((cb) => {
      try { cb(socket); } catch {}
    });
  });

  socket.on("connect_error", () => {
    _connecting = false;
    // Leave the Socket.IO Manager alive. Its own reconnect loop is more
    // reliable than destroying/recreating the client on every network blip.
    settleConnectWaiters(socket);
  });

  socket.on("disconnect", (reason) => {
    _connecting = false;
    // Transport/network disconnects are intentionally left to Socket.IO's
    // built-in reconnection. Do not destroy this instance or its listeners.
    // A server/client explicit disconnect is handled only by resetSocket().
    if (reason === "io server disconnect" && !_manuallyClosed) {
      // Socket.IO does not automatically reconnect after a server disconnect;
      // explicitly reconnect the same authenticated socket instance.
      setTimeout(() => {
        if (_socket === socket && !_manuallyClosed && !socket.connected) {
          socket.connect();
        }
      }, 500);
    }
  });
}

export async function getSocket() {
  const { token } = await getStoredAuth();
  if (!token) return null;

  // Reuse the existing Socket.IO client. This is critical: recreating a
  // disconnected client from the 60s API recovery loop can cancel its own
  // exponential reconnect cycle and drop all registered listeners.
  if (_socket) {
    _manuallyClosed = false;
    if (_socket.connected) return _socket;
    if (!_socket.active && !_connecting) {
      _connecting = true;
      _socket.connect();
    }
    return _socket.connected ? _socket : waitForSocket(_socket);
  }

  _manuallyClosed = false;
  _connecting = true;
  _socket = io(BASE_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.25,
    timeout: 10000,
    autoConnect: true,
  });

  attachSocketHandlers(_socket);
  return _socket.connected ? _socket : waitForSocket(_socket);
}

function closeSocket() {
  if (!_socket) return;
  _manuallyClosed = true;
  _socket.removeAllListeners();
  _socket.disconnect();
  _socket = null;
  _connecting = false;
  _connectWaiters.forEach(({ resolve }) => resolve(null));
  _connectWaiters = [];
}

export function disconnectSocket() {
  closeSocket();
  _reconnectCallbacks.clear();
}

export function resetSocket() {
  closeSocket();
}

/** Hook — returns { on, emit } with automatic re-registration on reconnect */
export function useSocket() {
  const socketRef = useRef(null);
  const listenersRef = useRef([]);

  useEffect(() => {
    let mounted = true;

    getSocket().then((s) => {
      if (mounted && s) socketRef.current = s;
    });

    const unsubReconnect = onSocketReconnect((s) => {
      if (!mounted) return;
      socketRef.current = s;
      listenersRef.current.forEach(({ event, handler }) => {
        s.off(event, handler);
        s.on(event, handler);
      });
    });

    return () => {
      mounted = false;
      unsubReconnect();
    };
  }, []);

  const on = useCallback((event, handler) => {
    listenersRef.current = [
      ...listenersRef.current.filter((l) => !(l.event === event && l.handler === handler)),
      { event, handler },
    ];

    const register = (s) => {
      if (s) {
        s.off(event, handler);
        s.on(event, handler);
      }
    };

    if (socketRef.current) register(socketRef.current);
    else {
      getSocket().then((s) => {
        socketRef.current = s;
        register(s);
      });
    }

    return () => {
      socketRef.current?.off(event, handler);
      listenersRef.current = listenersRef.current.filter(
        (l) => l.event !== event || l.handler !== handler,
      );
    };
  }, []);

  const emit = useCallback((event, data) => {
    const send = (s) => {
      if (!s) return;
      if (s.connected) s.emit(event, data);
      else {
        const once = () => {
          s.off("connect", once);
          s.emit(event, data);
        };
        s.once("connect", once);
      }
    };
    send(socketRef.current);
    if (!socketRef.current) getSocket().then((s) => {
      socketRef.current = s;
      send(s);
    });
  }, []);

  return { on, emit, socketRef };
}
