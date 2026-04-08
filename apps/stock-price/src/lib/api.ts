/**
 * api — fetches US stock quotes from Yahoo Finance's public chart endpoint.
 * No API key, no auth, works for any US-listed ticker.
 */

export interface StockQuote {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  marketCap?: number;
  timestamp: number;
}

interface YahooResult {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        regularMarketPrice: number;
        chartPreviousClose: number;
        regularMarketDayHigh: number;
        regularMarketDayLow: number;
        regularMarketVolume: number;
        longName?: string;
        shortName?: string;
        exchangeName: string;
        currency: string;
        regularMarketTime: number;
      };
    }> | null;
    error?: { description: string };
  };
}

export async function fetchStock(symbol: string): Promise<StockQuote> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) throw new Error("Symbol is required");
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym)) throw new Error("Invalid symbol format");

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: {
      // Yahoo blocks default Node UA on some routes; use a browser UA
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);

  const json = (await res.json()) as YahooResult;
  if (json.chart.error) throw new Error(json.chart.error.description);
  if (!json.chart.result || json.chart.result.length === 0) throw new Error(`No data for ${sym}`);

  const m = json.chart.result[0]!.meta;
  const price = m.regularMarketPrice;
  const prev = m.chartPreviousClose;
  const change = price - prev;
  const changePercent = (change / prev) * 100;

  return {
    symbol: m.symbol,
    name: m.longName || m.shortName || m.symbol,
    exchange: m.exchangeName,
    currency: m.currency,
    price,
    previousClose: prev,
    change,
    changePercent,
    dayHigh: m.regularMarketDayHigh,
    dayLow: m.regularMarketDayLow,
    volume: m.regularMarketVolume,
    timestamp: m.regularMarketTime,
  };
}
