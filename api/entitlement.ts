/**
 * GET /api/entitlement?subscriptionId=sub_XXX  OR  ?email=user@x.com
 * Returns: { isPro, status, currentEnd, subscriptionId, store }
 *
 * CONTRACT — anti-cheat check:
 * - Frontend's localStorage Pro is NOT trusted. On app load (and before
 *   treating the user as Pro), the client calls this endpoint.
 * - Resolution order: DB record (webhook/verify wrote it) -> live Razorpay
 *   subscription fetch (source of truth when DB is empty, e.g. webhook
 *   delayed). Mock ids (sub_mock_*) never count as Pro here.
 * - Razorpay statuses treated as Pro: created, authenticated, active.
 */
import { env, hasLiveKeys, rzpFetch } from "./_razorpay.js";
import { getByEmail, getBySubscriptionId, storeKind } from "./_store.js";

const PRO_RZP_STATUSES = new Set(["created", "authenticated", "active"]);

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }
  const subscriptionId =
    typeof req.query?.subscriptionId === "string" ? req.query.subscriptionId : "";
  const email = typeof req.query?.email === "string" ? req.query.email.toLowerCase() : "";

  if (!subscriptionId && !email) {
    return res.status(400).json({ error: "subscriptionId or email is required." });
  }
  if (subscriptionId.startsWith("sub_mock")) {
    return res.status(200).json({ isPro: false, status: "mock", store: storeKind() });
  }

  // 1. DB lookup.
  try {
    const rec = subscriptionId
      ? await getBySubscriptionId(subscriptionId)
      : await getByEmail(email);
    if (rec) {
      const notExpired = !rec.currentEnd || new Date(rec.currentEnd).getTime() > Date.now();
      const isPro = rec.status === "active" && notExpired;
      return res.status(200).json({
        isPro,
        status: rec.status,
        currentEnd: rec.currentEnd,
        subscriptionId: rec.subscriptionId,
        store: storeKind(),
      });
    }
  } catch (e) {
    console.error("[entitlement] store lookup failed", e);
  }

  // 2. Live Razorpay fallback (covers webhook delay / no-DB deploys).
  if (subscriptionId && hasLiveKeys()) {
    try {
      const { status, json } = await rzpFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        method: "GET",
      });
      if (status >= 200 && status < 300) {
        const sub = json as { status?: string; current_end?: number | null; id?: string };
        const isPro = Boolean(sub.status && PRO_RZP_STATUSES.has(sub.status));
        return res.status(200).json({
          isPro,
          status: sub.status ?? "unknown",
          currentEnd: sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null,
          subscriptionId: sub.id ?? subscriptionId,
          store: `live:${storeKind()}`,
          keyHint: (env("RAZORPAY_KEY_ID") ?? "").slice(0, 8),
        });
      }
    } catch (e) {
      console.error("[entitlement] live check failed", e);
    }
  }

  return res.status(200).json({ isPro: false, status: "none", store: storeKind() });
}
