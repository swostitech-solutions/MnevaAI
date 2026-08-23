import { pingBackend } from '../api/client';

// One app-wide recovery signal for data screens. Mobile connections are often
// suspended while the app is backgrounded; resuming should refresh existing
// screens just like starting a new session, without forcing the user to log out.
const listeners = new Set();

export function onAppDataRefresh(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function refreshAppData() {
  // Wake a sleeping Render service before the screen refresh runs. This is the
  // practical mobile-side equivalent of "restart on next page action" without
  // forcing a logout or an explicit backend restart.
  pingBackend().catch(() => {});
  listeners.forEach(listener => {
    try { listener(); } catch { /* an individual screen must not block others */ }
  });
}
