import React, { useMemo } from "react";
import { Box, Text, useInput } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";
import { colors, columns, Breadcrumb, Cursor, ScreenHeader, HelpFooter } from "../cli_app_theme.js";

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
      <Breadcrumb path={["Home", "Installed"]} />

      <ScreenHeader title={`Installed Apps (${installedAgents.length})`} />

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
                <Cursor active={isSelected} />
                <Box width={columns.name}>
                  <Text bold={isSelected} color={isSelected ? colors.primary : undefined}>{agent.name}</Text>
                </Box>
                <Box width={columns.rating}>
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

      <HelpFooter text="Esc back \u00b7 \u2191\u2193 nav \u00b7 Enter select" />
    </Box>
  );
}
