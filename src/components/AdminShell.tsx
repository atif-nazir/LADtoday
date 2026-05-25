import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard, FileText, FolderOpen, Settings, LogOut, Power, Columns3,
  Menu, Moon, Sun, ScrollText, Facebook, Database, Workflow
} from "lucide-react";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useAutoThumbnailGenerator } from "@/hooks/useAutoThumbnailGenerator";

const SidebarItem = ({ icon: Icon, label, active, onClick, href, color }: {
  icon: any; label: string; active?: boolean; onClick?: () => void; href?: string; color?: string;
}) => {
  const inner = (
    <button
      onClick={onClick}
      className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 group
        ${active
          ? "bg-[#FA76FF]/10 text-[#FA76FF]"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#FA76FF]" />}
      <Icon className={`w-[18px] h-[18px] ${color || ""}`} />
    </button>
  );
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {href && !onClick ? <Link to={href}>{inner}</Link> : inner}
        </TooltipTrigger>
        <TooltipContent side="right" className="font-medium text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface AdminShellProps {
  children: React.ReactNode;
  activePage: "dashboard" | "categories" | "media" | "settings" | "logs" | "facebook" | "scraper" | "pipeline";
}

const AdminShell = ({ children, activePage }: AdminShellProps) => {
  const navigate = useNavigate();
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [autoRewriteEnabled, setAutoRewriteEnabled] = useState(true);
  const [autoRewriteLoading, setAutoRewriteLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const { isAdmin } = useIsAdmin();
  useAutoThumbnailGenerator(isAdmin);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "auto_rewrite_enabled").single()
      .then(({ data }) => { if (data) setAutoRewriteEnabled(data.value === true); });
  }, []);

  const toggleAutoRewrite = async () => {
    setAutoRewriteLoading(true);
    const newVal = !autoRewriteEnabled;
    await supabase.from("settings").update({ value: newVal, updated_at: new Date().toISOString() }).eq("key", "auto_rewrite_enabled");
    setAutoRewriteEnabled(newVal);
    setAutoRewriteLoading(false);
  };

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const navItems = [
    { icon: LayoutDashboard, label: "Articles", href: "/admin", page: "dashboard" as const },
    { icon: FolderOpen, label: "Categories", href: "/admin/categories", page: "categories" as const },
    { icon: Columns3, label: "Media", href: "/admin/media", page: "media" as const },
    { icon: Workflow, label: "Pipeline (50 agents)", href: "/admin/pipeline", page: "pipeline" as const },
    { icon: ScrollText, label: "Logs", href: "/admin/logs", page: "logs" as const },
    { icon: Facebook, label: "Facebook Pages", href: "/admin/facebook", page: "facebook" as const },
    { icon: Database, label: "Scraper Sources", href: "/admin/scraper", page: "scraper" as const },
    { icon: Settings, label: "Settings", href: "/admin/settings", page: "settings" as const },
  ];

  const sidebarContent = (
    <>
      <Link to="/" className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center font-black text-[15px] mb-3 shrink-0 shadow-sm" style={{ letterSpacing: "-1px" }}>
        <span className="text-foreground">L</span><span className="text-[#FA76FF]">T</span>
      </Link>
      {navItems.map(n => (
        <SidebarItem key={n.page} icon={n.icon} label={n.label} href={n.href} active={activePage === n.page as any} />
      ))}
      <div className="flex-1" />
      {/* Auto-rewrite */}
      <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
        <button onClick={toggleAutoRewrite} disabled={autoRewriteLoading}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${autoRewriteEnabled ? "text-green-500 bg-green-500/10" : "text-muted-foreground hover:bg-muted"}`}>
          <Power className="w-[18px] h-[18px]" />
        </button>
      </TooltipTrigger><TooltipContent side="right" className="text-xs">Auto-rewrite: {autoRewriteEnabled ? "ON" : "OFF"}</TooltipContent></Tooltip></TooltipProvider>
      {/* Dark/Light toggle */}
      <SidebarItem icon={isDark ? Sun : Moon} label={isDark ? "Light Mode" : "Dark Mode"} onClick={toggleDark} />
      <SidebarItem icon={LogOut} label="Sign Out" onClick={handleSignOut} color="text-muted-foreground" />
    </>
  );

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Mobile sidebar overlay */}
      {mobileSidebar && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileSidebar(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <aside className="absolute left-0 top-0 bottom-0 w-14 bg-card border-r border-border flex flex-col items-center py-3 gap-1 z-10" onClick={e => e.stopPropagation()}>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-14 border-r border-border flex-col items-center py-3 gap-1 shrink-0 bg-card/50">
        {sidebarContent}
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile menu button injected via CSS — pages handle their own top bar but can call openMobile */}
        {children}
      </main>

      {/* Expose mobile toggle for child pages */}
      <button
        id="admin-mobile-menu-btn"
        onClick={() => setMobileSidebar(true)}
        className="hidden"
        aria-hidden
      />
    </div>
  );
};

export { AdminShell };
export const openMobileSidebar = () => {
  document.getElementById("admin-mobile-menu-btn")?.click();
};
