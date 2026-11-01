import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { User } from "../lib/api";
import { Google } from "./Icons";

interface Props {
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
}

export function Header({ user, onLogin, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <motion.header
      ref={ref}
      className="header glass"
      initial={{ opacity: 0, y: -16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
    >
      <span className="wordmark">タスくん</span>
      {user ? (
        <motion.button
          className="avatar glass"
          aria-label="アカウント"
          aria-expanded={open}
          whileTap={{ scale: 0.88 }}
          onClick={() => setOpen((v) => !v)}
        >
          {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : user.name.slice(0, 1)}
        </motion.button>
      ) : (
        <motion.button className="pill-btn glass" whileTap={{ scale: 0.92 }} onClick={onLogin}>
          <Google />
          ログイン
        </motion.button>
      )}
      <AnimatePresence>
        {open && user && (
          <motion.div
            className="menu glass"
            role="menu"
            initial={{ opacity: 0, scale: 0.6, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.7, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 480, damping: 30 }}
          >
            <div className="menu-email">{user.email}</div>
            <button
              className="menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              ログアウト
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
