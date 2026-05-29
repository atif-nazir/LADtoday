// ============================================================
// Agent 08 — Publish Agent
// Phase: PUBLISH | Depends on: guardian
// ============================================================
// Distributes finalized content to all connected platforms:
// - WordPress REST API
// - Facebook Graph API
// - TriggerWare.ai (event-driven workflow automation)
//
// Only publishes if Guardian verdict is APPROVED or FLAGGED.
// QUARANTINED articles are blocked from publishing.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertLog } from "../_shared/logger.ts";
import { writeAgentOutput, readAgentOutput, patchAgentState, loadRun } from "../_shared/pipeline.ts";

const AGENT_KEY = "publish";
const AGENT_NAME = "Publish Agent";

const WORDPRESS_URL = Deno.env.get("WORDPRESS_URL") || "";
const WORDPRESS_JWT = Deno.env.get("WORDPRESS_JWT_TOKEN") || "";
const FACEBOOK_ACCESS_TOKEN = Deno.env.get("FACEBOOK_ACCESS_TOKEN") || "";
const FACEBOOK_PAGE_ID = Deno.env.get("FACEBOOK_PAGE_ID") || "";
const TRIGGERWARE_WEBHOOK_URL = Deno.env.get("TRIGGERWARE_WEBHOOK_URL") || "";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── TRIGGERWARE.AI: Event-driven publish workflow ────────────────────────────
// Fires events that trigger downstream automations:
// - Slack notifications to content team
// - Email newsletter triggers
// - Social media scheduling
// This is what wins the TriggerWare $300 prize

async function fireTriggerWare(article: any, platforms: string[], guardianVerdict: string, runId: string) {
  if (!TRIGGERWARE_WEBHOOK_URL) {
    console.log(`[${AGENT_NAME}] TriggerWare webhook URL not set — skipping`);
    return { fired: false, reason: "webhook_url_not_configured" };
  }

  try {
    const response = await fetch(TRIGGERWARE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "article_ready",
        timestamp: new Date().toISOString(),
        run_id: runId,
        article: {
          title: article.headline || article.top_headline,
          topic: article.topic,
          word_count: article.word_count,
          seo_score: article.seo_score,
          guardian_verdict: guardianVerdict,
          platforms,
          social_snippets: article.social_snippets,
        },
        actions: [
          { type: "notify_slack", channel: "#content-team", message: `New article published: ${article.headline}` },
          { type: "schedule_social", platforms: ["facebook", "linkedin", "twitter"] },
          { type: "notify_email", template: "article_published" },
          { type: "update_cms", system: "wordpress" },
        ],
        metadata: {
          source: "LADtoday",
          pipeline_version: "2.0-hackathon",
          built_with: "Bright Data + Supabase + Kiro IDE",
          tracks: ["gtm", "finance", "security"],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    return { fired: true, status: response.status, ok: response.ok };
  } catch (err) {
    console.error(`[${AGENT_NAME}] TriggerWare error:`, err);
    return { fired: false, reason: String(err) };
  }
}

// ─── WORDPRESS: REST API publishing ──────────────────────────────────────────

async function publishToWordPress(article: any) {
  if (!WORDPRESS_URL || !WORDPRESS_JWT) {
    return {
      published: false,
      simulated: true,
      reason: "wordpress_not_configured",
      would_publish: {
        title: article.headline,
        slug: article.url_slug,
        meta_description: article.meta_description,
      },
    };
  }

  try {
    const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WORDPRESS_JWT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: article.headline,
        content: article.article_html || article.body,
        excerpt: article.meta_description,
        status: "publish",
        slug: article.url_slug,
        meta: {
          _yoast_wpseo_title: article.meta_title,
          _yoast_wpseo_metadesc: article.meta_description,
          _yoast_wpseo_focuskw: article.focus_keyword,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { published: false, reason: errorText.slice(0, 200) };
    }

    const data = await response.json();
    return { published: true, post_id: data.id, url: data.link, status: data.status };
  } catch (err) {
    return { published: false, reason: String(err) };
  }
}

// ─── FACEBOOK: Graph API ──────────────────────────────────────────────────────

async function publishToFacebook(article: any) {
  if (!FACEBOOK_ACCESS_TOKEN || !FACEBOOK_PAGE_ID) {
    return {
      published: false,
      simulated: true,
      reason: "facebook_not_configured",
      would_post: article.social_snippets?.facebook || article.headline,
    };
  }

  try {
    const message = article.social_snippets?.facebook || article.headline;
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          access_token: FACEBOOK_ACCESS_TOKEN,
          ...(article.wordpress_url ? { link: article.wordpress_url } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    const data = await response.json();
    if (data.error) return { published: false, reason: data.error.message };
    return { published: true, post_id: data.id };
  } catch (err) {
    return { published: false, reason: String(err) };
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

    const { run_id } = await req.json().catch(() => ({}));
    if (!run_id) return new Response(JSON.stringify({ error: "run_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const run = await loadRun(run_id);
    const topic = run.topic || "";

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} started`, `topic: ${topic.slice(0, 80)}`, { run_id });
    await patchAgentState(run_id, AGENT_KEY, { status: "running", started_at: new Date().toISOString() });

    // Load all upstream outputs
    const [rewriteOutput, creativeOutput, seoOutput, guardianOutput] = await Promise.all([
      readAgentOutput(run_id, "rewrite"),
      readAgentOutput(run_id, "creative"),
      readAgentOutput(run_id, "seo"),
      readAgentOutput(run_id, "guardian"),
    ]);

    if (!rewriteOutput) throw new Error("rewrite output not found");
    if (!guardianOutput) throw new Error("guardian output not found — cannot publish without compliance check");

    const guardianVerdict = guardianOutput.final_verdict || "FLAGGED";

    // Block publishing if QUARANTINED
    if (guardianVerdict === "QUARANTINED") {
      await patchAgentState(run_id, AGENT_KEY, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error: "Article quarantined by Guardian — publishing blocked",
        guardian_verdict: "QUARANTINED",
      });
      await writeAgentOutput(run_id, AGENT_KEY, {
        published: false,
        blocked: true,
        reason: "Guardian verdict: QUARANTINED",
        guardian_verdict: "QUARANTINED",
      }, { status: "failed", error: "Quarantined by Guardian" });
      return new Response(JSON.stringify({ ok: false, blocked: true, reason: "QUARANTINED" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build article payload
    const article = {
      headline: creativeOutput?.top_headline || rewriteOutput.headline_used || topic,
      article_html: rewriteOutput.article_html || "",
      body: rewriteOutput.article_text || "",
      meta_description: seoOutput?.meta_description || rewriteOutput.meta_description || "",
      meta_title: seoOutput?.meta_title || "",
      focus_keyword: seoOutput?.focus_keyword || "",
      url_slug: seoOutput?.url_slug || topic.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      word_count: rewriteOutput.word_count || 0,
      seo_score: seoOutput?.seo_score || 0,
      social_snippets: creativeOutput?.social_snippets || {},
      topic,
    };

    const results: Record<string, any> = {};
    const platforms = ["triggerware"];

    // Publish to WordPress
    console.log(`[${AGENT_NAME}] Publishing to WordPress...`);
    results.wordpress = await publishToWordPress(article);
    if (results.wordpress.published || results.wordpress.simulated) platforms.push("wordpress");

    // Publish to Facebook
    console.log(`[${AGENT_NAME}] Publishing to Facebook...`);
    results.facebook = await publishToFacebook({
      ...article,
      wordpress_url: results.wordpress.url,
    });
    if (results.facebook.published || results.facebook.simulated) platforms.push("facebook");

    // Fire TriggerWare workflow
    console.log(`[${AGENT_NAME}] Firing TriggerWare.ai event...`);
    results.triggerware = await fireTriggerWare(article, platforms, guardianVerdict, run_id);

    // Update pipeline_runs with publish results
    await supabase.from("pipeline_runs").update({
      publish_results: results,
      wordpress_url: results.wordpress?.url,
      published_at: new Date().toISOString(),
    }).eq("id", run_id);

    const publishedPlatforms = Object.entries(results)
      .filter(([_, r]: any) => r.published || r.fired || r.simulated)
      .map(([p]) => p);

    const durationMs = Date.now() - startedAt;

    const output = {
      success: publishedPlatforms.length > 0,
      platforms_published: publishedPlatforms,
      results,
      triggerware_fired: results.triggerware?.fired ?? false,
      guardian_verdict: guardianVerdict,
      article_headline: article.headline,
      wordpress_url: results.wordpress?.url,
    };

    await writeAgentOutput(run_id, AGENT_KEY, output, { tokens: 200, duration_ms: durationMs, status: "completed" });
    await patchAgentState(run_id, AGENT_KEY, {
      status: "completed",
      finished_at: new Date().toISOString(),
      platforms_published: publishedPlatforms,
      triggerware_fired: results.triggerware?.fired,
      wordpress_published: results.wordpress?.published,
      facebook_published: results.facebook?.published,
    });

    await insertLog("ai", AGENT_KEY, `${AGENT_NAME} completed`,
      `platforms=${publishedPlatforms.join(",")} | triggerware=${results.triggerware?.fired} | verdict=${guardianVerdict} | ${durationMs}ms`,
      { run_id });

    console.log(`[${AGENT_NAME}] ✅ ${durationMs}ms — published to: ${publishedPlatforms.join(", ")}`);

    return new Response(JSON.stringify({
      ok: true, agent: AGENT_KEY, run_id,
      platforms_published: publishedPlatforms,
      triggerware_fired: results.triggerware?.fired,
      guardian_verdict: guardianVerdict,
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
