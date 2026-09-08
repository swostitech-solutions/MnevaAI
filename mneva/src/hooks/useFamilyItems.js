import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, peekCachedResponse } from '../api/client';
import { useSocket } from '../services/socket';
import { onAppDataRefresh } from '../services/dataRefresh';

export function useFamilyItems(domain) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const { on }                = useSocket();
  const mountedRef            = useRef(true);
  const hasRealDataRef        = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/family-items/${domain}`);
      hasRealDataRef.current = true;
      if (mountedRef.current) setItems(res.items || []);
    } catch { /* silent */ }
    finally { if (mountedRef.current) setLoading(false); }
  }, [domain]);

  // Paint the last known items immediately from cache — every screen built on
  // this hook (CelebrationGifting, ChildrenActivities, FamilyCalendar,
  // HomeMaintenance) otherwise shows a blank loading spinner on every single
  // open even though nothing changed since last time. load() above still runs
  // right after and silently replaces this with fresh data; the ref guard
  // stops a slow cache read from ever clobbering real data.
  useEffect(() => {
    let cancelled = false;
    hasRealDataRef.current = false;
    (async () => {
      const cached = await peekCachedResponse(`/api/family-items/${domain}`).catch(() => null);
      if (!cancelled && !hasRealDataRef.current && cached) {
        setItems(cached.items || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [domain]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const unsub = onAppDataRefresh(load);
    return () => { mountedRef.current = false; unsub(); };
  }, [load]);

  // Real-time socket events
  useEffect(() => {
    const offCreated = on(`family:${domain}:created`, (item) => {
      setItems(prev => prev.find(x => x.id === item.id) ? prev : [item, ...prev]);
    });
    const offUpdated = on(`family:${domain}:updated`, (item) => {
      setItems(prev => prev.map(x => x.id === item.id ? item : x));
    });
    const offDeleted = on(`family:${domain}:deleted`, ({ id }) => {
      setItems(prev => prev.filter(x => x.id !== id));
    });
    return () => { offCreated?.(); offUpdated?.(); offDeleted?.(); };
  }, [on, domain]);

  const create = useCallback(async (type, data, remindAt = null) => {
    setSaving(true);
    try {
      await apiFetch(`/api/family-items/${domain}`, {
        method: 'POST',
        body: { type, data, remindAt },
      });
    } catch { /* socket updates state */ }
    finally { setSaving(false); }
  }, [domain]);

  const update = useCallback(async (id, patch) => {
    setSaving(true);
    try {
      await apiFetch(`/api/family-items/${domain}/${id}`, {
        method: 'PATCH',
        body: patch,
      });
    } catch { /* socket updates state */ }
    finally { setSaving(false); }
  }, [domain]);

  const remove = useCallback(async (id) => {
    try {
      await apiFetch(`/api/family-items/${domain}/${id}`, { method: 'DELETE' });
    } catch { /* socket updates state */ }
  }, [domain]);

  // Filter helpers
  const byType = useCallback((type) => items.filter(x => x.type === type), [items]);

  return { items, loading, saving, load, create, update, remove, byType };
}
