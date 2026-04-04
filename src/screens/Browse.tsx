import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";

interface StoreData {
  categories: { name: string; icon: string; agents: string[] }[];
  agents: Agent[];
}

const storeData: StoreData = JSON.parse(
  fs.readFileSync(new URL("../data/store.json", import.meta.url), "utf-8")
);

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return "\u2605".repeat(full) + (half ? "\u2606" : "") + "\u00b7".repeat(empty);
}

function formatInstalls(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

type Focus = "categories" | "agents";

interface BrowseProps {
  onBack: () => void;
  onViewAgent: (id: string) => void;
}

export function Browse({ onBack, onViewAgent }: BrowseProps) {
  const [focus, setFocus] = useState<Focus>("categories");
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [agentIndex, setAgentIndex] = useState(0);

  const categories = storeData.categories;

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of storeData.agents) {
      map.set(a.id, a);
    }
    return map;
  }, []);

  const selectedCategory = categories[categoryIndex];
  const categoryAgents = useMemo(() => {
    if (!selectedCategory) return [];
    return selectedCategory.agents
      .map((id) => agentMap.get(id))
      .filter(Boolean) as Agent[];
  }, [selectedCategory, agentMap]);

  useInput((_input, key) => {
    if (key.escape) {
      if (focus === "agents") {
        setFocus("categories");
      } else {
        onBack();
      }
      return;
    }

    if (key.tab) {
      setFocus((f) => (f === "categories" ? "agents" : "categories"));
      return;
    }

    if (key.return) {
      if (focus === "categories") {
        setFocus("agents");
        setAgentIndex(0);
      } else {
        const agent = categoryAgents[agentIndex];
        if (agent) onViewAgent(agent.id);
      }
      return;
    }

    if (key.upArrow || key.leftArrow) {
      if (focus === "categories") {
        setCategoryIndex((i) => {
          const next = Math.max(0, i - 1);
          setAgentIndex(0);
          return next;
        });
      } else {
        setAgentIndex((i) => Math.max(0, i - 1));
      }
    }

    if (key.downArrow || key.rightArrow) {
      if (focus === "categories") {
        setCategoryIndex((i) => {
          const next = Math.min(categories.length - 1, i + 1);
          setAgentIndex(0);
          return next;
        });
      } else {
        setAgentIndex((i) => Math.min(categoryAgents.length - 1, i + 1));
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="#48dbfb">
          Browse Categories
        </Text>
        <Text dimColor>{"   "}Esc: back | Tab: switch focus | Enter: select</Text>
      </Box>

      {/* Categories bar */}
      <Box gap={2} flexWrap="wrap" marginBottom={1}>
        {categories.map((cat, i) => {
          const isActive = i === categoryIndex;
          return (
            <Text
              key={cat.name}
              bold={isActive}
              color={isActive ? "#48dbfb" : undefined}
              inverse={isActive && focus === "categories"}
            >
              {cat.icon} {cat.name} ({cat.agents.length})
            </Text>
          );
        })}
      </Box>

      {/* Divider */}
      <Box marginBottom={1}>
        <Text dimColor>{"─".repeat(60)}</Text>
      </Box>

      {/* Agent list for selected category */}
      <Box flexDirection="column">
        <Text bold>
          {selectedCategory?.icon} {selectedCategory?.name}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {categoryAgents.map((agent, i) => {
            const isActive = focus === "agents" && i === agentIndex;
            return (
              <Box key={agent.id} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={isActive ? "#48dbfb" : undefined}>
                    {isActive ? "\u276f " : "  "}
                  </Text>
                  <Text bold={isActive} color={isActive ? "#48dbfb" : undefined}>
                    {agent.name}
                  </Text>
                  <Text dimColor> by {agent.author} </Text>
                  <Text color="#feca57">
                    {renderStars(agent.rating)} {agent.rating.toFixed(1)}
                  </Text>
                  <Text dimColor>
                    {"  "}{formatInstalls(agent.installs)} installs
                  </Text>
                  {agent.verified && <Text color="#2ed573"> \u2713</Text>}
                </Box>
                {isActive && (
                  <Box paddingLeft={4}>
                    <Text dimColor>{agent.description}</Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
