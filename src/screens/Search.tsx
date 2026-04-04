import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";

interface StoreData {
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

interface SearchProps {
  onBack: () => void;
  onViewAgent: (id: string) => void;
}

export function Search({ onBack, onViewAgent }: SearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [inputFocused, setInputFocused] = useState(true);

  const allAgents = storeData.agents;

  const results = useMemo(() => {
    if (!query.trim()) return allAgents;
    const q = query.toLowerCase();
    return allAgents.filter((agent) => {
      return (
        agent.name.toLowerCase().includes(q) ||
        agent.description.toLowerCase().includes(q) ||
        agent.category.toLowerCase().includes(q) ||
        agent.author.toLowerCase().includes(q) ||
        agent.capabilities.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [query, allAgents]);

  useInput((_input, key) => {
    if (key.escape) {
      if (!inputFocused) {
        setInputFocused(true);
      } else {
        onBack();
      }
      return;
    }

    if (key.tab) {
      setInputFocused((f) => !f);
      return;
    }

    if (!inputFocused) {
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
      }
      if (key.downArrow) {
        setSelectedIndex((i) => Math.min(results.length - 1, i + 1));
      }
      if (key.return) {
        const agent = results[selectedIndex];
        if (agent) onViewAgent(agent.id);
      }
    }
  });

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="#48dbfb">
          Search Agents
        </Text>
        <Text dimColor>{"   "}Esc: back | Tab: toggle focus</Text>
      </Box>

      {/* Search input */}
      <Box marginBottom={1}>
        <Text color={inputFocused ? "#48dbfb" : undefined}>{"\u276f "}</Text>
        <TextInput
          value={query}
          onChange={handleQueryChange}
          placeholder="Search agents..."
          focus={inputFocused}
        />
      </Box>

      {/* Result count */}
      <Box marginBottom={1}>
        <Text dimColor>
          {results.length} result{results.length !== 1 ? "s" : ""}
          {query.trim() ? ` for "${query}"` : ""}
        </Text>
      </Box>

      {/* Divider */}
      <Box marginBottom={1}>
        <Text dimColor>{"─".repeat(60)}</Text>
      </Box>

      {/* Results */}
      <Box flexDirection="column">
        {results.map((agent, i) => {
          const isActive = !inputFocused && i === selectedIndex;
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
              <Box paddingLeft={4}>
                <Text dimColor>{agent.description}</Text>
              </Box>
            </Box>
          );
        })}
        {results.length === 0 && (
          <Box paddingLeft={2}>
            <Text dimColor>No agents found matching "{query}"</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
