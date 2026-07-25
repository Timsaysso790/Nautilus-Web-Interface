import { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  FlaskConical, LayoutDashboard, Database, LineChart,
  BarChart3, Search, Activity, Brain, TrendingUp,
  Zap, Crosshair, FileText, Radio, LogOut, PieChart,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "Research",
    items: [
      { href: "/research", label: "Dashboard", icon: LayoutDashboard },
      { href: "/research/options-lab", label: "Workspace", icon: Activity },
      { href: "/research/data-catalog", label: "Data Catalog", icon: Database },
      { href: "/research/screener", label: "Strategy Screener", icon: Search },
      { href: "/research/chart", label: "Charts", icon: LineChart },
      { href: "/research/ai-assistant", label: "AI Assistant", icon: Brain },
    ],
  },
  {
    label: "Live Trading",
    items: [
      { href: "/live", label: "Dashboard", icon: TrendingUp },
      { href: "/live/positions", label: "Positions", icon: Crosshair },
      { href: "/live/orders", label: "Orders", icon: FileText },
      { href: "/live/order-ticket", label: "Order Ticket", icon: BarChart3 },
      { href: "/live/brokers", label: "Brokers", icon: Radio },
      { href: "/live/scanner", label: "Market Scanner", icon: Search },
    ],
  },
];

const WORKSPACE_PATHS = [
  "/research/options-lab", "/research/backtesting",
  "/research/portfolio-designer", "/research/projects",
  "/research/backtest-visualizer",
];

export default function MainLayout({ children }: { children: ReactNode }) {
  const currentPath = window.location.pathname;

  const isActive = (href: string) => {
    // Workspace nav item matches multiple redirect paths
    if (href === "/research/options-lab") {
      return WORKSPACE_PATHS.some(p => currentPath === p || currentPath.startsWith(p + "/"));
    }
    return currentPath === href || currentPath.startsWith(href + "/");
  };

  return (
    <div className="flex h-screen bg-[#0a0e17] text-gray-200">
      {/* ── Unified Sidebar ── */}
      <aside className="w-52 bg-[#0d1321] border-r border-gray-800/60 flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-4 py-4 border-b border-gray-800/60 flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-amber-400" />
          <span className="font-semibold text-sm tracking-tight text-gray-100">Nautilus</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-gray-600 font-medium">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
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
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3 border-t border-gray-800/60 flex items-center justify-between">
          <a
            href="/"
            className="flex items-center gap-2 px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Hub
          </a>
          <ThemeToggle />
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-9 bg-[#0d1321] border-b border-gray-800/60 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span className="text-amber-400/70">●</span>
            <span>Research · Live Trading</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-600">Nautilus Trader</span>
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
