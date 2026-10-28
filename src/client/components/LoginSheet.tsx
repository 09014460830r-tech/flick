import { motion } from "motion/react";
import { Google } from "./Icons";
import { Sheet } from "./Sheet";

export function LoginSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} label="ログイン" onClose={onClose}>
      <div className="sheet-head">ログイン</div>
      <motion.a className="google-btn glass" href="/auth/google" whileTap={{ scale: 0.96 }}>
        <Google />
        Googleでログイン
      </motion.a>
    </Sheet>
  );
}
