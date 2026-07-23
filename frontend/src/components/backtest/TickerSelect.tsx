import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";

interface TickerSelectProps {
  value: string;
  onChange: (ticker: string) => void;
  className?: string;
  placeholder?: string;
}

export function TickerSelect({ value, onChange, className = "", placeholder = "Select ticker..." }: TickerSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tickers, setTickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.get<{ tickers: string[] }>("/api/backtest/options/tickers");
        setTickers(data.tickers ?? []);
      } catch {
        setTickers(["SPY", "QQQ", "IWM", "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META"]);
      }
      setLoading(false);
    };
    load();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = tickers.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase())
  );

  const displayed = search ? filtered : tickers.slice(0, 50);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(!open);
          setSearch("");
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="w-full h-7 text-xs justify-between bg-[#0a0e17] border-gray-700 text-gray-200"
      >
        {value || placeholder}
        <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 text-gray-500" />
      </Button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#0d1321] border border-gray-700 rounded-lg shadow-xl">
          {/* Search input */}
          <div className="p-2 border-b border-gray-800">
            <div className="flex items-center gap-1.5 bg-[#0a0e17] rounded-md px-2 py-1">
              <Search className="h-3 w-3 text-gray-500 shrink-0" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tickers..."
                className="w-full bg-transparent text-xs text-gray-200 outline-none placeholder:text-gray-600"
              />
            </div>
          </div>

          {/* Ticker list */}
          <div className="max-h-60 overflow-y-auto p-1">
            {loading ? (
              <div className="text-xs text-gray-500 text-center py-4">Loading...</div>
            ) : displayed.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">No tickers found</div>
            ) : (
              displayed.map((ticker) => (
                <button
                  key={ticker}
                  type="button"
                  onClick={() => {
                    onChange(ticker);
                    setOpen(false);
                  }}
                  className={[
                    "w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors flex items-center justify-between",
                    ticker === value
                      ? "bg-amber-400/10 text-amber-400"
                      : "text-gray-300 hover:bg-gray-800",
                  ].join(" ")}
                >
                  {ticker}
                  {ticker === value && <Check className="h-3 w-3" />}
                </button>
              ))
            )}
          </div>

          {/* Count badge */}
          {!search && (
            <div className="px-3 py-1.5 border-t border-gray-800 text-[10px] text-gray-600">
              {tickers.length} tickers available
            </div>
          )}
          {search && filtered.length > 0 && (
            <div className="px-3 py-1.5 border-t border-gray-800 text-[10px] text-gray-600">
              {filtered.length} of {tickers.length} tickers
            </div>
          )}
        </div>
      )}
    </div>
  );
}
