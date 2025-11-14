import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

type Toast = {
    id: number;
    type: ToastType;
    message: string;
};

type ToastContextValue = {
    show: (message: string, type?: ToastType, timeoutMs?: number) => void;
    success: (message: string, timeoutMs?: number) => void;
    error: (message: string, timeoutMs?: number) => void;
    info: (message: string, timeoutMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
    return ctx;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const idRef = useRef(1);

    const remove = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const push = useCallback((message: string, type: ToastType = 'info', timeoutMs = 3500) => {
        if (!message) return;
        const id = idRef.current++;
        setToasts(prev => [...prev, { id, type, message }]);
        if (timeoutMs > 0) {
            window.setTimeout(() => remove(id), timeoutMs);
        }
    }, [remove]);

    const value = useMemo<ToastContextValue>(() => ({
        show: (m, t = 'info', ms) => push(m, t, ms),
        success: (m, ms) => push(m, 'success', ms),
        error: (m, ms) => push(m, 'error', ms),
        info: (m, ms) => push(m, 'info', ms),
    }), [push]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="toast-container" aria-live="polite" aria-atomic="true">
                {toasts.map(t => (
                    <div key={t.id} className={`toast ${t.type === 'success' ? 'toast-success' : t.type === 'error' ? 'toast-error' : 'toast-info'}`}>
                        <div className="toast-message">{t.message}</div>
                        <button className="toast-close" aria-label="Close" onClick={() => remove(t.id)}>×</button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export default ToastProvider;
