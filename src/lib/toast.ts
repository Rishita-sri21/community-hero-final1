// A tiny app-wide notification channel: any component can call toast.success()/toast.error(),
// and the single <Toaster/> mounted in App displays them. No context or prop drilling needed.

export type ToastKind = 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (toast: Toast) => void;

const listeners = new Set<Listener>();
let nextId = 1;

function emit(kind: ToastKind, message: string) {
  const t = { id: nextId++, kind, message };
  listeners.forEach((listener) => listener(t));
}

export const toast = {
  success: (message: string) => emit('success', message),
  error: (message: string) => emit('error', message),
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

// Turns anything thrown into a readable message
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.') {
  return err instanceof Error && err.message ? err.message : fallback;
}
