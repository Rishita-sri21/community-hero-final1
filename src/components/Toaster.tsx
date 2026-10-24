import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast, Toast } from '../lib/toast';

const DISPLAY_MS = 4000;

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return toast.subscribe((t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, DISPLAY_MS);
    });
  }, []);

  return createPortal(
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur-md ${
              t.kind === 'error'
                ? 'bg-red-50/95 border-red-200 text-red-800'
                : 'bg-emerald-50/95 border-emerald-200 text-emerald-800'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {t.kind === 'error' ? 'error' : 'check_circle'}
            </span>
            <span>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}
