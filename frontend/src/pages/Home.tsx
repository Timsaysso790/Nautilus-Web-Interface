import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FlaskConical, Zap, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0e17] flex flex-col">
      {/* Minimal top bar */}
      <header className="h-10 border-b border-gray-800/60 flex items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="text-xs text-gray-400">Nautilus Trader v2.0</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-600">30.9 GB archive · 175 tickers</span>
          <ThemeToggle />
        </div>
      </header>

      {/* Center fork */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full">
          {/* Title */}
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold text-gray-100 tracking-tight mb-2">
              Nautilus Terminal
            </h1>
            <p className="text-sm text-gray-500">
              Choose your workspace
            </p>
          </div>

          {/* Two-sided fork */}
          <div className="grid grid-cols-2 gap-5">
            {/* Research */}
            <a href="/research" className="group block">
              <div className="bg-[#0d1321] border border-gray-800/60 rounded-lg p-6 hover:border-amber-500/40 transition-all hover:bg-[#0f1628]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-amber-400/10 flex items-center justify-center">
                    <FlaskConical className="h-5 w-5 text-amber-400" />
                  </div>
                </div>
                <h2 className="text-base font-semibold text-gray-100 mb-1">Research</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Backtest strategies, analyze options chains, design portfolios, and manage your data archive.
                </p>
                <div className="space-y-1.5">
                  {["Options Lab", "Backtesting Engine", "Portfolio Designer", "Data Catalog"].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-[11px] text-gray-600">
                      <span className="h-1 w-1 rounded-full bg-amber-400/50" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </a>

            {/* Live Trading */}
            <a href="/live" className="group block">
              <div className="bg-[#0f1624] border border-gray-800/60 rounded-lg p-6 hover:border-emerald-500/40 transition-all hover:bg-[#111a2a]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-emerald-400/10 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-emerald-400" />
                  </div>
                </div>
                <h2 className="text-base font-semibold text-gray-100 mb-1">Live Trading</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Monitor positions, place orders, and manage broker connections across Robinhood and Tastytrade.
                </p>
                <div className="space-y-1.5">
                  {["Portfolio Dashboard", "Position Monitor", "Order Entry", "Kill Switch"].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-[11px] text-gray-600">
                      <span className="h-1 w-1 rounded-full bg-emerald-400/50" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </a>
          </div>

          {/* Admin link */}
          <div className="text-center mt-8">
            <a
              href="/admin"
              className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              <Settings className="h-3 w-3" />
              Settings & Administration
            </a>
          </div>
        </div>
      </div>

      {/* Footer strip */}
      <footer className="h-8 border-t border-gray-800/60 flex items-center justify-between px-5 text-[10px] text-gray-700">
        <span>Data sourced from ThetaData · yfinance</span>
        <span>Built on Nautilus Trader</span>
      </footer>
    </div>
  );
}
