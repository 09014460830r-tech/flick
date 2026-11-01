export type Bucket = "now" | "later" | "someday" | "other";

export interface Task {
  id: string;
  text: string;
  bucket: Bucket;
  done: boolean;
  created_at: number;
  updated_at: number;
}

export type TaskPatch = Partial<Pick<Task, "text" | "bucket" | "done">>;

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

export class UnauthorizedError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  me: () => request<{ user: User }>("/api/me").then((r) => r.user),
  list: () => request<{ tasks: unknown[] }>("/api/tasks").then((r) => r.tasks.map(normalizeTask)),
  create: (tasks: Partial<Task>[]) => request<{ tasks: Task[] }>("/api/tasks", json("POST", { tasks })),
  update: (id: string, patch: TaskPatch) =>
    request(`/api/tasks/${encodeURIComponent(id)}`, json("PATCH", patch)),
  remove: (id: string) => request(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  suggest: (text: string) =>
    request<{ tasks: string[] }>("/api/ai/suggest", json("POST", { text })).then((r) => r.tasks),
  logout: () => request("/auth/logout", { method: "POST" }),
};

export const BUCKETS: Bucket[] = ["now", "later", "someday", "other"];

export const BUCKET_LABEL: Record<Bucket, string> = {
  now: "今すぐ",
  later: "次に",
  someday: "いつか",
  other: "その他",
};

const isBucket = (b: unknown): b is Bucket => BUCKETS.includes(b as Bucket);

/** Accepts server rows (done as 0/1) and tasks saved by earlier versions (todo/doing/done status). */
export function normalizeTask(raw: unknown): Task {
  const t = raw as Partial<Omit<Task, "done">> & { status?: string; done?: unknown };
  return {
    id: String(t.id),
    text: String(t.text ?? ""),
    bucket: isBucket(t.bucket) ? t.bucket : "now",
    done: t.done === undefined ? t.status === "done" : t.done === true || t.done === 1,
    created_at: Number(t.created_at) || Date.now(),
    updated_at: Number(t.updated_at) || Date.now(),
  };
}
