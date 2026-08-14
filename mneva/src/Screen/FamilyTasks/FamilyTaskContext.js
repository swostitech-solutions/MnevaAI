import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../../api/client';
import { getSocket } from '../../services/socket';

const FamilyTaskContext = createContext(null);

export const RELATIONSHIPS = [
  'Father', 'Mother', 'Brother', 'Sister', 'Spouse',
  'Son', 'Daughter', 'Grandparent', 'Grandchild',
  'Partner', 'Relative', 'Caregiver', 'Other',
];

export const TASK_STATUSES = {
  DRAFT:              { label: 'Draft',       color: '#9AA1AE', bg: '#F5F6F8' },
  PENDING_ACCEPTANCE: { label: 'Pending',     color: '#D97706', bg: '#FEF3C7' },
  ACCEPTED:           { label: 'Accepted',    color: '#4FA6E8', bg: '#EAF3FD' },
  REJECTED:           { label: 'Rejected',    color: '#E0546E', bg: '#FCEAED' },
  IN_PROGRESS:        { label: 'In Progress', color: '#9B72FF', bg: '#F3EFFE' },
  COMPLETED:          { label: 'Completed',   color: '#1F9A5A', bg: '#EFFDF6' },
  CANCELLED:          { label: 'Cancelled',   color: '#6B7280', bg: '#F5F6F8' },
  EXPIRED:            { label: 'Expired',     color: '#E0546E', bg: '#FCEAED' },
};

export const PRIORITIES  = ['Low', 'Medium', 'High', 'Urgent'];
export const CATEGORIES  = ['Household', 'Health', 'Finance', 'Shopping', 'School', 'Errands', 'Other'];
export const RECURRENCES = ['None', 'Daily', 'Weekly', 'Monthly'];

export function FamilyTaskProvider({ children }) {
  const [connections, setConnections] = useState([]);
  const [tasks, setTasks]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const socketRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [connData, taskData] = await Promise.all([
        apiFetch('/api/family/connections'),
        apiFetch('/api/family/tasks'),
      ]);
      setConnections(connData.connections || []);
      setTasks(taskData.tasks || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Real-time socket listeners ──
  useEffect(() => {
    let mounted = true;
    getSocket().then(socket => {
      if (!mounted) return;
      socketRef.current = socket;

      socket.on('family:request',      (conn) => setConnections(p => [conn, ...p.filter(c => c.id !== conn.id)]));
      socket.on('family:updated',      (conn) => setConnections(p => p.map(c => c.id === conn.id ? conn : c)));
      socket.on('family:task:new',     (task) => setTasks(p => [task, ...p.filter(t => t.id !== task.id)]));
      socket.on('family:task:updated', (task) => setTasks(p => p.map(t => t.id === task.id ? task : t)));
      socket.on('family:task:deleted', ({ id }) => setTasks(p => p.filter(t => t.id !== id)));
    }).catch(() => {});

    return () => {
      mounted = false;
      const s = socketRef.current;
      if (s) {
        s.off('family:request');
        s.off('family:updated');
        s.off('family:task:new');
        s.off('family:task:updated');
        s.off('family:task:deleted');
      }
    };
  }, []);

  // ── Connections ──
  const sendRequest = async (name, relationship, email) => {
    const data = await apiFetch('/api/family/connections', { method: 'POST', body: { receiverEmail: email, relationship } });
    setConnections(p => [data.connection, ...p]);
  };

  const acceptConnection = async (id) => {
    const data = await apiFetch(`/api/family/connections/${id}`, { method: 'PATCH', body: { status: 'ACCEPTED' } });
    setConnections(p => p.map(c => c.id === id ? data.connection : c));
  };

  const rejectConnection = async (id) => {
    const data = await apiFetch(`/api/family/connections/${id}`, { method: 'PATCH', body: { status: 'REJECTED' } });
    setConnections(p => p.map(c => c.id === id ? data.connection : c));
  };

  const removeConnection = async (id) => {
    await apiFetch(`/api/family/connections/${id}`, { method: 'DELETE' });
    setConnections(p => p.filter(c => c.id !== id));
  };

  // ── Tasks ──
  const createTask = async (payload) => {
    const data = await apiFetch('/api/family/tasks', { method: 'POST', body: payload });
    setTasks(p => [data.task, ...p]);
    return data.task;
  };

  const updateTaskStatus = async (id, status) => {
    const data = await apiFetch(`/api/family/tasks/${id}/status`, { method: 'PATCH', body: { status } });
    setTasks(p => p.map(t => t.id === id ? data.task : t));
  };

  const toggleChecklistItem = async (taskId, itemId) => {
    const data = await apiFetch(`/api/family/tasks/${taskId}/checklist`, { method: 'PATCH', body: { itemId } });
    setTasks(p => p.map(t => t.id === taskId ? data.task : t));
  };

  const addComment = async (taskId, text) => {
    const data = await apiFetch(`/api/family/tasks/${taskId}/comments`, { method: 'POST', body: { text } });
    setTasks(p => p.map(t => t.id === taskId ? data.task : t));
  };

  const deleteTask = async (id) => {
    await apiFetch(`/api/family/tasks/${id}`, { method: 'DELETE' });
    setTasks(p => p.filter(t => t.id !== id));
  };

  return (
    <FamilyTaskContext.Provider value={{
      connections, tasks, loading, fetchAll,
      sendRequest, acceptConnection, rejectConnection, removeConnection,
      createTask, updateTaskStatus, toggleChecklistItem, addComment, deleteTask,
    }}>
      {children}
    </FamilyTaskContext.Provider>
  );
}

export const useFamilyTask = () => useContext(FamilyTaskContext);
