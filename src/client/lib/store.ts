import { useSyncExternalStore } from "react";
import { api, normalizeTask, UnauthorizedError, type Bucket, type Task, type TaskPatch, type User } from "./api";

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface State {
  phase: "loading" | "ready";
  user: User | null;
  tasks: Task[];
  toast: Toast | null;
}

const GUEST_KEY = "flick:guest";
const CACHE_KEY = "flick:cache";

const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: keep working in memory */
    }
  },
};

const loadTasks = (key: string) => storage.get<unknown[]>(key, []).map(normalizeTask);

let state: State = { phase: "loading", user: null, tasks: [], toast: null };
const listeners = new Set<() => void>();
let queued: Task[] = [];
let toastSeq = 0;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  if (patch.tasks) storage.set(state.user ? CACHE_KEY : GUEST_KEY, state.tasks);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useStore = () => useSyncExternalStore(subscribe, () => state);

export function toast(message: string, action?: Toast["action"]) {
  set({ toast: { id: ++toastSeq, message, action } });
}
export const dismissToast = () => set({ toast: null });

/** Runs a server write; on failure rolls the task list back and tells the user. */
async function sync(previous: Task[], write: () => Promise<unknown>) {
  if (!state.user) return;
  try {
    await write();
  } catch (e) {
    if (e instanceof UnauthorizedError) return void set({ user: null, tasks: previous });
    set({ tasks: previous });
    toast("同期できませんでした");
  }
}

let booted = false;

export async function boot() {
  if (booted) return;
  booted = true;
  let user: User | null = null;
  let tasks: Task[];
  try {
    user = await api.me();
    const guest = loadTasks(GUEST_KEY);
    if (guest.length) {
      await api.create(guest);
      storage.set(GUEST_KEY, null);
    }
    tasks = await api.list();
  } catch (e) {
    tasks = loadTasks(e instanceof UnauthorizedError ? GUEST_KEY : CACHE_KEY);
    if (!(e instanceof UnauthorizedError)) toast("オフラインです");
  }
  state = { ...state, user };
  set({ phase: "ready", tasks });
  if (queued.length) {
    const pending = queued;
    queued = [];
    insert(pending);
  }
}

const makeTask = (text: string, bucket: Bucket, i = 0): Task => {
  const now = Date.now() + i;
  return { id: crypto.randomUUID(), text, bucket, done: false, created_at: now, updated_at: now };
};

function insert(newTasks: Task[]) {
  if (state.phase === "loading") {
    queued.push(...newTasks);
    return;
  }
  const previous = state.tasks;
  set({ tasks: [...newTasks, ...previous] });
  void sync(previous, () => api.create(newTasks));
}

export const addTasks = (texts: string[], bucket: Bucket) =>
  insert(
    texts
      .map((t) => t.trim())
      .filter(Boolean)
      .reverse()
      .map((text, i) => makeTask(text, bucket, i)),
  );

function patchTask(id: string, patch: TaskPatch) {
  const previous = state.tasks;
  set({ tasks: previous.map((t) => (t.id === id ? { ...t, ...patch, updated_at: Date.now() } : t)) });
  void sync(previous, () => api.update(id, patch));
}

/** Moves a task (to another bucket, or into/out of done) and offers to undo it. */
export function moveTask(id: string, patch: Pick<TaskPatch, "bucket" | "done">, message: string) {
  const before = state.tasks.find((t) => t.id === id);
  if (!before) return;
  patchTask(id, patch);
  toast(message, {
    label: "元に戻す",
    run: () => {
      dismissToast();
      patchTask(id, { bucket: before.bucket, done: before.done });
    },
  });
}

export const editTask = (id: string, text: string) => text.trim() && patchTask(id, { text: text.trim() });

export function removeTask(id: string) {
  const previous = state.tasks;
  const removed = previous.find((t) => t.id === id);
  if (!removed) return;
  set({ tasks: previous.filter((t) => t.id !== id) });
  void sync(previous, () => api.remove(id));
  toast("削除しました", {
    label: "元に戻す",
    run: () => {
      dismissToast();
      insert([removed]);
    },
  });
}

export async function logout() {
  await api.logout().catch(() => undefined);
  storage.set(CACHE_KEY, null);
  state = { ...state, user: null };
  set({ tasks: loadTasks(GUEST_KEY) });
}
