/**
 * cli_fullscreen.tsx — Fullscreen wrapper for ink apps
 *
 * Alt screen buffer is managed by cli.tsx (before render).
 * This component just provides terminal size context.
 */

import React, { useEffect, useState, createContext, useContext } from "react";
import { Box, useStdout } from "ink";

export interface TerminalSize {
  rows: number;
  columns: number;
}

const TerminalSizeContext = createContext<TerminalSize>({ rows: 24, columns: 80 });

export function useTerminalSize(): TerminalSize {
  return useContext(TerminalSizeContext);
}

export function FullScreen({ children }: { children: React.ReactNode }) {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>({
    rows: stdout?.rows ?? 24,
    columns: stdout?.columns ?? 80,
  });

  useEffect(() => {
    if (!stdout) return;
    setSize({ rows: stdout.rows, columns: stdout.columns });
    const onResize = () => setSize({ rows: stdout.rows, columns: stdout.columns });
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  return (
    <TerminalSizeContext.Provider value={size}>
      <Box flexDirection="column">
        {children}
      </Box>
    </TerminalSizeContext.Provider>
  );
}
