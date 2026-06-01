import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, DollarSign, TrendingUp, TrendingDown } from "lucide-react";

export function CostsTab() {
  const [stats, setStats] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [period, setPeriod] = useState("7d");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    
    // Calculate date range
    const now = new Date();
    const daysAgo = period === "24h" ? 1 : period === "7d" ? 7 : 30;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    
    // Get runs from period
    const { data: runsData } = await supabase
      .from("pipeline_runs")
      .select("*")
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: false });
    
    setRuns(runsData || []);
    
    // Calculate stats
    const totalCost = (runsData || []).reduce((sum, r) => sum + (r.estimated_cost_usd || 0), 0);
    const totalTokens = (runsData || []).reduce((sum, r) => sum + (r.total_tokens || 0), 0);
    const totalRuns = (runsData || []).length;
    const avgCostPerRun = totalRuns > 0 ? totalCost / totalRuns : 0;
    const pkrRate = 278; // PKR per USD
    
    setStats({
      total_cost_usd: totalCost,
      total_cost_pkr: totalCost * pkrRate,
      total_tokens: totalTokens,
      total_runs: totalRuns,
      avg_cost_per_run: avgCostPerRun,
      period_label: period === "24h" ? "Last 24 Hours" : period === "7d" ? "Last 7 Days" : "Last 30 Days",
    });
    
    setLoading(false);
  };

  useEffect(() => { load(); }, [period]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <DollarSign className="w-4 h-4" />
        <span className="text-sm font-medium">Cost Dashboard</span>
        <div className="flex gap-1 ml-4">
          {[
            { key: "24h", label: "24h" },
            { key: "7d", label: "7d" },
            { key: "30d", label: "30d" },
          ].map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 text-xs rounded ${period === p.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >{p.label}</button>
          ))}
        </div>
        <button onClick={load} className="p-1 hover:bg-muted rounded ml-auto"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border border-border rounded-lg p-3 bg-card">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total USD</div>
              <div className="text-xl font-bold mt-1">${stats.total_cost_usd.toFixed(4)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{stats.period_label}</div>
            </div>
            <div className="border border-border rounded-lg p-3 bg-card">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total PKR</div>
              <div className="text-xl font-bold mt-1">Rs {stats.total_cost_pkr.toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">@ Rs 278/USD</div>
            </div>
            <div className="border border-border rounded-lg p-3 bg-card">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Tokens</div>
              <div className="text-xl font-bold mt-1">{stats.total_tokens.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{stats.total_runs} runs</div>
            </div>
            <div className="border border-border rounded-lg p-3 bg-card">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg/Run</div>
              <div className="text-xl font-bold mt-1">${stats.avg_cost_per_run.toFixed(4)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">per pipeline</div>
            </div>
          </div>

          {runs.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 text-xs font-medium">Recent Runs</div>
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {runs.slice(0, 20).map((r) => (
                  <div key={r.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                    <span className="truncate flex-1 max-w-[200px]">{r.topic}</span>
                    <span className="font-mono">${Number(r.estimated_cost_usd || 0).toFixed(4)}</span>
                    <span className="text-muted-foreground">{(r.total_tokens || 0).toLocaleString()} tok</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      r.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      r.status === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-muted"
                    }`}>{r.status}</span>
                    <span className="ml-auto text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-muted-foreground">No cost data yet. Run some pipelines to see costs.</div>
      )}
    </div>
  );
}
