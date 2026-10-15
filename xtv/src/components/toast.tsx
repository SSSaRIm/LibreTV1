'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// —— Toast —— 替代旧版 3 秒/条串行队列，支持并行堆叠与自动过期；
// 支持可选操作按钮（如「撤销」），用于轻量破坏性操作的即时回退。
// 增强反馈：入场/退场动画 + 剩余时间进度条

export type ToastType = 'error' | 'success' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** 操作按钮，例如删除后的「撤销」；点击后该条提示立即消失 */
  action?: ToastAction;
  /** 展示时长（ms）；带 action 的操作默认 6000，普通提示默认 3000 */
  duration?: number;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
  duration: number;
  /** 退场标记：为 true 时播放 toast-out 动画后再从 DOM 移除 */
  leaving?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

// 用实心底色（-solid，深一档）：保证白字对比度达标（普通语义色配白字仅 2-3:1）
const TYPE_STYLES: Record<ToastType, string> = {
  error: 'bg-danger-solid',
  success: 'bg-success-solid',
  info: 'bg-info-solid',
  warning: 'bg-warning-solid',
};

const TYPE_ICONS: Record<ToastType, ReactNode> = {
  success: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    // 先标记 leaving 播放退场动画，动画结束后移除
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => removeItem(id), 200);
  }, [removeItem]);

  const toast = useCallback(
    (message: string, type: ToastType = 'info', options?: ToastOptions) => {
      const id = ++idRef.current;
      const duration = options?.duration ?? (options?.action ? 6000 : 3000);
      setItems((prev) => [...prev.slice(-3), { id, message, type, action: options?.action, duration }]);
      timersRef.current.set(
        id,
        setTimeout(() => {
          timersRef.current.delete(id);
          setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
          setTimeout(() => removeItem(id), 200);
        }, duration)
      );
    },
    [removeItem]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={cn(
              'relative overflow-hidden px-4 py-2.5 rounded-xl shadow-lg text-white text-sm max-w-md',
              'flex items-center gap-2.5 pointer-events-auto',
              'animate-toast-in',
              t.leaving && 'animate-toast-out',
              TYPE_STYLES[t.type]
            )}
          >
            {TYPE_ICONS[t.type]}
            <span>{t.message}</span>
            {t.action && (
              <button
                className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
                onClick={() => {
                  dismiss(t.id);
                  t.action?.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            {/* 剩余时间进度条：从左到右收缩，提供直观的消失反馈 */}
            <div
              className="absolute bottom-0 left-0 h-0.5 bg-white/40 animate-[shrink_linear]"
              style={{ animationDuration: `${t.duration}ms` }}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
