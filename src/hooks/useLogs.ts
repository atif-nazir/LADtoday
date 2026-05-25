import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export type LogLevel = "info" | "warning" | "error" | "ai" | "system";
export type LogSource = "articles" | "media" | "scraper" | "ai-worker" | "system" | "thumbnails" | "captions";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  details: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface UseLogsOptions {
  search?: string;
  level?: LogLevel | "all";
  source?: LogSource | "all";
  limit?: number;
  offset?: number;
}

export function useLogs({ search, level, source, limit = 100, offset = 0 }: UseLogsOptions = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin_logs", search, level, source, limit, offset],
    queryFn: async () => {
      let q = supabase
        .from("admin_logs")
        .select("*", { count: "exact" })
        .order("timestamp", { ascending: false })
        .range(offset, offset + limit - 1);

      if (level && level !== "all") q = q.eq("level", level);
      if (source && source !== "all") q = q.eq("source", source);
      if (search) q = q.or(`message.ilike.%${search}%,details.ilike.%${search}%,source.ilike.%${search}%`);

      const { data, error, count } = await q;
      if (error) throw error;
      return { logs: (data || []) as LogEntry[], total: count || 0 };
    },
    refetchInterval: 30000,
  });

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel("admin_logs_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_logs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin_logs"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}

export function useLogStats() {
  return useQuery({
    queryKey: ["admin_logs_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_logs")
        .select("level");
      if (error) throw error;
      const logs = data || [];
      return {
        total: logs.length,
        info: logs.filter(l => l.level === "info").length,
        warning: logs.filter(l => l.level === "warning").length,
        error: logs.filter(l => l.level === "error").length,
        ai: logs.filter(l => l.level === "ai").length,
        system: logs.filter(l => l.level === "system").length,
      };
    },
    refetchInterval: 30000,
  });
}

export function useClearLogs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("admin_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin_logs_stats"] });
    },
  });
}

export function useExportLogs() {
  return async (filters?: { level?: string; source?: string; search?: string }) => {
    let q = supabase.from("admin_logs").select("*").order("timestamp", { ascending: false }).limit(5000);
    if (filters?.level && filters.level !== "all") q = q.eq("level", filters.level);
    if (filters?.source && filters.source !== "all") q = q.eq("source", filters.source);
    if (filters?.search) q = q.or(`message.ilike.%${filters.search}%,details.ilike.%${filters.search}%`);

    const { data, error } = await q;
    if (error) throw error;

    const logs = data || [];
    const headers = ["timestamp", "level", "source", "message", "details", "metadata"];
    const csvContent = [
      headers.join(","),
      ...logs.map(log =>
        headers.map(h => {
          const val = h === "metadata" ? JSON.stringify((log as any)[h] || {}) : (log as any)[h] || "";
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
}
