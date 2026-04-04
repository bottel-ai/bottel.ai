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

const AGENTS_PAGE_SIZE = 5;

interface BrowseProps {
  onBack: () => void;
  onViewAgent: (id: string) => void;
}

export function Browse({ onBack, onViewAgent }: BrowseProps) {
  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [agentIndex, setAgentIndex] = useState(0);
  const [inAgents, setInAgents] = useState(false);
  const [agentPage, setAgentPage] = useState(0);

  const categories = storeData.categories;

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of storeData.agents) {
      map.set(a.id, a);
    }
    return map;
  }, []);

  const getAgentsForCategory = (catIndex: number): Agent[] => {
    const cat = categories[catIndex];
    if (!cat) return [];
    return cat.agents
      .map((id) => agentMap.get(id))
      .filter(Boolean) as Agent[];
  };

  const expandedAgents = expandedCategory !== null ? getAgentsForCategory(expandedCategory) : [];
  const totalAgentPages = Math.max(1, Math.ceil(expandedAgents.length / AGENTS_PAGE_SIZE));
  const pagedAgents = expandedAgents.slice(
    agentPage * AGENTS_PAGE_SIZE,
    (agentPage + 1) * AGENTS_PAGE_SIZE
  );

  useInput((_input, key) => {
    if (key.escape) {
      if (inAgents) {
        // Navigating agents → go back to category list
        setInAgents(false);
        setAgentIndex(0);
        setAgentPage(0);
        setExpandedCategory(null);
      } else {
        // In category list → go back to previous screen
        onBack();
      }
      return;
    }

    if (key.return) {
      if (inAgents) {
        // Select agent
        const agent = pagedAgents[agentIndex];
        if (agent) onViewAgent(agent.id);
      } else {
        // Toggle expand/collapse category
        if (expandedCategory === categoryIndex) {
          // Already expanded, enter agent navigation
          if (expandedAgents.length > 0) {
            setInAgents(true);
            setAgentIndex(0);
            setAgentPage(0);
          }
        } else {
          // Expand this category
          setExpandedCategory(categoryIndex);
          setAgentIndex(0);
          setAgentPage(0);
        }
      }
      return;
    }

    if (key.upArrow) {
      if (inAgents) {
        if (agentIndex === 0) {
          // At top of agent list, go back to category
          setInAgents(false);
        } else {
          setAgentIndex((i) => i - 1);
        }
      } else {
        setCategoryIndex((i) => Math.max(0, i - 1));
      }
      return;
    }

    if (key.downArrow) {
      if (inAgents) {
        setAgentIndex((i) => Math.min(pagedAgents.length - 1, i + 1));
      } else {
        setCategoryIndex((i) => Math.min(categories.length - 1, i + 1));
      }
      return;
    }

    if (key.leftArrow && inAgents && agentPage > 0) {
      setAgentPage((p) => p - 1);
      setAgentIndex(0);
      return;
    }

    if (key.rightArrow && inAgents && agentPage < totalAgentPages - 1) {
      setAgentPage((p) => p + 1);
      setAgentIndex(0);
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Breadcrumb */}
      <Box marginBottom={0}>
        <Text dimColor>
          Home &gt; Browse{expandedCategory !== null ? ` > ${categories[expandedCategory].name}` : ""}
        </Text>
      </Box>

      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="#48dbfb">
          Browse Categories
        </Text>
      </Box>

      {/* Category list with inline agents */}
      <Box flexDirection="column">
        {categories.map((cat, i) => {
          const isActive = !inAgents && i === categoryIndex;
          const isExpanded = expandedCategory === i;
          const catAgents = isExpanded ? getAgentsForCategory(i) : [];
          const catPagedAgents = isExpanded
            ? catAgents.slice(agentPage * AGENTS_PAGE_SIZE, (agentPage + 1) * AGENTS_PAGE_SIZE)
            : [];
          const catTotalPages = Math.max(1, Math.ceil(catAgents.length / AGENTS_PAGE_SIZE));

          return (
            <Box key={cat.name} flexDirection="column">
              <Box>
                <Text color={isActive ? "#48dbfb" : undefined}>
                  {isActive ? "\u276f " : "  "}
                </Text>
                <Text
                  bold={isActive || isExpanded}
                  color={isActive ? "#48dbfb" : isExpanded ? "#48dbfb" : undefined}
                >
                  {cat.icon} {cat.name}
                </Text>
                <Text dimColor> ({cat.agents.length})</Text>
                {isExpanded && <Text dimColor> {"\u25bc"}</Text>}
                {!isExpanded && isActive && <Text dimColor> {"\u25b6"}</Text>}
              </Box>

              {/* Expanded agents inline */}
              {isExpanded && (
                <Box flexDirection="column" paddingLeft={4} marginTop={1} marginBottom={1}>
                  {catPagedAgents.map((agent, ai) => {
                    const isAgentActive = inAgents && ai === agentIndex;
                    return (
                      <Box key={agent.id} flexDirection="column" marginBottom={1}>
                        <Box>
                          <Text color={isAgentActive ? "#48dbfb" : undefined}>
                            {isAgentActive ? "\u276f " : "  "}
                          </Text>
                          <Box width={20}>
                            <Text bold={isAgentActive} color={isAgentActive ? "#48dbfb" : undefined}>
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
                        <Box paddingLeft={4}>
                          <Text dimColor wrap="truncate">{agent.description}</Text>
                        </Box>
                      </Box>
                    );
                  })}

                  {/* Agent pagination */}
                  {catTotalPages > 1 && (
                    <Box>
                      <Text dimColor>
                        Page {agentPage + 1}/{catTotalPages}  {"\u2190\u2192"} prev/next
                      </Text>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Help text */}
      <Box marginTop={1}>
        <Text dimColor>Esc back · ↑↓ nav · Enter select</Text>
      </Box>
    </Box>
  );
}
