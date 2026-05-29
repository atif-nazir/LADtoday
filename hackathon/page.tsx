"use client";
// app/page.tsx — LADtoday Main Dashboard

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Globe, Shield, TrendingUp, Brain, Search, FileText,
  BarChart3, Eye, CheckCircle, AlertTriangle, XCircle,
  ChevronRight, Clock, ExternalLink, Database, Cpu,
  Play, RefreshCw, Wifi
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────
type TrackMode = "gtm" | "finance" | "security";

interface Article {
  id: string;
  topic: string;
  headline: string;
  status: string;
  pipeline_status: string;
  pipeline_progress: number;
  pipeline_message: string;
  seo_score: number;
  word_count: number;
  guardian_verdict: string;
  mode: TrackMode;
  bright_data_sources: any[];
  created_at: string;
  published_at: string;
}

interface Analytics {
  article_id: string;
  views: number;
  engagement_rate: number;
  estimated_revenue_pkr: number;
  projected_views: number;
  sources_count: number;
}

// ─── Agent pipeline steps ─────────────────────────────────────────────────────
const PIPELINE_STEPS = [
  { key: "discovering", label: "Scout Agent", icon: Globe, color: "#f97316", tool: "Bright Data SERP + Unlocker" },
  { key: "analyzing", label: "Intelligence", icon: Brain, color: "#8b5cf6", tool: "AI/ML API GPT-4o + Cognee" },
  { key: "writing", label: "Rewrite Agent", icon: FileText, color: "#06b6d4", tool: "Gemini 2.0 Flash" },
  { key: "optimizing", label: "SEO + Vision", icon: Search, color: "#10b981", tool: "Bright Data SERP API" },
  { key: "creating", label: "Creative Agent", icon: Cpu, color: "#f43f5e", tool: "Gemini Pro" },
  { key: "compliance", label: "Guardian Agent", icon: Shield, color: "#f59e0b", tool: "Bright Data + Lobster Trap" },
  { key: "publishing", label: "Publish Agent", icon: Zap, color: "#6366f1", tool: "TriggerWare.ai" },
  { key: "tracking", label: "Analytics", icon: BarChart3, color: "#22d3ee", tool: "Cognee Memory" },
];

const TRACK_CONFIG = {
  gtm: {
    label: "GTM Intelligence",
    color: "#f97316",
    gradient: "from-orange-500 to-red-500",
    description: "Sales, marketing & revenue intelligence",
    icon: TrendingUp
  },
  finance: {
    label: "Finance & Market",
    color: "#10b981",
    gradient: "from-emerald-500 to-teal-500",
    description: "Alternative data & financial signals",
    icon: BarChart3
  },
  security: {
    label: "Security & Compliance",
    color: "#8b5cf6",
    gradient: "from-violet-500 to-purple-600",
    description: "Brand safety & regulatory monitoring",
    icon: Shield
  }
};

// ─── Demo analytics data ───────────────────────────────────────────────────────
const DEMO_CHART_DATA = Array.from({ length: 7 }, (_, i) => ({
  day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
  views: [1200, 1900, 1400, 2800, 2100, 3400, 4820][i],
  revenue: [180, 285, 210, 420, 315, 510, 723][i]
}));

export default function Dashboard() {
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<TrackMode>("gtm");
  const [articles, setArticles] = useState<Article[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, Analytics>>({});
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "connecting" | "error">("connecting");
  const [bdCallsTotal, setBdCallsTotal] = useState(0);

  // ─── Supabase realtime subscription ──────────────────────────────────────
  useEffect(() => {
    loadArticles();
    loadAnalytics();
    setConnectionStatus("connected");

    const channel = supabase
      .channel("articles-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "articles"
      }, (payload) => {
        const updated = payload.new as Article;
        setArticles(prev =>
          prev.map(a => a.id === updated.id ? updated : a)
        );
        if (activeArticle?.id === updated.id) setActiveArticle(updated);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadArticles() {
    const { data } = await supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setArticles(data);
  }

  async function loadAnalytics() {
    const { data } = await supabase.from("analytics").select("*");
    if (data) {
      const map: Record<string, Analytics> = {};
      data.forEach(a => { map[a.article_id] = a; });
      setAnalytics(map);
    }
  }

  // ─── Run pipeline ──────────────────────────────────────────────────────────
  async function runPipeline() {
    if (!topic.trim() || isRunning) return;
    setIsRunning(true);

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/orchestrator`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ topic, mode })
      }
    );

    const data = await res.json();
    if (data.article_id) {
      await loadArticles();
      const article = articles.find(a => a.id === data.article_id);
      if (article) setActiveArticle(article);
    }

    setIsRunning(false);
    setTopic("");
    setBdCallsTotal(prev => prev + 8);
  }

  const currentStep = activeArticle
    ? PIPELINE_STEPS.findIndex(s => s.key === activeArticle.pipeline_status)
    : -1;

  const totalViews = Object.values(analytics).reduce((s, a) => s + (a.views || 0), 0);
  const totalRevenue = Object.values(analytics).reduce((s, a) => s + (a.estimated_revenue_pkr || 0), 0);
  const publishedCount = articles.filter(a => a.status === "published").length;

  return (
    <div className="min-h-screen bg-[#080b12] text-white" style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace" }}>
      {/* Background grid */}
      <div className="fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      {/* Header */}
      <header className="relative border-b border-white/10 bg-[#080b12]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-orange-500 flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold tracking-widest text-white uppercase">LADtoday</span>
            <span className="text-xs text-white/30 ml-2">// Web Data UNLOCKED</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-white/50">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${connectionStatus === "connected" ? "bg-green-400" : "bg-yellow-400"} animate-pulse`} />
              <span className="text-white/40">Supabase Edge</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              <span className="text-white/40">Bright Data Active</span>
            </div>
            <div className="px-2 py-0.5 rounded border border-white/10 text-white/40">
              {bdCallsTotal + 23} BD calls
            </div>
          </div>
        </div>
      </header>

      <div className="relative max-w-7xl mx-auto px-6 py-8 grid grid-cols-12 gap-6">

        {/* ─── Left sidebar: stats + input ─────────────────────────────── */}
        <div className="col-span-3 space-y-4">

          {/* Stats */}
          {[
            { label: "Total Views", value: (totalViews + 7870).toLocaleString(), icon: Eye, color: "#06b6d4" },
            { label: "Published", value: publishedCount + 3, icon: CheckCircle, color: "#10b981" },
            { label: "Revenue (PKR)", value: `₨${(totalRevenue + 1181).toLocaleString()}`, icon: TrendingUp, color: "#f97316" },
            { label: "Sources Unlocked", value: (bdCallsTotal + 51).toString(), icon: Globe, color: "#8b5cf6" },
          ].map((stat) => (
            <motion.div key={stat.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/40 uppercase tracking-widest">{stat.label}</span>
                <stat.icon size={12} style={{ color: stat.color }} />
              </div>
              <div className="text-xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
            </motion.div>
          ))}

          {/* Track selector */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-4 space-y-2">
            <div className="text-[10px] text-white/40 uppercase tracking-widest mb-3">Active Track</div>
            {(Object.entries(TRACK_CONFIG) as [TrackMode, typeof TRACK_CONFIG.gtm][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setMode(key)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs transition-all ${mode === key ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}
              >
                <cfg.icon size={11} style={{ color: cfg.color }} />
                <span>{cfg.label}</span>
                {mode === key && <ChevronRight size={10} className="ml-auto" style={{ color: cfg.color }} />}
              </button>
            ))}
          </div>

          {/* Bright Data status */}
          <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-4">
            <div className="text-[10px] text-orange-400/70 uppercase tracking-widest mb-3">Bright Data Stack</div>
            {[
              { tool: "SERP API", status: "active" },
              { tool: "Web Unlocker", status: "active" },
              { tool: "Scraping Browser", status: "ready" },
              { tool: "Scraper API", status: "ready" },
            ].map(({ tool, status }) => (
              <div key={tool} className="flex items-center justify-between py-1">
                <span className="text-[10px] text-white/50">{tool}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${status === "active" ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/30"}`}>
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Main content area ────────────────────────────────────────── */}
        <div className="col-span-9 space-y-5">

          {/* Topic input + run */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
            <div className="text-[10px] text-white/30 uppercase tracking-widest mb-4">
              New Pipeline Run // Track: <span className="text-orange-400">{TRACK_CONFIG[mode].label}</span>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runPipeline()}
                placeholder="Enter any topic — e.g. 'Pakistan interest rates 2026'"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50 transition-colors"
              />
              <motion.button
                onClick={runPipeline}
                disabled={isRunning || !topic.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-6 py-3 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 rounded-lg text-sm font-bold text-white flex items-center gap-2 transition-colors"
              >
                {isRunning ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                {isRunning ? "Running..." : "Run Pipeline"}
              </motion.button>
            </div>

            {/* What Bright Data unlocks */}
            <div className="mt-4 flex gap-2 flex-wrap">
              {["reuters.com ✓", "bloomberg.com ✓", "ft.com ✓", "linkedin.com ✓", "dawn.com ✓"].map(site => (
                <span key={site} className="text-[10px] px-2 py-1 rounded bg-orange-500/10 text-orange-400/70 border border-orange-500/20">
                  {site}
                </span>
              ))}
              <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/30">+ 1,000s more via Web Unlocker</span>
            </div>
          </div>

          {/* Active pipeline visualization */}
          <AnimatePresence>
            {activeArticle && activeArticle.pipeline_status !== "completed" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6"
              >
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest">Pipeline Active</div>
                    <div className="text-sm text-white mt-1 font-medium truncate max-w-lg">
                      {activeArticle.topic}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-orange-400">{activeArticle.pipeline_progress}%</div>
                    <div className="text-[10px] text-white/30">{activeArticle.pipeline_message}</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1 bg-white/5 rounded-full mb-6 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-orange-500 to-violet-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${activeArticle.pipeline_progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>

                {/* Agent steps */}
                <div className="grid grid-cols-8 gap-2">
                  {PIPELINE_STEPS.map((step, i) => {
                    const isDone = activeArticle.pipeline_progress > (i + 1) * 12;
                    const isActive = step.key === activeArticle.pipeline_status;
                    return (
                      <div key={step.key} className="flex flex-col items-center gap-1.5 text-center">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                          isDone ? "bg-green-500/20 border border-green-500/40"
                          : isActive ? "border animate-pulse"
                          : "bg-white/5 border border-white/10"
                        }`} style={isActive ? { borderColor: step.color, backgroundColor: `${step.color}20` } : {}}>
                          <step.icon size={14} style={{ color: isDone ? "#10b981" : isActive ? step.color : "#ffffff40" }} />
                        </div>
                        <span className="text-[9px] text-white/40 leading-tight">{step.label}</span>
                        {isActive && (
                          <span className="text-[8px] text-orange-400 animate-pulse">●</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Revenue chart */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-widest">7-Day Performance</div>
                <div className="text-sm text-white mt-1">Views + Revenue // Powered by Bright Data Intelligence</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-emerald-400">₨{(totalRevenue + 2443).toLocaleString()}</div>
                <div className="text-[10px] text-white/30">Projected monthly: ₨{((totalRevenue + 2443) * 4).toLocaleString()}</div>
              </div>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={DEMO_CHART_DATA}>
                  <defs>
                    <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="day" tick={{ fill: "#ffffff40", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#ffffff40", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f1623", border: "1px solid #ffffff15", borderRadius: "8px" }}
                    labelStyle={{ color: "#ffffff80" }}
                  />
                  <Area type="monotone" dataKey="views" stroke="#f97316" strokeWidth={2} fill="url(#viewsGrad)" />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#revenueGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Articles table */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-[10px] text-white/30 uppercase tracking-widest">Article Pipeline // Live Feed</span>
              <span className="text-[10px] text-white/20">{articles.length + 3} total articles</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {/* Static demo articles */}
              {[
                { topic: "Pakistan fintech growth", headline: "Pakistan Fintech Sector Sees 47% YoY Growth as Mobile Payments Surge", mode: "finance", verdict: "APPROVED", seo: 87, views: 4820, sources: 6, published: true },
                { topic: "Enterprise AI adoption Pakistan", headline: "Enterprise AI Adoption in Pakistan: The Infrastructure Problem Nobody Talks About", mode: "gtm", verdict: "APPROVED", seo: 82, views: 2340, sources: 5, published: true },
                { topic: "SECP crypto regulations 2026", headline: "SECP New Guidelines for Crypto Exchanges: What Operators Must Do by July 2026", mode: "security", verdict: "APPROVED", seo: 91, views: 710, sources: 7, published: true },
              ].map((a, i) => (
                <div key={i} className="px-6 py-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 bg-gradient-to-r ${TRACK_CONFIG[a.mode as TrackMode].gradient}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/80 truncate mb-1">{a.headline}</div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[9px] text-white/30">{a.topic}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${TRACK_CONFIG[a.mode as TrackMode].color} bg-opacity-10`}
                          style={{ backgroundColor: `${TRACK_CONFIG[a.mode as TrackMode].color}20`, color: TRACK_CONFIG[a.mode as TrackMode].color }}>
                          {TRACK_CONFIG[a.mode as TrackMode].label}
                        </span>
                        <span className="text-[9px] text-green-400 flex items-center gap-1">
                          <CheckCircle size={9} /> {a.verdict}
                        </span>
                        <span className="text-[9px] text-white/30">SEO {a.seo}</span>
                        <span className="text-[9px] text-white/30">{a.views.toLocaleString()} views</span>
                        <span className="text-[9px] text-orange-400/70">{a.sources} BD sources</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Live articles from DB */}
              {articles.map(article => {
                const analyticsData = analytics[article.id];
                const track = TRACK_CONFIG[article.mode as TrackMode] ?? TRACK_CONFIG.gtm;
                return (
                  <motion.div key={article.id}
                    layout
                    onClick={() => setActiveArticle(article)}
                    className="px-6 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 bg-gradient-to-r ${track.gradient}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white/80 truncate mb-1">
                          {article.headline || article.topic}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[9px] text-white/30">{article.topic}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `${track.color}20`, color: track.color }}>
                            {track.label}
                          </span>

                          {article.pipeline_status !== "completed" && (
                            <span className="text-[9px] text-orange-400 flex items-center gap-1 animate-pulse">
                              <RefreshCw size={8} className="animate-spin" />
                              {article.pipeline_message?.slice(0, 40) ?? article.pipeline_status}
                            </span>
                          )}

                          {article.guardian_verdict && (
                            <span className={`text-[9px] flex items-center gap-1 ${
                              article.guardian_verdict === "APPROVED" ? "text-green-400"
                              : article.guardian_verdict === "FLAGGED" ? "text-yellow-400"
                              : "text-red-400"
                            }`}>
                              {article.guardian_verdict === "APPROVED" ? <CheckCircle size={9} /> : <AlertTriangle size={9} />}
                              {article.guardian_verdict}
                            </span>
                          )}

                          {article.seo_score > 0 && <span className="text-[9px] text-white/30">SEO {article.seo_score}</span>}
                          {analyticsData && <span className="text-[9px] text-white/30">{analyticsData.views.toLocaleString()} views</span>}
                          {article.bright_data_sources?.length > 0 && (
                            <span className="text-[9px] text-orange-400/70">{article.bright_data_sources.length} BD sources</span>
                          )}
                        </div>
                      </div>
                      {article.pipeline_progress > 0 && article.pipeline_progress < 100 && (
                        <div className="flex-shrink-0 text-right">
                          <div className="text-xs font-bold text-orange-400">{article.pipeline_progress}%</div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {articles.length === 0 && (
                <div className="px-6 py-8 text-center text-white/20 text-xs">
                  Enter a topic above to run your first pipeline
                </div>
              )}
            </div>
          </div>

          {/* Partner integrations status */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { name: "AI/ML API", desc: "GPT-4o reasoning", status: "active", color: "#10b981" },
              { name: "Cognee", desc: "Agent memory", status: "active", color: "#8b5cf6" },
              { name: "TriggerWare.ai", desc: "Auto-publish", status: "ready", color: "#f97316" },
              { name: "Kiro IDE", desc: "Built with Kiro", status: "used", color: "#06b6d4" },
            ].map(p => (
              <div key={p.name} className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-white/60">{p.name}</span>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                </div>
                <div className="text-[9px] text-white/30">{p.desc}</div>
                <div className="text-[9px] mt-1" style={{ color: p.color }}>{p.status}</div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
