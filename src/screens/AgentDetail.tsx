import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";

const storeData = JSON.parse(
  fs.readFileSync(new URL("../data/store.json", import.meta.url), "utf-8")
);

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return "\u2605".repeat(full) + (half ? "\u2606" : "") + "\u00b7".repeat(empty);
}

function formatNumber(n: number): string {
  if (n >= 1000) {
    return n.toLocaleString();
  }
  return String(n);
}

interface AgentDetailProps {
  agentId: string;
  onBack: () => void;
}

export function AgentDetail({ agentId, onBack }: AgentDetailProps) {
  const agent: Agent | undefined = (storeData.agents as Agent[]).find(
    (a) => a.id === agentId
  );

  const [installed, setInstalled] = useState(false);
  const [selectedButton, setSelectedButton] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.leftArrow) {
      setSelectedButton((prev) => Math.max(0, prev - 1));
    }
    if (key.rightArrow) {
      setSelectedButton((prev) => Math.min(1, prev + 1));
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
      <Box flexDirection="column" padding={1}>
        <Text color="red">Agent not found: {agentId}</Text>
      </Box>
    );
  }

  const installLabel = installed ? "Uninstall" : "Install";

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header box */}
      <Box
        borderStyle="round"
        borderColor="#48dbfb"
        paddingLeft={1}
        paddingRight={1}
        justifyContent="space-between"
      >
        <Box>
          <Text bold color="#48dbfb">
            {agent.name}
          </Text>
          <Text dimColor>  v{agent.version}</Text>
        </Box>
        {agent.verified && <Text color="#2ed573">{"\u2713"} Verified</Text>}
      </Box>

      {/* Stats line */}
      <Box marginTop={1} gap={2}>
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
      <Box marginTop={1}>
        <Text>{agent.description}</Text>
      </Box>

      {/* Separator */}
      <Box marginTop={1}>
        <Text dimColor>
          {"\u2500".repeat(55)}
        </Text>
      </Box>

      {/* Long description */}
      <Box marginTop={1}>
        <Text wrap="wrap">{agent.longDescription}</Text>
      </Box>

      {/* Separator */}
      <Box marginTop={1}>
        <Text dimColor>
          {"\u2500".repeat(55)}
        </Text>
      </Box>

      {/* Capabilities */}
      <Box marginTop={1} gap={1}>
        <Text bold>Capabilities:</Text>
        {agent.capabilities.map((cap) => (
          <Text key={cap} color="#5f27cd">
            {cap}
          </Text>
        ))}
      </Box>

      {/* Meta line */}
      <Box marginTop={1} gap={2}>
        <Text dimColor>Updated: {agent.updated}</Text>
        <Text dimColor>|</Text>
        <Text dimColor>Category: {agent.category}</Text>
      </Box>

      {/* Buttons */}
      <Box marginTop={1} gap={2}>
        <Text
          bold={selectedButton === 0}
          color={selectedButton === 0 ? "#48dbfb" : undefined}
          inverse={selectedButton === 0}
        >
          {" "}
          {installLabel}{" "}
        </Text>
        <Text
          bold={selectedButton === 1}
          color={selectedButton === 1 ? "#48dbfb" : undefined}
          inverse={selectedButton === 1}
        >
          {" "}
          Back{" "}
        </Text>
      </Box>
    </Box>
  );
}
