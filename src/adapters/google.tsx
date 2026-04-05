import React from "react";
import { Box, Text } from "ink";
import type { ServiceAdapter } from "./types.js";

const MOCK_RESULTS = [
  {
    title: "bottel.ai - The Terminal Browser for AI Agents",
    url: "https://bottel.ai",
    snippet: "Search, discover, and use AI-powered services directly from your terminal. Built for developers and AI agents alike.",
  },
  {
    title: "Building CLI Tools with Ink and React - Dev.to",
    url: "https://dev.to/cli-tools-ink-react",
    snippet: "A comprehensive guide to building beautiful terminal user interfaces using Ink, React, and TypeScript.",
  },
  {
    title: "The Future of Agent-to-Agent Communication",
    url: "https://arxiv.org/agent-communication-2026",
    snippet: "This paper explores protocols enabling autonomous AI agents to discover and interact with web services programmatically.",
  },
  {
    title: "Terminal UI Frameworks Compared: 2026 Edition",
    url: "https://blog.terminal.shop/tui-comparison",
    snippet: "We benchmark and compare Ink, Blessed, Bubbletea, and Ratatui for building modern terminal applications.",
  },
  {
    title: "npm: bottel - CLI bot marketplace",
    url: "https://npmjs.com/package/bottel",
    snippet: "A CLI bot marketplace. Search, discover, and use AI bots from your terminal. Latest version: 0.1.0.",
  },
];

export const google: ServiceAdapter = {
  id: "google",
  name: "Google Search",
  description: "Search the web",
  icon: "G>",
  render: (query: string) => {
    if (!query.trim()) {
      return (
        <Box>
          <Text dimColor>Type a query to search the web.</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text bold color="#4285f4">Google Search — Results for: <Text color="#ffffff">{query}</Text></Text>
        <Text>{""}</Text>
        {MOCK_RESULTS.map((r, i) => (
          <Box key={`g-${i}`} marginBottom={1} flexDirection="column">
            <Text bold color="#8ab4f8">{r.title}</Text>
            <Text color="#69d2a0">{r.url}</Text>
            <Text>{r.snippet}</Text>
          </Box>
        ))}
      </Box>
    );
  },
};
