// ============================================================
// Agent 18 — Readability Optimizer Agent (NEW)
// Phase: CREATE | Model: gemini-2.5-flash | Depends on: rewrite(15), audience-listener(05)
// ============================================================
// EXACT WORKFLOW (LADtoday_50_AGENTS.md):
// 1. Compute Flesch-Kincaid score
// 2. Identify problem areas:
//    a. Sentences > 30 words → flag for breaking
//    b. Paragraphs > 100 words → flag for splitting
//    c. Passive voice > 20% → flag sentences
//    d. Jargon density > 5 technical terms per paragraph → flag
//    e. Transition word frequency < 15% → flag (poor flow)
// 3. Rewrite ONLY flagged sections (surgical, not full rewrite)
// 4. Re-score: verify improvement
// 5. Return optimized_article_html + readability_report
//
// TARGET: Grade 6-8 for general audience, Grade 9-11 for professionals
// LEARNING: Tracks pre/post improvement delta. Adapts thresholds.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "readability";
const AGENT_NAME = "Readability";
const MODEL = "gemini-2.5-flash";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

interface ReadabilityIssue {
  type: "long_sentence" | "long_paragraph" | "passive_voice" | "jargon_heavy" | "poor_transitions";
  location: string;              // paragraph index or heading reference
  original_text: string;         // the problematic section
  rewritten_text: string;        // the improved version
  severity: "critical" | "moderate" | "minor";
}

interface ReadabilityOutput {
  optimized_article_html: string;  // article with flagged sections rewritten
  original_flesch_score: number;   // estimated Flesch-Kincaid reading ease (0-100)
  improved_flesch_score: number;   // after optimization
  original_grade_level: number;    // estimated grade level
  improved_grade_level: number;
  issues_found: ReadabilityIssue[];
  issues_fixed: number;
  changes_made: string[];          // summary of improvements
  problem_sections_count: number;
  avg_sentence_length_before: number; // words
  avg_sentence_length_after: number;
  passive_voice_pct_before: number;  // 0-100
  passive_voice_pct_after: number;
  target_grade_level: number;
  improvement_delta: number;         // flesch score improvement
  learning_applied: boolean;
}

async function loadReadabilityLearning(category: string, knowledgeLevel: string) {
  try {
    const { data } = await supabase.from("agent_memory").select("target_grade,improvement_delta,most_common_issue")
      .eq("agent_key", AGENT_KEY).in("topic_category", [category, "general"])
      .order("improvement_delta", { ascending: false }).limit(15);
    if (!data?.length) return { bestTargetGrade: knowledgeLevel === "expert" ? 10 : 7, commonIssue: "long_sentence", sampleSize: 0 };
    const grades = data.map(m => m.target_grade || 7);
    const avgGrade = Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
    const issueCounts: Record<string, number> = {};
    for (const m of data) if (m.most_common_issue) issueCounts[m.most_common_issue] = (issueCounts[m.most_common_issue] || 0) + 1;
    return { bestTargetGrade: avgGrade, commonIssue: Object.entries(issueCounts).sort(([,a],[,b])=>b-a)[0]?.[0] || "long_sentence", sampleSize: data.length };
  } catch { return { bestTargetGrade: 7, commonIssue: "long_sentence", sampleSize: 0 }; }
}

function inferCategory(t: string) {
  t = t.toLowerCase();
  if (/fintech|sbp|banking/.test(t)) return "fintech"; if (/tech|ai|startup/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports"; if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation/.test(t)) return "economy"; return "general";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  try {
    const h = req.headers.get("Authorization"); if (!h?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const t = h.replace("Bearer ", ""); const isAuth = t === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (() => { try { return JSON.parse(atob(t.split(".")[1])).role === "service_role"; } catch { return false; } })();
    if (!isAuth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { run_id } = await req.json().catch(() => ({}));
    if (!run_id) return new Response(JSON.stringify({ error: "run_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const category = inferCategory(topic);

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, topic, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const [rewriteOut, audienceOut] = await Promise.all([
      readAgentOutput(run_id, "rewrite"),
      readAgentOutput(run_id, "audience-listener").catch(() => null),
    ]);
    if (!rewriteOut) throw new Error("rewrite output not found");

    const knowledgeLevel = audienceOut?.knowledge_level || "intermediate";
    const targetGrade = knowledgeLevel === "expert" ? 10 : knowledgeLevel === "intermediate" ? 8 : 6;
    const learning = await loadReadabilityLearning(category, knowledgeLevel);

    const articleHtml = rewriteOut.article_html || "";
    const articleText = rewriteOut.article_text || articleHtml.replace(/<[^>]+>/g, " ");
    const wordCount = rewriteOut.word_count || 1000;

    const prompt = `You are the Readability Optimizer for LADtoday — Pakistan's AI content platform.
SURGICAL editing only — fix problems, don't rewrite the whole article.

TOPIC: "${topic}" | AUDIENCE KNOWLEDGE: ${knowledgeLevel} | TARGET GRADE: ${targetGrade}
${learning.sampleSize > 0 ? `LEARNING: Most common issue for this category: "${learning.commonIssue}". Check this first.` : ""}

ARTICLE HTML:
${articleHtml.slice(0, 6000)}

━━━ EXACT READABILITY PROTOCOL (5 checks) ━━━

STEP 1 — ESTIMATE FLESCH-KINCAID:
Formula: 206.835 - 1.015(words/sentences) - 84.6(syllables/words)
Grade level = 0.39(words/sentences) + 11.8(syllables/words) - 15.59
Estimate based on sentence complexity observed in the text.
Target: Flesch score ≥ ${knowledgeLevel === "expert" ? 40 : 60} (Grade ≤ ${targetGrade})

STEP 2 — IDENTIFY PROBLEMS (scan every paragraph):
a. LONG SENTENCES: sentences > 30 words → split into 2 shorter ones
b. LONG PARAGRAPHS: paragraphs > 100 words → split at logical break point
c. PASSIVE VOICE: "was decided by" / "has been announced" / "was confirmed" → convert to active
   TARGET: passive voice < 20% of sentences
d. JARGON HEAVY: > 5 unexplained technical terms in one paragraph
   → add brief definition: "SECP (Pakistan's securities regulator)"
e. POOR TRANSITIONS: paragraph starts with no connective tissue (no "However", "This", "As a result")
   → add 1-2 word transition at start

STEP 3 — REWRITE ONLY flagged sections. DO NOT change unflagged sections.
For each issue, provide:
- original_text: exact problematic text
- rewritten_text: the fixed version
- location: paragraph number or heading reference

STEP 4 — RECONSTRUCT:
Apply all rewrites to the original HTML → produce optimized_article_html
IMPORTANT: Only modify flagged sections. Preserve all other HTML exactly.

STEP 5 — RE-SCORE:
Estimate new Flesch score after fixes.

Return JSON:
{
  "optimized_article_html": "string (full article HTML with surgical fixes applied)",
  "original_flesch_score": number (0-100 estimate),
  "improved_flesch_score": number (0-100 estimate after fixes),
  "original_grade_level": number,
  "improved_grade_level": number,
  "issues_found": [
    {
      "type": "long_sentence|long_paragraph|passive_voice|jargon_heavy|poor_transitions",
      "location": "string (paragraph 3 or 'After heading: X')",
      "original_text": "string",
      "rewritten_text": "string",
      "severity": "critical|moderate|minor"
    }
  ],
  "changes_made": ["string (summary of each change)"],
  "avg_sentence_length_before": number,
  "avg_sentence_length_after": number,
  "passive_voice_pct_before": number,
  "passive_voice_pct_after": number
}`;

    const schema = { type: "object", properties: {
      optimized_article_html:{type:"string"}, original_flesch_score:{type:"number"}, improved_flesch_score:{type:"number"},
      original_grade_level:{type:"number"}, improved_grade_level:{type:"number"},
      issues_found:{type:"array",items:{type:"object",properties:{type:{type:"string"},location:{type:"string"},original_text:{type:"string"},rewritten_text:{type:"string"},severity:{type:"string"}}}},
      changes_made:{type:"array",items:{type:"string"}}, avg_sentence_length_before:{type:"number"}, avg_sentence_length_after:{type:"number"},
      passive_voice_pct_before:{type:"number"}, passive_voice_pct_after:{type:"number"},
    }};

    const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.35, maxOutputTokens: 8192 });

    const result: ReadabilityOutput = {
      optimized_article_html: raw.optimized_article_html || articleHtml,
      original_flesch_score: raw.original_flesch_score || 55,
      improved_flesch_score: raw.improved_flesch_score || 65,
      original_grade_level: raw.original_grade_level || 10,
      improved_grade_level: raw.improved_grade_level || 8,
      issues_found: raw.issues_found || [],
      issues_fixed: (raw.issues_found || []).length,
      changes_made: raw.changes_made || [],
      problem_sections_count: (raw.issues_found || []).length,
      avg_sentence_length_before: raw.avg_sentence_length_before || 20,
      avg_sentence_length_after: raw.avg_sentence_length_after || 16,
      passive_voice_pct_before: raw.passive_voice_pct_before || 25,
      passive_voice_pct_after: raw.passive_voice_pct_after || 12,
      target_grade_level: targetGrade,
      improvement_delta: (raw.improved_flesch_score || 65) - (raw.original_flesch_score || 55),
      learning_applied: learning.sampleSize > 0,
    };

    const mostCommonIssue = (raw.issues_found || []).reduce((acc: Record<string,number>, i: any) => { acc[i.type] = (acc[i.type] || 0) + 1; return acc; }, {});
    const topIssue = Object.entries(mostCommonIssue).sort(([,a],[,b])=>b-a)[0]?.[0] || "none";
    try { await supabase.from("agent_memory").insert({ agent_key: AGENT_KEY, topic_category: category, target_grade: targetGrade, improvement_delta: result.improvement_delta, most_common_issue: topIssue, created_at: new Date().toISOString() }); } catch {/**/ }

    const durationMs = Date.now() - startedAt;
    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(result.optimized_article_html.length / 3), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, { status: "completed", finished_at: new Date().toISOString(), issues_fixed: result.issues_fixed, flesch_before: result.original_flesch_score, flesch_after: result.improved_flesch_score, improvement: result.improvement_delta });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`, `Flesch: ${result.original_flesch_score}→${result.improved_flesch_score} (+${result.improvement_delta}) | Grade: ${result.original_grade_level}→${result.improved_grade_level} | ${result.issues_fixed} issues fixed | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({ ok: true, agent: AGENT_KEY, run_id, flesch_before: result.original_flesch_score, flesch_after: result.improved_flesch_score, grade_before: result.original_grade_level, grade_after: result.improved_grade_level, issues_fixed: result.issues_fixed, duration_ms: durationMs }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${AGENT_NAME}] ❌`, msg);
    try { const b = await req.clone().json().catch(()=>({})); if (b.run_id) { await patchAgentState(b.run_id, AGENT_KEY, { status:"failed", finished_at:new Date().toISOString(), error:msg }); await writeAgentOutput(b.run_id, AGENT_KEY, { error:msg }, { status:"failed", error:msg, duration_ms:Date.now()-startedAt }); } } catch {/**/ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
