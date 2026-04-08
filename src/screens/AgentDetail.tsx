import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { type App, getApp } from "../lib/api.js";
import { useStore } from "../state.js";
import { colors, formatNumber, boxStyle } from "../theme.js";
import { Breadcrumb, Separator, HelpFooter } from "../components.js";

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
  const isMcp = !!(agent?.mcpUrl);

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
    if (key.leftArrow || key.upArrow) dispatch({ type: "UPDATE_AGENT_DETAIL", state: { buttonIndex: (buttonIndex - 1 + 2) % 2 } });
    if (key.rightArrow || key.downArrow || key.tab) dispatch({ type: "UPDATE_AGENT_DETAIL", state: { buttonIndex: (buttonIndex + 1) % 2 } });
    if (key.return && installStatus === "idle") {
      if (buttonIndex === 0 && !isMcp) {
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

  allRows.push(<Breadcrumb key="breadcrumb" path={["Home", "Apps", agent.name]} />);

  allRows.push(
    <Box key="header" {...boxStyle.header} paddingX={1} marginBottom={1} flexGrow={1}>
      <Box flexGrow={1}>
        <Text bold color={colors.primary}>{agent.name}</Text>
        <Text dimColor>  v{agent.version}</Text>
      </Box>
      {agent.verified && <Text color={colors.success}>Verified</Text>}
    </Box>
  );

  allRows.push(
    <Box key="author" marginBottom={0}>
      <Text color="#2ed573">by {agent.authorName || agent.author.replace("SHA256:", "").slice(0, 12)}</Text>
      {agent.authorName && <Text dimColor>  #{agent.author.replace("SHA256:", "").slice(0, 8)}</Text>}
    </Box>
  );
  allRows.push(
    <Box key="installs" marginBottom={1}>
      <Text dimColor>{formatNumber(agent.installs)} installs</Text>
    </Box>
  );

  allRows.push(<Box key="short-desc" marginBottom={1}><Text>{agent.description}</Text></Box>);

  if (descLines.some(l => l.trim())) {
    allRows.push(<Separator key="sep1" />);
    descLines.forEach((line, i) => {
      if (line.trim()) allRows.push(<Text key={`desc-${i}`}>{line}</Text>);
    });
    allRows.push(<Box key="desc-spacer" marginBottom={1} />);
  }

  if (agent.capabilities.length > 0) {
    allRows.push(
      <Box key="capabilities" gap={1} marginBottom={1}>
        <Text dimColor>Capabilities:</Text>
        {agent.capabilities.map((cap) => (
          <Text key={cap} color={colors.secondary}>[{cap}]</Text>
        ))}
      </Box>
    );
  }

  if (isMcp) {
    allRows.push(
      <Box key="mcp-label" marginBottom={1}>
        <Text bold color={colors.accent}>MCP Service</Text>
      </Box>
    );
    allRows.push(
      <Box key="mcp-url" borderStyle="single" borderColor={colors.primary} paddingX={1} flexGrow={1} marginBottom={1}>
        <Text dimColor>Endpoint: </Text>
        <Text color={colors.primary} bold>{agent.mcpUrl}</Text>
      </Box>
    );
    allRows.push(
      <Box key="mcp-hint" marginBottom={1}>
        <Text dimColor>Connect via: mcp connect {agent.mcpUrl}</Text>
      </Box>
    );
  }
  if (agent.npmPackage) {
    allRows.push(
      <Box key="npm-label" marginBottom={1}>
        <Text bold color={colors.accent}>npm Package</Text>
      </Box>
    );
    allRows.push(
      <Box key="npm-pkg" borderStyle="single" borderColor={colors.primary} paddingX={1} flexGrow={1} marginBottom={1}>
        <Text dimColor>Package: </Text>
        <Text color={colors.primary} bold>{agent.npmPackage}</Text>
      </Box>
    );
    allRows.push(
      <Box key="npm-hint" marginBottom={1}>
        <Text dimColor>Run via: npx -y --prefer-offline {agent.npmPackage}</Text>
      </Box>
    );
  }
  if (agent.pipPackage) {
    allRows.push(
      <Box key="pip-label" marginBottom={1}>
        <Text bold color={colors.accent}>pip Package</Text>
      </Box>
    );
    allRows.push(
      <Box key="pip-pkg" borderStyle="single" borderColor={colors.primary} paddingX={1} flexGrow={1} marginBottom={1}>
        <Text dimColor>Package: </Text>
        <Text color={colors.primary} bold>{agent.pipPackage}</Text>
      </Box>
    );
    allRows.push(
      <Box key="pip-hint" marginBottom={1}>
        <Text dimColor>Install via: pip install {agent.pipPackage}</Text>
      </Box>
    );
  }
  if (isMcp) {
    allRows.push(
      <Box key="buttons" gap={2}>
        <Text
          bold={buttonIndex === 0}
          color={buttonIndex === 0 ? colors.primary : undefined}
          dimColor={buttonIndex !== 0}
        >
          [ Copy URL ]
        </Text>
        <Text
          bold={buttonIndex === 1}
          color={buttonIndex === 1 ? colors.primary : undefined}
          dimColor={buttonIndex !== 1}
        >
          [ Back ]
        </Text>
      </Box>
    );
  } else {
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
  }

  allRows.push(<HelpFooter key="footer" text="Esc back · ←→ nav · Tab toggle · Enter select" />);

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
