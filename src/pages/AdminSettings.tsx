import { useState, useEffect, ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell, openMobileSidebar } from "@/components/AdminShell";
import { AdminPageSkeleton } from "@/components/AdminSkeletons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAllArticlesAdmin, useCategories } from "@/hooks/useArticles";
import {
  Loader2, Menu, Settings, Power, RefreshCw, Trash2,
  FileText, FolderOpen, ImagePlus, MessageSquare, Eye, Sparkles,
  ChevronRight, AlertTriangle, Clock, Facebook, Send, Database
} from "lucide-react";

// ─── Collapsible settings section ────────────────────────────────────
const SettingsSection = ({ icon: Icon, title, right, children, defaultOpen = false, iconColor = "text-[#FA76FF]" }: {
  icon: any; title: string; right?: ReactNode; children: ReactNode; defaultOpen?: boolean; iconColor?: string;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors">
        <Icon className={`w-4 h-4 ${iconColor} shrink-0`} />
        <span className="text-sm font-medium flex-1">{title}</span>
        {right && <div onClick={e => e.stopPropagation()} className="shrink-0">{right}</div>}
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t border-border">{children}</div>}
    </div>
  );
};

// ─── AI Provider status + retry ──────────────────────────────────────
const AIProviderStatus = ({ aiPending, aiFailed }: { aiPending: number; aiFailed: number }) => {
  const [status, setStatus] = useState<{ provider: string; model: string; configured: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("ai-admin", { body: { action: "status" } });
    if (!error && data) setStatus(data as any);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const retry = async () => {
    setRetrying(true);
    const { data, error } = await supabase.functions.invoke("ai-admin", { body: { action: "retry_failed" } });
    setRetrying(false);
    if (error) {
      toast.error(error.message || "Retry failed");
    } else {
      toast.success(`Re-queued ${(data as any)?.requeued ?? 0} failed article(s) for AI rewrite`);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-md bg-muted/40 border border-border">
      <span className="text-muted-foreground">Provider:</span>
      <span className="font-mono font-medium">Gemini</span>
      {status && (
        <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${status.configured ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
          {status.configured ? "configured" : "GEMINI_API_KEY missing"}
        </span>
      )}
      {status?.model && <span className="text-muted-foreground font-mono text-[10px]">{status.model}</span>}
      {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      <div className="ml-auto flex items-center gap-2">
        {aiFailed > 0 && (
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
            onClick={retry} disabled={retrying}>
            {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Retry {aiFailed} failed
          </Button>
        )}
      </div>
    </div>
  );
};


// ─── Main ────────────────────────────────────────────────────────────
const AdminSettings = () => {
  const { user, isAdmin, loading } = useIsAdmin();
  const { data: articles } = useAllArticlesAdmin();
  const { data: categories } = useCategories();

  const [autoRewrite, setAutoRewrite] = useState(true);
  const [autoThumbnail, setAutoThumbnail] = useState(true);
  const [autoFbPost, setAutoFbPost] = useState(true);
  const [autoScrape, setAutoScrape] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("settings").select("key, value").in("key", ["auto_rewrite_enabled", "auto_thumbnail_enabled", "auto_fb_post_enabled", "auto_scrape_enabled"])
      .then(({ data }) => {
        if (data) {
          const rewriteRow = data.find(d => d.key === "auto_rewrite_enabled");
          const thumbRow = data.find(d => d.key === "auto_thumbnail_enabled");
          const fbRow = data.find(d => d.key === "auto_fb_post_enabled");
          const scrapeRow = data.find(d => d.key === "auto_scrape_enabled");
          if (rewriteRow) setAutoRewrite(rewriteRow.value === true);
          if (thumbRow) setAutoThumbnail(thumbRow.value === true);
          if (fbRow) setAutoFbPost(fbRow.value === true);
          if (scrapeRow) setAutoScrape(scrapeRow.value === true);
        }
      });
  }, []);

  const toggleAutoRewrite = async () => {
    setSaving(true);
    const newVal = !autoRewrite;
    await supabase.from("settings").update({ value: newVal, updated_at: new Date().toISOString() }).eq("key", "auto_rewrite_enabled");
    setAutoRewrite(newVal);
    toast.success(newVal ? "Auto-rewrite enabled" : "Auto-rewrite disabled");
    setSaving(false);
  };

  const toggleAutoThumbnail = async () => {
    setSaving(true);
    const newVal = !autoThumbnail;
    await supabase.from("settings").upsert({ key: "auto_thumbnail_enabled", value: newVal, updated_at: new Date().toISOString() });
    setAutoThumbnail(newVal);
    toast.success(newVal ? "Auto-thumbnails enabled" : "Auto-thumbnails disabled");
    setSaving(false);
  };

  const toggleAutoFbPost = async () => {
    setSaving(true);
    const newVal = !autoFbPost;
    await supabase.from("settings").upsert({ key: "auto_fb_post_enabled", value: newVal, updated_at: new Date().toISOString() });
    setAutoFbPost(newVal);
    toast.success(newVal ? "Auto Facebook posting enabled" : "Auto Facebook posting disabled");
    setSaving(false);
  };

  const toggleAutoScrape = async () => {
    setSaving(true);
    const newVal = !autoScrape;
    await supabase.from("settings").upsert({ key: "auto_scrape_enabled", value: newVal, updated_at: new Date().toISOString() });
    setAutoScrape(newVal);
    toast.success(newVal ? "Master scraper enabled" : "Master scraper disabled");
    setSaving(false);
  };

  const [fbStats, setFbStats] = useState({
    autoPosted: 0,
    manualPosted: 0,
    ready: 0,
    waitThumb: 0
  });

  useEffect(() => {
    const fetchFBStats = async () => {
      // 1. Get all post records
      const { data: posts } = await supabase.from("article_fb_posts").select("status, article:articles(ai_thumbnail_url)");
      if (!posts) return;

      const stats = { autoPosted: 0, manualPosted: 0, ready: 0, waitThumb: 0 };
      posts.forEach((p: any) => {
        if (p.status === "auto_posted") stats.autoPosted++;
        if (p.status === "manual_posted") stats.manualPosted++;
        if (p.status === "queued") {
          if (p.article?.ai_thumbnail_url) stats.ready++;
          else stats.waitThumb++;
        }
      });
      setFbStats(stats);
    };
    fetchFBStats();
  }, [articles]);

  // Computed stats
  const totalArticles = articles?.length || 0;
  const published = articles?.filter(a => a.published).length || 0;
  const drafts = totalArticles - published;
  const totalCats = categories?.length || 0;
  const aiCompleted = articles?.filter(a => a.ai_rewrite_status === "completed").length || 0;
  const aiFailed = articles?.filter(a => a.ai_rewrite_status === "failed").length || 0;
  const aiPending = articles?.filter(a => a.ai_rewrite_status === "pending").length || 0;
  const aiProcessing = articles?.filter(a => a.ai_rewrite_status === "processing").length || 0;
  const withThumbs = articles?.filter(a => a.ai_thumbnail_url).length || 0;
  const missingThumbs = totalArticles - withThumbs;
  const withCaptions = articles?.filter(a => !!a.fb_caption).length || 0;
  const missingCaptions = totalArticles - withCaptions;
  
  const fbPosted = fbStats.autoPosted + fbStats.manualPosted;
  const fbAutoPosted = fbStats.autoPosted;
  const fbManualPosted = fbStats.manualPosted;
  const fbReady = fbStats.ready;
  const fbWaitingThumb = fbStats.waitThumb;

  if (loading) return <AdminShell activePage="settings"><AdminPageSkeleton type="settings" /></AdminShell>;
  if (!user) return <Navigate to="/signin" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AdminShell activePage="settings">
      {/* ─── Top Bar ─── */}
      <header className="h-12 border-b border-border flex items-center gap-2 px-3 shrink-0 bg-card/30">
        <button onClick={openMobileSidebar} className="md:hidden p-1.5 hover:bg-muted rounded-md shrink-0">
          <Menu className="w-4 h-4" />
        </button>
        <Settings className="w-4 h-4 text-[#FA76FF]" />
        <h1 className="text-sm font-bold">Settings</h1>
      </header>

      {/* ─── Metrics Strip ─── */}
      <div className="border-b border-border flex items-center px-3 py-1.5 text-[11px] bg-muted/20 overflow-x-auto scrollbar-hide gap-3 shrink-0">
        {[
          { label: "Articles", value: totalArticles, cls: "text-foreground" },
          { label: "Published", value: published, cls: "text-green-600" },
          { label: "Drafts", value: drafts, cls: "text-muted-foreground" },
          { label: "Categories", value: totalCats, cls: "text-blue-500" },
          { label: "AI Done", value: aiCompleted, cls: "text-green-600" },
          { label: "Thumbs", value: withThumbs, cls: "text-emerald-600" },
          { label: "Captions", value: withCaptions, cls: "text-sky-600" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1 shrink-0">
            <span className={`font-bold font-mono text-xs ${s.cls}`}>{s.value}</span>
            <span className="text-muted-foreground/70 whitespace-nowrap">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ─── Settings Sections ─── */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-3 space-y-2">

          {/* ── Scraper Master Switch ── */}
          <SettingsSection icon={Database} title="Scraper System (Master Switch)" iconColor="text-emerald-500"
            right={<Switch checked={autoScrape} onCheckedChange={toggleAutoScrape} disabled={saving} />}
            defaultOpen>
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">The master control switch for the automated background scraper. Turns ON/OFF scraping entirely, overriding individual source settings.</p>
              <div className={`text-[11px] px-2.5 py-1.5 rounded-md ${autoScrape ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                {autoScrape ? "✓ Active — background scraper is running every 10 minutes" : "✗ Disabled — background scraper is entirely paused"}
              </div>
              <a href="/admin/scraper" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors mt-1">
                <Database className="w-3.5 h-3.5" />
                Manage 100+ Scraper Sources →
              </a>
            </div>
          </SettingsSection>

          {/* ── AI Auto-Rewrite ── */}
          <SettingsSection icon={Power} title="AI Auto-Rewrite"
            right={<Switch checked={autoRewrite} onCheckedChange={toggleAutoRewrite} disabled={saving} />}
            defaultOpen>
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">Scraped articles are automatically rewritten by AI when enabled. AI uses your Gemini API key (server-side only).</p>
              <AIProviderStatus aiPending={aiPending} aiFailed={aiFailed} />
              <div className={`text-[11px] px-2.5 py-1.5 rounded-md ${autoRewrite ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                {autoRewrite ? "✓ Active — new articles will be auto-rewritten" : "✗ Disabled — articles stay as scraped"}
              </div>
              {/* AI pipeline stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {[
                  { label: "Pending", value: aiPending, icon: Clock, cls: "text-yellow-600" },
                  { label: "Processing", value: aiProcessing, icon: Loader2, cls: "text-blue-500" },
                  { label: "Completed", value: aiCompleted, icon: Sparkles, cls: "text-green-600" },
                  { label: "Failed", value: aiFailed, icon: AlertTriangle, cls: "text-destructive" },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
                    <s.icon className={`w-3 h-3 ${s.cls}`} />
                    <span className="font-mono font-medium">{s.value}</span>
                    <span className="text-muted-foreground">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </SettingsSection>

          {/* ── Thumbnails ── */}
          <SettingsSection icon={ImagePlus} title="Thumbnail Generation" iconColor="text-emerald-500"
            right={<Switch checked={autoThumbnail} onCheckedChange={toggleAutoThumbnail} disabled={saving} />}>
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">AI-generated branded thumbnails for articles.</p>
              <div className={`text-[11px] px-2.5 py-1.5 rounded-md ${autoThumbnail ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                {autoThumbnail ? "✓ Active — missing thumbnails will be auto-generated in background" : "✗ Disabled — thumbnails must be generated manually"}
              </div>
              <div className="flex items-center gap-4 text-[11px] pt-1 pt-1">
                <span className="text-emerald-600 font-medium">{withThumbs} generated</span>
                <span className="text-muted-foreground">{missingThumbs} missing</span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: totalArticles ? `${(withThumbs / totalArticles) * 100}%` : "0%" }} />
              </div>
            </div>
          </SettingsSection>

          {/* ── Captions ── */}
          <SettingsSection icon={MessageSquare} title="Facebook Captions" iconColor="text-sky-500"
            right={<span className="text-[11px] font-mono text-sky-600 font-medium">{withCaptions}/{totalArticles}</span>}>
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">Short, engaging captions for Facebook article sharing.</p>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="text-sky-600 font-medium">{withCaptions} generated</span>
                <span className="text-muted-foreground">{missingCaptions} missing</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: totalArticles ? `${(withCaptions / totalArticles) * 100}%` : "0%" }} />
              </div>
            </div>
          </SettingsSection>

          {/* ── Facebook Pages ── */}
          <SettingsSection icon={Send} title="Facebook Pages" iconColor="text-blue-500"
            right={<span className="text-[11px] font-mono text-blue-600 font-medium">{fbPosted} posted</span>}
            defaultOpen>
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">Manage your Facebook pages, thumbnail themes, and posting behavior.</p>
              <div className="grid grid-cols-4 gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Eye className="w-3 h-3 text-green-600" />
                  <span className="font-mono font-medium">{fbAutoPosted}</span>
                  <span className="text-muted-foreground">Auto</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Eye className="w-3 h-3 text-indigo-600" />
                  <span className="font-mono font-medium">{fbManualPosted}</span>
                  <span className="text-muted-foreground">Manual</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Clock className="w-3 h-3 text-yellow-600" />
                  <span className="font-mono font-medium">{fbReady}</span>
                  <span className="text-muted-foreground">Ready</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <ImagePlus className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono font-medium">{fbWaitingThumb}</span>
                  <span className="text-muted-foreground">Wait Thumb</span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: totalArticles ? `${(fbPosted / totalArticles) * 100}%` : "0%" }} />
              </div>
              <a href="/admin/facebook" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 hover:text-blue-700 transition-colors mt-1">
                <Facebook className="w-3.5 h-3.5" />
                Manage Facebook Pages →
              </a>
            </div>
          </SettingsSection>

          {/* ── Content Overview ── */}
          <SettingsSection icon={FileText} title="Content Overview" iconColor="text-muted-foreground"
            right={<span className="text-[11px] font-mono text-foreground font-medium">{totalArticles}</span>}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total", value: totalArticles, icon: FileText, cls: "text-foreground" },
                { label: "Published", value: published, icon: Eye, cls: "text-green-600" },
                { label: "Drafts", value: drafts, icon: FileText, cls: "text-muted-foreground" },
                { label: "Categories", value: totalCats, icon: FolderOpen, cls: "text-blue-500" },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2 text-[11px]">
                  <s.icon className={`w-3.5 h-3.5 ${s.cls}`} />
                  <div>
                    <span className="font-mono font-bold text-sm">{s.value}</span>
                    <span className="text-muted-foreground ml-1">{s.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </SettingsSection>

          {/* ── System & Edge Functions ── */}
          <SettingsSection icon={RefreshCw} title="Edge Function Deployments" iconColor="text-orange-500">
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Edge functions auto-deploy via <span className="font-mono font-medium text-foreground">GitHub Actions</span> whenever <span className="font-mono">supabase/functions/**</span> changes on <span className="font-mono">main</span>. You can also trigger a manual redeploy from the Actions tab.
              </p>

              <div className="space-y-2">
                {[
                  { name: "auto-rewrite", desc: "AI Content Engine" },
                  { name: "auto-post-facebook", desc: "Facebook Queue Consumer" },
                  { name: "scrape-articles", desc: "Background News Scraper" },
                  { name: "social-meta-proxy", desc: "FB Link Preview Handler" },
                  { name: "rewrite-article", desc: "Manual AI Rewrite" },
                  { name: "generate-caption", desc: "FB Caption Generator" },
                  { name: "manual-post-facebook", desc: "Manual FB Publisher" },
                ].map(func => (
                  <div key={func.name} className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/20">
                    <div className="min-w-0">
                      <h4 className="text-[11px] font-bold font-mono truncate">{func.name}</h4>
                      <p className="text-[10px] text-muted-foreground truncate">{func.desc}</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shrink-0">
                      auto-deploy
                    </span>
                  </div>
                ))}
              </div>

              <a
                href="https://github.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-orange-600 hover:text-orange-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Open GitHub Actions → "Deploy Supabase Edge Functions" → Run workflow
              </a>

              <div className="mt-2 p-2 rounded-md bg-orange-500/5 border border-orange-500/10 text-[10px] text-orange-700 leading-relaxed space-y-1">
                <p><strong>One-time setup</strong> in your GitHub repo (Settings → Secrets → Actions):</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li><span className="font-mono">SUPABASE_ACCESS_TOKEN</span> — your PAT from supabase.com/dashboard/account/tokens</li>
                  <li><span className="font-mono">SUPABASE_PROJECT_ID</span> — <span className="font-mono">esrqqkjkwomqlxjpcefg</span></li>
                </ul>
              </div>
            </div>
          </SettingsSection>

          {/* ── Account ── */}
          <SettingsSection icon={Settings} title="Account" iconColor="text-muted-foreground"
            right={
              <Button variant="outline" size="sm" className="text-[10px] h-6 text-destructive border-destructive/30 hover:bg-destructive/5 px-2"
                onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}>
                Sign Out
              </Button>
            }>
            <div className="text-[11px] text-muted-foreground">
              <p>Logged in as <span className="font-medium text-foreground">{user?.email}</span></p>
              <p className="mt-1">Role: Admin</p>
            </div>
          </SettingsSection>

          {/* Extensibility placeholder — future sections go here */}
          {/*
          <SettingsSection icon={SomeIcon} title="New Section" iconColor="text-orange-500">
            <p>Add any new controls here — the SettingsSection pattern is reusable.</p>
          </SettingsSection>
          */}

        </div>
      </div>
    </AdminShell>
  );
};

export default AdminSettings;
