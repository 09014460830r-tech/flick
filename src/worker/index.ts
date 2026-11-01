import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { currentUser, devLogin, finishGoogleLogin, logout, startGoogleLogin } from "./auth";
import { suggestTasks, type AiMode } from "./ai";
import { STATIC } from "./static.gen";
import { BUCKETS, type Bucket, type Env, type User } from "./types";

type App = { Bindings: Env; Variables: { user: User } };

const MAX_TEXT = 2000;
const isBucket = (b: unknown): b is Bucket => BUCKETS.includes(b as Bucket);
const toFlag = (d: unknown) => (d === true || d === 1 ? 1 : 0);
const cleanText = (t: unknown) => (typeof t === "string" ? t.trim().slice(0, MAX_TEXT) : "");
const isId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{8,64}$/.test(id);

const app = new Hono<App>();

app.use("*", secureHeaders({ crossOriginOpenerPolicy: "same-origin-allow-popups" }));
app.use("/api/*", csrf());
app.use("/auth/logout", csrf());

app.get("/auth/google", startGoogleLogin);
app.get("/auth/google/callback", finishGoogleLogin);
app.post("/auth/logout", logout);
app.get("/auth/dev-login", (c) => (c.env.DEV_LOGIN === "1" ? devLogin(c) : c.notFound()));

app.use("/api/*", async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
});

app.get("/api/me", (c) => c.json({ user: c.get("user") }));

app.get("/api/tasks", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, text, bucket, done, created_at, updated_at FROM tasks WHERE user_id = ? ORDER BY created_at DESC",
  )
    .bind(c.get("user").id)
    .all();
  return c.json({ tasks: results });
});

app.post("/api/tasks", async (c) => {
  const body = await c.req.json<{ tasks?: unknown }>().catch(() => ({}) as { tasks?: unknown });
  const input = Array.isArray(body.tasks) ? body.tasks.slice(0, 100) : [];
  const now = Date.now();
  const rows = input
    .map((t: { id?: unknown; text?: unknown; bucket?: unknown; done?: unknown; created_at?: unknown }, i: number) => ({
      id: isId(t.id) ? t.id : crypto.randomUUID(),
      text: cleanText(t.text),
      bucket: isBucket(t.bucket) ? t.bucket : "now",
      done: toFlag(t.done),
      created_at: typeof t.created_at === "number" ? t.created_at : now + i,
    }))
    .filter((t) => t.text);
  if (!rows.length) return c.json({ error: "text required" }, 400);
  const userId = c.get("user").id;
  await c.env.DB.batch(
    rows.map((t) =>
      c.env.DB.prepare(
        `INSERT INTO tasks (id, user_id, text, bucket, done, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      ).bind(t.id, userId, t.text, t.bucket, t.done, t.created_at, now),
    ),
  );
  return c.json({ tasks: rows.map((t) => ({ ...t, updated_at: now })) }, 201);
});

app.patch("/api/tasks/:id", async (c) => {
  const body = await c.req
    .json<{ text?: unknown; bucket?: unknown; done?: unknown }>()
    .catch(() => ({}) as Record<string, unknown>);
  const text = body.text === undefined ? null : cleanText(body.text);
  const bucket = body.bucket === undefined ? null : body.bucket;
  const done = body.done === undefined ? null : body.done;
  const nothing = text === null && bucket === null && done === null;
  if (nothing || text === "" || (bucket !== null && !isBucket(bucket)) || (done !== null && typeof done !== "boolean")) {
    return c.json({ error: "invalid body" }, 400);
  }
  const res = await c.env.DB.prepare(
    `UPDATE tasks SET text = COALESCE(?, text), bucket = COALESCE(?, bucket), done = COALESCE(?, done), updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(text, bucket, done === null ? null : toFlag(done), Date.now(), c.req.param("id"), c.get("user").id)
    .run();
  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

app.delete("/api/tasks/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("user").id)
    .run();
  return c.json({ ok: true });
});

app.post("/api/ai/suggest", async (c) => {
  const body = await c.req.json<{ mode?: unknown; text?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const mode: AiMode = body.mode === "breakdown" ? "breakdown" : "split";
  const text = cleanText(body.text);
  if (!text) return c.json({ error: "text required" }, 400);
  try {
    return c.json({ tasks: await suggestTasks(c.env, mode, text) });
  } catch (e) {
    console.error("workers ai failed", e);
    return c.json({ error: "ai unavailable" }, 502);
  }
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// The SPA: hashed bundles are immutable; every other path falls back to index.html.
app.get("*", (c) => {
  const path = new URL(c.req.url).pathname;
  const file = STATIC[path] ?? STATIC["/index.html"];
  const immutable = path.startsWith("/assets/") && path in STATIC;
  return c.body(file.body, 200, {
    "content-type": file.type,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
});

export default app;
