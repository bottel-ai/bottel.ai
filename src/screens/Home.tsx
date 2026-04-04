import React, { useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";
import { colors, columns, formatStars, formatInstalls, Cursor, Rating, InstallCount, VerifiedBadge, HelpFooter } from "../cli_app_theme.js";

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

  // Track active section + index within section separately
  // selectedIndex encodes: section (0-3) in high bits, item index in low bits
  // Actually simpler: just track section + itemIndex
  const sectionSizes: Record<Section, number> = {
    menu: MENU_ITEMS.length,
    featured: featuredAgents.length,
    trending: trendingAgents.length,
    categories: categories.length,
  };

  // Decode selectedIndex into section + itemIndex
  const decoded = useMemo(() => {
    let remaining = selectedIndex;
    for (const sec of SECTIONS) {
      const size = sectionSizes[sec];
      if (remaining < size) {
        return { section: sec, itemIndex: remaining };
      }
      remaining -= size;
    }
    return { section: "menu" as Section, itemIndex: 0 };
  }, [selectedIndex, sectionSizes]);

  const { section: activeSection, itemIndex: activeItemIndex } = decoded;

  const totalItems = SECTIONS.reduce((sum, s) => sum + sectionSizes[s], 0);

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }
    if (input === "/") {
      navigate({ name: "search" });
      return;
    }

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

  // Section header — clickable title, shows expanded/collapsed
  const sectionHeader = (sec: Section, label: string, isActive: boolean) => (
    <Box key={`header-${sec}`}>
      <Text bold color={isActive ? colors.primary : undefined}>
        {isActive ? "▼ " : "▶ "}{label}
      </Text>
      {!isActive && (
        <Text dimColor> ({sectionSizes[sec]} items)</Text>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Menu — always show if active, collapse to title if not */}
      {sectionHeader("menu", "Navigation", activeSection === "menu")}
      {activeSection === "menu" && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          {MENU_ITEMS.map((item, i) => {
            const isActive = i === activeItemIndex;
            return (
              <Box key={`menu-${item.value}`}>
                <Cursor active={isActive} />
                <Box width={18}>
                  <Text color={isActive ? colors.primary : undefined} bold={isActive}>
                    {item.label}
                  </Text>
                </Box>
                <Text dimColor={!isActive} color={isActive ? colors.primary : undefined}>
                  {item.description}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Featured — show cards if active, collapse if not */}
      {sectionHeader("featured", "Featured", activeSection === "featured")}
      {activeSection === "featured" && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          {featuredAgents.map((agent, i) => {
            const isActive = i === activeItemIndex;
            return (
              <Box key={`featured-${agent.id}`}>
                <Cursor active={isActive} />
                <Box width={columns.name}>
                  <Text color={isActive ? colors.primary : undefined} bold={isActive}>
                    {agent.name}
                  </Text>
                </Box>
                <Rating value={agent.rating} />
                <InstallCount count={agent.installs} />
                <VerifiedBadge verified={agent.verified} />
              </Box>
            );
          })}
        </Box>
      )}

      {/* Trending — show list if active, collapse if not */}
      {sectionHeader("trending", "Trending", activeSection === "trending")}
      {activeSection === "trending" && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          {trendingAgents.map((agent, i) => {
            const isActive = i === activeItemIndex;
            return (
              <Box key={`trending-${agent.id}`}>
                <Cursor active={isActive} />
                <Box width={columns.rank}><Text dimColor>{i + 1}.</Text></Box>
                <Box width={columns.name}>
                  <Text color={isActive ? colors.primary : undefined} bold={isActive}>
                    {agent.name}
                  </Text>
                </Box>
                <Rating value={agent.rating} />
                <InstallCount count={agent.installs} />
                <VerifiedBadge verified={agent.verified} />
              </Box>
            );
          })}
        </Box>
      )}

      {/* Categories — show list if active, collapse if not */}
      {sectionHeader("categories", "Categories", activeSection === "categories")}
      {activeSection === "categories" && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          {categories.map((cat, i) => {
            const isActive = i === activeItemIndex;
            return (
              <Box key={`category-${cat.name}`}>
                <Cursor active={isActive} />
                <Text color={isActive ? colors.primary : undefined} bold={isActive}>
                  {cat.icon} {cat.name}
                </Text>
                <Text dimColor> ({cat.agents.length})</Text>
              </Box>
            );
          })}
        </Box>
      )}

      <HelpFooter text="↑↓ nav · Enter select · / search · q quit" />
    </Box>
  );
}
