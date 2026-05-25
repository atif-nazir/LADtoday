import { Skeleton } from "@/components/ui/skeleton";

// ─── Toolbar Skeleton ──────────────────────────────────────────────
export const ToolbarSkeleton = () => (
  <div className="h-12 border-b border-border flex items-center gap-2 px-3 shrink-0 bg-card/30">
    <Skeleton className="w-4 h-4 rounded" />
    <Skeleton className="w-20 h-4 rounded" />
    <Skeleton className="w-8 h-4 rounded" />
    <div className="flex-1" />
    <Skeleton className="w-24 h-7 rounded-lg" />
    <Skeleton className="w-16 h-7 rounded-lg" />
  </div>
);

// ─── Metrics Strip Skeleton ────────────────────────────────────────
export const MetricsStripSkeleton = () => (
  <div className="border-b border-border flex items-center px-3 py-2 gap-4 shrink-0 bg-muted/20">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex items-center gap-1.5 shrink-0">
        <Skeleton className="w-5 h-4 rounded" />
        <Skeleton className="w-12 h-3 rounded" />
      </div>
    ))}
  </div>
);

// ─── Table Skeleton ────────────────────────────────────────────────
export const TableSkeleton = ({ rows = 15, cols = 5 }: { rows?: number; cols?: number }) => (
  <div className="flex-1 overflow-hidden">
    {/* Header row */}
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={`h-3 rounded ${i === 0 ? "w-6" : i === cols - 1 ? "w-12" : "flex-1"}`} />
      ))}
    </div>
    {/* Data rows */}
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex items-center gap-3 px-3 py-2.5 border-b border-border/40">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className={`h-3.5 rounded ${c === 0 ? "w-6" : c === cols - 1 ? "w-12" : "flex-1"}`}
            style={{ opacity: 1 - r * 0.04 }} />
        ))}
      </div>
    ))}
  </div>
);

// ─── Grid Skeleton (Media) ─────────────────────────────────────────
export const GridSkeleton = ({ count = 24 }: { count?: number }) => (
  <div className="flex-1 overflow-hidden p-2">
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square rounded-lg" style={{ opacity: 1 - i * 0.02 }} />
      ))}
    </div>
  </div>
);

// ─── Settings Skeleton ─────────────────────────────────────────────
export const SettingsSkeleton = ({ sections = 4 }: { sections?: number }) => (
  <div className="flex-1 overflow-hidden">
    <div className="max-w-2xl mx-auto p-3 space-y-2">
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="border border-border rounded-lg p-3 bg-card">
          <div className="flex items-center gap-2">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="w-32 h-4 rounded flex-1" />
            <Skeleton className="w-10 h-5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Inspector Panel Skeleton ──────────────────────────────────────
export const InspectorSkeleton = () => (
  <div className="p-3 space-y-3">
    <Skeleton className="w-full aspect-video rounded-lg" />
    <Skeleton className="w-full aspect-video rounded-lg" />
    <div className="space-y-2">
      <Skeleton className="w-full h-3 rounded" />
      <Skeleton className="w-3/4 h-3 rounded" />
      <Skeleton className="w-1/2 h-3 rounded" />
    </div>
    <Skeleton className="w-full h-8 rounded-lg" />
  </div>
);

// ─── Full page skeleton wrapper ────────────────────────────────────
export const AdminPageSkeleton = ({ type }: { type: "table" | "grid" | "settings" | "logs" }) => (
  <>
    <ToolbarSkeleton />
    {(type === "table" || type === "logs") && (
      <>
        <MetricsStripSkeleton />
        <TableSkeleton rows={18} cols={type === "logs" ? 5 : 6} />
      </>
    )}
    {type === "grid" && <GridSkeleton />}
    {type === "settings" && (
      <>
        <MetricsStripSkeleton />
        <SettingsSkeleton />
      </>
    )}
  </>
);
