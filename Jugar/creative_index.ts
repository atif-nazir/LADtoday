// ============================================================
// Agent 22 — Quality Gate Agent
// Phase: REVIEW | Model: gemini-2.5-pro | Depends on: 21
// ============================================================
// The editorial quality enforcer. Reads the assembled content
// package from Agent 21 and applies a 25-point quality rubric
// covering depth, accuracy, originality, structure, style
// compliance, SEO adherence, localization, and balance.
// Produces a scored editorial report + actionable fix list.
// Only content scoring ≥75/100 passes to Plagiarism Agent.
// Below 75 → auto-regenerate request back to Rewrite Agent.
// Pro model: editorial judgment requires deep reasoning.
// ============================================================
// pg_cron: SELECT cron.schedule('quality-gate-22-cron',
//   '*/3 * * * *',
//   $$SELECT net.http_post(url:='<EDGE_URL>/agent-quality-gate-22',
//   headers:='{"Authorization":"Bearer <SERVICE_KEY>"}',
//   body:='{"cron":true}')$$);
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import {
  writeAgentOutput,
  readAgentOutput,
  patchAgentState,
  loadRun,
} from "../_shared/pipeline.ts";

const AGENT_KEY = "creative";
const AGENT_NAME = "Creative Agent";
const MODEL      = "gemini-2.5-pro";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface RubricCriteria {
  id:           string;
  category:     "depth" | "accuracy" | "originality" | "structure" | "style" | "seo" | "localization" | "balance" | "readability" | "completeness";
  name:         string;
  description:  string;
  weight:       number;     // out of 100 total
  score:        number;     // 0-weight
  max_score:    number;
  grade:        "A" | "B" | "C" | "D" | "F";
  notes:        string;
  fix_required: boolean;
  fix_action:   string;
}

interface QualityIssue {
  severity:    "critical" | "major" | "minor";
  category:    string;
  description: string;
  location:    string;     // where in the article
  fix:         string;
  auto_fixable: boolean;
}

interface QualityGateOutput {
  // Scores
  total_score:         number;    // 0-100
  pass_threshold:      number;    // 75
  passed:              boolean;
  grade:               "A" | "B" | "C" | "D" | "F";
  category_scores:     Record<string, number>;

  // Rubric detail
  rubric:              RubricCriteria[];

  // Issues
  critical_issues:     QualityIssue[];
  major_issues:        QualityIssue[];
  minor_issues:        QualityIssue[];
  total_issues:        number;

  // Editorial report
  editorial_summary:   string;     // 3-paragraph editorial assessment
  strengths:           string[];
  weaknesses:          string[];
  fix_list:            string[];   // Ordered list of fixes for Rewrite Agent
  auto_fix_possible:   boolean;    // Can be auto-fixed without human

  // Pipeline routing
  next_action:         "proceed" | "auto_regenerate" | "human_review" | "reject";
  regenerate_brief:    string;     // If auto_regenerate: specific brief for Rewrite Agent
  human_review_reason: string;     // If human_review
  rejection_reason:    string;     // If reject

  // Metadata
  word_count_check:    string;
  fact_density_check:  string;
  balance_check:       string;
  style_adherence:     string;
}

// ─── Load admin quality thresholds from DB ────────────────────────────────────

async function loadQualityConfig(): Promise<{
  pass_threshold: number;
  min_word_count: number;
  max_word_count: number;
  auto_regen_threshold: number;
}> {
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["quality_pass_threshold", "quality_min_words", "quality_max_words", "quality_auto_regen_threshold"]);

    const m: Record<string, string> = {};
    for (const row of data || []) m[row.key] = row.value;

    return {
      pass_threshold:       parseInt(m.quality_pass_threshold       || "75"),
      min_word_count:       parseInt(m.quality_min_words            || "600"),
      max_word_count:       parseInt(m.quality_max_words            || "2000"),
      auto_regen_threshold: parseInt(m.quality_auto_regen_threshold || "50"),
    };
  } catch {
    return { pass_threshold: 75, min_word_count: 600, max_word_count: 2000, auto_regen_threshold: 50 };
  }
}

// ─── Core Quality Evaluation Workflow ─────────────────────────────────────────

async function evaluateQuality(
  topic: string,
  contentPkg: any,
  intelOutput: any,
  biasOutput: any,
  factCheckerOutput: any,
  toneProfile: any,
  qConfig: ReturnType<typeof loadQualityConfig> extends Promise<infer T> ? T : never,
): Promise<QualityGateOutput> {

  // Extract what we need from the content package
  const articleHtml    = contentPkg?.article_html || "";
  const articlePlain   = articleHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount      = contentPkg?.word_count    || articlePlain.split(/\s+/).length;
  const title          = contentPkg?.ai_title      || "";
  const metaDesc       = contentPkg?.meta_description || "";
  const sections       = contentPkg?.sections        || [];
  const tags           = contentPkg?.ai_tags          || [];
  const factsUsed      = contentPkg?.facts_used       || 0;
  const quotesUsed     = contentPkg?.quotes_used      || 0;
  const internalLinks  = (contentPkg?.internal_links  || []).length;
  const faqCount       = (contentPkg?.faq_section     || []).length;
  const hasSocial      = !!(contentPkg?.social_caption_fb || contentPkg?.social_caption_tw);
  const hasSchema      = !!(contentPkg?.schema_head_html && contentPkg?.schema_head_html.length > 100);
  const readyFlags     = contentPkg?.quality_gates    || [];
  const blockers       = contentPkg?.blockers          || 0;

  // Intel quality signals
  const intelConfidence    = intelOutput?.confidence_score   || 0.7;
  const topicComplexity    = intelOutput?.topic_complexity    || "moderate";
  const viralityScore      = intelOutput?.virality_score      || 5;

  // Bias signals
  const biasScore       = biasOutput?.overall_bias_score    || 0;
  const complianceStatus = biasOutput?.compliance_status    || "pass";

  // Fact checker signals
  const approvedFacts   = (factCheckerOutput?.approved_facts  || []).length;
  const removedFacts    = (factCheckerOutput?.removed_facts   || []).length;
  const overallConf     = factCheckerOutput?.overall_confidence || 0.7;
  const riskLevel       = factCheckerOutput?.risk_level        || "low";

  // Style guide
  const styleAdherence  = contentPkg?.style_guide_adherence   || "Not assessed";
  const formality       = toneProfile?.style_guide?.formality_score || 6;

  const articleSample   = articlePlain.slice(0, 3000);

  const prompt = `You are a senior editorial director for LADtoday, Pakistan's leading digital media platform.
Apply the following 25-point rubric to assess content quality. Be DISCRIMINATING — not everything is excellent.

━━━ ARTICLE TO ASSESS ━━━
TITLE: "${title}"
META: "${metaDesc}"
WORD COUNT: ${wordCount} (min: ${qConfig.min_word_count}, max: ${qConfig.max_word_count})
SECTIONS: ${sections.length}
FACTS USED: ${factsUsed} (removed: ${removedFacts})
QUOTES USED: ${quotesUsed}
INTERNAL LINKS: ${internalLinks}
FAQ ITEMS: ${faqCount}
SOCIAL CAPTIONS: ${hasSocial ? "✓" : "✗"}
SCHEMA MARKUP: ${hasSchema ? "✓" : "✗"}
EXISTING BLOCKERS: ${blockers}
BIAS SCORE: ${biasScore.toFixed(2)} (0=neutral, 1=biased)
COMPLIANCE: ${complianceStatus}
FACT CONFIDENCE: ${overallConf.toFixed(2)}
RISK LEVEL: ${riskLevel}
STYLE ADHERENCE SELF-REPORT: "${styleAdherence}"
VIRALITY POTENTIAL: ${viralityScore}/10

ARTICLE SAMPLE:
${articleSample}

━━━ 25-POINT QUALITY RUBRIC ━━━

Score each criteria (0 to max_score). Be honest. Use the ACTUAL article sample as evidence.

DEPTH (25 points total):
1. [depth_insight] Insight depth: Does it offer analysis beyond surface reporting? (0-8)
2. [depth_data] Data richness: Are there specific stats, dates, figures? (0-7)
3. [depth_expert] Expert perspective: Are credible voices or expert views present? (0-5)
4. [depth_context] Context: Does it explain WHY this matters? (0-5)

ACCURACY (20 points total):
5. [accuracy_facts] Fact accuracy: No incorrect claims detected? (0-10)
6. [accuracy_dates] Date/figure precision: Numbers and dates look correct? (0-5)
7. [accuracy_attribution] Attribution: Are claims properly attributed? (0-5)

ORIGINALITY (10 points total):
8. [orig_angle] Unique angle: Does it bring something competitors don't? (0-5)
9. [orig_voice] Original voice: Does it not read like generic AI? (0-5)

STRUCTURE (15 points total):
10. [struct_flow] Narrative flow: Does the article read logically? (0-6)
11. [struct_headings] Heading quality: Do H2s entice reading? (0-5)
12. [struct_hook] Opening hook: Does the first paragraph compel reading? (0-4)

STYLE (10 points total):
13. [style_voice] Brand voice: Matches LADtoday's style guidelines? (0-5)
14. [style_tone] Tone consistency: Consistent throughout? (0-5)

SEO (10 points total):
15. [seo_keyword] Keyword placement: Primary keyword in first paragraph? (0-4)
16. [seo_meta] Meta description: Compelling, 140-155 chars? (0-3)
17. [seo_structure] H2/H3 structure: Keyword in at least one H2? (0-3)

LOCALIZATION (5 points total):
18. [local_pakistan] Pakistan specificity: Uses local examples, PKR, local bodies? (0-5)

BALANCE (5 points total):
19. [balance_perspectives] Multiple perspectives: Not one-sided? (0-5)

For each criterion, determine:
- score (0 to max)
- grade: A (90%+), B (70-89%), C (50-69%), D (30-49%), F (<30%)
- notes (specific observation from the actual article)
- fix_required: bool
- fix_action: what SPECIFICALLY needs to change

Then identify ISSUES:
- Critical: Would cause serious credibility or legal problems if published
- Major: Significantly hurts reader experience or SEO
- Minor: Improvements that would help but don't block publication

Finally, determine NEXT ACTION:
- "proceed": score ≥ ${qConfig.pass_threshold} AND no critical issues → send to Plagiarism Agent
- "auto_regenerate": score ${qConfig.auto_regen_threshold}-${qConfig.pass_threshold - 1} OR fixable major issues → re-send to Rewrite Agent
- "human_review": critical bias/accuracy issue, ambiguous legal content → flag for editor
- "reject": score < ${qConfig.auto_regen_threshold} AND unfixable → start pipeline from scratch

Return JSON:
{
  "total_score": number (0-100),
  "grade": "A|B|C|D|F",
  "category_scores": {
    "depth": number, "accuracy": number, "originality": number,
    "structure": number, "style": number, "seo": number,
    "localization": number, "balance": number
  },
  "rubric": [
    {
      "id": "string",
      "category": "string",
      "name": "string",
      "description": "string",
      "weight": number,
      "score": number,
      "max_score": number,
      "grade": "A|B|C|D|F",
      "notes": "string (specific evidence from article)",
      "fix_required": boolean,
      "fix_action": "string"
    }
  ],
  "critical_issues": [
    { "severity": "critical", "category": "string", "description": "string", "location": "string", "fix": "string", "auto_fixable": boolean }
  ],
  "major_issues": [
    { "severity": "major", "category": "string", "description": "string", "location": "string", "fix": "string", "auto_fixable": boolean }
  ],
  "minor_issues": [
    { "severity": "minor", "category": "string", "description": "string", "location": "string", "fix": "string", "auto_fixable": boolean }
  ],
  "editorial_summary": "string (3 paragraphs: overall assessment, strengths, improvement areas)",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "fix_list": ["string (ordered: critical first, then major, then minor)"],
  "auto_fix_possible": boolean,
  "next_action": "proceed|auto_regenerate|human_review|reject",
  "regenerate_brief": "string (specific brief for Rewrite Agent if auto_regenerate)",
  "human_review_reason": "string (if human_review)",
  "rejection_reason": "string (if reject)"
}`;

  const schema = {
    type: "object",
    properties: {
      total_score: { type: "number" },
      grade: { type: "string" },
      category_scores: { type: "object" },
      rubric: { type: "array", items: { type: "object" } },
      critical_issues: { type: "array", items: { type: "object" } },
      major_issues: { type: "array", items: { type: "object" } },
      minor_issues: { type: "array", items: { type: "object" } },
      editorial_summary: { type: "string" },
      strengths: { type: "array", items: { type: "string" } },
      weaknesses: { type: "array", items: { type: "string" } },
      fix_list: { type: "array", items: { type: "string" } },
      auto_fix_possible: { type: "boolean" },
      next_action: { type: "string" },
      regenerate_brief: { type: "string" },
      human_review_reason: { type: "string" },
      rejection_reason: { type: "string" },
    },
  };

  const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.3, maxOutputTokens: 6144 });

  const score        = raw.total_score || 0;
  const nextAction   = raw.next_action || (score >= qConfig.pass_threshold ? "proceed" : score >= qConfig.auto_regen_threshold ? "auto_regenerate" : "reject");
  const criticals    = raw.critical_issues || [];
  const majors       = raw.major_issues    || [];
  const minors       = raw.minor_issues    || [];

  return {
    total_score:         score,
    pass_threshold:      qConfig.pass_threshold,
    passed:              score >= qConfig.pass_threshold && criticals.length === 0,
    grade:               raw.grade || (score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F"),
    category_scores:     raw.category_scores || {},
    rubric:              raw.rubric          || [],
    critical_issues:     criticals,
    major_issues:        majors,
    minor_issues:        minors,
    total_issues:        criticals.length + majors.length + minors.length,
    editorial_summary:   raw.editorial_summary   || "",
    strengths:           raw.strengths            || [],
    weaknesses:          raw.weaknesses           || [],
    fix_list:            raw.fix_list             || [],
    auto_fix_possible:   raw.auto_fix_possible    ?? false,
    next_action:         nextAction as any,
    regenerate_brief:    raw.regenerate_brief     || "",
    human_review_reason: raw.human_review_reason  || "",
    rejection_reason:    raw.rejection_reason      || "",
    word_count_check:    `${wordCount} words — ${wordCount >= qConfig.min_word_count ? "✓" : "✗ BELOW MINIMUM"}`,
    fact_density_check:  `${factsUsed} verified facts used — ${riskLevel} risk`,
    balance_check:       `bias=${biasScore.toFixed(2)}, compliance=${complianceStatus}`,
    style_adherence:     styleAdherence,
  };
}

// ─── Handle auto-regenerate: re-queue to Rewrite Agent ───────────────────────

async function triggerRegenerate(run_id: string, regenerateBrief: string): Promise<void> {
  try {
    // Reset rewrite-15 and downstream agents so they re-run
    const agentsToReset = [
      "rewrite-15", "readability-18", "internal-linker-19",
      "schema-markup-20", "content-assembler-21", AGENT_KEY,
    ];

    const resetStates: Record<string, any> = {};
    for (const key of agentsToReset) {
      resetStates[key] = { status: "pending", regenerate_brief: regenerateBrief };
    }

    await supabase.from("pipeline_runs").update({
      agent_states: resetStates,
      status: "regenerating",
    }).eq("id", run_id);

    await insertLog("ai", AGENT_KEY, "Auto-regenerate triggered",
      `run=${run_id}, brief="${regenerateBrief.slice(0, 100)}"`, { run_id });
  } catch (err) {
    console.error(`[${AGENT_NAME}] Failed to trigger regenerate:`, err);
  }
}

// ─── Cron ─────────────────────────────────────────────────────────────────────

async function cronProcessPending(): Promise<{ checked: number; errors: number }> {
  const { data: runs } = await supabase
    .from("pipeline_runs")
    .select("id, topic, agent_states")
    .in("status", ["running", "assembled"])
    .limit(3);  // QG is expensive — limit concurrency

  let checked = 0, errors = 0;

  for (const run of runs || []) {
    const s = run.agent_states || {};
    const depReady    = s["content-assembler-21"]?.status === "completed";
    const selfNotDone = s[AGENT_KEY]?.status !== "completed";
    if (!depReady || !selfNotDone) continue;

    try {
      await patchAgentState(run.id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });
      const [contentPkg, intel, bias, factChecker, tone] = await Promise.all([
        readAgentOutput(run.id, "content-assembler-21"),
        readAgentOutput(run.id, "intelligence-02"),
        readAgentOutput(run.id, "bias-detector-09"),
        readAgentOutput(run.id, "fact-checker-08"),
        readAgentOutput(run.id, "tone-calibrator-12"),
      ]);
      const qConfig = await loadQualityConfig();
      const start   = Date.now();
      const result  = await evaluateQuality(run.topic || "", contentPkg, intel, bias, factChecker, tone, qConfig);

      await writeAgentOutput(run.id, AGENT_KEY, result, { duration_ms: Date.now() - start, status: "completed" });
      await patchAgentState(run.id, AGENT_KEY, {
        status: "completed", finished_at: new Date().toISOString(),
        score: result.total_score, grade: result.grade, next_action: result.next_action,
      });

      // Route based on decision
      if (result.next_action === "auto_regenerate") {
        await triggerRegenerate(run.id, result.regenerate_brief);
      } else if (result.next_action === "human_review") {
        await supabase.from("pipeline_runs").update({ status: "needs_human_review" }).eq("id", run.id);
      } else if (result.next_action === "reject") {
        await supabase.from("pipeline_runs").update({ status: "rejected", rejection_reason: result.rejection_reason }).eq("id", run.id);
      }
      // "proceed" → stays as "assembled", Plagiarism Agent picks it up

      checked++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      await patchAgentState(run.id, AGENT_KEY, { status: "failed", finished_at: new Date().toISOString(), error: msg });
    }
  }
  return { checked, errors };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return false;
  const t = h.replace("Bearer ", "");
  if (t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try { if (JSON.parse(atob(t.split(".")[1])).role === "service_role") return true; } catch {}
  return false;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    if (!await verifyServiceOrAdmin(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));

    if (body.cron === true) {
      const r = await cronProcessPending();
      await insertLog("ai", AGENT_KEY, `${AGENT_NAME} cron`, `checked=${r.checked}, errors=${r.errors}`);
      return new Response(JSON.stringify({ ok: true, mode: "cron", ...r }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { run_id } = body;
    if (!run_id) {
      return new Response(JSON.stringify({ error: "run_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const run = await loadRun(run_id);
    console.log(`[${AGENT_NAME}] Starting run=${run_id} topic="${run.topic}"`);
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `run=${run_id}`, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const [contentPkg, intel, bias, factChecker, tone] = await Promise.all([
      readAgentOutput(run_id, "content-assembler-21"),
      readAgentOutput(run_id, "intelligence-02"),
      readAgentOutput(run_id, "bias-detector-09"),
      readAgentOutput(run_id, "fact-checker-08"),
      readAgentOutput(run_id, "tone-calibrator-12"),
    ]);

    if (!contentPkg) throw new Error("content-assembler-21 output not found — must complete first");

    const qConfig    = await loadQualityConfig();
    const result     = await evaluateQuality(run.topic || "", contentPkg, intel, bias, factChecker, tone, qConfig);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, {
      tokens: Math.ceil(JSON.stringify(result).length / 4),
      duration_ms: durationMs, status: "completed",
    });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed", finished_at: new Date().toISOString(),
      score: result.total_score, grade: result.grade,
      passed: result.passed, next_action: result.next_action,
    });

    // Route pipeline
    if (result.next_action === "auto_regenerate") {
      await triggerRegenerate(run_id, result.regenerate_brief);
      await insertLog("warning", AGENT_KEY, "Quality gate: auto-regenerate", `score=${result.total_score}, brief="${result.regenerate_brief.slice(0, 80)}"`, { run_id });
    } else if (result.next_action === "human_review") {
      await supabase.from("pipeline_runs").update({ status: "needs_human_review" }).eq("id", run_id);
      await insertLog("warning", AGENT_KEY, "Quality gate: human review needed", result.human_review_reason, { run_id });
    } else if (result.next_action === "reject") {
      await supabase.from("pipeline_runs").update({ status: "rejected" }).eq("id", run_id);
      await insertLog("error", AGENT_KEY, "Quality gate: REJECTED", result.rejection_reason, { run_id });
    } else {
      await insertLog("ai", AGENT_KEY, "Quality gate: PASSED → proceeding",
        `score=${result.total_score}/${qConfig.pass_threshold}, grade=${result.grade}`, { run_id });
    }

    console.log(`[${AGENT_NAME}] ✅ ${result.grade} — ${result.total_score}/100 — ${result.next_action} — ${durationMs}ms`);

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      total_score: result.total_score,
      pass_threshold: result.pass_threshold,
      passed: result.passed,
      grade: result.grade,
      next_action: result.next_action,
      critical_issues: result.critical_issues.length,
      major_issues: result.major_issues.length,
      duration_ms: durationMs,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg    = err instanceof Error ? err.message : String(err);
    const status = err instanceof GeminiError ? (err as GeminiError).status ?? 500 : 500;
    console.error(`[${AGENT_NAME}] ❌ Failed:`, msg);
    try {
      const b = await req.clone().json().catch(() => ({}));
      if (b.run_id) {
        await patchAgentState(b.run_id, AGENT_KEY, { status: "failed", finished_at: new Date().toISOString(), error: msg });
        await writeAgentOutput(b.run_id, AGENT_KEY, { error: msg }, { status: "failed", error: msg, duration_ms: Date.now() - startedAt });
      }
    } catch { /* best effort */ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
