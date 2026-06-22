import type { TokenUsage } from './agent.js';

/**
 * Token + cost analytics for the spike. The API returns usage per call; we
 * aggregate it across runs and estimate spend. Pricing is approximate public
 * per-million-token rates (input / output, with prompt-cache write at 1.25x
 * input and cache read at 0.1x input). Edit PRICING_PER_MTOK if rates change —
 * the estimate is only as current as this table.
 */

export interface UsageRates {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export const PRICING_PER_MTOK: Record<string, UsageRates> = {
  opus: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

export function pickRate(model: string): { tier: string; rate: UsageRates } {
  const m = model.toLowerCase();
  const tier = (Object.keys(PRICING_PER_MTOK) as string[]).find((t) => m.includes(t)) ?? 'sonnet';
  return { tier, rate: PRICING_PER_MTOK[tier]! };
}

export const EMPTY_TOTALS: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
};

export function sumUsage(usages: Array<TokenUsage | null>): TokenUsage {
  return usages.reduce<TokenUsage>((acc, u) => {
    if (!u) return acc;
    return {
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      cacheCreationTokens: acc.cacheCreationTokens + u.cacheCreationTokens,
      cacheReadTokens: acc.cacheReadTokens + u.cacheReadTokens,
    };
  }, { ...EMPTY_TOTALS });
}

export function totalTokens(u: TokenUsage): number {
  return u.inputTokens + u.outputTokens + u.cacheCreationTokens + u.cacheReadTokens;
}

export function estimateCostUSD(model: string, totals: TokenUsage): { tier: string; usd: number } {
  const { tier, rate } = pickRate(model);
  const usd =
    (totals.inputTokens * rate.input +
      totals.outputTokens * rate.output +
      totals.cacheCreationTokens * rate.cacheWrite +
      totals.cacheReadTokens * rate.cacheRead) /
    1_000_000;
  return { tier, usd };
}
