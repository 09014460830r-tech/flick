import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import type { Filter } from "./Filters";

export interface Lift {
  /** Pointer position when the card was picked up. */
  startX: number;
  startY: number;
  /** Where the card sat on screen, so the ghost starts on top of it. */
  rect: DOMRect;
}

interface Props {
  lift: Lift;
  text: string;
  /** The tab the task already lives in; dropping in its lane does nothing. */
  current: Filter;
  onDrop: (target: Filter) => void;
  onEnd: () => void;
}

interface Lane {
  filter: Filter;
  tab: HTMLElement;
  /** Horizontal span of the lane: the tab's column, stretched to meet its neighbours. */
  left: number;
  right: number;
  /** Where the lane starts, just below the tab bar. */
  top: number;
}

/** Each tab claims the whole column of screen beneath it while a card is being carried. */
function measureLanes(): Lane[] {
  const tabs = [...document.querySelectorAll<HTMLElement>("[role=tab][data-filter]")];
  const rects = tabs.map((t) => t.getBoundingClientRect());
  return tabs.map((tab, i) => ({
    filter: tab.dataset.filter as Filter,
    tab,
    left: i === 0 ? 0 : (rects[i - 1].right + rects[i].left) / 2,
    right: i === tabs.length - 1 ? window.innerWidth : (rects[i].right + rects[i + 1].left) / 2,
    top: rects[i].bottom + 8,
  }));
}

const laneAt = (lanes: Lane[], x: number) => lanes.find((l) => x >= l.left && x < l.right) ?? null;

/**
 * A lifted copy of a task card that follows the pointer. The screen splits into one lane
 * per tab; releasing anywhere in a lane moves the task to that tab, and releasing in the
 * task's own lane puts it back.
 */
export function LiftGhost({ lift, text, current, onDrop, onEnd }: Props) {
  const [lanes] = useState(measureLanes);
  const [hover, setHover] = useState<Filter | null>(() => laneAt(lanes, lift.startX)?.filter ?? null);
  const home = { x: lift.rect.left + lift.rect.width / 2, y: lift.rect.top + lift.rect.height / 2 };
  const dx = useMotionValue(home.x);
  const dy = useMotionValue(home.y);
  const scale = useMotionValue(0.9);
  const opacity = useMotionValue(1);
  // Parent re-renders hand us new callbacks; the gesture must keep its listeners.
  const latest = useRef({ current, onDrop, onEnd, home });
  latest.current = { current, onDrop, onEnd, home };

  useEffect(() => {
    document.body.classList.add("lifting");
    const follow = { type: "spring", stiffness: 700, damping: 40 } as const;
    animate(scale, 1, { type: "spring", stiffness: 500, damping: 22 });
    animate(dx, lift.startX, follow);
    animate(dy, lift.startY, follow);

    let hovered: Lane | null = null;
    const hoverLane = (lane: Lane | null) => {
      if (lane === hovered) return;
      hovered?.tab.removeAttribute("data-drop");
      if (lane && lane.filter !== latest.current.current) {
        lane.tab.setAttribute("data-drop", "true");
        navigator.vibrate?.(6);
      }
      hovered = lane;
      setHover(lane?.filter ?? null);
    };
    hoverLane(laneAt(lanes, lift.startX));

    const onMove = (e: PointerEvent) => {
      dx.set(e.clientX);
      dy.set(e.clientY);
      hoverLane(laneAt(lanes, e.clientX));
    };
    const onUp = async (e: PointerEvent) => {
      const lane = laneAt(lanes, e.clientX);
      hoverLane(null);
      if (lane && lane.filter !== latest.current.current) {
        const r = lane.tab.getBoundingClientRect();
        const fly = { duration: 0.24, ease: [0.4, 0, 0.2, 1] } as const;
        await Promise.all([
          animate(dx, r.left + r.width / 2, fly),
          animate(dy, r.top + r.height / 2, fly),
          animate(scale, 0.2, fly),
          animate(opacity, 0, fly),
        ]);
        latest.current.onEnd();
        latest.current.onDrop(lane.filter);
        return;
      }
      const { home } = latest.current;
      const back = { type: "spring", stiffness: 420, damping: 32 } as const;
      await Promise.all([animate(dx, home.x, back), animate(dy, home.y, back), animate(opacity, 0, back)]);
      latest.current.onEnd();
    };
    // While a card is held, the page must not scroll under the finger.
    const stopScroll = (e: TouchEvent) => e.preventDefault();

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
    window.addEventListener("touchmove", stopScroll, { passive: false });
    return () => {
      document.body.classList.remove("lifting");
      hovered?.tab.removeAttribute("data-drop");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("touchmove", stopScroll);
    };
  }, [lift, lanes, dx, dy, scale, opacity]);

  return createPortal(
    <>
      <motion.div
        className="lanes"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
      >
        {lanes.map((lane, i) => {
          const isHome = lane.filter === current;
          const active = hover === lane.filter && !isHome;
          return (
            <motion.div
              key={lane.filter}
              className={`lane ${isHome ? "home" : ""}`}
              data-testid="lane"
              data-lane={lane.filter}
              data-active={active}
              style={{ left: lane.left, width: lane.right - lane.left, top: lane.top }}
              initial={{ scaleY: 0.6, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 30, delay: i * 0.025 }}
            >
              <AnimatePresence>
                {active && (
                  <motion.span
                    className="lane-glow"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>
      <motion.div className="lift-anchor" style={{ x: dx, y: dy }} aria-hidden>
        <motion.div className="lift-ghost glass" data-testid="lift-ghost" style={{ scale, opacity }}>
          {text}
        </motion.div>
      </motion.div>
    </>,
    document.body,
  );
}
