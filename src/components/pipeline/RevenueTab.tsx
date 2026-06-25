import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, TrendingUp } from "lucide-react";

export function RevenueTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    
    // Try article_revenue first, fallback to pipeline_runs with analytics output
    const { data: revenueData } = await supabase.from("article_revenue").select("*").order("created_at", { ascending: false }).limit(50);
    
    if (revenueData && revenueData.length > 0) {
      setRows(revenueData);
      const totalRevenue = revenueData.reduce((sum, r) => sum + Number(r.projected_revenue_30d_pkr || 0), 0);
      setSummary({ total_revenue_pkr: totalRevenue, articles: revenueData.length });
    } else {
      // Fallback: calculate from pipeline_runs with analytics agent output
      const { data: runsData } = await supabase.from("pipeline_runs")
        .select("id, topic, created_at, status, agent_states")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(50);
      
      const revenueRows = await Promise.all((runsData || []).map(async (run) => {
        const { data: analyticsOutput } = await supabase.from("agent_outputs")
          .select("output")
          .eq("run_id", run.id)
          .eq("agent_key", "analytics")
          .maybeSingle();
        
        const metrics = (analyticsOutput?.output as any)?.metrics || {};
        const projectedViews = metrics.projected_views || 0;
        const projectedRevenuePKR = metrics.estimated_revenue_pkr || 0;
        const seoScore = metrics.seo_score || 0;
        
        // Calculate grade based on projected revenue
        let grade = "C";
        if (projectedRevenuePKR > 1000) grade = "A+";
        else if (projectedRevenuePKR > 500) grade = "A";
        else if (projectedRevenuePKR > 250) grade = "B";
        
        return {
          id: run.id,
          run_id: run.id,
          topic: run.topic,
          revenue_grade: grade,
          adsense_tier: seoScore > 75 ? "Premium" : seoScore > 50 ? "Standard" : "Basic",
          estimated_cpm_usd: 0.15, // PKR 150 per 1000 views = $0.54, but CPM is per 1000 impressions
          projected_revenue_30d_pkr: projectedRevenuePKR,
          projected_views: projectedViews,
          affiliate_potential: projectedViews > 5000 ? "high" : projectedViews > 2000 ? "medium" : "low",
          created_at: run.created_at,
        };
      }));
      
      setRows(revenueRows);
      const totalRevenue = revenueRows.reduce((sum, r) => sum + Number(r.projected_revenue_30d_pkr || 0), 0);
      setSummary({ total_revenue_pkr: totalRevenue, articles: revenueRows.length });
    }
    
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <TrendingUp className="w-4 h-4" />
        <span className="text-sm font-medium">Revenue Intelligence</span>
        <button onClick={load} className="p-1 hover:bg-muted rounded ml-auto"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-border rounded-lg p-3 bg-card">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Projected (30d)</div>
            <div className="text-2xl font-bold mt-1">Rs {summary.total_revenue_pkr.toFixed(0)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{summary.articles} articles</div>
          </div>
          <div className="border border-border rounded-lg p-3 bg-card">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Per Article</div>
            <div className="text-2xl font-bold mt-1">Rs {summary.articles > 0 ? (summary.total_revenue_pkr / summary.articles).toFixed(0) : 0}</div>
            <div className="text-[10px] text-muted-foreground mt-1">@ PKR 150/1000 views</div>
          </div>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Article</th>
                <th className="text-left px-3 py-2 font-medium">Grade</th>
                <th className="text-left px-3 py-2 font-medium">AdSense Tier</th>
                <th className="text-left px-3 py-2 font-medium">Views</th>
                <th className="text-left px-3 py-2 font-medium">30d Rev (PKR)</th>
                <th className="text-left px-3 py-2 font-medium">Affiliate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 max-w-[200px] truncate" title={r.topic}>{r.topic || r.run_id || "—"}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                    r.revenue_grade === "A+" || r.revenue_grade === "A" ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400" :
                    r.revenue_grade === "B" ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400" :
                    "bg-muted border-border"
                  }`}>{r.revenue_grade || "—"}</span></td>
                  <td className="px-3 py-2">{r.adsense_tier || "—"}</td>
                  <td className="px-3 py-2 font-mono">{(r.projected_views || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 font-medium font-mono">Rs {Number(r.projected_revenue_30d_pkr || 0).toFixed(0)}</td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">{r.affiliate_potential || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-8">No revenue data yet. Complete pipeline runs to see projections.</div>
      )}
    </div>
  );
}
