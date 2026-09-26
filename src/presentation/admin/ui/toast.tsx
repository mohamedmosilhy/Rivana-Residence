"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error";
type Toast = Readonly<{ id: number; message: string; tone: ToastTone }>;

const TOAST_TIMEOUT_MS = 6000;

const ToastContext = createContext<
  ((message: string, tone?: ToastTone) => void) | null
>(null);

// One polite live region for the whole admin. It is rendered empty on first
// paint so screen readers register it before the first announcement.
export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = "success") => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((current) => [...current.slice(-2), { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_TIMEOUT_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed right-4 bottom-4 z-50 grid w-[min(24rem,calc(100vw-2rem))] gap-2"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex animate-[admin-toast-in_var(--motion-surface)_ease-out] items-start justify-between gap-3 rounded-control border border-l-4 border-neutral-300 bg-surface py-3 pr-3 pl-4 shadow-[var(--shadow-md)] ${toast.tone === "error" ? "border-l-danger" : "border-l-success"}`}
          >
            <p className="m-0 pt-1 text-neutral-800">{toast.message}</p>
            <button
              type="button"
              className="min-h-9 min-w-9 cursor-pointer rounded-control border-0 bg-transparent text-[1.25rem] leading-none text-neutral-600"
              onClick={() => dismiss(toast.id)}
            >
              <span aria-hidden="true">×</span>
              <span className="visually-hidden">Dismiss notification</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside ToastProvider.");
  return show;
}
