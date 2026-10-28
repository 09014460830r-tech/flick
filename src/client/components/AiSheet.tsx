import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../lib/api";
import { Check, Sparkle } from "./Icons";
import { Sheet } from "./Sheet";

export interface AiRequest {
  mode: "split" | "breakdown";
  text: string;
  onAdded?: () => void;
}

interface Props {
  request: AiRequest | null;
  onClose: () => void;
  onAdd: (texts: string[]) => void;
}

type Phase = { kind: "loading" } | { kind: "error" } | { kind: "ready"; items: string[] };

export function AiSheet({ request, onClose, onAdd }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!request) return;
    let alive = true;
    setPhase({ kind: "loading" });
    api
      .suggest(request.mode, request.text)
      .then((items) => {
        if (!alive) return;
        setPhase({ kind: "ready", items });
        setSelected(new Set(items.map((_, i) => i)));
      })
      .catch(() => alive && setPhase({ kind: "error" }));
    return () => {
      alive = false;
    };
  }, [request, attempt]);

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <Sheet open={!!request} label="AI" onClose={onClose}>
      <div className="sheet-head">
        <motion.span
          style={{ color: "var(--accent)", display: "grid" }}
          animate={phase.kind === "loading" ? { rotate: 360, scale: [1, 1.25, 1] } : { rotate: 0, scale: 1 }}
          transition={phase.kind === "loading" ? { repeat: Infinity, duration: 1.6, ease: "linear" } : {}}
        >
          <Sparkle size={22} />
        </motion.span>
        {request?.mode === "breakdown" ? "AIで分解" : "AIで分割"}
      </div>

      <AnimatePresence mode="wait">
        {phase.kind === "loading" && (
          <motion.div key="loading" data-testid="ai-loading" exit={{ opacity: 0 }}>
            {[82, 64, 74].map((w, i) => (
              <div key={i} className="suggestion skel" style={{ ["--d" as string]: `${i * 0.1}s` }}>
                <span className="skel-line" style={{ width: 22, height: 22, borderRadius: 7 }} />
                <span className="skel-line" style={{ width: `${w}%` }} />
              </div>
            ))}
          </motion.div>
        )}
        {phase.kind === "error" && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <button className="primary-btn" onClick={() => setAttempt((a) => a + 1)}>
              再試行
            </button>
          </motion.div>
        )}
        {phase.kind === "ready" && (
          <motion.div key="ready">
            {phase.items.map((item, i) => (
              <motion.button
                key={item}
                type="button"
                role="checkbox"
                aria-checked={selected.has(i)}
                className="suggestion"
                data-testid="suggestion"
                initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ type: "spring", stiffness: 380, damping: 30, delay: i * 0.06 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => toggle(i)}
              >
                <span className="check">{selected.has(i) && <Check />}</span>
                {item}
              </motion.button>
            ))}
            <motion.button
              className="primary-btn"
              disabled={selected.size === 0}
              whileTap={{ scale: 0.96 }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { delay: phase.items.length * 0.06 } }}
              onClick={() => {
                onAdd(phase.items.filter((_, i) => selected.has(i)));
                request?.onAdded?.();
                onClose();
              }}
            >
              {selected.size}件追加
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
