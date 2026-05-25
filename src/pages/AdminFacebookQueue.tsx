
import { useState, useEffect } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell, openMobileSidebar } from "@/components/AdminShell";
import { AdminPageSkeleton } from "@/components/AdminSkeletons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  ArrowLeft, Facebook, Clock, Trash2, Edit, Loader2, Menu,
  ExternalLink, MessageSquare, Image as ImageIcon, Send,
  ChevronRight, MoreHorizontal, Eye, Copy
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface QueuedPost {
  id: string;
  article_id: string;
  fb_caption: string | null;
  status: string;
  created_at: string;
  article: {
    id: string;
    title: string;
    ai_title: string | null;
    image: string;
    ai_thumbnail_url: string | null;
    slug: string;
    categories: { slug: string; name: string } | null;
    fb_caption: string | null;
  };
}

const AdminFacebookQueue = () => {
  const { pageId } = useParams();
  const { user, isAdmin, loading } = useIsAdmin();
  
  const [pageName, setPageName] = useState("");
  const [posts, setPosts] = useState<QueuedPost[]>([]);
  const [fetching, setFetching] = useState(true);
  const [editingPost, setEditingPost] = useState<QueuedPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    caption: ""
  });

  const fetchQueue = async () => {
    if (!pageId) return;
    setFetching(true);
    
    const { data: pageData } = await supabase
      .from("facebook_pages")
      .select("page_name")
      .eq("id", pageId)
      .single();
    if (pageData) setPageName(pageData.page_name);

    const { data, error } = await supabase
      .from("article_fb_posts")
      .select(`
        id,
        article_id,
        status,
        created_at,
        article:articles (
          id,
          title,
          ai_title,
          image,
          ai_thumbnail_url,
          slug,
          fb_caption,
          categories (
            slug,
            name
          )
        )
      `)
      .eq("page_id", pageId)
      .eq("status", "queued")
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Failed to load queue");
    } else {
      setPosts((data as any[]) || []);
    }
    setFetching(false);
  };

  useEffect(() => {
    if (isAdmin) fetchQueue();
  }, [isAdmin, pageId]);

  const openEdit = (post: QueuedPost) => {
    setEditingPost(post);
    setEditForm({
      caption: post.article.fb_caption || post.article.ai_title || post.article.title
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPost) return;
    setSaving(true);
    
    const { error } = await supabase
      .from("articles")
      .update({ fb_caption: editForm.caption })
      .eq("id", editingPost.article_id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Caption updated!");
      fetchQueue();
      setEditingPost(null);
    }
    setSaving(false);
  };

  const handleDelete = async (postId: string) => {
    if (!confirm("Remove this article from the queue?")) return;
    setDeletingId(postId);
    const { error } = await supabase
      .from("article_fb_posts")
      .delete()
      .eq("id", postId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Removed from queue");
      fetchQueue();
    }
    setDeletingId(null);
  };

  if (loading) return <AdminShell activePage="facebook"><AdminPageSkeleton type="table" /></AdminShell>;
  if (!user) return <Navigate to="/signin" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AdminShell activePage="facebook">
      {/* ─── Top Bar ─── */}
      <header className="h-12 border-b border-border flex items-center gap-2 px-3 shrink-0 bg-card/30">
        <Link to="/admin/facebook" className="p-1.5 hover:bg-muted rounded-md shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Facebook className="w-4 h-4 text-blue-500" />
        <h1 className="text-sm font-bold truncate">Queue: {pageName}</h1>
        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{posts.length}</span>
        
        <div className="flex-1" />
        
        <button onClick={openMobileSidebar} className="md:hidden p-1.5 hover:bg-muted rounded-md shrink-0">
          <Menu className="w-4 h-4" />
        </button>
      </header>

      {/* ─── Dashboard Content (Compact Table) ─── */}
      <div className="flex-1 overflow-auto">
        {fetching ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Clock className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-sm font-semibold">Queue is Empty</h2>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Articles will appear here once they are auto-rewritten or manually queued.
            </p>
            <Link to="/admin">
              <Button size="sm" className="h-8 text-xs gap-1.5">
                Go to Dashboard
              </Button>
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-background shadow-sm">
              <tr className="border-b border-border text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                <th className="w-8 px-2 py-2">#</th>
                <th className="text-left px-2 py-2">Article</th>
                <th className="text-left px-2 py-2 hidden lg:table-cell">Category</th>
                <th className="text-left px-2 py-2 hidden md:table-cell">Scheduled</th>
                <th className="text-left px-2 py-2 hidden xl:table-cell">Caption</th>
                <th className="text-right px-2 py-2 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post, index) => {
                const article = post.article;
                const thumb = article.ai_thumbnail_url || article.image;
                const title = article.ai_title || article.title;
                const catSlug = article.categories?.slug || "news";
                const catName = article.categories?.name || "News";
                
                return (
                  <tr key={post.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                    <td className="px-2 py-2 text-center text-[10px] font-mono text-muted-foreground">
                      {index + 1}
                    </td>
                    
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Compact Thumbnail */}
                        <button 
                          onClick={() => setPreviewThumb(thumb)}
                          className="relative w-9 h-9 rounded overflow-hidden shrink-0 bg-muted hover:ring-2 hover:ring-blue-500/40 transition-all shadow-sm"
                        >
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                          {article.ai_thumbnail_url && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#FA76FF] rounded-tl flex items-center justify-center">
                              <ImageIcon className="w-2 h-2 text-white" />
                            </span>
                          )}
                        </button>
                        
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[13px] leading-tight line-clamp-1 group-hover:text-blue-600 transition-colors">
                            {title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 sm:hidden">
                             <span className="text-[10px] font-bold text-blue-600 uppercase">{catName}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-2 py-2 hidden lg:table-cell">
                      <span className="text-[11px] text-muted-foreground">{catName}</span>
                    </td>

                    <td className="px-2 py-2 hidden md:table-cell">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground">Wait 10m</span>
                        <span className="text-[9px] text-muted-foreground/50">
                          {new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>

                    <td className="px-2 py-2 hidden xl:table-cell">
                      {article.fb_caption ? (
                        <div className="flex items-center gap-1 max-w-[250px]">
                          <p className="text-[11px] text-muted-foreground line-clamp-1 flex-1" title={article.fb_caption}>
                            {article.fb_caption}
                          </p>
                          <button 
                            onClick={() => { navigator.clipboard.writeText(article.fb_caption || ""); toast.success("Copied!"); }}
                            className="p-0.5 hover:bg-muted rounded transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                          >
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/30 italic">Using AI Title...</span>
                      )}
                    </td>

                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button onClick={() => openEdit(post)} className="p-1.5 hover:bg-muted rounded-md transition-colors" title="Edit Caption">
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">Edit Caption</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a href={`/article/${catSlug}/${article.slug}`} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-muted rounded-md transition-colors">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">Preview Site</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button 
                                onClick={() => handleDelete(post.id)} 
                                disabled={deletingId === post.id} 
                                className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors text-destructive"
                              >
                                {deletingId === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">Cancel Post</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Image Preview Dialog ─── */}
      <Dialog open={!!previewThumb} onOpenChange={(open) => !open && setPreviewThumb(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black border-none">
          <img src={previewThumb || ""} alt="Preview" className="w-full h-auto" />
        </DialogContent>
      </Dialog>

      {/* ─── Edit Caption Dialog ─── */}
      <Dialog open={!!editingPost} onOpenChange={(open) => !open && setEditingPost(null)}>
        <DialogContent className="max-w-md rounded-xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-2">
            <DialogTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-500" /> Edit FB Caption
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5 space-y-4">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Article</label>
              <p className="text-xs font-semibold mt-0.5 truncate">{editingPost?.article.title}</p>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Facebook Caption</label>
              <Textarea 
                value={editForm.caption} 
                onChange={e => setEditForm({ ...editForm, caption: e.target.value })} 
                placeholder="Write an engaging caption..."
                className="mt-1 min-h-[120px] text-sm resize-none focus-visible:ring-blue-500"
              />
              <p className="text-[10px] text-muted-foreground mt-1.5">
                This caption will be used when the article is automatically posted to Facebook.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1 text-xs h-9" onClick={() => setEditingPost(null)}>Cancel</Button>
              <Button 
                className="flex-1 text-xs h-9 bg-blue-500 hover:bg-blue-600 text-white" 
                onClick={handleSaveEdit} 
                disabled={saving}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Save Caption
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
};

export default AdminFacebookQueue;
