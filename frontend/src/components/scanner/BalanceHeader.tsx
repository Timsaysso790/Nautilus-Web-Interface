import type { BalanceData } from "./types";

function fmt(n: number): string {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BalanceHeader({ balance }: { balance: BalanceData }) {
  return (
    <div className="flex items-center gap-6 px-6 py-3 bg-[#0d1321] border border-gray-800 rounded-lg mb-1">
      <Metric label="Net Liq" value={fmt(balance.netLiq)} />
      <span className="text-gray-700">|</span>
      <Metric label="Cash" value={fmt(balance.cashBalance)} />
      <span className="text-gray-700">|</span>
      <Metric label="Buying Power" value={fmt(balance.buyingPower)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-base font-mono font-semibold text-blue-400">{value}</span>
    </div>
  );
}
