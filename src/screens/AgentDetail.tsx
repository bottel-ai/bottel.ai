import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
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

const MAX_DESCRIPTION_LINES = 8;

type InstallState = "not-installed" | "installing" | "installed";

interface AgentDetailProps {
  agentId: string;
  onBack: () => void;
}

export function AgentDetail({ agentId, onBack }: AgentDetailProps) {
  const agent = useMemo(() => {
    return storeData.agents.find((a) => a.id === agentId);
  }, [agentId]);

  const [installState, setInstallState] = useState<InstallState>("not-installed");
  const [selectedButton, setSelectedButton] = useState(0); // 0 = Install/Uninstall, 1 = Back

  // Handle installing timer
  useEffect(() => {
    if (installState !== "installing") return;
    const timer = setTimeout(() => {
      setInstallState("installed");
    }, 1000);
    return () => clearTimeout(timer);
  }, [installState]);

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
        if (installState === "not-installed") {
          setInstallState("installing");
        } else if (installState === "installed") {
          setInstallState("not-installed");
        }
        // ignore press while installing
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

  // Truncate long description to MAX_DESCRIPTION_LINES
  const descriptionLines = agent.longDescription.split("\n");
  const isTruncated = descriptionLines.length > MAX_DESCRIPTION_LINES;
  const visibleLines = isTruncated
    ? descriptionLines.slice(0, MAX_DESCRIPTION_LINES)
    : descriptionLines;

  const installLabel =
    installState === "installing"
      ? "Installing..."
      : installState === "installed"
        ? "Installed \u2713"
        : "Install";
  const uninstallMode = installState === "installed";

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Breadcrumb */}
      <Box marginBottom={1}>
        <Text dimColor>Home &gt; {agent.category} &gt; {agent.name}</Text>
      </Box>

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

      {/* Long description (truncated to MAX_DESCRIPTION_LINES) */}
      <Box paddingX={2} marginTop={1} flexDirection="column">
        {visibleLines.map((line, i) => (
          <Text key={`desc-line-${i}`}>{line}</Text>
        ))}
        {isTruncated && (
          <Text dimColor>... (Show more)</Text>
        )}
      </Box>

      {/* Separator */}
      <Box paddingX={2} marginTop={1}>
        <Text dimColor>{"\u2500".repeat(55)}</Text>
      </Box>

      {/* Capabilities as colored tags */}
      <Box paddingX={2} marginTop={1} gap={1} flexWrap="wrap">
        <Text bold>Capabilities:</Text>
        {agent.capabilities.map((cap) => (
          <Text key={`cap-${cap}`} color="#54a0ff">
            [{cap}]
          </Text>
        ))}
      </Box>

      {/* Meta line */}
      <Box paddingX={2} marginTop={1} gap={2}>
        <Text dimColor>Updated: {agent.updated}</Text>
        <Text dimColor>|</Text>
        <Text color="#54a0ff" underline>Category: {agent.category}</Text>
      </Box>

      {/* Action buttons */}
      <Box paddingX={2} marginTop={1} gap={2}>
        <Text
          bold={selectedButton === 0}
          color={selectedButton === 0 ? (uninstallMode ? "red" : "cyan") : undefined}
          dimColor={selectedButton !== 0}
        >
          {installState === "installing" ? (
            <>[ <Spinner type="dots" /> Installing... ]</>
          ) : (
            `[ ${installState === "installed" ? "Uninstall" : installLabel} ]`
          )}
        </Text>
        {installState === "installed" && selectedButton !== 0 && (
          <Text color="#2ed573">Installed ✓</Text>
        )}
        <Text
          bold={selectedButton === 1}
          color={selectedButton === 1 ? "cyan" : undefined}
          dimColor={selectedButton !== 1}
        >
          [ Back ]
        </Text>
      </Box>

      {/* Help text */}
      <Box paddingX={2} marginTop={1}>
        <Text dimColor>Esc back · ←→ nav · Enter select</Text>
      </Box>
    </Box>
  );
}
