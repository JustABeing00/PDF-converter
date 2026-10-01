import { useCallback, useEffect, useMemo, useState } from "react";

export const FREE_DAILY_LIMIT = 5;
export const FREE_MAX_IMAGES = 10;
export const PRO_MAX_IMAGES = 100;

const STORAGE_KEY = "pdfc_ent_v1";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface EntitlementState {
  email: string | null;
  freeDate: string;
  freeUsed: number;
  proUntil: string | null;
  subscriptionId: string | null;
}

function loadInitial(): EntitlementState {
  const fallback: EntitlementState = {
    email: null,
    freeDate: todayKey(),
    freeUsed: 0,
    proUntil: null,
    subscriptionId: null,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<EntitlementState>;
    // Reset daily counter on a new day.
    if (parsed.freeDate !== todayKey()) {
      return { ...fallback, email: parsed.email ?? null, proUntil: parsed.proUntil ?? null, subscriptionId: parsed.subscriptionId ?? null };
    }
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function persist(state: EntitlementState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full / private mode — ignore */
  }
}

export function isProActive(state: EntitlementState): boolean {
  if (!state.proUntil) return false;
  return new Date(state.proUntil).getTime() > Date.now();
}

export function useEntitlement() {
  const [state, setState] = useState<EntitlementState>(loadInitial);
  const [mockMode] = useState<boolean>(() => import.meta.env.VITE_RAZORPAY_MOCK !== "0");
  const [revalidating, setRevalidating] = useState(false);
  const [serverPro, setServerPro] = useState<boolean | null>(null);

  useEffect(() => {
    persist(state);
  }, [state]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setState(JSON.parse(e.newValue) as EntitlementState);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Revalidate local Pro against the server (anti-cheat: localStorage alone
  // is NOT trusted). Mock ids skip the network call.
  useEffect(() => {
    const subId = state.subscriptionId;
    if (!subId || subId.startsWith("sub_mock")) {
      setServerPro(null);
      return;
    }
    let cancelled = false;
    setRevalidating(true);
    fetch(`/api/entitlement?subscriptionId=${encodeURIComponent(subId)}`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as {
          isPro?: boolean;
          currentEnd?: string | null;
          subscriptionId?: string;
        };
        if (cancelled) return;
        setServerPro(Boolean(data.isPro));
        if (!data.isPro && isProActive(state)) {
          // Server says inactive but local says Pro -> revoke locally.
          setState((prev) => ({ ...prev, proUntil: null }));
        } else if (data.isPro && data.currentEnd) {
          setState((prev) => ({ ...prev, proUntil: data.currentEnd as string }));
        }
      })
      .catch(() => {
        /* offline — keep local state */
      })
      .finally(() => {
        if (!cancelled) setRevalidating(false);
      });
    return () => {
      cancelled = true;
    };
    // Only re-run when the subscription id changes, not on every quota bump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.subscriptionId]);

  const isPro = useMemo(() => isProActive(state), [state]);
  const freeRemaining = useMemo(
    () => (isPro ? Infinity : Math.max(0, FREE_DAILY_LIMIT - state.freeUsed)),
    [isPro, state.freeUsed],
  );
  const maxImages = isPro ? PRO_MAX_IMAGES : FREE_MAX_IMAGES;

  /** Returns null when allowed, otherwise a human-readable block reason. */
  const blockReason = useCallback(
    (imageCount: number): string | null => {
      if (isPro) {
        if (imageCount > PRO_MAX_IMAGES)
          return `Pro supports up to ${PRO_MAX_IMAGES} images per PDF. Split into smaller PDFs.`;
        return null;
      }
      if (imageCount > FREE_MAX_IMAGES)
        return `Free plan supports up to ${FREE_MAX_IMAGES} images per PDF. Upgrade to Pro for ${PRO_MAX_IMAGES}.`;
      if (state.freeUsed >= FREE_DAILY_LIMIT)
        return `You've used all ${FREE_DAILY_LIMIT} free converts today. Upgrade to Pro for unlimited, or come back tomorrow.`;
      return null;
    },
    [isPro, state.freeUsed],
  );

  const recordConvert = useCallback(() => {
    if (isProActive(state)) return;
    setState((prev) => {
      const date = todayKey();
      const base = prev.freeDate === date ? prev : { ...prev, freeDate: date, freeUsed: 0 };
      return { ...base, freeUsed: base.freeUsed + 1 };
    });
  }, [state]);

  const activatePro = useCallback((email: string, subscriptionId: string | null, daysValid = 30) => {
    const until = new Date(Date.now() + daysValid * 24 * 3600 * 1000).toISOString();
    setState((prev) => ({ ...prev, email, proUntil: until, subscriptionId }));
  }, []);

  const cancelProLocal = useCallback(() => {
    setState((prev) => ({ ...prev, proUntil: null, subscriptionId: null }));
  }, []);

  const setEmail = useCallback((email: string) => {
    setState((prev) => ({ ...prev, email }));
  }, []);

  /** Test helper: clears quota + pro so you can re-test the paywall. */
  const resetForTesting = useCallback(() => {
    setState({ email: state.email, freeDate: todayKey(), freeUsed: 0, proUntil: null, subscriptionId: null });
    setServerPro(null);
  }, [state.email]);

  /** Restore Pro on a new device via receipt email. Returns true if found. */
  const restoreByEmail = useCallback(async (email: string): Promise<boolean> => {
    const clean = email.trim().toLowerCase();
    if (!clean) return false;
    const r = await fetch(`/api/entitlement?email=${encodeURIComponent(clean)}`);
    if (!r.ok) return false;
    const data = (await r.json()) as {
      isPro?: boolean;
      currentEnd?: string | null;
      subscriptionId?: string;
    };
    if (data.isPro && data.subscriptionId) {
      setState((prev) => ({
        ...prev,
        email: clean,
        proUntil: data.currentEnd ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        subscriptionId: data.subscriptionId as string,
      }));
      setServerPro(true);
      return true;
    }
    return false;
  }, []);

  return {
    state,
    isPro,
    freeRemaining,
    maxImages,
    blockReason,
    recordConvert,
    activatePro,
    cancelProLocal,
    setEmail,
    resetForTesting,
    restoreByEmail,
    revalidating,
    serverPro,
    mockMode,
  };
}

export type EntitlementApi = ReturnType<typeof useEntitlement>;
