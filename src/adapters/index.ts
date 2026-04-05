import type { ServiceAdapter } from "./types.js";
import { hackernews } from "./hackernews.js";
import { google } from "./google.js";
import { weather } from "./weather.js";
import { calculator } from "./calculator.js";
import { wikipedia } from "./wikipedia.js";

export const adapters: ServiceAdapter[] = [google, hackernews, weather, calculator, wikipedia];
export const adapterMap = new Map<string, ServiceAdapter>(adapters.map((a) => [a.id, a]));
