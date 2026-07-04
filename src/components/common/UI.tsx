// ─── Modal ───────────────────────────────────────────────────────────────────
import { ReactNode, useEffect } from 'react'

export function Modal({ open, onClose, title, subtitle, children, size = 'md' }:
  { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; size?: 'sm'|'md'|'lg' }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${size === 'lg' ? ' modal-lg' : size === 'sm' ? ' modal-sm' : ''}`}>
        <div className="modal-header">
          <h2 style={{ fontSize: '17px', fontWeight: 600 }}>{title}</h2>
          {subtitle && <p style={{ fontSize: '13px', color: '#9e9e9e', marginTop: '4px' }}>{subtitle}</p>}
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, action }:
  { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex-between" style={{ marginBottom: '24px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 600 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: '13px', color: '#9e9e9e', marginTop: '3px' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ icon = '◈', title, desc, action }:
  { icon?: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {action}
    </div>
  )
}
