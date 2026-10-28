import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { dismissToast, type Toast as ToastData } from "../lib/store";

export function Toast({ toast }: { toast: ToastData | null }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, toast.action ? 5000 : 2600);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="toast-wrap">
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.div
            key={toast.id}
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 460, damping: 30 }}
          >
            {toast.message}
            {toast.action && <button onClick={toast.action.run}>{toast.action.label}</button>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
