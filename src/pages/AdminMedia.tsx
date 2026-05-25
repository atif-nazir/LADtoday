import { useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useAllArticlesAdmin } from "@/hooks/useArticles";
import { AdminShell, openMobileSidebar } from "@/components/AdminShell";
import { AdminPageSkeleton } from "@/components/AdminSkeletons";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { generateThumbnailCanvas, uploadThumbnailBlob } from "@/utils/thumbnailGenerator";
import {
  Loader2, Menu, Columns3, Image, ImagePlus, Search, Eye, RefreshCw,
  ChevronDown, X, Trash2, CheckCircle, Copy
} from "lucide-react";

type MediaFilter = "all" | "has_thumb" | "no_thumb";

const AdminMedia = () => {
  const { user, isAdmin, loading } = useIsAdmin();
  const { data: articles, isLoading } = useAllArticlesAdmin();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);

  // Inspector — selected article
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = (articles || []).filter(a => a.image);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a => a.title.toLowerCase().includes(q));
    }
    if (filter === "has_thumb") list = list.filter(a => a.ai_thumbnail_url);
    if (filter === "no_thumb") list = list.filter(a => !a.ai_thumbnail_url);
    return list;
  }, [articles, searchQuery, filter]);

  const stats = useMemo(() => {
    const all = (articles || []).filter(a => a.image);
    return { total: all.length, withAI: all.filter(a => a.ai_thumbnail_url).length, missing: all.filter(a => !a.ai_thumbnail_url).length };
  }, [articles]);

  const inspected = inspectedId ? filtered.find(a => a.id === inspectedId) : null;

  const regenerateThumb = async (article: any) => {
    if (!article.image) return;
    setGeneratingId(article.id);
    try {
      const blob = await generateThumbnailCanvas(article.image, article.title);
      const url = await uploadThumbnailBlob(article.id, blob);
      if (url) {
        await supabase.from("articles").update({ thumbnail_generated_count: (article.thumbnail_generated_count || 0) + 1, ai_thumbnail_url: url }).eq("id", article.id);
        toast.success("Generated!"); queryClient.invalidateQueries({ queryKey: ["articles"] });
      }
    } catch { toast.error("Failed"); }
    finally { setGeneratingId(null); }
  };

  const batchRegenerate = async () => {
    const targets = filtered.filter(a => selectedIds.has(a.id) && a.image);
    if (!targets.length) return toast.error("No valid images selected");
    setBatchGenerating(true);
    let ok = 0;
    for (const a of targets) {
      try {
        const blob = await generateThumbnailCanvas(a.image, a.title);
        const url = await uploadThumbnailBlob(a.id, blob);
        if (url) { await supabase.from("articles").update({ thumbnail_generated_count: (a.thumbnail_generated_count || 0) + 1, ai_thumbnail_url: url }).eq("id", a.id); ok++; }
      } catch (e) { console.error(e); }
    }
    setBatchGenerating(false);
    toast.success(`Regenerated ${ok} thumbnails`);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["articles"] });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds); next.has(id) ? next.delete(id) : next.add(id); setSelectedIds(next);
  };

  if (loading) return <AdminShell activePage="media"><AdminPageSkeleton type="grid" /></AdminShell>;
  if (!user) return <Navigate to="/signin" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AdminShell activePage="media">
      {/* ─── Sticky Toolbar ─── */}
      <header className="h-12 border-b border-border flex items-center gap-2 px-3 shrink-0 bg-card/30">
        <button onClick={openMobileSidebar} className="md:hidden p-1.5 hover:bg-muted rounded-md shrink-0">
          <Menu className="w-4 h-4" />
        </button>
        <Columns3 className="w-4 h-4 text-[#FA76FF]" />
        <h1 className="text-sm font-bold">Media</h1>

        {/* Compact stats */}
        <div className="flex items-center gap-2 text-[11px] ml-1">
          <span className="font-mono text-muted-foreground">{stats.total}</span>
          <span className="text-emerald-600 hidden sm:inline">{stats.withAI} AI</span>
          <span className="text-muted-foreground/50 hidden sm:inline">{stats.missing} missing</span>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[80px] max-w-[160px] ml-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..."
            className="h-7 pl-7 text-[11px] rounded-lg bg-muted/50 border-0 focus-visible:ring-1" />
        </div>

        <div className="flex-1 min-w-0" />

        {/* Batch actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-1 mr-1">
            <span className="text-[11px] font-medium text-[#FA76FF]">{selectedIds.size}</span>
            <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 px-2" onClick={batchRegenerate} disabled={batchGenerating}>
              {batchGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              <span className="hidden sm:inline">Regen</span>
            </Button>
            <button className="p-1 hover:bg-muted rounded" onClick={() => setSelectedIds(new Set())}><X className="w-3 h-3" /></button>
          </div>
        )}

        {/* Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-7 px-2 text-[11px] rounded-lg border border-border bg-background flex items-center gap-1 shrink-0 hover:bg-muted transition-colors">
              <Image className="w-3 h-3" />
              <span className="hidden sm:inline">{filter === "all" ? "All" : filter === "has_thumb" ? "AI" : "Missing"}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 p-1 rounded-xl shadow-lg border border-border/80">
            {([["all", "All Images"], ["has_thumb", "Has AI Thumbnail"], ["no_thumb", "Missing Thumbnail"]] as const).map(([val, label]) => (
              <DropdownMenuItem key={val} onClick={() => setFilter(val)}
                className={`text-xs rounded-lg px-2.5 py-1.5 cursor-pointer ${filter === val ? "bg-[#FA76FF]/10 text-[#FA76FF] font-medium" : ""}`}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* ─── Content area: Grid + Inspector ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── Thumbnail Grid ─── */}
        <div className="flex-1 overflow-auto p-2">
          {isLoading ? (
            <AdminPageSkeleton type="grid" />
          ) : !filtered.length ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No images found.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5">
              {filtered.map(article => {
                const isSelected = selectedIds.has(article.id);
                const isInspected = inspectedId === article.id;
                const thumb = article.ai_thumbnail_url || article.image;
                return (
                  <div key={article.id}
                    className={`relative aspect-square rounded-lg overflow-hidden bg-muted group cursor-pointer transition-all
                      ${isInspected ? "ring-2 ring-[#FA76FF]" : ""}
                      ${isSelected ? "ring-2 ring-[#FA76FF]/60" : ""}`}
                    onClick={() => {
                      setInspectedId(article.id);
                      if (window.innerWidth < 1024) setMobileInspectorOpen(true);
                    }}
                  >
                    <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />

                    {/* AI badge */}
                    {article.ai_thumbnail_url && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded bg-[#FA76FF] flex items-center justify-center">
                        <CheckCircle className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5">
                      <p className="text-[9px] text-white font-medium line-clamp-2 leading-tight">{article.title}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <button onClick={e => { e.stopPropagation(); setPreviewSrc(thumb); }} className="p-1 bg-white/20 rounded hover:bg-white/40 transition-colors">
                          <Eye className="w-3 h-3 text-white" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); regenerateThumb(article); }} disabled={generatingId === article.id}
                          className="p-1 bg-white/20 rounded hover:bg-white/40 transition-colors">
                          {generatingId === article.id ? <Loader2 className="w-3 h-3 animate-spin text-white" /> : <RefreshCw className="w-3 h-3 text-white" />}
                        </button>
                      </div>
                    </div>

                    {/* Selection checkbox */}
                    <div className={`absolute top-1 left-1 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(article.id)}
                        onClick={e => e.stopPropagation()} className="w-4 h-4 bg-white/80 border-0" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Inspector Sheet (mobile/tablet) ─── */}
        <Sheet open={mobileInspectorOpen && !!inspected} onOpenChange={(open) => { if (!open) { setMobileInspectorOpen(false); } }}>
          <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl p-0 lg:hidden">
            {inspected && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Inspector</span>
                  <button onClick={() => setMobileInspectorOpen(false)} className="p-1 hover:bg-muted rounded"><X className="w-3 h-3" /></button>
                </div>
                <div className="p-3 space-y-3 flex-1 overflow-auto">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Original</span>
                    <div className="mt-1 rounded-lg overflow-hidden bg-muted aspect-video relative">
                      <img src={inspected.image} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setPreviewSrc(inspected.image)} className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                        <Eye className="w-5 h-5 text-white drop-shadow" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">AI Thumbnail</span>
                    <div className="mt-1 rounded-lg overflow-hidden bg-muted aspect-video relative">
                      {inspected.ai_thumbnail_url ? (
                        <>
                          <img src={inspected.ai_thumbnail_url} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => setPreviewSrc(inspected.ai_thumbnail_url!)} className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                            <Eye className="w-5 h-5 text-white drop-shadow" />
                          </button>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><span className="text-[10px] text-muted-foreground/40">Not generated</span></div>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Title</span>
                    <p className="text-xs mt-0.5 leading-snug">{inspected.title}</p>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <Button onClick={() => regenerateThumb(inspected)} disabled={generatingId === inspected.id} variant="outline" size="sm" className="w-full text-xs gap-1.5 h-8">
                      {generatingId === inspected.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {inspected.ai_thumbnail_url ? "Regenerate" : "Generate"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* ─── Inspector Panel (desktop) ─── */}
        {inspected && (
          <div className="hidden lg:flex w-[260px] border-l border-border flex-col shrink-0 bg-card/30">
            {/* Close button */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Inspector</span>
              <button onClick={() => setInspectedId(null)} className="p-1 hover:bg-muted rounded"><X className="w-3 h-3" /></button>
            </div>

            {/* Preview */}
            <div className="p-3 space-y-3 flex-1 overflow-auto">
              {/* Original */}
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Original</span>
                <div className="mt-1 rounded-lg overflow-hidden bg-muted aspect-video relative">
                  <img src={inspected.image} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setPreviewSrc(inspected.image)}
                    className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                    <Eye className="w-5 h-5 text-white drop-shadow" />
                  </button>
                </div>
              </div>

              {/* AI Thumbnail */}
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">AI Thumbnail</span>
                <div className="mt-1 rounded-lg overflow-hidden bg-muted aspect-video relative">
                  {inspected.ai_thumbnail_url ? (
                    <>
                      <img src={inspected.ai_thumbnail_url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setPreviewSrc(inspected.ai_thumbnail_url!)}
                        className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                        <Eye className="w-5 h-5 text-white drop-shadow" />
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground/40">Not generated</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="space-y-1.5">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Title</span>
                  <p className="text-xs mt-0.5 leading-snug">{inspected.title}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div>
                    <span className="text-[10px] text-muted-foreground">Rewrites</span>
                    <p className="text-xs font-mono font-medium">{inspected.ai_rewrite_count || 0}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Thumbnails</span>
                    <p className="text-xs font-mono font-medium">{inspected.thumbnail_generated_count || 0}</p>
                  </div>
                </div>
                {inspected.fb_caption && (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Caption</span>
                      <button onClick={() => { navigator.clipboard.writeText(inspected.fb_caption || ""); toast.success("Copied!"); }}
                        className="p-0.5 hover:bg-muted rounded"><Copy className="w-3 h-3 text-muted-foreground" /></button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{inspected.fb_caption}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-1.5 pt-2 border-t border-border">
                <Button onClick={() => regenerateThumb(inspected)} disabled={generatingId === inspected.id}
                  variant="outline" size="sm" className="w-full text-xs gap-1.5 h-8">
                  {generatingId === inspected.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {inspected.ai_thumbnail_url ? "Regenerate Thumbnail" : "Generate Thumbnail"}
                </Button>
                {inspected.image && (
                  <Button variant="ghost" size="sm" className="w-full text-xs gap-1.5 h-8"
                    onClick={() => { navigator.clipboard.writeText(inspected.image); toast.success("URL copied!"); }}>
                    <Copy className="w-3 h-3" /> Copy Image URL
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Fullscreen Preview ─── */}
      <Dialog open={!!previewSrc} onOpenChange={() => setPreviewSrc(null)}>
        <DialogContent className="max-w-2xl p-2 rounded-xl overflow-hidden bg-card">
          {previewSrc && <img src={previewSrc} alt="Preview" className="w-full h-auto rounded-lg" />}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
};

export default AdminMedia;
