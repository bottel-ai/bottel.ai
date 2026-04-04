import React, { useState, useEffect, useMemo } from "react";
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
  /** Lines reserved for elements outside the viewport (footer, etc.) */
  reservedLines?: number;
}

export function Viewport({ rows, focusedIndex, reservedLines = 2 }: ViewportProps) {
  const { rows: termRows } = useTerminalSize();
  const maxVisible = Math.max(3, termRows - reservedLines);
  const [offset, setOffset] = useState(0);

  // Auto-scroll to keep focused item visible
  useEffect(() => {
    let newOffset = offset;

    if (focusedIndex < newOffset) {
      // Focused is above viewport — scroll up
      newOffset = focusedIndex;
    } else if (focusedIndex >= newOffset + maxVisible) {
      // Focused is below viewport — scroll down
      newOffset = focusedIndex - maxVisible + 1;
    }

    // Clamp
    const maxOffset = Math.max(0, rows.length - maxVisible);
    newOffset = Math.max(0, Math.min(newOffset, maxOffset));

    if (newOffset !== offset) {
      setOffset(newOffset);
    }
  }, [focusedIndex, maxVisible, rows.length]);

  const visibleRows = rows.slice(offset, offset + maxVisible);
  const hasAbove = offset > 0;
  const hasBelow = offset + maxVisible < rows.length;

  // Scrollbar indicator
  const scrollPercent = rows.length <= maxVisible
    ? 100
    : Math.round((offset / Math.max(1, rows.length - maxVisible)) * 100);

  return (
    <Box flexDirection="column">
      {hasAbove && (
        <Text dimColor>  ▲ scroll up ({offset} above)</Text>
      )}
      {visibleRows}
      {hasBelow && (
        <Text dimColor>  ▼ scroll down ({rows.length - offset - maxVisible} below)</Text>
      )}
      {rows.length > maxVisible && (
        <Text dimColor>  [{scrollPercent}%]</Text>
      )}
    </Box>
  );
}
