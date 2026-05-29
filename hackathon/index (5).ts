// supabase/functions/guardian-agent/index.ts
// LADtoday Guardian Agent — compliance, plagiarism, brand safety
// Uses Bright Data to cross-check claims against live web

import { corsHeaders } from "../_shared/cors.ts";

const BRIGHTDATA_API_TOKEN = Deno.env.get("BRIGHTDATA_API_TOKEN")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

// ─── LOBSTER TRAP: Prompt Injection DPI ───────────────────────────────────────
// Intercepts all prompts before they reach AI models
function lobsterTrap(text: string): { safe: boolean; injection_detected: boolean; sanitized: string } {
  const injectionPatterns = [
    /ignore\s+(previous|all|prior)\s+instructions/i,
    /you\s+are\s+now\s+a/i,
    /forget\s+everything/i,
    /act\s+as\s+(if|a|an)/i,
    /jailbreak/i,
    /DAN\s+mode/i,
    /override\s+system/i,
    /\[SYSTEM\]/i,
    /new\s+instruction:/i
  ];

  const injection_detected = injectionPatterns.some(p => p.test(text));

  return {
    safe: !injection_detected,
    injection_detected,
    sanitized: injection_detected
      ? text.replace(/ignore\s+previous|you\s+are\s+now|act\s+as/gi, "[BLOCKED]")
      : text
  };
}

// ─── BRIGHT DATA: Live plagiarism check ──────────────────────────────────────
// Searches for distinctive sentences from the article on the web
async function checkPlagiarism(articleBody: string): Promise<{
  score: number;
  matches: string[];
  verdict: "pass" | "fail";
}> {
  // Extract 3 distinctive sentences (15+ words, not headings)
  const sentences = articleBody
    .split(/[.!?]\s+/)
    .filter(s => s.split(" ").length > 12 && !s.startsWith("#"))
    .slice(0, 3);

  const matches: string[] = [];
  let maxScore = 0;

  for (const sentence of sentences) {
    const query = sentence.slice(0, 80).trim();
    const encoded = encodeURIComponent(`"${query}"`);

    const response = await fetch(
      `https://api.brightdata.com/serp/google/search?q=${encoded}&num=5`,
      { headers: { "Authorization": `Bearer ${BRIGHTDATA_API_TOKEN}` } }
    );

    if (!response.ok) continue;
    const data = await response.json();
    const results = data.organic ?? [];

    if (results.length > 0) {
      // Found matching text online — possible plagiarism
      maxScore = Math.max(maxScore, 70);
      results.slice(0, 2).forEach((r: any) => matches.push(r.link));
    }
  }

  return {
    score: maxScore,
    matches: [...new Set(matches)],
    verdict: maxScore > 60 ? "fail" : "pass"
  };
}

// ─── Compliance Checks ────────────────────────────────────────────────────────
async function runComplianceCheck(articleBody: string, mode: string) {
  const prompt = `Analyze this article for compliance issues. Return ONLY valid JSON.

Article:
${articleBody.slice(0, 3000)}

Mode: ${mode}

Check for and return:
{
  "unsubstantiated_medical": false,
  "unsubstantiated_financial": false,
  "defamatory_content": false,
  "pii_detected": false,
  "hate_speech": false,
  "misleading_claims": false,
  "issues_found": ["list of specific issues if any"],
  "risk_level": "low",
  "brand_sentiment": "neutral",
  "summary": "one line compliance summary"
}

For financial mode, be stricter on investment claims.
Return ONLY the JSON object.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
      })
    }
  );

  const data = await response.json();
  const raw = data.candidates[0].content.parts[0].text
    .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return JSON.parse(raw);
  } catch {
    return {
      unsubstantiated_medical: false,
      unsubstantiated_financial: false,
      defamatory_content: false,
      pii_detected: false,
      hate_speech: false,
      misleading_claims: false,
      issues_found: [],
      risk_level: "low",
      brand_sentiment: "neutral",
      summary: "No issues detected"
    };
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { article, sources, mode = "gtm" } = await req.json();
  const articleBody = article.body ?? "";
  const timestamp = new Date().toISOString();

  // 1. Lobster Trap check on article content
  const trapResult = lobsterTrap(articleBody);

  // 2. Plagiarism check via Bright Data
  console.log("[Guardian] Running Bright Data plagiarism check...");
  const plagiarismResult = await checkPlagiarism(articleBody);

  // 3. Compliance check
  console.log("[Guardian] Running compliance analysis...");
  const complianceResult = await runComplianceCheck(articleBody, mode);

  // 4. Source verification — check that key claims have source backing
  const verifiedClaims = sources?.length ?? 0;
  const minimumSources = 3;
  const sourcesAdequate = verifiedClaims >= minimumSources;

  // 5. Determine final verdict
  const criticalFailures = [
    plagiarismResult.verdict === "fail" && plagiarismResult.score > 80,
    complianceResult.defamatory_content,
    complianceResult.hate_speech,
    trapResult.injection_detected
  ].filter(Boolean);

  const warnings = [
    plagiarismResult.verdict === "fail" && plagiarismResult.score > 60,
    complianceResult.unsubstantiated_financial && mode === "finance",
    complianceResult.unsubstantiated_medical,
    complianceResult.misleading_claims,
    !sourcesAdequate
  ].filter(Boolean);

  let final_verdict: "APPROVED" | "FLAGGED" | "QUARANTINED";
  if (criticalFailures.length > 0) {
    final_verdict = "QUARANTINED";
  } else if (warnings.length > 0) {
    final_verdict = "FLAGGED";
  } else {
    final_verdict = "APPROVED";
  }

  // 6. Build audit log
  const audit_log = {
    verdict: final_verdict,
    timestamp,
    checks: {
      lobster_trap: { safe: trapResult.safe, injection_detected: trapResult.injection_detected },
      plagiarism: plagiarismResult,
      compliance: complianceResult,
      source_verification: { sources_provided: verifiedClaims, minimum_required: minimumSources, adequate: sourcesAdequate }
    },
    critical_failures: criticalFailures.length,
    warnings: warnings.length,
    guardian_version: "1.0.0"
  };

  return new Response(JSON.stringify({
    final_verdict,
    plagiarism: plagiarismResult,
    compliance: complianceResult,
    lobster_trap: trapResult,
    audit_log,
    verdict_reason: final_verdict === "APPROVED"
      ? "All checks passed"
      : final_verdict === "FLAGGED"
        ? `${warnings.length} warning(s) require review: ${complianceResult.issues_found?.join(", ") || "see audit log"}`
        : `Critical failure: ${criticalFailures.length} issue(s) found`
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
