import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";
import { colors, formatStars, formatNumber, boxStyle, Breadcrumb, Separator, HelpFooter } from "../cli_app_theme.js";

interface StoreData {
  agents: Agent[];
}

const storeData: StoreData = JSON.parse(
  fs.readFileSync(new URL("../data/store.json", import.meta.url), "utf-8")
);

type InstallStatus = "idle" | "installing";

export function AgentDetail({ agentId }: { agentId: string }) {
  const { state, dispatch, goBack } = useStore();
  const { buttonIndex } = state.agentDetail;
  const [installStatus, setInstallStatus] = useState<InstallStatus>("idle");

  const agent = storeData.agents.find((a) => a.id === agentId);
  const isInstalled = state.installed.has(agentId);

  useEffect(() => {
    if (installStatus === "installing") {
      const timer = setTimeout(() => {
        dispatch({ type: "INSTALL_AGENT", agentId });
        setInstallStatus("idle");
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [installStatus]);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }
    if (key.leftArrow) dispatch({ type: "UPDATE_AGENT_DETAIL", state: { buttonIndex: 0 } });
    if (key.rightArrow) dispatch({ type: "UPDATE_AGENT_DETAIL", state: { buttonIndex: 1 } });
    if (key.return && installStatus === "idle") {
      if (buttonIndex === 0) {
        if (isInstalled) {
          dispatch({ type: "UNINSTALL_AGENT", agentId });
        } else {
          setInstallStatus("installing");
        }
      } else {
        goBack();
      }
    }
  });

  if (!agent) {
    return (
      <Box paddingX={1} flexDirection="column">
        <Text color="red">Agent not found: {agentId}</Text>
        <Text dimColor>Esc to go back</Text>
      </Box>
    );
  }

  const descLines = agent.longDescription.split("\n");
  const truncated = descLines.length > 8;
  const displayLines = truncated ? descLines.slice(0, 8) : descLines;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Home", agent.category, agent.name]} />

      <Box {...boxStyle.header} paddingX={1} marginY={1}>
        <Box flexGrow={1}>
          <Text bold color={colors.primary}>{agent.name}</Text>
          <Text dimColor>  v{agent.version}</Text>
        </Box>
        {agent.verified && <Text color={colors.success}>Verified</Text>}
      </Box>

      <Text dimColor>by {agent.author}</Text>
      <Text>{""}</Text>

      <Box gap={2}>
        <Text color={colors.warning}>{formatStars(agent.rating)} {agent.rating.toFixed(1)}</Text>
        <Text dimColor>({formatNumber(agent.reviews)} reviews)</Text>
        <Text dimColor>{formatNumber(agent.installs)} installs</Text>
        <Text dimColor>{agent.size}</Text>
      </Box>
      <Text>{""}</Text>
      <Text>{agent.description}</Text>
      <Text>{""}</Text>
      <Separator />
      <Text>{""}</Text>

      {displayLines.map((line, i) => (
        <Text key={`desc-${i}`}>{line}</Text>
      ))}
      {truncated && <Text dimColor>... (more)</Text>}
      <Text>{""}</Text>
      <Separator />
      <Text>{""}</Text>

      <Box gap={1}>
        <Text>Capabilities: </Text>
        {agent.capabilities.map((cap) => (
          <Text key={cap} color={colors.secondary}>[{cap}]</Text>
        ))}
      </Box>
      <Text>{""}</Text>
      <Text dimColor>Updated: {agent.updated}  |  Category: <Text color={colors.secondary} underline>{agent.category}</Text></Text>
      <Text>{""}</Text>

      <Box gap={2}>
        {installStatus === "installing" ? (
          <Text color={colors.warning}><Spinner type="dots" /> Installing...</Text>
        ) : (
          <Text
            bold={buttonIndex === 0}
            color={buttonIndex === 0 ? (isInstalled ? "red" : colors.primary) : undefined}
            dimColor={buttonIndex !== 0}
          >
            [ {isInstalled ? "Uninstall" : "Install"} ]
          </Text>
        )}
        <Text
          bold={buttonIndex === 1}
          color={buttonIndex === 1 ? colors.primary : undefined}
          dimColor={buttonIndex !== 1}
        >
          [ Back ]
        </Text>
        {isInstalled && installStatus === "idle" && (
          <Text color={colors.success}>Installed {"\u2713"}</Text>
        )}
      </Box>

      <HelpFooter text="Esc back \u00b7 \u2190\u2192 nav \u00b7 Enter select" />
    </Box>
  );
}
