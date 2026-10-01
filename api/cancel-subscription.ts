/**
 * POST /api/cancel-subscription
 * Body: { "subscriptionId": "sub_XXXX" }
 * Returns: { ok: true, mock? } | { error }
 *
 * CONTRACT:
 * - Frontend "Cancel Pro" button calls this.
 * - Real mode calls Razorpay cancel (cancel_at_cycle_end=true so user keeps
 *   Pro until the paid period ends — fairest for subscriptions).
 * - Mock mode just returns ok.
 */
import { hasLiveKeys, rzpFetch } from "./_razorpay.js";
import { upsertPro } from "./_store.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }
  const id = req.body?.subscriptionId;
  if (typeof id !== "string" || id.length === 0) {
    return res.status(400).json({ error: "subscriptionId is required." });
  }
  if (id.startsWith("sub_mock") || !hasLiveKeys()) {
    return res.status(200).json({ ok: true, mock: true });
  }
  try {
    const { status, json } = await rzpFetch(`/subscriptions/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ cancel_at_cycle_end: 1 }),
    });
    if (status < 200 || status >= 300) {
      console.error("[cancel-subscription]", status, json);
      return res.status(502).json({ error: "Razorpay cancel failed.", detail: json });
    }
    try {
      await upsertPro({ subscriptionId: id, status: "cancelled" });
    } catch (e) {
      console.error("[cancel-subscription] store write failed", e);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[cancel-subscription]", e);
    return res.status(500).json({ error: "Could not cancel subscription." });
  }
}
