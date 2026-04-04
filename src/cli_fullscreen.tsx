/**
 * cli_fullscreen.tsx — Fullscreen constraint for ink apps
 *
 * Based on Claude Code's AlternateScreen pattern:
 * Constrains children to terminal height so ink doesn't overflow.
 * Alt screen buffer is managed by cli.tsx (must happen before render).
 */

import React, { useEffect, useState } from "react";
import { Box, useStdout } from "ink";

export function FullScreen({ children }: { children: React.ReactNode }) {
  const { stdout } = useStdout();
  const [rows, setRows] = useState(stdout?.rows ?? 24);

  useEffect(() => {
    if (!stdout) return;
    // Set initial size
    setRows(stdout.rows);
    const onResize = () => setRows(stdout.rows);
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  // Claude Code's key pattern: height={rows} + flexShrink={0}
  return (
    <Box flexDirection="column" height={rows} flexShrink={0}>
      {children}
    </Box>
  );
}
