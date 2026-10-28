import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

interface Props {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ open, label, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            className="sheet glass"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.9 }}
            onDragEnd={(_, info) => (info.offset.y > 110 || info.velocity.y > 700) && onClose()}
          >
            <div className="grabber" />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
