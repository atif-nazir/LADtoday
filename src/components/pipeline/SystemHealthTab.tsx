import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

export function SystemHealthTab() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("system_health").select("*").eq("id", "latest").maybeSingle();
    setHealth(data);
    setLoading(false);
  };

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!health) return <div className="p-6 text-sm text-muted-foreground">No health data yet. Health Check (agent-46) runs every 10 min.</div>;

  const checks = health.checks || {};
  const services = Object.entries(checks).map(([name, data]: [string, any]) => ({
    name, status: data?.status || "unknown", latency: data?.latency_ms || 0, detail: data?.detail || "",
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">System: <span className="capitalize">{health.overall_status}</span></span>
        <span className="text-xs text-muted-foreground">Uptime: {health.uptime_pct || 100}%</span>
        <span className="text-xs text-muted-foreground ml-auto">{health.checked_at ? new Date(health.checked_at).toLocaleString() : "—"}</span>
        <button onClick={load} className="p-1 hover:bg-muted rounded"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {services.length > 0 ? services.map((s) => (
          <div key={s.name} className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${s.status === "ok" || s.status === "healthy" ? "bg-foreground" : "bg-muted-foreground"}`} />
              <span className="text-sm font-medium capitalize">{s.name.replace(/_/g, " ")}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="capitalize">{s.status}</span>
              {s.latency > 0 && <> · {s.latency}ms</>}
            </div>
          </div>
        )) : <div className="col-span-3 text-sm text-muted-foreground">No service checks recorded yet.</div>}
      </div>
      {(health.critical_down?.length > 0 || health.degraded?.length > 0) && (
        <div className="border border-border rounded-lg p-3 bg-muted">
          <div className="text-xs font-medium mb-1">Issues</div>
          {health.critical_down?.map((s: string) => <div key={s} className="text-xs">● {s} — Down</div>)}
          {health.degraded?.map((s: string) => <div key={s} className="text-xs text-muted-foreground">○ {s} — Degraded</div>)}
        </div>
      )}
    </div>
  );
}
