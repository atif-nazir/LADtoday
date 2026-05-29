import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertLog } from "../_shared/logger.ts";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── US author names ──────────────────────────────────────────────────────────

const US_FIRST_NAMES = [
  "James","Sarah","Michael","Emily","David","Jessica","Robert","Ashley",
  "William","Amanda","Christopher","Stephanie","Daniel","Jennifer","Matthew",
  "Lauren","Andrew","Rachel","Joshua","Megan","Ryan","Hannah","Brandon",
  "Samantha","Tyler","Olivia","Nathan","Abigail","Kevin","Madison",
  "Marcus","Priya","Carlos","Wei","Aisha","Tomoko","Diego","Elena",
];
const US_LAST_NAMES = [
  "Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez",
  "Martinez","Anderson","Taylor","Thomas","Moore","Jackson","Martin",
  "Lee","Thompson","White","Harris","Clark","Lewis","Robinson","Walker",
  "Young","King","Wright","Scott","Green","Baker","Adams","Nelson",
  "Patel","Chen","Kim","Nguyen","Tanaka","Rivera","Kowalski",
];
const AUTHOR_BIOS = [
  "Senior correspondent covering politics, society, and global affairs.",
  "Investigative journalist specializing in international relations.",
  "Staff writer with expertise in technology and cultural trends.",
  "Award-winning reporter focused on health and science.",
  "Contributing editor covering economics and policy.",
  "Foreign affairs analyst and longtime field correspondent.",
  "Features writer exploring human stories behind the headlines.",
  "Digital media editor with a focus on emerging trends.",
];

function generateRandomAuthor() {
  const first = US_FIRST_NAMES[Math.floor(Math.random() * US_FIRST_NAMES.length)];
  const last = US_LAST_NAMES[Math.floor(Math.random() * US_LAST_NAMES.length)];
  const bio = AUTHOR_BIOS[Math.floor(Math.random() * AUTHOR_BIOS.length)];
  const avatar = `https://ui-avatars.com/api/?name=${first}+${last}&background=random&color=fff&size=128&bold=true&format=png`;
  return { name: `${first} ${last}`, bio, avatar };
}

function calculateReadTime(text: string): string {
  const words = text.split(/\s+/).length;
  return `${Math.max(1, Math.ceil(words / 230))} min`;
}

// ─── AI rewrite call ──────────────────────────────────────────────────────────

interface Section { heading: string; content: string; image?: string | null; }

async function callAI(
  title: string, subtitle: string, introduction: string,
  sections: Section[], conclusion: string
) {
  const originalTitleWords = title.split(/\s+/).length;
  const originalSubtitleWords = subtitle ? subtitle.split(/\s+/).length : 15;

  const fullBody = [
    introduction ? `INTRODUCTION:\n${introduction}` : "",
    ...sections.map((s) => `## ${s.heading}\n${s.content}`),
    conclusion ? `CONCLUSION:\n${conclusion}` : "",
  ].filter(Boolean).join("\n\n");

  const sectionDescriptions = sections
    .map((s, i) => `Section ${i + 1}: heading="${s.heading}", words≈${s.content.split(/\s+/).length}`)
    .join("\n");

  const prompt = `You are a senior editorial writer for a major publication like The Conversation or The Atlantic.

TASK: Rewrite the article below into a compelling, curiosity-driven piece that makes readers feel they MUST keep reading. The tone should be investigative, slightly urgent, and intellectually stimulating.

CRITICAL WRITING STYLE RULES:
- Write with a tone of CURIOSITY and INTRIGUE
- Each paragraph should make the reader want to read the next one
- Use short, punchy sentences mixed with longer analytical ones
- The opening line must be a hook
- Content must be SHORTER than original (60-70% of original length)
- Use short paragraphs (2-3 sentences max)

TITLE RULES:
- Rewrite the title with curiosity and urgency
- New title MUST be approximately ${originalTitleWords} words (±2 words)
- Use question marks, dashes, or colons to create intrigue

SUBTITLE RULES:
- Rewrite with panic level, suspense, and curiosity
- At most ${originalSubtitleWords} words

FACEBOOK CAPTION RULES:
- Write a short Facebook post caption (15–25 words ONLY)
- Create INTENSE curiosity — the reader must feel they'll miss something huge if they don't click
- Use suspense, urgency, or a shocking hook
- You may use an ellipsis (…) or a dash (—) to build tension
- Do NOT use hashtags
- Write as if revealing a secret the reader almost wasn't supposed to know
- End with a cliffhanger, provocative question, or unfinished thought

STRUCTURE RULES:
- Generate EXACTLY ${sections.length} sections
- Each section must have heading and content
- Do NOT copy any sentences from the original

ORIGINAL STRUCTURE (${sections.length} sections):
${sectionDescriptions}

ORIGINAL TITLE (${originalTitleWords} words): ${title}
ORIGINAL SUBTITLE: ${subtitle || '(none)'}

ORIGINAL BODY:
${fullBody}`;

  const schema = {
    type: "object",
    properties: {
      ai_title: { type: "string" },
      ai_subtitle: { type: "string" },
      ai_summary: { type: "string" },
      ai_introduction: { type: "string" },
      ai_sections: {
        type: "array",
        minItems: sections.length,
        maxItems: sections.length,
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            content: { type: "string" },
          },
          required: ["heading", "content"],
        },
      },
      ai_conclusion: { type: "string" },
      ai_tags: { type: "array", items: { type: "string" } },
      fb_caption: { type: "string" },
    },
    required: [
      "ai_title", "ai_subtitle", "ai_summary", "ai_introduction",
      "ai_sections", "ai_conclusion", "ai_tags", "fb_caption",
    ],
  };

  return await geminiJson(prompt, schema, { temperature: 0.8, maxOutputTokens: 8192 });
}

// ─── Slack notification ───────────────────────────────────────────────────────

async function notifySlack(message: string): Promise<void> {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  const channel = Deno.env.get("SLACK_CHANNEL_ID");
  if (!token || !channel) return;

  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text: message }),
    });
  } catch (err) {
    console.error("Slack notification failed:", err);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    console.log("🤖 Auto-rewrite job starting...");
    await insertLog("system", "ai-worker", "Auto-rewrite job started", "Checking for pending articles to process.");

    // Check if auto-rewrite is enabled
    const { data: setting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "auto_rewrite_enabled")
      .single();

    if (!setting || setting.value !== true) {
      console.log("⏸️ Auto-rewrite is disabled, skipping.");
      await insertLog("system", "ai-worker", "Auto-rewrite is disabled — skipping", "Setting auto_rewrite_enabled is false.");
      return new Response(JSON.stringify({ skipped: true, reason: "disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch pending articles (not currently being processed, never rewritten)
    const { data: pendingArticles, error: fetchErr } = await supabase
      .from("articles")
      .select("*, categories(name, slug)")
      .eq("ai_rewrite_status", "pending")
      .eq("published", false)
      .order("created_at", { ascending: true })
      .limit(5);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!pendingArticles || pendingArticles.length === 0) {
      console.log("✅ No pending articles to rewrite.");
      return new Response(JSON.stringify({ processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const article of pendingArticles) {
      const articleId = article.id;
      const articleTitle = article.title;

      // Mark as processing (lock to avoid duplicate processing)
      const { error: lockErr } = await supabase
        .from("articles")
        .update({ ai_rewrite_status: "processing" })
        .eq("id", articleId)
        .eq("ai_rewrite_status", "pending"); // optimistic lock

      if (lockErr) {
        console.error(`Failed to lock ${articleId}:`, lockErr.message);
        continue;
      }

      try {
        console.log(`🔄 Rewriting: "${articleTitle}"`);

        const sections = (article.sections || []) as Section[];
        const rewrite = await callAI(
          articleTitle,
          article.subtitle || "",
          article.introduction || "",
          sections,
          article.conclusion || ""
        );

        const author = generateRandomAuthor();
        const allText = [
          rewrite.ai_introduction,
          ...rewrite.ai_sections.map((s: Section) => s.content),
          rewrite.ai_conclusion,
        ].join(" ");
        const readTime = calculateReadTime(allText);

        // Preserve original section images
        const aiSectionsWithImages = rewrite.ai_sections.map((s: Section, i: number) => ({
          ...s,
          image: sections[i]?.image || null,
        }));

        // Update article with AI content and publish
        const { error: updateErr } = await supabase
          .from("articles")
          .update({
            ai_title: rewrite.ai_title,
            ai_content: JSON.stringify(aiSectionsWithImages),
            ai_summary: rewrite.ai_summary,
            ai_tags: rewrite.ai_tags,
            ai_generated_at: new Date().toISOString(),
            subtitle: rewrite.ai_subtitle,
            title: rewrite.ai_title,
            introduction: rewrite.ai_introduction,
            sections: aiSectionsWithImages,
            conclusion: rewrite.ai_conclusion,
            tags: rewrite.ai_tags,
            author_name: author.name,
            author_bio: author.bio,
            author_avatar: author.avatar,
            read_time: readTime,
            ai_rewrite_status: "completed",
            ai_rewrite_count: (article.ai_rewrite_count || 0) + 1,
            fb_caption: rewrite.fb_caption || null,
            published: true,
          })
          .eq("id", articleId);

        if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

        processed++;
        console.log(`✅ Rewritten & published: "${rewrite.ai_title}"`);

        // --- SOURCE-SPECIFIC AUTOMATIC FACEBOOK QUEUING ---
        try {
          const sourceId = (article as any).source_id;
          
          if (sourceId) {
            // Find FB pages linked to this specific source
            const { data: mappedPages } = await supabase
              .from("scraper_source_fb_pages")
              .select("page_id")
              .eq("source_id", sourceId);

            if (mappedPages && mappedPages.length > 0) {
              const pageIds = mappedPages.map(p => p.page_id);
              
              // Verify pages are active and have auto_post enabled
              const { data: activePages } = await supabase
                .from("facebook_pages")
                .select("id")
                .in("id", pageIds)
                .eq("is_active", true)
                .eq("auto_post", true);

              if (activePages && activePages.length > 0) {
                const queueEntries = activePages.map(page => ({
                  article_id: articleId,
                  page_id: page.id,
                  status: "queued"
                }));
                
                const { error: queueErr } = await supabase
                  .from("article_fb_posts")
                  .insert(queueEntries);
                
                if (queueErr) console.error("Failed to auto-queue for FB:", queueErr.message);
                else console.log(`📋 Auto-queued for ${activePages.length} mapped FB page(s)`);
              }
            }
          }
        } catch (fbErr) {
          console.error("FB queuing process failed:", fbErr);
        }
        // -------------------------------------------------

        await insertLog("ai", "ai-worker", `Article rewrite completed: "${rewrite.ai_title}"`,
          `Auto-rewritten and published successfully.`, { articleId, readTime, author: author.name });

        const catName = (article as any).categories?.name || "Unknown";
        await notifySlack(
          `✨ Auto-rewritten & published: *"${rewrite.ai_title}"* (${catName} category)`
        );

        // Rate-limit delay between articles
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.error(`❌ Failed to rewrite "${articleTitle}":`, err);
        failed++;
        await insertLog("error", "ai-worker", `Article rewrite failed: "${articleTitle}"`,
          String(err), { articleId });

        // Mark as failed so it doesn't get stuck
        await supabase
          .from("articles")
          .update({
            ai_rewrite_status: "failed",
            published: false,
          })
          .eq("id", articleId);

        await notifySlack(`❌ Auto-rewrite FAILED for: *"${articleTitle}"*`);
      }
    }

    const result = { processed, failed, timestamp: new Date().toISOString() };
    console.log("🏁 Auto-rewrite done:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Auto-rewrite job failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
