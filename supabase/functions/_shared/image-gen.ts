// ============================================================
// Image generation cascade: Lovable Gateway → Gemini → null
// Uploads result to `thumbnails` public bucket and returns URL.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canUse, track } from "./quota.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export interface ImageGenResult {
  url: string | null;
  provider: "lovable" | "gemini" | "none";
  error?: string;
  attempts: string[];
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function uploadPng(bytes: Uint8Array, prefix: string): Promise<string | null> {
  const path = `pipeline/${prefix}-${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage.from("thumbnails").upload(path, bytes, {
    contentType: "image/png",
    upsert: false,
  });
  if (error) { console.error("[image-gen] upload failed:", error.message); return null; }
  const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
  return data.publicUrl;
}

async function tryLovable(prompt: string): Promise<Uint8Array | null> {
  if (!LOVABLE_API_KEY || !canUse("lovable-image")) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-image-2",
      prompt,
      quality: "low",
      size: "1024x1024",
      n: 1,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Lovable gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Lovable returned no b64_json");
  track("lovable-image");
  return b64ToBytes(b64);
}

async function tryGemini(prompt: string): Promise<Uint8Array | null> {
  if (!GEMINI_API_KEY || !canUse("gemini-image")) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini image ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const inline = parts.find((p: any) => p.inlineData?.data);
  if (!inline) throw new Error("Gemini returned no inlineData");
  track("gemini-image");
  return b64ToBytes(inline.inlineData.data);
}

export async function generateImage(
  prompt: string,
  opts: { prefix?: string } = {}
): Promise<ImageGenResult> {
  const prefix = opts.prefix || "img";
  const attempts: string[] = [];

  for (const [name, fn] of [
    ["lovable", tryLovable] as const,
    ["gemini", tryGemini] as const,
  ]) {
    attempts.push(name);
    try {
      const bytes = await fn(prompt);
      if (!bytes) continue;
      const url = await uploadPng(bytes, prefix);
      if (url) return { url, provider: name, attempts };
    } catch (err) {
      console.warn(`[image-gen] ${name} failed:`, String(err).slice(0, 200));
      continue;
    }
  }
  return { url: null, provider: "none", error: "all image providers failed", attempts };
}
