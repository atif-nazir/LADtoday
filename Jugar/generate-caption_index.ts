import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiText, GeminiError } from "../_shared/gemini.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CAPTION_PROMPT = `You are a viral social media copywriter for a major news brand.

TASK: Write a Facebook post caption for the article described below.

RULES:
- EXACTLY 15–25 words. No more, no less.
- Create INTENSE curiosity — the reader must feel they'll miss something huge if they don't click
- Use suspense, urgency, or a shocking hook
- You may use an ellipsis (…) or a dash (—) to build tension
- Do NOT use hashtags
- Do NOT start with "Breaking:" or "Just in:"
- Write as if revealing a secret the reader almost wasn't supposed to know
- End with something that makes the reader NEED to click — a cliffhanger, a provocative question, or an unfinished thought

EXAMPLES OF GREAT CAPTIONS:
- "Scientists just found something in the ocean that wasn't supposed to exist… and it changes everything we thought we knew."
- "This tiny policy change could wipe out your savings — and most people won't notice until it's too late."
- "Nobody's talking about what actually happened behind closed doors. The details are staggering."`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { title, subtitle, introduction, article_id } = await req.json();

    if (!title) {
      return new Response(JSON.stringify({ error: "Missing title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMessage = `${CAPTION_PROMPT}

ARTICLE TITLE: ${title}
ARTICLE SUBTITLE: ${subtitle || "(none)"}
ARTICLE INTRO: ${introduction ? String(introduction).slice(0, 300) : "(none)"}

Respond with ONLY the caption text, nothing else. No quotes, no labels, no explanation.`;

    const raw = await geminiText(userMessage, { maxOutputTokens: 200, temperature: 0.9 });
    const caption = raw.trim().replace(/^["']|["']$/g, "");

    // If article_id is provided, also save to DB
    if (article_id) {
      await supabase
        .from("articles")
        .update({ fb_caption: caption })
        .eq("id", article_id);
    }

    return new Response(JSON.stringify({ caption }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Caption generation failed:", err);
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
