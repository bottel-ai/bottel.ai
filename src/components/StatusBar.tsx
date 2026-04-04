import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  installedCount?: number;
}

export default function StatusBar({ installedCount = 3 }: StatusBarProps) {
  return (
    <Box
      borderStyle="single"
      borderColor="#5f27cd"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
    >
      <Text bold color="#ff6b9d">
        bottel.ai
      </Text>
      <Text dimColor>{installedCount} installed</Text>
    </Box>
  );
}
