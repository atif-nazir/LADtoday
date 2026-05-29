import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

export function PipelineHealthTab() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      // Try to call health-check function for real-time data
      const { data, error } = await supabase.functions.invoke("health-check");
      
      if (!error && data?.pipeline) {
        setHealth(data.pipeline);
      } else {
        // Fallback: read from table
        const { data: tableData } = await supabase
          .from("pipeline_health")
          .select("*")
          .eq("id", "latest")
          .maybeSingle();
        setHealth(tableData);
      }
    } catch (err) {
      console.error("Failed to load health:", err);
      // Fallback: read from table
      const { data: tableData } = await supabase
        .from("pipeline_health")
        .select("*")
        .eq("id", "latest")
        .maybeSingle();
      setHealth(tableData);
    }
    setLoading(false);
  };

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading health data…</div>;
  if (!health) return (
    <div className="p-6 text-sm text-muted-foreground">
      No health data yet. Health metrics are calculated from pipeline runs in the last 24 hours.
      <button onClick={load} className="ml-3 text-primary underline">Refresh</button>
    </div>
  );

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
          <div className="text-sm mb-2">{health.report.message}</div>
          {health.report.success_rate !== undefined && (
            <div className="text-xs text-muted-foreground">
              Success Rate: {health.report.success_rate}% | 
              Avg Duration: {Math.round((health.report.avg_duration_ms || 0) / 1000)}s
            </div>
          )}
          {health.report.agents_status && Object.keys(health.report.agents_status).length > 0 && (
            <details className="mt-3">
              <summary className="text-xs font-medium cursor-pointer">Agent Status</summary>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {Object.entries(health.report.agents_status).map(([agent, stats]: [string, any]) => (
                  <div key={agent} className="border border-border rounded p-2">
                    <div className="font-medium">{agent}</div>
                    <div className="text-muted-foreground">
                      ✓ {stats.completed} | ✗ {stats.failed} | ⟳ {stats.running}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
