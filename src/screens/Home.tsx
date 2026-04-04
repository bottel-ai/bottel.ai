import React, { useMemo } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";
import { colors, columns, formatStars, formatInstalls, Cursor, Rating, InstallCount, VerifiedBadge, Separator, HelpFooter } from "../cli_app_theme.js";
import { CompactLogo } from "../components/Logo.js";

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

// Each navigable item in the flat list
type NavItem =
  | { section: "menu"; index: number }
  | { section: "featured"; index: number }
  | { section: "trending"; index: number }
  | { section: "categories"; index: number };

export function Home() {
  const { state, dispatch, navigate } = useStore();
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 40;
  const compact = termRows < 45;

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

  // Build flat navigable list
  const navItems = useMemo((): NavItem[] => {
    const items: NavItem[] = [];
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      items.push({ section: "menu", index: i });
    }
    for (let i = 0; i < featuredAgents.length; i++) {
      items.push({ section: "featured", index: i });
    }
    for (let i = 0; i < trendingAgents.length; i++) {
      items.push({ section: "trending", index: i });
    }
    for (let i = 0; i < categories.length; i++) {
      items.push({ section: "categories", index: i });
    }
    return items;
  }, [featuredAgents.length, trendingAgents.length, categories.length]);

  const current = navItems[selectedIndex];
  const activeSection = current?.section ?? "menu";
  const activeIndexInSection = current?.index ?? 0;

  const totalAgents = storeData.agents.length;

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }
    if (input === "/") {
      navigate({ name: "search" });
      return;
    }

    // Enter
    if (key.return) {
      if (!current) return;
      if (current.section === "menu") {
        const item = MENU_ITEMS[current.index]!;
        switch (item.value) {
          case "home": break;
          case "browse": navigate({ name: "browse" }); break;
          case "search": navigate({ name: "search" }); break;
          case "installed": navigate({ name: "installed" }); break;
          case "settings": navigate({ name: "settings" }); break;
          case "exit": exit(); break;
        }
      } else if (current.section === "featured") {
        const agent = featuredAgents[current.index];
        if (agent) navigate({ name: "agent-detail", agentId: agent.id });
      } else if (current.section === "trending") {
        const agent = trendingAgents[current.index];
        if (agent) navigate({ name: "agent-detail", agentId: agent.id });
      } else if (current.section === "categories") {
        const cat = categories[current.index];
        if (cat) navigate({ name: "browse" });
      }
      return;
    }

    // Up
    if (key.upArrow) {
      dispatch({ type: "UPDATE_HOME", state: { selectedIndex: Math.max(0, selectedIndex - 1) } });
    }

    // Down
    if (key.downArrow) {
      dispatch({ type: "UPDATE_HOME", state: { selectedIndex: Math.min(navItems.length - 1, selectedIndex + 1) } });
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Compact logo header when terminal is small */}
      {compact && (
        <Box marginBottom={1} flexDirection="column">
          <CompactLogo />
        </Box>
      )}

      {/* Header */}
      <Box marginBottom={compact ? 0 : 1}>
        <Text dimColor>{totalAgents} apps available</Text>
      </Box>

      {/* Menu */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={activeSection === "menu" ? colors.primary : undefined}>
          {activeSection === "menu" ? "▶ " : "  "}Menu
        </Text>
        <Box flexDirection="column" marginTop={1} paddingLeft={1}>
          {MENU_ITEMS.map((item, i) => {
            const isActive = activeSection === "menu" && i === activeIndexInSection;
            return (
              <Box key={`menu-${item.value}`}>
                <Text color={isActive ? colors.primary : undefined} bold={isActive}>
                  {isActive ? "> " : "  "}
                </Text>
                <Box width={18}>
                  <Text color={isActive ? colors.primary : undefined} bold={isActive}>
                    {item.label}
                  </Text>
                </Box>
                <Text dimColor={!isActive} color={isActive ? colors.primary : undefined}>{item.description}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Separator */}
      <Separator />

      {/* Featured Agents */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={activeSection === "featured" ? colors.primary : undefined}>
          {activeSection === "featured" ? "▶ " : "  "}Featured Agents
        </Text>
        {compact ? (
          <Box flexDirection="column" marginTop={1}>
            {featuredAgents.map((agent, i) => {
              const isActive = activeSection === "featured" && i === activeIndexInSection;
              return (
                <Box key={`featured-${agent.id}`}>
                  <Cursor active={isActive} />
                  <Box width={columns.name}><Text color={isActive ? colors.primary : undefined} bold={isActive}>{agent.name}</Text></Box>
                  <Rating value={agent.rating} />
                  <InstallCount count={agent.installs} />
                  <VerifiedBadge verified={agent.verified} />
                </Box>
              );
            })}
          </Box>
        ) : (
          <Box gap={1} marginTop={1}>
            {featuredAgents.map((agent, i) => {
              const isActive = activeSection === "featured" && i === activeIndexInSection;
              return (
                <Box
                  key={`featured-${agent.id}`}
                  flexDirection="column"
                  borderStyle="round"
                  borderColor={isActive ? colors.primary : undefined}
                  width={24}
                  paddingX={1}
                >
                  <Text bold color={isActive ? colors.primary : undefined}>
                    {agent.name}
                  </Text>
                  <Text color={colors.warning}>
                    {formatStars(agent.rating)} {agent.rating.toFixed(1)}
                  </Text>
                  <Text dimColor>by {agent.author}</Text>
                  <Text dimColor>{formatInstalls(agent.installs)} installs</Text>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Separator */}
      <Separator />

      {/* Trending */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={activeSection === "trending" ? colors.primary : undefined}>
          {activeSection === "trending" ? "▶ " : "  "}Trending
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {trendingAgents.map((agent, i) => {
            const isActive = activeSection === "trending" && i === activeIndexInSection;
            return (
              <Box key={`trending-${agent.id}`}>
                <Cursor active={isActive} />
                <Box width={columns.rank}><Text dimColor>{i + 1}.</Text></Box>
                <Box width={columns.name}><Text color={isActive ? colors.primary : undefined} bold={isActive}>{agent.name}</Text></Box>
                <Rating value={agent.rating} />
                <InstallCount count={agent.installs} />
                <VerifiedBadge verified={agent.verified} />
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Separator */}
      <Separator />

      {/* Categories - vertical list */}
      <Box flexDirection="column">
        <Text bold color={activeSection === "categories" ? colors.primary : undefined}>
          {activeSection === "categories" ? "▶ " : "  "}Categories
        </Text>
        <Box flexDirection="column" marginTop={1} paddingLeft={1}>
          {categories.map((cat, i) => {
            const isActive = activeSection === "categories" && i === activeIndexInSection;
            return (
              <Box key={`category-${cat.name}`}>
                <Text color={isActive ? colors.primary : undefined} bold={isActive}>
                  {isActive ? "\u276F " : "  "}
                </Text>
                <Text color={isActive ? colors.primary : undefined} bold={isActive}>
                  {cat.icon} {cat.name}
                </Text>
                <Text dimColor={!isActive} color={isActive ? colors.primary : undefined}>
                  {" "}({cat.agents.length})
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Help */}
      <HelpFooter text="Esc back · ↑↓ nav · Enter select · / search · q quit" />
    </Box>
  );
}
