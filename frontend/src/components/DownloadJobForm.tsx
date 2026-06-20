import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThetaTierSelector, type ThetaTier } from "@/components/ui/theta-tier-selector";
import { dataLakeService } from "@/services/dataLakeService";

interface Props {
  onCreated: () => void;
  onError: (msg: string) => void;
}

export function DownloadJobForm({ onCreated, onError }: Props) {
  const [sourceType, setSourceType] = useState("thetadata");
  const [symbols, setSymbols] = useState("");
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [resolution, setResolution] = useState("day");
  const [thetaTier, setThetaTier] = useState<ThetaTier>("free");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!symbols.trim()) {
      onError("Enter at least one symbol");
      return;
    }
    setLoading(true);
    try {
      const symbolList = symbols.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
      const config: any = {
        symbols: symbolList,
        start_date: startDate,
        end_date: endDate,
        resolution,
      };
      if (sourceType === "thetadata") {
        config.tier = thetaTier;
      }
      await dataLakeService.createJob({
        source_id: undefined,
        source_type: sourceType,
        config,
      });
      onCreated();
      setSymbols("");
    } catch (e: any) {
      onError(e?.detail || "Failed to create download job");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 bg-card border rounded-lg p-4">
      <h3 className="font-semibold text-foreground">New Download</h3>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Source</label>
          <Select value={sourceType} onValueChange={setSourceType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="thetadata">ThetaData</SelectItem>
              <SelectItem value="yahoo_finance">Yahoo Finance</SelectItem>
              <SelectItem value="fred">FRED</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Symbols (comma-separated)</label>
          <Input value={symbols} onChange={e => setSymbols(e.target.value)} placeholder="SPY, QQQ, IWM" />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Start Date</label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">End Date</label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Resolution</label>
          <Select value={resolution} onValueChange={setResolution}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="5_minute">5-min</SelectItem>
              <SelectItem value="1_minute">1-min</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {sourceType === "thetadata" && (
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">ThetaData Tier</label>
            <ThetaTierSelector value={thetaTier} onChange={setThetaTier} />
          </div>
        )}
      </div>

      <Button onClick={handleSubmit} disabled={loading}>
        {loading ? "Starting..." : "Start Download"}
      </Button>
    </div>
  );
}
