import { useState, useCallback } from 'react'

type TType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  msg: string
  type: TType
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((msg: string, type: TType = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  return { toasts, toast }
}

export function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null
  const items = toasts.map(t => {
    const cls = 'toast toast-' + t.type
    return <div key={t.id} className={cls}>{t.msg}</div>
  })
  return <div className="toast-wrap">{items}</div>
}
