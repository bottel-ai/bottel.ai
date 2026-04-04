import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";

interface StoreData {
  featured: string[];
  trending: string[];
  categories: { name: string; icon: string; agents: string[] }[];
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
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

type Section = "menu" | "featured" | "trending" | "categories";

const MENU_ITEMS = [
  { label: "Home", value: "home", description: "Store front" },
  { label: "Browse", value: "browse", description: "Browse by category" },
  { label: "Search", value: "search", description: "Find apps" },
  { label: "Installed", value: "installed", description: "Your apps" },
  { label: "Settings", value: "settings", description: "Preferences" },
  { label: "Exit", value: "exit", description: "Quit bottel" },
];

interface HomeProps {
  onViewAgent: (id: string) => void;
  onViewCategory: (name: string) => void;
  onSearch: () => void;
  onBrowse: () => void;
  onInstalled: () => void;
  onSettings: () => void;
  onExit: () => void;
}

export function Home({
  onViewAgent,
  onViewCategory,
  onSearch,
  onBrowse,
  onInstalled,
  onSettings,
  onExit,
}: HomeProps) {
  const [section, setSection] = useState<Section>("menu");
  const [menuIndex, setMenuIndex] = useState(0);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [trendingIndex, setTrendingIndex] = useState(0);
  const [categoryIndex, setCategoryIndex] = useState(0);

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

  const sections: Section[] = ["menu", "featured", "trending", "categories"];

  useInput((input, key) => {
    if (input === "/") {
      onSearch();
      return;
    }

    // Tab to switch sections
    if (key.tab) {
      const idx = sections.indexOf(section);
      setSection(sections[(idx + 1) % sections.length]!);
      return;
    }

    // Enter
    if (key.return) {
      if (section === "menu") {
        const item = MENU_ITEMS[menuIndex]!;
        switch (item.value) {
          case "home": break;
          case "browse": onBrowse(); break;
          case "search": onSearch(); break;
          case "installed": onInstalled(); break;
          case "settings": onSettings(); break;
          case "exit": onExit(); break;
        }
      } else if (section === "featured") {
        const agent = featuredAgents[featuredIndex];
        if (agent) onViewAgent(agent.id);
      } else if (section === "trending") {
        const agent = trendingAgents[trendingIndex];
        if (agent) onViewAgent(agent.id);
      } else if (section === "categories") {
        const cat = categories[categoryIndex];
        if (cat) onViewCategory(cat.name);
      }
      return;
    }

    // Up / Left
    if (key.upArrow || key.leftArrow) {
      if (section === "menu") setMenuIndex((i) => Math.max(0, i - 1));
      else if (section === "featured") setFeaturedIndex((i) => Math.max(0, i - 1));
      else if (section === "trending") setTrendingIndex((i) => Math.max(0, i - 1));
      else if (section === "categories") setCategoryIndex((i) => Math.max(0, i - 1));
    }

    // Down / Right
    if (key.downArrow || key.rightArrow) {
      if (section === "menu") setMenuIndex((i) => Math.min(MENU_ITEMS.length - 1, i + 1));
      else if (section === "featured") setFeaturedIndex((i) => Math.min(featuredAgents.length - 1, i + 1));
      else if (section === "trending") setTrendingIndex((i) => Math.min(trendingAgents.length - 1, i + 1));
      else if (section === "categories") setCategoryIndex((i) => Math.min(categories.length - 1, i + 1));
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Menu */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={section === "menu" ? "#48dbfb" : undefined}>
          Menu
        </Text>
        <Box flexDirection="column" marginTop={1} paddingLeft={1}>
          {MENU_ITEMS.map((item, i) => {
            const isActive = section === "menu" && i === menuIndex;
            return (
              <Box key={item.value}>
                <Text color={isActive ? "#48dbfb" : undefined} bold={isActive}>
                  {isActive ? "> " : "  "}
                </Text>
                <Box width={18}>
                  <Text color={isActive ? "#48dbfb" : undefined} bold={isActive}>
                    {item.label}
                  </Text>
                </Box>
                {isActive && <Text dimColor>{item.description}</Text>}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Featured Agents */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={section === "featured" ? "#48dbfb" : undefined}>
          Featured Agents
        </Text>
        <Box gap={1} marginTop={1}>
          {featuredAgents.map((agent, i) => {
            const isActive = section === "featured" && i === featuredIndex;
            return (
              <Box
                key={agent.id}
                flexDirection="column"
                borderStyle="round"
                borderColor={isActive ? "#48dbfb" : undefined}
                width={24}
                paddingX={1}
              >
                <Text bold color={isActive ? "#48dbfb" : undefined}>
                  {agent.name}
                </Text>
                <Text color="#feca57">
                  {renderStars(agent.rating)} {agent.rating.toFixed(1)}
                </Text>
                <Text dimColor>by {agent.author}</Text>
                <Text dimColor>{formatInstalls(agent.installs)} installs</Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Trending */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={section === "trending" ? "#48dbfb" : undefined}>
          Trending
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {trendingAgents.map((agent, i) => {
            const isActive = section === "trending" && i === trendingIndex;
            return (
              <Box key={agent.id}>
                <Text color={isActive ? "#48dbfb" : undefined}>
                  {isActive ? "\u276f " : "  "}
                  {i + 1}. {agent.name}
                </Text>
                <Text>{"  "}</Text>
                <Text color="#feca57">{"\u2605"}{agent.rating.toFixed(1)}</Text>
                <Text dimColor>{"  "}{formatInstalls(agent.installs)} installs</Text>
                {agent.verified && <Text color="#2ed573"> \u2713</Text>}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Categories */}
      <Box flexDirection="column">
        <Text bold color={section === "categories" ? "#48dbfb" : undefined}>
          Categories
        </Text>
        <Box marginTop={1} gap={2} flexWrap="wrap">
          {categories.map((cat, i) => {
            const isActive = section === "categories" && i === categoryIndex;
            return (
              <Text
                key={cat.name}
                bold={isActive}
                color={isActive ? "#48dbfb" : undefined}
                underline={isActive}
              >
                {cat.name} ({cat.agents.length})
              </Text>
            );
          })}
        </Box>
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor>Tab: switch section | ↑↓: navigate | Enter: select | /: search</Text>
      </Box>
    </Box>
  );
}
