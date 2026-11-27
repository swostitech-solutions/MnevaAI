import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import IntegrationGate from '../ui/IntegrationGate'
import EmptyState from '../ui/EmptyState'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const up = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

// Generic file list — backs Google Docs/Sheets/Slides/Drive AND Outlook
// OneDrive/Word/Excel/PowerPoint, which only differ in which API + type
// param they call and which icon fits. Each file is just opened via its
// own webViewLink/url in a new tab (same as mobile's Linking.openURL).
export default function FilesBrowserPage({ title, icon, backTo, backLabel, integrationName, statusFn, connectFn, listFn, emptyBody }) {
  const { data: files, isLoading } = useQuery({ queryKey: [`files:${title}`], queryFn: listFn })

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={up} style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <Link to={backTo} style={{ fontSize: 12, color: 'var(--ink3)', textDecoration: 'none' }}>{backLabel}</Link>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>{icon} {title}</div>
      </motion.div>

      <IntegrationGate name={integrationName} icon={icon} statusFn={statusFn} connectFn={connectFn}>
        {isLoading && <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />}
        {!isLoading && (!files || files.length === 0) && (
          <EmptyState icon={icon} title={`No ${title.toLowerCase()} found`} body={emptyBody} />
        )}
        {!isLoading && files?.length > 0 && (
          <motion.div variants={up} className="card" style={{ padding: 8 }}>
            {files.map(f => {
              const link = f.webViewLink || f.url
              const modified = f.modifiedTime || f.modifiedAt
              return (
                <a key={f.id} href={link} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, textDecoration: 'none', color: 'var(--ink1)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--depth3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                    {modified && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Modified {new Date(modified).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--pulse2)' }}>Open →</span>
                </a>
              )
            })}
          </motion.div>
        )}
      </IntegrationGate>
    </motion.div>
  )
}
