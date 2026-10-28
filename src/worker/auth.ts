import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env, User } from "./types";

const SESSION_COOKIE = "sid";
const OAUTH_COOKIE = "oauth";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type Ctx = Context<{ Bindings: Env; Variables: { user: User } }>;

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const randomToken = (size = 32) => b64url(crypto.getRandomValues(new Uint8Array(size)));

const sha256 = async (value: string) =>
  b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

const isSecure = (c: Ctx) => new URL(c.req.url).protocol === "https:";

const redirectUri = (c: Ctx) => new URL("/auth/google/callback", c.req.url).toString();

export async function startGoogleLogin(c: Ctx) {
  if (!c.env.GOOGLE_CLIENT_ID) return c.text("GOOGLE_CLIENT_ID is not configured", 500);
  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = await sha256(verifier);
  setCookie(c, OAUTH_COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    path: "/auth",
    maxAge: 600,
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(c),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return c.redirect(url.toString());
}

export async function finishGoogleLogin(c: Ctx) {
  const [savedState, verifier] = (getCookie(c, OAUTH_COOKIE) ?? "").split(".");
  deleteCookie(c, OAUTH_COOKIE, { path: "/auth" });
  const code = c.req.query("code");
  if (!code || !savedState || savedState !== c.req.query("state")) return c.redirect("/?login=failed");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(c),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) return c.redirect("/?login=failed");
  const { id_token } = await res.json<{ id_token: string }>();
  // The ID token comes straight from Google's token endpoint over TLS, so its
  // signature need not be re-verified (OIDC Core 3.1.3.7); the claims still are.
  const claims = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")), (ch) =>
        ch.charCodeAt(0),
      ),
    ),
  ) as { sub: string; email: string; name?: string; picture?: string; aud: string; iss: string; exp: number };
  const validIssuer = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (claims.aud !== c.env.GOOGLE_CLIENT_ID || !validIssuer || claims.exp * 1000 < Date.now()) {
    return c.redirect("/?login=failed");
  }

  const user = await upsertUser(c.env, {
    sub: claims.sub,
    email: claims.email,
    name: claims.name ?? claims.email,
    picture: claims.picture ?? null,
  });
  await createSession(c, user.id);
  return c.redirect("/");
}

export async function devLogin(c: Ctx) {
  const name = c.req.query("name") ?? "Test User";
  const user = await upsertUser(c.env, {
    sub: `dev:${name}`,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    name,
    picture: null,
  });
  await createSession(c, user.id);
  return c.redirect("/");
}

async function upsertUser(env: Env, p: { sub: string; email: string; name: string; picture: string | null }) {
  const existing = await env.DB.prepare("SELECT id FROM users WHERE google_sub = ?").bind(p.sub).first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture`,
  )
    .bind(id, p.sub, p.email, p.name, p.picture, Date.now())
    .run();
  return { id };
}

async function createSession(c: Ctx, userId: string) {
  const token = randomToken();
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, Date.now() + SESSION_TTL_MS)
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function currentUser(c: Ctx): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), Date.now())
    .first<User>();
}

export async function logout(c: Ctx) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
}
