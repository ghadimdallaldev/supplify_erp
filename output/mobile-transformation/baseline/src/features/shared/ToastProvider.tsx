import React, { createContext, useCallback, useContext, useState } from 'react'
import { ToastBanner } from '../../components/ui'

type Toast = { id: number; message: string; tone?: 'info' | 'error' | 'success' }

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now()
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toasts.map((t) => (
        <ToastBanner key={t.id} message={t.message} tone={t.tone} />
      ))}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
