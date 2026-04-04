import React, { useMemo } from "react";
import { Box, Text, useInput } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";

interface StoreData {
  agents: Agent[];
}

const storeData: StoreData = JSON.parse(
  fs.readFileSync(new URL("../data/store.json", import.meta.url), "utf-8")
);

export function Installed() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { selectedIndex } = state.installedScreen;

  const installedAgents = useMemo(() => {
    return storeData.agents.filter((a) => state.installed.has(a.id));
  }, [state.installed]);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }
    if (key.upArrow) {
      dispatch({ type: "UPDATE_INSTALLED", state: { selectedIndex: Math.max(0, selectedIndex - 1) } });
    }
    if (key.downArrow) {
      dispatch({ type: "UPDATE_INSTALLED", state: { selectedIndex: Math.min(installedAgents.length - 1, selectedIndex + 1) } });
    }
    if (key.return && installedAgents.length > 0 && installedAgents[selectedIndex]) {
      navigate({ name: "agent-detail", agentId: installedAgents[selectedIndex].id });
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>Home &gt; Installed</Text>

      <Box borderStyle="single" borderColor="#5f27cd" paddingX={2} marginBottom={1}>
        <Text bold color="#48dbfb">Installed Apps ({installedAgents.length})</Text>
      </Box>

      {installedAgents.length === 0 ? (
        <Box paddingLeft={2} flexDirection="column" marginTop={1}>
          <Text dimColor>No apps installed yet.</Text>
          <Text dimColor>Go to Home &gt; Browse to discover apps.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {installedAgents.map((agent, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Box key={agent.id}>
                <Text color={isSelected ? "#48dbfb" : undefined}>
                  {isSelected ? "\u276f " : "  "}
                </Text>
                <Box width={22}>
                  <Text bold={isSelected} color={isSelected ? "#48dbfb" : undefined}>{agent.name}</Text>
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

      <Box marginTop={1}>
        <Text dimColor>Esc back · ↑↓ nav · Enter select</Text>
      </Box>
    </Box>
  );
}
