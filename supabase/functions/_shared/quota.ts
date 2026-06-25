// ============================================================
// In-memory daily quota tracker (per cold start)
// Used by ai-provider & image-gen to skip exhausted providers.
// ============================================================

interface Counter { date: string; count: number; }
const counters = new Map<string, Counter>();

// Soft daily budgets (per provider per cold-start day).
// These are conservative defaults — actual hard caps live with the provider.
const DAILY_BUDGETS: Record<string, number> = {
  "gemini-text": 20,        // Gemini 2.5 Flash free tier ~20/day grounding
  "gemini-image": 30,
  "lovable-text": 500,
  "lovable-image": 100,
  "aimlapi-text": 200,
  "featherless-text": 500,
};

function today(): string { return new Date().toISOString().slice(0, 10); }

export function canUse(key: string): boolean {
  const budget = DAILY_BUDGETS[key];
  if (!budget) return true;
  const c = counters.get(key);
  if (!c || c.date !== today()) return true;
  return c.count < budget;
}

export function track(key: string, n = 1): void {
  const t = today();
  const c = counters.get(key);
  if (!c || c.date !== t) counters.set(key, { date: t, count: n });
  else c.count += n;
}

export function snapshot(): Record<string, { used: number; budget: number; date: string }> {
  const t = today();
  const out: Record<string, { used: number; budget: number; date: string }> = {};
  for (const [k, b] of Object.entries(DAILY_BUDGETS)) {
    const c = counters.get(k);
    out[k] = { used: c && c.date === t ? c.count : 0, budget: b, date: t };
  }
  return out;
}
