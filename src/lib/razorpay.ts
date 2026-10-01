/**
 * Razorpay Checkout.js loader + types.
 * Docs: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
 */

export interface RazorpayCheckoutOptions {
  key: string;
  subscription_id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  name?: string;
  description?: string;
  prefill?: { email?: string; contact?: string; name?: string };
  theme?: { color?: string };
  handler?: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
  on: (event: string, cb: (err: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

const CHECKOUT_URL = "https://checkout.razorpay.com/v1/checkout.js";

let loadPromise: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay Checkout.js")));
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay Checkout.js. Check network/adblock."));
    document.body.appendChild(script);
  });
  return loadPromise;
}

export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<void> {
  await loadRazorpayScript();
  if (!window.Razorpay) throw new Error("Razorpay SDK not available after load.");
  const rzp = new window.Razorpay(options);
  rzp.on("payment.failed", (err) => {
    console.warn("[razorpay] payment.failed", err);
  });
  rzp.open();
}

/** When VITE_RAZORPAY_KEY_ID is missing we run in MOCK mode (no network). */
export function razorpayConfig() {
  const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined;
  const mock = !keyId || import.meta.env.VITE_RAZORPAY_MOCK === "1";
  return { keyId: keyId ?? "rzp_test_mock", mock };
}
