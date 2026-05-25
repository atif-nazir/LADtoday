import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiJson, GeminiError } from "../_shared/gemini.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── US author names pool ─────────────────────────────────────────────────────

const US_FIRST_NAMES = [
  "James", "Sarah", "Michael", "Emily", "David", "Jessica", "Robert", "Ashley",
  "William", "Amanda", "Christopher", "Stephanie", "Daniel", "Jennifer", "Matthew",
  "Lauren", "Andrew", "Rachel", "Joshua", "Megan", "Ryan", "Hannah", "Brandon",
  "Samantha", "Tyler", "Olivia", "Nathan", "Abigail", "Kevin", "Madison",
  "Marcus", "Priya", "Carlos", "Wei", "Aisha", "Tomoko", "Diego", "Elena",
];

const US_LAST_NAMES = [
  "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez",
  "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "Martin",
  "Lee", "Thompson", "White", "Harris", "Clark", "Lewis", "Robinson", "Walker",
  "Young", "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson",
  "Patel", "Chen", "Kim", "Nguyen", "Tanaka", "Rivera", "Kowalski",
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

function generateRandomAuthor(): { name: string; bio: string; avatar: string } {
  const first = US_FIRST_NAMES[Math.floor(Math.random() * US_FIRST_NAMES.length)];
  const last = US_LAST_NAMES[Math.floor(Math.random() * US_LAST_NAMES.length)];
  const bio = AUTHOR_BIOS[Math.floor(Math.random() * AUTHOR_BIOS.length)];
  // Use UI Avatars for a realistic-looking avatar
  const avatar = `https://ui-avatars.com/api/?name=${first}+${last}&background=random&color=fff&size=128&bold=true&format=png`;
  return { name: `${first} ${last}`, bio, avatar };
}

function calculateReadTime(text: string): string {
  const wordsPerMinute = 230;
  const words = text.split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / wordsPerMinute));
  return `${minutes} min`;
}

// ─── Structured rewrite ───────────────────────────────────────────────────────

interface Section {
  heading: string;
  content: string;
  image?: string | null;
}

interface RewriteResult {
  ai_title: string;
  ai_subtitle: string;
  ai_summary: string;
  ai_sections: Section[];
  ai_introduction: string;
  ai_conclusion: string;
  ai_tags: string[];
  fb_caption: string;
}

async function callAI(
  title: string,
  subtitle: string,
  introduction: string,
  sections: Section[],
  conclusion: string
): Promise<RewriteResult> {
  const sectionDescriptions = sections
    .map((s, i) => `Section ${i + 1}: heading="${s.heading}", word count≈${s.content.split(/\s+/).length}`)
    .join("\n");

  const originalTitleWords = title.split(/\s+/).length;
  const originalSubtitleWords = subtitle ? subtitle.split(/\s+/).length : 0;

  const fullBody = [
    introduction ? `INTRODUCTION:\n${introduction}` : "",
    ...sections.map((s) => `## ${s.heading}\n${s.content}`),
    conclusion ? `CONCLUSION:\n${conclusion}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = `You are a senior editorial writer for a major publication like The Conversation or The Atlantic.

TASK: Rewrite the article below into a compelling, curiosity-driven piece that makes readers feel they MUST keep reading. The tone should be investigative, slightly urgent, and intellectually stimulating — like a well-crafted longform news piece.

CRITICAL WRITING STYLE RULES:
- Write with a tone of CURIOSITY and INTRIGUE — use questions, surprising facts, and tension to hook readers
- Each paragraph should make the reader want to read the next one
- Use short, punchy sentences mixed with longer analytical ones
- The opening line of the introduction must be a hook — a startling fact, a provocative question, or an unexpected angle
- Maintain journalistic credibility — factual, well-sourced feel
- Content must be SHORTER than original (aim for 60-70% of original length)
- Use short paragraphs (2-3 sentences max per paragraph)

TITLE RULES:
- Rewrite the title with the same level of curiosity and urgency
- The new title MUST contain 10 words or fewer. NEVER exceed 10 words. Count carefully before finalizing.
- Use question marks, dashes, or colons to create intrigue
- Make readers feel they'll miss something important if they don't click

SUBTITLE RULES:
- Rewrite the subtitle/caption with the same panic level, suspense, and curiosity as the title
- The new subtitle MUST be less than or equal to ${originalSubtitleWords || 15} words
- It should tease the content, creating an irresistible urge to read further
- Make it feel urgent and emotionally charged

FACEBOOK CAPTION RULES:
- Write a short Facebook post caption (15–25 words ONLY)
- Create INTENSE curiosity — the reader must feel they'll miss something huge if they don't click
- Use suspense, urgency, or a shocking hook
- You may use an ellipsis (…) or a dash (—) to build tension
- Do NOT use hashtags
- Write as if revealing a secret the reader almost wasn't supposed to know
- End with a cliffhanger, provocative question, or unfinished thought

SUBSECTION RULES:
- If any section's rewritten content is longer than 200 words, you MUST split it into logical subsections using a newline character (\n) as a paragraph break
- Each subsection should be 2-3 sentences max
- This keeps the article scannable and easy to read

STRUCTURE RULES:
- You MUST generate EXACTLY ${sections.length} sections. Not more, not less.
- Each section must have a heading and content
- Do NOT copy any sentences from the original
- Headings should be intriguing, not generic

ORIGINAL STRUCTURE (${sections.length} sections):
${sectionDescriptions}

ORIGINAL TITLE (${originalTitleWords} words): ${title}

ORIGINAL SUBTITLE: ${subtitle || '(none)'}

ORIGINAL BODY:
${fullBody}`;

  const sectionItems: Record<string, any> = {
    type: "array",
    minItems: sections.length,
    maxItems: sections.length,
    items: {
      type: "object",
      properties: {
        heading: { type: "string", description: "Intriguing section heading" },
        content: { type: "string", description: "Rewritten section content, curiosity-driven, shorter than original" },
      },
      required: ["heading", "content"],
    },
    description: `Array of EXACTLY ${sections.length} rewritten sections`,
  };

  const schema = {
    type: "object",
    properties: {
      ai_title: { type: "string" },
      ai_subtitle: { type: "string" },
      ai_summary: { type: "string" },
      ai_introduction: { type: "string" },
      ai_sections: sectionItems,
      ai_conclusion: { type: "string" },
      ai_tags: { type: "array", items: { type: "string" } },
      fb_caption: { type: "string" },
    },
    required: [
      "ai_title", "ai_subtitle", "ai_summary", "ai_introduction",
      "ai_sections", "ai_conclusion", "ai_tags", "fb_caption",
    ],
  };

  return await geminiJson<RewriteResult>(prompt, schema, { temperature: 0.8, maxOutputTokens: 8192 });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

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

    const { article_id, title, subtitle, introduction, sections, conclusion } = await req.json();

    if (!article_id || !title) {
      return new Response(JSON.stringify({ error: "Missing article_id or title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🤖 Rewriting article: ${article_id}`);

    // Step 1: AI rewrite
    const rewrite = await callAI(
      title,
      subtitle || "",
      introduction || "",
      sections || [],
      conclusion || ""
    );
    console.log(`✅ AI rewrite done: "${rewrite.ai_title}"`);

    // Step 2: Generate random US author
    const author = generateRandomAuthor();

    // Step 3: Calculate dynamic read time from AI content
    const allText = [
      rewrite.ai_introduction,
      ...rewrite.ai_sections.map(s => s.content),
      rewrite.ai_conclusion,
    ].join(" ");
    const readTime = calculateReadTime(allText);

    // Step 4: Preserve original section images on rewritten sections
    const aiSectionsWithImages = rewrite.ai_sections.map((s, i) => ({
      ...s,
      image: sections?.[i]?.image || null,
    }));

    // Step 5: Get current rewrite count
    const { data: currentArticle } = await supabase
      .from("articles")
      .select("ai_rewrite_count")
      .eq("id", article_id)
      .single();

    const currentCount = currentArticle?.ai_rewrite_count || 0;

    // Step 6: Save to DB
    const { error: updateError } = await supabase
      .from("articles")
      .update({
        ai_title: rewrite.ai_title,
        ai_content: JSON.stringify(aiSectionsWithImages),
        ai_summary: rewrite.ai_summary,
        ai_tags: rewrite.ai_tags,
        ai_generated_at: new Date().toISOString(),
        subtitle: rewrite.ai_subtitle,
        author_name: author.name,
        author_bio: author.bio,
        author_avatar: author.avatar,
        read_time: readTime,
        ai_rewrite_status: "completed",
        ai_rewrite_count: currentCount + 1,
        fb_caption: rewrite.fb_caption || null,
      })
      .eq("id", article_id);

    if (updateError) console.error("DB update error:", updateError.message);

    return new Response(
      JSON.stringify({
        success: true,
        ai_title: rewrite.ai_title,
        ai_subtitle: rewrite.ai_subtitle,
        ai_introduction: rewrite.ai_introduction,
        ai_sections: aiSectionsWithImages,
        ai_conclusion: rewrite.ai_conclusion,
        ai_summary: rewrite.ai_summary,
        ai_tags: rewrite.ai_tags,
        fb_caption: rewrite.fb_caption || "",
        author_name: author.name,
        author_bio: author.bio,
        author_avatar: author.avatar,
        read_time: readTime,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("❌ Rewrite failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof GeminiError ? err.status : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
