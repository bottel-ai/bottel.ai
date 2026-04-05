import React from "react";
import { Box, Text } from "ink";
import type { ServiceAdapter } from "./types.js";

const MOCK_STORIES = [
  { rank: 1, title: "Show HN: I built a terminal browser for AI agents", points: 847, comments: 234, url: "bottel.ai" },
  { rank: 2, title: "Rust vs Go for CLI Tools in 2026", points: 623, comments: 412, url: "blog.rust-lang.org" },
  { rank: 3, title: "Why AI Agents Prefer CLI Over Web", points: 589, comments: 198, url: "arxiv.org" },
  { rank: 4, title: "The Terminal Renaissance: TUIs Are Back", points: 445, comments: 156, url: "terminal.shop" },
  { rank: 5, title: "MCP vs Direct API Calls: A Benchmark", points: 412, comments: 289, url: "anthropic.com" },
  { rank: 6, title: "Building a Search Engine for the Bot Internet", points: 378, comments: 167, url: "medium.com" },
  { rank: 7, title: "PostgreSQL 18 Released with Agent-Friendly Features", points: 356, comments: 134, url: "postgresql.org" },
  { rank: 8, title: "The $0.006 vs $0.60 Problem: Token Costs of Web Scraping", points: 334, comments: 223, url: "dev.to" },
  { rank: 9, title: "Ask HN: What CLI tools do your AI agents use daily?", points: 298, comments: 445, url: "news.ycombinator.com" },
  { rank: 10, title: "Cloudflare Workers Now Support Agent-to-Agent Protocol", points: 267, comments: 98, url: "cloudflare.com" },
];

export const hackernews: ServiceAdapter = {
  id: "hackernews",
  name: "Hacker News",
  description: "Top stories from HN",
  icon: "HN",
  render: () => (
    <Box flexDirection="column">
      <Text bold color="#ff6b6b">Hacker News — Top Stories</Text>
      <Text>{""}</Text>
      {MOCK_STORIES.map((s) => (
        <Box key={`hn-${s.rank}`} marginBottom={1} flexDirection="column">
          <Box>
            <Text dimColor>{String(s.rank).padStart(2)}. </Text>
            <Text bold>{s.title}</Text>
          </Box>
          <Box paddingLeft={4}>
            <Text color="#feca57">{s.points} pts</Text>
            <Text dimColor>  |  {s.comments} comments  |  {s.url}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  ),
};
