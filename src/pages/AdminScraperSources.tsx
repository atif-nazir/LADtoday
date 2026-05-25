import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useCategories } from "@/hooks/useArticles";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell, openMobileSidebar } from "@/components/AdminShell";
import { AdminPageSkeleton } from "@/components/AdminSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Trash2, Edit, Menu, Database, Eye, EyeOff, Check,
  Loader2, Globe, Send, Power, Sparkles, Code, Facebook
} from "lucide-react";
import { THUMBNAIL_THEMES, getThemeByKey } from "@/utils/thumbnailGenerator";

interface ScraperSource {
  id: string;
  name: string;
  url: string;
  category_id: string | null;
  thumbnail_theme: string;
  thumbnail_template: "classic" | "bordered";
  is_active: boolean;
  auto_scrape: boolean;
  scraping_method: string;
  selectors: any;
  last_scraped_at: string | null;
}

const ThemeSwatch = ({ themeKey, selected, onClick }: { themeKey: string; selected: boolean; onClick: () => void; }) => {
  const theme = getThemeByKey(themeKey);
  return (
    <button type="button" onClick={onClick} title={theme.name}
      className={`relative w-8 h-8 rounded-lg border-2 transition-all duration-200 flex items-center justify-center
        ${selected ? "border-[#FA76FF] ring-2 ring-[#FA76FF]/30 scale-110" : "border-border hover:border-muted-foreground/50"}`}
      style={{ backgroundColor: theme.primaryColor }}>
      {selected && <Check className="w-3 h-3" style={{ color: theme.textColor }} />}
    </button>
  );
};

const AdminScraperSources = () => {
  const { user, isAdmin, loading } = useIsAdmin();
  const { data: categories } = useCategories();

  const [sources, setSources] = useState<ScraperSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingSource, setEditingSource] = useState<ScraperSource | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [fbPages, setFbPages] = useState<{ id: string; page_name: string }[]>([]);

  const [form, setForm] = useState({
    name: "",
    url: "",
    category_id: "none",
    thumbnail_theme: "pink",
    thumbnail_template: "classic" as "classic" | "bordered",
    auto_scrape: false,
    scraping_method: "smart_ai",
    selectors: { link: "", title: "", content: "", image: "" },
    selected_fb_pages: [] as string[],
  });

  const fetchSources = async () => {
    setSourcesLoading(true);
    const { data, error } = await supabase.from("scraper_sources").select("*").order("created_at", { ascending: true });
    if (error) toast.error("Failed to load sources");
    else setSources(((data as unknown) as ScraperSource[]) || []);
    setSourcesLoading(false);
  };

  const fetchFbPages = async () => {
    const { data } = await supabase.from("facebook_pages").select("id, page_name").eq("is_active", true);
    if (data) setFbPages(data);
  };

  useEffect(() => { 
    if (isAdmin) {
      fetchSources(); 
      fetchFbPages();
    }
  }, [isAdmin]);

  const resetForm = () => {
    setForm({ name: "", url: "", category_id: "none", thumbnail_theme: "pink", thumbnail_template: "classic", auto_scrape: false, scraping_method: "smart_ai", selectors: { link: "", title: "", content: "", image: "" }, selected_fb_pages: [] });
    setEditingSource(null);
    setShowDialog(false);
  };

  const openCreate = () => { resetForm(); setShowDialog(true); };

  const openEdit = async (s: ScraperSource) => {
    setEditingSource(s);
    
    // Fetch currently mapped FB pages
    const { data: mappings } = await (supabase as any).from("scraper_source_fb_pages").select("page_id").eq("source_id", s.id);
    const selectedIds = (mappings as { page_id: string }[] | null)?.map(m => m.page_id) || [];

    setForm({
      name: s.name, url: s.url, category_id: s.category_id || "none", 
      thumbnail_theme: s.thumbnail_theme || "pink",
      thumbnail_template: s.thumbnail_template || "classic",
      auto_scrape: s.auto_scrape, scraping_method: s.scraping_method || "smart_ai",
      selectors: { link: s.selectors?.link || "", title: s.selectors?.title || "", content: s.selectors?.content || "", image: s.selectors?.image || "" },
      selected_fb_pages: selectedIds,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) return toast.error("Name and URL required");
    if (form.scraping_method === "css" && (!form.selectors.link || !form.selectors.content)) return toast.error("CSS Selectors for Link and Content are required");

    setSaving(true);
    const payload = {
      name: form.name.trim(), url: form.url.trim(),
      category_id: form.category_id === "none" ? null : form.category_id,
      thumbnail_theme: form.thumbnail_theme, 
      thumbnail_template: form.thumbnail_template,
      auto_scrape: form.auto_scrape,
      scraping_method: form.scraping_method, selectors: form.scraping_method === "css" ? form.selectors : {},
    };

    const { data, error } = editingSource 
      ? await supabase.from("scraper_sources").update(payload).eq("id", editingSource.id).select().single()
      : await supabase.from("scraper_sources").insert(payload).select().single();

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    const sourceId = data.id;

    // Update FB page mappings
    // 1. Delete old ones if editing
    if (editingSource) {
      await (supabase as any).from("scraper_source_fb_pages").delete().eq("source_id", sourceId);
    }
    // 2. Insert new ones
    if (form.selected_fb_pages.length > 0) {
      const mappings = form.selected_fb_pages.map(pageId => ({ source_id: sourceId, page_id: pageId }));
      await (supabase as any).from("scraper_source_fb_pages").insert(mappings);
    }

    toast.success(editingSource ? "Source updated!" : "Source added!"); 
    await fetchSources(); 
    resetForm();
    setSaving(false);
  };

  const handleDelete = async (s: ScraperSource) => {
    if (!confirm(`Delete "${s.name}"?`)) return;
    setDeletingId(s.id);
    const { error } = await supabase.from("scraper_sources").delete().eq("id", s.id);
    if (error) toast.error(error.message); else { toast.success("Deleted!"); await fetchSources(); }
    setDeletingId(null);
  };

  const toggleTarget = async (id: string, field: string, val: boolean) => {
    const { error } = await supabase.from("scraper_sources").update({ [field]: val }).eq("id", id);
    if (error) toast.error(error.message); else await fetchSources();
  };

  const executeScrape = async (s: ScraperSource) => {
    setScrapingId(s.id);
    try {
      const res = await supabase.functions.invoke("scrape-articles", { body: { sourceId: s.id } });
      if (res.error) throw new Error(res.error.message);
      toast.success(`Scraped successfully! Found new articles.`);
      fetchSources();
    } catch (err: any) {
      toast.error(`Scrape failed: ${err.message}`);
    }
    setScrapingId(null);
  };

  if (loading) return <AdminShell activePage="scraper"><AdminPageSkeleton type="table" /></AdminShell>;
  if (!user) return <Navigate to="/signin" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AdminShell activePage="scraper">
      <header className="h-12 border-b border-border flex items-center gap-2 px-3 shrink-0 bg-card/30">
        <button onClick={openMobileSidebar} className="md:hidden p-1.5 hover:bg-muted rounded-md shrink-0"><Menu className="w-4 h-4" /></button>
        <Database className="w-4 h-4 text-emerald-500" />
        <h1 className="text-sm font-bold">Scraper Sources</h1>
        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{sources.length}</span>
        <div className="flex-1" />
        <Button onClick={openCreate} size="sm" className="h-7 text-[11px] gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-2.5">
          <Plus className="w-3 h-3" /> <span className="hidden sm:inline">Add Source</span><span className="sm:hidden">Add</span>
        </Button>
      </header>

      <div className="border-b border-border px-3 py-2 bg-emerald-500/5 text-[11px] text-emerald-600 flex items-center gap-2 shrink-0">
        <Database className="w-3.5 h-3.5 shrink-0" />
        <span>Manage 100+ RSS feeds or websites using Smart AI or CSS Selectors to automate your news gathering.</span>
      </div>

      <div className="flex-1 overflow-auto">
        {sourcesLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center"><Database className="w-8 h-8 text-emerald-500" /></div>
            <h2 className="text-sm font-semibold">No Sources Configured</h2>
            <p className="text-xs text-muted-foreground text-center max-w-xs">Add target websites to begin filling your database automatically.</p>
            <Button onClick={openCreate} size="sm" className="h-8 text-xs gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white">
              <Plus className="w-3.5 h-3.5" /> Add Your First Source
            </Button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto p-3 space-y-2">
            {sources.map(s => {
              const theme = getThemeByKey(s.thumbnail_theme);
              const catName = categories?.find(c => c.id === s.category_id)?.name || "No Category";
              return (
                <div key={s.id} className={`border rounded-xl overflow-hidden transition-all duration-200 ${s.is_active ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center shadow-sm" style={{ backgroundColor: theme.primaryColor }}>
                      <Globe className="w-5 h-5" style={{ color: theme.textColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold truncate">{s.name}</h3>
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${s.scraping_method === 'smart_ai' ? 'bg-[#FA76FF]/10 text-[#FA76FF]' : 'bg-blue-500/10 text-blue-600'}`}>
                          {s.scraping_method === 'smart_ai' ? 'AI SMART' : s.scraping_method === 'legacy_theconversation' ? 'LEGACY' : 'CSS PULL'}
                        </span>
                        {!s.is_active && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">INACTIVE</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">{s.url.replace(/^https?:\/\//, '')}</span>
                        <span className="text-[10px] text-muted-foreground/40">·</span>
                        <span className="text-[10px] font-medium text-emerald-600">{catName}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 sm:max-w-[200px]">
                      <Button onClick={() => executeScrape(s)} disabled={scrapingId === s.id} size="sm" variant="outline" className="h-7 text-[10px] px-2 gap-1 bg-emerald-500/10 text-emerald-600 border-none hover:bg-emerald-500/20">
                        {scrapingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
                        Scrape Now
                      </Button>
                      <button onClick={() => toggleTarget(s.id, 'auto_scrape', !s.auto_scrape)} className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-md ${s.auto_scrape ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`} title="Auto-Scraping Toggle">
                        {s.auto_scrape ? <Send className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                      </button>
                      <button onClick={() => toggleTarget(s.id, 'is_active', !s.is_active)} className="p-1.5 hover:bg-muted rounded-md text-muted-foreground">
                        {s.is_active ? <Eye className="w-3 h-3 text-green-600" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                      <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-muted rounded-md text-muted-foreground"><Edit className="w-3 h-3" /></button>
                      <button onClick={() => handleDelete(s)} disabled={deletingId === s.id} className="p-1.5 hover:bg-destructive/10 rounded-md text-destructive">
                        {deletingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="border-t border-border/50 px-4 py-2 flex items-center gap-4 text-[10px] bg-muted/20">
                    <span className="text-muted-foreground">Last Scraped: {s.last_scraped_at ? new Date(s.last_scraped_at).toLocaleString() : 'Never'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-md rounded-xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-2"><DialogTitle className="text-base flex items-center gap-2"><Database className="w-4 h-4 text-emerald-500" /> {editingSource ? "Edit Source" : "Add Source"}</DialogTitle></DialogHeader>
          <div className="px-5 pb-5 space-y-4 max-h-[70vh] overflow-auto">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Website Name *</label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., TechCrunch" className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Base / RSS URL *</label>
              <Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." className="mt-1 h-9 text-sm font-mono" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Category Mapping</label>
                <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Category</SelectItem>
                    {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            <div className="space-y-4 pt-1">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Default Template Style</label>
                <div className="flex bg-muted/30 rounded-lg p-1 border border-border h-10 w-full shadow-sm">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, thumbnail_template: "classic" })}
                    className={`flex-1 rounded-md text-[10px] font-bold tracking-wide transition-all ${form.thumbnail_template === 'classic' ? 'bg-background shadow-sm text-[#FA76FF]' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Classic Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, thumbnail_template: "bordered" })}
                    className={`flex-1 rounded-md text-[10px] font-bold tracking-wide transition-all ${form.thumbnail_template === 'bordered' ? 'bg-background shadow-sm text-[#FA76FF]' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Bordered Style
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Thumbnail Theme</label>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {Object.keys(THUMBNAIL_THEMES).map(k => <ThemeSwatch key={k} themeKey={k} selected={form.thumbnail_theme === k} onClick={() => setForm({ ...form, thumbnail_theme: k })} />)}
                  <div className="w-px h-6 bg-border mx-1" />
                  <div className="relative">
                    <input
                      type="color"
                      value={form.thumbnail_theme.startsWith("#") ? form.thumbnail_theme : getThemeByKey(form.thumbnail_theme).primaryColor}
                      onChange={(e) => setForm({ ...form, thumbnail_theme: e.target.value })}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center 
                      ${form.thumbnail_theme.startsWith("#") ? "border-[#FA76FF] ring-2 ring-[#FA76FF]/30 scale-110" : "border-border"}`}
                      style={{ backgroundColor: form.thumbnail_theme.startsWith("#") ? form.thumbnail_theme : getThemeByKey(form.thumbnail_theme).primaryColor }}
                    >
                      {form.thumbnail_theme.startsWith("#") ? <Check className="w-3.5 h-3.5 text-white" /> : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-border rounded-lg overflow-hidden mt-2">
              <div className="bg-muted px-3 py-2 font-medium text-xs flex items-center gap-2 border-b border-border">
                {form.scraping_method === "smart_ai" ? <Sparkles className="w-3.5 h-3.5 text-[#FA76FF]" /> : <Code className="w-3.5 h-3.5 text-blue-500" />}
                Scraping Strategy
              </div>
              <div className="p-3 bg-card space-y-3">
                <div className="flex gap-2">
                  <Button type="button" variant={form.scraping_method === "smart_ai" ? "default" : "outline"} className={`flex-1 h-8 text-[10px] ${form.scraping_method === 'smart_ai' ? 'bg-[#FA76FF] text-white' : ''}`} onClick={() => setForm({ ...form, scraping_method: "smart_ai" })}>Smart AI Reader</Button>
                  <Button type="button" variant={form.scraping_method === "css" ? "default" : "outline"} className={`flex-1 h-8 text-[10px] ${form.scraping_method === 'css' ? 'bg-blue-500 text-white' : ''}`} onClick={() => setForm({ ...form, scraping_method: "css" })}>CSS Selectors</Button>
                </div>
                
                {form.scraping_method === "smart_ai" && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    AI will automatically read the URL and intelligently extract the best article links, titles, images, and content without you writing any fragile CSS selectors.
                  </p>
                )}
                
                {form.scraping_method === "css" && (
                  <div className="space-y-2 mt-2">
                    <div><label className="text-[10px] text-muted-foreground">List Items Selector (e.g., .post-feed article a)</label><Input className="h-7 text-xs font-mono mt-0.5" value={form.selectors.link} onChange={e => setForm({ ...form, selectors: { ...form.selectors, link: e.target.value } })} /></div>
                    <div><label className="text-[10px] text-muted-foreground">Detail Title Selector (e.g., h1.entry-title)</label><Input className="h-7 text-xs font-mono mt-0.5" value={form.selectors.title} onChange={e => setForm({ ...form, selectors: { ...form.selectors, title: e.target.value } })} /></div>
                    <div><label className="text-[10px] text-muted-foreground">Detail Content Selector (e.g., .post-content p)</label><Input className="h-7 text-xs font-mono mt-0.5" value={form.selectors.content} onChange={e => setForm({ ...form, selectors: { ...form.selectors, content: e.target.value } })} /></div>
                    <div><label className="text-[10px] text-muted-foreground">Detail Image Selector (e.g., figure img)</label><Input className="h-7 text-xs font-mono mt-0.5" value={form.selectors.image} onChange={e => setForm({ ...form, selectors: { ...form.selectors, image: e.target.value } })} /></div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between py-2 border-t border-border">
              <div><p className="text-sm font-medium">Auto-Pull (10m gap)</p><p className="text-[11px] text-muted-foreground">Continuously fetch articles from this source.</p></div>
              <Switch checked={form.auto_scrape} onCheckedChange={v => setForm({ ...form, auto_scrape: v })} />
            </div>

            <div className="pt-2 border-t border-border">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2 mb-2">
                <Facebook className="w-3 h-3" /> Auto-Post to Facebook Pages
              </label>
              {fbPages.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic">No active Facebook pages found. Configure them in Facebook settings first.</p>
              ) : (
                <div className="space-y-2 bg-muted/30 p-2.5 rounded-lg border border-border/50">
                  {fbPages.map(page => (
                    <div key={page.id} className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id={`page-${page.id}`}
                        checked={form.selected_fb_pages.includes(page.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm(prev => ({
                            ...prev,
                            selected_fb_pages: checked 
                              ? [...prev.selected_fb_pages, page.id]
                              : prev.selected_fb_pages.filter(id => id !== page.id)
                          }));
                        }}
                        className="w-3.5 h-3.5 rounded border-border text-[#FA76FF] focus:ring-[#FA76FF]"
                      />
                      <label htmlFor={`page-${page.id}`} className="text-xs cursor-pointer select-none">{page.page_name}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1 text-xs h-9" onClick={resetForm}>Cancel</Button>
              <Button className="flex-1 text-xs h-9 bg-emerald-500 hover:bg-emerald-600 text-white" onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}{editingSource ? "Update" : "Add Source"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
};

export default AdminScraperSources;
