import React, { useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";

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

export function Search() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { query, selectedIndex, page, inputFocused } = state.search;

  const allAgents = storeData.agents;

  const results = useMemo(() => {
    if (!query.trim()) return allAgents;
    const q = query.toLowerCase();
    return allAgents.filter((agent) =>
      agent.name.toLowerCase().includes(q) ||
      agent.description.toLowerCase().includes(q) ||
      agent.category.toLowerCase().includes(q) ||
      agent.author.toLowerCase().includes(q) ||
      agent.capabilities.some((c) => c.toLowerCase().includes(q))
    );
  }, [query, allAgents]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedResults = results.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const update = (s: Partial<typeof state.search>) =>
    dispatch({ type: "UPDATE_SEARCH", state: s });

  useInput((input, key) => {
    if (key.escape) {
      if (!inputFocused) {
        update({ inputFocused: true });
      } else if (query) {
        update({ query: "", selectedIndex: 0, page: 0 });
      } else {
        goBack();
      }
      return;
    }

    if (inputFocused) {
      if (key.downArrow && results.length > 0) {
        update({ inputFocused: false, selectedIndex: 0 });
        return;
      }
      if (key.leftArrow && currentPage > 0) {
        update({ page: currentPage - 1, selectedIndex: 0 });
        return;
      }
      if (key.rightArrow && currentPage < totalPages - 1) {
        update({ page: currentPage + 1, selectedIndex: 0 });
        return;
      }
      return;
    }

    // In results
    if (key.upArrow) {
      if (selectedIndex <= 0) {
        update({ inputFocused: true });
      } else {
        update({ selectedIndex: selectedIndex - 1 });
      }
      return;
    }
    if (key.downArrow) {
      update({ selectedIndex: Math.min(pagedResults.length - 1, selectedIndex + 1) });
      return;
    }
    if (key.leftArrow && currentPage > 0) {
      update({ page: currentPage - 1, selectedIndex: 0 });
      return;
    }
    if (key.rightArrow && currentPage < totalPages - 1) {
      update({ page: currentPage + 1, selectedIndex: 0 });
      return;
    }
    if (key.return) {
      const agent = pagedResults[selectedIndex];
      if (agent) {
        navigate({ name: "agent-detail", agentId: agent.id });
      }
      return;
    }

    // Typing while in results: switch back to input
    if (input && !key.ctrl && !key.meta) {
      update({ inputFocused: true, query: query + input, selectedIndex: 0, page: 0 });
      return;
    }
  });

  const handleQueryChange = (value: string) => {
    update({ query: value, selectedIndex: 0, page: 0 });
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>Home &gt; Search</Text>
      <Box marginBottom={1}>
        <Text bold color="#48dbfb">Search Agents</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={inputFocused ? "#48dbfb" : undefined}>{"\u276f "}</Text>
        <TextInput
          value={query}
          onChange={handleQueryChange}
          placeholder="Type to search..."
          focus={inputFocused}
        />
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          {results.length} result{results.length !== 1 ? "s" : ""}
          {query.trim() ? ` for "${query}"` : ""}
          {totalPages > 1 ? `  Page ${currentPage + 1}/${totalPages}` : ""}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>{"\u2500".repeat(60)}</Text>
      </Box>

      <Box flexDirection="column">
        {results.length === 0 && query.trim() ? (
          <Box paddingLeft={2} flexDirection="column">
            <Text dimColor>No results found for "{query}"</Text>
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
                    <Text dimColor>{formatNumber(agent.installs)} installs</Text>
                  </Box>
                  {agent.verified && <Text color="#2ed573"> {"\u2713"}</Text>}
                </Box>
                {isActive && (
                  <Box paddingLeft={4} flexDirection="column">
                    <Text dimColor>{agent.description}</Text>
                    <Box gap={1}>
                      {agent.capabilities.map((cap) => (
                        <Text key={cap} color="#54a0ff">[{cap}]</Text>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Esc back · ↑↓ nav · Enter select{totalPages > 1 ? " · ←→ pages" : ""}</Text>
      </Box>
    </Box>
  );
}
