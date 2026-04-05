import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { type App, getApps, getCategories } from "../lib/api.js";
import { useStore } from "../cli_app_state.js";
import { colors, columns } from "../cli_app_theme.js";
import { Breadcrumb, Rating, InstallCount, VerifiedBadge, Cursor, HelpFooter } from "../cli_app_components.js";

const AGENTS_PAGE_SIZE = 5;

export function Browse() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { categoryIndex, expandedCategory, agentIndex, agentPage, inAgents } = state.browse;

  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [categoryAgents, setCategoryAgents] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (expandedCategory == null || categories.length === 0) {
      setCategoryAgents([]);
      return;
    }
    const cat = categories[expandedCategory];
    if (!cat) return;
    setAgentsLoading(true);
    getApps(undefined, cat.name)
      .then(setCategoryAgents)
      .catch(() => setCategoryAgents([]))
      .finally(() => setAgentsLoading(false));
  }, [expandedCategory, categories]);

  const totalAgentPages = Math.max(1, Math.ceil(categoryAgents.length / AGENTS_PAGE_SIZE));
  const currentAgentPage = Math.min(agentPage, totalAgentPages - 1);
  const pagedAgents = categoryAgents.slice(
    currentAgentPage * AGENTS_PAGE_SIZE,
    (currentAgentPage + 1) * AGENTS_PAGE_SIZE
  );

  const update = (s: Partial<typeof state.browse>) =>
    dispatch({ type: "UPDATE_BROWSE", state: s });

  useInput((_input, key) => {
    if (key.escape) {
      if (inAgents) {
        update({ inAgents: false, agentIndex: 0 });
      } else if (expandedCategory != null) {
        update({ expandedCategory: null });
      } else {
        goBack();
      }
      return;
    }

    if (!inAgents) {
      if (key.upArrow) {
        update({ categoryIndex: Math.max(0, categoryIndex - 1) });
      }
      if (key.downArrow) {
        update({ categoryIndex: Math.min(categories.length - 1, categoryIndex + 1) });
      }
      if (key.return) {
        if (expandedCategory === categoryIndex) {
          update({ inAgents: true, agentIndex: 0, agentPage: 0 });
        } else {
          update({ expandedCategory: categoryIndex, agentIndex: 0, agentPage: 0 });
        }
      }
      return;
    }

    if (key.upArrow) {
      if (agentIndex <= 0) {
        update({ inAgents: false });
      } else {
        update({ agentIndex: agentIndex - 1 });
      }
    }
    if (key.downArrow) {
      update({ agentIndex: Math.min(pagedAgents.length - 1, agentIndex + 1) });
    }
    if (key.leftArrow && currentAgentPage > 0) {
      update({ agentPage: currentAgentPage - 1, agentIndex: 0 });
    }
    if (key.rightArrow && currentAgentPage < totalAgentPages - 1) {
      update({ agentPage: currentAgentPage + 1, agentIndex: 0 });
    }
    if (key.return) {
      const agent = pagedAgents[agentIndex];
      if (agent) navigate({ name: "agent-detail", agentId: agent.id });
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
        <Text color="red">Failed to load categories: {error}</Text>
      </Box>
    );
  }

  const expandedCat = expandedCategory != null ? categories[expandedCategory] : null;

  const breadcrumbPath = expandedCat
    ? ["Home", "Browse", expandedCat.name]
    : ["Home", "Browse"];

  const allRows: React.ReactNode[] = [];

  allRows.push(<Breadcrumb key="breadcrumb" path={breadcrumbPath} />);

  allRows.push(
    <Box key="header" marginBottom={1}>
      <Text bold color={colors.primary}>Browse Categories</Text>
    </Box>
  );

  categories.forEach((cat, i) => {
    const isActive = i === categoryIndex && !inAgents;
    const isExpanded = expandedCategory === i;

    allRows.push(
      <Box key={`cat-${cat.name}`}>
        <Cursor active={isActive} />
        <Text bold={isActive || isExpanded} color={isActive ? colors.primary : undefined}>
          {isExpanded ? "\u25BC" : "\u25B6"} {cat.name}
        </Text>
        <Text dimColor> ({cat.count})</Text>
      </Box>
    );

    if (isExpanded) {
      if (agentsLoading) {
        allRows.push(
          <Box key="agents-loading" paddingLeft={4}>
            <Text dimColor>Loading agents...</Text>
          </Box>
        );
      } else {
        pagedAgents.forEach((agent, j) => {
          const isAgentActive = inAgents && j === agentIndex;

          allRows.push(
            <Box key={`agent-${agent.id}`} flexDirection="column" paddingLeft={4}>
              <Box>
                <Cursor active={isAgentActive} />
                <Box width={columns.name}>
                  <Text bold={isAgentActive} color={isAgentActive ? colors.primary : undefined}>
                    {agent.name}
                  </Text>
                </Box>
                <Rating value={agent.rating} showNumber={false} />
                <InstallCount count={agent.installs} />
                <VerifiedBadge verified={agent.verified} />
              </Box>
              <Box paddingLeft={4}>
                <Text dimColor>{agent.description.slice(0, 70)}</Text>
              </Box>
            </Box>
          );
        });

        if (totalAgentPages > 1) {
          allRows.push(
            <Box key="agent-page-info" paddingLeft={4} marginBottom={1}>
              <Text dimColor>
                Page {currentAgentPage + 1}/{totalAgentPages}  ←→ prev/next
              </Text>
            </Box>
          );
        }
      }
    }
  });

  allRows.push(
    <HelpFooter key="footer" text={`Esc back \u00b7 \u2191\u2193 nav \u00b7 Enter expand/select${totalAgentPages > 1 && inAgents ? " \u00b7 \u2190\u2192 pages" : ""}`} />
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
