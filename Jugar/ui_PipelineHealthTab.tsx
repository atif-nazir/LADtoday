import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

export function PipelineHealthTab() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("pipeline_health").select("*").eq("id", "latest").maybeSingle();
    setHealth(data);
    setLoading(false);
  };

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading health data…</div>;
  if (!health) return <div className="p-6 text-sm text-muted-foreground">No health data yet. Pipeline Monitor (agent-44) runs every 5 min via cron.</div>;

  const cards = [
    { label: "Active Runs", value: health.active_runs || 0 },
    { label: "Healthy", value: health.healthy_runs || 0 },
    { label: "Stuck", value: health.stuck_runs || 0 },
    { label: "Failed", value: health.failed_runs || 0 },
    { label: "Awaiting Approval", value: health.pending_approval || 0 },
    { label: "Auto Actions", value: health.auto_actions || 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${health.overall_status === "green" ? "bg-foreground" : health.overall_status === "yellow" ? "bg-muted-foreground" : "bg-destructive"}`} />
        <span className="text-sm font-medium capitalize">Pipeline: {health.overall_status}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {health.checked_at ? new Date(health.checked_at).toLocaleString() : "—"}
        </span>
        <button onClick={load} className="p-1 hover:bg-muted rounded"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="border border-border rounded-lg p-3 bg-card">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</div>
            <div className="text-2xl font-bold mt-1">{c.value}</div>
          </div>
        ))}
      </div>
      {health.report && (
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="text-xs font-medium mb-2">Report</div>
          <pre className="text-[11px] bg-muted rounded p-3 overflow-x-auto max-h-64">{JSON.stringify(health.report, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
