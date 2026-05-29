import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertLog } from "../_shared/logger.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SITE_URL = Deno.env.get("SITE_URL") || "https://ladtoday.com";

// Fallback env vars for backward compatibility
const FB_PAGE_ID_ENV = Deno.env.get("FB_PAGE_ID");
const FB_PAGE_ACCESS_TOKEN_ENV = Deno.env.get("FB_PAGE_ACCESS_TOKEN");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildArticleUrl(categorySlug: string, articleSlug: string): string {
  return `${SITE_URL}/article/${categorySlug}/${articleSlug}`;
}

// ─── Post to /feed with message + link + picture ────────────────────────────

async function postToFeed(
  caption: string,
  articleUrl: string,
  imageUrl: string,
  pageId: string,
  accessToken: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const body = new URLSearchParams({
      message: caption,
      link: articleUrl,
      picture: imageUrl,
      access_token: accessToken,
    });

    const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    if (!res.ok || data.error) return { success: false, error: data.error?.message || `HTTP ${res.status}` };

    return { success: true, postId: data.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check: verify caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: roleCheck } = await supabase.from("user_roles").select("id").eq("user_id", claims.claims.sub).eq("role", "admin").maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { articleId, pageId } = await req.json();
    if (!articleId) throw new Error("Missing articleId");

    // Fetch article
    const { data: a, error: fetchErr } = await supabase
      .from("articles")
      .select("id, title, ai_title, slug, fb_caption, ai_thumbnail_url, categories(slug)")
      .eq("id", articleId).single();

    if (fetchErr || !a) throw new Error(`Article not found: ${fetchErr?.message}`);
    if (!a.ai_thumbnail_url) throw new Error("Article missing AI thumbnail");

    // Resolve page credentials
    let fbPageId: string;
    let fbAccessToken: string;
    let fbPageDbId: string | null = null;

    if (pageId) {
      // Look up from facebook_pages table
      const { data: page, error: pageErr } = await supabase
        .from("facebook_pages")
        .select("id, page_id, access_token, page_name")
        .eq("id", pageId)
        .eq("is_active", true)
        .single();

      if (pageErr || !page) throw new Error(`Facebook page not found or inactive: ${pageErr?.message}`);
      fbPageId = page.page_id;
      fbAccessToken = page.access_token;
      fbPageDbId = page.id;
    } else if (FB_PAGE_ID_ENV && FB_PAGE_ACCESS_TOKEN_ENV) {
      // Backward compatibility: use env vars
      fbPageId = FB_PAGE_ID_ENV;
      fbAccessToken = FB_PAGE_ACCESS_TOKEN_ENV;
    } else {
      throw new Error("No pageId provided and no FB env vars configured");
    }

    const title = a.ai_title || a.title;
    const catSlug = (a as any).categories?.slug || "general";
    const url = buildArticleUrl(catSlug, a.slug);
    const caption = a.fb_caption || title;

    // Post to /feed with caption + link + thumbnail
    const feedResult = await postToFeed(caption, url, a.ai_thumbnail_url, fbPageId, fbAccessToken);
    if (!feedResult.success) {
      await insertLog("error", "system", `Manual FB post failed: "${title}"`, feedResult.error, { articleId });

      // Record failure in junction table if we have a DB page ID
      if (fbPageDbId) {
        await supabase.from("article_fb_posts").upsert({
          article_id: articleId,
          page_id: fbPageDbId,
          status: "failed",
          error_message: feedResult.error,
        }, { onConflict: "article_id,page_id" });
      }

      throw new Error(feedResult.error);
    }

    const postId = feedResult.postId!;

    // Mark posted in legacy column
    await supabase.from("articles").update({
      fb_status: "manual_posted",
      fb_posted_at: new Date().toISOString(),
      fb_post_id: postId,
    }).eq("id", articleId);

    // Record in junction table
    if (fbPageDbId) {
      await supabase.from("article_fb_posts").upsert({
        article_id: articleId,
        page_id: fbPageDbId,
        status: "manual_posted",
        fb_post_id: postId,
        posted_at: new Date().toISOString(),
        error_message: null,
      }, { onConflict: "article_id,page_id" });
    }

    await insertLog("info", "system", `Manual FB post published: "${title}"`, `Post: ${postId}`, { articleId, fbPostId: postId });

    return new Response(JSON.stringify({ success: true, postId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("❌ Manual post failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
