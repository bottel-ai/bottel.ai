import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";

interface StoreData {
  agents: Agent[];
}

const storeData: StoreData = JSON.parse(
  fs.readFileSync(new URL("../data/store.json", import.meta.url), "utf-8")
);

function renderStars(rating: number): string {
  const filled = Math.round(rating);
  const empty = 5 - filled;
  return "\u2605".repeat(filled) + "\u2606".repeat(empty);
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

interface AgentDetailProps {
  agentId: string;
  onBack: () => void;
}

export function AgentDetail({ agentId, onBack }: AgentDetailProps) {
  const agent = useMemo(() => {
    return storeData.agents.find((a) => a.id === agentId);
  }, [agentId]);

  const [installed, setInstalled] = useState(false);
  const [selectedButton, setSelectedButton] = useState(0); // 0 = Install/Uninstall, 1 = Back

  useInput((_input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.leftArrow) {
      setSelectedButton(0);
    }
    if (key.rightArrow) {
      setSelectedButton(1);
    }
    if (key.return) {
      if (selectedButton === 0) {
        setInstalled((prev) => !prev);
      } else {
        onBack();
      }
    }
  });

  if (!agent) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red">Agent not found: {agentId}</Text>
        <Text dimColor>Press Esc to go back</Text>
      </Box>
    );
  }

  const installLabel = installed ? "Uninstall" : "Install";

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header box - flexes to terminal width */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="#5f27cd"
        paddingX={2}
        width="100%"
      >
        <Box justifyContent="space-between">
          <Box>
            <Text bold color="#48dbfb">
              {agent.name}
            </Text>
            <Text dimColor>  v{agent.version}</Text>
          </Box>
          {agent.verified && <Text color="#2ed573">{"\u2713"} Verified</Text>}
        </Box>
        <Text dimColor>by {agent.author}</Text>
      </Box>

      {/* Rating line */}
      <Box paddingX={2} marginTop={1} gap={2}>
        <Text color="#feca57">
          {renderStars(agent.rating)} {agent.rating.toFixed(1)}
        </Text>
        <Text dimColor>({formatNumber(agent.reviews)} reviews)</Text>
        <Text dimColor>|</Text>
        <Text dimColor>{formatNumber(agent.installs)} installs</Text>
        <Text dimColor>|</Text>
        <Text dimColor>{agent.size}</Text>
      </Box>

      {/* Short description */}
      <Box paddingX={2} marginTop={1}>
        <Text>{agent.description}</Text>
      </Box>

      {/* Separator */}
      <Box paddingX={2} marginTop={1}>
        <Text dimColor>{"\u2500".repeat(55)}</Text>
      </Box>

      {/* Long description */}
      <Box paddingX={2} marginTop={1} flexDirection="column">
        {agent.longDescription.split("\n").map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>

      {/* Separator */}
      <Box paddingX={2} marginTop={1}>
        <Text dimColor>{"\u2500".repeat(55)}</Text>
      </Box>

      {/* Capabilities as colored tags */}
      <Box paddingX={2} marginTop={1} gap={1} flexWrap="wrap">
        <Text bold>Capabilities:</Text>
        {agent.capabilities.map((cap) => (
          <Text key={cap} color="#54a0ff">
            [{cap}]
          </Text>
        ))}
      </Box>

      {/* Meta line */}
      <Box paddingX={2} marginTop={1} gap={2}>
        <Text dimColor>Updated: {agent.updated}</Text>
        <Text dimColor>|</Text>
        <Text dimColor>Category: {agent.category}</Text>
      </Box>

      {/* Action buttons */}
      <Box paddingX={2} marginTop={1} gap={2}>
        <Text
          bold={selectedButton === 0}
          color={selectedButton === 0 ? (installed ? "red" : "cyan") : undefined}
          dimColor={selectedButton !== 0}
        >
          [ {installLabel} ]
        </Text>
        <Text
          bold={selectedButton === 1}
          color={selectedButton === 1 ? "cyan" : undefined}
          dimColor={selectedButton !== 1}
        >
          [ Back ]
        </Text>
      </Box>
    </Box>
  );
}
