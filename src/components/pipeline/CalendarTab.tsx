import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

export function CalendarTab() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const today = new Date();
    const start = new Date(today); start.setDate(start.getDate() - 3);
    const end = new Date(today); end.setDate(end.getDate() + 30);
    const { data } = await supabase.from("content_calendar").select("*")
      .gte("date", start.toISOString().split("T")[0])
      .lte("date", end.toISOString().split("T")[0])
      .order("date");
    setEntries(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const days: { date: string; entry: any | null; isToday: boolean }[] = [];
  const today = new Date().toISOString().split("T")[0];
  for (let i = -3; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const ds = d.toISOString().split("T")[0];
    days.push({ date: ds, entry: entries.find((e) => e.date === ds) || null, isToday: ds === today });
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading calendar…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Content Calendar (30 days)</span>
        <div className="flex gap-2 ml-4 text-[10px] text-muted-foreground">
          <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground">Published</span>
          <span className="px-1.5 py-0.5 rounded bg-muted border border-border">Suggested</span>
          <span className="px-1.5 py-0.5 rounded border border-dashed border-border">Empty</span>
        </div>
        <button onClick={load} className="p-1 hover:bg-muted rounded ml-auto"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-[10px] text-center text-muted-foreground font-medium py-1">{d}</div>
        ))}
        {days.map((d) => (
          <div key={d.date} className={`border rounded-lg p-2 min-h-[72px] text-xs transition-colors
            ${d.isToday ? "ring-1 ring-foreground/20" : ""}
            ${d.entry?.status === "published" ? "bg-primary/5 border-foreground/20" : d.entry ? "bg-muted border-border" : "bg-card border-border border-dashed"}`}
          >
            <div className="text-[10px] text-muted-foreground mb-1">{new Date(d.date + "T00:00:00").getDate()}</div>
            {d.entry ? (
              <div className="font-medium truncate" title={d.entry.topic}>{d.entry.topic}</div>
            ) : (
              <div className="text-muted-foreground/30">—</div>
            )}
          </div>
        ))}
      </div>

      {entries.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-4">
          No calendar entries yet. Content Calendar (agent-41) generates suggestions daily.
        </div>
      )}
    </div>
  );
}
