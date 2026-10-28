import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import type { Status, Task } from "./lib/api";
import { addTasks, boot, editTask, logout, removeTask, setStatus, toast, useStore } from "./lib/store";
import { Ambient } from "./components/Ambient";
import { Header } from "./components/Header";
import { Composer } from "./components/Composer";
import { Filters, type Filter } from "./components/Filters";
import { TaskCard } from "./components/TaskCard";
import { HeaderSkeleton, Skeleton } from "./components/Skeleton";
import { Toast } from "./components/Toast";
import { AiSheet, type AiRequest } from "./components/AiSheet";
import { LoginSheet } from "./components/LoginSheet";
import { Inbox } from "./components/Icons";

const RANK: Record<Status, number> = { doing: 0, todo: 1, done: 2 };
const byStatusThenNewest = (a: Task, b: Task) => RANK[a.status] - RANK[b.status] || b.created_at - a.created_at;
const HINT_KEY = "flick:hinted";

export function App() {
  const { phase, user, tasks, toast: currentToast } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [ai, setAi] = useState<AiRequest | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [nudge] = useState(() => {
    try {
      return !localStorage.getItem(HINT_KEY);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    void boot();
    if (new URLSearchParams(location.search).get("login") === "failed") {
      toast("ログインできませんでした");
      history.replaceState(null, "", "/");
    }
  }, []);

  useEffect(() => {
    if (nudge && tasks.length) {
      try {
        localStorage.setItem(HINT_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }, [nudge, tasks.length]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: tasks.length, todo: 0, doing: 0, done: 0 };
    for (const t of tasks) c[t.status]++;
    return c;
  }, [tasks]);

  const visible = useMemo(
    () => tasks.filter((t) => filter === "all" || t.status === filter).sort(byStatusThenNewest),
    [tasks, filter],
  );

  const staysVisible = useCallback((s: Status) => filter === "all" || filter === s, [filter]);

  const requestAi = (req: AiRequest) => (user ? setAi(req) : setLoginOpen(true));

  return (
    <MotionConfig reducedMotion="user">
      <Ambient />
      <main className="app">
        {phase === "loading" ? (
          <HeaderSkeleton />
        ) : (
          <Header user={user} onLogin={() => setLoginOpen(true)} onLogout={() => void logout()} />
        )}
        <Composer
          onSubmit={(text) => addTasks([text])}
          onAi={(text, clear) => requestAi({ mode: "split", text, onAdded: clear })}
        />
        <AnimatePresence mode="wait" initial={false}>
          {phase === "loading" ? (
            <Skeleton key="skeleton" />
          ) : (
            <motion.section
              key="content"
              initial={{ opacity: 0, filter: "blur(8px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.35 }}
            >
              <Filters value={filter} counts={counts} onChange={setFilter} />
              <LayoutGroup>
                <ul className="list" aria-label="タスク">
                  <AnimatePresence initial={false} mode="popLayout">
                    {visible.map((task, i) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        nudge={nudge && i === 0}
                        staysVisible={staysVisible}
                        onStatus={(s) => setStatus(task.id, s)}
                        onDelete={() => removeTask(task.id)}
                        onEdit={(text) => editTask(task.id, text)}
                        onBreakdown={() => requestAi({ mode: "breakdown", text: task.text })}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </LayoutGroup>
              <AnimatePresence>
                {visible.length === 0 && (
                  <motion.div
                    className="empty"
                    data-testid="empty"
                    aria-label="タスクなし"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  >
                    <motion.div
                      className="empty-orb glass"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
                    >
                      <Inbox />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
      <AiSheet request={ai} onClose={() => setAi(null)} onAdd={addTasks} />
      <LoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} />
      <Toast toast={currentToast} />
    </MotionConfig>
  );
}
