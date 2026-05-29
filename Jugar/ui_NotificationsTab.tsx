import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotificationsTab() {
  const [notifs, setNotifs] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
    if (filter === "unread") q = q.eq("read", false);
    if (filter !== "all" && filter !== "unread") q = q.eq("type", filter);
    const { data } = await q;
    setNotifs(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const markRead = async (id: string) => { await supabase.from("notifications").update({ read: true }).eq("id", id); load(); };
  const markAllRead = async () => { await supabase.from("notifications").update({ read: true }).eq("read", false); load(); };

  const unreadCount = notifs.filter((n) => !n.read).length;
  const filters = ["all", "unread", "pipeline_alert", "budget_alert", "system_health_alert", "backup_failed"];

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Notifications</span>
        {unreadCount > 0 && <span className="bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded-full font-bold">{unreadCount}</span>}
        {unreadCount > 0 && <Button size="sm" variant="outline" onClick={markAllRead} className="text-xs h-7"><Check className="w-3 h-3 mr-1" />Mark all read</Button>}
        <button onClick={load} className="p-1 hover:bg-muted rounded ml-auto"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>

      <div className="flex gap-1 flex-wrap">
        {filters.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2 py-1 text-[10px] rounded capitalize ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >{f.replace(/_/g, " ")}</button>
        ))}
      </div>

      {notifs.length > 0 ? (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {notifs.map((n) => (
            <div key={n.id} className={`border rounded-lg p-3 text-xs transition-all ${!n.read ? "bg-card border-foreground/20" : "bg-card/50 border-border opacity-60"}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">{n.type?.replace(/_/g, " ") || "info"}</span>
                    <span className="font-medium">{n.title}</span>
                  </div>
                  <div className="text-muted-foreground">{n.body}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                {!n.read && <button onClick={() => markRead(n.id)} className="p-1 hover:bg-muted rounded shrink-0"><Check className="w-3 h-3" /></button>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-8">No notifications. Agents send alerts here when they detect issues.</div>
      )}
    </div>
  );
}
