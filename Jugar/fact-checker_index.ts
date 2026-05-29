// ============================================================
// Agent 08 — Fact Checker Agent
// Phase: ANALYZE | Model: gemini-2.5-pro
// Depends on: scout(01), intelligence(02), research(07)
// ============================================================
// EXACT WORKFLOW (LADtoday_50_AGENTS.md):
// 1. Classify each claim type: statistic/date/name/policy/event/quote
// 2. Cross-reference vs Research Agent verified sources
// 3. Score confidence: HIGH/MEDIUM/LOW/DISPUTED
// 4. DISPUTED: try grounding → "reportedly" or remove
// 5. STATISTICS: sanity check (plausible? recent ≤2yr? unit correct? PKR vs USD?)
// 6. Output fact_audit_report: approved_facts[], flagged_facts[], removed_facts[]
// LEARNING: tracks error_rate by fact_type, raises scrutiny for bad categories
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "fact-checker";
const AGENT_NAME = "Fact Checker";
const MODEL = "gemini-2.5-pro";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

type FactType = "statistic" | "date" | "name" | "policy" | "event" | "quote" | "general";

interface AuditedFact {
  original_claim: string; source_domain: string; fact_type: FactType;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "DISPUTED"; confidence_score: number;
  verdict: "approved" | "flagged" | "removed";
  verified_version: string;   // clean version to use
  framing_note: string;       // e.g. "use 'reportedly'" or ""
  reason: string;
  // Stats-only sanity
  stat_plausible?: boolean; stat_recent?: boolean; stat_unit_correct?: boolean; stat_sanity_note?: string;
}

interface FactAuditReport {
  approved_facts: AuditedFact[];
  flagged_facts: AuditedFact[];
  removed_facts: AuditedFact[];
  confidence_scores: Record<string, number>;
  overall_credibility: "high" | "medium" | "low";
  safe_to_proceed: boolean;
  stat_issues_found: number;
  writing_cautions: string[];
  fact_audit_summary: string;
  dominant_error_type: string; error_rate: number;
  learning_applied: boolean; high_scrutiny_types: FactType[];
}

async function loadLearning(topicCategory: string) {
  try {
    const { data } = await supabase.from("agent_memory").select("dominant_error_type,error_rate")
      .eq("agent_key", AGENT_KEY).in("topic_category", [topicCategory, "general"])
      .order("created_at", { ascending: false }).limit(20);
    if (!data?.length) return { highErrorFactTypes: [] as FactType[], avgErrorRate: 0, sampleSize: 0 };
    const counts: Record<string, number> = {};
    let totalRate = 0;
    for (const m of data) {
      if (m.dominant_error_type) counts[m.dominant_error_type] = (counts[m.dominant_error_type] || 0) + 1;
      totalRate += m.error_rate || 0;
    }
    const highErrorFactTypes = Object.entries(counts).sort(([,a],[,b])=>b-a).slice(0,3).map(([t])=>t as FactType);
    return { highErrorFactTypes, avgErrorRate: totalRate / data.length, sampleSize: data.length };
  } catch { return { highErrorFactTypes: [] as FactType[], avgErrorRate: 0, sampleSize: 0 }; }
}

function inferCategory(topic: string) {
  const t = topic.toLowerCase();
  if (/fintech|sbp|banking/.test(t)) return "fintech";
  if (/tech|ai|startup/.test(t)) return "tech";
  if (/cricket|sport/.test(t)) return "sports";
  if (/politics|government/.test(t)) return "politics";
  if (/economy|inflation|gdp/.test(t)) return "economy";
  return "general";
}

async function runAudit(topic: string, intelFacts: any[], researchStats: any[], scoutSources: any[], category: string, learning: any): Promise<FactAuditReport> {
  const allClaims = [
    ...intelFacts.slice(0, 8).map((f: any) => `[INTELLIGENCE][${(f.fact_type||"general").toUpperCase()}][pre-rated:${f.confidence||"low"}] "${f.fact}" (source: ${f.source_domain||"unknown"})`),
    ...researchStats.slice(0, 6).map((s: any) => `[RESEARCH][STATISTIC][pre-rated:${s.confidence==="verified"?"high":"medium"}] "${s.fact}" (source: ${s.source_org||"unknown"})`),
  ].join("\n");

  const srcCtx = scoutSources.slice(0,3).map((s:any)=>`[${s.source_domain}] cred=${((s.credibility_score||0.5)*10).toFixed(1)}: ${(s.key_facts||[]).slice(0,3).join(" | ")}`).join("\n");

  const learnNote = learning.sampleSize > 0
    ? `\nLEARNING (${learning.sampleSize} runs): High-error types historically: [${learning.highErrorFactTypes.join(", ")}], avg error rate ${(learning.avgErrorRate*100).toFixed(0)}%. Apply EXTRA scrutiny to those types.`
    : "";

  const prompt = `You are the Fact Checker for LADtoday, Pakistan's AI content platform. Wrong facts destroy credibility.

TOPIC: "${topic}" | CATEGORY: ${category}
${learnNote}

CLAIMS TO AUDIT:
${allClaims || "No claims — assess topic general credibility"}

SOURCE MATERIAL:
${srcCtx || "No sources"}

━━━ AUDIT PROTOCOL (follow EXACTLY) ━━━

STEP 1 — For each claim, classify fact_type:
  statistic(number/%), date, name(person/company/org), policy(law/regulation),
  event(something that happened), quote(attributed statement), general(other)

STEP 2 — Score confidence:
  HIGH(85-100): Authority source confirms (SBP, government, academic)
  MEDIUM(60-84): Multiple sources agree, no single authority
  LOW(30-59): Single source, aging, or unverifiable
  DISPUTED(<30): Sources contradict, or contradicts known knowledge

STEP 3 — For DISPUTED: apply knowledge grounding. If still unverified → framing_note="use 'reportedly'". If contradicted → verdict=removed.

STEP 4 — STATISTICS ONLY — 3 sanity checks:
  a. PLAUSIBLE? Is this number realistic for Pakistan/world context? (e.g. "GDP grew 45% in one quarter" is implausible)
  b. RECENT? Is data within last 2 years? If older → stat_recent=false, add "as of [year]" to framing_note
  c. UNIT CORRECT? Check PKR vs USD (1USD≈280PKR), millions vs billions (Pakistan GDP~$340B not million), annual vs monthly rates

STEP 5 — Set verdict:
  approved = HIGH or MEDIUM confidence AND no stat sanity failures
  flagged = LOW confidence OR stat sanity issue → writer must add "reportedly" or caveat
  removed = DISPUTED contradicted by knowledge OR implausible stat → do not publish

Return JSON:
{
  "audited_facts": [{
    "original_claim":"string","source_domain":"string","fact_type":"statistic|date|name|policy|event|quote|general",
    "confidence":"HIGH|MEDIUM|LOW|DISPUTED","confidence_score":number,
    "verdict":"approved|flagged|removed","verified_version":"string (clean version or corrected)","framing_note":"string",
    "reason":"string","stat_plausible":boolean,"stat_recent":boolean,"stat_unit_correct":boolean,"stat_sanity_note":"string"
  }],
  "overall_credibility":"high|medium|low","safe_to_proceed":boolean,
  "writing_cautions":["string"],"fact_audit_summary":"string (2 sentences)"
}`;

  const schema = {
    type: "object",
    properties: {
      audited_facts: { type: "array", items: { type: "object", properties: {
        original_claim:{type:"string"},source_domain:{type:"string"},fact_type:{type:"string"},
        confidence:{type:"string"},confidence_score:{type:"number"},verdict:{type:"string"},
        verified_version:{type:"string"},framing_note:{type:"string"},reason:{type:"string"},
        stat_plausible:{type:"boolean"},stat_recent:{type:"boolean"},stat_unit_correct:{type:"boolean"},stat_sanity_note:{type:"string"},
      }}},
      overall_credibility:{type:"string"},safe_to_proceed:{type:"boolean"},
      writing_cautions:{type:"array",items:{type:"string"}},fact_audit_summary:{type:"string"},
    },
  };

  const raw = await geminiJson<any>(prompt, schema, { model: MODEL, temperature: 0.25, maxOutputTokens: 5120 });

  const audited: AuditedFact[] = raw.audited_facts || [];
  const approved = audited.filter(f=>f.verdict==="approved");
  const flagged = audited.filter(f=>f.verdict==="flagged");
  const removed = audited.filter(f=>f.verdict==="removed");
  const statIssues = audited.filter(f=>f.fact_type==="statistic"&&(f.stat_plausible===false||f.stat_recent===false||f.stat_unit_correct===false)).length;
  const scores: Record<string,number> = {};
  for (const f of audited) scores[f.original_claim.slice(0,60)]=f.confidence_score;
  const typeCounts: Record<string,number>={};
  for (const f of [...flagged,...removed]) typeCounts[f.fact_type]=(typeCounts[f.fact_type]||0)+1;
  const dominantErrorType = Object.entries(typeCounts).sort(([,a],[,b])=>b-a)[0]?.[0]||"none";
  const errorRate = audited.length>0?(flagged.length+removed.length)/audited.length:0;
  try {
    await supabase.from("agent_memory").insert({ agent_key:AGENT_KEY, topic_category:category, dominant_error_type:dominantErrorType, error_rate:errorRate, created_at:new Date().toISOString() });
  } catch {/**/ }
  return { approved_facts:approved, flagged_facts:flagged, removed_facts:removed, confidence_scores:scores,
    overall_credibility:raw.overall_credibility||"medium", safe_to_proceed:raw.safe_to_proceed??(removed.length===0),
    stat_issues_found:statIssues, writing_cautions:raw.writing_cautions||[], fact_audit_summary:raw.fact_audit_summary||`${approved.length} approved, ${flagged.length} flagged, ${removed.length} removed.`,
    dominant_error_type:dominantErrorType, error_rate:errorRate, learning_applied:learning.sampleSize>0, high_scrutiny_types:learning.highErrorFactTypes };
}

async function verifyServiceOrAdmin(req: Request): Promise<boolean> {
  const h=req.headers.get("Authorization"); if(!h?.startsWith("Bearer "))return false;
  const t=h.replace("Bearer ",""); if(t===Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))return true;
  try{const p=JSON.parse(atob(t.split(".")[1]));if(p.role==="service_role")return true;}catch{/**/ }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  try {
    if (!await verifyServiceOrAdmin(req)) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { run_id } = await req.json().catch(() => ({}));
    if (!run_id) return new Response(JSON.stringify({ error: "run_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const run = await loadRun(run_id);
    const topic = run.topic || "";
    const category = inferCategory(topic);
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, topic, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    const [scoutOut, intelOut, researchOut] = await Promise.all([
      readAgentOutput(run_id, "scout").catch(()=>null),
      readAgentOutput(run_id, "intelligence"),
      readAgentOutput(run_id, "research"),
    ]);
    if (!intelOut) throw new Error("intelligence output not found");
    if (!researchOut) throw new Error("research output not found");

    const learning = await loadLearning(category);
    console.log(`[${AGENT_NAME}] Auditing ${(intelOut.key_facts||[]).length + (researchOut.verified_statistics||[]).length} claims | scrutiny: [${learning.highErrorFactTypes.join(", ")}]`);

    const result = await runAudit(topic, intelOut.key_facts||[], researchOut.verified_statistics||[], scoutOut?.sources||[], category, learning);
    const durationMs = Date.now() - startedAt;

    await writeAgentOutput(run_id, AGENT_KEY, result, { tokens: Math.ceil(JSON.stringify(result).length/4), duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, { status:"completed", finished_at:new Date().toISOString(),
      approved:result.approved_facts.length, flagged:result.flagged_facts.length, removed:result.removed_facts.length,
      stat_issues:result.stat_issues_found, credibility:result.overall_credibility, safe_to_proceed:result.safe_to_proceed });

    if (!result.safe_to_proceed) await insertLog("warning", AGENT_KEY, `⚠️ ${result.removed_facts.length} facts removed — proceed with caution`, result.fact_audit_summary, { run_id });
    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `✅ ${result.approved_facts.length} approved | ⚠️ ${result.flagged_facts.length} flagged | ❌ ${result.removed_facts.length} removed | stat_issues=${result.stat_issues_found} | ${durationMs}ms`, { run_id });

    return new Response(JSON.stringify({ ok:true, agent:AGENT_KEY, run_id,
      approved:result.approved_facts.length, flagged:result.flagged_facts.length, removed:result.removed_facts.length,
      stat_issues:result.stat_issues_found, overall_credibility:result.overall_credibility,
      safe_to_proceed:result.safe_to_proceed, error_rate:result.error_rate,
      learning_applied:result.learning_applied, duration_ms:durationMs }), { status:200, headers:{...corsHeaders,"Content-Type":"application/json"} });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${AGENT_NAME}] ❌`, msg);
    try {
      const b = await req.clone().json().catch(()=>({}));
      if (b.run_id) {
        await patchAgentState(b.run_id, AGENT_KEY, { status:"failed", finished_at:new Date().toISOString(), error:msg });
        await writeAgentOutput(b.run_id, AGENT_KEY, { error:msg }, { status:"failed", error:msg, duration_ms:Date.now()-startedAt });
      }
    } catch {/**/ }
    await insertLog("error", AGENT_KEY, `${AGENT_NAME} failed`, msg);
    return new Response(JSON.stringify({ error:msg }), { status:500, headers:{...corsHeaders,"Content-Type":"application/json"} });
  }
});
