import { useEffect } from 'react';
import { useToastStore, type Toast } from '../stores/toastStore.js';
import { X, Info, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

const icons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};

const colors = {
  info: 'bg-blue-500',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const Icon = icons[toast.type];

  useEffect(() => {
    if (toast.duration > 0) {
      const timer = setTimeout(() => removeToast(toast.id), toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, removeToast]);

  return (
    <div
      className="pointer-events-auto flex w-80 items-start gap-3 rounded-lg bg-slate-800 p-4 shadow-lg border border-slate-700 animate-in slide-in-from-right"
      role="alert"
    >
      <div className={`mt-0.5 rounded-full p-1 ${colors[toast.type]}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <p className="flex-1 text-sm text-white">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="ml-2 text-slate-400 hover:text-white transition-colors"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
