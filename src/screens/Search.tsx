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
  const filled = Math.round(rating);
  const empty = 5 - filled;
  return "\u2605".repeat(filled) + "\u2606".repeat(empty);
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

const PAGE_SIZE = 5;

interface SearchProps {
  onBack: () => void;
  onViewAgent: (id: string) => void;
  savedQuery?: string;
  savedIndex?: number;
  onQueryChange?: (query: string) => void;
  onIndexChange?: (index: number) => void;
}

export function Search({ onBack, onViewAgent, savedQuery, savedIndex, onQueryChange, onIndexChange }: SearchProps) {
  const [query, setQuery] = useState(savedQuery || "");
  const [selectedIndex, setSelectedIndex] = useState(savedIndex ?? 0);
  const [inputFocused, setInputFocused] = useState(!savedQuery);
  const [page, setPage] = useState(savedIndex != null ? Math.floor(savedIndex / PAGE_SIZE) : 0);

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

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pagedResults = results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useInput((input, key) => {
    if (key.escape) {
      if (!inputFocused) {
        // In results → go back to input
        setInputFocused(true);
      } else if (query.length > 0) {
        // In input with text → clear the text
        setQuery("");
        setSelectedIndex(0);
        setPage(0);
      } else {
        // In input with no text → go back
        onBack();
      }
      return;
    }

    if (inputFocused) {
      // When input is focused and user presses down arrow, switch to results
      if (key.downArrow && results.length > 0) {
        setInputFocused(false);
        setSelectedIndex(0);
        setPage(0);
        return;
      }
      // Left/right arrows for page navigation while in input
      if (key.leftArrow && page > 0) {
        setPage((p) => p - 1);
        setSelectedIndex(0);
        return;
      }
      if (key.rightArrow && page < totalPages - 1) {
        setPage((p) => p + 1);
        setSelectedIndex(0);
        return;
      }
      return;
    }

    // Results focused
    if (key.upArrow) {
      if (selectedIndex === 0) {
        // At top of results, go back to input
        setInputFocused(true);
      } else {
        setSelectedIndex((i) => i - 1);
      }
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(pagedResults.length - 1, i + 1));
      return;
    }
    if (key.leftArrow) {
      if (page > 0) {
        setPage((p) => p - 1);
        setSelectedIndex(0);
      }
      return;
    }
    if (key.rightArrow) {
      if (page < totalPages - 1) {
        setPage((p) => p + 1);
        setSelectedIndex(0);
      }
      return;
    }
    if (key.return) {
      const agent = pagedResults[selectedIndex];
      if (agent) {
        const globalIndex = page * PAGE_SIZE + selectedIndex;
        onIndexChange?.(globalIndex);
        onViewAgent(agent.id);
      }
      return;
    }

    // Any printable character typed while in results: switch back to input
    if (input && !key.ctrl && !key.meta) {
      setInputFocused(true);
      setQuery((q) => q + input);
      setSelectedIndex(0);
      setPage(0);
      return;
    }
  });

  const handleQueryChange = (value: string) => {
    setQuery(value);
    onQueryChange?.(value);
    setSelectedIndex(0);
    setPage(0);
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Breadcrumb */}
      <Box marginBottom={0}>
        <Text dimColor>Home &gt; Search</Text>
      </Box>

      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="#48dbfb">
          Search Agents
        </Text>
      </Box>

      {/* Search input */}
      <Box marginBottom={1}>
        <Text color={inputFocused ? "#48dbfb" : undefined}>{"\u276f "}</Text>
        <TextInput
          value={query}
          onChange={handleQueryChange}
          placeholder="Type to search..."
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
        <Text dimColor>{"\u2500".repeat(60)}</Text>
      </Box>

      {/* Results */}
      <Box flexDirection="column">
        {results.length === 0 && query.trim() ? (
          <Box paddingLeft={2} flexDirection="column">
            <Text dimColor>No results found for &quot;{query}&quot;</Text>
            <Text dimColor>Try a different search term.</Text>
          </Box>
        ) : (
          pagedResults.map((agent, i) => {
            const isActive = !inputFocused && i === selectedIndex;
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
                  <Box width={16}>
                    <Text dimColor>
                      {formatNumber(agent.installs)} installs
                    </Text>
                  </Box>
                  {agent.verified && <Text color="#2ed573"> {"\u2713"}</Text>}
                </Box>
                <Box paddingLeft={4}>
                  <Text dimColor>{agent.description}</Text>
                </Box>
                {isActive && agent.capabilities.length > 0 && (
                  <Box paddingLeft={4} gap={1}>
                    {agent.capabilities.map((cap) => (
                      <Text key={cap} color="#54a0ff">
                        [{cap}]
                      </Text>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })
        )}
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {page + 1}/{totalPages}  {"\u2190\u2192"} prev/next
          </Text>
        </Box>
      )}

      {/* Help text */}
      <Box marginTop={1}>
        <Text dimColor>Esc back · ↑↓ nav · Enter select · / search</Text>
      </Box>
    </Box>
  );
}
