import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";

const storeData = JSON.parse(
  fs.readFileSync(new URL("../data/store.json", import.meta.url), "utf-8")
);

const allAgents: Agent[] = storeData.agents;

const DEFAULT_INSTALLED = new Set(["code-reviewer", "translator", "data-analyst"]);

interface InstalledProps {
  onBack: () => void;
  onViewAgent: (id: string) => void;
}

export function Installed({ onBack, onViewAgent }: InstalledProps) {
  const [installedIds, setInstalledIds] = useState<Set<string>>(
    () => new Set(DEFAULT_INSTALLED)
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  const installedAgents = allAgents.filter((a) => installedIds.has(a.id));

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((prev) =>
        Math.min(installedAgents.length - 1, prev + 1)
      );
    }
    if (key.return && installedAgents.length > 0) {
      onViewAgent(installedAgents[selectedIndex].id);
    }
    if (input === "u" && installedAgents.length > 0) {
      const agentToRemove = installedAgents[selectedIndex].id;
      setInstalledIds((prev) => {
        const next = new Set(prev);
        next.delete(agentToRemove);
        return next;
      });
      setSelectedIndex((prev) =>
        Math.min(prev, installedAgents.length - 2)
      );
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="#48dbfb">
          Installed Agents
        </Text>
        <Text dimColor> ({installedAgents.length})</Text>
      </Box>

      {installedAgents.length === 0 ? (
        <Text dimColor>No agents installed.</Text>
      ) : (
        installedAgents.map((agent, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={agent.id} gap={1}>
              <Text>{isSelected ? "> " : "  "}</Text>
              <Text
                bold={isSelected}
                color={isSelected ? "#48dbfb" : undefined}
              >
                {agent.name.padEnd(20)}
              </Text>
              <Text dimColor>v{agent.version.padEnd(10)}</Text>
              <Text dimColor>by {agent.author.padEnd(14)}</Text>
              <Text color="#2ed573">installed</Text>
            </Box>
          );
        })
      )}

      <Box marginTop={1}>
        <Text dimColor>
          [Enter] View detail  [u] Uninstall  [Esc] Back
        </Text>
      </Box>
    </Box>
  );
}
