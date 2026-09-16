// ─── Modal ───────────────────────────────────────────────────────────────────
import { ReactNode } from 'react'

export function Modal({ open, onClose, title, subtitle, children, size = 'md', footer }:
  { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; size?: 'sm'|'md'|'lg'|'xl'; footer?: ReactNode }) {
  if (!open) return null
  return (
    <div className="modal-backdrop">
      <div className={`modal${size === 'xl' ? ' modal-xl' : size === 'lg' ? ' modal-lg' : size === 'sm' ? ' modal-sm' : ''}`}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 600 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: '13px', color: '#9e9e9e', marginTop: '4px' }}>{subtitle}</p>}
          </div>
          <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
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
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {action}
    </div>
  )
}
