/**
 * cli_fullscreen.tsx -- Reusable fullscreen + scrollable components for bottel.ai
 *
 * Inspired by Claude Code's AlternateScreen and ScrollBox, simplified for
 * standard ink v6. Two exports:
 *
 *   FullScreen  -- enters alt screen buffer, constrains children to terminal height
 *   ScrollableBox -- basic virtual scroll within a fixed height
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Box, Text, useStdout } from "ink";

// ─── ANSI escape sequences (from Claude Code's dec.ts) ────────
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const CLEAR_SCREEN = "\x1b[2J\x1b[H";

// ─── Terminal size hook ───────────────────────────────────────
function useTerminalSize(): { rows: number; columns: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    rows: stdout?.rows ?? 24,
    columns: stdout?.columns ?? 80,
  });

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setSize({ rows: stdout.rows, columns: stdout.columns });
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return size;
}

// ─── FullScreen ───────────────────────────────────────────────
/**
 * Enters the terminal alternate screen buffer on mount, exits on unmount.
 * Constrains children to the terminal height so ink does not overflow into
 * scrollback.
 *
 * Key insight from Claude Code (AlternateScreen line 71):
 *   <Box flexDirection="column" height={rows} width="100%" flexShrink={0}>
 * Setting flexShrink={0} prevents ink from collapsing the layout.
 */
export function FullScreen({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const { rows } = useTerminalSize();
  const { stdout } = useStdout();

  useEffect(() => {
    if (!stdout) return;

    // Enter alt screen and clear it
    stdout.write(ENTER_ALT_SCREEN + CLEAR_SCREEN);

    const cleanup = () => {
      stdout.write(EXIT_ALT_SCREEN);
    };

    // Handle unexpected exits so we always restore the main screen
    const onSignal = () => {
      cleanup();
      process.exit(0);
    };

    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    process.on("exit", cleanup);

    return () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      process.off("exit", cleanup);
      cleanup();
    };
  }, [stdout]);

  return (
    <Box flexDirection="column" height={rows} width="100%" flexShrink={0}>
      {children}
    </Box>
  );
}

// ─── ScrollableBox ────────────────────────────────────────────

/** Imperative handle exposed by ScrollableBox via ref. */
export interface ScrollableBoxHandle {
  scrollUp: (lines?: number) => void;
  scrollDown: (lines?: number) => void;
  scrollTo: (y: number) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  getScrollTop: () => number;
}

export interface ScrollableBoxProps {
  /** Visible height in terminal rows. */
  height: number;
  children: React.ReactNode;
  ref?: React.Ref<ScrollableBoxHandle>;
}

/**
 * A simple scrollable container. Renders all children inside a Box whose
 * overflow is clipped to `height` rows, offset by the current scrollTop.
 *
 * Expose scroll control via an imperative ref handle:
 *   const ref = useRef<ScrollableBoxHandle>(null);
 *   <ScrollableBox ref={ref} height={20}> ... </ScrollableBox>
 *   ref.current?.scrollDown(3);
 */
export function ScrollableBox({
  height,
  children,
  ref,
}: ScrollableBoxProps): React.ReactNode {
  const [scrollTop, setScrollTop] = useState(0);
  const contentHeightRef = useRef(0);

  // Expose imperative methods
  useImperativeHandle(
    ref,
    (): ScrollableBoxHandle => ({
      scrollUp(lines = 1) {
        setScrollTop((prev) => Math.max(0, prev - lines));
      },
      scrollDown(lines = 1) {
        setScrollTop((prev) => {
          const maxScroll = Math.max(0, contentHeightRef.current - height);
          return Math.min(maxScroll, prev + lines);
        });
      },
      scrollTo(y: number) {
        const maxScroll = Math.max(0, contentHeightRef.current - height);
        setScrollTop(Math.max(0, Math.min(maxScroll, y)));
      },
      scrollToTop() {
        setScrollTop(0);
      },
      scrollToBottom() {
        const maxScroll = Math.max(0, contentHeightRef.current - height);
        setScrollTop(maxScroll);
      },
      getScrollTop() {
        return scrollTop;
      },
    }),
    [height, scrollTop],
  );

  // Convert children to an array of elements so we can slice them
  const childArray = React.Children.toArray(children);
  contentHeightRef.current = childArray.length;

  // Only show the slice of children that fits in the viewport
  const visibleChildren = childArray.slice(scrollTop, scrollTop + height);

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {visibleChildren}
    </Box>
  );
}
