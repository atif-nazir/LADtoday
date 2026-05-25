import { useState, useEffect } from "react";
import { Navigate, Link } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell, openMobileSidebar } from "@/components/AdminShell";
import { AdminPageSkeleton } from "@/components/AdminSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Edit, Menu, Facebook, Eye, EyeOff,
  Loader2, Check, X, Palette, Send, Power, ChevronRight, LayoutTemplate,
  RefreshCw, Clock
} from "lucide-react";
import { THUMBNAIL_THEMES, getThemeByKey, type ThumbnailTheme } from "@/utils/thumbnailGenerator";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FacebookPage {
  id: string;
  page_name: string;
  page_id: string;
  access_token: string;
  thumbnail_theme: string;
  thumbnail_template: string;
  default_post_type: string;
  auto_post: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Theme Swatch ────────────────────────────────────────────────────────────

const ThemeSwatch = ({ themeKey, selected, onClick }: {
  themeKey: string; selected: boolean; onClick: () => void;
}) => {
  const theme = THUMBNAIL_THEMES[themeKey];
  if (!theme) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-10 h-10 rounded-lg border-2 transition-all duration-200 flex items-center justify-center
        ${selected ? "border-[#FA76FF] ring-2 ring-[#FA76FF]/30 scale-110" : "border-border hover:border-muted-foreground/50"}`}
      style={{ backgroundColor: theme.primaryColor }}
      title={theme.name}
    >
      {selected && (
        <Check className="w-4 h-4" style={{ color: theme.textColor }} />
      )}
    </button>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

const AdminFacebookPages = () => {
  const { user, isAdmin, loading } = useIsAdmin();
  const queryClient = useQueryClient();

  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingPage, setEditingPage] = useState<FacebookPage | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runningJob, setRunningJob] = useState(false);

  // Form state
  const [form, setForm] = useState({
    page_name: "",
    page_id: "",
    access_token: "",
    thumbnail_theme: "pink",
    thumbnail_template: "classic",
    default_post_type: "photo",
    auto_post: false,
  });

  // ─── Fetch pages ──────────────────────────────────────────────────────
  const fetchPages = async () => {
    setPagesLoading(true);
    const { data, error } = await supabase
      .from("facebook_pages")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch pages:", error.message);
      toast.error("Failed to load Facebook pages");
    } else {
      setPages((data as FacebookPage[]) || []);
    }
    setPagesLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchPages();
  }, [isAdmin]);

  // ─── Handlers ─────────────────────────────────────────────────────────
  const resetForm = () => {
    setForm({ page_name: "", page_id: "", access_token: "", thumbnail_theme: "pink", thumbnail_template: "classic", default_post_type: "photo", auto_post: false });
    setEditingPage(null);
    setShowDialog(false);
  };

  const openCreate = () => {
    resetForm();
    setShowDialog(true);
  };

  const openEdit = (page: FacebookPage) => {
    setEditingPage(page);
    setForm({
      page_name: page.page_name,
      page_id: page.page_id,
      access_token: page.access_token,
      thumbnail_theme: page.thumbnail_theme || "pink",
      thumbnail_template: page.thumbnail_template || "classic",
      default_post_type: page.default_post_type || "photo",
      auto_post: page.auto_post,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.page_name.trim() || !form.page_id.trim() || !form.access_token.trim()) {
      toast.error("Page name, Page ID, and Access Token are required");
      return;
    }
    setSaving(true);

    const payload = {
      page_name: form.page_name.trim(),
      page_id: form.page_id.trim(),
      access_token: form.access_token.trim(),
      thumbnail_theme: form.thumbnail_theme,
      thumbnail_template: form.thumbnail_template,
      default_post_type: form.default_post_type,
      auto_post: form.auto_post,
    };

    let error;
    if (editingPage) {
      ({ error } = await supabase.from("facebook_pages").update(payload).eq("id", editingPage.id));
    } else {
      ({ error } = await supabase.from("facebook_pages").insert(payload));
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(editingPage ? "Page updated!" : "Page added!");
      await fetchPages();
      resetForm();
    }
    setSaving(false);
  };

  const handleDelete = async (page: FacebookPage) => {
    if (!confirm(`Delete "${page.page_name}"? This cannot be undone.`)) return;
    setDeletingId(page.id);
    const { error } = await supabase.from("facebook_pages").delete().eq("id", page.id);
    if (error) toast.error(error.message);
    else { toast.success("Page deleted!"); await fetchPages(); }
    setDeletingId(null);
  };

  const toggleActive = async (page: FacebookPage) => {
    const newVal = !page.is_active;
    const { error } = await supabase.from("facebook_pages").update({ is_active: newVal }).eq("id", page.id);
    if (error) toast.error(error.message);
    else {
      toast.success(newVal ? `"${page.page_name}" activated` : `"${page.page_name}" deactivated`);
      await fetchPages();
    }
  };

  const toggleAutoPost = async (page: FacebookPage) => {
    const newVal = !page.auto_post;
    const { error } = await supabase.from("facebook_pages").update({ auto_post: newVal }).eq("id", page.id);
    if (error) toast.error(error.message);
    else {
      toast.success(newVal ? `Auto-posting enabled for "${page.page_name}"` : `Auto-posting disabled for "${page.page_name}"`);
      await fetchPages();
    }
  };

  const runAutoPostJob = async () => {
    setRunningJob(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-post-facebook");
      if (error) throw error;
      
      if (data?.posted > 0) {
        toast.success(`Successfully posted ${data.posted} article(s)!`);
      } else if (data?.skipped) {
        toast.info("Job ran, but no articles were ready for posting.");
      } else {
        toast.info("Job completed. No new articles to post.");
      }
      await fetchPages();
    } catch (err: any) {
      console.error("Auto-post job failed:", err);
      toast.error(`Auto-post failed: ${err.message || "Unknown error"}`);
    } finally {
      setRunningJob(false);
    }
  };

  // ─── Guards ────────────────────────────────────────────────────────────
  if (loading) return <AdminShell activePage="facebook"><AdminPageSkeleton type="table" /></AdminShell>;
  if (!user) return <Navigate to="/signin" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AdminShell activePage="facebook">
      {/* ─── Top Bar ─── */}
      <header className="h-12 border-b border-border flex items-center gap-2 px-3 shrink-0 bg-card/30">
        <button onClick={openMobileSidebar} className="md:hidden p-1.5 hover:bg-muted rounded-md shrink-0">
          <Menu className="w-4 h-4" />
        </button>
        <Facebook className="w-4 h-4 text-blue-500" />
        <h1 className="text-sm font-bold">Facebook Pages</h1>
        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{pages.length}</span>

        <div className="flex-1" />

        <Button 
          variant="outline" 
          onClick={runAutoPostJob} 
          disabled={runningJob}
          size="sm" 
          className="h-7 text-[11px] gap-1 px-2.5 border-[#FA76FF] text-[#FA76FF] hover:bg-[#FA76FF]/5"
        >
          {runningJob ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          <span className="hidden sm:inline">Run Auto-Post</span><span className="sm:hidden">Run</span>
        </Button>

        <Button onClick={openCreate} size="sm" className="h-7 text-[11px] gap-1 bg-[#FA76FF] hover:bg-[#e060e6] text-white px-2.5">
          <Plus className="w-3 h-3" /> <span className="hidden sm:inline">Add Page</span><span className="sm:hidden">Add</span>
        </Button>
      </header>

      {/* ─── Info Banner ─── */}
      <div className="border-b border-border px-3 py-2 bg-blue-500/5 text-[11px] text-blue-600 flex items-center gap-2 shrink-0">
        <Facebook className="w-3.5 h-3.5 shrink-0" />
        <span>Manage your Facebook pages here. Each page has its own thumbnail theme and auto/manual posting control.</span>
      </div>

      {/* ─── Pages List ─── */}
      <div className="flex-1 overflow-auto">
        {pagesLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Facebook className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-sm font-semibold">No Facebook Pages</h2>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Add your Facebook pages to enable posting. Each page can have its own thumbnail style and posting behavior.
            </p>
            <Button onClick={openCreate} size="sm" className="h-8 text-xs gap-1.5 bg-[#FA76FF] hover:bg-[#e060e6] text-white">
              <Plus className="w-3.5 h-3.5" /> Add Your First Page
            </Button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto p-3 space-y-2">
            {pages.map(page => {
              const theme = getThemeByKey(page.thumbnail_theme);
              return (
                <div key={page.id}
                  className={`border rounded-xl overflow-hidden transition-all duration-200
                    ${page.is_active ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"}`}
                >
                  {/* Page Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                    {/* Theme color indicator */}
                    <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center shadow-sm"
                      style={{ backgroundColor: theme.primaryColor }}>
                      <Facebook className="w-5 h-5" style={{ color: theme.textColor }} />
                    </div>

                    {/* Page info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold truncate">{page.page_name}</h3>
                        {!page.is_active && (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">INACTIVE</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono truncate">{page.page_id}</span>
                        <span className="text-[10px] text-muted-foreground/40">·</span>
                        <span className="text-[10px] font-medium" style={{ color: theme.primaryColor }}>{theme.name}</span>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 justify-end">
                      {/* Auto-post badge */}
                      <button
                        onClick={() => toggleAutoPost(page)}
                        className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors
                          ${page.auto_post
                            ? "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        title={page.auto_post ? "Auto-posting ON — click to disable" : "Auto-posting OFF — click to enable"}
                      >
                        {page.auto_post ? <Send className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                        {page.auto_post ? "Auto" : "Manual"}
                      </button>

                      {/* View Queue Link */}
                      <Link
                        to={`/admin/facebook/queue/${page.id}`}
                        className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                        title="View Post Queue"
                      >
                        <Clock className="w-3 h-3" />
                        Queue
                      </Link>

                      {/* Active toggle */}
                      <button
                        onClick={() => toggleActive(page)}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors"
                        title={page.is_active ? "Deactivate" : "Activate"}
                      >
                        {page.is_active ? <Eye className="w-3.5 h-3.5 text-green-600" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>

                      {/* Edit */}
                      <button onClick={() => openEdit(page)} className="p-1.5 hover:bg-muted rounded-md transition-colors" title="Edit">
                        <Edit className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(page)}
                        disabled={deletingId === page.id}
                        className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors text-destructive"
                        title="Delete"
                      >
                        {deletingId === page.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expandable details */}
                  <div className="border-t border-border/50 px-4 py-2 flex flex-wrap items-center gap-y-2 gap-x-4 text-[11px] bg-muted/20">
                    <div className="flex items-center gap-1">
                      <LayoutTemplate className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium capitalize">{page.thumbnail_template || 'classic'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Palette className="w-3 h-3 text-muted-foreground" />
                      <div className="w-3 h-3 rounded-sm ml-1" style={{ backgroundColor: theme.primaryColor }} />
                      <span className="font-medium">{theme.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Send className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Posting:</span>
                      <span className={`font-medium ${page.auto_post ? "text-green-600" : "text-muted-foreground"}`}>
                        {page.auto_post ? "Automatic" : "Manual Only"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Token:</span>
                      <span className="font-mono text-[10px]">{page.access_token.slice(0, 12)}…</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Add/Edit Dialog ─── */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-md rounded-xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-2">
            <DialogTitle className="text-base flex items-center gap-2">
              <Facebook className="w-4 h-4 text-blue-500" />
              {editingPage ? "Edit Facebook Page" : "Add Facebook Page"}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[75vh] overflow-y-auto px-5 pb-5 space-y-4 scrollbar-thin">
            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Page Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Page Name *
                </label>
                <Input
                  value={form.page_name}
                  onChange={e => setForm({ ...form, page_name: e.target.value })}
                  placeholder="e.g., LADtoday"
                  className="h-8 text-[13px] bg-muted/30"
                />
              </div>

              {/* Facebook Page ID */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Facebook Page ID *
                </label>
                <Input
                  value={form.page_id}
                  onChange={e => setForm({ ...form, page_id: e.target.value })}
                  placeholder="numeric id"
                  className="h-8 text-[13px] bg-muted/30 font-mono"
                />
              </div>
            </div>

            {/* Access Token */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Page Access Token *
              </label>
              <Input
                type="password"
                value={form.access_token}
                onChange={e => setForm({ ...form, access_token: e.target.value })}
                placeholder="Paste token here"
                className="h-8 text-[13px] bg-muted/30 font-mono"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Thumbnail Theme */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Theme
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {Object.keys(THUMBNAIL_THEMES).map(key => (
                    <ThemeSwatch
                      key={key}
                      themeKey={key}
                      selected={form.thumbnail_theme === key}
                      onClick={() => setForm({ ...form, thumbnail_theme: key })}
                    />
                  ))}
                  <div className="relative">
                    <input
                      type="color"
                      value={form.thumbnail_theme.startsWith("#") ? form.thumbnail_theme : getThemeByKey(form.thumbnail_theme).primaryColor}
                      onChange={(e) => setForm({ ...form, thumbnail_theme: e.target.value })}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center 
                      ${form.thumbnail_theme.startsWith("#") ? "border-[#FA76FF] ring-2 ring-[#FA76FF]/30" : "border-border"}`}
                      style={{ backgroundColor: form.thumbnail_theme.startsWith("#") ? form.thumbnail_theme : getThemeByKey(form.thumbnail_theme).primaryColor }}
                    >
                      {form.thumbnail_theme.startsWith("#") ? <Check className="w-3 h-3 text-white" /> : null}
                    </div>
                  </div>
                </div>
              </div>

              {/* Thumbnail Template Type */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Layout
                </label>
                <div className="flex bg-muted rounded-lg p-1 border border-border h-8 shrink-0">
                  <button 
                    type="button"
                    onClick={() => setForm({ ...form, thumbnail_template: "classic" })}
                    className={`flex-1 rounded-md text-[10px] font-bold transition-all ${form.thumbnail_template === 'classic' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                  >
                    Classic
                  </button>
                  <button 
                    type="button"
                    onClick={() => setForm({ ...form, thumbnail_template: "bordered" })}
                    className={`flex-1 rounded-md text-[10px] font-bold transition-all ${form.thumbnail_template === 'bordered' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                  >
                    Bordered
                  </button>
                </div>
              </div>
            </div>

            {/* Default Post Type */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Post Style
              </label>
              <div className="flex bg-muted rounded-lg p-1 border border-border h-8 w-full">
                <button 
                  type="button"
                  onClick={() => setForm({ ...form, default_post_type: "photo" })}
                  className={`flex-1 rounded-md text-[10px] font-bold transition-all ${form.default_post_type === 'photo' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                >
                  Photo Post (Best Reach)
                </button>
                <button 
                  type="button"
                  onClick={() => setForm({ ...form, default_post_type: "link" })}
                  className={`flex-1 rounded-md text-[10px] font-bold transition-all ${form.default_post_type === 'link' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                >
                  Link Post
                </button>
              </div>
            </div>

            {/* Auto-post */}
            <div className="flex items-center justify-between py-1.5 border-t border-border mt-1">
              <div>
                <p className="text-[12px] font-bold">Auto-Posting</p>
                <p className="text-[10px] text-muted-foreground">Post articles automatically</p>
              </div>
              <Switch
                checked={form.auto_post}
                onCheckedChange={v => setForm({ ...form, auto_post: v })}
                className="scale-75 origin-right"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1 border-t border-border">
              <Button variant="ghost" className="flex-1 text-xs h-8" onClick={resetForm}>
                Cancel
              </Button>
              <Button
                className="flex-1 text-xs h-8 bg-[#FA76FF] hover:bg-[#e060e6] text-white"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                {editingPage ? "Update" : "Add Page"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
};

export default AdminFacebookPages;
