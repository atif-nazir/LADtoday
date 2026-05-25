import { useState, useMemo, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useLogs, useLogStats, useClearLogs, useExportLogs, LogLevel, LogSource, LogEntry } from "@/hooks/useLogs";
import { AdminShell, openMobileSidebar } from "@/components/AdminShell";
import { AdminPageSkeleton } from "@/components/AdminSkeletons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Menu, Search, ChevronDown, X, ScrollText, ChevronRight, Trash2, Download,
  Info, AlertTriangle, AlertCircle, Sparkles, Server, Loader2,
  FileText, Image, Globe, Cpu, Settings, Copy, Clock
} from "lucide-react";

// ─── Level config ──────────────────────────────────────────────────
const LEVEL_CONFIG: Record<LogLevel, { icon: any; color: string; bg: string; label: string }> = {
  info:    { icon: Info,          color: "text-blue-500",    bg: "bg-blue-500/10",    label: "Info" },
  warning: { icon: AlertTriangle, color: "text-yellow-500",  bg: "bg-yellow-500/10",  label: "Warning" },
  error:   { icon: AlertCircle,   color: "text-red-500",     bg: "bg-red-500/10",     label: "Error" },
  ai:      { icon: Sparkles,      color: "text-[#FA76FF]",   bg: "bg-[#FA76FF]/10",   label: "AI" },
  system:  { icon: Server,        color: "text-muted-foreground", bg: "bg-muted",      label: "System" },
};

const SOURCE_CONFIG: Record<string, { icon: any; label: string }> = {
  articles:    { icon: FileText, label: "Articles" },
  media:       { icon: Image,    label: "Media" },
  scraper:     { icon: Globe,    label: "Scraper" },
  "ai-worker": { icon: Cpu,      label: "AI Worker" },
  system:      { icon: Settings,  label: "System" },
  thumbnails:  { icon: Image,    label: "Thumbnails" },
  captions:    { icon: FileText, label: "Captions" },
};

// ─── Time helpers ──────────────────────────────────────────────────
const relativeTime = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
};

// ─── Inspector Content ─────────────────────────────────────────────
const LogInspectorContent = ({ log, onClose }: { log: LogEntry; onClose: () => void }) => {
  const lc = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
  const sc = SOURCE_CONFIG[log.source] || { icon: Settings, label: log.source };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Log Details</span>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded transition-colors"><X className="w-3 h-3" /></button>
      </div>
      <div className="p-3 space-y-3 flex-1 overflow-auto">
        {/* Level + Source badges */}
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${lc.bg} ${lc.color}`}>{lc.label}</span>
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{sc.label}</span>
        </div>

        {/* Message */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Message</span>
            <button onClick={() => copyToClipboard(log.message, "Message")} className="p-0.5 hover:bg-muted rounded transition-colors">
              <Copy className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
          <p className="text-sm mt-0.5 leading-snug font-medium">{log.message}</p>
        </div>

        {/* Details */}
        {log.details && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Details</span>
              <button onClick={() => copyToClipboard(log.details!, "Details")} className="p-0.5 hover:bg-muted rounded transition-colors">
                <Copy className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs mt-0.5 leading-relaxed text-muted-foreground">{log.details}</p>
          </div>
        )}

        {/* Timestamp */}
        <div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Timestamp</span>
          <p className="text-xs font-mono mt-0.5">{new Date(log.timestamp).toLocaleString()}</p>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{relativeTime(log.timestamp)}</p>
        </div>

        {/* Metadata as JSON */}
        {log.metadata && Object.keys(log.metadata).length > 0 && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Metadata</span>
              <button onClick={() => copyToClipboard(JSON.stringify(log.metadata, null, 2), "Metadata")} className="p-0.5 hover:bg-muted rounded transition-colors">
                <Copy className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
            <pre className="mt-1 text-[11px] font-mono bg-muted/50 border border-border rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </div>
        )}

        {/* Related IDs from metadata */}
        {log.metadata && (
          <div className="space-y-1">
            {log.metadata.articleId && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Article ID:</span>
                <button onClick={() => copyToClipboard(log.metadata!.articleId, "Article ID")}
                  className="text-[10px] font-mono text-[#FA76FF] hover:underline cursor-pointer">{log.metadata.articleId}</button>
              </div>
            )}
            {log.metadata.duration && (
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Duration: {log.metadata.duration}</span>
              </div>
            )}
          </div>
        )}

        {/* Log ID */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Log ID</span>
            <button onClick={() => copyToClipboard(log.id, "Log ID")} className="p-0.5 hover:bg-muted rounded transition-colors">
              <Copy className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
          <p className="text-[10px] font-mono text-muted-foreground/60 break-all">{log.id}</p>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────
const AdminLogs = () => {
  const { user, isAdmin, loading } = useIsAdmin();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState<LogLevel | "all">("all");
  const [filterSource, setFilterSource] = useState<LogSource | "all">("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchQuery); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [filterLevel, filterSource]);

  // Data
  const { data, isLoading, isFetching } = useLogs({
    search: debouncedSearch,
    level: filterLevel,
    source: filterSource,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const { data: stats } = useLogStats();
  const clearLogs = useClearLogs();
  const exportLogs = useExportLogs();

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Inspector
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);

  // Keyboard nav
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const inspected = inspectedId ? logs.find(l => l.id === inspectedId) : null;

  const openInspector = useCallback((log: LogEntry) => {
    setInspectedId(log.id);
    if (window.innerWidth < 1024) setMobileInspectorOpen(true);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectedId(null);
    setMobileInspectorOpen(false);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIndex(prev => Math.min(prev + 1, logs.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIndex(prev => Math.max(prev - 1, 0)); }
      if (e.key === "Enter" && focusedIndex >= 0 && focusedIndex < logs.length) {
        e.preventDefault();
        openInspector(logs[focusedIndex]);
      }
      if (e.key === "Escape") { e.preventDefault(); closeInspector(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusedIndex, logs, openInspector, closeInspector]);

  const handleClearLogs = async () => {
    try {
      await clearLogs.mutateAsync();
      toast.success("All logs cleared");
      setShowClearDialog(false);
      closeInspector();
    } catch {
      toast.error("Failed to clear logs");
    }
  };

  const handleExport = async () => {
    try {
      await exportLogs({ level: filterLevel, source: filterSource, search: debouncedSearch });
      toast.success("Logs exported as CSV");
    } catch {
      toast.error("Export failed");
    }
  };

  if (loading) return <AdminShell activePage="logs"><AdminPageSkeleton type="logs" /></AdminShell>;
  if (!user) return <Navigate to="/signin" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const levelCounts = stats || { total: 0, info: 0, warning: 0, error: 0, ai: 0, system: 0 };

  return (
    <AdminShell activePage="logs">
      {/* ─── Sticky Toolbar ─── */}
      <header className="h-11 border-b border-border flex items-center gap-2 px-3 shrink-0 bg-card/30">
        <button onClick={openMobileSidebar} className="md:hidden p-1.5 hover:bg-muted rounded-md shrink-0">
          <Menu className="w-4 h-4" />
        </button>
        <ScrollText className="w-4 h-4 text-[#FA76FF]" />
        <h1 className="text-sm font-bold">Logs</h1>
        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{total}</span>

        {/* Search */}
        <div className="relative flex-1 min-w-[80px] max-w-[180px] ml-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search logs..."
            className="h-7 pl-7 text-[11px] rounded-lg bg-muted/50 border-0 focus-visible:ring-1" />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded">
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0" />

        {isFetching && !isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />}

        {/* Level filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-7 px-2 text-[11px] rounded-lg border border-border bg-background flex items-center gap-1 shrink-0 hover:bg-muted transition-colors">
              <span className="hidden sm:inline text-muted-foreground">Level:</span>
              <span className="font-medium">{filterLevel === "all" ? "All" : LEVEL_CONFIG[filterLevel]?.label}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36 p-1 rounded-xl shadow-lg border border-border/80">
            {[{ value: "all", label: "All Levels" }, ...Object.entries(LEVEL_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))].map(o => (
              <DropdownMenuItem key={o.value} onClick={() => setFilterLevel(o.value as any)}
                className={`text-xs rounded-lg px-2.5 py-1.5 cursor-pointer ${filterLevel === o.value ? "bg-[#FA76FF]/10 text-[#FA76FF] font-medium" : ""}`}>
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Source filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-7 px-2 text-[11px] rounded-lg border border-border bg-background flex items-center gap-1 shrink-0 hover:bg-muted transition-colors">
              <span className="hidden sm:inline text-muted-foreground">Source:</span>
              <span className="font-medium">{filterSource === "all" ? "All" : SOURCE_CONFIG[filterSource]?.label}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 p-1 rounded-xl shadow-lg border border-border/80">
            {[{ value: "all", label: "All Sources" }, ...Object.entries(SOURCE_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))].map(o => (
              <DropdownMenuItem key={o.value} onClick={() => setFilterSource(o.value as any)}
                className={`text-xs rounded-lg px-2.5 py-1.5 cursor-pointer ${filterSource === o.value ? "bg-[#FA76FF]/10 text-[#FA76FF] font-medium" : ""}`}>
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Export */}
        <button onClick={handleExport} className="h-7 px-2 text-[11px] rounded-lg border border-border bg-background hover:bg-muted transition-colors flex items-center gap-1 shrink-0" title="Export CSV">
          <Download className="w-3 h-3" />
          <span className="hidden sm:inline">Export</span>
        </button>

        {/* Clear */}
        <button onClick={() => setShowClearDialog(true)} className="h-7 px-2 text-[11px] rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-1 shrink-0" title="Clear all logs">
          <Trash2 className="w-3 h-3" />
          <span className="hidden sm:inline">Clear</span>
        </button>
      </header>

      {/* ─── Level stats strip ─── */}
      <div className="border-b border-border flex items-center px-3 py-1.5 text-[11px] bg-muted/20 overflow-x-auto scrollbar-hide gap-3 shrink-0">
        {(["info", "warning", "error", "ai", "system"] as LogLevel[]).map(level => {
          const lc = LEVEL_CONFIG[level];
          const count = levelCounts[level] || 0;
          return (
            <button key={level} onClick={() => setFilterLevel(filterLevel === level ? "all" : level)}
              className={`flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-md transition-colors cursor-pointer
                ${filterLevel === level ? `${lc.bg} ${lc.color}` : "hover:bg-muted"}`}>
              <span className={`font-bold font-mono text-xs ${filterLevel === level ? lc.color : ""}`}>{count}</span>
              <span className={`whitespace-nowrap ${filterLevel === level ? lc.color : "text-muted-foreground/70"}`}>{lc.label}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <span className="text-muted-foreground/50 text-[10px] font-mono hidden sm:inline">↑↓ navigate · Enter inspect · Esc close</span>
      </div>

      {/* ─── Content area: Table + Inspector ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── Log Table ─── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b border-border text-[11px] text-muted-foreground font-medium">
                  <th className="text-left px-2 py-2 w-20">Time</th>
                  <th className="text-left px-2 py-2 w-16">Level</th>
                  <th className="text-left px-2 py-2 w-24 hidden sm:table-cell">Source</th>
                  <th className="text-left px-2 py-2">Message</th>
                  <th className="w-8 px-1 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 15 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40" style={{ height: 38 }}>
                      <td className="px-2 py-1"><div className="h-3 w-12 rounded bg-muted animate-pulse" style={{ opacity: 1 - i * 0.04 }} /></td>
                      <td className="px-2 py-1"><div className="h-4 w-14 rounded bg-muted animate-pulse" style={{ opacity: 1 - i * 0.04 }} /></td>
                      <td className="px-2 py-1 hidden sm:table-cell"><div className="h-3 w-16 rounded bg-muted animate-pulse" style={{ opacity: 1 - i * 0.04 }} /></td>
                      <td className="px-2 py-1"><div className="h-3 rounded bg-muted animate-pulse" style={{ width: `${40 + Math.random() * 50}%`, opacity: 1 - i * 0.04 }} /></td>
                      <td className="px-1 py-1"><div className="h-3 w-3 rounded bg-muted animate-pulse" style={{ opacity: 1 - i * 0.04 }} /></td>
                    </tr>
                  ))
                ) : !logs.length ? (
                  <tr><td colSpan={5} className="px-4 py-16 text-center text-muted-foreground text-xs">
                    <ScrollText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
                    {debouncedSearch || filterLevel !== "all" || filterSource !== "all"
                      ? "No logs match your filters."
                      : "No logs yet. Logs appear when the system processes articles, scrapes, or generates content."}
                  </td></tr>
                ) : logs.map((log, i) => {
                  const lc = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
                  const LevelIcon = lc.icon;
                  const isActive = inspectedId === log.id;
                  const isFocused = focusedIndex === i;
                  return (
                    <tr key={log.id}
                      className={`border-b border-border/40 cursor-pointer transition-colors
                        ${log.level === "error" ? "bg-red-500/[0.03]" : ""}
                        ${isActive ? "bg-[#FA76FF]/5" : "hover:bg-muted/30"}
                        ${isFocused ? "ring-1 ring-inset ring-[#FA76FF]/40" : ""}`}
                      style={{ height: 38 }}
                      onClick={() => openInspector(log)}
                    >
                      <td className="px-2 py-1">
                        <span className="text-[11px] font-mono text-muted-foreground" title={new Date(log.timestamp).toLocaleString()}>
                          {relativeTime(log.timestamp)}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${lc.bg} ${lc.color}`}>
                          <LevelIcon className="w-3 h-3" />
                          <span className="hidden sm:inline">{lc.label}</span>
                        </span>
                      </td>
                      <td className="px-2 py-1 hidden sm:table-cell">
                        <span className="text-[11px] font-mono text-muted-foreground">{log.source}</span>
                      </td>
                      <td className="px-2 py-1">
                        <span className="text-xs line-clamp-1">{log.message}</span>
                      </td>
                      <td className="px-1 py-1 text-right">
                        <ChevronRight className={`w-3.5 h-3.5 transition-colors ${isActive ? "text-[#FA76FF]" : "text-muted-foreground/30"}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-border flex items-center justify-between px-3 py-1.5 shrink-0 bg-muted/20">
              <span className="text-[11px] text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <span className="text-[11px] font-mono text-muted-foreground px-1">{page + 1}/{totalPages}</span>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>

        {/* ─── Inspector Panel (desktop) ─── */}
        {inspected && (
          <div className="hidden lg:flex w-[280px] border-l border-border flex-col shrink-0 bg-card/30 animate-fade-in">
            <LogInspectorContent log={inspected} onClose={closeInspector} />
          </div>
        )}
      </div>

      {/* ─── Inspector Sheet (mobile/tablet) ─── */}
      <Sheet open={mobileInspectorOpen && !!inspected} onOpenChange={(open) => { if (!open) closeInspector(); }}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl p-0 lg:hidden">
          {inspected && <LogInspectorContent log={inspected} onClose={closeInspector} />}
        </SheetContent>
      </Sheet>

      {/* ─── Clear Confirmation Dialog ─── */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" /> Clear All Logs
            </DialogTitle>
            <DialogDescription className="text-xs">
              This will permanently delete all {total} logs. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowClearDialog(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" className="text-xs gap-1" onClick={handleClearLogs} disabled={clearLogs.isPending}>
              {clearLogs.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Delete All Logs
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
};

export default AdminLogs;
