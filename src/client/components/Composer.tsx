import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Sparkle } from "./Icons";

const DRAFT_KEY = "flick:draft";
const readDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
};

interface Props {
  onSubmit: (text: string) => void;
  onAi: (text: string, clear: () => void) => void;
}

export function Composer({ onSubmit, onAi }: Props) {
  const [text, setText] = useState(readDraft);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const hasText = text.trim().length > 0;

  // Focus as early as possible so typing can start the instant the page appears.
  useLayoutEffect(() => ref.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    try {
      if (text) localStorage.setItem(DRAFT_KEY, text);
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, [text]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // Any printable key pressed outside an input goes straight into the memo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
      if (target.closest("input, textarea, [contenteditable], [role=dialog]")) return;
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    if (!hasText) return;
    onSubmit(text.trim());
    setText("");
    ref.current?.focus();
  };

  return (
    <motion.form
      className={`composer glass ${focused ? "focused" : ""}`}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="memo" className="sr-only">
        メモ
      </label>
      <textarea
        id="memo"
        ref={ref}
        rows={1}
        value={text}
        placeholder="メモ"
        enterKeyHint="send"
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          // Respect IME composition: Enter that confirms a kana conversion must not submit.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <AnimatePresence initial={false}>
        {hasText && (
          <motion.button
            key="ai"
            type="button"
            className="icon-btn ai-btn"
            aria-label="AIでタスクに分割"
            initial={{ opacity: 0, scale: 0.4, rotate: -45 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.4, rotate: 45 }}
            whileTap={{ scale: 0.85 }}
            transition={{ type: "spring", stiffness: 500, damping: 26 }}
            onClick={() => onAi(text.trim(), () => setText(""))}
          >
            <Sparkle />
          </motion.button>
        )}
      </AnimatePresence>
      <motion.button
        type="submit"
        className="icon-btn send-btn"
        aria-label="追加"
        disabled={!hasText}
        animate={{ scale: hasText ? 1 : 0.86, opacity: hasText ? 1 : 0.5, y: hasText ? 0 : 2 }}
        whileTap={{ scale: 0.82 }}
        transition={{ type: "spring", stiffness: 520, damping: 24 }}
      >
        <ArrowUp />
      </motion.button>
    </motion.form>
  );
}
