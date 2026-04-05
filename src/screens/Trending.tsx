import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { type App, getApps } from "../lib/api.js";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Cursor, HelpFooter } from "../cli_app_components.js";

export function Trending() {
  const { navigate, goBack } = useStore();
  const [apps, setApps] = useState<App[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getApps()
      .then(setApps)
      .finally(() => setLoading(false));
  }, []);

  useInput((_input, key) => {
    if (key.escape) { goBack(); return; }
    if (key.upArrow) setSelectedIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIndex((i) => Math.min(apps.length - 1, i + 1));
    if (key.return && apps[selectedIndex]) {
      navigate({ name: "agent-detail", agentId: apps[selectedIndex].id });
    }
  });

  if (loading) return <Box paddingX={1}><Text>Loading...</Text></Box>;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color={colors.primary}>Trending Apps</Text>
        <Text dimColor>  ·  Top {apps.length} by installs</Text>
      </Box>

      {apps.map((agent, i) => {
        const isActive = i === selectedIndex;
        return (
          <Box key={agent.id} flexDirection="column" marginBottom={1} paddingLeft={1}>
            <Box>
              <Cursor active={isActive} />
              <Text dimColor>{String(i + 1).padStart(2)}. </Text>
              <Text color={isActive ? "#48dbfb" : "#54a0ff"} bold underline>
                {agent.name}
              </Text>
              {agent.verified && <Text color={colors.success}> ✓</Text>}
            </Box>
            <Box paddingLeft={6}>
              <Text color="#2ed573">bottel.ai/apps/{agent.slug}</Text>
            </Box>
            <Box paddingLeft={6}>
              <Text>{agent.description}</Text>
            </Box>
            <Box paddingLeft={6} gap={2}>
              <Text color={colors.warning}>{"★".repeat(Math.round(agent.rating))} {agent.rating.toFixed(1)}</Text>
              <Text dimColor>{agent.installs.toLocaleString()} installs</Text>
            </Box>
          </Box>
        );
      })}

      {apps.length === 0 && (
        <Text dimColor>No apps yet. Be the first to submit one!</Text>
      )}

      <HelpFooter text="Esc back · ↑↓ nav · Enter view" />
    </Box>
  );
}
