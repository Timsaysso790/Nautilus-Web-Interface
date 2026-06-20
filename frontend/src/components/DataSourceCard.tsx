import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DataSource } from "@/services/dataLakeService";

interface Props {
  source: DataSource;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const ICONS: Record<string, string> = {
  thetadata: "Θ",
  yahoo_finance: "Y!",
  fred: "FRED",
};

export function DataSourceCard({ source, onTest, onEdit, onDelete }: Props) {
  const icon = ICONS[source.source_type] || "?";
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
            {icon}
          </div>
          <div>
            <CardTitle className="text-base">{source.label}</CardTitle>
            <p className="text-xs text-muted-foreground">{source.source_type}</p>
          </div>
        </div>
        <div className={`w-3 h-3 rounded-full ${source.has_api_key ? 'bg-green-500' : 'bg-gray-400'}`} title={source.has_api_key ? 'Configured' : 'Not set'} />
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onTest}>Test</Button>
        <Button variant="outline" size="sm" onClick={onEdit}>Edit</Button>
        <Button variant="destructive" size="sm" onClick={onDelete}>Remove</Button>
      </CardContent>
    </Card>
  );
}
