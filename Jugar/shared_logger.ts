import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export async function insertLog(
  level: "info" | "warning" | "error" | "ai" | "system",
  source: string,
  message: string,
  details?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await supabase.from("admin_logs").insert({
      level,
      source,
      message,
      details: details || null,
      metadata: metadata || {},
    });
  } catch (e) {
    console.error("Failed to insert log:", e);
  }
}
