import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Sparkles, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { generateThumbnailCanvas, uploadThumbnailBlob } from "@/utils/thumbnailGenerator";

interface Section {
  heading: string;
  content: string;
  image?: string | null;
}

interface RewritePanelProps {
  article: {
    id: string;
    title: string;
    subtitle: string | null;
    introduction: string | null;
    sections: Section[];
    conclusion: string | null;
    tags: string[] | null;
    image: string;
  };
  onClose: () => void;
}

// ─── Typewriter that fills a field char by char ───────────────────────────────

function useSequentialTypewriter() {
  const [queue, setQueue] = useState<{ key: string; text: string }[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [allDone, setAllDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const enqueue = useCallback((items: { key: string; text: string }[]) => {
    setQueue(items);
    setValues({});
    setDoneKeys(new Set());
    setAllDone(false);
    setActiveKey(null);
  }, []);

  // Pick next item from queue
  useEffect(() => {
    if (activeKey) return;
    const nextItem = queueRef.current.find((q) => !doneKeys.has(q.key));
    if (nextItem) {
      setActiveKey(nextItem.key);
    } else if (queueRef.current.length > 0 && doneKeys.size >= queueRef.current.length) {
      setAllDone(true);
    }
  }, [activeKey, doneKeys]);

  // Animate current item
  useEffect(() => {
    if (!activeKey) return;
    const item = queueRef.current.find((q) => q.key === activeKey);
    if (!item) return;

    let i = 0;
    const speed = item.text.length > 500 ? 2 : item.text.length > 100 ? 4 : 12;

    intervalRef.current = setInterval(() => {
      i++;
      const chunk = item.text.slice(0, i);
      setValues((prev) => ({ ...prev, [item.key]: chunk }));
      if (i >= item.text.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDoneKeys((prev) => new Set([...prev, item.key]));
        setActiveKey(null);
      }
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeKey]);

  const setValue = useCallback((key: string, text: string) => {
    setValues((prev) => ({ ...prev, [key]: text }));
  }, []);

  return { values, doneKeys, activeKey, allDone, enqueue, setValue };
}


// ─── Component ────────────────────────────────────────────────────────────────

const RewritePanel = ({ article, onClose }: RewritePanelProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const [aiSections, setAiSections] = useState<Section[]>([]);
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [aiThumbnailUrl, setAiThumbnailUrl] = useState<string | null>(null);
  const [aiFbCaption, setAiFbCaption] = useState<string | null>(null);

  const tw = useSequentialTypewriter();
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll right panel
  useEffect(() => {
    if (rightPanelRef.current && !tw.allDone) {
      rightPanelRef.current.scrollTop = rightPanelRef.current.scrollHeight;
    }
  }, [tw.values, tw.allDone]);

  const handleRewrite = async () => {
    setLoading(true);
    setGenerated(false);
    try {
      // ── Build prompt ──
      const sectionDescriptions = article.sections
        .map((s, i) => `Section ${i + 1}: "${s.heading}" (${s.content.length} chars)`)
        .join("\n");

      const fullBody = [
        article.introduction ? `INTRODUCTION:\n${article.introduction}` : "",
        ...article.sections.map((s) => `## ${s.heading}\n${s.content}`),
        article.conclusion ? `CONCLUSION:\n${article.conclusion}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const prompt = `You are a professional news editor.

TASK: Rewrite the article below so it is 100% original but SHORTER and more concise.

CRITICAL RULES:
- You MUST generate EXACTLY ${article.sections.length} sections. Not more, not less.
- Each section must have a heading and content
- Content in each section must be SHORTER than the original (aim for 60-70% of original length)
- Introduction and conclusion should also be shorter
- Do NOT copy any sentences from the original
- Improve readability, use short paragraphs
- Maintain factual meaning
- Generate a new catchy SEO title (under 65 chars)
- Generate a 1-2 sentence summary
- Generate 4-6 relevant tags

ORIGINAL STRUCTURE (${article.sections.length} sections):
${sectionDescriptions}

ORIGINAL TITLE: ${article.title}

ORIGINAL BODY:
${fullBody}

Respond in this exact JSON format:
{
  "ai_title": "New Title",
  "ai_summary": "1-2 sentence summary",
  "ai_introduction": "Rewritten introduction",
  "ai_sections": [${article.sections.map(() => '{ "heading": "...", "content": "..." }').join(", ")}],
  "ai_conclusion": "Rewritten conclusion",
  "ai_tags": ["tag1", "tag2", "tag3"]
}`;

      // ── Call Gemini directly (free tier) ──
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rewrite-article`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            article_id: article.id,
            title: article.title,
            subtitle: article.subtitle || "",
            introduction: article.introduction || "",
            sections: article.sections,
            conclusion: article.conclusion || "",
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Rewrite failed");
      }

      const data = await res.json();

      const sections: Section[] = data.ai_sections || [];
      setAiSections(sections);
      setAiTags(data.ai_tags || []);
      setAiFbCaption(data.fb_caption || null);

      // Generate branded thumbnail on frontend
      const aiTitle = data.ai_title || article.title;
      try {
        const blob = await generateThumbnailCanvas(
          article.image,
          aiTitle
        );
        const thumbUrl = await uploadThumbnailBlob(article.id, blob);
        setAiThumbnailUrl(thumbUrl);
      } catch (thumbErr) {
        console.warn("Thumbnail generation failed:", thumbErr);
        setAiThumbnailUrl(data.ai_thumbnail_url || null);
      }

      // Build typewriter queue
      const queue: { key: string; text: string }[] = [];
      if (data.ai_title) queue.push({ key: "title", text: data.ai_title });
      if (data.ai_summary) queue.push({ key: "summary", text: data.ai_summary });
      if (data.ai_introduction) queue.push({ key: "introduction", text: data.ai_introduction });
      sections.forEach((s, i) => {
        if (s.heading) queue.push({ key: `section_heading_${i}`, text: s.heading });
        if (s.content) queue.push({ key: `section_content_${i}`, text: s.content });
      });
      if (data.ai_conclusion) queue.push({ key: "conclusion", text: data.ai_conclusion });
      if (data.fb_caption) queue.push({ key: "fb_caption", text: data.fb_caption });

      tw.enqueue(queue);
      setGenerated(true);
    } catch (err: any) {
      toast.error(err.message || "AI rewrite failed");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDraft = async () => {
    const sections = aiSections.map((s, i) => ({
      heading: tw.values[`section_heading_${i}`] || s.heading,
      content: tw.values[`section_content_${i}`] || s.content,
      image: s.image || null,
    }));

    const payload: Record<string, any> = {
      title: tw.values.title || "",
      subtitle: tw.values.summary || null,
      introduction: tw.values.introduction || null,
      sections: sections.filter((s) => s.heading || s.content),
      conclusion: tw.values.conclusion || null,
      tags: aiTags,
      ai_thumbnail_url: aiThumbnailUrl,
      thumbnail_generated_count: aiThumbnailUrl ? 1 : 0, // Mark generated
      fb_caption: tw.values.fb_caption || aiFbCaption || null,
    };

    // Don't replace article image — thumbnail only saved to storage
    // Original article image stays as-is

    const { error } = await supabase
      .from("articles")
      .update(payload)
      .eq("id", article.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Draft updated with AI content!");
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      onClose();
    }
  };

  const isFieldActive = (key: string) => tw.activeKey === key;
  const isFieldDone = (key: string) => tw.doneKeys.has(key);
  const getFieldValue = (key: string) => tw.values[key] || "";

  // Cursor element for active fields
  const Cursor = () => (
    <span className="inline-block w-0.5 h-4 bg-[#FA76FF] ml-0.5 animate-pulse align-middle" />
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-[#FA76FF]" />
          <h2 className="text-sm font-bold uppercase tracking-wider">
            AI Article Rewrite
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {!generated && !loading && (
            <Button
              onClick={handleRewrite}
              className="rounded-full gap-2 bg-[#FA76FF] hover:bg-[#e060e8] text-white"
            >
              <Sparkles className="w-4 h-4" />
              Rewrite with AI
            </Button>
          )}
          {generated && (
            <Button
              onClick={handleUpdateDraft}
              className="rounded-full gap-2"
            >
              <Check className="w-4 h-4" />
              Update Draft
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-full gap-2"
          >
            <X className="w-4 h-4" />
            Cancel
          </Button>
        </div>
      </div>

      {/* Split panels */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
        {/* ── Left: Original ── */}
        <div className="border-r border-border overflow-y-auto p-6 space-y-5">
          <div className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
            Original Draft
          </div>

          {article.image && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Cover Image</p>
              <img src={article.image} alt="Original" className="w-full h-48 object-cover border border-border" />
            </div>
          )}

          <div className="space-y-1">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Title</p>
            <p className="text-lg font-bold">{article.title}</p>
          </div>

          {article.subtitle && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Summary</p>
              <p className="text-sm text-muted-foreground">{article.subtitle}</p>
            </div>
          )}

          {article.introduction && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Introduction</p>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{article.introduction}</p>
            </div>
          )}

          {article.sections.map((s, i) => (
            <div key={i} className="border border-border rounded-lg p-4 space-y-2">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Section {i + 1}</p>
              {s.heading && <p className="font-bold text-sm">{s.heading}</p>}
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{s.content}</p>
              {s.image && <img src={s.image} alt={s.heading} className="w-full h-32 object-cover rounded border border-border mt-2" />}
            </div>
          ))}

          {article.conclusion && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Conclusion</p>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line italic">{article.conclusion}</p>
            </div>
          )}

          {article.tags && article.tags.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Tags</p>
              <div className="flex flex-wrap gap-2">
                {article.tags
                  .filter((t) => t !== "show_edit_tag" && t !== "is_featured")
                  .map((t) => (
                    <span key={t} className="px-2 py-0.5 text-xs bg-muted rounded-full border border-border">{t}</span>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: AI Generated (editable fields) ── */}
        <div ref={rightPanelRef} className="overflow-y-auto p-6 space-y-5 bg-background">
          <div className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#FA76FF]/10 text-[#FA76FF] border border-[#FA76FF]/30">
            AI Generated
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 className="w-8 h-8 text-[#FA76FF] animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">AI rewriting article...</p>
            </div>
          )}

          {/* Not started */}
          {!loading && !generated && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
              <Sparkles className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Click <strong>"Rewrite with AI"</strong> to generate a rewritten version.
              </p>
            </div>
          )}

          {/* Generated: editable fields */}
          {generated && (
            <>
              {/* AI Thumbnail */}
              {aiThumbnailUrl && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase text-[#FA76FF]/60 tracking-wider">AI Generated Cover</p>
                  <img src={aiThumbnailUrl} alt="AI Thumbnail" className="w-full h-48 object-cover border border-[#FA76FF]/30" />
                </div>
              )}

              {/* Title */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-[#FA76FF]/60 tracking-wider">Title</p>
                <div className={`border rounded-lg px-3 py-2 transition-colors ${isFieldActive("title") ? "border-[#FA76FF] bg-[#FA76FF]/5" : "border-border"}`}>
                  {isFieldDone("title") || tw.allDone ? (
                    <Input
                      value={getFieldValue("title")}
                      onChange={(e) => tw.setValue("title", e.target.value)}
                      className="border-0 p-0 h-auto text-lg font-bold focus-visible:ring-0"
                    />
                  ) : (
                    <p className="text-lg font-bold">
                      {getFieldValue("title")}
                      {isFieldActive("title") && <Cursor />}
                    </p>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-[#FA76FF]/60 tracking-wider">Summary</p>
                <div className={`border rounded-lg px-3 py-2 transition-colors ${isFieldActive("summary") ? "border-[#FA76FF] bg-[#FA76FF]/5" : "border-border"}`}>
                  {isFieldDone("summary") || tw.allDone ? (
                    <Textarea
                      value={getFieldValue("summary")}
                      onChange={(e) => tw.setValue("summary", e.target.value)}
                      className="border-0 p-0 min-h-0 resize-none focus-visible:ring-0 text-sm"
                      rows={2}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {getFieldValue("summary")}
                      {isFieldActive("summary") && <Cursor />}
                    </p>
                  )}
                </div>
              </div>

              {/* Introduction */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-[#FA76FF]/60 tracking-wider">Introduction</p>
                <div className={`border rounded-lg px-3 py-2 transition-colors ${isFieldActive("introduction") ? "border-[#FA76FF] bg-[#FA76FF]/5" : "border-border"}`}>
                  {isFieldDone("introduction") || tw.allDone ? (
                    <Textarea
                      value={getFieldValue("introduction")}
                      onChange={(e) => tw.setValue("introduction", e.target.value)}
                      className="border-0 p-0 min-h-0 resize-none focus-visible:ring-0 text-sm"
                      rows={4}
                    />
                  ) : (
                    <p className="text-sm text-foreground/80 whitespace-pre-line">
                      {getFieldValue("introduction")}
                      {isFieldActive("introduction") && <Cursor />}
                    </p>
                  )}
                </div>
              </div>

              {/* Sections */}
              {aiSections.map((s, i) => (
                <div key={i} className={`border rounded-lg p-4 space-y-2 transition-colors ${isFieldActive(`section_heading_${i}`) || isFieldActive(`section_content_${i}`)
                    ? "border-[#FA76FF] bg-[#FA76FF]/5"
                    : "border-border"
                  }`}>
                  <p className="text-[10px] uppercase text-[#FA76FF]/60 tracking-wider">Section {i + 1}</p>

                  {/* Section heading */}
                  {isFieldDone(`section_heading_${i}`) || tw.allDone ? (
                    <Input
                      value={getFieldValue(`section_heading_${i}`)}
                      onChange={(e) => tw.setValue(`section_heading_${i}`, e.target.value)}
                      className="border-0 p-0 h-auto font-bold text-sm focus-visible:ring-0"
                    />
                  ) : (
                    <p className="font-bold text-sm">
                      {getFieldValue(`section_heading_${i}`)}
                      {isFieldActive(`section_heading_${i}`) && <Cursor />}
                    </p>
                  )}

                  {/* Section content */}
                  {isFieldDone(`section_content_${i}`) || tw.allDone ? (
                    <Textarea
                      value={getFieldValue(`section_content_${i}`)}
                      onChange={(e) => tw.setValue(`section_content_${i}`, e.target.value)}
                      className="border-0 p-0 min-h-0 resize-none focus-visible:ring-0 text-sm"
                      rows={5}
                    />
                  ) : (
                    <p className="text-sm text-foreground/80 whitespace-pre-line">
                      {getFieldValue(`section_content_${i}`)}
                      {isFieldActive(`section_content_${i}`) && <Cursor />}
                    </p>
                  )}

                  {/* Section image (preserved from original) */}
                  {s.image && (
                    <img src={s.image} alt={s.heading} className="w-full h-32 object-cover rounded border border-[#FA76FF]/20 mt-2" />
                  )}
                </div>
              ))}

              {/* Conclusion */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-[#FA76FF]/60 tracking-wider">Conclusion</p>
                <div className={`border rounded-lg px-3 py-2 transition-colors ${isFieldActive("conclusion") ? "border-[#FA76FF] bg-[#FA76FF]/5" : "border-border"}`}>
                  {isFieldDone("conclusion") || tw.allDone ? (
                    <Textarea
                      value={getFieldValue("conclusion")}
                      onChange={(e) => tw.setValue("conclusion", e.target.value)}
                      className="border-0 p-0 min-h-0 resize-none focus-visible:ring-0 text-sm"
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm text-foreground/80 whitespace-pre-line italic">
                      {getFieldValue("conclusion")}
                      {isFieldActive("conclusion") && <Cursor />}
                    </p>
                  )}
                </div>
              </div>

              {/* Tags */}
              {aiTags.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase text-[#FA76FF]/60 tracking-wider">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {aiTags.map((t) => (
                      <span key={t} className="px-2 py-0.5 text-xs bg-[#FA76FF]/10 text-[#FA76FF] rounded-full border border-[#FA76FF]/30">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* FB Caption */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-[#FA76FF]/60 tracking-wider">Facebook Caption</p>
                <div className={`border rounded-lg px-3 py-2 transition-colors ${isFieldActive("fb_caption") ? "border-[#FA76FF] bg-[#FA76FF]/5" : "border-border"}`}>
                  {isFieldDone("fb_caption") || tw.allDone ? (
                    <Textarea
                      value={getFieldValue("fb_caption")}
                      onChange={(e) => tw.setValue("fb_caption", e.target.value)}
                      className="border-0 p-0 min-h-0 resize-none focus-visible:ring-0 text-sm"
                      rows={2}
                    />
                  ) : (
                    <p className="text-sm text-foreground/80">
                      {getFieldValue("fb_caption")}
                      {isFieldActive("fb_caption") && <Cursor />}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RewritePanel;
