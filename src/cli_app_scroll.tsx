import React, { useState, useEffect } from "react";
import { Box, useStdout } from "ink";

interface ScrollViewProps {
  children: React.ReactNode;
  scrollOffset?: number;
  reservedLines?: number; // lines reserved for fixed elements (status bar, footer)
}

export function useTerminalHeight(): number {
  const { stdout } = useStdout();
  const [height, setHeight] = useState(stdout?.rows ?? 24);

  useEffect(() => {
    if (!stdout) return;

    const onResize = () => {
      setHeight(stdout.rows);
    };

    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return height;
}

export function ScrollView({ children, reservedLines = 0 }: ScrollViewProps) {
  const height = useTerminalHeight();
  const availableHeight = Math.max(5, height - reservedLines);

  return (
    <Box flexDirection="column" height={availableHeight} overflow="hidden">
      {children}
    </Box>
  );
}
