import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell, openMobileSidebar } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useIsAdmin } from "@/hooks/useAdmin";
import {
  Menu, Play, Square, RefreshCw, Workflow, Activity, Server,
  DollarSign, CalendarDays, TrendingUp, Users, HardDrive, Bell,
  Globe, Brain, FileText, Search, Eye, Cpu, Shield, Zap,
  BarChart3, CheckCircle, AlertTriangle, XCircle, ExternalLink,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PipelineHealthTab } from "@/components/pipeline/PipelineHealthTab";
import { SystemHealthTab } from "@/components/pipeline/SystemHealthTab";
import { CostsTab } from "@/components/pipeline/CostsTab";
import { CalendarTab } from "@/components/pipeline/CalendarTab";
import { RevenueTab } from "@/components/pipeline/RevenueTab";
import { InfluencersTab } from "@/components/pipeline/InfluencersTab";
import { BackupsTab } from "@/components/pipeline/BackupsTab";
import { NotificationsTab } from "@/components/pipeline/NotificationsTab";

// ---------- Types ----------
interface AgentRow {
  key: string; name: string; phase: string; order_index: number;
  depends_on: string[]; model: string; enabled: boolean;
  description?: string | null;
}
interface RunRow {
  id: string; topic: string; status: string; current_phase: string | null;
  brand_voice: string; language: string; enabled_agents: string[] | null;
  agent_states: Record<string, any>; total_tokens: number;
  estimated_cost_usd: number; duration_ms: number | null;
  error: string | null; created_at: string; finished_at: string | null;
  pipeline_progress?: number; pipeline_message?: string; mode?: string;
}

// ---------- 10-Agent pipeline definition ----------
const TEN_AGENTS = [
  { key: "scout",           label: "Scout",        icon: Globe,     color: "text-orange-500", phase: "DISCOVER", tool: "Bright Data SERP + Unlocker" },
  { key: "intelligence",    label: "Intelligence", icon: Brain,     color: "text-violet-500", phase: "DISCOVER", tool: "AI/ML API GPT-4o + Cognee"   },
  { key: "rewrite",         label: "Rewrite",      icon: FileText,  color: "text-cyan-500",   phase: "CREATE",   tool: "Gemini Flash"                 },
  { key: "seo",             label: "SEO",          icon: Search,    color: "text-emerald-500",phase: "CREATE",   tool: "Bright Data SERP API"         },
  { key: "vision",          label: "Vision",       icon: Eye,       color: "text-pink-500",   phase: "CREATE",   tool: "Gemini Flash"                 },
  { key: "creative",        label: "Creative",     icon: Cpu,       color: "text-rose-500",   phase: "CREATE",   tool: "Gemini Pro"                   },
  { key: "guardian",        label: "Guardian",     icon: Shield,    color: "text-amber-500",  phase: "REVIEW",   tool: "Bright Data + Lobster Trap"   },
  { key: "publish",         label: "Publish",      icon: Zap,       color: "text-indigo-500", phase: "PUBLISH",  tool: "TriggerWare.ai + WordPress"   },
  { key: "analytics",       label: "Analytics",    icon: BarChart3, color: "text-sky-500",    phase: "OPERATE",  tool: "Cognee Memory"                },
  { key: "account-manager", label: "Acct Mgr",     icon: Users,     color: "text-lime-500",   phase: "OPERATE",  tool: "Bright Data Scraper API"      },
] as const;

type TrackMode = "gtm" | "finance" | "security";
const TRACK_LABELS: Record<TrackMode, string> = {
  gtm:      "GTM Intelligence",
  finance:  "Finance & Market",
  security: "Security & Compliance",
};

const PHASES: { key: string; label: string }[] = [
  { key: "DISCOVER", label: "Discover" },
  { key: "CREATE",   label: "Create"   },
  { key: "REVIEW",   label: "Review"   },
  { key: "PUBLISH",  label: "Publish"  },
  { key: "OPERATE",  label: "Operate"  },
];

function statusColor(status?: string) {
  switch (status) {
    case "running":   return "bg-foreground/10 text-foreground border-foreground/20";
    case "completed": return "bg-foreground/10 text-foreground border-foreground/30 font-medium";
    case "failed":    return "bg-muted text-muted-foreground border-border line-through";
    case "cancelled": return "bg-muted text-muted-foreground border-border";
    case "pending":   return "bg-muted text-muted-foreground border-border";
    case "skipped":   return "bg-muted/50 text-muted-foreground/50 border-border";
    default:          return "bg-muted/50 text-muted-foreground border-border";
  }
}

// ---------- Registry editor ----------
function RegistryPanel() {
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("agent_registry")
      .select("*")
      .order("order_index");
    setRows((data || []) as AgentRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (key: string, enabled: boolean) => {
    await supabase.from("agent_registry").update({ enabled }).eq("key", key);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, enabled } : r)));
  };

  if (loading) return <div className="text-sm text-muted-foreground p-4">Loading registry…</div>;

  return (
    <div className="space-y-6">
      {PHASES.map((ph) => {
        const phaseRows = rows.filter((r) => r.phase === ph.key);
        const onCount = phaseRows.filter((r) => r.enabled).length;
        return (
          <div key={ph.key} className="border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-muted/40 flex items-center justify-between">
              <div className="text-sm font-medium">{ph.label}</div>
              <div className="text-xs text-muted-foreground">{onCount}/{phaseRows.length} enabled</div>
            </div>
            <div className="divide-y divide-border">
              {phaseRows.map((r) => (
                <div key={r.key} className="px-4 py-2 flex items-center gap-3 text-sm">
                  <div className="w-8 text-xs text-muted-foreground tabular-nums">{r.order_index.toString().padStart(2, "0")}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.description || "—"}</div>
                  </div>
                  <Badge variant="outline" className="hidden md:inline-flex text-[10px]">{r.model}</Badge>
                  <Switch checked={r.enabled} onCheckedChange={(v) => toggle(r.key, v)} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Run starter ----------
function NewRunForm({ onStarted }: { onStarted: (id: string) => void }) {
  const [topic, setTopic] = useState("");
  const [voice, setVoice] = useState("professional");
  const [language, setLanguage] = useState("english");
  const [mode, setMode] = useState<TrackMode>("gtm");
  const [url, setUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [discoveryMethod, setDiscoveryMethod] = useState<"auto" | "firecrawl" | "gemini_grounding" | "duckduckgo">("auto");
  const [busy, setBusy] = useState(false);
  const [registryAgents, setRegistryAgents] = useState<AgentRow[]>([]);
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("agent_registry").select("*").order("order_index");
      if (data) {
        setRegistryAgents(data as AgentRow[]);
        const defaults: Record<string, string> = {};
        data.forEach((a: any) => {
          defaults[a.key] = a.model;
        });
        setModelOverrides(defaults);
      }
    };
    load();
  }, []);

  const uploadToBucket = async (file: File, prefix: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    const path = `${user?.id || "anon"}/${prefix}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("pipeline-inputs").upload(path, file, { upsert: false });
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); return null; }
    const { data: signed } = await supabase.storage.from("pipeline-inputs").createSignedUrl(path, 60 * 60 * 24);
    return signed?.signedUrl || null;
  };

  const start = async () => {
    if (!topic.trim() && !url.trim() && !pdfFile && !imageFile) {
      toast({ title: "Enter a topic or attach a URL/PDF/image" }); return;
    }
    setBusy(true);
    try {
      const input_payload: Record<string, string> = { discovery_method: discoveryMethod };
      let input_type = "topic";
      if (url.trim()) { input_payload.url = url.trim(); input_type = "url"; }
      if (pdfFile) {
        const u = await uploadToBucket(pdfFile, "pdf");
        if (!u) { setBusy(false); return; }
        input_payload.pdf_url = u; input_type = "pdf";
      }
      if (imageFile) {
        const u = await uploadToBucket(imageFile, "image");
        if (!u) { setBusy(false); return; }
        input_payload.image_url = u; input_type = "image";
      }
      const finalTopic = topic.trim() || (url.trim() || (pdfFile?.name ?? imageFile?.name ?? "untitled"));
      const { data, error } = await supabase.functions.invoke("pipeline-orchestrator", {
        body: { 
          action: "start", 
          topic: finalTopic, 
          brand_voice: voice, 
          language,
          mode,
          input_type, 
          input_payload,
          model_overrides: modelOverrides
        },
      });
      if (error || !data?.run_id) {
        toast({ title: "Failed to start", description: error?.message || data?.error, variant: "destructive" });
        return;
      }
      setTopic(""); setUrl(""); setPdfFile(null); setImageFile(null);
      onStarted(data.run_id);
    } finally { setBusy(false); }
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
      <div>
        <Label className="text-xs">Ask in plain language</Label>
        <Textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder='e.g. "What is happening with Pakistan fintech this week — give me an article angle"'
          rows={3}
          className="mt-1"
        />
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Optional: attach a source</Label>
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a URL (article, report, page)"
          className="h-9 text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs border border-dashed border-border rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/40 truncate">
            <input type="file" accept="application/pdf" className="hidden"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
            {pdfFile ? `📄 ${pdfFile.name}` : "Attach PDF"}
          </label>
          <label className="text-xs border border-dashed border-border rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/40 truncate">
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
            {imageFile ? `🖼 ${imageFile.name}` : "Attach Image"}
          </label>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Discovery method (Scout)</Label>
          <select value={discoveryMethod} onChange={(e) => setDiscoveryMethod(e.target.value as any)}
            className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-xs">
            <option value="auto">Auto (Firecrawl → Gemini grounding → DuckDuckGo)</option>
            <option value="firecrawl">Firecrawl (best quality, uses API key)</option>
            <option value="gemini_grounding">Gemini Google Search grounding (20 RPD)</option>
            <option value="duckduckgo">DuckDuckGo HTML (no key, always works)</option>
          </select>
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Track / Mode</Label>
        <div className="grid grid-cols-3 gap-1.5 mt-1">
          {(["gtm", "finance", "security"] as TrackMode[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMode(t)}
              className={`text-xs px-2 py-1.5 rounded border transition-colors ${
                mode === t
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {TRACK_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Brand voice</Label>
          <select value={voice} onChange={(e) => setVoice(e.target.value)}
            className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="authoritative">Authoritative</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Language</Label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="english">English</option>
            <option value="urdu">Urdu</option>
            <option value="roman_urdu">Roman Urdu</option>
          </select>
        </div>
      </div>

      {/* Agent Model Settings */}
      {registryAgents.length > 0 && (
        <div className="border-t border-border pt-3">
          <details className="group">
            <summary className="flex items-center justify-between text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground">
              <span>Customize Agent Models</span>
              <span className="text-[10px] text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-1">
              <div className="flex flex-col gap-1.5 mb-2 border-b border-border pb-2">
                <span className="text-[10px] text-muted-foreground font-medium">Quick Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="text-[10px] border border-border rounded px-2 py-0.5 hover:bg-muted font-medium transition-colors"
                    onClick={() => {
                      const overridden = { ...modelOverrides };
                      Object.keys(overridden).forEach(k => {
                        overridden[k] = "gemini-2.5-flash";
                      });
                      setModelOverrides(overridden);
                      toast({ title: "All agents set to Gemini 2.5 Flash" });
                    }}
                  >
                    Set All to 2.5 Flash (20 RPD)
                  </button>
                  <button
                    type="button"
                    className="text-[10px] border border-border rounded px-2 py-0.5 hover:bg-muted font-medium transition-colors bg-accent/30 text-accent-foreground"
                    onClick={() => {
                      const overridden = { ...modelOverrides };
                      Object.keys(overridden).forEach(k => {
                        overridden[k] = "gemini-3.1-flash-lite";
                      });
                      setModelOverrides(overridden);
                      toast({ title: "All agents set to Gemini 3.1 Flash Lite (500 RPD)" });
                    }}
                  >
                    Set All to 3.1 Flash Lite (500 RPD)
                  </button>
                </div>
              </div>
              {registryAgents.filter(a => a.enabled).map((agent) => (
                <div key={agent.key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate flex-1 font-medium">{agent.name}</span>
                  <select
                    value={modelOverrides[agent.key] || agent.model}
                    onChange={(e) => {
                      const newModel = e.target.value;
                      setModelOverrides({ ...modelOverrides, [agent.key]: newModel });
                      toast({ title: `${agent.name} set to ${newModel}` });
                    }}
                    className="h-7 text-[11px] rounded-md border border-input bg-background px-2 py-0"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                    <option value="gemini-3-flash">Gemini 3 Flash</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  </select>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      <Button onClick={start} disabled={busy} className="w-full">
        <Play className="w-4 h-4 mr-2" />
        {busy ? "Starting…" : "Run pipeline"}
      </Button>
    </div>
  );
}

// ---------- Scout sources preview ----------
function ScoutSourcesPreview({ runId }: { runId: string }) {
  const [output, setOutput] = useState<any>(null);
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("agent_outputs")
        .select("output, status").eq("run_id", runId).eq("agent_key", "scout").maybeSingle();
      setOutput(data?.output || null);
    };
    load();
    const ch = supabase.channel(`scout_${runId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_outputs", filter: `run_id=eq.${runId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [runId]);

  if (!output?.sources?.length) return null;
  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className="text-xs font-medium mb-2 flex items-center gap-2">
        <span>Scout — {output.sources.length} real sources</span>
        {output.discovery_method && (
          <Badge variant="outline" className="text-[10px]">{output.discovery_method}</Badge>
        )}
      </div>
      <ul className="space-y-1.5">
        {output.sources.slice(0, 7).map((s: any, i: number) => (
          <li key={i} className="text-xs flex items-start gap-2">
            <span className="text-muted-foreground tabular-nums">{(i + 1).toString().padStart(2, "0")}</span>
            <div className="flex-1 min-w-0">
              <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground truncate block">
                {s.title || s.url}
              </a>
              <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                <span>{s.source_domain}</span>
                <span>· cred {Number(s.credibility_score || 0).toFixed(2)}</span>
                <span>· rel {Number(s.relevance_score || 0).toFixed(2)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {output.recommended_angle && (
        <div className="mt-2 pt-2 border-t border-border text-[11px]">
          <span className="text-muted-foreground">Recommended angle:</span> {output.recommended_angle}
        </div>
      )}
    </div>
  );
}

// ---------- Runs list ----------
function RunsList({ onSelect, selectedId }: { onSelect: (id: string) => void; selectedId?: string }) {
  const [runs, setRuns] = useState<RunRow[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("pipeline_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);
    setRuns((data || []) as RunRow[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("pipeline_runs_list")
      .on("postgres_changes", { event: "*", schema: "public", table: "pipeline_runs" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="px-3 py-2 text-xs font-medium bg-muted/40 flex items-center justify-between">
        <span>Recent runs</span>
        <button onClick={load} className="text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
        {runs.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">No runs yet.</div>
        )}
        {runs.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors ${selectedId === r.id ? "bg-muted/60" : ""}`}
          >
            <div className="text-sm font-medium truncate">{r.topic}</div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className={`px-1.5 py-0.5 rounded border ${statusColor(r.status)}`}>{r.status}</span>
              {r.current_phase && <span>{r.current_phase}</span>}
              {r.mode && <span className="px-1 py-0.5 rounded bg-muted text-[9px]">{r.mode}</span>}
              <span className="ml-auto">{new Date(r.created_at).toLocaleTimeString()}</span>
            </div>
            {r.status === "running" && typeof r.pipeline_progress === "number" && r.pipeline_progress > 0 && (
              <div className="mt-1.5">
                <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                  <div
                    className="h-1 rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${r.pipeline_progress}%` }}
                  />
                </div>
                {r.pipeline_message && (
                  <div className="text-[9px] text-muted-foreground mt-0.5 truncate">{r.pipeline_message}</div>
                )}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Run detail ----------
function RunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunRow | null>(null);
  const [registry, setRegistry] = useState<AgentRow[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [drawerAgent, setDrawerAgent] = useState<AgentRow | null>(null);
  const [drawerOutput, setDrawerOutput] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  const writePreview = async () => {
    setPreviewBusy(true); setPreviewOpen(true); setPreview(null);
    const { data, error } = await supabase.functions.invoke("preview-writer", { body: { run_id: runId } });
    if (error || data?.error) {
      toast({ title: "Preview failed", description: error?.message || data?.error, variant: "destructive" });
      setPreview({ error: error?.message || data?.error });
    } else {
      setPreview(data);
    }
    setPreviewBusy(false);
  };

  const loadRun = async () => {
    const { data } = await supabase.from("pipeline_runs").select("*").eq("id", runId).maybeSingle();
    if (data) setRun(data as RunRow);
  };
  const loadAudit = async () => {
    const { data } = await supabase.from("lobstertrap_audit").select("*").eq("run_id", runId).order("created_at", { ascending: false }).limit(200);
    setAudit(data || []);
  };

  useEffect(() => {
    loadRun(); loadAudit();
    supabase.from("agent_registry").select("*").order("order_index").then(({ data }) => setRegistry((data || []) as AgentRow[]));

    const ch1 = supabase.channel(`run_${runId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pipeline_runs", filter: `id=eq.${runId}` }, () => loadRun())
      .on("postgres_changes", { event: "*", schema: "public", table: "lobstertrap_audit", filter: `run_id=eq.${runId}` }, () => loadAudit())
      .subscribe();
    return () => { supabase.removeChannel(ch1); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const openAgent = async (a: AgentRow) => {
    setDrawerAgent(a);
    setDrawerOutput(null);
    const { data } = await supabase.from("agent_outputs").select("*").eq("run_id", runId).eq("agent_key", a.key).maybeSingle();
    setDrawerOutput(data);
  };

  const cancel = async () => {
    await supabase.functions.invoke("pipeline-orchestrator", { body: { action: "cancel", run_id: runId } });
  };
  const step = async () => {
    await supabase.functions.invoke("pipeline-orchestrator", { body: { action: "step", run_id: runId } });
  };

  const states = run?.agent_states || {};

  return (
    <div className="space-y-4">
      <div className="border border-border rounded-lg p-4 bg-card space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{run?.topic || "—"}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className={`px-1.5 py-0.5 rounded border ${statusColor(run?.status)}`}>{run?.status || "…"}</span>
              {run?.current_phase && <span>phase: {run.current_phase}</span>}
              {run?.mode && <span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">{TRACK_LABELS[run.mode as TrackMode] ?? run.mode}</span>}
              <span>tokens: {run?.total_tokens || 0}</span>
              <span>cost: ${Number(run?.estimated_cost_usd || 0).toFixed(4)}</span>
              {/* Guardian verdict badge */}
              {(() => {
                const verdict = states["guardian"]?.final_verdict;
                if (!verdict) return null;
                const cfg = verdict === "APPROVED"
                  ? { icon: CheckCircle, cls: "text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400" }
                  : verdict === "FLAGGED"
                  ? { icon: AlertTriangle, cls: "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400" }
                  : { icon: XCircle, cls: "text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400" };
                const Icon = cfg.icon;
                return (
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${cfg.cls}`}>
                    <Icon className="w-3 h-3" />{verdict}
                  </span>
                );
              })()}
            </div>
            {run?.error && <div className="mt-2 text-xs text-red-600">{run.error}</div>}
          </div>
          <Button size="sm" variant="outline" onClick={step}><RefreshCw className="w-3 h-3 mr-1" />Step</Button>
          <Button size="sm" variant="default" onClick={writePreview} disabled={previewBusy}>{previewBusy ? "Writing…" : "Write preview"}</Button>
          <Button size="sm" variant="outline" onClick={cancel}><Square className="w-3 h-3 mr-1" />Cancel</Button>
        </div>

        {/* Pipeline progress bar */}
        {typeof run?.pipeline_progress === "number" && run.pipeline_progress > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground truncate max-w-xs">{run.pipeline_message || "Running…"}</span>
              <span className="text-[10px] font-medium tabular-nums">{run.pipeline_progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-primary transition-all duration-500"
                style={{ width: `${run.pipeline_progress}%` }}
              />
            </div>
          </div>
        )}

        {/* 10-agent live strip */}
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 pt-1">
          {TEN_AGENTS.map((agent) => {
            const st = states[agent.key]?.status;
            const isDone = st === "completed";
            const isRunning = st === "running";
            const isFailed = st === "failed";
            const Icon = agent.icon;
            return (
              <div
                key={agent.key}
                title={`${agent.label} — ${agent.tool}\nStatus: ${st || "pending"}`}
                className={`flex flex-col items-center gap-1 p-1.5 rounded border text-center transition-colors ${
                  isDone    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20"
                  : isRunning ? "border-primary/50 bg-primary/5 animate-pulse"
                  : isFailed  ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
                  : "border-border bg-muted/20"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${
                  isDone    ? "text-green-600 dark:text-green-400"
                  : isRunning ? "text-primary"
                  : isFailed  ? "text-red-500"
                  : "text-muted-foreground"
                }`} />
                <span className="text-[8px] leading-tight text-muted-foreground truncate w-full text-center">
                  {agent.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <ScoutSourcesPreview runId={runId} />

      <Tabs defaultValue="agents">

        <TabsList>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="lobstertrap">Lobster Trap ({audit.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-4 mt-3">
          {PHASES.map((ph) => {
            const phaseAgents = registry.filter((a) => a.phase === ph.key);
            return (
              <div key={ph.key} className="border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-xs font-medium">{ph.label}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
                  {phaseAgents.map((a) => {
                    const st = states[a.key]?.status || (a.enabled ? "pending" : "skipped");
                    return (
                      <button
                        key={a.key}
                        onClick={() => openAgent(a)}
                        className="text-left px-3 py-2 bg-card hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-2">
                          <div className="text-[10px] tabular-nums text-muted-foreground">{a.order_index.toString().padStart(2, "0")}</div>
                          <div className="text-sm font-medium truncate flex-1">{a.name}</div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusColor(st)}`}>{st}</span>
                        </div>
                        {states[a.key]?.error && (
                          <div className="text-[10px] text-red-600 truncate mt-0.5">{states[a.key].error}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="lobstertrap" className="mt-3">
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-2 py-1.5">Agent</th>
                  <th className="text-left px-2 py-1.5">Prompt</th>
                  <th className="text-left px-2 py-1.5">Risk</th>
                  <th className="text-left px-2 py-1.5">Action</th>
                  <th className="text-left px-2 py-1.5">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {audit.length === 0 && (
                  <tr><td colSpan={5} className="p-3 text-muted-foreground text-center">No AI calls yet.</td></tr>
                )}
                {audit.map((a: any) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-2 py-1.5 font-mono text-[10px]">{a.agent_key}</td>
                    <td className="px-2 py-1.5 max-w-[280px] truncate">{a.prompt_preview}</td>
                    <td className="px-2 py-1.5">{Number(a.risk_score || 0).toFixed(2)}</td>
                    <td className="px-2 py-1.5">{a.action_taken}</td>
                    <td className={`px-2 py-1.5 font-medium ${
                      a.verdict === "BLOCKED" ? "text-red-600" : a.verdict === "REVIEW" ? "text-amber-600" : "text-emerald-600"
                    }`}>{a.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Agent drawer */}
      <Sheet open={!!drawerAgent} onOpenChange={(o) => !o && setDrawerAgent(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drawerAgent?.name}</SheetTitle>
          </SheetHeader>
          {drawerAgent && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="text-xs text-muted-foreground">{drawerAgent.description}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Phase:</span> {drawerAgent.phase}</div>
                <div><span className="text-muted-foreground">Model:</span> {drawerAgent.model}</div>
                <div><span className="text-muted-foreground">Depends on:</span> {drawerAgent.depends_on.join(", ") || "—"}</div>
                <div><span className="text-muted-foreground">Status:</span> {states[drawerAgent.key]?.status || "pending"}</div>
              </div>
              {drawerOutput ? (
                <pre className="bg-muted/40 rounded p-3 text-[11px] overflow-x-auto">
{JSON.stringify(drawerOutput.output, null, 2)}
                </pre>
              ) : (
                <div className="text-xs text-muted-foreground">No output yet for this agent in this run.</div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------- Page ----------
export default function AdminPipeline() {
  const navigate = useNavigate();
  const params = useParams();
  const { isAdmin, loading } = useIsAdmin();
  const [selectedRun, setSelectedRun] = useState<string | undefined>(params.runId);

  useEffect(() => {
    if (!loading && !isAdmin) navigate("/signin");
  }, [loading, isAdmin, navigate]);

  return (
    <AdminShell activePage="pipeline">
      <header className="h-14 border-b border-border flex items-center px-4 gap-3 shrink-0 bg-card/30">
        <button className="md:hidden p-1.5 rounded hover:bg-muted" onClick={openMobileSidebar}>
          <Menu className="w-4 h-4" />
        </button>
        <Workflow className="w-4 h-4 text-[#FA76FF]" />
        <h1 className="font-semibold text-sm">Pipeline</h1>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/admin" className="text-xs text-muted-foreground hover:text-foreground">← Admin</Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <Tabs defaultValue="runs">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1">
            <TabsTrigger value="runs" className="text-xs gap-1"><Play className="w-3 h-3" />Runs</TabsTrigger>
            <TabsTrigger value="registry" className="text-xs gap-1"><Workflow className="w-3 h-3" />Agents (10)</TabsTrigger>
            <TabsTrigger value="pipeline-health" className="text-xs gap-1"><Activity className="w-3 h-3" />Health</TabsTrigger>
            <TabsTrigger value="system-health" className="text-xs gap-1"><Server className="w-3 h-3" />System</TabsTrigger>
            <TabsTrigger value="costs" className="text-xs gap-1"><DollarSign className="w-3 h-3" />Costs</TabsTrigger>
            <TabsTrigger value="calendar" className="text-xs gap-1"><CalendarDays className="w-3 h-3" />Calendar</TabsTrigger>
            <TabsTrigger value="revenue" className="text-xs gap-1"><TrendingUp className="w-3 h-3" />Revenue</TabsTrigger>
            <TabsTrigger value="influencers" className="text-xs gap-1"><Users className="w-3 h-3" />Influencers</TabsTrigger>
            <TabsTrigger value="backups" className="text-xs gap-1"><HardDrive className="w-3 h-3" />Backups</TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs gap-1"><Bell className="w-3 h-3" />Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="runs" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
              <div className="space-y-4">
                <NewRunForm onStarted={(id) => setSelectedRun(id)} />
                <RunsList onSelect={setSelectedRun} selectedId={selectedRun} />
              </div>
              <div>
                {selectedRun
                  ? <RunDetail runId={selectedRun} />
                  : <div className="border border-dashed border-border rounded-lg p-12 text-center text-sm text-muted-foreground">
                      Start a new run or pick one from the list.
                    </div>
                }
              </div>
            </div>
          </TabsContent>

          <TabsContent value="registry" className="mt-4 max-w-3xl">
            <div className="text-xs text-muted-foreground mb-3">
              Toggle agents on or off. Disabled agents are skipped and their dependents proceed without them.
              <br />Phase 0 ships infrastructure only — keep agents OFF until their phase is implemented.
            </div>
            <RegistryPanel />
          </TabsContent>

          <TabsContent value="pipeline-health" className="mt-4"><PipelineHealthTab /></TabsContent>
          <TabsContent value="system-health" className="mt-4"><SystemHealthTab /></TabsContent>
          <TabsContent value="costs" className="mt-4"><CostsTab /></TabsContent>
          <TabsContent value="calendar" className="mt-4"><CalendarTab /></TabsContent>
          <TabsContent value="revenue" className="mt-4"><RevenueTab /></TabsContent>
          <TabsContent value="influencers" className="mt-4"><InfluencersTab /></TabsContent>
          <TabsContent value="backups" className="mt-4"><BackupsTab /></TabsContent>
          <TabsContent value="notifications" className="mt-4"><NotificationsTab /></TabsContent>
        </Tabs>
      </div>
    </AdminShell>
  );
}

