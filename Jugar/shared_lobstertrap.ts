// Lobster Trap — lightweight guard layer wrapping Gemini calls.
// Runs cheap heuristic checks (injection, PII), logs to lobstertrap_audit.
// Drop-in replacements for geminiText / geminiJson that ALSO take run/agent context.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  GeminiError,
  GEMINI_TEXT_MODEL,
  geminiJson,
  geminiText,
} from "./gemini.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export interface GuardContext {
  runId?: string | null;
  agentKey: string;
  model?: string;
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |the )?(previous|prior|above) instructions/i,
  /disregard (all |the )?(previous|prior|above)/i,
  /you are now (a |an )?[a-z ]+ (assistant|ai|bot)/i,
  /system prompt[:\s]/i,
  /<\/?\|im_(start|end)\|>/i,
  /\bjailbreak\b/i,
  /reveal (your|the) (system )?prompt/i,
];

const PII_CHECKS: { type: string; re: RegExp }[] = [
  { type: "email", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  { type: "phone", re: /(\+?\d{1,3}[ -]?)?\(?\d{3}\)?[ -]?\d{3,4}[ -]?\d{4}/ },
  { type: "cnic", re: /\b\d{5}-\d{7}-\d\b/ },                 // Pakistani CNIC
  { type: "credit_card", re: /\b(?:\d[ -]*?){13,16}\b/ },
];

export function scanPrompt(prompt: string) {
  const sample = prompt.slice(0, 8000);
  const injection_detected = INJECTION_PATTERNS.some((re) => re.test(sample));
  const pii_types: string[] = [];
  for (const { type, re } of PII_CHECKS) if (re.test(sample)) pii_types.push(type);
  const pii_detected = pii_types.length > 0;

  let risk = 0;
  if (injection_detected) risk += 0.6;
  if (pii_detected) risk += 0.3;
  risk = Math.min(1, risk);
  return { injection_detected, pii_detected, pii_types, risk_score: risk };
}

async function logAudit(row: Record<string, any>) {
  try {
    await supabase.from("lobstertrap_audit").insert(row);
  } catch (e) {
    console.error("lobstertrap audit insert failed", e);
  }
}

async function decideAction(scan: ReturnType<typeof scanPrompt>) {
  // Read policy from settings (best-effort; default deny on injection).
  let denyInjection = true;
  let quarantinePii = false;
  try {
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "guardian_policy")
      .maybeSingle();
    const policy = data?.value as any;
    if (policy?.deny_injection === false) denyInjection = false;
    if (policy?.quarantine_pii === true) quarantinePii = true;
  } catch { /* ignore */ }

  if (scan.injection_detected && denyInjection) return "DENY";
  if (scan.pii_detected && quarantinePii) return "QUARANTINE";
  if (scan.risk_score > 0.3) return "LOG";
  return "ALLOW";
}

export async function guardedGeminiText(
  prompt: string,
  ctx: GuardContext,
  opts?: Parameters<typeof geminiText>[1]
): Promise<string> {
  const startedAt = Date.now();
  const scan = scanPrompt(prompt);
  const action = await decideAction(scan);
  const model = opts?.model || ctx.model || GEMINI_TEXT_MODEL;

  if (action === "DENY") {
    await logAudit({
      run_id: ctx.runId ?? null,
      agent_key: ctx.agentKey,
      model,
      prompt_preview: prompt.slice(0, 240),
      prompt_tokens: Math.ceil(prompt.length / 4),
      response_tokens: 0,
      injection_detected: scan.injection_detected,
      pii_detected: scan.pii_detected,
      pii_types: scan.pii_types,
      risk_score: scan.risk_score,
      action_taken: action,
      verdict: "BLOCKED",
      latency_ms: Date.now() - startedAt,
      error: "Blocked by Lobster Trap (injection)",
    });
    throw new GeminiError("Blocked by Lobster Trap (injection detected)", 451, "blocked");
  }

  try {
    const text = await geminiText(prompt, opts);
    await logAudit({
      run_id: ctx.runId ?? null,
      agent_key: ctx.agentKey,
      model,
      prompt_preview: prompt.slice(0, 240),
      prompt_tokens: Math.ceil(prompt.length / 4),
      response_tokens: Math.ceil(text.length / 4),
      injection_detected: scan.injection_detected,
      pii_detected: scan.pii_detected,
      pii_types: scan.pii_types,
      risk_score: scan.risk_score,
      action_taken: action,
      verdict: "APPROVED",
      latency_ms: Date.now() - startedAt,
    });
    return text;
  } catch (e) {
    await logAudit({
      run_id: ctx.runId ?? null,
      agent_key: ctx.agentKey,
      model,
      prompt_preview: prompt.slice(0, 240),
      prompt_tokens: Math.ceil(prompt.length / 4),
      response_tokens: 0,
      injection_detected: scan.injection_detected,
      pii_detected: scan.pii_detected,
      pii_types: scan.pii_types,
      risk_score: scan.risk_score,
      action_taken: action,
      verdict: "REVIEW",
      latency_ms: Date.now() - startedAt,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function guardedGeminiJson<T = any>(
  prompt: string,
  schema: Record<string, any>,
  ctx: GuardContext,
  opts?: Parameters<typeof geminiJson>[2]
): Promise<T> {
  const startedAt = Date.now();
  const scan = scanPrompt(prompt);
  const action = await decideAction(scan);
  const model = opts?.model || ctx.model || GEMINI_TEXT_MODEL;

  if (action === "DENY") {
    await logAudit({
      run_id: ctx.runId ?? null,
      agent_key: ctx.agentKey,
      model,
      prompt_preview: prompt.slice(0, 240),
      prompt_tokens: Math.ceil(prompt.length / 4),
      response_tokens: 0,
      injection_detected: scan.injection_detected,
      pii_detected: scan.pii_detected,
      pii_types: scan.pii_types,
      risk_score: scan.risk_score,
      action_taken: action,
      verdict: "BLOCKED",
      latency_ms: Date.now() - startedAt,
      error: "Blocked by Lobster Trap (injection)",
    });
    throw new GeminiError("Blocked by Lobster Trap (injection detected)", 451, "blocked");
  }

  try {
    const out = await geminiJson<T>(prompt, schema, opts);
    const responseSize = JSON.stringify(out).length;
    await logAudit({
      run_id: ctx.runId ?? null,
      agent_key: ctx.agentKey,
      model,
      prompt_preview: prompt.slice(0, 240),
      prompt_tokens: Math.ceil(prompt.length / 4),
      response_tokens: Math.ceil(responseSize / 4),
      injection_detected: scan.injection_detected,
      pii_detected: scan.pii_detected,
      pii_types: scan.pii_types,
      risk_score: scan.risk_score,
      action_taken: action,
      verdict: "APPROVED",
      latency_ms: Date.now() - startedAt,
    });
    return out;
  } catch (e) {
    await logAudit({
      run_id: ctx.runId ?? null,
      agent_key: ctx.agentKey,
      model,
      prompt_preview: prompt.slice(0, 240),
      prompt_tokens: Math.ceil(prompt.length / 4),
      response_tokens: 0,
      injection_detected: scan.injection_detected,
      pii_detected: scan.pii_detected,
      pii_types: scan.pii_types,
      risk_score: scan.risk_score,
      action_taken: action,
      verdict: "REVIEW",
      latency_ms: Date.now() - startedAt,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
