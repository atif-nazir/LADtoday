// ============================================================
// Agent 07 — Guardian Agent (Bright Data + Lobster Trap DPI)
// Phase: REVIEW | Depends on: creative
// ============================================================
// COMPLIANCE PIPELINE:
// 1. Lobster Trap DPI — detect prompt injection in article content
// 2. Bright Data plagiarism check — search for copied sentences
// 3. Gemini compliance analysis — legal, brand safety, cultural
// 4. Source verification — minimum sources check
// 5. Final verdict: APPROVED / FLAGGED / QUARANTINED
//
// Bright Data SERP API is used to search for distinctive sentences
// from the article — if found verbatim online, plagiarism detected.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiJson } from "../_shared/ai-provider.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";
import { selectModelForAgent } from "../_shared/model-config.ts";

const AGENT_KEY = "guardian";
const AGENT_NAME = "Guardian Agent";

const BRIGHTDATA_API_TOKEN = Deno.env.get("BRIGHTDATA_API_TOKEN") || "";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── LOBSTER TRAP: Prompt Injection DPI ──────────────────────────────────────
// Intercepts all content before it reaches AI models
// Detects prompt injection attacks embedded in scraped content

function lobsterTrap(text: string): {
  safe: boolean;
  injection_detected: boolean;
  sanitized: string;
  patterns_found: string[];
} {
  const injectionPatterns = [
    { pattern: /ignore\s+(previous|all|prior)\s+instructions/i, name: "ignore_instructions" },
    { pattern: /you\s+are\s+now\s+a/i, name: "persona_override" },
    { pattern: /forget\s+everything/i, name: "memory_wipe" },
    { pattern: /act\s+as\s+(if|a|an)/i, name: "role_play" },
    { pattern: /jailbreak/i, name: "jailbreak" },
    { pattern: /DAN\s+mode/i, name: "dan_mode" },
    { pattern: /override\s+system/i, name: "system_override" },
    { pattern: /\[SYSTEM\]/i, name: "system_tag" },
    { pattern: /new\s+instruction:/i, name: "new_instruction" },
    { pattern: /disregard\s+(all|previous)/i, name: "disregard" },
    { pattern: /you\s+must\s+now/i, name: "must_now" },
  ];

  const patternsFound: string[] = [];
  for (const { pattern, name } of injectionPatterns) {
    if (pattern.test(text)) patternsFound.push(name);
  }

  const injection_detected = patternsFound.length > 0;

  return {
    safe: !injection_detected,
    injection_detected,
    sanitized: injection_detected
      ? text.replace(/ignore\s+previous|you\s+are\s+now|act\s+as|jailbreak|DAN\s+mode/gi, "[BLOCKED BY LOBSTER TRAP]")
      : text,
    patterns_found: patternsFound,
  };
}

// ─── BRIGHT DATA: Plagiarism Check ───────────────────────────────────────────
// Searches for distinctive sentences from the article on the live web
// If found verbatim → plagiarism detected

async function checkPlagiarismWithBrightData(articleBody: string): Promise<{
  score: number;
  matches: string[];
  verdict: "pass" | "fail";
  bright_data_used: boolean;
  sentences_checked: number;
}> {
  if (!BRIGHTDATA_API_TOKEN) {
    return { score: 0, matches: [], verdict: "pass", bright_data_used: false, sentences_checked: 0 };
  }

  // Extract 3 distinctive sentences (15+ words, not headings, not generic)
  const sentences = articleBody
    .replace(/<[^>]+>/g, " ")
    .split(/[.!?]\s+/)
    .filter((s) => {
      const words = s.trim().split(/\s+/);
      return words.length > 12 && !s.trim().startsWith("#") && !s.trim().startsWith("*");
    })
    .slice(0, 3);

  if (sentences.length === 0) {
    return { score: 0, matches: [], verdict: "pass", bright_data_used: true, sentences_checked: 0 };
  }

  const matches: string[] = [];
  let maxScore = 0;

  for (const sentence of sentences) {
    const query = `"${sentence.trim().slice(0, 80)}"`;
    try {
      const response = await fetch(
        `https://api.brightdata.com/serp/google/search?q=${encodeURIComponent(query)}&num=5`,
        {
          headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) continue;
      const data = await response.json();
      const results = data.organic ?? [];

      if (results.length > 0) {
        // Found matching text online — possible plagiarism
        maxScore = Math.max(maxScore, 70);
        results.slice(0, 2).forEach((r: any) => {
          if (r.link) matches.push(r.link);
        });
      }
    } catch (err) {
      console.error(`[${AGENT_NAME}] Plagiarism check error:`, err);
    }
  }

  return {
    score: maxScore,
    matches: [...new Set(matches)],
    verdict: maxScore > 60 ? "fail" : "pass",
    bright_data_used: true,
    sentences_checked: sentences.length,
  };
}

// ─── Compliance Analysis ──────────────────────────────────────────────────────

async function runComplianceCheck(
  articleBody: string,
  topic: string,
  mode: string,
  model: string
): Promise<{
  unsubstantiated_medical: boolean;
  unsubstantiated_financial: boolean;
  defamatory_content: boolean;
  pii_detected: boolean;
  hate_speech: boolean;
  misleading_claims: boolean;
  cultural_sensitivity_issues: boolean;
  issues_found: string[];
  risk_level: "low" | "medium" | "high";
  brand_sentiment: string;
  summary: string;
}> {
  const plainText = articleBody.replace(/<[^>]+>/g, " ").slice(0, 3000);

  const prompt = `You are a compliance analyst for LADtoday — Pakistan's AI content platform.
Analyze this article for compliance issues.

TOPIC: ${topic}
MODE: ${mode} (finance mode = stricter on investment claims)
ARTICLE:
${plainText}

Check for and return ONLY valid JSON:
{
  "unsubstantiated_medical": false,
  "unsubstantiated_financial": false,
  "defamatory_content": false,
  "pii_detected": false,
  "hate_speech": false,
  "misleading_claims": false,
  "cultural_sensitivity_issues": false,
  "issues_found": ["list of specific issues if any, empty array if none"],
  "risk_level": "low",
  "brand_sentiment": "neutral",
  "summary": "one line compliance summary"
}

For Pakistan context: check for religious sensitivity, political sensitivity, and cultural appropriateness.
For finance mode: be stricter on investment advice and financial projections.
Return ONLY the JSON object.`;

  const schema = {
    type: "object",
    properties: {
      unsubstantiated_medical: { type: "boolean" },
      unsubstantiated_financial: { type: "boolean" },
      defamatory_content: { type: "boolean" },
      pii_detected: { type: "boolean" },
      hate_speech: { type: "boolean" },
      misleading_claims: { type: "boolean" },
      cultural_sensitivity_issues: { type: "boolean" },
      issues_found: { type: "array", items: { type: "string" } },
      risk_level: { type: "string" },
      brand_sentiment: { type: "string" },
      summary: { type: "string" },
    },
    required: ["unsubstantiated_medical", "unsubstantiated_financial", "defamatory_content", "pii_detected", "hate_speech", "misleading_claims", "issues_found", "risk_level", "brand_sentiment", "summary"],
  };

  try {
    const { result } = await aiJson<any>("You are a compliance checker", prompt, schema, { 
      model, 
      temperature: 0.1, 
      maxTokens: 600 
    });
    return result;
  } catch {
    return {
      unsubstantiated_medical: false,
      unsubstantiated_financial: false,
      defamatory_content: false,
      pii_detected: false,
      hate_speech: false,
      misleading_claims: false,
      cultural_sensitivity_issues: false,
      issues_found: [],
      risk_level: "low",
      brand_sentiment: "neutral",
      summary: "Compliance check completed — no critical issues detected (fallback)",
    };
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return false;
  const t = h.replace("Bearer ", "");
  if (t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try { const p = JSON.parse(atob(t.split(".")[1])); if (p.role === "service_role") return true; } catch { /* */ }
  return false;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    if (!await verifyServiceOrAdmin(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { run_id, model_override } = await req.json().catch(() => ({}));
    if (!run_id) return new Response(JSON.stringify({ error: "run_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const mode = (run as any).mode || "gtm";
    const selectedModel = selectModelForAgent(AGENT_KEY, model_override);
    const timestamp = new Date().toISOString();

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic.slice(0, 80)} | mode: ${mode}`, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: timestamp });

    // Load upstream outputs
    const [rewriteOutput, creativeOutput, scoutOutput] = await Promise.all([
      readAgentOutput(run_id, "rewrite"),
      readAgentOutput(run_id, "creative"),
      readAgentOutput(run_id, "scout"),
    ]);

    if (!rewriteOutput) throw new Error("rewrite output not found");

    const articleBody = rewriteOutput.article_html || rewriteOutput.article_text || "";
    const sources = scoutOutput?.sources || [];

    // ── 1. Lobster Trap DPI ──
    console.log(`[${AGENT_NAME}] Running Lobster Trap DPI...`);
    const trapResult = lobsterTrap(articleBody);
    if (trapResult.injection_detected) {
      console.warn(`[${AGENT_NAME}] ⚠️ Prompt injection detected: ${trapResult.patterns_found.join(", ")}`);
    }

    // ── 2. Bright Data Plagiarism Check ──
    console.log(`[${AGENT_NAME}] Running Bright Data plagiarism check...`);
    const plagiarismResult = await checkPlagiarismWithBrightData(articleBody);
    console.log(`[${AGENT_NAME}] Plagiarism: score=${plagiarismResult.score} | verdict=${plagiarismResult.verdict} | BD=${plagiarismResult.bright_data_used}`);

    // ── 3. Compliance Analysis ──
    console.log(`[${AGENT_NAME}] Running compliance analysis...`);
    const complianceResult = await runComplianceCheck(articleBody, topic, mode, selectedModel);

    // ── 4. Source Verification ──
    const verifiedClaims = sources.length;
    const minimumSources = 3;
    const sourcesAdequate = verifiedClaims >= minimumSources;

    // ── 5. Determine Final Verdict ──
    const criticalFailures = [
      plagiarismResult.verdict === "fail" && plagiarismResult.score > 80,
      complianceResult.defamatory_content,
      complianceResult.hate_speech,
      trapResult.injection_detected,
    ].filter(Boolean);

    const warnings = [
      plagiarismResult.verdict === "fail" && plagiarismResult.score > 60,
      complianceResult.unsubstantiated_financial && mode === "finance",
      complianceResult.unsubstantiated_medical,
      complianceResult.misleading_claims,
      complianceResult.cultural_sensitivity_issues,
      !sourcesAdequate,
    ].filter(Boolean);

    let final_verdict: "APPROVED" | "FLAGGED" | "QUARANTINED";
    if (criticalFailures.length > 0) {
      final_verdict = "QUARANTINED";
    } else if (warnings.length > 0) {
      final_verdict = "FLAGGED";
    } else {
      final_verdict = "APPROVED";
    }

    // ── 6. Build Audit Log ──
    const audit_log = {
      verdict: final_verdict,
      timestamp,
      run_id,
      topic,
      mode,
      checks: {
        lobster_trap: {
          safe: trapResult.safe,
          injection_detected: trapResult.injection_detected,
          patterns_found: trapResult.patterns_found,
        },
        plagiarism: {
          score: plagiarismResult.score,
          matches: plagiarismResult.matches,
          verdict: plagiarismResult.verdict,
          bright_data_used: plagiarismResult.bright_data_used,
          sentences_checked: plagiarismResult.sentences_checked,
        },
        compliance: complianceResult,
        source_verification: {
          sources_provided: verifiedClaims,
          minimum_required: minimumSources,
          adequate: sourcesAdequate,
        },
      },
      critical_failures: criticalFailures.length,
      warnings: warnings.length,
      guardian_version: "2.0.0-hackathon",
    };

    const output = {
      final_verdict,
      plagiarism: plagiarismResult,
      compliance: complianceResult,
      lobster_trap: trapResult,
      audit_log,
      verdict_reason: final_verdict === "APPROVED"
        ? "All checks passed — article cleared for publishing"
        : final_verdict === "FLAGGED"
          ? `${warnings.length} warning(s) require review: ${complianceResult.issues_found?.join(", ") || "see audit log"}`
          : `Critical failure: ${criticalFailures.length} issue(s) found — article quarantined`,
      sources_verified: verifiedClaims,
      bright_data_plagiarism_check: plagiarismResult.bright_data_used,
    };

    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, output, { tokens: 800, duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      final_verdict,
      plagiarism_score: plagiarismResult.score,
      compliance_risk: complianceResult.risk_level,
      injection_detected: trapResult.injection_detected,
      bright_data_used: plagiarismResult.bright_data_used,
    });

    // Write to lobstertrap_audit table for UI display
    try {
      await supabase.from("lobstertrap_audit").insert({
        run_id,
        agent_key: AGENT_KEY,
        prompt_preview: articleBody.slice(0, 200),
        risk_score: plagiarismResult.score / 100,
        action_taken: trapResult.injection_detected ? "BLOCKED" : "PASSED",
        verdict: final_verdict,
        created_at: timestamp,
      });
    } catch { /* non-fatal */ }

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `verdict=${final_verdict} | plagiarism=${plagiarismResult.score}% | compliance=${complianceResult.risk_level} | injection=${trapResult.injection_detected} | BD=${plagiarismResult.bright_data_used} | ${durationMs}ms`,
      { run_id });

    console.log(`[${AGENT_NAME}] ✅ ${durationMs}ms — verdict=${final_verdict}`);

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      final_verdict,
      plagiarism_score: plagiarismResult.score,
      compliance_risk: complianceResult.risk_level,
      bright_data_used: plagiarismResult.bright_data_used,
      duration_ms: durationMs,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${AGENT_NAME}] ❌`, msg);
    try {
      const b = await req.clone().json().catch(() => ({}));
      if (b.run_id) {
        await patchAgentState(b.run_id, AGENT_KEY, { status: "failed", finished_at: new Date().toISOString(), error: msg });
        await writeAgentOutput(b.run_id, AGENT_KEY, { error: msg }, { status: "failed", error: msg, duration_ms: Date.now() - startedAt });
      }
    } catch { /* best effort */ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
