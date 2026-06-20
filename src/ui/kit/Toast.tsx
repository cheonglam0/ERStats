import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastItem = { id: number; msg: string };

const ToastCtx = createContext<(msg: string) => void>(() => {});

/** 토스트 트리거 훅 — `const toast = useToast(); toast("복사됨")`. */
export function useToast() {
  return useContext(ToastCtx);
}

/** 앱 루트를 감싸 transient 알림을 화면 하단에 띄운다. (인라인 "복사됨 ✓" 대체) */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, msg }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 1800);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
