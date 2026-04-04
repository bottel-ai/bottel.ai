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
  const filled = Math.round(rating);
  const empty = 5 - filled;
  return "\u2605".repeat(filled) + "\u2606".repeat(empty);
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
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

    if (key.upArrow) {
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

    if (key.downArrow) {
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

      <Box flexDirection="row">
        {/* Category list - vertical with arrow indicators */}
        <Box flexDirection="column" width={30}>
          {categories.map((cat, i) => {
            const isActive = i === categoryIndex;
            const isFocused = focus === "categories";
            return (
              <Box key={cat.name}>
                <Text color={isActive && isFocused ? "#48dbfb" : undefined}>
                  {isActive ? "\u276f " : "  "}
                </Text>
                <Text
                  bold={isActive}
                  color={isActive ? "#48dbfb" : undefined}
                  inverse={isActive && isFocused}
                >
                  {cat.icon} {cat.name}
                </Text>
                <Text dimColor> ({cat.agents.length})</Text>
              </Box>
            );
          })}
        </Box>

        {/* Vertical divider */}
        <Box flexDirection="column" marginX={1}>
          <Text dimColor>{"\u2502".repeat(Math.max(categories.length, categoryAgents.length + 1))}</Text>
        </Box>

        {/* Agent list for selected category */}
        <Box flexDirection="column" flexGrow={1}>
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
                    <Box width={20}>
                      <Text bold={isActive} color={isActive ? "#48dbfb" : undefined}>
                        {agent.name}
                      </Text>
                    </Box>
                    <Box width={16}>
                      <Text dimColor>by {agent.author}</Text>
                    </Box>
                    <Box width={14}>
                      <Text color="#feca57">
                        {renderStars(agent.rating)} {agent.rating.toFixed(1)}
                      </Text>
                    </Box>
                    <Box width={14}>
                      <Text dimColor>
                        {formatNumber(agent.installs)} installs
                      </Text>
                    </Box>
                    {agent.verified && <Text color="#2ed573"> {"\u2713"}</Text>}
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
    </Box>
  );
}
