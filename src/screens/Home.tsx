import { useMemo, useState, useEffect } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { type App, getApps } from "../lib/api.js";
import { useStore } from "../cli_app_state.js";
import { colors, columns, formatStars, formatInstalls } from "../cli_app_theme.js";
import { Cursor, Rating, InstallCount, VerifiedBadge, Separator, HelpFooter, CompactLogo } from "../cli_app_components.js";

const MENU_ITEMS = [
  { label: "Home", value: "home", description: "Store front" },
  { label: "Search", value: "search", description: "Find apps" },
  { label: "Submit", value: "submit", description: "Submit your app" },
  { label: "Auth", value: "auth", description: "Login / manage keys" },
  { label: "Installed", value: "installed", description: "Your apps" },
  { label: "Settings", value: "settings", description: "Preferences" },
  { label: "Exit", value: "exit", description: "Quit bottel" },
];

type NavItem =
  | { section: "menu"; index: number }
  | { section: "featured"; index: number }
  | { section: "trending"; index: number };

export function Home() {
  const { state, dispatch, navigate } = useStore();
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 40;
  const compact = termRows < 45;

  const selectedIndex = state.home.selectedIndex;

  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getApps()
      .then((appsData) => {
        if (!cancelled) {
          setApps(appsData);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const featuredAgents = apps.slice(0, 3);
  const trendingAgents = apps.slice(0, 5);

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
    return items;
  }, [featuredAgents.length, trendingAgents.length]);

  const current = navItems[selectedIndex];
  const activeSection = current?.section ?? "menu";
  const activeIndexInSection = current?.index ?? 0;

  const totalAgents = apps.length;

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
      if (!current) return;
      if (current.section === "menu") {
        const item = MENU_ITEMS[current.index]!;
        switch (item.value) {
          case "home": break;
          case "search": navigate({ name: "search" }); break;
          case "submit": navigate({ name: "submit" }); break;
          case "auth": navigate({ name: "auth" }); break;
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
      }
      return;
    }

    if (key.upArrow) {
      dispatch({ type: "UPDATE_HOME", state: { selectedIndex: Math.max(0, selectedIndex - 1) } });
    }

    if (key.downArrow) {
      dispatch({ type: "UPDATE_HOME", state: { selectedIndex: Math.min(navItems.length - 1, selectedIndex + 1) } });
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text>Loading...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red">Failed to load: {error}</Text>
        <Text dimColor>Is the backend running at {process.env.BOTTEL_API_URL || "http://localhost:8787"}?</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {compact && (
        <Box marginBottom={1} flexDirection="column">
          <CompactLogo />
        </Box>
      )}

      <Box marginBottom={compact ? 0 : 1}>
        <Text dimColor>{totalAgents} apps available</Text>
      </Box>

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

      <Separator />

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
          <Box gap={1} marginTop={1} flexWrap="wrap">
            {featuredAgents.map((agent, i) => {
              const isActive = activeSection === "featured" && i === activeIndexInSection;
              return (
                <Box
                  key={`featured-${agent.id}`}
                  flexDirection="column"
                  borderStyle="round"
                  borderColor={isActive ? colors.primary : undefined}
                  minWidth={22}
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

      <Separator />

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

      <HelpFooter text="Esc back · ↑↓ nav · Enter select · / search · q quit" />
    </Box>
  );
}
