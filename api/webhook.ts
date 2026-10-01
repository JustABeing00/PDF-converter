/**
 * POST /api/webhook  (Razorpay -> you)
 * Headers: x-razorpay-signature, x-razorpay-event-id
 * Body: raw JSON event (must verify signature over the RAW body string).
 *
 * CONTRACT — events we care about for freemium subscriptions:
 *   subscription.authenticated -> user authorised, Pro pending first charge
 *   subscription.activated     -> Pro ACTIVE (grant)
 *   subscription.charged        -> recurring payment succeeded (extend)
 *   subscription.cancelled      -> Pro revoked at period end
 *   subscription.completed      -> total_count reached (revoke unless renewed)
 *   payment.failed              -> log, keep Free
 *
 * Vercel note: body parsing must be RAW for HMAC. In `vercel.json` or the
 * dashboard, ensure this route does NOT pre-parse JSON. The handler below
 * reads the raw stream itself.
 *
 * Persistence: grants/revokes Pro in the entitlement store (Supabase when
 * configured, else in-memory dev fallback). Webhook is the source of truth.
 */
import { verifyWebhookSignature } from "./_razorpay.js";
import { upsertPro } from "./_store.js";

export const config = { api: { bodyParser: false } };

async function readRawBody(req: any): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const signature = req.headers?.["x-razorpay-signature"];
  let raw = "";
  try {
    raw = await readRawBody(req);
  } catch {
    return res.status(400).json({ error: "Could not read body." });
  }
  if (typeof signature !== "string" || !verifyWebhookSignature(raw, signature)) {
    console.warn("[webhook] invalid signature");
    return res.status(400).json({ error: "Invalid signature." });
  }

  let event: { event?: string; payload?: any };
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: "Invalid JSON." });
  }

  // Idempotency: Razorpay may retry. Key on x-razorpay-event-id in DB in prod.
  const eventId = req.headers?.["x-razorpay-event-id"] ?? "unknown";
  console.log(`[webhook] ${event.event} id=${eventId}`);

  const subEntity = event.payload?.subscription?.entity as
    | { id?: string; status?: string; current_end?: number | null; notes?: { email?: string } }
    | undefined;
  const paymentEntity = event.payload?.payment?.entity as
    | { notes?: { email?: string }; email?: string }
    | undefined;
  const subscriptionId = subEntity?.id;
  const email =
    subEntity?.notes?.email ?? paymentEntity?.notes?.email ?? paymentEntity?.email ?? null;
  const currentEnd = subEntity?.current_end
    ? new Date(subEntity.current_end * 1000).toISOString()
    : null;

  try {
    switch (event.event) {
      case "subscription.authenticated":
      case "subscription.activated":
      case "subscription.charged":
        if (subscriptionId) {
          await upsertPro({ subscriptionId, email, status: "active", currentEnd });
        }
        break;
      case "subscription.cancelled":
      case "subscription.completed":
        if (subscriptionId) {
          await upsertPro({ subscriptionId, email, status: "cancelled", currentEnd });
        }
        break;
      case "payment.failed":
        break;
      default:
        break;
    }
  } catch (e) {
    console.error("[webhook] store write failed", e);
    // Return 500 so Razorpay retries the webhook.
    return res.status(500).json({ error: "Store write failed, retry." });
  }
  return res.status(200).json({ received: true });
}
