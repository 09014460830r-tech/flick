import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useIsPresent,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import { BUCKETS, BUCKET_LABEL, nextBucket, type Bucket, type Task } from "../lib/api";
import { Check, ChevronLeft, Trash } from "./Icons";
import type { Filter } from "./Filters";
import { LiftGhost, type Lift } from "./LiftGhost";

export const BUCKET_COLOR: Record<Bucket, string> = {
  now: "#ff7a45",
  later: "#4c8dff",
  someday: "#a66bff",
  other: "#8c93b0",
};
const DONE = "#2fbf71";
const DANGER = "#ff4d6a";
const THRESHOLD = 88;
const LONG_PRESS_MS = 400;
const PRESS_SLOP = 8;
const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

interface Props {
  task: Task;
  nudge: boolean;
  /** Move to a bucket; a finished task also becomes unfinished. */
  onMove: (bucket: Bucket) => void;
  onDone: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onEdit: (text: string) => void;
  /** Long-press, drag and release over a tab. */
  onDropTo: (target: Filter) => void;
}

interface FlickAction {
  label: string;
  color: string;
  icon: ReactNode;
  run: () => void;
}

const fade = (hex: string, alpha: number) =>
  hex + Math.round(alpha * 255).toString(16).padStart(2, "0");

export function TaskCard({ task, nudge, onMove, onDone, onRestore, onDelete, onEdit, onDropTo }: Props) {
  const x = useMotionValue(0);
  const rowRef = useRef<HTMLLIElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const armed = useRef(0);
  const dragged = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const [lift, setLift] = useState<Lift | null>(null);
  const endLift = useCallback(() => setLift(null), []);

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  // Holding still on a card picks it up so it can be carried to a tab.
  const startPress = (clientX: number, clientY: number) => {
    cancelPress();
    const timer = window.setTimeout(() => {
      press.current = null;
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragged.current = true;
      x.set(0);
      navigator.vibrate?.(12);
      setLift({ startX: clientX, startY: clientY, rect });
    }, LONG_PRESS_MS);
    press.current = { timer, x: clientX, y: clientY };
  };
  useEffect(() => cancelPress, []);

  // A card flicked out of one tab can come straight back (another tab, or undo) before its
  // exit finishes; it is then reused as-is, so put it back at rest.
  const isPresent = useIsPresent();
  useEffect(() => {
    if (!isPresent) return;
    x.set(0);
    setExpanded(false);
  }, [isPresent, x]);

  // Right finishes a task; left postpones it to the next bucket (deleting from the last one).
  // A finished task flicked left goes back to the bucket it came from.
  const postponeTo = nextBucket(task.bucket);
  const right: FlickAction | null = task.done
    ? null
    : { label: "完了", color: DONE, icon: <Check size={18} />, run: onDone };
  const left: FlickAction = task.done
    ? { label: `「${BUCKET_LABEL[task.bucket]}」に戻す`, color: BUCKET_COLOR[task.bucket], icon: <ChevronLeft />, run: onRestore }
    : postponeTo
      ? { label: BUCKET_LABEL[postponeTo], color: BUCKET_COLOR[postponeTo], icon: <ChevronLeft />, run: () => onMove(postponeTo) }
      : { label: "削除", color: DANGER, icon: <Trash />, run: onDelete };
  const rightColor = right?.color ?? "#ffffff";

  const background = useTransform(
    x,
    [-THRESHOLD, -THRESHOLD * 0.5, 0, THRESHOLD * 0.5, THRESHOLD],
    [left.color, fade(left.color, 0.45), fade(left.color, 0), fade(rightColor, 0.45), rightColor],
  );
  const leftOpacity = useTransform(x, [0, THRESHOLD * 0.6], [0, 1]);
  const rightOpacity = useTransform(x, [-THRESHOLD * 0.6, 0], [1, 0]);
  const leftScale = useTransform(x, [0, THRESHOLD], [0.6, 1.08]);
  const rightScale = useTransform(x, [-THRESHOLD, 0], [1.08, 0.6]);
  const tilt = useTransform(x, [-240, 0, 240], [-2.5, 0, 2.5]);

  useMotionValueEvent(x, "change", (v) => {
    const zone = v > THRESHOLD && right ? 1 : v < -THRESHOLD ? -1 : 0;
    if (zone !== armed.current) {
      armed.current = zone;
      if (zone) navigator.vibrate?.(8);
    }
  });

  // One-time hint that cards can be flicked; any touch on the card cancels it.
  const hint = useRef<ReturnType<typeof animate> | null>(null);
  useEffect(() => {
    if (!nudge) return;
    hint.current = animate(x, [0, 54, 0, -38, 0], { delay: 0.9, duration: 1.6, ease: "easeInOut" });
    return () => hint.current?.stop();
  }, [nudge, x]);
  const stopHint = () => {
    hint.current?.stop();
    hint.current = null;
  };

  // Every flick moves the card out of the current tab, so it flies off and the row collapses.
  const commit = async (dir: 1 | -1, action: FlickAction) => {
    const width = rowRef.current?.offsetWidth ?? 400;
    await animate(x, dir * (width + 40), { duration: 0.2, ease: [0.4, 0, 1, 1] });
    action.run();
  };

  const settle = (dx: number, vx: number) => {
    const dir = dx > THRESHOLD || (vx > 650 && dx > 32) ? 1 : dx < -THRESHOLD || (vx < -650 && dx < -32) ? -1 : 0;
    if (dir === 1 && right) return commit(1, right);
    if (dir === -1) return commit(-1, left);
    animate(x, 0, spring);
  };

  const saveDraft = () => {
    if (draft.trim() && draft.trim() !== task.text) onEdit(draft);
    else setDraft(task.text);
  };

  const buttonIn = (i: number) => ({
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0, transition: { delay: 0.03 * i } },
    whileTap: { scale: 0.9 },
  });

  return (
    <motion.li
      ref={rowRef}
      className="row"
      data-testid="task"
      data-bucket={task.bucket}
      data-done={task.done}
      layout="position"
      initial={{ opacity: 0, y: -14, scale: 0.96, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
    >
      <motion.div className="reveal" style={{ background }} aria-hidden>
        <motion.span className="reveal-side" style={{ opacity: leftOpacity, scale: leftScale }}>
          {right && (
            <>
              {right.icon}
              {right.label}
            </>
          )}
        </motion.span>
        <motion.span className="reveal-side" style={{ opacity: rightOpacity, scale: rightScale }}>
          {left.label}
          {left.icon}
        </motion.span>
      </motion.div>

      <motion.div
        className="card glass"
        style={{ x, rotate: tilt }}
        drag={expanded || lift ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 1, right: right ? 1 : 0.12 }}
        dragMomentum={false}
        ref={cardRef}
        onPointerDown={(e) => {
          dragged.current = false;
          stopHint();
          if (!expanded && e.button === 0) startPress(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > PRESS_SLOP) cancelPress();
        }}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={() => {
          dragged.current = true;
          cancelPress();
        }}
        onDragEnd={(_, info) => settle(info.offset.x, info.velocity.x)}
        whileTap={expanded ? undefined : { scale: 0.985 }}
        animate={{ opacity: lift ? 0.35 : 1, scale: lift ? 0.97 : 1 }}
        onTap={(e) => {
          if (dragged.current || (e.target as HTMLElement).closest("textarea, button")) return;
          setExpanded((v) => !v);
        }}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        aria-label={`${task.text}（${task.done ? "完了" : BUCKET_LABEL[task.bucket]}）`}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          stopHint();
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          } else if (e.key === "ArrowRight" && right) commit(1, right);
          else if (e.key === "ArrowLeft") commit(-1, left);
        }}
      >
        <motion.span
          className="status-dot"
          data-done={task.done}
          style={{ color: task.done ? DONE : BUCKET_COLOR[task.bucket] }}
          initial={{ scale: 0.2, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 18 }}
        >
          {task.done && (
            <span style={{ color: "#fff", display: "grid" }}>
              <Check size={12} />
            </span>
          )}
        </motion.span>
        <div className="task-body">
          {expanded ? (
            <textarea
              className="editor"
              aria-label="タスクを編集"
              value={draft}
              rows={Math.min(6, draft.split("\n").length + 1)}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                  setExpanded(false);
                }
              }}
            />
          ) : (
            <div className={`task-text ${task.done ? "done" : ""}`}>
              {task.text}
              <motion.span
                className="strike"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: task.done ? 1 : 0 }}
                transition={{ duration: 0.35, delay: 0.15, ease: [0.65, 0, 0.35, 1] }}
              />
            </div>
          )}
          {task.done && !expanded && (
            <div>
              <span className="chip" style={{ background: BUCKET_COLOR[task.bucket] }}>
                {BUCKET_LABEL[task.bucket]}
              </span>
            </div>
          )}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="actions"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                style={{ overflow: "hidden" }}
              >
                <div className="card-actions">
                  {BUCKETS.map((b, i) => {
                    const current = !task.done && task.bucket === b;
                    return (
                      <motion.button
                        key={b}
                        type="button"
                        className="mini-btn"
                        aria-pressed={current}
                        style={current ? { background: BUCKET_COLOR[b] } : undefined}
                        {...buttonIn(i)}
                        onClick={() => !current && onMove(b)}
                      >
                        {BUCKET_LABEL[b]}
                      </motion.button>
                    );
                  })}
                  <motion.button
                    type="button"
                    className="mini-btn"
                    aria-pressed={task.done}
                    style={task.done ? { background: DONE } : undefined}
                    {...buttonIn(4)}
                    onClick={task.done ? onRestore : onDone}
                  >
                    <Check size={13} />
                    完了
                  </motion.button>
                  <motion.button
                    type="button"
                    className="mini-btn danger"
                    aria-label="削除"
                    {...buttonIn(5)}
                    onClick={onDelete}
                  >
                    <Trash />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      {lift && (
        <LiftGhost
          lift={lift}
          text={task.text}
          current={task.done ? "done" : task.bucket}
          onDrop={onDropTo}
          onEnd={endLift}
        />
      )}
    </motion.li>
  );
}
