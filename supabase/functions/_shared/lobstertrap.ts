// ============================================================
// Lobster Trap DPI Proxy
// Intercepts all AI prompts for prompt injection detection
// Part of Guardian Agent security layer
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export interface LobsterTrapResult {
  safe: boolean;
  injection_detected: boolean;
  sanitized_prompt: string;
  threats: string[];
  severity: "none" | "low" | "medium" | "high" | "critical";
  blocked: boolean;
}

// Prompt injection patterns (ordered by severity)
const INJECTION_PATTERNS = {
  critical: [
    /ignore\s+(all\s+)?previous\s+instructions?/i,
    /forget\s+(everything|all|your\s+instructions?)/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /new\s+instructions?:/i,
    /system\s+prompt\s*:/i,
    /reveal\s+your\s+(instructions?|prompt|system)/i,
  ],
  high: [
    /jailbreak/i,
    /act\s+as\s+(if\s+)?you\s+(are|were)/i,
    /pretend\s+(you\s+are|to\s+be)/i,
    /roleplay\s+as/i,
    /simulate\s+(being|a)/i,
  ],
  medium: [
    /bypass\s+(security|safety|filter)/i,
    /override\s+(instructions?|rules?|guidelines?)/i,
    /disregard\s+(previous|all|your)/i,
    /admin\s+mode/i,
    /developer\s+mode/i,
  ],
  low: [
    /tell\s+me\s+your\s+prompt/i,
    /what\s+(are|is)\s+your\s+instructions?/i,
    /show\s+me\s+your\s+system/i,
  ],
};

// Additional suspicious patterns
const SUSPICIOUS_PATTERNS = [
  /\[SYSTEM\]/i,
  /\[ADMIN\]/i,
  /\[ROOT\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /\{system\}/i,
];

function detectInjection(prompt: string): {
  detected: boolean;
  threats: string[];
  severity: "none" | "low" | "medium" | "high" | "critical";
} {
  const threats: string[] = [];
  let maxSeverity: "none" | "low" | "medium" | "high" | "critical" = "none";

  // Check critical patterns first
  for (const pattern of INJECTION_PATTERNS.critical) {
    if (pattern.test(prompt)) {
      threats.push(`CRITICAL: ${pattern.source}`);
      maxSeverity = "critical";
    }
  }

  // Check high severity
  if (maxSeverity !== "critical") {
    for (const pattern of INJECTION_PATTERNS.high) {
      if (pattern.test(prompt)) {
        threats.push(`HIGH: ${pattern.source}`);
        if (maxSeverity !== "high") maxSeverity = "high";
      }
    }
  }

  // Check medium severity
  if (maxSeverity !== "critical" && maxSeverity !== "high") {
    for (const pattern of INJECTION_PATTERNS.medium) {
      if (pattern.test(prompt)) {
        threats.push(`MEDIUM: ${pattern.source}`);
        if (maxSeverity !== "medium") maxSeverity = "medium";
      }
    }
  }

  // Check low severity
  if (maxSeverity === "none") {
    for (const pattern of INJECTION_PATTERNS.low) {
      if (pattern.test(prompt)) {
        threats.push(`LOW: ${pattern.source}`);
        maxSeverity = "low";
      }
    }
  }

  // Check suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(prompt)) {
      threats.push(`SUSPICIOUS: ${pattern.source}`);
      if (maxSeverity === "none") maxSeverity = "low";
    }
  }

  return {
    detected: threats.length > 0,
    threats,
    severity: maxSeverity,
  };
}

function hashPrompt(prompt: string): string {
  // Create a simple hash for audit trail (don't store full prompts for privacy)
  const preview = prompt.slice(0, 100).replace(/\s+/g, " ");
  return `${preview}... [${prompt.length} chars]`;
}

/**
 * Lobster Trap DPI Proxy
 * Intercepts and analyzes prompts before they reach AI models
 * Blocks critical/high severity injections, logs all attempts
 */
export async function lobsterTrapProxy(
  prompt: string,
  context?: {
    run_id?: string;
    agent_key?: string;
    model?: string;
  }
): Promise<LobsterTrapResult> {
  const { detected, threats, severity } = detectInjection(prompt);
  
  // Block critical and high severity injections
  const blocked = severity === "critical" || severity === "high";
  
  // Log to audit table (non-blocking, best effort)
  try {
    await supabase.from("lobstertrap_audit").insert({
      run_id: context?.run_id || null,
      agent_key: context?.agent_key || "unknown",
      model: context?.model || "unknown",
      prompt_hash: hashPrompt(prompt),
      injection_detected: detected,
      threats: threats,
      severity: severity,
      blocked: blocked,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[LobsterTrap] Failed to log audit:", err);
    // Don't fail the request if logging fails
  }

  const result: LobsterTrapResult = {
    safe: !blocked,
    injection_detected: detected,
    sanitized_prompt: blocked ? "[BLOCKED BY LOBSTER TRAP]" : prompt,
    threats,
    severity,
    blocked,
  };

  if (blocked) {
    console.warn(`[LobsterTrap] 🚨 BLOCKED ${severity.toUpperCase()} injection attempt:`, threats[0]);
  } else if (detected) {
    console.warn(`[LobsterTrap] ⚠️ Detected ${severity.toUpperCase()} injection (allowed):`, threats[0]);
  }

  return result;
}

/**
 * Get recent Lobster Trap audit logs
 */
export async function getLobsterTrapLogs(limit = 50): Promise<any[]> {
  const { data, error } = await supabase
    .from("lobstertrap_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error("[LobsterTrap] Failed to fetch logs:", error);
    return [];
  }
  
  return data || [];
}

/**
 * Get Lobster Trap statistics
 */
export async function getLobsterTrapStats(): Promise<{
  total_checks: number;
  injections_detected: number;
  injections_blocked: number;
  by_severity: Record<string, number>;
  by_agent: Record<string, number>;
}> {
  try {
    const { data, error } = await supabase
      .from("lobstertrap_audit")
      .select("injection_detected, blocked, severity, agent_key");
    
    if (error || !data) {
      return {
        total_checks: 0,
        injections_detected: 0,
        injections_blocked: 0,
        by_severity: {},
        by_agent: {},
      };
    }

    const stats = {
      total_checks: data.length,
      injections_detected: data.filter(r => r.injection_detected).length,
      injections_blocked: data.filter(r => r.blocked).length,
      by_severity: {} as Record<string, number>,
      by_agent: {} as Record<string, number>,
    };

    data.forEach(row => {
      if (row.severity) {
        stats.by_severity[row.severity] = (stats.by_severity[row.severity] || 0) + 1;
      }
      if (row.agent_key) {
        stats.by_agent[row.agent_key] = (stats.by_agent[row.agent_key] || 0) + 1;
      }
    });

    return stats;
  } catch (err) {
    console.error("[LobsterTrap] Failed to get stats:", err);
    return {
      total_checks: 0,
      injections_detected: 0,
      injections_blocked: 0,
      by_severity: {},
      by_agent: {},
    };
  }
}
