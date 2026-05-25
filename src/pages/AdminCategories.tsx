import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useCategories, useAllArticlesAdmin } from "@/hooks/useArticles";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell, openMobileSidebar } from "@/components/AdminShell";
import { AdminPageSkeleton } from "@/components/AdminSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Loader2, Menu, FolderOpen, Check, X, Edit, Eye, EyeOff, CheckCircle2
} from "lucide-react";
import { THUMBNAIL_THEMES, getThemeByKey } from "@/utils/thumbnailGenerator";

const AdminCategories = () => {
  const { user, isAdmin, loading } = useIsAdmin();
  const { data: categories, isLoading } = useCategories();
  const { data: articles } = useAllArticlesAdmin();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [thumbnailTheme, setThumbnailTheme] = useState("pink");

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const generateSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const getArticleCount = (catId: string) => articles?.filter(a => a.category_id === catId).length || 0;

  const openCreate = () => { setEditingId(null); setName(""); setSlug(""); setThumbnailTheme("pink"); setShowDialog(true); };
  const openEdit = (cat: any) => { setEditingId(cat.id); setName(cat.name); setSlug(cat.slug); setThumbnailTheme(cat.thumbnail_theme || "pink"); setShowDialog(true); };

  const startRename = (cat: any) => { setRenamingId(cat.id); setRenameValue(cat.name); };
  const cancelRename = () => { setRenamingId(null); setRenameValue(""); };
  const saveRename = async (cat: any) => {
    if (!renameValue.trim() || renameValue.trim() === cat.name) { cancelRename(); return; }
    const { error } = await supabase.from("categories").update({ name: renameValue.trim() }).eq("id", cat.id);
    if (error) toast.error(error.message);
    else { toast.success("Renamed!"); queryClient.invalidateQueries({ queryKey: ["categories"] }); }
    cancelRename();
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Name is required");
    const payload = { 
      name: name.trim(), 
      slug: slug.trim() || generateSlug(name),
      thumbnail_theme: thumbnailTheme 
    };
    let error;
    if (editingId) ({ error } = await supabase.from("categories").update(payload).eq("id", editingId));
    else ({ error } = await supabase.from("categories").insert(payload));
    if (error) toast.error(error.message);
    else { toast.success(editingId ? "Updated!" : "Created!"); queryClient.invalidateQueries({ queryKey: ["categories"] }); setShowDialog(false); }
  };

  const handleDelete = async (id: string, catName: string) => {
    const count = getArticleCount(id);
    if (count > 0) return toast.error(`Cannot delete "${catName}" — ${count} articles assigned`);
    if (!confirm(`Delete "${catName}"?`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted!"); queryClient.invalidateQueries({ queryKey: ["categories"] }); selectedIds.delete(id); setSelectedIds(new Set(selectedIds)); }
  };

  const bulkDelete = async () => {
    const deletable = [...selectedIds].filter(id => getArticleCount(id) === 0);
    if (!deletable.length) return toast.error("Selected categories have articles assigned");
    if (!confirm(`Delete ${deletable.length} categories?`)) return;
    for (const id of deletable) { await supabase.from("categories").delete().eq("id", id); }
    toast.success(`Deleted ${deletable.length} categories`);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (!categories) return;
    if (selectedIds.size === categories.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(categories.map(c => c.id)));
  };

  if (loading) return <AdminShell activePage="categories"><AdminPageSkeleton type="table" /></AdminShell>;
  if (!user) return <Navigate to="/signin" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AdminShell activePage="categories">
      {/* ─── Sticky Toolbar ─── */}
      <header className="h-12 border-b border-border flex items-center gap-2 px-3 shrink-0 bg-card/30">
        <button onClick={openMobileSidebar} className="md:hidden p-1.5 hover:bg-muted rounded-md shrink-0">
          <Menu className="w-4 h-4" />
        </button>
        <FolderOpen className="w-4 h-4 text-[#FA76FF]" />
        <h1 className="text-sm font-bold">Categories</h1>
        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{categories?.length || 0}</span>

        <div className="flex-1" />

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-1 mr-2">
            <span className="text-[11px] font-medium text-[#FA76FF]">{selectedIds.size} selected</span>
            <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 text-destructive px-2" onClick={bulkDelete}>
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
            <button className="p-1 hover:bg-muted rounded" onClick={() => setSelectedIds(new Set())}><X className="w-3 h-3" /></button>
          </div>
        )}

        <Button onClick={openCreate} size="sm" className="h-7 text-[11px] gap-1 bg-[#FA76FF] hover:bg-[#e060e6] text-white px-2.5">
          <Plus className="w-3 h-3" /> <span className="hidden sm:inline">New Category</span><span className="sm:hidden">New</span>
        </Button>
      </header>

      {/* ─── Table ─── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-[11px] text-muted-foreground font-medium">
              <th className="w-8 px-2 py-2">
                <Checkbox checked={!!categories?.length && selectedIds.size === categories.length}
                  onCheckedChange={toggleSelectAll} className="w-3.5 h-3.5" />
              </th>
              <th className="text-left px-2 py-2">Name</th>
              <th className="text-left px-2 py-2 hidden sm:table-cell">Slug</th>
              <th className="text-center px-2 py-2 w-20">Theme</th>
              <th className="text-center px-2 py-2 w-20">Articles</th>
              <th className="text-right px-2 py-2 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  <td className="px-2 py-2.5"><div className="w-3.5 h-3.5 rounded bg-muted animate-pulse" /></td>
                  <td className="px-2 py-2.5"><div className="h-4 rounded bg-muted animate-pulse" style={{ width: `${60 + Math.random() * 40}%`, opacity: 1 - i * 0.1 }} /></td>
                  <td className="px-2 py-2.5 hidden sm:table-cell"><div className="h-3 w-20 rounded bg-muted animate-pulse" style={{ opacity: 1 - i * 0.1 }} /></td>
                  <td className="px-2 py-2.5 text-center"><div className="h-3 w-5 rounded bg-muted animate-pulse mx-auto" style={{ opacity: 1 - i * 0.1 }} /></td>
                  <td className="px-2 py-2.5"><div className="h-3 w-10 rounded bg-muted animate-pulse ml-auto" style={{ opacity: 1 - i * 0.1 }} /></td>
                </tr>
              ))
            ) : !categories?.length ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-xs">
                No categories yet. Click "+ New Category" to create one.
              </td></tr>
            ) : categories.map(cat => {
              const count = getArticleCount(cat.id);
              const isRenaming = renamingId === cat.id;
              return (
                <tr key={cat.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors group ${selectedIds.has(cat.id) ? "bg-[#FA76FF]/5" : ""}`}>
                  {/* Checkbox */}
                  <td className="px-2 py-1.5">
                    <Checkbox checked={selectedIds.has(cat.id)} onCheckedChange={() => toggleSelect(cat.id)} className="w-3.5 h-3.5" />
                  </td>

                  {/* Name — inline rename */}
                  <td className="px-2 py-1.5">
                    {isRenaming ? (
                      <div className="flex items-center gap-1">
                        <Input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveRename(cat); if (e.key === "Escape") cancelRename(); }}
                          className="h-7 text-sm w-full max-w-[200px]" autoFocus />
                        <button onClick={() => saveRename(cat)} className="p-1 hover:bg-green-500/10 rounded text-green-600"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={cancelRename} className="p-1 hover:bg-muted rounded"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => startRename(cat)} className="text-sm font-medium hover:text-[#FA76FF] transition-colors text-left" title="Click to rename">
                        {cat.name}
                      </button>
                    )}
                  </td>

                  {/* Slug */}
                  <td className="px-2 py-1.5 hidden sm:table-cell">
                    <span className="text-[11px] text-muted-foreground font-mono">/{cat.slug}</span>
                  </td>
                  
                  {/* Theme Swatch */}
                  <td className="px-2 py-1.5 text-center">
                    <div className="w-6 h-6 rounded-md border border-border mx-auto shadow-sm"
                      style={{ backgroundColor: (cat as any).thumbnail_theme?.startsWith("#") ? (cat as any).thumbnail_theme : getThemeByKey((cat as any).thumbnail_theme || "pink").primaryColor }} />
                  </td>

                  {/* Article count */}
                  <td className="px-2 py-1.5 text-center">
                    <span className={`text-xs font-mono font-medium ${count > 0 ? "text-foreground" : "text-muted-foreground/30"}`}>{count}</span>
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(cat)} className="p-1.5 hover:bg-muted rounded-md transition-colors" title="Edit name & slug">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(cat.id, cat.name)}
                        className={`p-1.5 rounded-md transition-colors ${count > 0 ? "text-muted-foreground/30 cursor-not-allowed" : "hover:bg-destructive/10 text-destructive"}`}
                        title={count > 0 ? `Has ${count} articles` : "Delete"} disabled={count > 0}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Create/Edit Dialog ─── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm rounded-xl p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-base">{editingId ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Name *</label>
              <Input value={name} onChange={e => { setName(e.target.value); if (!editingId) setSlug(generateSlug(e.target.value)); }}
                placeholder="Category name" className="mt-1 h-9 text-sm" autoFocus />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Slug</label>
              <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto-generated" className="mt-1 h-8 text-xs font-mono" />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Default Branding (Thumbnail Theme)</label>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {Object.keys(THUMBNAIL_THEMES).map(key => {
                  const theme = THUMBNAIL_THEMES[key];
                  const selected = thumbnailTheme === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setThumbnailTheme(key)}
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
                    value={thumbnailTheme.startsWith("#") ? thumbnailTheme : getThemeByKey(thumbnailTheme).primaryColor}
                    onChange={(e) => setThumbnailTheme(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center 
                    ${thumbnailTheme.startsWith("#") ? "border-[#FA76FF] ring-2 ring-[#FA76FF]/30 scale-110" : "border-border"}`}
                    style={{ backgroundColor: thumbnailTheme.startsWith("#") ? thumbnailTheme : getThemeByKey(thumbnailTheme).primaryColor }}
                  >
                    {thumbnailTheme.startsWith("#") ? <Check className="w-3.5 h-3.5 text-white" /> : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button size="sm" className="text-xs bg-[#FA76FF] hover:bg-[#e060e6] text-white" onClick={handleSave}>
                {editingId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
};

export default AdminCategories;
