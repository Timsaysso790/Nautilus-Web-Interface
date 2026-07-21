import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  FlaskConical, LayoutDashboard, Database, LineChart,
  BarChart3, Search, Activity, Wrench, LogOut, FolderOpen, Brain, TrendingUp
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/research", label: "Dashboard", icon: LayoutDashboard },
  { href: "/research/options-lab", label: "Research Workspace", icon: Activity },
  { href: "/research/backtesting", label: "Backtesting", icon: BarChart3 },
  { href: "/research/portfolio-designer", label: "Portfolio Designer", icon: LineChart },
  { href: "/research/projects", label: "Projects", icon: FolderOpen },
  { href: "/research/data-catalog", label: "Data Catalog", icon: Database },
  { href: "/research/screener", label: "Strategy Screener", icon: Search },
  { href: "/research/chart", label: "Charts", icon: BarChart3 },
  { href: "/research/backtest-visualizer", label: "Backtest Visualizer", icon: TrendingUp },
  { href: "/research/ai-assistant", label: "AI Assistant", icon: Brain },
];

export default function ResearchLayout({ children }: { children: ReactNode }) {
  const currentPath = window.location.pathname;

  return (
    <div className="flex h-screen bg-[#0a0e17] text-gray-200">
      {/* Sidebar */}
      <aside className="w-56 bg-[#0d1321] border-r border-gray-800/60 flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-4 py-4 border-b border-gray-800/60">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-amber-400" />
            <span className="font-semibold text-sm tracking-tight text-gray-100">Research Terminal</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = currentPath === item.href || currentPath.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  active
                    ? "bg-amber-400/10 text-amber-400"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3 border-t border-gray-800/60 space-y-2">
          <a
            href="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Back to Hub
          </a>
          <div className="px-3">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-9 bg-[#0d1321] border-b border-gray-800/60 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span className="text-amber-400/70">●</span>
            <span>Data: 175 tickers · 30.9 GB</span>
            <span className="text-gray-700">|</span>
            <span>Archive: Nautilus_Archive5min</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-600">Last sync: today 18:30</span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </main>
    </div>
  );
}
