import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { animate, motion, useMotionValue } from "motion/react";
import type { Filter } from "./Filters";

export interface Lift {
  /** Pointer position when the card was picked up. */
  startX: number;
  startY: number;
  /** Where the card sat on screen, so the ghost starts exactly on top of it. */
  rect: DOMRect;
}

interface Props {
  lift: Lift;
  text: string;
  /** The tab the task already lives in; dropping there does nothing. */
  current: Filter;
  onDrop: (target: Filter) => void;
  onEnd: () => void;
}

/** How far above the finger the pill floats. */
const GAP = 0;

const tabAt = (x: number, y: number) =>
  (document.elementFromPoint(x, y)?.closest("[data-filter]") as HTMLElement | null) ?? null;

/**
 * A lifted copy of a task card that follows the pointer. Releasing it over a tab moves
 * the task there; releasing anywhere else springs it back.
 */
export function LiftGhost({ lift, text, current, onDrop, onEnd }: Props) {
  // The ghost is a small pill floating just above the finger, so the tab under it stays visible.
  const home = { x: lift.rect.left + lift.rect.width / 2, y: lift.rect.top + lift.rect.height / 2 };
  const dx = useMotionValue(home.x);
  const dy = useMotionValue(home.y);
  const scale = useMotionValue(0.9);
  const opacity = useMotionValue(1);
  const hovered = useRef<HTMLElement | null>(null);
  // Parent re-renders hand us new callbacks; the gesture must keep its listeners.
  const latest = useRef({ current, onDrop, onEnd });
  latest.current = { current, onDrop, onEnd };

  useEffect(() => {
    const { current } = latest.current;
    document.body.classList.add("lifting");
    const follow = { type: "spring", stiffness: 700, damping: 40 } as const;
    animate(scale, 1, { type: "spring", stiffness: 500, damping: 22 });
    animate(dx, lift.startX, follow);
    animate(dy, lift.startY, follow);

    const hover = (tab: HTMLElement | null) => {
      if (tab === hovered.current) return;
      hovered.current?.removeAttribute("data-drop");
      tab?.setAttribute("data-drop", "true");
      if (tab) navigator.vibrate?.(6);
      hovered.current = tab;
    };
    const onMove = (e: PointerEvent) => {
      dx.set(e.clientX);
      dy.set(e.clientY);
      hover(tabAt(e.clientX, e.clientY));
    };
    const onUp = async (e: PointerEvent) => {
      const tab = tabAt(e.clientX, e.clientY);
      const target = tab?.dataset.filter as Filter | undefined;
      hover(null);
      if (tab && target && target !== current) {
        const r = tab.getBoundingClientRect();
        const toX = r.left + r.width / 2;
        const toY = r.top + r.height / 2 + GAP;
        const fly = { duration: 0.22, ease: [0.4, 0, 0.2, 1] } as const;
        await Promise.all([animate(dx, toX, fly), animate(dy, toY, fly), animate(scale, 0.2, fly), animate(opacity, 0, fly)]);
        latest.current.onEnd();
        latest.current.onDrop(target);
        return;
      }
      const back = { type: "spring", stiffness: 420, damping: 32 } as const;
      await Promise.all([animate(dx, home.x, back), animate(dy, home.y + GAP, back), animate(opacity, 0, back)]);
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
      hovered.current?.removeAttribute("data-drop");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("touchmove", stopScroll);
    };
  }, [lift, dx, dy, scale, opacity]);

  return createPortal(
    <motion.div className="lift-anchor" style={{ x: dx, y: dy }} aria-hidden>
      <motion.div className="lift-ghost glass" data-testid="lift-ghost" style={{ scale, opacity }}>
        {text}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
