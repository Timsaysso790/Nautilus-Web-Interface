import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  FileText, Loader2, XCircle,
} from "lucide-react";
import api from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  filled: "bg-emerald-900/30 text-emerald-400",
  pending: "bg-amber-900/30 text-amber-400",
  cancelled: "bg-red-900/30 text-red-400",
  rejected: "bg-red-900/30 text-red-400",
  working: "bg-blue-900/30 text-blue-400",
};

export default function LiveOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const data = await api.get("/api/live/orders");
      setOrders(data.orders || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  const handleCancel = async (orderId: string) => {
    try {
      await api.post("/api/live/cancel-all");
      fetchOrders();
    } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-400" />
            Orders
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Open orders and order history</p>
        </div>
        <Button size="sm" variant="ghost" onClick={fetchOrders} className="text-xs">
          Refresh
        </Button>
      </div>

      <Card className="bg-[#0f1624] border-gray-800/60">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center p-8 text-xs text-gray-500">No orders found</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800/60">
                  <TableHead className="text-[10px] text-gray-500">Broker</TableHead>
                  <TableHead className="text-[10px] text-gray-500">Ticker</TableHead>
                  <TableHead className="text-[10px] text-gray-500">Side</TableHead>
                  <TableHead className="text-[10px] text-gray-500">Qty</TableHead>
                  <TableHead className="text-[10px] text-gray-500">Type</TableHead>
                  <TableHead className="text-[10px] text-gray-500">Price</TableHead>
                  <TableHead className="text-[10px] text-gray-500">Status</TableHead>
                  <TableHead className="text-[10px] text-gray-500">Time</TableHead>
                  <TableHead className="text-[10px] text-gray-500"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id} className="border-gray-800/40 hover:bg-white/5">
                    <TableCell className="text-[11px]">
                      <Badge className="text-[10px] bg-gray-800 text-gray-400">{o.broker}</Badge>
                    </TableCell>
                    <TableCell className="text-[11px] font-medium text-gray-200">{o.ticker}</TableCell>
                    <TableCell className={`text-[11px] ${o.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                      {o.side}
                    </TableCell>
                    <TableCell className="text-[11px] text-gray-300">{o.qty}</TableCell>
                    <TableCell className="text-[11px] text-gray-300">{o.type}</TableCell>
                    <TableCell className="text-[11px] text-gray-300">
                      {o.price ? `$${o.price}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${STATUS_COLORS[o.status] || "bg-gray-800 text-gray-400"}`}>
                        {o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-gray-500">
                      {o.created_at ? o.created_at.split("T")[1]?.substring(0, 5) : ""}
                    </TableCell>
                    <TableCell>
                      {o.status === "pending" && (
                        <Button size="sm" variant="ghost" onClick={() => handleCancel(o.id)} className="h-6 w-6 p-0">
                          <XCircle className="h-3 w-3 text-red-400" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
