import { ReactNode, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  Zap, LayoutDashboard, Crosshair, Activity,
  FileText, Radio, LogOut, AlertTriangle, Search
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/live", label: "Dashboard", icon: LayoutDashboard },
  { href: "/live/positions", label: "Positions", icon: Crosshair },
  { href: "/live/orders", label: "Orders", icon: FileText },
  { href: "/live/order-ticket", label: "Order Ticket", icon: Activity },
  { href: "/live/brokers", label: "Broker Connections", icon: Radio },
  { href: "/live/scanner", label: "Market Scanner", icon: Search },
];

export default function LiveLayout({ children }: { children: ReactNode }) {
  const currentPath = window.location.pathname;
  const [brokerStatus, setBrokerStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    // Poll broker status from backend
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/live/summary");
        if (res.ok) {
          const data = await res.json();
          setBrokerStatus(data.broker_status || {});
        }
      } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const totalValue = Object.values(brokerStatus).reduce((sum: number, b: any) => sum + (b.portfolio_value || 0), 0);

  return (
    <div className="flex h-screen bg-[#0a0e17] text-gray-200">
      {/* Sidebar */}
      <aside className="w-52 bg-[#0f1624] border-r border-gray-800/60 flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-gray-800/60">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-400" />
            <span className="font-semibold text-sm tracking-tight text-gray-100">Live Trading</span>
          </div>
        </div>

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
                    ? "bg-emerald-400/10 text-emerald-400"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Kill Switch */}
        <div className="px-3 py-3 border-t border-gray-800/60 space-y-2">
          <Button
            variant="destructive"
            size="sm"
            className="w-full text-xs gap-1.5 bg-red-900/30 hover:bg-red-800/50 border border-red-800/40 text-red-400"
            onClick={() => {
              if (window.confirm("⚠️ Cancel ALL open orders on all brokers?")) {
                fetch("/api/live/cancel-all", { method: "POST" });
              }
            }}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Kill Switch
          </Button>
          <a
            href="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Back to Hub
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with broker status */}
        <header className="h-9 bg-[#0f1624] border-b border-gray-800/60 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-4 text-[11px]">
            {Object.entries(brokerStatus).length === 0 ? (
              <span className="text-gray-500">No brokers connected</span>
            ) : (
              Object.entries(brokerStatus).map(([name, status]: [string, any]) => (
                <span key={name} className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${status.connected ? "bg-emerald-400" : "bg-red-400"}`} />
                  <span className="text-gray-300">{name}</span>
                  <span className="text-gray-500">
                    ${(status.portfolio_value || 0).toLocaleString()}
                  </span>
                  {status.buying_power && (
                    <span className="text-gray-600">
                      BP: ${status.buying_power.toLocaleString()}
                    </span>
                  )}
                </span>
              ))
            )}
            <span className="text-gray-700">|</span>
            <span className="text-gray-500">
              Total: <span className="text-gray-200 font-medium">${totalValue.toLocaleString()}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-gray-600">⏱ auto-refresh 10s</div>
            <ThemeToggle />
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
