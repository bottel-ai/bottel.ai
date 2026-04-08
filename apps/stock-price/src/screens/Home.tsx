import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { colors } from "@bottel/cli-app-scaffold/theme";
import { Breadcrumb, HelpFooter } from "@bottel/cli-app-scaffold/components";
import { fetchStock, type StockQuote } from "../lib/api.js";

function fmtUsd(n: number, decimals = 2): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtNum(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toString();
}

export function Home() {
  const { exit } = useApp();
  const [input, setInput] = useState("AAPL");
  const [editing, setEditing] = useState(true);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = (sym: string) => {
    if (!sym.trim()) return;
    setLoading(true);
    setError(null);
    setEditing(false);
    fetchStock(sym)
      .then(q => setQuote(q))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useInput((char, key) => {
    if (editing) return;
    if (char === "q" || key.escape) exit();
    if (char === "r" && quote) search(quote.symbol);
    if (char === "/" || char === "s") {
      setInput("");
      setEditing(true);
    }
  }, { isActive: !editing });

  const trendUp = (quote?.change ?? 0) >= 0;
  const trendColor = trendUp ? colors.success : colors.error;
  const trendArrow = trendUp ? "▲" : "▼";

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["stock-price"]} />

      <Box marginBottom={1}>
        <Text bold color={colors.primary}>📈 US Stock Price</Text>
        <Text dimColor>  live from Yahoo Finance</Text>
      </Box>

      <Box marginBottom={1}>
        <Box borderStyle="round" borderColor={editing ? colors.primary : colors.border} paddingX={1} flexGrow={1}>
          <Text color={colors.accent}>{editing ? "❯ " : "  "}</Text>
          <Text dimColor>Ticker: </Text>
          {editing ? (
            <TextInput
              value={input}
              onChange={(v) => setInput(v.toUpperCase())}
              onSubmit={() => search(input)}
              placeholder="AAPL, MSFT, GOOG, TSLA..."
              focus={true}
            />
          ) : (
            <Text bold color="#fff">{input}</Text>
          )}
        </Box>
      </Box>

      {loading && (
        <Box paddingX={2} marginBottom={1}>
          <Text color={colors.warning}><Spinner type="dots" /> Fetching {input}...</Text>
        </Box>
      )}

      {error && !loading && (
        <Box flexDirection="column" borderStyle="round" borderColor={colors.error} paddingX={2} paddingY={1} marginBottom={1}>
          <Text color={colors.error}>Error</Text>
          <Text dimColor>{error}</Text>
        </Box>
      )}

      {quote && !loading && !error && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={trendColor}
          paddingX={2}
          paddingY={1}
          marginBottom={1}
          flexGrow={1}
        >
          <Box>
            <Text bold color={colors.accent}>{quote.symbol}</Text>
            <Text dimColor>  {quote.exchange}  ·  </Text>
            <Text>{quote.name}</Text>
          </Box>

          <Box marginTop={1}>
            <Text dimColor>Price:    </Text>
            <Text bold color="#fff">{fmtUsd(quote.price)}</Text>
            <Text>  </Text>
            <Text color={trendColor}>{trendArrow} {fmtUsd(Math.abs(quote.change))} ({quote.changePercent.toFixed(2)}%)</Text>
          </Box>

          <Box>
            <Text dimColor>Prev:     </Text>
            <Text>{fmtUsd(quote.previousClose)}</Text>
          </Box>

          <Box>
            <Text dimColor>Day High: </Text>
            <Text color={colors.success}>{fmtUsd(quote.dayHigh)}</Text>
          </Box>

          <Box>
            <Text dimColor>Day Low:  </Text>
            <Text color={colors.error}>{fmtUsd(quote.dayLow)}</Text>
          </Box>

          <Box>
            <Text dimColor>Volume:   </Text>
            <Text color={colors.secondary}>{fmtNum(quote.volume)}</Text>
          </Box>

          <Box marginTop={1}>
            <Text dimColor>Updated: {new Date(quote.timestamp * 1000).toLocaleString()}</Text>
          </Box>
        </Box>
      )}

      <HelpFooter text={editing ? "Enter search · Esc cancel" : "s search · r refresh · q quit"} />
    </Box>
  );
}
