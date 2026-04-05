import { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { type App, getApps } from "../lib/api.js";
import { useStore } from "../cli_app_state.js";
import { colors, columns } from "../cli_app_theme.js";
import { Breadcrumb, Cursor, ScreenHeader, HelpFooter } from "../cli_app_components.js";

export function Installed() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { selectedIndex } = state.installedScreen;

  const [allApps, setAllApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getApps()
      .then((apps) => {
        if (!cancelled) setAllApps(apps);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const installedAgents = useMemo(() => {
    return allApps.filter((a) => state.installed.has(a.id));
  }, [state.installed, allApps]);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }
    if (key.upArrow) {
      dispatch({ type: "UPDATE_INSTALLED", state: { selectedIndex: Math.max(0, selectedIndex - 1) } });
    }
    if (key.downArrow) {
      dispatch({ type: "UPDATE_INSTALLED", state: { selectedIndex: Math.min(installedAgents.length - 1, selectedIndex + 1) } });
    }
    if (key.return && installedAgents.length > 0 && installedAgents[selectedIndex]) {
      navigate({ name: "agent-detail", agentId: installedAgents[selectedIndex].id });
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
        <Text color="red">Failed to load apps: {error}</Text>
      </Box>
    );
  }

  const allRows: React.ReactNode[] = [];

  allRows.push(<Breadcrumb key="breadcrumb" path={["Home", "Installed"]} />);
  allRows.push(<ScreenHeader key="header" title={`Installed Apps (${installedAgents.length})`} />);

  if (installedAgents.length === 0) {
    allRows.push(
      <Box key="empty-1" paddingLeft={2} marginTop={1}>
        <Text dimColor>No apps installed yet.</Text>
      </Box>
    );
    allRows.push(
      <Box key="empty-2" paddingLeft={2}>
        <Text dimColor>Go to Home &gt; Browse to discover apps.</Text>
      </Box>
    );
  } else {
    installedAgents.forEach((agent, i) => {
      const isSelected = i === selectedIndex;
      allRows.push(
        <Box key={agent.id}>
          <Cursor active={isSelected} />
          <Box width={columns.name}>
            <Text bold={isSelected} color={isSelected ? colors.primary : undefined}>{agent.name}</Text>
          </Box>
          <Box width={columns.rating}>
            <Text dimColor>v{agent.version}</Text>
          </Box>
          <Box width={18}>
            <Text dimColor>by {agent.author}</Text>
          </Box>
          <Text dimColor>[{agent.category}]</Text>
        </Box>
      );
    });
  }

  allRows.push(<HelpFooter key="footer" text="Esc back \u00b7 \u2191\u2193 nav \u00b7 Enter select" />);

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
