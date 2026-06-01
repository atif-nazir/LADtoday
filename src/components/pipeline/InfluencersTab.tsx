import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InfluencersTab() {
  const [influencers, setInfluencers] = useState<any[]>([]);
  const [outreach, setOutreach] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", handle: "", platform: "twitter", followers: "", topics: "" });

  const load = async () => {
    setLoading(true);
    
    // Load influencer registry and outreach
    const [{ data: inf }, { data: out }] = await Promise.all([
      supabase.from("influencer_registry").select("*").order("followers", { ascending: false }).limit(50),
      supabase.from("influencer_outreach").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    setInfluencers(inf || []);
    setOutreach(out || []);
    
    // Load suggestions from account-manager agent outputs
    const { data: accountManagerOutputs } = await supabase.from("agent_outputs")
      .select("output, run_id, created_at")
      .eq("agent_key", "account-manager")
      .order("created_at", { ascending: false })
      .limit(10);
    
    const topicSuggestions = (accountManagerOutputs || [])
      .filter(o => o.output?.competitive_intelligence?.next_topic_suggestions)
      .flatMap(o => o.output.competitive_intelligence.next_topic_suggestions.map((topic: string) => ({
        topic,
        opportunity_score: o.output.competitive_intelligence.opportunity_score,
        trending: o.output.topic_velocity?.trending,
        created_at: o.created_at,
      })));
    
    setSuggestions(topicSuggestions.slice(0, 10));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addInfluencer = async () => {
    if (!form.name || !form.handle) return;
    await supabase.from("influencer_registry").insert({
      name: form.name, handle: form.handle, platform: form.platform,
      followers: parseInt(form.followers) || 0,
      topics: form.topics ? form.topics.split(",").map((t: string) => t.trim()) : [],
    });
    setForm({ name: "", handle: "", platform: "twitter", followers: "", topics: "" });
    setShowAdd(false); load();
  };

  const toggleActive = async (id: string, active: boolean) => { await supabase.from("influencer_registry").update({ active }).eq("id", id); load(); };
  const deleteInf = async (id: string) => { await supabase.from("influencer_registry").delete().eq("id", id); load(); };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Topic Suggestions from Account Manager */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">Next Topic Suggestions (Account Manager)</span>
          </div>
          <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
            {suggestions.map((s, i) => (
              <div key={i} className="px-3 py-2 flex items-center gap-3 text-xs">
                <span className="flex-1">{s.topic}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                  s.opportunity_score >= 8 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                  s.opportunity_score >= 6 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                  "bg-muted"
                }`}>Score: {s.opportunity_score}/10</span>
                {s.trending && <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px]">Trending</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Influencer Registry */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Influencer Registry ({influencers.length})</span>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)} className="ml-4 text-xs h-7"><Plus className="w-3 h-3 mr-1" />Add</Button>
          <button onClick={load} className="p-1 hover:bg-muted rounded ml-auto"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
        </div>

        {showAdd && (
          <div className="border border-border rounded-lg p-3 bg-card grid grid-cols-2 md:grid-cols-3 gap-2">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="text-xs h-8" />
            <Input placeholder="@handle" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} className="text-xs h-8" />
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="twitter">Twitter/X</option><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option><option value="youtube">YouTube</option>
            </select>
            <Input placeholder="Followers" type="number" value={form.followers} onChange={(e) => setForm({ ...form, followers: e.target.value })} className="text-xs h-8" />
            <Input placeholder="Topics (comma sep)" value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} className="text-xs h-8" />
            <Button size="sm" onClick={addInfluencer} className="h-8 text-xs">Save</Button>
          </div>
        )}

        {influencers.length > 0 ? (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40"><tr>
                <th className="text-left px-3 py-2 font-medium">Name</th><th className="text-left px-3 py-2 font-medium">Handle</th>
                <th className="text-left px-3 py-2 font-medium">Platform</th><th className="text-left px-3 py-2 font-medium">Followers</th>
                <th className="text-left px-3 py-2 font-medium">Topics</th><th className="text-left px-3 py-2 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {influencers.map((inf) => (
                  <tr key={inf.id} className={`border-t border-border ${!inf.active ? "opacity-40" : ""}`}>
                    <td className="px-3 py-2 font-medium">{inf.name}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{inf.handle}</td>
                    <td className="px-3 py-2 capitalize">{inf.platform}</td>
                    <td className="px-3 py-2 font-mono">{(inf.followers || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 max-w-[150px] truncate text-muted-foreground">{inf.topics?.join(", ") || "—"}</td>
                    <td className="px-3 py-2 flex gap-1">
                      <button onClick={() => toggleActive(inf.id, !inf.active)} className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 border border-border">{inf.active ? "Disable" : "Enable"}</button>
                      <button onClick={() => deleteInf(inf.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 border border-border">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-sm text-muted-foreground text-center py-6">No influencers registered. Add above or let Account Manager discover them.</div>}
      </div>

      {/* Outreach Queue */}
      <div className="space-y-3">
        <div className="flex items-center gap-3"><span className="text-sm font-medium">Outreach Queue ({outreach.length})</span></div>
        {outreach.length > 0 ? (
          <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-64 overflow-y-auto">
            {outreach.map((o) => (
              <div key={o.id} className="px-3 py-2 text-xs flex items-center gap-3">
                <span className="font-medium">{o.influencer_name}</span>
                <span className="text-muted-foreground capitalize">{o.platform}</span>
                <span className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">{o.status}</span>
                <span className="ml-auto text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        ) : <div className="text-xs text-muted-foreground">No outreach messages yet.</div>}
      </div>
    </div>
  );
}
