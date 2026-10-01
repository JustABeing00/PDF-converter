/**
 * POST /api/create-subscription
 * Body:    { "email": "user@example.com" }
 * Returns: { subscriptionId, keyId, mock } on success
 *          { error } with 4xx/5xx on failure
 *
 * CONTRACT:
 * - Frontend calls this BEFORE opening Razorpay Checkout.
 * - If Razorpay keys are missing (local dev), returns a MOCK subscription
 *   so the UI paywall can be tested with no money moving.
 * - If keys exist, creates a real Razorpay Subscription for RAZORPAY_PLAN_ID.
 */
import { env, hasLiveKeys, isValidEmail, rzpFetch } from "./_razorpay.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Valid email is required." });
  }

  // MOCK mode — test the UI without Razorpay keys.
  if (!hasLiveKeys()) {
    return res.status(200).json({
      subscriptionId: `sub_mock_${Date.now()}`,
      keyId: "rzp_test_mock",
      mock: true,
      note: "No RAZORPAY_* env vars set — returned mock subscription. Set test keys to go real.",
    });
  }

  try {
    const { status, json } = await rzpFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        plan_id: env("RAZORPAY_PLAN_ID"),
        customer_notify: 1,
        quantity: 1,
        total_count: 12, // 12 monthly charges, then auto-ends. Use 1200 for ~100y "until cancelled".
        notes: { email, product: "pdfconverter-pro-monthly" },
      }),
    });
    const id = (json as { id?: string } | null)?.id;
    if (status < 200 || status >= 300 || !id) {
      console.error("[create-subscription] razorpay error", status, json);
      return res.status(502).json({ error: "Razorpay rejected subscription creation.", detail: json });
    }
    return res.status(200).json({ subscriptionId: id, keyId: env("RAZORPAY_KEY_ID"), mock: false });
  } catch (e) {
    console.error("[create-subscription]", e);
    return res.status(500).json({ error: "Could not create subscription." });
  }
}
