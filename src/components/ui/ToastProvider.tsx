import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import './toast.css';

export type ToastType = 'success' | 'error' | 'info';

interface ToastInput {
  id?: string;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastItem extends ToastInput {
  id: string;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const defaultTitles: Record<ToastType, string> = {
  success: 'Tudo certo',
  error: 'Algo deu errado',
  info: 'Informação',
};

const toastIcons = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((input: ToastInput) => {
    const id = input.id ?? `toast-${++nextId.current}`;

    setToasts((current) => {
      const latest = current.at(-1);
      if (
        latest &&
        latest.type === input.type &&
        latest.title === input.title &&
        latest.message === input.message
      ) {
        return current;
      }

      const existing = current.find((toast) => toast.id === id);
      if (
        existing &&
        existing.type === input.type &&
        existing.title === input.title &&
        existing.message === input.message
      ) {
        return current;
      }

      const nextToast: ToastItem = { ...input, id };
      return [...current.filter((toast) => toast.id !== id), nextToast].slice(-3);
    });
  }, []);

  const value = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-label="Notificações">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = toastIcons[toast.type];
            const title = toast.title ?? defaultTitles[toast.type];

            return (
              <motion.div
                layout="position"
                key={toast.id}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                role={toast.type === 'error' ? 'alert' : 'status'}
                aria-atomic="true"
                className={`kindra-toast kindra-toast-${toast.type}`}
              >
                <Icon className="kindra-toast-icon" size={20} aria-hidden="true" />
                <div className="kindra-toast-content">
                  <strong>{title}</strong>
                  <span>{toast.message}</span>
                </div>
                <button
                  type="button"
                  className="kindra-toast-dismiss"
                  aria-label="Dispensar notificação"
                  onClick={() => dismissToast(toast.id)}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de ToastProvider.');
  }
  return context;
}
