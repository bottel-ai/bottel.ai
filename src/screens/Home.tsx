import React, { useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";
import { colors, columns, formatInstalls, Cursor, Rating, InstallCount, VerifiedBadge, HelpFooter, Accordion, accordionTotalItems } from "../cli_app_theme.js";
import type { AccordionSection } from "../cli_app_theme.js";

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

  const sections: AccordionSection[] = useMemo(() => [
    {
      key: "menu",
      title: "Navigation",
      itemCount: MENU_ITEMS.length,
      render: (activeIndex: number) => (
        <>
          {MENU_ITEMS.map((item, i) => (
            <Box key={`menu-${item.value}`}>
              <Cursor active={i === activeIndex} />
              <Box width={18}>
                <Text color={i === activeIndex ? colors.primary : undefined} bold={i === activeIndex}>
                  {item.label}
                </Text>
              </Box>
              <Text dimColor={i !== activeIndex} color={i === activeIndex ? colors.primary : undefined}>
                {item.description}
              </Text>
            </Box>
          ))}
        </>
      ),
    },
    {
      key: "featured",
      title: "Featured",
      itemCount: featuredAgents.length,
      render: (activeIndex: number) => (
        <>
          {featuredAgents.map((agent, i) => (
            <Box key={`featured-${agent.id}`}>
              <Cursor active={i === activeIndex} />
              <Box width={columns.name}>
                <Text color={i === activeIndex ? colors.primary : undefined} bold={i === activeIndex}>
                  {agent.name}
                </Text>
              </Box>
              <Rating value={agent.rating} />
              <InstallCount count={agent.installs} />
              <VerifiedBadge verified={agent.verified} />
            </Box>
          ))}
        </>
      ),
    },
    {
      key: "trending",
      title: "Trending",
      itemCount: trendingAgents.length,
      render: (activeIndex: number) => (
        <>
          {trendingAgents.map((agent, i) => (
            <Box key={`trending-${agent.id}`}>
              <Cursor active={i === activeIndex} />
              <Box width={columns.rank}><Text dimColor>{i + 1}.</Text></Box>
              <Box width={columns.name}>
                <Text color={i === activeIndex ? colors.primary : undefined} bold={i === activeIndex}>
                  {agent.name}
                </Text>
              </Box>
              <Rating value={agent.rating} />
              <InstallCount count={agent.installs} />
              <VerifiedBadge verified={agent.verified} />
            </Box>
          ))}
        </>
      ),
    },
    {
      key: "categories",
      title: "Categories",
      itemCount: categories.length,
      render: (activeIndex: number) => (
        <>
          {categories.map((cat, i) => (
            <Box key={`category-${cat.name}`}>
              <Cursor active={i === activeIndex} />
              <Text color={i === activeIndex ? colors.primary : undefined} bold={i === activeIndex}>
                {cat.icon} {cat.name}
              </Text>
              <Text dimColor> ({cat.agents.length})</Text>
            </Box>
          ))}
        </>
      ),
    },
  ], [featuredAgents, trendingAgents, categories]);

  const totalItems = accordionTotalItems(sections);

  // Decode selected index to find which section is active for Enter handling
  const decoded = useMemo(() => {
    let remaining = selectedIndex;
    for (let i = 0; i < sections.length; i++) {
      if (remaining < sections[i]!.itemCount) {
        return { sectionIndex: i, itemIndex: remaining };
      }
      remaining -= sections[i]!.itemCount;
    }
    return { sectionIndex: 0, itemIndex: 0 };
  }, [selectedIndex, sections]);

  useInput((input, key) => {
    if (input === "q") { exit(); return; }
    if (input === "/") { navigate({ name: "search" }); return; }

    if (key.return) {
      const { sectionIndex, itemIndex } = decoded;
      const sec = sections[sectionIndex]!;
      if (sec.key === "menu") {
        const item = MENU_ITEMS[itemIndex]!;
        switch (item.value) {
          case "home": break;
          case "browse": navigate({ name: "browse" }); break;
          case "search": navigate({ name: "search" }); break;
          case "installed": navigate({ name: "installed" }); break;
          case "settings": navigate({ name: "settings" }); break;
          case "exit": exit(); break;
        }
      } else if (sec.key === "featured") {
        const agent = featuredAgents[itemIndex];
        if (agent) navigate({ name: "agent-detail", agentId: agent.id });
      } else if (sec.key === "trending") {
        const agent = trendingAgents[itemIndex];
        if (agent) navigate({ name: "agent-detail", agentId: agent.id });
      } else if (sec.key === "categories") {
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

  return (
    <Box flexDirection="column" paddingX={1}>
      <Accordion sections={sections} selectedIndex={selectedIndex} />
      <HelpFooter text="↑↓ nav · Enter select · / search · q quit" />
    </Box>
  );
}
