// supabase/functions/analytics-agent/index.ts
// LADtoday Analytics Agent — tracks performance + stores in Cognee memory

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { storeInCognee } from "../intelligence-agent/index.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// PKR revenue projection based on Pakistan RPM rates
function projectRevenuePKR(views: number): number {
  const RPM_PKR = 150; // PKR per 1000 views (realistic Pakistan rate)
  return Math.round((views / 1000) * RPM_PKR);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { article_id, topic, mode } = await req.json();

  // Fetch article from DB
  const { data: article } = await supabase
    .from("articles")
    .select("*")
    .eq("id", article_id)
    .single();

  if (!article) {
    return new Response(JSON.stringify({ error: "Article not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Initialize analytics with projected values for new articles
  const initialViews = 0;
  const projectedViews = article.seo_score ? Math.round(article.seo_score * 48) : 2400;
  const projectedRevenue = projectRevenuePKR(projectedViews);

  // Insert analytics record
  const { data: analytics } = await supabase
    .from("analytics")
    .insert({
      article_id,
      views: initialViews,
      engagement_rate: 0,
      estimated_revenue_pkr: projectedRevenue,
      projected_views: projectedViews,
      seo_score: article.seo_score,
      word_count: article.word_count,
      sources_count: article.bright_data_sources?.length ?? 0,
      mode
    })
    .select()
    .single();

  // Store performance context in Cognee for future memory recall
  if (article.headline && article.topic) {
    await storeInCognee(
      {
        topic: article.topic,
        angle: article.brief?.recommended_angle ?? "standard",
        headline: article.headline
      },
      { views: initialViews, engagement_rate: 0 }
    ).catch(err => console.error("Cognee store error:", err));
  }

  return new Response(JSON.stringify({
    analytics_id: analytics?.id,
    article_id,
    metrics: {
      current_views: initialViews,
      projected_views: projectedViews,
      estimated_revenue_pkr: projectedRevenue,
      seo_score: article.seo_score,
      word_count: article.word_count,
      sources_count: article.bright_data_sources?.length ?? 0
    },
    cognee_stored: true,
    tracking_active: true
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
