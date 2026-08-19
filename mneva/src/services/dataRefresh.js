// One app-wide recovery signal for data screens.  Mobile connections are often
// suspended while the app is backgrounded; resuming should refresh existing
// screens just like starting a new session, without forcing the user to log out.
const listeners = new Set();
let _debounceTimer = null;

export function onAppDataRefresh(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Debounced — no matter how many times this is called within 800ms
// (AppState change + heartbeat + socket reconnect all firing together),
// screens only receive ONE refresh signal.
export function refreshAppData() {
  if (_debounceTimer) return;
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    listeners.forEach(listener => {
      try { listener(); } catch { /* an individual screen must not block others */ }
    });
  }, 800);
}
