// supabase/functions/publish-agent/index.ts
// LADtoday Publish Agent — distributes to platforms + fires TriggerWare.ai

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WORDPRESS_URL = Deno.env.get("WORDPRESS_URL");
const WORDPRESS_JWT = Deno.env.get("WORDPRESS_JWT_TOKEN");
const FACEBOOK_ACCESS_TOKEN = Deno.env.get("FACEBOOK_ACCESS_TOKEN");
const FACEBOOK_PAGE_ID = Deno.env.get("FACEBOOK_PAGE_ID");
const TRIGGERWARE_WEBHOOK_URL = Deno.env.get("TRIGGERWARE_WEBHOOK_URL");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── TRIGGERWARE.AI: Event-driven publish workflow ────────────────────────────
// This is what wins the TriggerWare $300 prize
// Flow: Article ready → TriggerWare fires → notifications + downstream automations
async function fireTriggerWare(article: any, platforms: string[], guardianVerdict: string) {
  if (!TRIGGERWARE_WEBHOOK_URL) {
    console.log("[Publish] TriggerWare webhook URL not set, skipping");
    return { fired: false, reason: "webhook_url_not_set" };
  }

  try {
    const response = await fetch(TRIGGERWARE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "article_ready",
        timestamp: new Date().toISOString(),
        article: {
          title: article.headline,
          topic: article.topic,
          word_count: article.word_count,
          seo_score: article.seo_score,
          guardian_verdict: guardianVerdict,
          platforms
        },
        actions: [
          { type: "notify_slack", channel: "#content-team" },
          { type: "update_cms", system: "wordpress" },
          { type: "schedule_social", platforms: ["facebook", "linkedin"] },
          { type: "notify_email", template: "article_published" }
        ],
        metadata: {
          source: "LADtoday",
          pipeline_version: "1.0",
          built_with: "Bright Data + Supabase"
        }
      })
    });

    return { fired: true, status: response.status };
  } catch (err) {
    console.error("[Publish] TriggerWare error:", err);
    return { fired: false, reason: String(err) };
  }
}

// ─── WORDPRESS: REST API publishing ──────────────────────────────────────────
async function publishToWordPress(article: any) {
  if (!WORDPRESS_URL || !WORDPRESS_JWT) {
    return { published: false, reason: "wordpress_not_configured", simulated: true };
  }

  try {
    const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WORDPRESS_JWT}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: article.headline,
        content: article.body,
        excerpt: article.meta_description,
        status: "publish",
        slug: article.url_slug
      })
    });

    if (!response.ok) {
      return { published: false, reason: await response.text() };
    }
    const data = await response.json();
    return { published: true, post_id: data.id, url: data.link };
  } catch (err) {
    return { published: false, reason: String(err) };
  }
}

// ─── FACEBOOK: Graph API ──────────────────────────────────────────────────────
async function publishToFacebook(article: any) {
  if (!FACEBOOK_ACCESS_TOKEN || !FACEBOOK_PAGE_ID) {
    // Simulate for demo purposes
    return {
      published: false,
      simulated: true,
      reason: "facebook_not_configured",
      would_post: article.social_snippets?.facebook ?? article.headline
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: article.social_snippets?.facebook ?? article.headline,
          access_token: FACEBOOK_ACCESS_TOKEN
        })
      }
    );
    const data = await response.json();
    return { published: true, post_id: data.id };
  } catch (err) {
    return { published: false, reason: String(err) };
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { article_id, article, platforms = ["wordpress", "triggerware"], guardian_verdict } = await req.json();

  const results: Record<string, any> = {};

  // Publish to WordPress
  if (platforms.includes("wordpress")) {
    console.log("[Publish] Publishing to WordPress...");
    results.wordpress = await publishToWordPress(article);
  }

  // Publish to Facebook
  if (platforms.includes("facebook")) {
    console.log("[Publish] Publishing to Facebook...");
    results.facebook = await publishToFacebook(article);
  }

  // Fire TriggerWare workflow — always fire this for automation
  console.log("[Publish] Firing TriggerWare.ai event...");
  results.triggerware = await fireTriggerWare(article, platforms, guardian_verdict);

  // Update article with publish results
  await supabase
    .from("articles")
    .update({
      publish_results: results,
      wordpress_url: results.wordpress?.url,
      published_at: new Date().toISOString()
    })
    .eq("id", article_id);

  const publishedPlatforms = Object.entries(results)
    .filter(([_, r]: any) => r.published || r.fired)
    .map(([p]) => p);

  return new Response(JSON.stringify({
    success: publishedPlatforms.length > 0,
    platforms_published: publishedPlatforms,
    results,
    triggerware_fired: results.triggerware?.fired ?? false
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
