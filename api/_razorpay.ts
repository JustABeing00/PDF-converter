/**
 * Shared Razorpay helpers for Vercel Serverless Functions.
 * Uses plain fetch (no SDK) so no extra dependency is needed.
 *
 * Required env (Vercel > Settings > Environment Variables):
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PLAN_ID, RAZORPAY_WEBHOOK_SECRET
 */
import { createHmac } from "node:crypto";

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function hasLiveKeys(): boolean {
  return Boolean(env("RAZORPAY_KEY_ID") && env("RAZORPAY_KEY_SECRET") && env("RAZORPAY_PLAN_ID"));
}

export function basicAuth(): string {
  return Buffer.from(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`).toString("base64");
}

export async function rzpFetch(path: string, init: RequestInit = {}): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** Verify `razorpay_payment_id|razorpay_subscription_id` HMAC-SHA256 signature. */
export function verifySubscriptionSignature(args: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): boolean {
  const secret = env("RAZORPAY_KEY_SECRET");
  if (!secret) return false;
  const payload = `${args.paymentId}|${args.subscriptionId}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return expected === args.signature;
}

/** Verify webhook `x-razorpay-signature` over the raw body. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = env("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
