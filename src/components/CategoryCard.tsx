import React from "react";
import { Box, Text } from "ink";

interface CategoryCardProps {
  name: string;
  icon: string;
  agentCount: number;
  selected?: boolean;
}

export default function CategoryCard({
  name,
  icon,
  agentCount,
  selected = false,
}: CategoryCardProps) {
  return (
    <Box>
      <Text>{selected ? "❯ " : "  "}</Text>
      <Text color={selected ? "#48dbfb" : "#feca57"}>{icon} </Text>
      <Text bold={selected} color={selected ? "#48dbfb" : undefined}>
        {name}
      </Text>
      <Text dimColor> ({agentCount})</Text>
    </Box>
  );
}
