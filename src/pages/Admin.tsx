import { useState, useEffect, useMemo } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useAllArticlesAdmin, useCategories, getArticlePath } from "@/hooks/useArticles";
import { supabase } from "@/integrations/supabase/client";
import RewritePanel from "@/components/RewritePanel";
import { AdminShell, openMobileSidebar } from "@/components/AdminShell";
import { AdminPageSkeleton } from "@/components/AdminSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Plus, Edit, Trash2, Eye, EyeOff, Sparkles, AlertTriangle,
  CheckCircle, Clock, Loader2, ImagePlus, MessageSquare, Copy,
  Search, MoreHorizontal, ExternalLink, ChevronRight, X, ArrowUpDown,
  Menu, Image, ChevronDown, RefreshCw, Facebook, Send, Wand2, Check
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { generateThumbnailCanvas, uploadThumbnailBlob, getThemeForCategory, getThemeByKey, THUMBNAIL_THEMES, type ThumbnailTheme } from "@/utils/thumbnailGenerator";
import { generateCaptionForArticle } from "@/utils/generateCaption";

// ─── Types ──────────────────────────────────────────────────────────────────

type FilterStatus = "all" | "published" | "draft";
type FilterAI = "all" | "pending" | "processing" | "completed" | "failed";
type SortOrder = "newest" | "oldest";

// ─── Styled filter button ──────────────────────────────────────────────────

const FilterDropdown = ({ label, value, options, onChange }: {
  label: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) => {
  const selected = options.find(o => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-7 px-2.5 text-[11px] rounded-lg border border-border bg-background hover:bg-muted transition-colors flex items-center gap-1.5 shrink-0">
          <span className="text-muted-foreground">{label}:</span>
          <span className="font-medium">{selected?.label || value}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40 p-1 rounded-xl shadow-lg border border-border/80">
        {options.map(o => (
          <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}
            className={`text-xs rounded-lg px-2.5 py-1.5 cursor-pointer ${value === o.value ? "bg-[#FA76FF]/10 text-[#FA76FF] font-medium" : ""}`}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

const Admin = () => {
  const { user, isAdmin, loading } = useIsAdmin();
  const { data: articles, isLoading: articlesLoading } = useAllArticlesAdmin();
  const { data: categories } = useCategories();
  const queryClient = useQueryClient();

  // UI state
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rewritingArticle, setRewritingArticle] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);

  // Thumbnail generation animation
  const [thumbAnimatingId, setThumbAnimatingId] = useState<string | null>(null);
  const [thumbAnimStage, setThumbAnimStage] = useState<"building" | "done" | null>(null);
  const [thumbAnimUrl, setThumbAnimUrl] = useState<string | null>(null);

  // Generation
  const [generatingThumbnails, setGeneratingThumbnails] = useState(false);
  const [singleGeneratingId, setSingleGeneratingId] = useState<string | null>(null);
  const [captionGeneratingId, setCaptionGeneratingId] = useState<string | null>(null);
  const [generatingCaptions, setGeneratingCaptions] = useState(false);
  const [fbPostingId, setFbPostingId] = useState<string | null>(null);

  // Multi-page Facebook posting
  const [fbPages, setFbPages] = useState<any[]>([]);
  const [fbPostDialog, setFbPostDialog] = useState<{ article: any; selectedPages: Set<string>; strategy: 'queue' | 'instant'; post_format: 'photo' | 'link' } | null>(null);
  const [fbMultiPosting, setFbMultiPosting] = useState(false);

  // Manual generation config dialog
  const [manualThumbConfirm, setManualThumbConfirm] = useState<{ article: any; theme: string; template: "classic" | "bordered" } | null>(null);

  // Bulk FB posting to a specific page
  const [bulkFbDialog, setBulkFbDialog] = useState(false);
  const [bulkFbSelectedPage, setBulkFbSelectedPage] = useState<string | null>(null);
  const [bulkFbPosting, setBulkFbPosting] = useState(false);

  // Bulk confirm dialog
  const [bulkConfirm, setBulkConfirm] = useState<{
    type: "thumbnails" | "captions" | null;
    count: number;
    targets: any[];
  }>({ type: null, count: 0, targets: [] });

  // Bulk progress dialog
  const [bulkProgress, setBulkProgress] = useState<{
    type: "thumbnails" | "captions" | null;
    current: number;
    total: number;
  }>({ type: null, current: 0, total: 0 });

  const [bulkConfig, setBulkConfig] = useState<{
    template: "classic" | "bordered";
    theme: string;
  }>({ template: "classic", theme: "pink" });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterAI, setFilterAI] = useState<FilterAI>("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  // Editor
  const [authorOpen, setAuthorOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", subtitle: "", slug: "", category_id: "", date: new Date().toISOString().split("T")[0],
    read_time: "5 min", image: "", author_name: "", author_avatar: "", author_bio: "",
    author_twitter: "", author_instagram: "", author_linkedin: "", author_facebook: "",
    introduction: "", sections: [{ heading: "", content: "" }] as { heading: string; content: string }[],
    conclusion: "", tags: "", published: false, show_edit_tag: false, is_featured: false,
  });

  // ─── Fetch Facebook pages ──────────────────────────────────────────────
  useEffect(() => {
    supabase.from("facebook_pages").select("*").eq("is_active", true).order("created_at")
      .then(({ data }) => { if (data) setFbPages(data); });
  }, []);

  // ─── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "n" && !showEditor) { e.preventDefault(); resetForm(); setShowEditor(true); }
      if (e.key === "Escape" && showEditor) { e.preventDefault(); resetForm(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showEditor]);

  // ─── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!articles) return { total: 0, published: 0, drafts: 0, pending: 0, processing: 0, completed: 0, failed: 0, thumbCount: 0, captionCount: 0 };
    return {
      total: articles.length,
      published: articles.filter(a => a.published).length,
      drafts: articles.filter(a => !a.published).length,
      pending: articles.filter(a => a.ai_rewrite_status === "pending").length,
      processing: articles.filter(a => a.ai_rewrite_status === "processing").length,
      completed: articles.filter(a => a.ai_rewrite_status === "completed").length,
      failed: articles.filter(a => a.ai_rewrite_status === "failed").length,
      thumbCount: articles.filter(a => (a.thumbnail_generated_count || 0) > 0).length,
      captionCount: articles.filter(a => !!a.fb_caption).length,
    };
  }, [articles]);

  // ─── Filtered + sorted ────────────────────────────────────────────────
  const filteredArticles = useMemo(() => {
    let list = articles || [];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a => a.title.toLowerCase().includes(q) || a.author_name.toLowerCase().includes(q));
    }
    if (filterStatus === "published") list = list.filter(a => a.published);
    if (filterStatus === "draft") list = list.filter(a => !a.published);
    if (filterAI !== "all") list = list.filter(a => a.ai_rewrite_status === filterAI);
    if (filterCategory !== "all") list = list.filter(a => a.category_id === filterCategory);
    list = [...list].sort((a, b) => {
      const dA = new Date(a.created_at).getTime(), dB = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? dB - dA : dA - dB;
    });
    return list;
  }, [articles, searchQuery, filterStatus, filterAI, filterCategory, sortOrder]);

  // ─── Handlers ─────────────────────────────────────────────────────────
  const resetForm = () => {
    setForm({
      title: "", subtitle: "", slug: "", category_id: "", date: new Date().toISOString().split("T")[0],
      read_time: "5 min", image: "", author_name: "", author_avatar: "", author_bio: "",
      author_twitter: "", author_instagram: "", author_linkedin: "", author_facebook: "",
      introduction: "", sections: [{ heading: "", content: "" }], conclusion: "", tags: "",
      published: false, show_edit_tag: false, is_featured: false,
    });
    setEditingId(null);
    setShowEditor(false);
    setAuthorOpen(false);
  };

  const handleEdit = (article: any) => {
    setForm({
      title: article.title, subtitle: article.subtitle || "", slug: article.slug,
      category_id: article.category_id, date: article.date, read_time: article.read_time,
      image: article.image, author_name: article.author_name, author_avatar: article.author_avatar || "",
      author_bio: article.author_bio || "", author_twitter: article.author_twitter || "",
      author_instagram: article.author_instagram || "", author_linkedin: article.author_linkedin || "",
      author_facebook: article.author_facebook || "", introduction: article.introduction || "",
      sections: article.sections || [{ heading: "", content: "" }],
      conclusion: article.conclusion || "",
      tags: (article.tags || []).filter((t: string) => t !== "show_edit_tag" && t !== "is_featured").join(", "),
      published: article.published,
      show_edit_tag: (article.tags || []).includes("show_edit_tag"),
      is_featured: (article.tags || []).includes("is_featured"),
    });
    setEditingId(article.id);
    setShowEditor(true);
  };

  const generateSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: form.title, subtitle: form.subtitle || null,
      slug: form.slug || generateSlug(form.title), category_id: form.category_id,
      date: form.date, read_time: form.read_time, image: form.image,
      author_name: form.author_name, author_avatar: form.author_avatar || null,
      author_bio: form.author_bio || null, author_twitter: form.author_twitter || null,
      author_instagram: form.author_instagram || null, author_linkedin: form.author_linkedin || null,
      author_facebook: form.author_facebook || null, introduction: form.introduction || null,
      sections: form.sections.filter(s => s.heading || s.content),
      conclusion: form.conclusion || null,
      tags: [
        ...(form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : []),
        ...(form.show_edit_tag ? ["show_edit_tag"] : []),
        ...(form.is_featured ? ["is_featured"] : []),
      ],
      published: form.published,
    };
    let error;
    if (editingId) ({ error } = await supabase.from("articles").update(payload).eq("id", editingId));
    else ({ error } = await supabase.from("articles").insert(payload));
    if (error) toast.error(error.message);
    else { toast.success(editingId ? "Updated!" : "Created!"); queryClient.invalidateQueries({ queryKey: ["articles"] }); resetForm(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this article?")) return;
    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted!"); queryClient.invalidateQueries({ queryKey: ["articles"] }); }
  };

  const togglePublish = async (id: string, published: boolean) => {
    const { error } = await supabase.from("articles").update({ published: !published }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(published ? "Unpublished" : "Published!"); queryClient.invalidateQueries({ queryKey: ["articles"] }); }
  };

  const retryRewrite = async (article: any) => {
    const { error } = await supabase.from("articles").update({ ai_rewrite_status: "pending", published: false }).eq("id", article.id);
    if (error) toast.error(error.message);
    else { toast.success("Queued for rewrite"); queryClient.invalidateQueries({ queryKey: ["articles"] }); }
  };

  const promptManualThumbnail = (article: any) => {
    // Priority: 1. Source Settings, 2. Category Settings, 3. Defaults
    let defaultThemeKey = "pink";
    let defaultTemplate: "classic" | "bordered" = "classic";

    const source = (article as any)?.scraper_sources;
    const category = (article as any)?.categories;

    if (source?.thumbnail_theme) {
      defaultThemeKey = source.thumbnail_theme;
      defaultTemplate = (source.thumbnail_template as "classic" | "bordered") || "classic";
    } else if (category?.thumbnail_theme) {
      defaultThemeKey = category.thumbnail_theme;
    } else {
      if (article.category_slug === 'news' || article.category_slug === 'breaking') defaultThemeKey = 'red';
      if (article.category_slug === 'talks') defaultThemeKey = 'blue';
    }

    setManualThumbConfirm({
      article,
      theme: defaultThemeKey,
      template: defaultTemplate
    });
  };

  const regenerateSingleThumbnail = async (article: any, themeOverrideKey: string, templateOverride: 'classic' | 'bordered') => {
    const titleText = article.ai_title || article.title;
    if (!article.image) { toast.error("No base image"); return; }

    const catName = article.category_name || categories?.find(c => c.id === article.category_id)?.name;
    const categoryLabel = (catName || "TODAY'S NEWS").toUpperCase();
    const theme = getThemeByKey(themeOverrideKey);

    setThumbAnimatingId(article.id);
    setThumbAnimStage("building");
    setThumbAnimUrl(null);
    setSingleGeneratingId(article.id);

    try {
      const blob = await generateThumbnailCanvas(article.image, titleText, categoryLabel, theme, templateOverride);
      const url = await uploadThumbnailBlob(article.id, blob);
      if (url) {
        await supabase.from("articles").update({
          thumbnail_generated_count: (article.thumbnail_generated_count || 0) + 1,
          ai_thumbnail_url: url,
        }).eq("id", article.id);

        // Show done animation
        setThumbAnimStage("done");
        setThumbAnimUrl(url);
        queryClient.invalidateQueries({ queryKey: ["articles"] });

        // After 1.5s, open preview
        setTimeout(() => {
          setThumbAnimatingId(null);
          setThumbAnimStage(null);
          setPreviewThumb(url);
        }, 1500);
      }
    } catch {
      toast.error("Thumbnail generation failed");
      setThumbAnimatingId(null);
      setThumbAnimStage(null);
    } finally {
      setSingleGeneratingId(null);
    }
  };

  const prepareMissingThumbnails = () => {
    const missing = articles?.filter(a => a.ai_rewrite_status === "completed" && !(a.thumbnail_generated_count)) || [];
    if (!missing.length) { toast("No missing thumbnails"); return; }
    
    // Set defaults for bulk
    setBulkConfig({ template: "classic", theme: "pink" });
    setBulkConfirm({ type: "thumbnails", count: missing.length, targets: missing });
  };

  const executeMissingThumbnails = async () => {
    const missing = bulkConfirm.targets;
    const { template, theme: themeKey } = bulkConfig;
    
    setBulkConfirm({ type: null, count: 0, targets: [] });
    if (!missing.length) return;
    
    setGeneratingThumbnails(true);
    setBulkProgress({ type: "thumbnails", current: 0, total: missing.length });
    let ok = 0;
    
    const overrideTheme = getThemeByKey(themeKey);

    for (const a of missing) {
      try {
        if (!a.image) continue;
        const catName = a.category_name || categories?.find(c => c.id === a.category_id)?.name;
        const categoryLabel = (catName || "TODAY'S NEWS").toUpperCase();
        
        // Smart Theme Selection:
        // If bulk override is 'pink', use the article's source or category theme
        let finalTheme = overrideTheme;
        let finalTemplate = template;

        if (themeKey === 'pink') {
          const source = (a as any)?.scraper_sources;
          const category = (a as any)?.categories;

          if (source?.thumbnail_theme) {
            finalTheme = getThemeByKey(source.thumbnail_theme);
            finalTemplate = (source.thumbnail_template as "classic" | "bordered") || template;
          } else if (category?.thumbnail_theme) {
            finalTheme = getThemeByKey(category.thumbnail_theme);
          } else {
            const catThemeKey = (a.category_slug === 'news' || a.category_slug === 'breaking' ? 'red' : a.category_slug === 'talks' ? 'blue' : 'pink');
            finalTheme = getThemeByKey(catThemeKey);
          }
        }

        const blob = await generateThumbnailCanvas(a.image, a.title, categoryLabel, finalTheme, finalTemplate);
        const url = await uploadThumbnailBlob(a.id, blob);
        if (url) { 
          await supabase.from("articles").update({ 
            thumbnail_generated_count: 1, 
            ai_thumbnail_url: url 
          }).eq("id", a.id); 
          ok++; 
        }
      } catch (e) { console.error(e); }
      setBulkProgress(prev => ({ ...prev, current: prev.current + 1 }));
    }
    setBulkProgress({ type: null, current: 0, total: 0 });
    setGeneratingThumbnails(false);
    toast.success(`Generated ${ok} thumbnails using ${template.toUpperCase()} style`);
    queryClient.invalidateQueries({ queryKey: ["articles"] });
  };

  const regenerateSingleCaption = async (article: any) => {
    setCaptionGeneratingId(article.id);
    try {
      const caption = await generateCaptionForArticle(article.title, article.subtitle, article.introduction);
      if (caption) {
        await supabase.from("articles").update({ fb_caption: caption }).eq("id", article.id);
        toast.success("Caption generated!");
        queryClient.invalidateQueries({ queryKey: ["articles"] });
      }
    } catch { toast.error("Caption failed"); }
    finally { setCaptionGeneratingId(null); }
  };

  const openFbPostDialog = async (article: any) => {
    if (!article.ai_thumbnail_url) {
      toast.error("Cannot post to Facebook: Missing AI thumbnail.");
      return;
    }
    if (fbPages.length === 0) {
      toast.error("No Facebook pages configured. Go to Admin > Facebook Pages to add one.");
      return;
    }

    // Pre-select pages mapped to this source
    let initialSelected = new Set<string>();
    if (article.source_id) {
      const { data: mappings } = await (supabase as any)
        .from("scraper_source_fb_pages")
        .select("page_id")
        .eq("source_id", article.source_id);
      
      if (mappings && mappings.length > 0) {
        initialSelected = new Set((mappings as { page_id: string }[]).map(m => m.page_id));
      }
    }

    // Fallback: If no mappings, select all active pages (previous behavior)
    if (initialSelected.size === 0) {
      initialSelected = new Set(fbPages.map(p => p.id));
    }

    setFbPostDialog({ 
      article, 
      selectedPages: initialSelected, 
      strategy: 'queue', 
      post_format: fbPages[0]?.default_post_type || 'photo' 
    });
  };

  const toggleFbPageSelection = (pageId: string) => {
    if (!fbPostDialog) return;
    const next = new Set(fbPostDialog.selectedPages);
    next.has(pageId) ? next.delete(pageId) : next.add(pageId);
    setFbPostDialog({ ...fbPostDialog, selectedPages: next });
  };

  const executeMultiPagePost = async () => {
    if (!fbPostDialog) return;
    const { article, selectedPages, strategy, post_format } = fbPostDialog;
    if (selectedPages.size === 0) { toast.error("Select at least one page"); return; }

    setFbMultiPosting(true);

    if (strategy === 'queue') {
      const upserts = Array.from(selectedPages).map(pageId => ({
        article_id: article.id,
        page_id: pageId,
        status: 'queued',
        post_format: post_format,
        error_message: null
      }));
      // Auto-post cron will pick these up and use default_post_format of the page!
      const { error } = await supabase.from("article_fb_posts").upsert(upserts, { onConflict: "article_id,page_id" });
      if (error) { toast.error(`Queue failed: ${error.message}`); }
      else { toast.success(`Queued on ${selectedPages.size} page(s) for auto-posting!`); }
    } else {
      // Instant posting logic directly from client
      let successCount = 0;
      for (const pageId of selectedPages) {
        const page = fbPages.find(p => p.id === pageId);
        if (!page) continue;
        try {
          const title = article.ai_title || article.title;
          const catSlug = article.category_slug || "general";
          const url = `${window.location.origin}/article/${catSlug}/${article.slug}`;
          const caption = article.fb_caption || title;
          
          let res;
          if (post_format === 'link') {
            const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/social-meta-proxy?id=${article.id}`;
            const body = new URLSearchParams({ message: caption, link: proxyUrl, access_token: page.access_token });
            res = await fetch(`https://graph.facebook.com/v19.0/${page.page_id}/feed`, {
              method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
            });
          } else {
            const fullCaption = `${caption}\n\nRead full article:\n${url}`;
            const body = new URLSearchParams({ url: article.ai_thumbnail_url, message: fullCaption, access_token: page.access_token });
            res = await fetch(`https://graph.facebook.com/v19.0/${page.page_id}/photos`, {
              method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
            });
          }

          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error?.message || `HTTP ${res.status}`);

          await supabase.from("article_fb_posts").upsert({
            article_id: article.id, page_id: page.id, status: 'manual_posted', fb_post_id: data.id,
            posted_at: new Date().toISOString(), error_message: null
          }, { onConflict: "article_id,page_id" });

          // Add a comment to the post if it was a photo post
          if (post_format === 'photo' && data.id) {
            const commentBody = new URLSearchParams({ message: `🔗 Read full story here: ${url}`, access_token: page.access_token });
            fetch(`https://graph.facebook.com/v19.0/${data.id}/comments`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: commentBody }).catch(console.error);
          }

          successCount++;
        } catch (err) {
          toast.error(`Failed to instantly post to ${page.page_name}: ${String(err)}`);
        }
      }
      if (successCount > 0) toast.success(`Instantly posted to ${successCount} page(s)!`);
    }

    setFbMultiPosting(false);
    setFbPostDialog(null);
    queryClient.invalidateQueries({ queryKey: ["articles", "admin"] });
  };

  // ─── Re-rewrite article (queue for AI rewrite again) ──────────────────
  const reRewriteArticle = async (article: any) => {
    const { error } = await supabase.from("articles").update({ ai_rewrite_status: "pending", published: false }).eq("id", article.id);
    if (error) toast.error(error.message);
    else { toast.success(`"${article.title.slice(0, 30)}..." queued for re-rewrite`); queryClient.invalidateQueries({ queryKey: ["articles"] }); }
  };

  // ─── Bulk post selected articles to a specific page ───────────────────
  const openBulkFbDialog = () => {
    if (selectedIds.size === 0) { toast.error("Select articles first"); return; }
    if (fbPages.length === 0) { toast.error("No Facebook pages configured"); return; }
    setBulkFbSelectedPage(fbPages[0]?.id || null);
    setBulkFbDialog(true);
  };

  const executeBulkFbPost = async () => {
    if (!bulkFbSelectedPage) { toast.error("Select a page"); return; }
    const targetArticles = (articles || []).filter(a => selectedIds.has(a.id) && a.ai_thumbnail_url);
    if (targetArticles.length === 0) { toast.error("No selected articles have thumbnails"); return; }

    setBulkFbPosting(true);

    const upserts = targetArticles.map(a => ({
      article_id: a.id,
      page_id: bulkFbSelectedPage,
      status: 'queued',
      error_message: null
    }));

    const { error } = await supabase.from("article_fb_posts").upsert(upserts, { onConflict: "article_id,page_id" });

    setBulkFbPosting(false);
    setBulkFbDialog(false);
    setSelectedIds(new Set());

    if (error) {
      console.error("Bulk queue failed:", error);
      toast.error(`Queue failed: ${error.message}`);
    } else {
      toast.success(`Priority queued ${targetArticles.length} articles! They will post 1 by 1 with a 10 min gap.`);
      queryClient.invalidateQueries({ queryKey: ["articles", "admin"] });
    }
  };

  const prepareMissingCaptions = () => {
    const missing = articles?.filter(a => a.ai_rewrite_status === "completed" && !a.fb_caption) || [];
    if (!missing.length) { toast("No articles need captions"); return; }
    setBulkConfirm({ type: "captions", count: missing.length, targets: missing });
  };

  const executeMissingCaptions = async () => {
    const missing = bulkConfirm.targets;
    setBulkConfirm({ type: null, count: 0, targets: [] });
    if (!missing.length) return;
    setGeneratingCaptions(true);
    setBulkProgress({ type: "captions", current: 0, total: missing.length });
    let ok = 0;
    for (const a of missing) {
      try {
        const c = await generateCaptionForArticle(a.title, a.subtitle, a.introduction);
        if (c) { await supabase.from("articles").update({ fb_caption: c }).eq("id", a.id); ok++; }
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) { console.error(e); }
      setBulkProgress(prev => ({ ...prev, current: prev.current + 1 }));
    }
    setBulkProgress({ type: null, current: 0, total: 0 });
    setGeneratingCaptions(false);
    toast.success(`Generated ${ok} captions`);
    queryClient.invalidateQueries({ queryKey: ["articles"] });
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} articles?`)) return;
    for (const id of selectedIds) { await supabase.from("articles").delete().eq("id", id); }
    toast.success(`Deleted ${selectedIds.size} articles`);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["articles"] });
  };

  const bulkPublish = async (publish: boolean) => {
    for (const id of selectedIds) { await supabase.from("articles").update({ published: publish }).eq("id", id); }
    toast.success(`${publish ? "Published" : "Unpublished"} ${selectedIds.size} articles`);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["articles"] });
  };

  const updateSection = (i: number, field: "heading" | "content", value: string) => {
    const s = [...form.sections]; s[i] = { ...s[i], [field]: value }; setForm({ ...form, sections: s });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredArticles.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredArticles.map(a => a.id)));
  };

  const getAIBadge = (article: any) => {
    const s = article.ai_rewrite_status || "pending";
    const map: Record<string, { icon: any; label: string; cls: string }> = {
      completed: { icon: CheckCircle, label: "AI", cls: "text-green-600 bg-green-500/10" },
      failed: { icon: AlertTriangle, label: "Err", cls: "text-red-500 bg-red-500/10" },
      processing: { icon: Loader2, label: "...", cls: "text-yellow-600 bg-yellow-500/10" },
      pending: { icon: Clock, label: "Wait", cls: "text-muted-foreground bg-muted" },
    };
    const { icon: I, label, cls } = map[s] || map.pending;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
        <I className={`w-2.5 h-2.5 ${s === "processing" ? "animate-spin" : ""}`} />{label}
      </span>
    );
  };

  // Category filter options
  const categoryOptions = [
    { value: "all", label: "All" },
    ...(categories || []).map(c => ({ value: c.id, label: c.name })),
  ];

  // ─── Guards ─────────────────────────────────────────────────────────────
  if (loading) return <AdminShell activePage="dashboard"><AdminPageSkeleton type="table" /></AdminShell>;
  if (!user) return <Navigate to="/signin" replace />;
  if (!isAdmin) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-2"><h1 className="text-xl font-bold">Access Denied</h1><p className="text-sm text-muted-foreground">No admin privileges.</p></div>
    </div>
  );

  return (
    <AdminShell activePage="dashboard">
      {/* ─── Top Bar ─── */}
      <header className="h-12 border-b border-border flex items-center gap-2 px-3 shrink-0 bg-card/30">
        <button onClick={openMobileSidebar} className="md:hidden p-1.5 hover:bg-muted rounded-md shrink-0">
          <Menu className="w-4 h-4" />
        </button>

        <h1 className="text-sm font-bold whitespace-nowrap">Articles</h1>
        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{stats.total}</span>

        {/* Search */}
        <div className="relative flex-1 min-w-[100px] max-w-[200px] ml-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search..." className="h-7 pl-7 text-[11px] rounded-lg bg-muted/50 border-0 focus-visible:ring-1" />
        </div>

        <div className="flex-1 min-w-0" />

        {/* Actions */}
        <TooltipProvider delayDuration={300}>
          <Tooltip><TooltipTrigger asChild>
            <Button onClick={prepareMissingThumbnails} disabled={generatingThumbnails} variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
              {generatingThumbnails ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            </Button>
          </TooltipTrigger><TooltipContent className="text-xs">Generate Missing Thumbnails</TooltipContent></Tooltip>

          <Tooltip><TooltipTrigger asChild>
            <Button onClick={prepareMissingCaptions} disabled={generatingCaptions} variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
              {generatingCaptions ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
            </Button>
          </TooltipTrigger><TooltipContent className="text-xs">Generate Missing Captions</TooltipContent></Tooltip>
        </TooltipProvider>

        <Button onClick={() => { resetForm(); setShowEditor(true); }} size="sm"
          className="h-7 text-[11px] gap-1 bg-[#FA76FF] hover:bg-[#e060e6] text-white shrink-0 px-2.5">
          <Plus className="w-3 h-3" /> <span className="hidden sm:inline">New</span>
        </Button>
      </header>

      {/* ─── Stats Strip ─── */}
      <div className="border-b border-border flex items-center px-3 py-1.5 text-[11px] shrink-0 bg-muted/20 overflow-x-auto scrollbar-hide gap-3">
        {[
          { label: "Published", value: stats.published, cls: "text-green-600" },
          { label: "Drafts", value: stats.drafts, cls: "text-muted-foreground" },
          { label: "Pending", value: stats.pending, cls: "text-yellow-600" },
          { label: "Processing", value: stats.processing, cls: "text-blue-500", hideMobile: true },
          { label: "Rewritten", value: stats.completed, cls: "text-green-600", hideMobile: true },
          { label: "Failed", value: stats.failed, cls: "text-destructive", hideMobile: true },
          { label: "Thumbnails", value: stats.thumbCount, cls: "text-emerald-600", hideMobile: true },
          { label: "Captions", value: stats.captionCount, cls: "text-blue-600", hideMobile: true },
        ].map((s) => (
          <div key={s.label} className={`flex items-center gap-1 shrink-0 ${s.hideMobile ? "hidden sm:flex" : ""}`}>
            <span className={`font-bold font-mono text-xs ${s.cls}`}>{s.value}</span>
            <span className="text-muted-foreground/70 whitespace-nowrap">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ─── Filter Toolbar ─── */}
      <div className="border-b border-border flex flex-wrap items-center gap-1.5 px-3 py-1.5 shrink-0">
        <FilterDropdown label="Category" value={filterCategory} options={categoryOptions} onChange={setFilterCategory} />
        <FilterDropdown label="Status" value={filterStatus} options={[
          { value: "all", label: "All" }, { value: "published", label: "Published" }, { value: "draft", label: "Drafts" },
        ]} onChange={(v) => setFilterStatus(v as FilterStatus)} />
        <FilterDropdown label="AI" value={filterAI} options={[
          { value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "processing", label: "Processing" },
          { value: "completed", label: "Completed" }, { value: "failed", label: "Failed" },
        ]} onChange={(v) => setFilterAI(v as FilterAI)} />

        <button onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")}
          className="h-7 px-2 text-[11px] rounded-lg border border-border bg-background flex items-center gap-1 hover:bg-muted transition-colors shrink-0">
          <ArrowUpDown className="w-3 h-3" /> {sortOrder === "newest" ? "New" : "Old"}
        </button>

        <div className="flex-1 min-w-0" />
        <span className="text-[11px] text-muted-foreground shrink-0">{filteredArticles.length} results</span>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-1 pl-2 border-l border-border shrink-0 flex-wrap">
            <span className="text-[11px] font-medium text-[#FA76FF]">{selectedIds.size} sel</span>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => bulkPublish(true)}>Pub</Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => bulkPublish(false)}>Unpub</Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-blue-600 gap-0.5" onClick={openBulkFbDialog}>
              <Facebook className="w-3 h-3" />FB
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-destructive" onClick={bulkDelete}>Del</Button>
            <button className="p-0.5 hover:bg-muted rounded" onClick={() => setSelectedIds(new Set())}><X className="w-3 h-3" /></button>
          </div>
        )}
      </div>

      {/* ─── Article Table ─── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-[11px] text-muted-foreground font-medium">
              <th className="w-8 px-2 py-1.5">
                <Checkbox checked={filteredArticles.length > 0 && selectedIds.size === filteredArticles.length}
                  onCheckedChange={toggleSelectAll} className="w-3.5 h-3.5" />
              </th>
              <th className="text-left px-2 py-1.5">Title</th>
              <th className="text-left px-2 py-1.5 hidden lg:table-cell">Category</th>
              <th className="text-left px-2 py-1.5 hidden md:table-cell">Status</th>
              <th className="text-left px-2 py-1.5 hidden xl:table-cell">Caption</th>
              <th className="text-center px-2 py-1.5 hidden md:table-cell w-16">AI</th>
              <th className="text-right px-2 py-1.5 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {articlesLoading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-xs">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" /> Loading...
              </td></tr>
            ) : filteredArticles.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-xs">
                {searchQuery || filterStatus !== "all" || filterAI !== "all" || filterCategory !== "all"
                  ? "No articles match filters." : "No articles yet. Press N or click + New."}
              </td></tr>
            ) : filteredArticles.map(article => (
              <tr key={article.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors group ${selectedIds.has(article.id) ? "bg-[#FA76FF]/5" : ""}`}>
                {/* Checkbox */}
                <td className="px-2 py-1.5">
                  <Checkbox checked={selectedIds.has(article.id)} onCheckedChange={() => toggleSelect(article.id)} className="w-3.5 h-3.5" />
                </td>

                {/* Title + thumbnail */}
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Clickable thumbnail with animation overlay */}
                    {(article.image || article.ai_thumbnail_url) && (
                      <button
                        onClick={() => setPreviewThumb(article.ai_thumbnail_url || article.image)}
                        className="relative w-9 h-9 rounded overflow-hidden shrink-0 bg-muted hover:ring-2 hover:ring-[#FA76FF]/40 transition-all"
                      >
                        <img src={article.ai_thumbnail_url || article.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                        {article.ai_thumbnail_url && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#FA76FF] rounded-tl flex items-center justify-center">
                            <Image className="w-2 h-2 text-white" />
                          </span>
                        )}
                        {/* Live generation overlay */}
                        {thumbAnimatingId === article.id && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            {thumbAnimStage === "building" && (
                              <div className="flex flex-col items-center gap-0.5">
                                <RefreshCw className="w-4 h-4 text-white animate-spin" />
                                <span className="text-[7px] text-white font-bold">GEN</span>
                              </div>
                            )}
                            {thumbAnimStage === "done" && (
                              <div className="flex flex-col items-center gap-0.5 animate-scale-in">
                                <CheckCircle className="w-4 h-4 text-green-400" />
                                <span className="text-[7px] text-green-400 font-bold">DONE</span>
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[13px] leading-tight line-clamp-1">{article.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-muted-foreground truncate max-w-[80px]">{article.author_name}</span>
                        <span className="text-[10px] text-muted-foreground/50">·</span>
                        <span className="text-[10px] text-muted-foreground/50 shrink-0">{article.date}</span>
                      </div>
                    </div>
                  </div>
                </td>

                {/* Category */}
                <td className="px-2 py-1.5 hidden lg:table-cell">
                  <span className="text-[11px] text-muted-foreground">{article.category_name}</span>
                </td>

                {/* Status */}
                <td className="px-2 py-1.5 hidden md:table-cell">
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${article.published ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                      {article.published ? "Live" : "Draft"}
                    </span>
                    {getAIBadge(article)}
                  </div>
                </td>

                {/* Caption */}
                <td className="px-2 py-1.5 hidden xl:table-cell">
                  {article.fb_caption ? (
                    <div className="flex items-center gap-1 max-w-[200px]">
                      <p className="text-[11px] text-muted-foreground line-clamp-1 flex-1" title={article.fb_caption}>{article.fb_caption}</p>
                      <button onClick={() => { navigator.clipboard.writeText(article.fb_caption || ""); toast.success("Copied!"); }}
                        className="p-0.5 hover:bg-muted rounded transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                  ) : <span className="text-[11px] text-muted-foreground/30">—</span>}
                </td>

                {/* AI counts column */}
                <td className="px-2 py-1.5 hidden md:table-cell text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger>
                      <span className={`text-[10px] font-mono ${(article.ai_rewrite_count || 0) > 0 ? "text-[#FA76FF]" : "text-muted-foreground/30"}`}>
                        R{article.ai_rewrite_count || 0}
                      </span>
                    </TooltipTrigger><TooltipContent className="text-xs">Rewrites</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger>
                      <span className={`text-[10px] font-mono ${(article.thumbnail_generated_count || 0) > 0 ? "text-emerald-500" : "text-muted-foreground/30"}`}>
                        T{article.thumbnail_generated_count || 0}
                      </span>
                    </TooltipTrigger><TooltipContent className="text-xs">Thumbnails</TooltipContent></Tooltip></TooltipProvider>
                  </div>
                </td>

                {/* Actions */}
                <td className="px-2 py-1.5 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <button onClick={() => handleEdit(article)} className="p-1.5 hover:bg-muted rounded-md transition-colors" title="Edit">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => togglePublish(article.id, article.published)} className="p-1.5 hover:bg-muted rounded-md transition-colors">
                      {article.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>

                    {/* Styled dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 p-1.5 rounded-xl shadow-lg border border-border/80">
                        <div className="px-2 pt-1 pb-1"><span className="text-[9px] font-semibold uppercase tracking-wider text-[#FA76FF]/60">AI Tools</span></div>
                        <DropdownMenuItem onClick={() => setRewritingArticle(article)} className="gap-2.5 text-xs rounded-lg px-2.5 py-2 cursor-pointer hover:bg-[#FA76FF]/5 focus:bg-[#FA76FF]/5">
                          <Sparkles className="w-4 h-4 text-[#FA76FF]" /> <span>Rewrite with AI</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => promptManualThumbnail(article)} disabled={singleGeneratingId === article.id}
                          className="gap-2.5 text-xs rounded-lg px-2.5 py-2 cursor-pointer hover:bg-emerald-500/5 focus:bg-emerald-500/5">
                          {singleGeneratingId === article.id ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> : <ImagePlus className="w-4 h-4 text-emerald-500" />}
                          <span>Generate Thumbnail</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => regenerateSingleCaption(article)} disabled={captionGeneratingId === article.id}
                          className="gap-2.5 text-xs rounded-lg px-2.5 py-2 cursor-pointer hover:bg-blue-500/5 focus:bg-blue-500/5">
                          {captionGeneratingId === article.id ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <MessageSquare className="w-4 h-4 text-blue-500" />}
                          <span>Generate Caption</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openFbPostDialog(article)} disabled={!article.ai_thumbnail_url}
                          className="gap-2.5 text-xs rounded-lg px-2.5 py-2 cursor-pointer hover:bg-indigo-500/5 focus:bg-indigo-500/5 text-indigo-600 focus:text-indigo-600">
                          <Facebook className="w-4 h-4" />
                          <span>Post to Facebook{fbPages.length > 1 ? " Pages" : ""}</span>
                        </DropdownMenuItem>
                        {article.ai_rewrite_status === "completed" && (
                          <DropdownMenuItem onClick={() => reRewriteArticle(article)} className="gap-2.5 text-xs rounded-lg px-2.5 py-2 cursor-pointer hover:bg-orange-500/5 focus:bg-orange-500/5">
                            <RefreshCw className="w-4 h-4 text-orange-500" /> <span>Re-Rewrite (New Version)</span>
                          </DropdownMenuItem>
                        )}
                        {article.ai_rewrite_status === "failed" && (
                          <DropdownMenuItem onClick={() => retryRewrite(article)} className="gap-2.5 text-xs rounded-lg px-2.5 py-2 cursor-pointer hover:bg-yellow-500/5">
                            <AlertTriangle className="w-4 h-4 text-yellow-500" /> <span>Retry Rewrite</span>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="my-1" />
                        <div className="px-2 pt-1 pb-1"><span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">Navigate</span></div>
                        <DropdownMenuItem asChild className="rounded-lg">
                          <Link to={getArticlePath(article)} target="_blank" className="gap-2.5 text-xs px-2.5 py-2 cursor-pointer hover:bg-muted">
                            <ExternalLink className="w-4 h-4" /> <span>View Live</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="my-1" />
                        <DropdownMenuItem onClick={() => handleDelete(article.id)} className="gap-2.5 text-xs rounded-lg px-2.5 py-2 cursor-pointer text-destructive hover:bg-destructive/5 focus:bg-destructive/5 focus:text-destructive">
                          <Trash2 className="w-4 h-4" /> <span>Delete Article</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Thumbnail Preview Dialog ─── */}
      <Dialog open={!!previewThumb} onOpenChange={() => setPreviewThumb(null)}>
        <DialogContent className="max-w-md p-2 rounded-xl overflow-hidden bg-card">
          {previewThumb && <img src={previewThumb} alt="Thumbnail Preview" className="w-full h-auto rounded-lg" />}
        </DialogContent>
      </Dialog>

      {/* ─── Editor Sheet ─── */}
      <Sheet open={showEditor} onOpenChange={open => { if (!open) resetForm(); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl overflow-y-auto p-0">
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <SheetHeader className="px-5 py-3 border-b border-border shrink-0">
              <SheetTitle className="text-base">{editingId ? "Edit Article" : "New Article"}</SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
                {/* Left: Content */}
                <div className="lg:col-span-3 p-4 space-y-3 lg:border-r border-border">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Title *</label>
                    <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value, slug: generateSlug(e.target.value) })} required className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Subtitle</label>
                    <Input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Introduction</label>
                    <Textarea value={form.introduction} onChange={e => setForm({ ...form, introduction: e.target.value })} rows={3} className="mt-1 text-sm resize-none" />
                  </div>
                  {/* Sections */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Sections ({form.sections.length})</label>
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1"
                        onClick={() => setForm({ ...form, sections: [...form.sections, { heading: "", content: "" }] })}>
                        <Plus className="w-3 h-3" /> Add
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {form.sections.map((s, i) => (
                        <div key={i} className="border border-border rounded-lg p-2.5 space-y-1.5 bg-muted/20">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground font-mono">§{i + 1}</span>
                            {form.sections.length > 1 && (
                              <button type="button" onClick={() => setForm({ ...form, sections: form.sections.filter((_, j) => j !== i) })} className="text-[10px] text-destructive hover:underline">Remove</button>
                            )}
                          </div>
                          <Input placeholder="Heading" value={s.heading} onChange={e => updateSection(i, "heading", e.target.value)} className="h-8 text-sm" />
                          <Textarea placeholder="Content" value={s.content} onChange={e => updateSection(i, "content", e.target.value)} rows={2} className="text-sm resize-none" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Conclusion</label>
                    <Textarea value={form.conclusion} onChange={e => setForm({ ...form, conclusion: e.target.value })} rows={2} className="mt-1 text-sm resize-none" />
                  </div>
                </div>

                {/* Right: Metadata */}
                <div className="lg:col-span-2 p-4 space-y-3 bg-muted/10">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Slug</label>
                    <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} className="mt-1 h-8 text-xs font-mono" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Category *</label>
                      <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} required
                        className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="">Select</option>
                        {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Date *</label>
                      <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required className="mt-1 h-8 text-xs" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Read Time</label>
                    <Input value={form.read_time} onChange={e => setForm({ ...form, read_time: e.target.value })} className="mt-1 h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Cover Image URL *</label>
                    <Input value={form.image} onChange={e => setForm({ ...form, image: e.target.value })} required className="mt-1 h-8 text-xs" />
                    {form.image && <img src={form.image} alt="" className="mt-2 w-full h-24 object-cover rounded-md bg-muted" loading="lazy" />}
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Tags</label>
                    <Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="tag1, tag2" className="mt-1 h-8 text-xs" />
                  </div>

                  {/* Author collapsible */}
                  <Collapsible open={authorOpen} onOpenChange={setAuthorOpen}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Author Details</span>
                      <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${authorOpen ? "rotate-90" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 mt-1.5">
                      <Input value={form.author_name} onChange={e => setForm({ ...form, author_name: e.target.value })} placeholder="Author name *" required className="h-8 text-xs" />
                      <Input value={form.author_avatar} onChange={e => setForm({ ...form, author_avatar: e.target.value })} placeholder="Avatar URL" className="h-8 text-xs" />
                      <Input value={form.author_bio} onChange={e => setForm({ ...form, author_bio: e.target.value })} placeholder="Bio" className="h-8 text-xs" />
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={form.author_twitter} onChange={e => setForm({ ...form, author_twitter: e.target.value })} placeholder="Twitter" className="h-7 text-[10px]" />
                        <Input value={form.author_instagram} onChange={e => setForm({ ...form, author_instagram: e.target.value })} placeholder="Instagram" className="h-7 text-[10px]" />
                        <Input value={form.author_linkedin} onChange={e => setForm({ ...form, author_linkedin: e.target.value })} placeholder="LinkedIn" className="h-7 text-[10px]" />
                        <Input value={form.author_facebook} onChange={e => setForm({ ...form, author_facebook: e.target.value })} placeholder="Facebook" className="h-7 text-[10px]" />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Publishing */}
                  <div className="border-t border-border pt-3 space-y-2">
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox checked={form.published} onCheckedChange={v => setForm({ ...form, published: !!v })} className="w-3.5 h-3.5" /> Publish immediately
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox checked={form.show_edit_tag} onCheckedChange={v => setForm({ ...form, show_edit_tag: !!v })} className="w-3.5 h-3.5" /> Show Updated tag
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox checked={form.is_featured} onCheckedChange={v => setForm({ ...form, is_featured: !!v })} className="w-3.5 h-3.5" /> Featured
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky footer */}
            <div className="border-t border-border px-5 py-3 flex items-center justify-between shrink-0 bg-background">
              <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={resetForm}>Cancel</Button>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" size="sm" className="text-xs" onClick={() => setForm({ ...form, published: false })}>Save Draft</Button>
                <Button type="submit" size="sm" className="text-xs bg-[#FA76FF] hover:bg-[#e060e6] text-white" onClick={() => setForm({ ...form, published: true })}>
                  {editingId ? "Update" : "Publish"}
                </Button>
              </div>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* AI Rewrite Panel */}
      {rewritingArticle && <RewritePanel article={rewritingArticle} onClose={() => setRewritingArticle(null)} />}
      <Dialog open={bulkConfirm.type !== null} onOpenChange={(open) => { if (!open) setBulkConfirm({ type: null, count: 0, targets: [] }); }}>
        <DialogContent className="max-w-md rounded-xl p-0 overflow-hidden border-border bg-card shadow-2xl">
          <div className="pt-6 pb-5 px-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#FA76FF]/10 flex items-center justify-center shrink-0">
                {bulkConfirm.type === "thumbnails" ? <ImagePlus className="w-6 h-6 text-[#FA76FF]" /> : <MessageSquare className="w-6 h-6 text-[#FA76FF]" />}
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">Bulk {bulkConfirm.type === "thumbnails" ? "Thumbnail" : "Caption"} Engine</h2>
                <p className="text-xs text-muted-foreground font-medium">Ready to process <span className="text-[#FA76FF]">{bulkConfirm.count}</span> articles.</p>
              </div>
            </div>

            {bulkConfirm.type === "thumbnails" && (
              <div className="space-y-5 py-4 border-y border-border/50 my-4 bg-muted/20 -mx-6 px-6">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Master Template Layout</label>
                  <div className="flex bg-background rounded-lg p-1 border border-border h-10 w-full shadow-sm">
                    <button
                      type="button"
                      onClick={() => setBulkConfig({ ...bulkConfig, template: "classic" })}
                      className={`flex-1 rounded-md text-xs font-bold tracking-wide transition-all ${bulkConfig.template === 'classic' ? 'bg-muted shadow-inner text-[#FA76FF]' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Classic Mode
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkConfig({ ...bulkConfig, template: "bordered" })}
                      className={`flex-1 rounded-md text-xs font-bold tracking-wide transition-all ${bulkConfig.template === 'bordered' ? 'bg-muted shadow-inner text-[#FA76FF]' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Bordered Style
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 italic px-1">Tip: Bordered Style is great for Facebook shared posts.</p>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-2 text-center">Master Theme Color</label>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    {Object.keys(THUMBNAIL_THEMES).map(key => {
                      const theme = THUMBNAIL_THEMES[key];
                      const selected = bulkConfig.theme === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setBulkConfig({ ...bulkConfig, theme: key })}
                          className={`relative w-9 h-9 rounded-xl border-2 transition-all duration-300 flex items-center justify-center shadow-sm
                            ${selected ? "border-[#FA76FF] ring-4 ring-[#FA76FF]/20 scale-110 z-10" : "border-transparent hover:scale-105"}`}
                          style={{ backgroundColor: theme.primaryColor }}
                          title={theme.name}
                        >
                          {selected && <CheckCircle className="w-5 h-5 text-white drop-shadow-md" />}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-center text-muted-foreground mt-3">Selected color will be applied to all <span className="font-bold text-[#FA76FF]">{bulkConfirm.count}</span> thumbnails.</p>
                </div>
              </div>
            )}

            {bulkConfirm.type === "captions" && (
              <p className="text-sm text-muted-foreground mb-6 py-4">
                This will use the AI engine to generate unique, engaging Facebook captions for all selected articles without one.
              </p>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-10 text-xs font-bold" onClick={() => setBulkConfirm({ type: null, count: 0, targets: [] })}>
                Cancel
              </Button>
              <Button className="flex-1 h-10 text-xs font-bold bg-[#FA76FF] hover:bg-[#e060e6] text-white shadow-lg shadow-[#FA76FF]/20 gap-2"
                onClick={bulkConfirm.type === "thumbnails" ? executeMissingThumbnails : executeMissingCaptions}>
                <Sparkles className="w-4 h-4" /> Start Generation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* ─── Bulk Progress Dialog ─── */}
      <Dialog open={bulkProgress.type !== null}>
        <DialogContent className="max-w-xs rounded-xl p-0 overflow-hidden text-center border-border [&>button]:hidden">
          <div className="pt-8 pb-6 px-6">
            <div className="w-16 h-16 rounded-full bg-[#FA76FF]/10 flex items-center justify-center mx-auto mb-4 relative">
              <Loader2 className="w-8 h-8 text-[#FA76FF] animate-spin" />
            </div>
            <h2 className="text-xl font-bold mb-2">Generating {bulkProgress.type === "thumbnails" ? "Thumbnails" : "Captions"}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Please do not close this tab.
            </p>

            <div className="flex items-center justify-between text-xs font-medium mb-1.5 px-1">
              <span className="text-[#FA76FF]">{bulkProgress.current}</span>
              <span className="text-muted-foreground">of {bulkProgress.total}</span>
            </div>
            {/* Progress Bar */}
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FA76FF] transition-all duration-300 rounded-full"
                style={{ width: bulkProgress.total ? `${(bulkProgress.current / bulkProgress.total) * 100}%` : "0%" }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 uppercase tracking-widest font-medium animate-pulse">
              Processing...
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Multi-Page Facebook Post Dialog ─── */}
      <Dialog open={fbPostDialog !== null} onOpenChange={(open) => { if (!open) setFbPostDialog(null); }}>
        <DialogContent className="max-w-sm rounded-xl p-0 overflow-hidden border-border">
          <div className="pt-6 pb-5 px-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Facebook className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h2 className="text-base font-bold">Post to Facebook</h2>
                <p className="text-[11px] text-muted-foreground line-clamp-1">{fbPostDialog?.article?.title}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mb-3">Select pages to post to:</p>

            <div className="space-y-1.5 max-h-60 overflow-auto">
              {fbPages.map(page => {
                const theme = THUMBNAIL_THEMES[page.thumbnail_theme] || THUMBNAIL_THEMES.pink;
                const isSelected = fbPostDialog?.selectedPages.has(page.id);
                return (
                  <button
                    key={page.id}
                    onClick={() => toggleFbPageSelection(page.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left
                      ${isSelected
                        ? "border-blue-500/50 bg-blue-500/5"
                        : "border-border hover:border-muted-foreground/30 bg-card"
                      }`}
                  >
                    <Checkbox checked={isSelected} className="w-4 h-4 shrink-0" />
                    <div className="w-6 h-6 rounded shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: theme.primaryColor }}>
                      <Facebook className="w-3 h-3" style={{ color: theme.textColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate">{page.page_name}</span>
                      <span className="text-[10px] text-muted-foreground">{theme.name} · {page.thumbnail_template || 'classic'}</span>
                    </div>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${page.auto_post ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                      {page.auto_post ? "AUTO" : "MANUAL"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-border/50">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Post Format</p>
              <div className="flex bg-muted rounded-lg p-1 border border-border h-10 w-full mb-3">
                <button
                  type="button"
                  onClick={() => fbPostDialog && setFbPostDialog({ ...fbPostDialog, post_format: "photo" })}
                  className={`flex-1 rounded-md text-xs font-semibold tracking-wide transition-all ${fbPostDialog?.post_format === 'photo' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10'}`}
                >
                  Photo Post
                </button>
                <button
                  type="button"
                  onClick={() => fbPostDialog && setFbPostDialog({ ...fbPostDialog, post_format: "link" })}
                  className={`flex-1 rounded-md text-xs font-semibold tracking-wide transition-all ${fbPostDialog?.post_format === 'link' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10'}`}
                >
                  Link Post
                </button>
              </div>

              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Publish Strategy</p>
              <div className="flex bg-muted rounded-lg p-1 border border-border h-10 w-full">
                <button
                  type="button"
                  onClick={() => fbPostDialog && setFbPostDialog({ ...fbPostDialog, strategy: "queue" })}
                  className={`flex-1 rounded-md text-xs font-semibold tracking-wide transition-all ${fbPostDialog?.strategy === 'queue' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10'}`}
                >
                  Auto-Queue (10m wait)
                </button>
                <button
                  type="button"
                  onClick={() => fbPostDialog && setFbPostDialog({ ...fbPostDialog, strategy: "instant" })}
                  className={`flex-1 rounded-md text-xs font-semibold tracking-wide transition-all flex items-center justify-center gap-1.5 ${fbPostDialog?.strategy === 'instant' ? 'bg-blue-500 shadow-sm text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10'}`}
                >
                  <Send className="w-3 h-3" /> Post Instantly
                </button>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1 text-xs h-9" onClick={() => setFbPostDialog(null)}>
                Cancel
              </Button>
              <Button
                className={`flex-1 text-xs h-9 text-white gap-1.5 ${fbPostDialog?.strategy === 'instant' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'}`}
                onClick={executeMultiPagePost}
                disabled={fbMultiPosting || !fbPostDialog?.selectedPages.size}
              >
                {fbMultiPosting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Facebook className="w-3.5 h-3.5" />}
                {fbPostDialog?.strategy === 'instant' ? 'Post Instantly' : `Queue to ${fbPostDialog?.selectedPages.size || 0} Page(s)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Manual Thumbnail Generation Dialog ─── */}
      <Dialog open={manualThumbConfirm !== null} onOpenChange={(open) => { if (!open) setManualThumbConfirm(null); }}>
        <DialogContent className="max-w-sm rounded-xl p-0 overflow-hidden border-border bg-card">
          <div className="pt-6 pb-5 px-5">
            <h2 className="text-base font-bold mb-1 flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-[#FA76FF]" /> Master Thumbnail Override
            </h2>
            <p className="text-xs text-muted-foreground mb-4">Choose colors and layout for "{manualThumbConfirm?.article?.title.slice(0, 30)}..."</p>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Template Layout</label>
                <div className="flex bg-muted rounded-lg p-1 border border-border mt-1 h-9 w-full">
                  <button
                    type="button"
                    onClick={() => manualThumbConfirm && setManualThumbConfirm({ ...manualThumbConfirm, template: "classic" })}
                    className={`flex-1 rounded-md text-xs font-semibold tracking-wide transition-all ${manualThumbConfirm?.template === 'classic' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Classic Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => manualThumbConfirm && setManualThumbConfirm({ ...manualThumbConfirm, template: "bordered" })}
                    className={`flex-1 rounded-md text-xs font-semibold tracking-wide transition-all ${manualThumbConfirm?.template === 'bordered' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Bordered Style
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Theme Color</label>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {Object.keys(THUMBNAIL_THEMES).map(key => {
                    const theme = THUMBNAIL_THEMES[key];
                    const selected = manualThumbConfirm?.theme === key;
                    return (
                      <button
                        key={key}
                        onClick={() => manualThumbConfirm && setManualThumbConfirm({ ...manualThumbConfirm, theme: key })}
                        className={`relative w-8 h-8 rounded-lg border-2 transition-all duration-200 flex items-center justify-center
                          ${selected ? "border-[#FA76FF] ring-2 ring-[#FA76FF]/30 scale-110" : "border-border hover:border-muted-foreground/50"}`}
                        style={{ backgroundColor: theme.primaryColor }}
                        title={theme.name}
                      >
                        {selected && <Check className="w-3.5 h-3.5" style={{ color: theme.textColor }} />}
                      </button>
                    )
                  })}
                  <div className="w-px h-6 bg-border mx-1" />
                  <div className="relative">
                    <input
                      type="color"
                      value={manualThumbConfirm?.theme.startsWith("#") ? manualThumbConfirm.theme : getThemeByKey(manualThumbConfirm?.theme || "").primaryColor}
                      onChange={(e) => manualThumbConfirm && setManualThumbConfirm({ ...manualThumbConfirm, theme: e.target.value })}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center 
                      ${manualThumbConfirm?.theme.startsWith("#") ? "border-[#FA76FF] ring-2 ring-[#FA76FF]/30 scale-110" : "border-border"}`}
                      style={{ backgroundColor: manualThumbConfirm?.theme.startsWith("#") ? manualThumbConfirm.theme : getThemeByKey(manualThumbConfirm?.theme || "").primaryColor }}
                    >
                      {manualThumbConfirm?.theme.startsWith("#") ? <Check className="w-3.5 h-3.5 text-white" /> : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button variant="outline" className="flex-1 text-xs h-9" onClick={() => setManualThumbConfirm(null)}>Cancel</Button>
              <Button
                className="flex-1 text-xs h-9 bg-[#FA76FF] hover:bg-[#e060e6] text-white"
                onClick={() => {
                  if (manualThumbConfirm) {
                    regenerateSingleThumbnail(manualThumbConfirm.article, manualThumbConfirm.theme, manualThumbConfirm.template);
                  }
                  setManualThumbConfirm(null);
                }}
              >
                <ImagePlus className="w-3.5 h-3.5 mr-1" />
                Generate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* ─── Bulk FB: Select Page Dialog ─── */}
      <Dialog open={bulkFbDialog} onOpenChange={(open) => { if (!open) setBulkFbDialog(false); }}>
        <DialogContent className="max-w-sm rounded-xl p-0 overflow-hidden border-border">
          <div className="pt-6 pb-5 px-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Facebook className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h2 className="text-base font-bold">Bulk Post to Facebook</h2>
                <p className="text-[11px] text-muted-foreground">
                  {selectedIds.size} articles selected · {(articles || []).filter(a => selectedIds.has(a.id) && a.ai_thumbnail_url).length} with thumbnails
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mb-3">Select a page to post all selected articles to (one by one, automatically):</p>

            <div className="space-y-1.5 max-h-48 overflow-auto">
              {fbPages.map(page => {
                const theme = getThemeByKey(page.thumbnail_theme);
                const isSelected = bulkFbSelectedPage === page.id;
                return (
                  <button
                    key={page.id}
                    onClick={() => setBulkFbSelectedPage(page.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left
                      ${isSelected
                        ? "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20"
                        : "border-border hover:border-muted-foreground/30 bg-card"
                      }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? "border-blue-500" : "border-muted-foreground/30"}`}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                    </div>
                    <div className="w-6 h-6 rounded shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: theme.primaryColor }}>
                      <Facebook className="w-3 h-3" style={{ color: theme.textColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate">{page.page_name}</span>
                      <span className="text-[10px] text-muted-foreground">{theme.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 p-2 bg-muted/30 rounded-lg text-[11px] text-muted-foreground">
              <p>⏱ Articles will be posted <strong>one by one</strong> with a 2-second delay between each to avoid rate limiting.</p>
            </div>

            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1 text-xs h-9" onClick={() => setBulkFbDialog(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 text-xs h-9 bg-blue-500 hover:bg-blue-600 text-white gap-1.5"
                onClick={executeBulkFbPost}
                disabled={!bulkFbSelectedPage || bulkFbPosting}
              >
                {bulkFbPosting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Facebook className="w-3.5 h-3.5" />}
                Queue Articles
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
};

export default Admin;
