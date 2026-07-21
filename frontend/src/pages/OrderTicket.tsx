import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Send, Crosshair, Eye, Loader2,
} from "lucide-react";
import api from "@/lib/api";

export default function OrderTicket() {
  const [broker, setBroker] = useState("robinhood");
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState("BUY");
  const [qty, setQty] = useState(1);
  const [orderType, setOrderType] = useState("MARKET");
  const [price, setPrice] = useState<number | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!ticker) return;
    setSubmitting(true);
    setResult(null);
    setError("");
    try {
      const data = await api.post("/api/live/order", {
        broker,
        ticker: ticker.toUpperCase(),
        side,
        qty,
        order_type: orderType,
        price: orderType === "LIMIT" ? price : null,
        time_in_force: "DAY",
      });
      setResult(data);
    } catch (e: any) {
      setError(e?.detail || e?.message || "Order submission failed");
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <Send className="h-5 w-5 text-emerald-400" />
          Order Ticket
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Submit orders to connected brokers</p>
      </div>

      <Card className="bg-[#0f1624] border-gray-800/60">
        <CardContent className="p-4 space-y-4">
          {/* Broker */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-gray-400">Broker</label>
            <Select value={broker} onValueChange={setBroker}>
              <SelectTrigger className="bg-[#0a0e17] border-gray-700 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="robinhood" className="text-xs">Robinhood</SelectItem>
                <SelectItem value="tastytrade" className="text-xs">Tastytrade</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ticker */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-gray-400">Symbol</label>
            <Input
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. SPY"
              className="bg-[#0a0e17] border-gray-700 text-xs h-8"
            />
          </div>

          {/* Side */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-gray-400">Side</label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={side === "BUY" ? "default" : "outline"}
                onClick={() => setSide("BUY")}
                className={`text-xs h-8 flex-1 ${side === "BUY" ? "bg-emerald-600" : ""}`}
              >
                Buy
              </Button>
              <Button
                size="sm"
                variant={side === "SELL" ? "default" : "outline"}
                onClick={() => setSide("SELL")}
                className={`text-xs h-8 flex-1 ${side === "SELL" ? "bg-red-600" : ""}`}
              >
                Sell
              </Button>
            </div>
          </div>

          {/* Qty + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-400">Quantity</label>
              <Input
                type="number"
                value={qty}
                onChange={e => setQty(parseInt(e.target.value) || 1)}
                min={1}
                className="bg-[#0a0e17] border-gray-700 text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-400">Order Type</label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="bg-[#0a0e17] border-gray-700 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKET" className="text-xs">Market</SelectItem>
                  <SelectItem value="LIMIT" className="text-xs">Limit</SelectItem>
                  <SelectItem value="STOP" className="text-xs">Stop</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Limit price */}
          {orderType === "LIMIT" && (
            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-400">Limit Price</label>
              <Input
                type="number"
                value={price || ""}
                onChange={e => setPrice(parseFloat(e.target.value) || undefined)}
                step={0.01}
                placeholder="0.00"
                className="bg-[#0a0e17] border-gray-700 text-xs h-8"
              />
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || !ticker}
            className="w-full h-9 text-xs"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1" />
            )}
            {submitting ? "Submitting..." : `Submit ${orderType} ${side} to ${broker}`}
          </Button>

          {/* Result */}
          {result && (
            <div className="bg-emerald-900/20 border border-emerald-800/40 rounded p-2 text-xs text-emerald-400">
              ✅ {result.message || "Order submitted successfully"}
            </div>
          )}
          {error && (
            <div className="bg-red-900/20 border border-red-800/40 rounded p-2 text-xs text-red-400">
              ❌ {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
