import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertLog } from "../_shared/logger.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SITE_URL = Deno.env.get("SITE_URL") || "https://ladtoday.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildArticleUrl(categorySlug: string, articleSlug: string): string {
  return `${SITE_URL}/article/${categorySlug}/${articleSlug}`;
}

async function postToFacebook(
  caption: string,
  articleUrl: string,
  imageUrl: string,
  pageId: string,
  accessToken: string,
  format: 'link' | 'photo',
  articleId?: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    let url, body;
    
    if (format === 'link') {
      // Feed endpoint (Link post relying on Open Graph images via proxy)
      url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const proxyUrl = articleId ? `${SUPABASE_URL}/functions/v1/social-meta-proxy?id=${articleId}` : articleUrl;
      
      body = new URLSearchParams({ 
        message: caption, 
        link: proxyUrl, 
        access_token: accessToken 
      });
    } else {
      // Photo endpoint (Direct thumbnail upload -> bypasses domain verification for image override)
      url = `https://graph.facebook.com/v19.0/${pageId}/photos`;
      const fullCaption = `${caption}\n\n🔗 Read full article:\n${articleUrl}`;
      body = new URLSearchParams({ 
        url: imageUrl, 
        message: fullCaption, 
        access_token: accessToken 
      });
    }

    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const data = await res.json();
    
    if (!res.ok || data.error) return { success: false, error: data.error?.message || `HTTP ${res.status}` };
    
    // Add comment with link if it's a photo post
    if (format === 'photo' && data.id) {
      const commentBody = new URLSearchParams({ message: `🔗 Read full story here: ${articleUrl}`, access_token: accessToken });
      fetch(`https://graph.facebook.com/v19.0/${data.id}/comments`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: commentBody }).catch(console.error);
    }
    
    return { success: true, postId: data.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function notifySlack(msg: string): Promise<void> {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  const channel = Deno.env.get("SLACK_CHANNEL_ID");
  if (!token || !channel) return;
  try { await fetch("https://slack.com/api/chat.postMessage", { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ channel, text: msg }) }); } catch { }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check: allow service_role (cron) or verify admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.role !== "service_role") {
        const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
        const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { data: roleCheck } = await supabase.from("user_roles").select("id").eq("user_id", claims.claims.sub).eq("role", "admin").maybeSingle();
        if (!roleCheck) {
          return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    } catch {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let totalPosted = 0;
    await insertLog("system", "system", "FB auto-post started", "Checking for queued and auto-post articles.");

    // 1. Fetch all active pages
    const { data: allPages } = await supabase.from("facebook_pages").select("*").eq("is_active", true);
    if (!allPages || allPages.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_pages" }), { status: 200, headers: corsHeaders });
    }
    const results: any[] = [];

    // Process exactly 1 article per active page
    for (const page of allPages) {
      let targetArticleId = null;
      let isManualQueue = false;

      // FETCH NEXT QUEUED ARTICLE FOR THIS PAGE
      // (This now handles both manual and auto-queued items since we auto-insert on rewrite)
      const { data: queuedItems } = await supabase
        .from("article_fb_posts")
        .select("article_id, post_format")
        .eq("page_id", page.id)
        .eq("status", "queued")
        .order("created_at", { ascending: true }) // FIFO: First in, first out for the queue
        .limit(1);

      if (queuedItems && queuedItems.length > 0) {
        targetArticleId = queuedItems[0].article_id;
        isManualQueue = true; // We treat everything as "queued" now for consistent logic
      }

      // If we found an article to post for this page
      if (targetArticleId) {
        const { data: article } = await supabase
          .from("articles")
          .select("id, title, ai_title, slug, fb_caption, image, ai_thumbnail_url, categories(slug)")
          .eq("id", targetArticleId)
          .single();

        if (article) {
          const title = article.ai_title || article.title;
          const catSlug = (article as any).categories?.slug || "general";
          const url = buildArticleUrl(catSlug, article.slug);
          const caption = article.fb_caption || title;
          
          // Determine post format: if queued override exists use it, otherwise use page default, fallback to photo
          let format: 'link' | 'photo' = page.default_post_type || 'photo';
          if (isManualQueue && queuedItems && queuedItems[0].post_format) {
            format = queuedItems[0].post_format;
          }

          const fbResult = await postToFacebook(caption, url, article.ai_thumbnail_url!, page.page_id, page.access_token, format, article.id);

          if (!fbResult.success) {
            await insertLog("error", "system", `FB post failed: "${title}"`, fbResult.error, { articleId: article.id });
            await supabase.from("article_fb_posts").upsert({
              article_id: article.id, page_id: page.id, status: "failed", error_message: fbResult.error,
            }, { onConflict: "article_id,page_id" });
            continue;
          }

          const postId = fbResult.postId!;

          // Record success
          await supabase.from("article_fb_posts").upsert({
            article_id: article.id,
            page_id: page.id,
            status: isManualQueue ? "manual_posted" : "auto_posted",
            fb_post_id: postId,
            posted_at: new Date().toISOString(),
            error_message: null,
          }, { onConflict: "article_id,page_id" });

          await insertLog("info", "system", `FB ${isManualQueue ? 'manual-queue' : 'auto'} post: "${title}" → ${page.page_name}`, `Post: ${postId}`, { articleId: article.id, fbPostId: postId });
          await notifySlack(`📘 FB Post: *"${title}"* → ${page.page_name}\n${url}`);

          totalPosted++;
          results.push({ page: page.page_name, title, type: isManualQueue ? "queued" : "auto", postId });
        }
      }
    }

    return new Response(JSON.stringify({ posted: totalPosted, results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    await insertLog("error", "system", "Facebook auto-post job failed", String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
