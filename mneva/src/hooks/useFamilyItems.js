import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../api/client';
import { useSocket } from '../services/socket';
import { onAppDataRefresh } from '../services/dataRefresh';

export function useFamilyItems(domain) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const { on }                = useSocket();
  const mountedRef            = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/family-items/${domain}`);
      if (mountedRef.current) setItems(res.items || []);
    } catch { /* silent */ }
    finally { if (mountedRef.current) setLoading(false); }
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
