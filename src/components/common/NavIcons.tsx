// Ícones do menu lateral (SVG em traço, herdam a cor do link via currentColor).

import { ReactNode } from 'react'

function Base({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {children}
    </svg>
  )
}

export const ICONES: Record<string, ReactNode> = {
  '/': <Base><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></Base>,
  '/fazenda-hoje': <Base><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></Base>,
  '/lotes': <Base><path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" /><path d="M3.5 12l8.5 4.5 8.5-4.5" /><path d="M3.5 16l8.5 4.5 8.5-4.5" /></Base>,
  '/pesagens': <Base><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M8 13a4 4 0 0 1 8 0" /><path d="M12 13l1.8-2.4" /></Base>,
  '/vendas': <Base><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0z" /><circle cx="8" cy="8" r="1.4" /></Base>,
  '/ranking': <Base><rect x="3.5" y="12" width="5" height="8.5" rx="1" /><rect x="9.5" y="5" width="5" height="15.5" rx="1" /><rect x="15.5" y="9" width="5" height="11.5" rx="1" /></Base>,
  '/comparativo': <Base><rect x="3.5" y="3.5" width="7" height="17" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="17" rx="1.5" /><path d="M6 8h2M16 8h2M6 12h2M16 12h2" /></Base>,
  '/importar': <Base><path d="M14 3.5H6.5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8z" /><path d="M14 3.5V8h4.5" /><path d="M12 11.5v5.5M9.2 14.2h5.6" /></Base>,
  '/dietas': <Base><path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z" /><path d="M9 4.5c0 1.5 1.5 1.5 1.5 3M14 4.5c0 1.5 1.5 1.5 1.5 3" /></Base>,
  '/ingredientes': <Base><path d="M5 19C5 10.5 10.5 5 20 4c-.8 9.5-6.5 15-15 15z" /><path d="M5 19l8.5-8.5" /></Base>,
  '/compras': <Base><path d="M3 4h2.5l2.2 11h10.6l2-8H7" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="16.5" cy="19.5" r="1.3" /></Base>,
  '/parceiros': <Base><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><circle cx="17" cy="9.5" r="2.7" /><path d="M17.5 14.6c2.3.3 3.8 2 4.1 4.9" /></Base>,
  '/relatorios': <Base><path d="M14 3.5H6.5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8z" /><path d="M14 3.5V8h4.5" /><path d="M8.5 12.5h7M8.5 16h7" /></Base>,
  '/config': <Base><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /><path d="M4 12h5M13 12h7" /><circle cx="11" cy="12" r="2" /></Base>,
  '/tutorial': <Base><path d="M2.5 5.5c3.2-1.2 6.6-1 9.5 1 2.9-2 6.3-2.2 9.5-1v13.5c-3.2-1.2-6.6-1-9.5 1-2.9-2-6.3-2.2-9.5-1z" /><path d="M12 6.5v13.5" /></Base>,
}

export const IconeSair = () => <Base><path d="M7.5 5.8a8 8 0 1 0 9 0" /><path d="M12 3v8" /></Base>

export const IconePainel = () => <Base><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9.5 4.5v15" /></Base>
