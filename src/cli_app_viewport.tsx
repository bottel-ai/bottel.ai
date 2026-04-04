import React, { useRef, useState, useEffect } from "react";
import { Box, Text, useStdout } from "ink";

// ─── Virtual Viewport ──────────────────────────────────────────
// Renders a list of single-line React elements, but only shows
// the rows that fit in the terminal. Automatically scrolls to
// keep the focused row visible — like less/vim.

function useTerminalSize() {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    rows: stdout?.rows ?? 24,
    cols: stdout?.columns ?? 80,
  });

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setSize({ rows: stdout.rows, cols: stdout.columns });
    };
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  return size;
}

export interface ViewportProps {
  /** All renderable rows — each should be a single-line element */
  rows: React.ReactNode[];
  /** Which row index is currently focused (for auto-scroll) */
  focusedIndex: number;
  /** Lines reserved for scroll indicators */
  reservedLines?: number;
}

export function Viewport({ rows, focusedIndex, reservedLines = 2 }: ViewportProps) {
  const { rows: termRows } = useTerminalSize();
  const maxVisible = Math.max(3, termRows - reservedLines);

  // Use a ref to track offset so it's always current (no stale closure)
  const offsetRef = useRef(0);

  // Compute new offset based on focused index
  let newOffset = offsetRef.current;

  // If focused is above viewport — scroll up
  if (focusedIndex < newOffset) {
    newOffset = focusedIndex;
  }
  // If focused is below viewport — scroll down
  if (focusedIndex >= newOffset + maxVisible) {
    newOffset = focusedIndex - maxVisible + 1;
  }
  // Clamp
  const maxOffset = Math.max(0, rows.length - maxVisible);
  newOffset = Math.max(0, Math.min(newOffset, maxOffset));

  // Update ref
  offsetRef.current = newOffset;
  const offset = newOffset;

  const visibleRows = rows.slice(offset, offset + maxVisible);
  const hasAbove = offset > 0;
  const hasBelow = offset + maxVisible < rows.length;

  return (
    <Box flexDirection="column">
      {hasAbove && (
        <Text dimColor>  ▲ {offset} above</Text>
      )}
      {visibleRows}
      {hasBelow && (
        <Text dimColor>  ▼ {rows.length - offset - maxVisible} below</Text>
      )}
    </Box>
  );
}
