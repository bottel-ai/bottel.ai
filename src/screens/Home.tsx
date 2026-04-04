import React, { useMemo, useState, useEffect } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";
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

type Section = "menu" | "featured" | "trending" | "categories";
const SECTIONS: Section[] = ["menu", "featured", "trending", "categories"];
const SECTION_TITLES: Record<Section, string> = {
  menu: "Navigation",
  featured: "Featured",
  trending: "Trending",
  categories: "Categories",
};

export function Home() {
  const { state, dispatch, navigate } = useStore();
  const { exit } = useApp();
  const { stdout } = useStdout();
  const selectedIndex = state.home.selectedIndex;

  const [termHeight, setTermHeight] = useState(stdout?.rows ?? 24);
  useEffect(() => {
    if (!stdout) return;
    const onResize = () => setTermHeight(stdout.rows);
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

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

  const sectionSizes: Record<Section, number> = {
    menu: MENU_ITEMS.length,
    featured: featuredAgents.length,
    trending: trendingAgents.length,
    categories: categories.length,
  };

  // Decode flat index into section + item
  const decoded = useMemo(() => {
    let remaining = selectedIndex;
    for (const sec of SECTIONS) {
      if (remaining < sectionSizes[sec]) return { section: sec, itemIndex: remaining };
      remaining -= sectionSizes[sec];
    }
    return { section: "menu" as Section, itemIndex: 0 };
  }, [selectedIndex, sectionSizes]);

  const { section: activeSection, itemIndex: activeItemIndex } = decoded;
  const totalItems = SECTIONS.reduce((sum, s) => sum + sectionSizes[s], 0);

  useInput((input, key) => {
    if (input === "q") { exit(); return; }
    if (input === "/") { navigate({ name: "search" }); return; }
    if (key.return) {
      if (activeSection === "menu") {
        const item = MENU_ITEMS[activeItemIndex]!;
        switch (item.value) {
          case "home": break;
          case "browse": navigate({ name: "browse" }); break;
          case "search": navigate({ name: "search" }); break;
          case "installed": navigate({ name: "installed" }); break;
          case "settings": navigate({ name: "settings" }); break;
          case "exit": exit(); break;
        }
      } else if (activeSection === "featured") {
        const agent = featuredAgents[activeItemIndex];
        if (agent) navigate({ name: "agent-detail", agentId: agent.id });
      } else if (activeSection === "trending") {
        const agent = trendingAgents[activeItemIndex];
        if (agent) navigate({ name: "agent-detail", agentId: agent.id });
      } else if (activeSection === "categories") {
        navigate({ name: "browse" });
      }
      return;
    }
    if (key.upArrow) {
      dispatch({ type: "UPDATE_HOME", state: { selectedIndex: Math.max(0, selectedIndex - 1) } });
    }
    if (key.downArrow) {
      dispatch({ type: "UPDATE_HOME", state: { selectedIndex: Math.min(totalItems - 1, selectedIndex + 1) } });
    }
  });

  // Calculate how many lines the active section's content takes
  const activeSize = sectionSizes[activeSection];
  // Header: 2 lines (brand + blank). Each section header: 1 line. Footer: 1 line.
  // Overhead = 2 (header) + 4 (section headers) + 1 (footer) = 7
  // Active section content = activeSize lines
  // Total = 7 + activeSize
  // If still too tall, we need to paginate the active section
  const overhead = 7;
  const maxContentLines = termHeight - overhead;
  const needsPagination = activeSize > maxContentLines;
  const pageSize = needsPagination ? maxContentLines : activeSize;
  const activePage = needsPagination ? Math.floor(activeItemIndex / pageSize) : 0;
  const pageStart = activePage * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, activeSize);

  // Render a section's items
  function renderItems(sec: Section, start: number, end: number) {
    const items: React.ReactNode[] = [];

    if (sec === "menu") {
      for (let i = start; i < end; i++) {
        const item = MENU_ITEMS[i]!;
        const isActive = sec === activeSection && i === activeItemIndex;
        items.push(
          <Box key={`menu-${item.value}`}>
            <Cursor active={isActive} />
            <Box width={18}><Text color={isActive ? colors.primary : undefined} bold={isActive}>{item.label}</Text></Box>
            <Text dimColor={!isActive} color={isActive ? colors.primary : undefined}>{item.description}</Text>
          </Box>
        );
      }
    } else if (sec === "featured") {
      for (let i = start; i < end; i++) {
        const agent = featuredAgents[i]!;
        const isActive = sec === activeSection && i === activeItemIndex;
        items.push(
          <Box key={`featured-${agent.id}`}>
            <Cursor active={isActive} />
            <Box width={columns.name}><Text color={isActive ? colors.primary : undefined} bold={isActive}>{agent.name}</Text></Box>
            <Rating value={agent.rating} />
            <InstallCount count={agent.installs} />
            <VerifiedBadge verified={agent.verified} />
          </Box>
        );
      }
    } else if (sec === "trending") {
      for (let i = start; i < end; i++) {
        const agent = trendingAgents[i]!;
        const isActive = sec === activeSection && i === activeItemIndex;
        items.push(
          <Box key={`trending-${agent.id}`}>
            <Cursor active={isActive} />
            <Box width={columns.rank}><Text dimColor>{i + 1}.</Text></Box>
            <Box width={columns.name}><Text color={isActive ? colors.primary : undefined} bold={isActive}>{agent.name}</Text></Box>
            <Rating value={agent.rating} />
            <InstallCount count={agent.installs} />
            <VerifiedBadge verified={agent.verified} />
          </Box>
        );
      }
    } else if (sec === "categories") {
      for (let i = start; i < end; i++) {
        const cat = categories[i]!;
        const isActive = sec === activeSection && i === activeItemIndex;
        items.push(
          <Box key={`category-${cat.name}`}>
            <Cursor active={isActive} />
            <Text color={isActive ? colors.primary : undefined} bold={isActive}>{cat.icon} {cat.name}</Text>
            <Text dimColor> ({cat.agents.length})</Text>
          </Box>
        );
      }
    }

    return items;
  }

  const totalPages = needsPagination ? Math.ceil(activeSize / pageSize) : 1;

  return (
    <Box flexDirection="column" paddingX={1} height={termHeight}>
      {/* Header */}
      <Box>
        <Text bold color="#ff9ff3">bottel.ai</Text>
        <Text dimColor> — </Text>
        <Text bold color={colors.primary}>The Bot CLI Internet Portal</Text>
        <Text dimColor>  |  {storeData.agents.length} apps</Text>
      </Box>
      <Text>{""}</Text>

      {/* Sections */}
      {SECTIONS.map((sec) => {
        const isActive = sec === activeSection;
        return (
          <Box key={`section-${sec}`} flexDirection="column">
            <Box>
              <Text bold color={isActive ? colors.primary : undefined}>
                {isActive ? "\u25BC " : "\u25B6 "}{SECTION_TITLES[sec]}
              </Text>
              {!isActive && <Text dimColor> ({sectionSizes[sec]})</Text>}
              {isActive && needsPagination && <Text dimColor> [{activePage + 1}/{totalPages}]</Text>}
            </Box>
            {isActive && (
              <Box flexDirection="column" paddingLeft={2}>
                {renderItems(sec, pageStart, pageEnd)}
              </Box>
            )}
          </Box>
        );
      })}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>↑↓ nav · Enter select · / search · q quit</Text>
      </Box>
    </Box>
  );
}
