import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import { STATUS_LABEL, STATUS_ORDER, nextStatus, prevStatus, type Status, type Task } from "../lib/api";
import { Check, ChevronLeft, ChevronRight, Sparkle, Trash } from "./Icons";

export const STATUS_COLOR: Record<Status, string> = { todo: "#8c93b0", doing: "#ff9f2e", done: "#2fbf71" };
const DANGER = "#ff4d6a";
const THRESHOLD = 88;
const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

interface Props {
  task: Task;
  nudge: boolean;
  staysVisible: (status: Status) => boolean;
  onStatus: (status: Status) => void;
  onDelete: () => void;
  onEdit: (text: string) => void;
  onBreakdown: () => void;
}

const fade = (hex: string, alpha: number) =>
  hex + Math.round(alpha * 255).toString(16).padStart(2, "0");

export function TaskCard({ task, nudge, staysVisible, onStatus, onDelete, onEdit, onBreakdown }: Props) {
  const x = useMotionValue(0);
  const rowRef = useRef<HTMLLIElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const armed = useRef(0);
  const dragged = useRef(false);

  const next = nextStatus(task.status);
  const prev = prevStatus(task.status);
  const rightColor = next ? STATUS_COLOR[next] : STATUS_COLOR[task.status];
  const leftColor = prev ? STATUS_COLOR[prev] : DANGER;

  const background = useTransform(
    x,
    [-THRESHOLD, -THRESHOLD * 0.5, 0, THRESHOLD * 0.5, THRESHOLD],
    [leftColor, fade(leftColor, 0.45), fade(leftColor, 0), fade(rightColor, 0.45), rightColor],
  );
  const leftOpacity = useTransform(x, [0, THRESHOLD * 0.6], [0, 1]);
  const rightOpacity = useTransform(x, [-THRESHOLD * 0.6, 0], [1, 0]);
  const leftScale = useTransform(x, [0, THRESHOLD], [0.6, 1.08]);
  const rightScale = useTransform(x, [-THRESHOLD, 0], [1.08, 0.6]);
  const tilt = useTransform(x, [-240, 0, 240], [-2.5, 0, 2.5]);

  useMotionValueEvent(x, "change", (v) => {
    const zone = v > THRESHOLD && next ? 1 : v < -THRESHOLD ? -1 : 0;
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

  const commit = async (dir: 1 | -1, target: Status | null) => {
    const width = rowRef.current?.offsetWidth ?? 400;
    const leaving = target === null || !staysVisible(target);
    await animate(x, dir * (width + 40), { duration: 0.2, ease: [0.4, 0, 1, 1] });
    if (target) onStatus(target);
    else onDelete();
    if (!leaving) animate(x, 0, { type: "spring", stiffness: 260, damping: 24 });
  };

  const settle = (dx: number, vx: number) => {
    const dir = dx > THRESHOLD || (vx > 650 && dx > 32) ? 1 : dx < -THRESHOLD || (vx < -650 && dx < -32) ? -1 : 0;
    if (dir === 1 && next) return commit(1, next);
    if (dir === -1) return commit(-1, prev);
    animate(x, 0, spring);
  };

  const saveDraft = () => {
    if (draft.trim() && draft.trim() !== task.text) onEdit(draft);
    else setDraft(task.text);
  };

  return (
    <motion.li
      ref={rowRef}
      className="row"
      data-testid="task"
      data-status={task.status}
      layout="position"
      initial={{ opacity: 0, y: -14, scale: 0.96, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
    >
      <motion.div className="reveal" style={{ background }} aria-hidden>
        <motion.span className="reveal-side" style={{ opacity: leftOpacity, scale: leftScale }}>
          {next && (
            <>
              {next === "done" ? <Check size={18} /> : <ChevronRight />}
              {STATUS_LABEL[next]}
            </>
          )}
        </motion.span>
        <motion.span className="reveal-side" style={{ opacity: rightOpacity, scale: rightScale }}>
          {prev ? (
            <>
              {STATUS_LABEL[prev]}
              <ChevronLeft />
            </>
          ) : (
            <>
              削除
              <Trash />
            </>
          )}
        </motion.span>
      </motion.div>

      <motion.div
        className="card glass"
        style={{ x, rotate: tilt }}
        drag={expanded ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 1, right: next ? 1 : 0.12 }}
        dragMomentum={false}
        onPointerDown={() => {
          dragged.current = false;
          stopHint();
        }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(_, info) => settle(info.offset.x, info.velocity.x)}
        whileTap={expanded ? undefined : { scale: 0.985 }}
        onTap={(e) => {
          if (dragged.current || (e.target as HTMLElement).closest("textarea, button")) return;
          setExpanded((v) => !v);
        }}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        aria-label={`${task.text}（${STATUS_LABEL[task.status]}）`}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          stopHint();
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          } else if (e.key === "ArrowRight" && next) commit(1, next);
          else if (e.key === "ArrowLeft") commit(-1, prev);
        }}
      >
        <StatusDot status={task.status} />
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
            <div className={`task-text ${task.status === "done" ? "done" : ""}`}>
              {task.text}
              <motion.span
                className="strike"
                initial={false}
                animate={{ scaleX: task.status === "done" ? 1 : 0 }}
                transition={{ duration: 0.35, ease: [0.65, 0, 0.35, 1] }}
              />
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
                  {STATUS_ORDER.map((s, i) => (
                    <motion.button
                      key={s}
                      type="button"
                      className="mini-btn"
                      aria-pressed={task.status === s}
                      style={task.status === s ? { background: STATUS_COLOR[s] } : undefined}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: 0.03 * i } }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => onStatus(s)}
                    >
                      {STATUS_LABEL[s]}
                    </motion.button>
                  ))}
                  <motion.button
                    type="button"
                    className="mini-btn ai"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onBreakdown}
                  >
                    <Sparkle size={15} />
                    AIで分解
                  </motion.button>
                  <motion.button
                    type="button"
                    className="mini-btn danger"
                    aria-label="削除"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.13 } }}
                    whileTap={{ scale: 0.9 }}
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
    </motion.li>
  );
}

function StatusDot({ status }: { status: Status }) {
  const mounted = useRef(false);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (mounted.current && status === "done") setBurst((b) => b + 1);
    mounted.current = true;
  }, [status]);
  return (
    <span style={{ position: "relative", flex: "none" }}>
      <motion.span
        key={status}
        className="status-dot"
        data-status={status}
        initial={mounted.current ? { scale: 0.2, rotate: -90 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 600, damping: 18 }}
      >
        {status === "done" && <span style={{ color: "#fff", display: "grid" }}><Check size={12} /></span>}
      </motion.span>
      {burst > 0 &&
        Array.from({ length: 8 }, (_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          return (
            <motion.span
              key={`${burst}-${i}`}
              style={{
                position: "absolute",
                left: 9,
                top: 11,
                width: 5,
                height: 5,
                borderRadius: 3,
                background: i % 2 ? STATUS_COLOR.done : "#9a5cff",
                pointerEvents: "none",
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: Math.cos(angle) * 22, y: Math.sin(angle) * 22, opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
          );
        })}
    </span>
  );
}
