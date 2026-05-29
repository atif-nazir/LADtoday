import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

export function CostsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [period, setPeriod] = useState("daily");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("cost_reports").select("*").eq("period_type", period).order("generated_at", { ascending: false }).limit(30);
    setReports(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [period]);

  const latest = reports[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Cost Dashboard</span>
        <div className="flex gap-1 ml-4">
          {["daily", "weekly", "monthly"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-xs rounded capitalize ${period === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >{p}</button>
          ))}
        </div>
        <button onClick={load} className="p-1 hover:bg-muted rounded ml-auto"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>

      {latest ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total USD", value: `$${Number(latest.total_cost_usd || 0).toFixed(4)}` },
              { label: "Total PKR", value: `Rs ${Number(latest.total_cost_pkr || 0).toFixed(0)}` },
              { label: "Tokens", value: (latest.total_tokens || 0).toLocaleString() },
              { label: "Runs", value: latest.total_runs || 0 },
            ].map((c) => (
              <div key={c.label} className="border border-border rounded-lg p-3 bg-card">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</div>
                <div className="text-xl font-bold mt-1">{c.value}</div>
              </div>
            ))}
          </div>

          <div className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">Budget Usage</span>
              <span className="text-xs text-muted-foreground">{latest.budget_status}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div className="h-2.5 rounded-full bg-foreground transition-all" style={{ width: `${Math.min(latest.budget_used_pct || 0, 100)}%` }} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">{latest.budget_used_pct || 0}% of monthly budget</div>
          </div>

          {latest.report && (
            <div className="border border-border rounded-lg p-4 bg-card">
              <div className="text-xs font-medium mb-2">Breakdown</div>
              <pre className="text-[11px] bg-muted rounded p-3 overflow-x-auto max-h-48">{JSON.stringify(latest.report, null, 2)}</pre>
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-muted-foreground">No cost reports yet. Cost Reporting (agent-47) runs daily at midnight.</div>
      )}

      {reports.length > 1 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 text-xs font-medium">History</div>
          <div className="divide-y divide-border max-h-48 overflow-y-auto">
            {reports.map((r) => (
              <div key={r.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                <span>{r.period}</span>
                <span className="font-mono">${Number(r.total_cost_usd || 0).toFixed(4)}</span>
                <span className="text-muted-foreground">{(r.total_tokens || 0).toLocaleString()} tokens</span>
                <span className="ml-auto text-muted-foreground">{new Date(r.generated_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
