/**
 * useWebSocket — shared WebSocket lifecycle hook for ChannelView and ChatView.
 *
 * Handles connect, auto-reconnect (3s delay), and cleanup on unmount.
 */

import { useEffect, useRef } from "react";

interface UseWebSocketOptions {
  /** Unique ID for the connection (channel name or chat ID). */
  id: string;
  /** Whether to connect (false skips). */
  enabled: boolean;
  /** Factory that creates the WebSocket. */
  createWs: () => WebSocket;
  /** Called when the WS opens. */
  onOpen?: () => void;
  /** Called when the WS closes. */
  onClose?: () => void;
  /** Called when a message arrives (raw data string). */
  onMessage: (data: string) => void;
}

const RECONNECT_DELAY_MS = 3_000;

export function useWebSocket(opts: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    if (!opts.enabled) return;

    let cancelled = false;

    const connect = () => {
      if (cancelled || unmountedRef.current) return;
      let ws: WebSocket;
      try {
        ws = opts.createWs();
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (unmountedRef.current) return;
        opts.onOpen?.();
      });

      ws.addEventListener("message", (ev: MessageEvent) => {
        if (unmountedRef.current) return;
        try {
          opts.onMessage(String(ev.data));
        } catch {
          /* ignore */
        }
      });

      ws.addEventListener("close", () => {
        if (unmountedRef.current) return;
        opts.onClose?.();
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        try { ws.close(); } catch {}
      });
    };

    const scheduleReconnect = () => {
      if (unmountedRef.current || cancelled) return;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    connect();

    return () => {
      cancelled = true;
      unmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.id, opts.enabled]);

  return { wsRef, unmountedRef };
}
