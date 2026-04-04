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

// TODO: shared install state — currently hardcoded, should sync with AgentDetail install actions
const PREINSTALLED = ["code-reviewer", "translator", "data-analyst"];

interface InstalledProps {
  onBack: () => void;
  onViewAgent: (id: string) => void;
}

export function Installed({ onBack, onViewAgent }: InstalledProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const installedAgents = useMemo(() => {
    return storeData.agents.filter((a) => PREINSTALLED.includes(a.id));
  }, []);

  useInput((_input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(installedAgents.length - 1, i + 1));
    }

    if (key.return && installedAgents.length > 0) {
      onViewAgent(installedAgents[selectedIndex].id);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box
        borderStyle="single"
        borderColor="#5f27cd"
        paddingX={2}
        width="100%"
        marginBottom={1}
      >
        <Text bold color="#48dbfb">
          Installed Apps ({installedAgents.length})
        </Text>
        <Text dimColor>{"   "}Esc: back | Enter: view details</Text>
      </Box>

      {installedAgents.length === 0 ? (
        <Box paddingLeft={2} flexDirection="column" marginTop={1}>
          <Text dimColor>No apps installed yet.</Text>
          <Text dimColor>Browse the store to find and install apps.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {installedAgents.map((agent, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Box key={agent.id} marginBottom={0}>
                <Text color={isSelected ? "#48dbfb" : undefined}>
                  {isSelected ? "\u276f " : "  "}
                </Text>
                <Box width={22}>
                  <Text bold={isSelected} color={isSelected ? "#48dbfb" : undefined}>
                    {agent.name}
                  </Text>
                </Box>
                <Box width={10}>
                  <Text dimColor>v{agent.version}</Text>
                </Box>
                <Box width={18}>
                  <Text dimColor>by {agent.author}</Text>
                </Box>
                <Text dimColor>[{agent.category}]</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
