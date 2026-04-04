import React, { useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";
import { Viewport } from "../cli_app_viewport.js";
import { colors, columns, Cursor, Rating, InstallCount, VerifiedBadge } from "../cli_app_theme.js";

interface StoreData {
  featured: string[];
  trending: string[];
  categories: { name: string; icon: string; agents: string[] }[];
  agents: Agent[];
}

const storeData: StoreData = JSON.parse(
  fs.readFileSync(new URL("../data/store.json", import.meta.url), "utf-8")
);

const MENU_ITEMS = [
  { label: "Home", value: "home", description: "Store front" },
  { label: "Browse", value: "browse", description: "Browse by category" },
  { label: "Search", value: "search", description: "Find apps" },
  { label: "Installed", value: "installed", description: "Your apps" },
  { label: "Settings", value: "settings", description: "Preferences" },
  { label: "Exit", value: "exit", description: "Quit bottel" },
];

const LOGO_LINES: [string, string][] = [
  ["  \u2588\u2588\u2588\u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557         \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557  ", "#ff6b6b"],
  ["  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557 \u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557 \u255a\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255d\u255a\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255d\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2551        \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551  ", "#ff9f43"],
  ["  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d \u2588\u2588\u2551   \u2588\u2588\u2551    \u2588\u2588\u2551      \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551        \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  ", "#feca57"],
  ["  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557 \u2588\u2588\u2551   \u2588\u2588\u2551    \u2588\u2588\u2551      \u2588\u2588\u2551   \u2588\u2588\u2554\u2550\u2550\u255d  \u2588\u2588\u2551        \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551  ", "#48dbfb"],
  ["  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d \u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d    \u2588\u2588\u2551      \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2557\u2588\u2588\u2551  ", "#54a0ff"],
  ["  \u255a\u2550\u2550\u2550\u2550\u2550\u255d   \u255a\u2550\u2550\u2550\u2550\u2550\u255d     \u255a\u2550\u255d      \u255a\u2550\u255d   \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u255d", "#5f27cd"],
  ["   \u2591\u2592\u2593\u2588  \u2591\u2592\u2593\u2588  \u2591\u2592\u2593\u2588  \u2591\u2592\u2593\u2588  \u2591\u2592\u2593\u2588  \u2591\u2592\u2593\u2588  \u2591\u2592\u2593\u2588  \u2591\u2592\u2593\u2588  \u2591\u2592\u2593\u2588  \u2591\u2592\u2593\u2588  \u2591\u2592\u2593\u2588", "#ff9ff3"],
];

export function Home() {
  const { state, dispatch, navigate } = useStore();
  const { exit } = useApp();
  const selectedIndex = state.home.selectedIndex;

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of storeData.agents) map.set(a.id, a);
    return map;
  }, []);

  const featuredAgents = storeData.featured
    .map((id) => agentMap.get(id))
    .filter(Boolean) as Agent[];

  const trendingAgents = storeData.trending
    .map((id) => agentMap.get(id))
    .filter(Boolean) as Agent[];

  const categories = storeData.categories;

  // Build ALL rows as flat list — logo, status, menu, content, footer
  const { allRows, navigableIndices } = useMemo(() => {
    const allRows: React.ReactNode[] = [];
    const navigableIndices: number[] = [];

    // Empty padding (2 rows)
    allRows.push(<Text key="pad-0"> </Text>);
    allRows.push(<Text key="pad-1"> </Text>);

    // Logo ASCII art lines (7 rows)
    LOGO_LINES.forEach(([line, color], idx) => {
      allRows.push(<Text key={`logo-${idx}`} color={color}>{line}</Text>);
    });

    // Tagline
    allRows.push(
      <Text key="tagline" bold color="#48dbfb">
        {"  The Bot CLI Internet Portal"}
      </Text>
    );

    // Subtitle
    allRows.push(
      <Text key="subtitle" dimColor>
        {"  Discover, install, and run CLI apps \u2014 built for bots."}
      </Text>
    );

    // Status bar (single row, no border — just inline text)
    allRows.push(
      <Box key="statusbar">
        <Text bold color="#ff6b9d">{"  bottel.ai"}</Text>
        <Text dimColor>{"  \u2502  3 installed"}</Text>
      </Box>
    );

    // Separator
    allRows.push(
      <Box key="sep-0"><Text dimColor>{"\u2500".repeat(50)}</Text></Box>
    );

    // Navigation section title
    allRows.push(
      <Box key="title-nav"><Text bold color={colors.secondary}>{"Navigation"}</Text></Box>
    );

    // Menu items (navigable)
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      navigableIndices.push(allRows.length);
      allRows.push(null); // placeholder — rendered dynamically
    }

    // Separator
    allRows.push(
      <Box key="sep-1"><Text dimColor>{"\u2500".repeat(50)}</Text></Box>
    );

    // Featured section
    allRows.push(
      <Box key="title-featured"><Text bold color={colors.secondary}>{"Featured"}</Text></Box>
    );
    for (let i = 0; i < featuredAgents.length; i++) {
      navigableIndices.push(allRows.length);
      allRows.push(null); // placeholder
    }

    // Separator
    allRows.push(
      <Box key="sep-2"><Text dimColor>{"\u2500".repeat(50)}</Text></Box>
    );

    // Trending section
    allRows.push(
      <Box key="title-trending"><Text bold color={colors.secondary}>{"Trending"}</Text></Box>
    );
    for (let i = 0; i < trendingAgents.length; i++) {
      navigableIndices.push(allRows.length);
      allRows.push(null); // placeholder
    }

    // Separator
    allRows.push(
      <Box key="sep-3"><Text dimColor>{"\u2500".repeat(50)}</Text></Box>
    );

    // Categories section
    allRows.push(
      <Box key="title-categories"><Text bold color={colors.secondary}>{"Categories"}</Text></Box>
    );
    for (let i = 0; i < categories.length; i++) {
      navigableIndices.push(allRows.length);
      allRows.push(null); // placeholder
    }

    // Help footer
    allRows.push(
      <Box key="help-footer">
        <Text dimColor>{"\u2191\u2193 scroll \u00b7 Enter select \u00b7 / search \u00b7 q quit"}</Text>
      </Box>
    );

    return { allRows, navigableIndices };
  }, [featuredAgents, trendingAgents, categories]);

  const focusedRowIndex = navigableIndices[selectedIndex] ?? 0;

  // Now fill in the dynamic (navigable) rows based on current focus
  const renderedRows = useMemo(() => {
    const result = [...allRows];
    let navIdx = 0;

    // Menu items
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      const rowIdx = navigableIndices[navIdx]!;
      const isActive = rowIdx === focusedRowIndex;
      const item = MENU_ITEMS[i]!;
      result[rowIdx] = (
        <Box key={`menu-${item.value}`}>
          <Cursor active={isActive} />
          <Box width={18}>
            <Text color={isActive ? colors.primary : undefined} bold={isActive}>{item.label}</Text>
          </Box>
          <Text dimColor={!isActive} color={isActive ? colors.primary : undefined}>{item.description}</Text>
        </Box>
      );
      navIdx++;
    }

    // Featured
    for (let i = 0; i < featuredAgents.length; i++) {
      const rowIdx = navigableIndices[navIdx]!;
      const isActive = rowIdx === focusedRowIndex;
      const agent = featuredAgents[i]!;
      result[rowIdx] = (
        <Box key={`featured-${agent.id}`}>
          <Cursor active={isActive} />
          <Box width={columns.name}>
            <Text color={isActive ? colors.primary : undefined} bold={isActive}>{agent.name}</Text>
          </Box>
          <Rating value={agent.rating} />
          <InstallCount count={agent.installs} />
          <VerifiedBadge verified={agent.verified} />
        </Box>
      );
      navIdx++;
    }

    // Trending
    for (let i = 0; i < trendingAgents.length; i++) {
      const rowIdx = navigableIndices[navIdx]!;
      const isActive = rowIdx === focusedRowIndex;
      const agent = trendingAgents[i]!;
      result[rowIdx] = (
        <Box key={`trending-${agent.id}`}>
          <Cursor active={isActive} />
          <Box width={columns.rank}><Text dimColor>{i + 1}.</Text></Box>
          <Box width={columns.name}>
            <Text color={isActive ? colors.primary : undefined} bold={isActive}>{agent.name}</Text>
          </Box>
          <Rating value={agent.rating} />
          <InstallCount count={agent.installs} />
          <VerifiedBadge verified={agent.verified} />
        </Box>
      );
      navIdx++;
    }

    // Categories
    for (let i = 0; i < categories.length; i++) {
      const rowIdx = navigableIndices[navIdx]!;
      const isActive = rowIdx === focusedRowIndex;
      const cat = categories[i]!;
      result[rowIdx] = (
        <Box key={`category-${cat.name}`}>
          <Cursor active={isActive} />
          <Text color={isActive ? colors.primary : undefined} bold={isActive}>{cat.icon} {cat.name}</Text>
          <Text dimColor> ({cat.agents.length})</Text>
        </Box>
      );
      navIdx++;
    }

    return result;
  }, [allRows, navigableIndices, focusedRowIndex, featuredAgents, trendingAgents, categories]);

  useInput((input, key) => {
    if (input === "q") { exit(); return; }
    if (input === "/") { navigate({ name: "search" }); return; }

    if (key.return) {
      const navIdx = selectedIndex;
      const rowIdx = navigableIndices[navIdx];
      if (rowIdx === undefined) return;

      // Figure out which section this navigable index belongs to
      const menuEnd = MENU_ITEMS.length;
      const featuredEnd = menuEnd + featuredAgents.length;
      const trendingEnd = featuredEnd + trendingAgents.length;

      if (navIdx < menuEnd) {
        const item = MENU_ITEMS[navIdx]!;
        switch (item.value) {
          case "home": break;
          case "browse": navigate({ name: "browse" }); break;
          case "search": navigate({ name: "search" }); break;
          case "installed": navigate({ name: "installed" }); break;
          case "settings": navigate({ name: "settings" }); break;
          case "exit": exit(); break;
        }
      } else if (navIdx < featuredEnd) {
        const agent = featuredAgents[navIdx - menuEnd]!;
        navigate({ name: "agent-detail", agentId: agent.id });
      } else if (navIdx < trendingEnd) {
        const agent = trendingAgents[navIdx - featuredEnd]!;
        navigate({ name: "agent-detail", agentId: agent.id });
      } else {
        navigate({ name: "browse" });
      }
      return;
    }

    if (key.upArrow) {
      dispatch({ type: "UPDATE_HOME", state: { selectedIndex: Math.max(0, selectedIndex - 1) } });
    }
    if (key.downArrow) {
      dispatch({ type: "UPDATE_HOME", state: { selectedIndex: Math.min(navigableIndices.length - 1, selectedIndex + 1) } });
    }
  });

  return (
    <Viewport rows={renderedRows} focusedIndex={focusedRowIndex} reservedLines={0} />
  );
}
