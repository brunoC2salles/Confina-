import { useState, useCallback } from 'react'

type TType = 'success'|'error'|'info'
interface Toast { id: number; msg: string; type: TType }

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const toast = useCallback((msg: string, type: TType = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }, [])
  return { toasts, toast }
}

export function ToastContainer({ toasts }: { toasts: { id: number; msg: string; type: string }[] }) {
  if (!toasts.length) return null
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
      ))}
    </div>
  )
}
