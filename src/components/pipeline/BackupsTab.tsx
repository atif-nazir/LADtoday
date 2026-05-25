import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

export function BackupsTab() {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("backups").select("*").order("created_at", { ascending: false }).limit(30);
    setBackups(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Backup History</span>
        <button onClick={load} className="p-1 hover:bg-muted rounded ml-auto"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>
      {backups.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40"><tr>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Tables</th>
              <th className="text-left px-3 py-2 font-medium">Rows</th>
              <th className="text-left px-3 py-2 font-medium">Size</th>
              <th className="text-left px-3 py-2 font-medium">Pruned</th>
            </tr></thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-3 py-2">{b.backup_date || new Date(b.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">{b.status}</span></td>
                  <td className="px-3 py-2 font-mono">{b.tables_backed || 0}{b.tables_failed > 0 && <span className="text-muted-foreground ml-1">({b.tables_failed} failed)</span>}</td>
                  <td className="px-3 py-2 font-mono">{(b.total_rows || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono">{b.total_bytes ? `${(b.total_bytes / 1024).toFixed(1)} KB` : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{b.pruned_count || 0} old removed</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-8">No backups yet. Backup agent (agent-48) runs daily at 6am PKT.</div>
      )}
    </div>
  );
}
