import React, { useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";
import { colors, columns, formatInstalls, Cursor, Rating, InstallCount, VerifiedBadge, HelpFooter, ScrollList } from "../cli_app_theme.js";

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

// Each row in the flat scrollable list
type RowType =
  | { kind: "section-title"; title: string }
  | { kind: "separator" }
  | { kind: "menu"; index: number }
  | { kind: "featured"; index: number; agent: Agent }
  | { kind: "trending"; index: number; agent: Agent }
  | { kind: "category"; index: number; name: string; icon: string; count: number };

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

  // Build flat list of all rows (some navigable, some decorative)
  const { rows, navigableIndices } = useMemo(() => {
    const rows: RowType[] = [];
    const navigableIndices: number[] = [];

    // Menu section
    rows.push({ kind: "section-title", title: "Navigation" });
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      navigableIndices.push(rows.length);
      rows.push({ kind: "menu", index: i });
    }

    rows.push({ kind: "separator" });

    // Featured
    rows.push({ kind: "section-title", title: "Featured" });
    for (let i = 0; i < featuredAgents.length; i++) {
      navigableIndices.push(rows.length);
      rows.push({ kind: "featured", index: i, agent: featuredAgents[i]! });
    }

    rows.push({ kind: "separator" });

    // Trending
    rows.push({ kind: "section-title", title: "Trending" });
    for (let i = 0; i < trendingAgents.length; i++) {
      navigableIndices.push(rows.length);
      rows.push({ kind: "trending", index: i, agent: trendingAgents[i]! });
    }

    rows.push({ kind: "separator" });

    // Categories
    rows.push({ kind: "section-title", title: "Categories" });
    for (let i = 0; i < categories.length; i++) {
      navigableIndices.push(rows.length);
      rows.push({ kind: "category", index: i, name: categories[i]!.name, icon: categories[i]!.icon, count: categories[i]!.agents.length });
    }

    return { rows, navigableIndices };
  }, [featuredAgents, trendingAgents, categories]);

  const focusedRowIndex = navigableIndices[selectedIndex] ?? 0;

  useInput((input, key) => {
    if (input === "q") { exit(); return; }
    if (input === "/") { navigate({ name: "search" }); return; }

    if (key.return) {
      const row = rows[focusedRowIndex];
      if (!row) return;
      if (row.kind === "menu") {
        const item = MENU_ITEMS[row.index]!;
        switch (item.value) {
          case "home": break;
          case "browse": navigate({ name: "browse" }); break;
          case "search": navigate({ name: "search" }); break;
          case "installed": navigate({ name: "installed" }); break;
          case "settings": navigate({ name: "settings" }); break;
          case "exit": exit(); break;
        }
      } else if (row.kind === "featured") {
        navigate({ name: "agent-detail", agentId: row.agent.id });
      } else if (row.kind === "trending") {
        navigate({ name: "agent-detail", agentId: row.agent.id });
      } else if (row.kind === "category") {
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

  // Render each row
  const renderedItems = rows.map((row, i) => {
    const isActive = i === focusedRowIndex;

    if (row.kind === "section-title") {
      return (
        <Box key={`title-${row.title}`} marginTop={i > 0 ? 0 : 0}>
          <Text bold color={colors.secondary}>{row.title}</Text>
        </Box>
      );
    }

    if (row.kind === "separator") {
      return (
        <Box key={`sep-${i}`}>
          <Text dimColor>{"\u2500".repeat(50)}</Text>
        </Box>
      );
    }

    if (row.kind === "menu") {
      const item = MENU_ITEMS[row.index]!;
      return (
        <Box key={`menu-${item.value}`}>
          <Cursor active={isActive} />
          <Box width={18}>
            <Text color={isActive ? colors.primary : undefined} bold={isActive}>{item.label}</Text>
          </Box>
          <Text dimColor={!isActive} color={isActive ? colors.primary : undefined}>{item.description}</Text>
        </Box>
      );
    }

    if (row.kind === "featured") {
      return (
        <Box key={`featured-${row.agent.id}`}>
          <Cursor active={isActive} />
          <Box width={columns.name}>
            <Text color={isActive ? colors.primary : undefined} bold={isActive}>{row.agent.name}</Text>
          </Box>
          <Rating value={row.agent.rating} />
          <InstallCount count={row.agent.installs} />
          <VerifiedBadge verified={row.agent.verified} />
        </Box>
      );
    }

    if (row.kind === "trending") {
      return (
        <Box key={`trending-${row.agent.id}`}>
          <Cursor active={isActive} />
          <Box width={columns.rank}><Text dimColor>{row.index + 1}.</Text></Box>
          <Box width={columns.name}>
            <Text color={isActive ? colors.primary : undefined} bold={isActive}>{row.agent.name}</Text>
          </Box>
          <Rating value={row.agent.rating} />
          <InstallCount count={row.agent.installs} />
          <VerifiedBadge verified={row.agent.verified} />
        </Box>
      );
    }

    if (row.kind === "category") {
      return (
        <Box key={`category-${row.name}`}>
          <Cursor active={isActive} />
          <Text color={isActive ? colors.primary : undefined} bold={isActive}>{row.icon} {row.name}</Text>
          <Text dimColor> ({row.count})</Text>
        </Box>
      );
    }

    return null;
  });

  return (
    <ScrollList
      items={renderedItems}
      focusedIndex={focusedRowIndex}
      reservedLines={3}
      footer={<HelpFooter text="↑↓ scroll · Enter select · / search · q quit" />}
    />
  );
}
