import { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { type App, getApps } from "../lib/api.js";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Cursor, HelpFooter } from "../cli_app_components.js";

const PAGE_SIZE = 5;

export function Search() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { query, selectedIndex, page, inputFocused } = state.search;
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;

  const [results, setResults] = useState<App[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedTerm, setSearchedTerm] = useState("");

  const doSearch = (term: string) => {
    setLoading(true);
    setError(null);
    setSearchedTerm(term.trim());
    getApps(term.trim() || undefined)
      .then((apps) => setResults(apps))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  // Load on mount — search with query or list all
  useEffect(() => {
    doSearch(query);
  }, []);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedResults = results.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const update = (s: Partial<typeof state.search>) =>
    dispatch({ type: "UPDATE_SEARCH", state: s });

  useInput((input, key) => {
    if (key.escape) {
      if (!inputFocused) update({ inputFocused: true });
      else if (query) update({ query: "", selectedIndex: 0, page: 0 });
      else goBack();
      return;
    }
    if (inputFocused) {
      if (key.return) { doSearch(query); update({ inputFocused: false, selectedIndex: 0 }); return; }
      if ((key.downArrow || key.tab) && results.length > 0) update({ inputFocused: false, selectedIndex: 0 });
      return;
    }
    if (key.tab) {
      update({ inputFocused: true });
      return;
    }
    if (key.upArrow) {
      if (pagedResults.length > 0) {
        update({ selectedIndex: (selectedIndex - 1 + pagedResults.length) % pagedResults.length });
      }
      return;
    }
    if (key.downArrow) {
      if (pagedResults.length > 0) {
        update({ selectedIndex: (selectedIndex + 1) % pagedResults.length });
      }
      return;
    }
    if (key.leftArrow && currentPage > 0) { update({ page: currentPage - 1, selectedIndex: 0 }); return; }
    if (key.rightArrow && currentPage < totalPages - 1) { update({ page: currentPage + 1, selectedIndex: 0 }); return; }
    if (key.return) {
      const agent = pagedResults[selectedIndex];
      if (agent) navigate({ name: "agent-detail", agentId: agent.id });
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      update({ inputFocused: true, query: query + input, selectedIndex: 0, page: 0 });
    }
  });

  const maxTextWidth = Math.max(30, termWidth - 8);
  const truncate = (s: string, len: number) => s.length > len ? s.slice(0, len - 3) + "..." : s;
  const compact = termWidth < 60;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1} gap={2} alignItems="center">
        <Box>{"bottel.ai".split("").map((ch, i) => (
          <Text key={i} bold color={[colors.error, colors.warning, colors.primary][i % 3]}>{ch}</Text>
        ))}</Box>
        <Box borderStyle="round" borderColor={inputFocused ? colors.primary : colors.border} paddingX={2} flexGrow={1}>
          <Text color={inputFocused ? colors.primary : undefined}>🔍 </Text>
          <TextInput
            value={query}
            onChange={(v) => update({ query: v, selectedIndex: 0, page: 0 })}
            placeholder="Search bot native apps and MCP..."
            focus={inputFocused}
          />
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          {loading ? "Searching..." :
            searchedTerm
              ? `About ${results.length} result${results.length !== 1 ? "s" : ""} for "${searchedTerm}"` +
                (totalPages > 1 ? `  ·  Page ${currentPage + 1} of ${totalPages}` : "")
              : `${results.length} app${results.length !== 1 ? "s" : ""} · sorted by downloads` +
                (totalPages > 1 ? `  ·  Page ${currentPage + 1} of ${totalPages}` : "")
          }
        </Text>
      </Box>

      {error && <Box paddingLeft={1}><Text color="red">Error: {error}</Text></Box>}

      {!loading && !error && results.length === 0 && query.trim() && (
        <Box flexDirection="column" paddingLeft={1}>
          <Text>No results found for <Text bold>"{query}"</Text></Text>
          <Text dimColor>Try different keywords or check the spelling.</Text>
        </Box>
      )}

      {!loading && !error && pagedResults.map((agent, i) => {
        const isActive = !inputFocused && i === selectedIndex;
        return (
          <Box key={agent.id} flexDirection="column" marginBottom={1} paddingLeft={1}>
            <Box>
              <Cursor active={isActive} />
              <Text color={isActive ? "#48dbfb" : "#54a0ff"} bold underline>
                {truncate(agent.name, maxTextWidth)}
              </Text>
              {agent.verified && <Text color={colors.success}> ✓</Text>}
            </Box>
            <Box paddingLeft={3}>
              {agent.mcpUrl ? (
                <Text color="#ff9ff3">[MCP] {truncate(agent.mcpUrl, maxTextWidth - 6)}</Text>
              ) : (
                <Text color="#2ed573">{truncate(`bottel.ai/apps/${agent.slug}`, maxTextWidth)}</Text>
              )}
            </Box>
            <Box paddingLeft={3}>
              <Text>{truncate(agent.description, maxTextWidth)}</Text>
            </Box>
            <Box paddingLeft={3}>
              <Text dimColor>{agent.installs.toLocaleString()} installs</Text>
            </Box>
          </Box>
        );
      })}

      {/* Google-style pagination logo — 3 color layers cycling */}
      {!loading && !error && results.length > 0 && (() => {
        const oos = "o".repeat(Math.max(1, Math.min(totalPages, 10)));
        const word = `b${oos}ttel.ai`;
        const layerColors = [colors.error, colors.warning, colors.primary];
        return (
          <Box justifyContent="center" marginTop={1}>
            {word.split("").map((ch, i) => (
              <Text key={i} color={layerColors[i % 3]} bold>{ch}</Text>
            ))}
            {totalPages > 1 && <Text dimColor>  Page {currentPage + 1} of {totalPages}</Text>}
          </Box>
        );
      })()}

      <HelpFooter text={inputFocused ? "Enter search · ↑↓/Tab results · Esc back" : `↑↓ nav · Tab search · Enter select${totalPages > 1 ? " · ←→ pages" : ""} · Esc back`} />
    </Box>
  );
}
