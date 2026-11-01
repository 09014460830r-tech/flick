import { motion } from "motion/react";
import { BUCKETS, BUCKET_LABEL, type Bucket } from "../lib/api";

export type Filter = Bucket | "done";
const FILTERS: Filter[] = [...BUCKETS, "done"];
const label = (f: Filter) => (f === "done" ? "完了" : BUCKET_LABEL[f]);

interface Props {
  value: Filter;
  counts: Record<Filter, number>;
  onChange: (f: Filter) => void;
}

export function Filters({ value, counts, onChange }: Props) {
  return (
    <motion.div
      className="filters glass"
      role="tablist"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 30, delay: 0.05 }}
    >
      {FILTERS.map((f) => (
        <motion.button
          key={f}
          role="tab"
          className="filter"
          data-filter={f}
          aria-selected={value === f}
          whileTap={{ scale: 0.92 }}
          onClick={() => onChange(f)}
        >
          {value === f && (
            <motion.span
              layoutId="filter-thumb"
              className="filter-thumb"
              transition={{ type: "spring", stiffness: 500, damping: 36 }}
            />
          )}
          {label(f)}
          <motion.span
            key={counts[f]}
            className="count"
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 28 }}
          >
            {counts[f]}
          </motion.span>
        </motion.button>
      ))}
    </motion.div>
  );
}
