import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PortfolioEngineResults() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Portfolio Results</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground text-center py-8">
          Portfolio-level results coming soon.
        </p>
      </CardContent>
    </Card>
  );
}
