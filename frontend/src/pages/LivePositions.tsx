import { Fragment, useEffect, useState } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Layers, RefreshCw } from "lucide-react";

interface Position {
  broker: string;
  ticker: string;
  qty: number;
  avg_price: number;
  last_price: number;
  pnl_open: number;
  pnl_day: number;
  type: string;
  option_detail?: string;
}

interface PositionsResponse {
  positions: Position[];
  count: number;
}

const BROKER_BADGES: Record<string, string> = {
  ib: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  ibkr: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  tradier: "bg-orange-400/10 text-orange-400 border-orange-400/20",
  tradestation: "bg-cyan-400/10 text-cyan-400 border-cyan-400/20",
  alpaca: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  schwab: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  etrade: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  fidelity: "bg-green-400/10 text-green-400 border-green-400/20",
  default: "bg-gray-400/10 text-gray-400 border-gray-400/20",
};

function brokerBadgeClass(broker: string): string {
  const key = broker.toLowerCase();
  return BROKER_BADGES[key] || BROKER_BADGES.default;
}

function formatUSD(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPrice(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })}`;
}

function formatQty(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

interface BrokerGroup {
  broker: string;
  positions: Position[];
  subtotalPnlOpen: number;
  subtotalPnlDay: number;
}

function groupByBroker(positions: Position[]): BrokerGroup[] {
  const groups: Record<string, Position[]> = {};
  for (const p of positions) {
    if (!groups[p.broker]) {
      groups[p.broker] = [];
    }
    groups[p.broker].push(p);
  }
  const result: BrokerGroup[] = Object.entries(groups).map(
    ([broker, brokerPositions]) => ({
      broker,
      positions: brokerPositions,
      subtotalPnlOpen: brokerPositions.reduce(
        (sum, p) => sum + p.pnl_open,
        0
      ),
      subtotalPnlDay: brokerPositions.reduce(
        (sum, p) => sum + p.pnl_day,
        0
      ),
    })
  );
  return result.sort((a, b) => a.broker.localeCompare(b.broker));
}

export default function LivePositions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<PositionsResponse>("/api/live/positions");
      setPositions(data.positions || []);
    } catch {
      setError("Failed to load positions. Is the backend running?");
      setPositions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
  }, []);

  const groups = groupByBroker(positions);

  // Grand totals
  const grandPnlOpen = positions.reduce((sum, p) => sum + p.pnl_open, 0);
  const grandPnlDay = positions.reduce((sum, p) => sum + p.pnl_day, 0);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">Positions</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {loading
              ? "Loading..."
              : `${positions.length} open position${positions.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          onClick={fetchPositions}
          disabled={loading}
          className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
        >
          <RefreshCw
            className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500">
          <Spinner className="h-8 w-8 mb-3 text-gray-600" />
          <p className="text-sm">Loading positions...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <Layers className="h-8 w-8 mb-3 text-gray-600" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && positions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <Layers className="h-8 w-8 mb-3 text-gray-600" />
          <p className="text-sm">No open positions</p>
          <p className="text-xs mt-1">
            Place an order from the{" "}
            <a
              href="/live/order-ticket"
              className="text-emerald-400 hover:underline"
            >
              Order Ticket
            </a>{" "}
            to get started.
          </p>
        </div>
      )}

      {/* Positions table — grouped by broker */}
      {!loading && !error && positions.length > 0 && (
        <div className="border border-gray-800/60 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800/60 hover:bg-transparent">
                <TableHead className="text-[11px] text-gray-500 uppercase font-medium">
                  Broker
                </TableHead>
                <TableHead className="text-[11px] text-gray-500 uppercase font-medium">
                  Ticker
                </TableHead>
                <TableHead className="text-[11px] text-gray-500 uppercase font-medium text-right">
                  Qty
                </TableHead>
                <TableHead className="text-[11px] text-gray-500 uppercase font-medium text-right">
                  Avg Price
                </TableHead>
                <TableHead className="text-[11px] text-gray-500 uppercase font-medium text-right">
                  Last Price
                </TableHead>
                <TableHead className="text-[11px] text-gray-500 uppercase font-medium text-right">
                  P&L Open
                </TableHead>
                <TableHead className="text-[11px] text-gray-500 uppercase font-medium text-right">
                  P&L Day
                </TableHead>
                <TableHead className="text-[11px] text-gray-500 uppercase font-medium">
                  Type
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <Fragment key={group.broker}>
                  {/* Broker group header row */}
                  <TableRow className="border-gray-800/60 bg-white/[0.02]">
                    <TableCell
                      colSpan={8}
                      className="py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold border ${brokerBadgeClass(group.broker)}`}
                        >
                          {group.broker}
                        </Badge>
                        <span className="text-[11px] text-gray-600">
                          {group.positions.length} position
                          {group.positions.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Positions for this broker */}
                  {group.positions.map((p, idx) => (
                    <TableRow
                      key={`${p.broker}-${p.ticker}-${idx}`}
                      className="border-gray-800/60 hover:bg-white/[0.02]"
                    >
                      <TableCell className="text-gray-500 text-xs">
                        {/* Empty — broker shown in group header */}
                      </TableCell>
                      <TableCell className="font-medium text-gray-200 text-sm">
                        <span>{p.ticker}</span>
                        {p.option_detail && (
                          <span className="text-[10px] text-gray-500 ml-1.5">
                            {p.option_detail}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-right text-gray-300 text-sm">
                        {formatQty(p.qty)}
                      </TableCell>
                      <TableCell className="tabular-nums text-right text-gray-400 text-sm">
                        {formatPrice(p.avg_price)}
                      </TableCell>
                      <TableCell className="tabular-nums text-right text-gray-200 text-sm">
                        {formatPrice(p.last_price)}
                      </TableCell>
                      <TableCell
                        className={`tabular-nums text-right text-sm font-medium ${
                          p.pnl_open >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatUSD(p.pnl_open)}
                      </TableCell>
                      <TableCell
                        className={`tabular-nums text-right text-sm font-medium ${
                          p.pnl_day >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatUSD(p.pnl_day)}
                      </TableCell>
                      <TableCell>
                        <span className="text-[11px] text-gray-500 uppercase">
                          {p.type}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Broker subtotal row */}
                  <TableRow className="border-gray-800/60 bg-gray-900/40">
                    <TableCell
                      colSpan={5}
                      className="text-[11px] text-gray-500 font-medium text-right py-2"
                    >
                      {group.broker} Subtotal
                    </TableCell>
                    <TableCell
                      className={`tabular-nums text-right text-sm font-semibold py-2 ${
                        group.subtotalPnlOpen >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {formatUSD(group.subtotalPnlOpen)}
                    </TableCell>
                    <TableCell
                      className={`tabular-nums text-right text-sm font-semibold py-2 ${
                        group.subtotalPnlDay >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                      colSpan={2}
                    >
                      {formatUSD(group.subtotalPnlDay)}
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}

              {/* Grand total row */}
              {groups.length > 1 && (
                <TableRow className="border-gray-800/60 bg-gray-900/60">
                  <TableCell
                    colSpan={5}
                    className="text-[11px] text-gray-300 font-semibold text-right py-2.5"
                  >
                    Total
                  </TableCell>
                  <TableCell
                    className={`tabular-nums text-right text-sm font-bold py-2.5 ${
                      grandPnlOpen >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {formatUSD(grandPnlOpen)}
                  </TableCell>
                  <TableCell
                    className={`tabular-nums text-right text-sm font-bold py-2.5 ${
                      grandPnlDay >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                    colSpan={2}
                  >
                    {formatUSD(grandPnlDay)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
