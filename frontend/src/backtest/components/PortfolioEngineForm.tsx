import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PortfolioEngineForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Portfolio Engine</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground text-center py-8">
          Portfolio-level backtesting coming soon.
        </p>
      </CardContent>
    </Card>
  );
}
