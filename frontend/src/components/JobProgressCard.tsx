import { Button } from "@/components/ui/button";
import type { DownloadJob } from "@/services/dataLakeService";

interface Props {
  job: DownloadJob;
  onConvert?: () => void;
  onDelete?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500",
  downloading: "bg-blue-500",
  converting: "bg-purple-500",
  completed: "bg-green-500",
  converted: "bg-teal-500",
  failed: "bg-red-500",
};

export function JobProgressCard({ job, onConvert, onDelete }: Props) {
  const pct = Math.round((job.progress || 0) * 100);
  return (
    <div className="bg-card border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[job.status] || 'bg-gray-400'}`} />
          <span className="text-sm font-medium text-foreground">{job.id}</span>
          <span className="text-xs text-muted-foreground">{job.source_type}</span>
        </div>
        <span className="text-xs font-mono text-muted-foreground capitalize">{job.status}</span>
      </div>

      <div className="w-full bg-secondary rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${job.status === 'failed' ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{pct}%</span>
        <span>{job.created_at?.slice(0, 10) || ''}</span>
      </div>

      {job.error && (
        <p className="text-xs text-red-500 bg-red-500/10 rounded p-2">{job.error}</p>
      )}

      <div className="flex gap-2 pt-1">
        {job.status === "completed" && onConvert && (
          <Button size="sm" variant="outline" onClick={onConvert}>Convert to Catalog</Button>
        )}
        {onDelete && (
          <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
        )}
      </div>
    </div>
  );
}
