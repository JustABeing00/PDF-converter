/**
 * POST /api/verify-payment
 * Body: { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, email? }
 * Returns: { ok: true } when the HMAC signature matches KEY_SECRET.
 *
 * CONTRACT:
 * - Called by the frontend inside Checkout `handler()` right after user pays.
 * - This is a UX fast-path only. The WEBHOOK is the source of truth for
 *   granting Pro server-side (see api/webhook.ts). Both should agree.
 * - In MOCK mode (no keys) always returns ok:true.
 */
import { hasLiveKeys, verifySubscriptionSignature } from "./_razorpay.js";
import { upsertPro } from "./_store.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, email } = req.body ?? {};
  if (typeof razorpay_payment_id !== "string" || typeof razorpay_signature !== "string") {
    return res.status(400).json({ error: "Missing payment fields." });
  }
  if (!hasLiveKeys()) {
    return res.status(200).json({ ok: true, mock: true });
  }
  if (typeof razorpay_subscription_id !== "string") {
    return res.status(400).json({ error: "Missing subscription id." });
  }
  const ok = verifySubscriptionSignature({
    paymentId: razorpay_payment_id,
    subscriptionId: razorpay_subscription_id,
    signature: razorpay_signature,
  });
  if (!ok) return res.status(400).json({ ok: false, error: "Signature mismatch. Possible tampering." });
  // Fast-path grant so UX unlocks instantly; webhook confirms/corrects after.
  try {
    await upsertPro({
      subscriptionId: razorpay_subscription_id,
      email: typeof email === "string" ? email.toLowerCase() : null,
      status: "active",
      currentEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });
  } catch (e) {
    console.error("[verify-payment] store write failed", e);
  }
  return res.status(200).json({ ok: true });
}
