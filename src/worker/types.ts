export interface Env {
  DB: D1Database;
  AI: Ai;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** "1" enables /auth/dev-login. Never set in production. */
  DEV_LOGIN?: string;
  /** "1" replaces Workers AI with a deterministic stub (local E2E only). */
  AI_MOCK?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

export const BUCKETS = ["now", "later", "someday", "other"] as const;
export type Bucket = (typeof BUCKETS)[number];
