import React, { useMemo } from "react";
import { Box, Text, useInput } from "ink";
import fs from "fs";
import type { Agent } from "../components/AgentCard.js";
import { useStore } from "../cli_app_state.js";
import { colors, columns } from "../cli_app_theme.js";
import { Breadcrumb, Rating, InstallCount, VerifiedBadge, Cursor, HelpFooter } from "../cli_app_components.js";


interface StoreData {
  categories: { name: string; icon: string; agents: string[] }[];
  agents: Agent[];
}

const storeData: StoreData = JSON.parse(
  fs.readFileSync(new URL("../data/store.json", import.meta.url), "utf-8")
);

const AGENTS_PAGE_SIZE = 5;

export function Browse() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { categoryIndex, expandedCategory, agentIndex, agentPage, inAgents } = state.browse;

  const categories = storeData.categories;

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of storeData.agents) map.set(a.id, a);
    return map;
  }, []);

  const expandedCat = expandedCategory != null ? categories[expandedCategory] : null;
  const categoryAgents = useMemo(() => {
    if (!expandedCat) return [];
    return expandedCat.agents.map((id) => agentMap.get(id)).filter(Boolean) as Agent[];
  }, [expandedCat, agentMap]);

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
      // Navigating categories
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

    // Navigating agents
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

  const breadcrumbPath = expandedCat
    ? ["Home", "Browse", expandedCat.name]
    : ["Home", "Browse"];


  const allRows: React.ReactNode[] = [];

  // Row 0: breadcrumb
  allRows.push(<Breadcrumb key="breadcrumb" path={breadcrumbPath} />);

  // Row 1: header
  allRows.push(
    <Box key="header" marginBottom={1}>
      <Text bold color={colors.primary}>Browse Categories</Text>
    </Box>
  );

  // Track focused row index
  let focusedRowIndex = 0;

  // Category rows (with expanded agents as sub-rows)
  categories.forEach((cat, i) => {
    const isActive = i === categoryIndex && !inAgents;
    const isExpanded = expandedCategory === i;

    if (isActive) {
      focusedRowIndex = allRows.length;
    }

    // Category header row
    allRows.push(
      <Box key={`cat-${cat.name}`}>
        <Cursor active={isActive} />
        <Text bold={isActive || isExpanded} color={isActive ? colors.primary : undefined}>
          {isExpanded ? "\u25BC" : "\u25B6"} {cat.name}
        </Text>
        <Text dimColor> ({cat.agents.length})</Text>
      </Box>
    );

    // Expanded agent sub-rows
    if (isExpanded) {
      pagedAgents.forEach((agent, j) => {
        const isAgentActive = inAgents && j === agentIndex;

        if (isAgentActive) {
          focusedRowIndex = allRows.length;
        }

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
  });

  // Footer
  allRows.push(
    <HelpFooter key="footer" text={`Esc back \u00b7 \u2191\u2193 nav \u00b7 Enter expand/select${totalAgentPages > 1 && inAgents ? " \u00b7 \u2190\u2192 pages" : ""}`} />
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {allRows}
    </Box>
  );
}
