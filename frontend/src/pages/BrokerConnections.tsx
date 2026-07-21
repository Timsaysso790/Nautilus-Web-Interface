import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio, Loader2, Plug, PlugZap, RefreshCw } from "lucide-react";
import api from "@/lib/api";

export default function BrokerConnections() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const data = await api.get("/api/live/summary");
      setStatus(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchStatus(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Radio className="h-5 w-5 text-emerald-400" />
            Broker Connections
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage Robinhood and Tastytrade connections</p>
        </div>
        <Button size="sm" variant="ghost" onClick={fetchStatus} className="text-xs">
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Robinhood */}
          <Card className="bg-[#0f1624] border-gray-800/60">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-emerald-400/10 flex items-center justify-center">
                    <Plug className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-200">Robinhood</div>
                    <Badge className="text-[10px] bg-gray-800 text-gray-400">Simulated</Badge>
                  </div>
                </div>
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-gray-500">Portfolio</div>
                  <div className="text-gray-200 font-medium">$142,500</div>
                </div>
                <div>
                  <div className="text-gray-500">Buying Power</div>
                  <div className="text-gray-200 font-medium">$85,000</div>
                </div>
                <div>
                  <div className="text-gray-500">Positions</div>
                  <div className="text-gray-200 font-medium">7</div>
                </div>
                <div>
                  <div className="text-gray-500">Open Orders</div>
                  <div className="text-gray-200 font-medium">2</div>
                </div>
              </div>

              <Button size="sm" variant="outline" className="w-full text-xs h-7 border-gray-700" disabled>
                Connect (Coming Soon)
              </Button>
            </CardContent>
          </Card>

          {/* Tastytrade */}
          <Card className="bg-[#0f1624] border-gray-800/60">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-emerald-400/10 flex items-center justify-center">
                    <PlugZap className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-200">Tastytrade</div>
                    <Badge className="text-[10px] bg-gray-800 text-gray-400">Simulated</Badge>
                  </div>
                </div>
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-gray-500">Portfolio</div>
                  <div className="text-gray-200 font-medium">$89,000</div>
                </div>
                <div>
                  <div className="text-gray-500">Buying Power</div>
                  <div className="text-gray-200 font-medium">$62,000</div>
                </div>
                <div>
                  <div className="text-gray-500">Positions</div>
                  <div className="text-gray-200 font-medium">5</div>
                </div>
                <div>
                  <div className="text-gray-500">Open Orders</div>
                  <div className="text-gray-200 font-medium">1</div>
                </div>
              </div>

              <Button size="sm" variant="outline" className="w-full text-xs h-7 border-gray-700" disabled>
                Connect (Coming Soon)
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
