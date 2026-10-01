/**
 * Server-side entitlement store.
 *
 * Prefers Supabase (Postgres) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * are set. Otherwise falls back to in-memory (dev only — NOT shared across
 * Vercel instances, so Pro restore won't work multi-instance without DB).
 *
 * Table (see supabase.sql):
 *   entitlements(subscription_id text pk, email text, status text,
 *                current_end timestamptz, updated_at timestamptz)
 *
 * Uses plain fetch to Supabase REST — no extra npm dependency.
 */
import { env } from "./_razorpay.js";

export type ProStatus = "active" | "cancelled" | "expired";

export interface EntitlementRecord {
  subscriptionId: string;
  email: string | null;
  status: ProStatus;
  currentEnd: string | null;
  updatedAt: string;
}

function hasSupabase(): boolean {
  return Boolean(env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY"));
}

function sbHeaders(): Record<string, string> {
  return {
    apikey: env("SUPABASE_SERVICE_ROLE_KEY") as string,
    Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };
}

function sbUrl(path: string): string {
  return `${env("SUPABASE_URL")}/rest/v1${path}`;
}

// Dev-only fallback. Warns once so it never silently passes as production.
const mem = new Map<string, EntitlementRecord>();
const memByEmail = new Map<string, string>();
let warned = false;
function warnFallback() {
  if (!warned) {
    warned = true;
    console.warn("[store] No SUPABASE_* env — using in-memory store (dev only, not shared). Add Supabase for production.");
  }
}

export async function upsertPro(rec: {
  subscriptionId: string;
  email?: string | null;
  status: ProStatus;
  currentEnd?: string | null;
}): Promise<void> {
  const row = {
    subscription_id: rec.subscriptionId,
    email: rec.email ?? null,
    status: rec.status,
    current_end: rec.currentEnd ?? null,
    updated_at: new Date().toISOString(),
  };
  if (hasSupabase()) {
    const res = await fetch(sbUrl("/entitlements?on_conflict=subscription_id"), {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Supabase upsert failed: ${res.status} ${t}`);
    }
    return;
  }
  warnFallback();
  const prev = mem.get(rec.subscriptionId);
  mem.set(rec.subscriptionId, {
    subscriptionId: rec.subscriptionId,
    email: rec.email ?? prev?.email ?? null,
    status: rec.status,
    currentEnd: rec.currentEnd ?? prev?.currentEnd ?? null,
    updatedAt: row.updated_at,
  });
  const email = rec.email ?? prev?.email;
  if (email) memByEmail.set(email.toLowerCase(), rec.subscriptionId);
}

export async function getBySubscriptionId(subscriptionId: string): Promise<EntitlementRecord | null> {
  if (hasSupabase()) {
    const res = await fetch(sbUrl(`/entitlements?subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=*`), {
      headers: sbHeaders(),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      subscription_id: string;
      email: string | null;
      status: ProStatus;
      current_end: string | null;
      updated_at: string;
    }>;
    const r = rows[0];
    if (!r) return null;
    return {
      subscriptionId: r.subscription_id,
      email: r.email,
      status: r.status,
      currentEnd: r.current_end,
      updatedAt: r.updated_at,
    };
  }
  warnFallback();
  return mem.get(subscriptionId) ?? null;
}

export async function getByEmail(email: string): Promise<EntitlementRecord | null> {
  const key = email.toLowerCase();
  if (hasSupabase()) {
    const res = await fetch(
      sbUrl(`/entitlements?email=eq.${encodeURIComponent(key)}&status=eq.active&order=updated_at.desc&limit=1&select=*`),
      { headers: sbHeaders() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      subscription_id: string;
      email: string | null;
      status: ProStatus;
      current_end: string | null;
      updated_at: string;
    }>;
    const r = rows[0];
    if (!r) return null;
    return {
      subscriptionId: r.subscription_id,
      email: r.email,
      status: r.status,
      currentEnd: r.current_end,
      updatedAt: r.updated_at,
    };
  }
  warnFallback();
  const id = memByEmail.get(key);
  if (!id) return null;
  return mem.get(id) ?? null;
}

export function storeKind(): "supabase" | "memory" {
  return hasSupabase() ? "supabase" : "memory";
}
