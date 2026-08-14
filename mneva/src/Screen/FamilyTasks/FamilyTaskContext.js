import React, { createContext, useContext, useState } from 'react';

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

export const PRIORITIES   = ['Low', 'Medium', 'High', 'Urgent'];
export const CATEGORIES   = ['Household', 'Health', 'Finance', 'Shopping', 'School', 'Errands', 'Other'];
export const RECURRENCES  = ['None', 'Daily', 'Weekly', 'Monthly'];

// Simulated "current user" — in production this comes from auth
export const CURRENT_USER = { id: 'me', name: 'You' };

export function FamilyTaskProvider({ children }) {
  const [connections, setConnections] = useState([]);
  const [tasks, setTasks]             = useState([]);

  // ── Connections ──
  const sendRequest = (name, relationship, email = '') => {
    setConnections(p => [...p, {
      id: Date.now().toString(),
      name, relationship, email,
      status: 'PENDING',
      direction: 'SENT',
    }]);
  };

  // Simulate receiving a request from someone (for demo)
  const receiveRequest = (name, relationship) => {
    setConnections(p => [...p, {
      id: Date.now().toString(),
      name, relationship,
      status: 'PENDING',
      direction: 'RECEIVED',
    }]);
  };

  const acceptConnection  = (id) => setConnections(p => p.map(c => c.id === id ? { ...c, status: 'ACCEPTED' } : c));
  const rejectConnection  = (id) => setConnections(p => p.map(c => c.id === id ? { ...c, status: 'REJECTED' } : c));
  const removeConnection  = (id) => setConnections(p => p.filter(c => c.id !== id));

  // ── Tasks ──
  const createTask = (data) => {
    const status = data.assignedTo ? 'PENDING_ACCEPTANCE' : 'DRAFT';
    setTasks(p => [{
      id: Date.now().toString(),
      ...data,
      status,
      createdBy: CURRENT_USER.name,
      createdAt: new Date().toISOString(),
      comments: [],
      checklist: data.checklist || [],
    }, ...p]);
  };

  const updateTaskStatus = (id, status) =>
    setTasks(p => p.map(t => t.id === id ? { ...t, status } : t));

  const addComment = (id, text) =>
    setTasks(p => p.map(t => t.id === id
      ? { ...t, comments: [...t.comments, { id: Date.now().toString(), text, by: CURRENT_USER.name, at: new Date().toISOString() }] }
      : t));

  const toggleChecklistItem = (taskId, itemId) =>
    setTasks(p => p.map(t => t.id === taskId
      ? { ...t, checklist: t.checklist.map(i => i.id === itemId ? { ...i, done: !i.done } : i) }
      : t));

  const deleteTask = (id) => setTasks(p => p.filter(t => t.id !== id));

  return (
    <FamilyTaskContext.Provider value={{
      connections, sendRequest, receiveRequest,
      acceptConnection, rejectConnection, removeConnection,
      tasks, createTask, updateTaskStatus, addComment,
      toggleChecklistItem, deleteTask,
    }}>
      {children}
    </FamilyTaskContext.Provider>
  );
}

export const useFamilyTask = () => useContext(FamilyTaskContext);
