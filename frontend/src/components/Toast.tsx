import { useEffect } from "react";
import { useAppStore } from "../store";

export function ToastStack() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);

  useEffect(() => {
    if (toasts.length === 0) return;

    const timers = toasts.map((t) =>
      window.setTimeout(() => {
        removeToast(t.id);
      }, 4000)
    );

    return () => {
      timers.forEach((id) => clearTimeout(id));
    };
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div className="toast-title">{t.title}</div>
          <div className="toast-body">{t.body}</div>
        </div>
      ))}
    </div>
  );
}