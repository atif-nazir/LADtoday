import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

export function RevenueTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("article_revenue").select("*").order("created_at", { ascending: false }).limit(50);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Revenue Intelligence</span>
        <button onClick={load} className="p-1 hover:bg-muted rounded ml-auto"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>

      {rows.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Article</th>
                <th className="text-left px-3 py-2 font-medium">Grade</th>
                <th className="text-left px-3 py-2 font-medium">AdSense Tier</th>
                <th className="text-left px-3 py-2 font-medium">Est CPM</th>
                <th className="text-left px-3 py-2 font-medium">30d Rev (PKR)</th>
                <th className="text-left px-3 py-2 font-medium">Affiliate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-[10px] max-w-[200px] truncate">{r.run_id || r.article_id || "—"}</td>
                  <td className="px-3 py-2"><span className="px-2 py-0.5 rounded bg-muted border border-border text-[10px] font-bold">{r.revenue_grade || "—"}</span></td>
                  <td className="px-3 py-2">{r.adsense_tier || "—"}</td>
                  <td className="px-3 py-2 font-mono">${Number(r.estimated_cpm_usd || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 font-medium font-mono">Rs {Number(r.projected_revenue_30d_pkr || 0).toFixed(0)}</td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">{r.affiliate_potential || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-8">No revenue data yet. Revenue Intel (agent-42) runs after articles are published.</div>
      )}
    </div>
  );
}
