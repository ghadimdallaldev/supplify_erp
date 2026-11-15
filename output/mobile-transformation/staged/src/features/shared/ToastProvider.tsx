import { useAppLocale as useUiLocale } from "../../i18n";
import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import { haptic } from "../../components/ui/motion";
import { ToastBanner } from "../../components/ui";

type Toast = {
  id: number;
  message: string;
  tone?: "info" | "error" | "success";
};

const ToastContext = createContext<
  (message: string, tone?: Toast["tone"]) => void
>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  useUiLocale();

  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = useRef(0);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const showToast = useCallback(
    (message: string, tone: Toast["tone"] = "info") => {
      const id = ++nextId.current;
      if (tone === "success" || tone === "error") haptic(tone);
      setToasts((t) => [...t, { id, message, tone }]);
      timers.current.push(
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500),
      );
    },
    [],
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toasts.map((t) => (
        <ToastBanner key={t.id} message={t.message} tone={t.tone} />
      ))}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
