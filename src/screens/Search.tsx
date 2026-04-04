import React, { useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";
import { colors, columns } from "../cli_app_theme.js";
import { Breadcrumb, Rating, InstallCount, VerifiedBadge, Cursor, Separator, HelpFooter } from "../cli_app_components.js";


interface StoreData {
  agents: Agent[];
}

const storeData: StoreData = JSON.parse(
  fs.readFileSync(new URL("../data/store.json", import.meta.url), "utf-8")
);

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
      // Only down arrow leaves the input — left/right stay in text field
      if (key.downArrow && results.length > 0) {
        update({ inputFocused: false, selectedIndex: 0 });
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

  const allRows: React.ReactNode[] = [];

  // Row 0: breadcrumb
  allRows.push(<Breadcrumb key="breadcrumb" path={["Home", "Search"]} />);

  // Row 1: header
  allRows.push(
    <Box key="header" marginBottom={1}>
      <Text bold color={colors.primary}>Search Agents</Text>
    </Box>
  );

  // Row 2: search input
  allRows.push(
    <Box key="search-input" marginBottom={1}>
      <Text color={inputFocused ? colors.primary : undefined}>{"\u276f "}</Text>
      <TextInput
        value={query}
        onChange={handleQueryChange}
        placeholder="Type to search..."
        focus={inputFocused}
      />
    </Box>
  );

  // Row 3: result count
  allRows.push(
    <Box key="result-count" marginBottom={1}>
      <Text dimColor>
        {results.length} result{results.length !== 1 ? "s" : ""}
        {query.trim() ? ` for "${query}"` : ""}
        {totalPages > 1 ? `  Page ${currentPage + 1}/${totalPages}` : ""}
      </Text>
    </Box>
  );

  // Row 4: separator
  allRows.push(<Separator key="separator" />);


  if (results.length === 0 && query.trim()) {
    allRows.push(
      <Box key="no-results" paddingLeft={2} flexDirection="column">
        <Text dimColor>No results found for "{query}"</Text>
      </Box>
    );
    allRows.push(
      <Box key="no-results-hint" paddingLeft={2}>
        <Text dimColor>Try a different search term.</Text>
      </Box>
    );
  } else {
    pagedResults.forEach((agent, i) => {
      const isActive = !inputFocused && i === selectedIndex;
      allRows.push(
        <Box key={`result-${agent.id}`} flexDirection="column" marginBottom={1}>
          <Box>
            <Cursor active={isActive} />
            <Box width={columns.name}>
              <Text bold={isActive} color={isActive ? colors.primary : undefined}>
                {agent.name}
              </Text>
            </Box>
            <Box width={16}>
              <Text dimColor>by {agent.author}</Text>
            </Box>
            <Rating value={agent.rating} />
            <InstallCount count={agent.installs} />
            <VerifiedBadge verified={agent.verified} />
          </Box>
          <Box paddingLeft={4} flexDirection="column">
            <Text dimColor>{agent.description}</Text>
            <Box gap={1}>
              {agent.capabilities.map((cap) => (
                <Text key={cap} color={colors.secondary}>[{cap}]</Text>
              ))}
            </Box>
          </Box>
        </Box>
      );
    });
  }

  // Row: help footer
  allRows.push(
    <HelpFooter key="footer" text={`Esc back \u00b7 \u2191\u2193 nav \u00b7 Enter select${totalPages > 1 ? " \u00b7 \u2190\u2192 pages" : ""}`} />
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
