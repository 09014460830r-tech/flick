export type Status = "todo" | "doing" | "done";

export interface Task {
  id: string;
  text: string;
  status: Status;
  created_at: number;
  updated_at: number;
}

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
  list: () => request<{ tasks: Task[] }>("/api/tasks").then((r) => r.tasks),
  create: (tasks: Partial<Task>[]) => request<{ tasks: Task[] }>("/api/tasks", json("POST", { tasks })),
  update: (id: string, patch: Partial<Pick<Task, "text" | "status">>) =>
    request(`/api/tasks/${encodeURIComponent(id)}`, json("PATCH", patch)),
  remove: (id: string) => request(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  suggest: (mode: "split" | "breakdown", text: string) =>
    request<{ tasks: string[] }>("/api/ai/suggest", json("POST", { mode, text })).then((r) => r.tasks),
  logout: () => request("/auth/logout", { method: "POST" }),
};

export const STATUS_ORDER: Status[] = ["todo", "doing", "done"];

export const STATUS_LABEL: Record<Status, string> = {
  todo: "未着手",
  doing: "進行中",
  done: "完了",
};

export const nextStatus = (s: Status): Status | null => STATUS_ORDER[STATUS_ORDER.indexOf(s) + 1] ?? null;
export const prevStatus = (s: Status): Status | null => STATUS_ORDER[STATUS_ORDER.indexOf(s) - 1] ?? null;
