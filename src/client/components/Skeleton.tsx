import { motion } from "motion/react";

const widths = ["78%", "52%", "88%", "64%", "45%", "72%"];

/** Full-screen placeholder that mirrors the real layout so nothing shifts when data lands. */
export function Skeleton() {
  return (
    <motion.div
      data-testid="skeleton"
      aria-busy="true"
      aria-label="読み込み中"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(8px)", transition: { duration: 0.25 } }}
    >
      <div className="filters skel" style={{ height: 44, display: "block" }} />
      <ul className="list">
        {widths.map((w, i) => (
          <li
            key={i}
            className="card skel"
            style={{ marginBottom: 10, height: 64, alignItems: "center", ["--d" as string]: `${i * 0.08}s` }}
          >
            <span className="skel-line" style={{ width: 22, height: 22, borderRadius: 11 }} />
            <span className="skel-line" style={{ width: w }} />
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="header skel" data-testid="header-skeleton">
      <span className="skel-line" style={{ width: 64, height: 18 }} />
      <span className="skel-line" style={{ width: 38, height: 38, borderRadius: 19 }} />
    </div>
  );
}
