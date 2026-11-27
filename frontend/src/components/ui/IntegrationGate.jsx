import React from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import EmptyState from './EmptyState'

// Shared "not connected yet" gate for every OAuth-backed workspace page
// (Google Drive/Tasks, Outlook Mail/Calendar/OneDrive/To Do, Slack) —
// same connect-then-redirect flow Settings.jsx already uses, so a page
// reached directly via URL (not just via Settings) still offers to connect.
export default function IntegrationGate({ name, icon, statusFn, connectFn, children }) {
  const { data: status, isLoading } = useQuery({ queryKey: [`gate:${name}`], queryFn: statusFn, staleTime: 30000 })

  if (isLoading) return <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />

  if (!status?.connected) {
    return (
      <EmptyState
        icon={icon}
        title={`${name} isn't connected`}
        body="Connect it from Settings → Integrations, or right here."
        action={
          <button
            className="btn-primary"
            onClick={async () => {
              try { const { url } = await connectFn(); window.location.href = url }
              catch (err) { toast.error(err.response?.data?.error || err.message || `Could not connect ${name}`) }
            }}
          >
            Connect {name}
          </button>
        }
      />
    )
  }

  return children
}
