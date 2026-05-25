/**
 * Standalone caption generator — calls the Lovable AI gateway
 * to produce a short, attention-grabbing Facebook caption
 * without doing a full article rewrite.
 */

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

export async function generateCaptionForArticle(
  title: string,
  subtitle: string | null,
  introduction: string | null
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const userMessage = `${CAPTION_PROMPT}

ARTICLE TITLE: ${title}
ARTICLE SUBTITLE: ${subtitle || "(none)"}
ARTICLE INTRO: ${introduction ? introduction.slice(0, 300) : "(none)"}

Respond with ONLY the caption text, nothing else. No quotes, no labels.`;

  const res = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ title, subtitle, introduction }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Caption generation failed");
  }

  const data = await res.json();
  return data.caption || "";
}
