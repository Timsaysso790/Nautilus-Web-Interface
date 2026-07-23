import { useEffect, useRef } from "react";
import { createChart, ColorType, LineStyle, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import api from "@/lib/api";

interface ChartViewProps {
  ticker: string;
  trades?: { entry_date: string; exit_date: string; pnl: number; entry_price?: number; exit_price?: number }[];
  height?: number;
  indicators?: string;
  startDate?: string;
  endDate?: string;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorPoint {
  time: number;
  value: number;
}

interface ChartResponse {
  ticker: string;
  candles: CandleData[];
  indicators: Record<string, IndicatorPoint[] | { upper: IndicatorPoint[]; mid: IndicatorPoint[]; lower: IndicatorPoint[] }>;
}

export default function ChartView({
  ticker,
  trades = [],
  height = 500,
  indicators = "bb,sma20,rsi",
  startDate = "2024-01-01",
  endDate = "2026-07-20",
}: ChartViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0e17" },
        textColor: "#6b7280",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1a2744" },
        horzLines: { color: "#1a2744" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#f59e0b", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#f59e0b" },
        horzLine: { color: "#f59e0b", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#f59e0b" },
      },
      timeScale: {
        borderColor: "#1e2a45",
        timeVisible: false,
        secondsVisible: false,
      },
      rightPriceScale: { borderColor: "#1e2a45" },
      width: containerRef.current.clientWidth,
      height,
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      wickUpColor: "#22c55e",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const fetchData = async () => {
      try {
        const inds = indicators;
        const data = await api.get<ChartResponse>(
          `/api/chart/${ticker}?start=${startDate}&end=${endDate}&indicators=${inds}`
        );

        candleSeries.setData(data.candles as any);

        volumeSeries.setData(
          data.candles.map((c: CandleData) => ({
            time: c.time as any,
            value: c.volume,
            color: c.close >= c.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
          }))
        );

        // Bollinger Bands
        if (data.indicators?.bb) {
          const bb = data.indicators.bb as { upper: IndicatorPoint[]; mid: IndicatorPoint[]; lower: IndicatorPoint[] };
          const bbUpper = chart.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "BB Upper", priceScaleId: "right" });
          const bbLower = chart.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "BB Lower", priceScaleId: "right" });
          const bbMid = chart.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 1, title: "BB Mid", priceScaleId: "right" });
          bbUpper.setData(bb.upper as any);
          bbLower.setData(bb.lower as any);
          bbMid.setData(bb.mid as any);
        }

        // SMA 20
        if (data.indicators?.sma20) {
          const sma20 = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, title: "SMA 20", priceScaleId: "right" });
          sma20.setData(data.indicators.sma20 as any);
        }

        // RSI
        if (data.indicators?.rsi) {
          const rsi = chart.addSeries(LineSeries, { color: "#a855f7", lineWidth: 1, title: "RSI", priceScaleId: "rsi" });
          chart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.75, bottom: 0.7 }, visible: true });
          rsi.setData(data.indicators.rsi as any);
        }

        // Trade markers via v5 plugin API
        if (trades.length > 0) {
          const markers = trades.flatMap((t, i) => {
            const entryTime = Math.floor(new Date(t.entry_date).getTime() / 1000) as any;
            const exitTime = Math.floor(new Date(t.exit_date).getTime() / 1000) as any;
            const isWin = t.pnl >= 0;
            return [
              { time: entryTime, position: "belowBar" as const, color: "#22c55e", shape: "arrowUp" as const, text: `Entry #${i + 1}` },
              { time: exitTime, position: "aboveBar" as const, color: isWin ? "#22c55e" : "#ef4444", shape: "arrowDown" as const, text: `${isWin ? "+" : ""}${t.pnl.toFixed(0)}` },
            ];
          });
          createSeriesMarkers(candleSeries, markers);
        }

        chart.timeScale().fitContent();
      } catch (e) {
        console.error("Chart data fetch failed:", e);
      }
    };

    fetchData();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [ticker, trades.length, startDate, endDate, indicators]);

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden border border-gray-800/60" />
      <div className="flex gap-2 mt-2 flex-wrap">
        <span className="text-[10px] bg-[#3b82f6]/20 text-blue-400 px-2 py-0.5 rounded">BB</span>
        <span className="text-[10px] bg-[#f59e0b]/20 text-amber-400 px-2 py-0.5 rounded">SMA 20</span>
        <span className="text-[10px] bg-[#a855f7]/20 text-purple-400 px-2 py-0.5 rounded">RSI</span>
        {trades.length > 0 && (
          <span className="text-[10px] bg-[#22c55e]/20 text-emerald-400 px-2 py-0.5 rounded">
            {trades.length} trades plotted
          </span>
        )}
      </div>
    </div>
  );
}
