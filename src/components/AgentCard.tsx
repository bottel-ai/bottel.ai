import React from "react";
import { Box, Text } from "ink";
import { formatStars, formatInstalls } from "../cli_app_theme.js";

export interface Agent {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  longDescription: string;
  category: string;
  rating: number;
  reviews: number;
  installs: number;
  capabilities: string[];
  size: string;
  updated: string;
  verified: boolean;
}

interface AgentCardProps {
  agent: Agent;
  selected?: boolean;
  compact?: boolean;
}

export default function AgentCard({
  agent,
  selected = false,
  compact = false,
}: AgentCardProps) {
  if (compact) {
    return (
      <Box>
        <Text>{selected ? "❯ " : "  "}</Text>
        <Text bold={selected} color={selected ? "#48dbfb" : undefined}>
          {agent.name}
        </Text>
        <Text dimColor> by {agent.author} </Text>
        <Text color="#feca57">{formatStars(agent.rating)}</Text>
        <Text dimColor> {formatInstalls(agent.installs)} installs </Text>
        {agent.verified && <Text color="#2ed573">✓</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box>
        <Text bold color="#48dbfb">
          {agent.name}
        </Text>
        <Text dimColor> v{agent.version}</Text>
        {agent.verified && <Text color="#2ed573"> ✓ verified</Text>}
      </Box>
      <Text dimColor>by {agent.author}</Text>
      <Box marginTop={1}>
        <Text>{agent.description}</Text>
      </Box>
      <Box marginTop={1} gap={2}>
        <Text color="#feca57">
          {formatStars(agent.rating)} {agent.rating.toFixed(1)}
        </Text>
        <Text dimColor>({agent.reviews} reviews)</Text>
        <Text dimColor>{formatInstalls(agent.installs)} installs</Text>
        <Text dimColor>{agent.size}</Text>
      </Box>
      <Box marginTop={1} gap={1}>
        {agent.capabilities.map((cap) => (
          <Text key={cap} color="#5f27cd">
            [{cap}]
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Updated: {agent.updated}</Text>
      </Box>
    </Box>
  );
}
