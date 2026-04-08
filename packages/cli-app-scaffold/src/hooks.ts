import { useState, useEffect, useRef, useCallback } from "react";
import type React from "react";

// ─── useApi ────────────────────────────────────────────────────

/**
 * Wraps an async function and tracks its `data`, `loading`, and `error` state.
 *
 * Re-runs the function whenever any value in `deps` changes, or when
 * `refetch()` is called. Cancels stale results on unmount or dependency
 * changes so updates from old in-flight calls never overwrite newer state.
 *
 * Common pattern in chat / social / botprofile screens that need to load
 * data from a remote API on mount.
 */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList = [],
): { data: T | null; loading: boolean; error: Error | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fn()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, refetch: () => setTick((t) => t + 1) };
}

// ─── useToast ──────────────────────────────────────────────────

/**
 * Temporary status message that auto-clears after `durationMs` milliseconds.
 *
 * Calling `show(msg)` resets the timer; calling `clear()` dismisses immediately.
 * The pending timer is always cleared on unmount to avoid setting state on
 * an unmounted component.
 */
export function useToast(durationMs: number = 3000): {
  message: string | null;
  show: (msg: string) => void;
  clear: () => void;
} {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const show = useCallback(
    (msg: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(msg);
      timer.current = setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(null);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { message, show, clear };
}

// ─── useDebounce ───────────────────────────────────────────────

/**
 * Returns a debounced copy of `value` that only updates after `delayMs`
 * milliseconds have passed without a new change. Useful for search inputs
 * or any fast-changing value driving expensive work.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
