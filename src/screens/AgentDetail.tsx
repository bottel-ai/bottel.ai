import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { type App, getApp } from "../lib/api.js";
import { useStore } from "../cli_app_state.js";
import { colors, formatNumber, boxStyle } from "../cli_app_theme.js";
import { Breadcrumb, Separator, HelpFooter } from "../cli_app_components.js";

type InstallStatus = "idle" | "installing";

export function AgentDetail({ agentId }: { agentId: string }) {
  const { state, dispatch, goBack } = useStore();
  const { buttonIndex } = state.agentDetail;
  const [installStatus, setInstallStatus] = useState<InstallStatus>("idle");

  const [agent, setAgent] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getApp(agentId)
      .then((app) => {
        if (!cancelled) setAgent(app);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [agentId]);

  const isInstalled = state.installed.has(agentId);

  useEffect(() => {
    if (installStatus === "installing") {
      const timer = setTimeout(() => {
        dispatch({ type: "INSTALL_AGENT", agentId });
        setInstallStatus("idle");
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [installStatus]);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }
    if (key.leftArrow) dispatch({ type: "UPDATE_AGENT_DETAIL", state: { buttonIndex: 0 } });
    if (key.rightArrow) dispatch({ type: "UPDATE_AGENT_DETAIL", state: { buttonIndex: 1 } });
    if (key.return && installStatus === "idle") {
      if (buttonIndex === 0) {
        if (isInstalled) {
          dispatch({ type: "UNINSTALL_AGENT", agentId });
        } else {
          setInstallStatus("installing");
        }
      } else {
        goBack();
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text>Loading...</Text>
      </Box>
    );
  }

  if (error || !agent) {
    return (
      <Box paddingX={1} flexDirection="column">
        <Text color="red">Agent not found: {agentId}</Text>
        <Text dimColor>Esc to go back</Text>
      </Box>
    );
  }

  const descLines = agent.longDescription.split("\n");

  const allRows: React.ReactNode[] = [];

  allRows.push(<Breadcrumb key="breadcrumb" path={["Home", agent.category, agent.name]} />);

  allRows.push(
    <Box key="header" {...boxStyle.header} paddingX={1} marginY={1}>
      <Box flexGrow={1}>
        <Text bold color={colors.primary}>{agent.name}</Text>
        <Text dimColor>  v{agent.version}</Text>
      </Box>
      {agent.verified && <Text color={colors.success}>Verified</Text>}
    </Box>
  );

  allRows.push(<Text key="author" dimColor>by {agent.author}</Text>);
  allRows.push(<Text key="blank1">{""}</Text>);

  allRows.push(
    <Box key="stats" gap={2}>
      <Text dimColor>{formatNumber(agent.installs)} installs</Text>
    </Box>
  );

  allRows.push(<Text key="blank2">{""}</Text>);
  allRows.push(<Text key="short-desc">{agent.description}</Text>);
  allRows.push(<Text key="blank3">{""}</Text>);
  allRows.push(<Separator key="sep1" />);
  allRows.push(<Text key="blank4">{""}</Text>);

  descLines.forEach((line, i) => {
    allRows.push(<Text key={`desc-${i}`}>{line}</Text>);
  });

  allRows.push(<Text key="blank5">{""}</Text>);
  allRows.push(<Separator key="sep2" />);
  allRows.push(<Text key="blank6">{""}</Text>);

  allRows.push(
    <Box key="capabilities" gap={1}>
      <Text>Capabilities: </Text>
      {agent.capabilities.map((cap) => (
        <Text key={cap} color={colors.secondary}>[{cap}]</Text>
      ))}
    </Box>
  );

  allRows.push(<Text key="blank7">{""}</Text>);
  allRows.push(
    <Text key="metadata" dimColor>Category: <Text color={colors.secondary} underline>{agent.category}</Text></Text>
  );
  allRows.push(<Text key="blank8">{""}</Text>);

  allRows.push(
    <Box key="buttons" gap={2}>
      {installStatus === "installing" ? (
        <Text color={colors.warning}><Spinner type="dots" /> Installing...</Text>
      ) : (
        <Text
          bold={buttonIndex === 0}
          color={buttonIndex === 0 ? (isInstalled ? "red" : colors.primary) : undefined}
          dimColor={buttonIndex !== 0}
        >
          [ {isInstalled ? "Uninstall" : "Install"} ]
        </Text>
      )}
      <Text
        bold={buttonIndex === 1}
        color={buttonIndex === 1 ? colors.primary : undefined}
        dimColor={buttonIndex !== 1}
      >
        [ Back ]
      </Text>
      {isInstalled && installStatus === "idle" && (
        <Text color={colors.success}>Installed {"\u2713"}</Text>
      )}
    </Box>
  );

  allRows.push(<HelpFooter key="footer" text="Esc back · ←→ nav · Enter select" />);

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
