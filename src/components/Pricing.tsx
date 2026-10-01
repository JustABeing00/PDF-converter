import { useState } from "react";
import type { EntitlementApi } from "../hooks/useEntitlement";
import { openRazorpayCheckout, razorpayConfig } from "../lib/razorpay";
import { FREE_DAILY_LIMIT, FREE_MAX_IMAGES, PRO_MAX_IMAGES } from "../hooks/useEntitlement";

interface Props {
  entitlement: EntitlementApi;
}

type Status = "idle" | "working" | "error" | "success";

export default function Pricing({ entitlement }: Props) {
  const { state, isPro, activatePro, cancelProLocal, setEmail, mockMode, restoreByEmail, revalidating } = entitlement;
  const [email, setEmailInput] = useState(state.email ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleRestore = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setStatus("error");
      setMessage("Enter the receipt email to restore Pro.");
      return;
    }
    setStatus("working");
    setMessage(null);
    try {
      const found = await restoreByEmail(cleanEmail);
      if (found) {
        setStatus("success");
        setMessage("Pro restored on this device.");
      } else {
        setStatus("error");
        setMessage("No active Pro found for that email.");
      }
    } catch {
      setStatus("error");
      setMessage("Restore failed — try again.");
    }
  };

  const handleUpgrade = async () => {
    setMessage(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setStatus("error");
      setMessage("Enter a valid email — your Pro receipt goes there.");
      return;
    }
    setEmail(cleanEmail);
    setStatus("working");

    try {
      // 1. Ask backend for a Razorpay subscription.
      const res = await fetch("/api/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = (await res.json()) as {
        subscriptionId?: string;
        keyId?: string;
        mock?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not create subscription.");

      // 2a. MOCK mode (no Razorpay keys yet): simulate success after 1s.
      if (data.mock || mockMode) {
        await new Promise((r) => setTimeout(r, 900));
        activatePro(cleanEmail, data.subscriptionId ?? "sub_mock_123", 30);
        setStatus("success");
        setMessage("Mock Pro activated for 30 days. Add test keys to try real Razorpay.");
        return;
      }

      // 2b. REAL mode: open Razorpay Checkout with the subscription_id.
      const { keyId } = razorpayConfig();
      await openRazorpayCheckout({
        key: data.keyId ?? keyId,
        subscription_id: data.subscriptionId,
        name: "Image to PDF — Pro",
        description: "Pro Monthly · Unlimited converts",
        prefill: { email: cleanEmail },
        theme: { color: "#171717" },
        handler: async (resp) => {
          // 3. Verify signature on backend, then unlock Pro locally.
          try {
            const v = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...resp, email: cleanEmail }),
            });
            const vdata = (await v.json()) as { ok?: boolean; error?: string };
            if (!v.ok || !vdata.ok) throw new Error(vdata.error ?? "Verification failed.");
            activatePro(cleanEmail, resp.razorpay_subscription_id ?? null, 30);
            setStatus("success");
            setMessage("Payment verified — Pro is active.");
          } catch (e) {
            setStatus("error");
            setMessage(e instanceof Error ? e.message : "Verification failed.");
          }
        },
        modal: {
          ondismiss: () => {
            setStatus((s) => (s === "working" ? "idle" : s));
            setMessage("Checkout closed — no charge made.");
          },
        },
      });
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Something went wrong starting checkout.");
    }
  };

  const handleCancel = async () => {
    if (!state.subscriptionId || state.subscriptionId.startsWith("sub_mock")) {
      cancelProLocal();
      setStatus("idle");
      setMessage("Mock Pro cancelled.");
      return;
    }
    setStatus("working");
    try {
      await fetch("/api/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: state.subscriptionId }),
      });
      cancelProLocal();
      setStatus("idle");
      setMessage("Subscription cancelled — you keep Pro until period end (mocked locally).");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Cancel failed.");
    }
  };

  return (
    <section className="pricing" aria-label="Pricing">
      <div className="pricing-head">
        <h2>Simple pricing</h2>
        <p className="pricing-sub">
          Start free. Upgrade when you convert a lot.{" "}
          {mockMode ? (
            <span className="pill pill-test">TEST MODE — no real money</span>
          ) : (
            <span className="pill pill-live">LIVE</span>
          )}
        </p>
      </div>

      <div className="pricing-grid">
        <div className="price-card">
          <h3>Free</h3>
          <p className="price">₹0</p>
          <ul>
            <li>{FREE_DAILY_LIMIT} PDFs / day</li>
            <li>Up to {FREE_MAX_IMAGES} images per PDF</li>
            <li>100% in-browser — private</li>
          </ul>
          <span className="btn btn-secondary" aria-disabled="true">
            Current plan
          </span>
        </div>

        <div className={`price-card price-pro${isPro ? " is-active" : ""}`}>
          <h3>Pro {isPro && <span className="pill pill-pro">ACTIVE</span>}</h3>
          <p className="price">
            ₹99<span className="per">/month</span>
          </p>
          <ul>
            <li>Unlimited PDFs / day</li>
            <li>Up to {PRO_MAX_IMAGES} images per PDF</li>
            <li>Priority + upcoming compress/merge</li>
          </ul>

          {!isPro ? (
            <>
              <label className="email-label" htmlFor="pro-email">
                Email for receipt
              </label>
              <input
                id="pro-email"
                className="email-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmailInput(e.target.value)}
                autoComplete="email"
              />
              <button
                type="button"
                className="btn btn-primary btn-large"
                onClick={handleUpgrade}
                disabled={status === "working"}
              >
                {status === "working" ? "Starting checkout…" : "Go Pro"}
              </button>
              <p className="fineprint">UPI · Cards · Netbanking via Razorpay. Cancel anytime.</p>
              {!mockMode && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleRestore}
                  disabled={status === "working"}
                >
                  Restore purchase
                </button>
              )}
              {revalidating && <p className="fineprint">Checking subscription status…</p>}
            </>
          ) : (
            <>
              <p className="fineprint">
                Pro until {state.proUntil ? new Date(state.proUntil).toLocaleDateString() : "—"}
                {state.subscriptionId ? ` · ${state.subscriptionId}` : ""}
              </p>
              <button type="button" className="btn btn-ghost" onClick={handleCancel}>
                Cancel Pro (test)
              </button>
            </>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`alert ${status === "error" ? "alert-error" : "alert-success"}`}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </div>
      )}
    </section>
  );
}
